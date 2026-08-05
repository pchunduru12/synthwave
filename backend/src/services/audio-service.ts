import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { execFileAsync } from './process-service.js';
import { generateWithMinimax } from './minimax-audio-service.js';

export interface AudioGenerationInput {
  title: string;
  prompt: string;
  lyrics: string;
  duration: number;
  tags?: string;
  provider?: 'suno' | 'minimax';
}

type SunoGenerateItem = {
  id?: string;
  clip_id?: string;
  title?: string;
  status?: string;
  audio_url?: string;
};

type SunoStatusItem = {
  id?: string;
  title?: string;
  status?: string;
  audio_url?: string;
  error_message?: string;
};

export async function generateAudio(input: AudioGenerationInput, outputPath: string) {
  const absOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });

  const resolvedProvider = input.provider ?? env.audioProvider ?? 'suno';

  if (resolvedProvider === 'minimax' && env.minimaxApiKey) {
    const { rawMp3Path, reportedDuration } = await generateWithMinimax({
      prompt: input.prompt,
      lyrics: input.lyrics,
      isInstrumental: false,
    });
    // No trim — MiniMax returns a complete song, let it play to natural end.
    // Video renderer will use -shortest and match the audio length exactly.
    fs.copyFileSync(rawMp3Path, absOutputPath);
    fs.unlinkSync(rawMp3Path);
    console.log(`MiniMax audio saved to ${absOutputPath} (${reportedDuration}s natural duration, no trim)`);

    return {
      provider: 'minimax',
      model: 'music-2.6',
      outputPath: absOutputPath,
    };
  }

  if (resolvedProvider === 'minimax' && !env.minimaxApiKey) {
    console.warn('MiniMax provider requested but MINIMAX_API_KEY is missing; falling back to Suno/local audio.');
  }

  if (env.sunoEnabled && env.sunoApiBaseUrl) {
    const audioUrl = await requestSunoAudioViaCustomGenerate(input);

    if (!audioUrl) {
      throw new Error('Suno adapter returned no audio URL');
    }

    // Download Suno's raw audio (typically 2-4 min) to a temporary file...
    const rawPath = absOutputPath.replace(/\.mp3$/i, '-raw.mp3');
    console.log('Downloading Suno audio...', audioUrl);
    await downloadToFile(audioUrl, rawPath);
    console.log('Suno audio saved to', rawPath);

    // ...then trim it to the user's requested duration with an audio fade-out.
    // Suno cannot be told an exact length, so this is the deterministic
    // safety net that guarantees a 30s request produces a 30s MP3.
    await trimAudioToDuration(rawPath, absOutputPath, input.duration);
    console.log('Trimmed audio saved to', absOutputPath, `(${input.duration}s target)`);

    // Best-effort cleanup of the raw file. If unlink fails (locked/missing),
    // log and move on — the trimmed mp3 is the artifact we actually serve.
    try {
      fs.unlinkSync(rawPath);
    } catch (cleanupError: any) {
      console.warn('Could not delete raw audio file:', cleanupError?.message || cleanupError);
    }

    return {
      provider: 'suno',
      model: 'gcui-art/suno-api',
      outputPath: absOutputPath,
    };
  }

  console.warn('Suno disabled, falling back to local FFmpeg tone');
  await createFallbackAudio(input.duration, absOutputPath);

  return {
    provider: 'local',
    model: 'ffmpeg-sine-generator',
    outputPath: absOutputPath,
  };
}

/**
 * Trim an MP3 to the requested duration with a 1.5s audio fade-out so it
 * doesn't cut harshly at the end. Re-encodes with libmp3lame at 128k.
 *
 * On a 1 vCPU droplet this typically takes 2-5 seconds for a 3 min input.
 */
async function trimAudioToDuration(inputPath: string, outputPath: string, duration: number) {
  const targetDuration = Math.max(5, Math.min(duration, 600));
  const fadeStart = Math.max(0, targetDuration - 1.5);

  const startedAt = Date.now();
  await execFileAsync(env.ffmpegPath, [
    '-y',
    '-i', inputPath,
    '-t', String(targetDuration),
    '-af', `afade=t=out:st=${fadeStart}:d=1.5`,
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    outputPath,
  ]);
  console.log(`Audio trim complete in ${Date.now() - startedAt}ms`);
}

