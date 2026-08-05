import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { isAdminEmail } from './admin-service.js';
import { memoryStore, persistMemoryStore } from '../data/memory-store.js';
import { env } from '../config/env.js';
import {
  CostEstimate,
  Creation,
  CreationArtifact,
  CreationInput,
  PipelineStage,
  StageId,
  User,
} from '../domain/types.js';
import { HttpError } from '../lib/http-errors.js';
import { nowIso } from '../lib/time.js';
import { estimateCreationCost } from './cost-estimator.js';
import { getStageRoute } from './provider-router.js';
import { assertBudgetAllowsReserve, recordUsage } from './usage-service.js';
import {
  artifactUrl,
  upsertArtifact,
  writeJsonArtifact,
  writeTextArtifact,
} from './artifact-service.js';
import { buildPromptPackageWithUsage } from './prompt-service.js';
import { generateCoverArt, type UploadedImageInput } from './image-service.js';
import { generateAudio } from './audio-service.js';
import { renderVideoFromCoverAndAudio } from './video-service.js';

type PendingUserImage = UploadedImageInput;

const pendingUserImages = new Map<string, PendingUserImage>();

function baseStages(estimate: CostEstimate): PipelineStage[] {
  return estimate.stages.map((stage) => ({
    id: stage.id,
    label: capitalize(stage.id),
    status: 'pending',
    progress: 0,
    detail: 'Queued',
    updatedAt: nowIso(),
    usage: {
      provider: stage.provider,
      model: stage.model,
      estimatedCostUsd: stage.estimatedCostUsd,
    },
  }));
}

export function estimateOnly(input: CreationInput) {
  return estimateCreationCost(input);
}