async function requestSunoAudioViaCustomGenerate(input: AudioGenerationInput): Promise<string | null> {
  const baseUrl = env.sunoApiBaseUrl.replace(/\/$/, '');

  // /api/custom_generate accepts:
  //   prompt → the actual lyrics Suno will sing (NOT a freeform description)
  //   tags   → style descriptors (genre, mood, instrumentation, vocal hints)
  //   title  → song title
  //
  // Custom mode means the lyrics we send are the lyrics Suno sings, which gives
  // tighter control over song length and language fidelity.
  const submitPayload = {
    prompt: input.lyrics?.trim() || input.prompt?.trim() || '',
    tags: input.tags?.trim() || '',
    title: (input.title || 'SynthWave Song').slice(0, 80),
    make_instrumental: false,
    wait_audio: false,
  };

  let lastError = 'Unknown Suno error';

  for (let submitAttempt = 1; submitAttempt <= 4; submitAttempt += 1) {
    try {
      console.log('Submitting custom_generate to Suno adapter...', {
        submitAttempt,
        title: submitPayload.title,
        duration: input.duration,
        tagsPreview: submitPayload.tags.slice(0, 200),
        lyricsPreview: submitPayload.prompt.slice(0, 200),
      });

      const submitResponse = await fetch(`${baseUrl}/api/custom_generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.sunoApiKey ? { Authorization: `Bearer ${env.sunoApiKey}` } : {}),
        },
        body: JSON.stringify(submitPayload),
      });

      const submitText = await submitResponse.text();
      console.log('Suno submit status:', submitResponse.status, submitText.slice(0, 500));

      if (!submitResponse.ok) {
        throw new Error(`Suno submit failed: ${submitResponse.status} ${submitText}`);
      }

      const submitted = JSON.parse(submitText) as SunoGenerateItem[] | SunoGenerateItem;
      const items = Array.isArray(submitted) ? submitted : [submitted];

      const ids = items
        .map((item) => item.id || item.clip_id)
        .filter((value): value is string => Boolean(value));

      if (ids.length === 0) {
        throw new Error(`Suno submit returned no clip ids: ${submitText}`);
      }

      console.log('Suno clip ids:', ids);

      for (let pollAttempt = 1; pollAttempt <= 40; pollAttempt += 1) {
        const pollResponse = await fetch(
          `${baseUrl}/api/get?ids=${encodeURIComponent(ids.join(','))}`,
          {
            headers: env.sunoApiKey ? { Authorization: `Bearer ${env.sunoApiKey}` } : undefined,
          },
        );

        const pollText = await pollResponse.text();
        console.log(`Suno poll ${pollAttempt}:`, pollResponse.status, pollText.slice(0, 300));

        if (!pollResponse.ok) {
          throw new Error(`Suno poll failed: ${pollResponse.status} ${pollText}`);
        }

        const polled = JSON.parse(pollText) as SunoStatusItem[] | SunoStatusItem;
        const results = Array.isArray(polled) ? polled : [polled];

        const ready = results.find(
          (item) =>
            (item.status === 'streaming' || item.status === 'complete') &&
            !!item.audio_url,
        );

        if (ready?.audio_url) {
          console.log(`Suno audio ready on poll ${pollAttempt}:`, ready.id, ready.title);
          return ready.audio_url;
        }

        const failed = results.find((item) => item.status === 'error' || item.status === 'failed');
        if (failed) {
          throw new Error(`Suno generation failed: ${failed.error_message || 'unknown failure'}`);
        }

        await sleep(10000);
      }

      throw new Error('Suno generation timed out after 40 polling attempts');
    } catch (error: any) {
      lastError = error?.message || String(error);

      const retryable =
        /Execution context was destroyed/i.test(lastError) ||
        /most likely because of a navigation/i.test(lastError) ||
        /Internal error/i.test(lastError) ||
        /500/i.test(lastError);

      console.warn(`Suno submit attempt ${submitAttempt} failed: ${lastError}`);

      if (!retryable || submitAttempt === 4) {
        throw new Error(lastError);
      }

      console.log('Retrying Suno submit after transient navigation/context failure...');
      await sleep(8000);
    }
  }

  throw new Error(lastError);
}

async function downloadToFile(url: string, outputPath: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

async function createFallbackAudio(durationSeconds: number, outputPath: string) {
  const safeDuration = Math.max(5, Math.min(durationSeconds, 180));

  await execFileAsync(env.ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=432:duration=${safeDuration}`,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    outputPath,
  ]);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}