export function createCreation(user: User, input: CreationInput, userImage?: PendingUserImage) {
  if (user.plan === 'free' && input.duration > 60) {
    throw new HttpError(422, 'duration_exceeds_plan_limit');
  }

  const isAdmin = isAdminEmail(user.email);

  // Admin gates: only admins may override env defaults. Non-admin requests
  // accepting these fields via the validator are silently scrubbed here.
  const resolvedProvider: 'suno' | 'minimax' =
    isAdmin && input.audioProvider
      ? input.audioProvider
      : (env.audioProvider as 'suno' | 'minimax');

  const adminImageModel = isAdmin ? input.imageModel : undefined;
  const adminImageEditModel = isAdmin ? input.imageEditModel : undefined;
  const adminImageQuality = isAdmin ? input.imageQuality : undefined;

  const sanitizedInput: CreationInput = {
    ...input,
    audioProvider: resolvedProvider,
    // Strip admin-only overrides for non-admin users so they're not stored.
    imageModel: adminImageModel,
    imageEditModel: adminImageEditModel,
    imageQuality: adminImageQuality,
    // burnLyrics is user-facing, leave as-is.
    burnLyrics: input.burnLyrics === true,
  };

  const estimate = estimateCreationCost(sanitizedInput);
  assertBudgetAllowsReserve(user.id, estimate.totalUsd);

  const creation: Creation = {
    id: nanoid(),
    userId: user.id,
    status: 'pending',
    input: sanitizedInput,
    estimatedCostUsd: estimate.totalUsd,
    reservedCostUsd: estimate.totalUsd,
    actualCostUsd: 0,
    pipelineStages: baseStages(estimate),
    artifacts: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  memoryStore.creations.set(creation.id, creation);
  persistMemoryStore();

  if (userImage?.path) {
    pendingUserImages.set(creation.id, userImage);
  }

  recordUsage({
    userId: user.id,
    creationId: creation.id,
    category: 'reserve',
    provider: 'internal',
    model: 'budget-guard',
    costUsd: estimate.totalUsd,
  });

  void runPipeline(creation.id);
  return creation;
}

export function listCreations(userId: string) {
  return [...memoryStore.creations.values()]
    .filter((creation) => creation.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCreation(userId: string, creationId: string) {
  const creation = memoryStore.creations.get(creationId);
  if (!creation || creation.userId !== userId) {
    throw new HttpError(404, 'not_found');
  }
  return creation;
}

export function cancelCreation(userId: string, creationId: string) {
  const creation = getCreation(userId, creationId);
  if (creation.status === 'completed') {
    throw new HttpError(409, 'already_completed');
  }

  creation.status = 'cancelled';
  creation.updatedAt = nowIso();
  creation.pipelineStages = creation.pipelineStages.map((stage) =>
    stage.status === 'done'
      ? stage
      : { ...stage, status: 'cancelled', detail: 'Cancelled by user', updatedAt: nowIso() },
  );
  persistMemoryStore();

  const refundUsd = Math.max(0, creation.reservedCostUsd - creation.actualCostUsd);
  if (refundUsd > 0) {
    recordUsage({
      userId,
      creationId,
      category: 'refund',
      provider: 'internal',
      model: 'budget-guard',
      costUsd: -refundUsd,
    });
  }

  cleanupUserImage(creationId);
  return creation;
}

async function runPipeline(creationId: string) {
  const creation = memoryStore.creations.get(creationId);
  if (!creation) return;

  creation.status = 'processing';
  creation.updatedAt = nowIso();
  persistMemoryStore();

  const userImage = pendingUserImages.get(creationId);

  try {
    await startStage(creation, 'prompt', 'Designing song package');
    const promptResult = await buildPromptPackageWithUsage(creation.input);
    const promptPackage = promptResult.promptPackage;

    creation.songTitle = promptPackage.title;
    creation.artistPersona = promptPackage.artistPersona;
    creation.detectedIntent = promptPackage.detectedIntent;
    creation.detectedSubject = promptPackage.subject;
    creation.styleNotes = promptPackage.styleNotes;
    creation.sunoPrompt = promptPackage.sunoPrompt;
    creation.imagePrompt = promptPackage.imagePrompt;
    creation.imageEditPrompt = promptPackage.imageEditPrompt;
    creation.lyricsText = promptPackage.lyrics;
    creation.lyricsRomanized = promptPackage.lyricsRomanized;

    writeJsonArtifact(creation.id, 'prompt-package.json', promptPackage);
    creation.artifacts = withArtifact(creation.artifacts, {
      key: 'promptPackage',
      label: 'Prompt package JSON',
      url: artifactUrl(creation.id, 'prompt-package.json'),
      mimeType: 'application/json',
    });
    await finishStage(creation, 'prompt', promptResult.usage?.provider, promptResult.usage?.model, promptResult.usage);

    await startStage(creation, 'lyrics', 'Saving lyrics');
    writeTextArtifact(creation.id, 'lyrics.txt', creation.lyricsText || '');
    creation.artifacts = withArtifact(creation.artifacts, {
      key: 'lyrics',
      label: 'Lyrics text',
      url: artifactUrl(creation.id, 'lyrics.txt'),
      mimeType: 'text/plain',
    });
    await finishStage(creation, 'lyrics');

    await startStage(creation, 'music', 'Generating audio');

    const audioOutputPath = path.join(env.storageDir, creation.id, 'song.mp3');
    const coverOutputPath = path.join(env.storageDir, creation.id, 'cover.png');

    // Cost-control guardrail:
    // Generate audio FIRST. Only spend OpenAI image cost after audio succeeds.
    // This prevents wasting image tokens/cost when Suno or MiniMax fails.
    const audioResult = await generateAudio(
      {
        provider: creation.input.audioProvider,
        title: creation.songTitle || 'SynthWave Song',
        prompt: creation.sunoPrompt || '',
        lyrics: creation.lyricsText || '',
        duration: creation.input.duration,
        tags: [
          creation.detectedIntent === 'devotional'
            ? `devotional bhajan, ${creation.input.language}, female vocals, flute, tabla, harmonium, Indian classical, uplifting`
            : `${creation.input.genre}, ${creation.input.language}, ${creation.input.mood}, ${creation.input.tempo}`,
          durationStyleHints(creation.input.duration),
        ]
          .filter(Boolean)
          .join(', ')
          .slice(0, 200),
      },
      audioOutputPath,
    );

    creation.audioUrl = artifactUrl(creation.id, 'song.mp3');
    creation.artifacts = withArtifact(creation.artifacts, {
      key: 'audio',
      label: audioResult.provider === 'suno' ? 'Generated audio (Suno)' : 'Generated audio',
      url: creation.audioUrl,
      mimeType: 'audio/mpeg',
    });
    await finishStage(creation, 'music', audioResult.provider, audioResult.model);

    await startStage(
      creation,
      'image',
      userImage ? 'Preparing uploaded photo foreground' : 'Generating cover art',
    );

    const imageResult = await generateCoverArt({
      imagePrompt: creation.imagePrompt || '',
      imageEditPrompt: creation.imageEditPrompt,
      outputPath: coverOutputPath,
      userImage,
      // For uploaded personal/family photos, do NOT AI-edit the whole image.
      // Use foreground extraction + generated background + compositing so the
      // people/faces remain original pixels as much as possible.
      imageMode: userImage ? 'background-composite' : 'generate',
      overrides: {
        model: creation.input.imageModel,
        editModel: creation.input.imageEditModel,
        quality: creation.input.imageQuality,
      },
      onProgress: async (detail, progress) => {
        updateStageProgress(creation, 'image', detail, progress);
      },
      onBackgroundReady: async (background) => {
        creation.backgroundPreviewUrl = artifactUrl(creation.id, 'background.png');
        creation.artifacts = withArtifact(creation.artifacts, {
          key: 'backgroundPreview',
          label: 'Generated background preview',
          url: creation.backgroundPreviewUrl,
          mimeType: 'image/png',
        });
        updateStageProgress(
          creation,
          'image',
          'Background scene ready — blending original people into it',
          70,
        );
      },
    });

    cleanupUserImage(creationId);

    creation.coverArtUrl = artifactUrl(creation.id, 'cover.png');
    creation.artifacts = withArtifact(creation.artifacts, {
      key: 'coverArt',
      label:
        imageResult.source === 'user-upload-composite'
          ? 'Cover art (uploaded people, AI background composite)'
          : imageResult.source === 'user-upload-edit'
            ? 'Cover art (uploaded image, AI enhanced)'
            : imageResult.source === 'use-original'
              ? 'Cover art (uploaded image, original)'
              : imageResult.provider === 'openai'
                ? 'Cover art (OpenAI)'
                : 'Cover art (fallback)',
      url: creation.coverArtUrl,
      mimeType: 'image/png',
    });
    await finishStage(creation, 'image', imageResult.provider, imageResult.model);

    const imageStage = creation.pipelineStages.find((stage) => stage.id === 'image');
    if (imageStage) {
      if (imageResult.source === 'user-upload-composite') {
        imageStage.detail = 'Completed by preserving uploaded people and compositing a generated background';
      } else if (imageResult.source === 'user-upload-edit') {
        imageStage.detail = 'Completed from uploaded image using OpenAI edit';
      } else if (imageResult.source === 'use-original') {
        imageStage.detail = 'Completed using original uploaded image';
      } else if (imageResult.provider !== 'openai') {
        imageStage.detail = 'Completed with fallback cover image';
      }
      imageStage.updatedAt = nowIso();
      persistMemoryStore();
    }

    await startStage(creation, 'video', 'Rendering MP4');
    const videoOutputPath = path.join(env.storageDir, creation.id, 'video.mp4');
    const srtOutputPath = path.join(env.storageDir, creation.id, 'lyrics.srt');

    const videoResult = await renderVideoFromCoverAndAudio(
      path.join(env.storageDir, creation.id, 'cover.png'),
      path.join(env.storageDir, creation.id, 'song.mp3'),
      videoOutputPath,
      {
        // For Suno, we trim audio to user-requested duration, so passing it
        // here keeps the video cap aligned. For MiniMax, we let -shortest
        // ride and let video-service ffprobe the actual audio length.
        duration: audioResult.provider === 'minimax' ? undefined : creation.input.duration,
        burnLyrics: creation.input.burnLyrics === true,
        lyricsText: creation.lyricsText,
        lyricsRomanized: creation.lyricsRomanized,
        srtOutputPath,
      },
    );

    creation.videoUrl = artifactUrl(creation.id, 'video.mp4');
    creation.artifacts = withArtifact(creation.artifacts, {
      key: 'video',
      label: 'Rendered MP4',
      url: creation.videoUrl,
      mimeType: 'video/mp4',
    });

    // Register the SRT as an artifact when lyrics overlay was actually applied.
    // Free feature for users — they can use the SRT in karaoke apps or video
    // editors. Costs nothing in render time since we wrote it during render.
    if (videoResult.burnedLyrics && videoResult.srtPath) {
      creation.artifacts = withArtifact(creation.artifacts, {
        key: 'lyricsSrt',
        label: 'Timed lyrics (SRT)',
        url: artifactUrl(creation.id, 'lyrics.srt'),
        mimeType: 'application/x-subrip',
      });
    }

    await finishStage(creation, 'video', videoResult.provider, videoResult.model);

    creation.status = 'completed';
    creation.completedAt = nowIso();
    creation.updatedAt = nowIso();
    persistMemoryStore();
  } catch (error: any) {
    cleanupUserImage(creationId);
    if (!isCreationCancelled(creation)) {
      const failureMessage = error?.message || 'pipeline_failed';
      creation.status = 'failed';
      creation.errorMessage = failureMessage;
      creation.updatedAt = nowIso();
      markRunningStageFailed(creation, failureMessage);
      persistMemoryStore();
    }
  }
}


function updateStageProgress(creation: Creation, stageId: StageId, detail: string, progress?: number) {
  if (isCreationCancelled(creation)) return;
  const stage = getStage(creation, stageId);
  stage.status = 'running';
  if (typeof progress === 'number') {
    stage.progress = Math.max(stage.progress || 0, Math.min(99, Math.max(0, progress)));
  }
  stage.detail = detail;
  stage.updatedAt = nowIso();
  creation.updatedAt = nowIso();
  persistMemoryStore();
}

function cleanupUserImage(creationId: string) {
  const upload = pendingUserImages.get(creationId);
  if (!upload?.path) return;

  pendingUserImages.delete(creationId);
  fs.unlink(upload.path, () => {});
}

function isCreationCancelled(creation: Creation) {
  return creation.status === 'cancelled';
}

async function startStage(creation: Creation, stageId: StageId, detail: string) {
  if (isCreationCancelled(creation)) {
    throw new Error('cancelled');
  }

  const stage = getStage(creation, stageId);
  stage.status = 'running';
  stage.progress = 15;
  stage.detail = detail;
  stage.updatedAt = nowIso();
  creation.updatedAt = nowIso();
  persistMemoryStore();
}

async function finishStage(
  creation: Creation,
  stageId: StageId,
  provider?: string,
  model?: string,
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
) {
  if (isCreationCancelled(creation)) {
    throw new Error('cancelled');
  }

  const stage = getStage(creation, stageId);
  stage.status = 'done';
  stage.progress = 100;
  stage.detail = 'Completed';
  stage.updatedAt = nowIso();

  const route = getStageRoute(creation.input.mode, stageId);
  const effectiveProvider = provider || route.provider;
  const effectiveModel = model || route.model;
  const estimated = stage.usage?.estimatedCostUsd || 0;
  const actual = roundUsd(estimated);

  stage.usage = {
    ...(stage.usage || {}),
    provider: effectiveProvider,
    model: effectiveModel,
    actualCostUsd: actual,
    inputTokens: tokenUsage?.inputTokens,
    outputTokens: tokenUsage?.outputTokens,
    totalTokens: tokenUsage?.totalTokens,
  };

  creation.actualCostUsd = roundUsd(creation.actualCostUsd + actual);
  creation.updatedAt = nowIso();
  persistMemoryStore();

  const category =
    stageId === 'music'
      ? 'audio'
      : stageId === 'image'
        ? 'image'
        : stageId === 'video'
          ? 'video'
          : 'text';

  recordUsage({
    userId: creation.userId,
    creationId: creation.id,
    category,
    provider: effectiveProvider,
    model: effectiveModel,
    stageId,
    costUsd: actual,
    inputTokens: tokenUsage?.inputTokens,
    outputTokens: tokenUsage?.outputTokens,
    totalTokens: tokenUsage?.totalTokens,
  });
}

function getStage(creation: Creation, stageId: StageId) {
  const stage = creation.pipelineStages.find((item) => item.id === stageId);
  if (!stage) {
    throw new Error(`Stage not found: ${stageId}`);
  }
  return stage;
}

function markRunningStageFailed(creation: Creation, message: string) {
  const running = creation.pipelineStages.find((item) => item.status === 'running');
  if (running) {
    running.status = 'failed';
    running.detail = message;
    running.updatedAt = nowIso();
  }
}

function withArtifact(
  artifacts: CreationArtifact[] | undefined,
  artifact: CreationArtifact,
) {
  return upsertArtifact(artifacts, artifact);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function roundUsd(value: number) {
  return Math.round(value * 10000) / 10000;
}

function durationStyleHints(duration: number): string {
  if (duration <= 30) {
    return 'jingle, station ID, promo clip, branding jingle, no intro, vocal-focused';
  }
  if (duration <= 60) {
    return 'short jingle, 60 second promo, compact arrangement, vocals enter within 2 seconds, brief instrumental sections';
  }
  if (duration <= 120) {
    return 'tight arrangement, vocal-prominent, no extended intro';
  }
  return 'standard arrangement';
}
