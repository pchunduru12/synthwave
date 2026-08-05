import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { OpenAI } from 'openai';
import { env } from '../config/env.js';
import { execFileAsync } from './process-service.js';

export type UploadedUserImage = {
  path: string;
  mimeType?: string;
  originalName?: string;
  size?: number;
};

// Backward-compatible alias because creation-service.ts currently imports UploadedImageInput.
export type UploadedImageInput = UploadedUserImage;

export type ImageMode = 'generate' | 'enhance' | 'use-original' | 'background-composite';

type CoverArtSource =
  | 'user-upload-edit'
  | 'user-upload-composite'
  | 'openai-generate'
  | 'openai-generate-fallback'
  | 'use-original'
  | 'original-fallback'
  | 'local-fallback';

type CoverArtResult = {
  provider: string;
  model: string;
  source: CoverArtSource;
  outputPath: string;
  promptUsed?: string;
};

// Per-call overrides. Admin can pass these via creation request; defaults come
// from env. Non-admin requests have these stripped before reaching this function.
export type ImageGenerationOverrides = {
  model?: string;
  editModel?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
};

export type ImageProgressCallback = (detail: string, progress?: number) => void | Promise<void>;

export type BackgroundReadyCallback = (payload: {
  outputPath: string;
  promptUsed: string;
  provider: string;
  model: string;
}) => void | Promise<void>;

async function safeProgress(callback: ImageProgressCallback | undefined, detail: string, progress?: number) {
  if (!callback) return;
  try {
    await callback(detail, progress);
  } catch (error: any) {
    console.warn('Image progress callback failed:', error?.message || error);
  }
}

async function safeBackgroundReady(callback: BackgroundReadyCallback | undefined, payload: Parameters<BackgroundReadyCallback>[0]) {
  if (!callback) return;
  try {
    await callback(payload);
  } catch (error: any) {
    console.warn('Background-ready callback failed:', error?.message || error);
  }
}

function openAiClient() {
  if (!env.openAiApiKey) return null;
  return new OpenAI({ apiKey: env.openAiApiKey });
}

function formatError(error: any) {
  return {
    message: error?.message,
    status: error?.status,
    code: error?.code,
    type: error?.type,
    name: error?.name,
    cause: error?.cause,
    response: error?.response?.data || error?.response || null,
  };
}

function ensureOutputDirectory(outputPath: string) {
  const absOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });
  return absOutputPath;
}

async function writeGeneratedImageToOutputPath(imageBuffer: Buffer, outputPath: string) {
  // GPT Image can return JPEG/WEBP for lower latency. The app/video pipeline
  // still expects cover.png, so normalize the bytes to a real PNG when needed.
  await sharp(imageBuffer).rotate().png().toFile(outputPath);
}

async function downloadImageToFile(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await writeGeneratedImageToOutputPath(Buffer.from(arrayBuffer), outputPath);
}

async function writeUploadedImageAsPng(userImage: UploadedUserImage, outputPath: string) {
  // Do not copy JPEG/WEBP bytes into a .png file. Convert to real PNG so the
  // artifact URL, browser preview, and FFmpeg video renderer all see valid PNG.
  await sharp(userImage.path)
    .rotate()
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 21, g: 21, b: 46, alpha: 1 },
    })
    .png()
    .toFile(outputPath);
}

/**
 * Normalize a user-uploaded image to a 1024x1024 square PNG suitable for
 * OpenAI image reference/edit workflows.
 *
 * This is still available for the legacy/admin "enhance" path. It may redraw
 * faces and should not be the default for personal/family photos.
 */
async function normalizeImageForOpenAiEdit(userImage: UploadedUserImage): Promise<string> {
  const tmpPath = `${userImage.path}.normalized-edit.png`;

  await sharp(userImage.path)
    .rotate()
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .removeAlpha()
    .png()
    .toFile(tmpPath);

  return tmpPath;
}

/**
 * Normalize a user-uploaded photo for foreground extraction/compositing.
 *
 * Important: we use transparent padding and do not redraw the people. The
 * foreground extraction step operates on this normalized copy, while the final
 * cover is composed with the original people as pixels from the upload.
 */
async function normalizeImageForComposite(userImage: UploadedUserImage, outputPath: string) {
  await sharp(userImage.path)
    .rotate()
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toFile(outputPath);
}

// Wraps a scene/edit prompt with strict identity-preservation directives.
// Kept for admin/legacy enhance mode only. The preferred uploaded-person path
// is background-composite, which preserves people as original pixels.
function buildStrictEnhancementPrompt(scenePrompt: string) {
  return `
Edit the uploaded image while STRONGLY preserving the original people and composition.

This is an enhancement/edit of the uploaded image, NOT a new image generation.

Preserve as closely as possible:
- the same people from the uploaded photo
- the same facial identity and recognizable features
- the same age group of each person
- the same relationship between the people
- the same pose and overall composition
- the same approximate framing and emotional tone

Do NOT replace the people with different people.
Do NOT redraw, beautify, reconstruct, or reinterpret the faces.
Do NOT change the face shape, eyes, nose, mouth, hairline, hairstyle, expression, body proportions, clothing, or jewelry.

Apply the requested scene/edit gently and tastefully:
"${scenePrompt}"

Priority order:
1. Preserve identity and core composition of the people
2. Preserve relationship and emotional feel
3. Apply scene/edit as a secondary modification

Final reminder: the result should look like the user's uploaded image,
beautifully restaged into the requested scene — not like a different newly
invented image. Keep the people from the uploaded photo exactly as they are.
`.trim();
}

function extractImageGenerationResult(response: any): string | undefined {
  const imageCall = (response?.output || []).find(
    (item: any) => item?.type === 'image_generation_call' && item?.result,
  );

  return imageCall?.result;
}

/**
 * Uploaded-image enhancement path.
 *
 * This path can still drift faces because the model may redraw the whole image.
 * It is intentionally NOT used by default for user uploads anymore. Use
 * background-composite for people/family photos.
 */
async function editUploadedImageWithResponsesApi(
  client: OpenAI,
  imageEditPrompt: string,
  absOutputPath: string,
  userImage: UploadedUserImage,
  modelOverride?: string,
  qualityOverride?: 'low' | 'medium' | 'high' | 'auto',
): Promise<CoverArtResult> {
  const editPrompt = buildStrictEnhancementPrompt(imageEditPrompt);
  const responseModel = env.openAiTextModel || 'gpt-4.1-mini';
  const configuredImageModel = modelOverride || env.openAiImageEditModel || env.openAiImageModel || 'gpt-image-1';
  const quality = qualityOverride || env.openAiImageQuality || 'medium';
  const outputFormat = env.openAiImageOutputFormat || 'jpeg';
  const outputCompression = env.openAiImageOutputCompression ?? 65;

  console.log('Editing uploaded image with OpenAI Responses image_generation tool', {
    responseModel,
    configuredImageModel,
    quality,
    originalName: userImage.originalName,
    mimeType: userImage.mimeType,
    size: userImage.size,
    promptPreview: editPrompt.slice(0, 200),
    outputFormat,
    outputCompression,
  });

  const normalizedPath = await normalizeImageForOpenAiEdit(userImage);

  try {
    const imageBase64 = fs.readFileSync(normalizedPath).toString('base64');
    const imageDataUrl = `data:image/png;base64,${imageBase64}`;

    const response = await client.responses.create({
      model: responseModel,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: editPrompt },
            { type: 'input_image', image_url: imageDataUrl },
          ],
        },
      ],
      tools: [
        {
          type: 'image_generation',
          quality,
          size: '1024x1024',
          input_fidelity: 'high',
          output_format: outputFormat,
          ...(outputFormat === 'jpeg' || outputFormat === 'webp'
            ? { output_compression: outputCompression }
            : {}),
        },
      ],
      tool_choice: { type: 'image_generation' },
    } as any);

    const imageBase64Result = extractImageGenerationResult(response);

    if (!imageBase64Result) {
      console.error('OpenAI Responses image edit raw response:', JSON.stringify(response, null, 2));
      throw new Error('OpenAI Responses API returned no edited image data');
    }

    await writeGeneratedImageToOutputPath(Buffer.from(imageBase64Result, 'base64'), absOutputPath);

    console.log('OpenAI Responses image edit succeeded via image_generation tool');

    return {
      provider: 'openai',
      model: configuredImageModel,
      source: 'user-upload-edit',
      outputPath: absOutputPath,
      promptUsed: editPrompt,
    };
  } finally {
    try {
      fs.unlinkSync(normalizedPath);
    } catch (cleanupError: any) {
      console.warn('Could not delete normalized image temp file:', cleanupError?.message || cleanupError);
    }
  }
}

async function generateImageWithOpenAi(
  client: OpenAI,
  imagePrompt: string,
  absOutputPath: string,
  source: CoverArtSource,
  modelOverride?: string,
  qualityOverride?: 'low' | 'medium' | 'high' | 'auto',
): Promise<CoverArtResult> {
  const model = modelOverride || env.openAiImageModel;
  const quality = qualityOverride || env.openAiImageQuality;
  const outputFormat = env.openAiImageOutputFormat || 'jpeg';
  const outputCompression = env.openAiImageOutputCompression ?? 65;

  console.log('Generating image with OpenAI', {
    model,
    quality,
    source,
    outputFormat,
    outputCompression,
    promptPreview: imagePrompt.slice(0, 200),
  });

  const callParams: any = {
    model,
    prompt: imagePrompt,
    size: '1024x1024',
  };

  if (model.startsWith('gpt-image-')) {
    callParams.quality = quality;
    callParams.output_format = outputFormat;
    if (outputFormat === 'jpeg' || outputFormat === 'webp') {
      callParams.output_compression = outputCompression;
    }
  }

  const result = await client.images.generate(callParams);
  const first = result.data?.[0];

  if (first?.b64_json) {
    await writeGeneratedImageToOutputPath(Buffer.from(first.b64_json, 'base64'), absOutputPath);
    console.log('OpenAI image generation succeeded via b64_json', { source, model, quality, outputFormat });
    return {
      provider: 'openai',
      model,
      source,
      outputPath: absOutputPath,
      promptUsed: imagePrompt,
    };
  }

  if (first?.url) {
    await downloadImageToFile(first.url, absOutputPath);
    console.log('OpenAI image generation succeeded via URL', { source, model, quality, outputFormat });
    return {
      provider: 'openai',
      model,
      source,
      outputPath: absOutputPath,
      promptUsed: imagePrompt,
    };
  }

  console.error('OpenAI image generation raw response:', JSON.stringify(result, null, 2));
  throw new Error('OpenAI returned no generated image data');
}

function buildBackgroundOnlyPrompt(scenePrompt: string) {
  const cleaned = (scenePrompt || '').trim();
  const scene = cleaned || 'a beautiful photorealistic travel background with natural daylight';

  return `
Generate a photorealistic BACKGROUND ONLY image for a portrait composite.

Scene/background request:
${scene}

Critical composition requirements:
- Do NOT include people, humans, faces, bodies, hands, silhouettes, statues that look like people, or animals.
- Leave clean open space in the lower center foreground for the original uploaded people to be placed later.
- Keep important architecture and landmarks mostly in the upper/background area.
- Use realistic natural daylight, believable perspective, true-to-life colors, realistic shadows, and photographic depth.
- Use a DSLR or modern iPhone travel-photo look with soft background depth.
- Avoid painting, illustration, anime, CGI, fantasy art, poster art, digital art, watercolor, oil painting, painterly textures, fake sky, over-smoothing, surreal colors, and artificial glow.
- Output a square 1024x1024 real-photo background suitable for compositing people over it.
`.trim();
}

async function removeBackgroundFromUploadedImage(inputPath: string, outputPath: string) {
  const command = process.env.BACKGROUND_REMOVAL_COMMAND || 'rembg';

  // rembg CLI syntax: rembg i input.png output.png
  await execFileAsync(command, ['i', inputPath, outputPath]);

  if (!fs.existsSync(outputPath)) {
    throw new Error('Background removal command completed but produced no output');
  }
}

async function compositeForegroundOverBackground(params: {
  foregroundPath: string;
  backgroundPath: string;
  outputPath: string;
}) {
  const { foregroundPath, backgroundPath, outputPath } = params;

  const backgroundBuffer = await sharp(backgroundPath)
    .rotate()
    .resize(1024, 1024, {
      fit: 'cover',
      position: 'center',
    })
    .png()
    .toBuffer();

  const foregroundBuffer = await sharp(foregroundPath)
    .rotate()
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    // Small, non-generative harmonization only. We do not redraw faces.
    .modulate({ saturation: 1.02, brightness: 1.01 })
    .png()
    .toBuffer();

  await sharp(backgroundBuffer)
    .composite([
      {
        input: foregroundBuffer,
        blend: 'over',
      },
    ])
    .png()
    .toFile(outputPath);
}

async function generateCompositeCoverArt(params: {
  client: OpenAI;
  imagePrompt: string;
  imageEditPrompt?: string;
  absOutputPath: string;
  userImage: UploadedUserImage;
  overrides?: ImageGenerationOverrides;
  onProgress?: ImageProgressCallback;
  onBackgroundReady?: BackgroundReadyCallback;
}): Promise<CoverArtResult> {
  const {
    client,
    imagePrompt,
    imageEditPrompt,
    absOutputPath,
    userImage,
    overrides = {},
    onProgress,
    onBackgroundReady,
  } = params;
  const dir = path.dirname(absOutputPath);
  fs.mkdirSync(dir, { recursive: true });

  const normalizedUploadPath = path.join(dir, 'upload-normalized.png');
  const foregroundPath = path.join(dir, 'foreground.png');
  const backgroundPath = path.join(dir, 'background.png');
  const backgroundPrompt = buildBackgroundOnlyPrompt(imageEditPrompt || imagePrompt);

  console.log('Generating uploaded-photo background composite', {
    originalName: userImage.originalName,
    mimeType: userImage.mimeType,
    size: userImage.size,
    promptPreview: backgroundPrompt.slice(0, 250),
  });

  await safeProgress(onProgress, 'Preparing uploaded photo foreground', 20);
  await normalizeImageForComposite(userImage, normalizedUploadPath);

  // Latency fix:
  // Start OpenAI background generation in parallel with foreground extraction.
  // Before this, rembg could delay the OpenAI call by minutes on a small server.
  await safeProgress(onProgress, 'Generating background scene while preserving uploaded people', 30);

  let compositeAborted = false;
  const backgroundPromise = (async () => {
    const backgroundResult = await generateImageWithOpenAi(
      client,
      backgroundPrompt,
      backgroundPath,
      'openai-generate',
      overrides.model,
      overrides.quality,
    );

    if (!compositeAborted) {
      await safeBackgroundReady(onBackgroundReady, {
        outputPath: backgroundPath,
        promptUsed: backgroundPrompt,
        provider: backgroundResult.provider,
        model: backgroundResult.model,
      });
    }

    return backgroundResult;
  })();

  void backgroundPromise.catch(() => {});

  try {
    await removeBackgroundFromUploadedImage(normalizedUploadPath, foregroundPath);
    await safeProgress(onProgress, 'Foreground ready — waiting for background scene', 55);
  } catch (error: any) {
    compositeAborted = true;
    console.error('Background removal failed; falling back to original uploaded image:', formatError(error));
    await safeProgress(onProgress, 'Background removal failed — using original uploaded image', 90);
    await writeUploadedImageAsPng(userImage, absOutputPath);
    return {
      provider: 'user-upload',
      model: 'original-image-fallback-after-bg-removal-failure',
      source: 'original-fallback',
      outputPath: absOutputPath,
      promptUsed: backgroundPrompt,
    };
  }

  try {
    await backgroundPromise;
    await safeProgress(onProgress, 'Background scene ready — blending original people into scene', 70);
  } catch (error: any) {
    compositeAborted = true;
    console.error('OpenAI background generation failed; falling back to original uploaded image:', formatError(error));
    await safeProgress(onProgress, 'Background generation failed — using original uploaded image', 90);
    await writeUploadedImageAsPng(userImage, absOutputPath);
    return {
      provider: 'user-upload',
      model: 'original-image-fallback-after-background-generation-failure',
      source: 'original-fallback',
      outputPath: absOutputPath,
      promptUsed: backgroundPrompt,
    };
  }

  try {
    await compositeForegroundOverBackground({
      foregroundPath,
      backgroundPath,
      outputPath: absOutputPath,
    });
    await safeProgress(onProgress, 'Final image ready — rendering video next', 95);
  } catch (error: any) {
    console.error('Image compositing failed; falling back to original uploaded image:', formatError(error));
    await safeProgress(onProgress, 'Image blending failed — using original uploaded image', 90);
    await writeUploadedImageAsPng(userImage, absOutputPath);
    return {
      provider: 'user-upload',
      model: 'original-image-fallback-after-composite-failure',
      source: 'original-fallback',
      outputPath: absOutputPath,
      promptUsed: backgroundPrompt,
    };
  }

  return {
    provider: 'composite',
    model: 'rembg-openai-background-sharp-composite',
    source: 'user-upload-composite',
    outputPath: absOutputPath,
    promptUsed: backgroundPrompt,
  };
}

export interface GenerateCoverArtParams {
  imagePrompt: string;
  // Required when userImage is present and imageMode === 'enhance'.
  // When absent, falls back to imagePrompt — but you'll get the album-cover
  // boilerplate threaded through the edit pipeline, which is suboptimal.
  imageEditPrompt?: string;
  outputPath: string;
  userImage?: UploadedUserImage;
  imageMode?: ImageMode;
  overrides?: ImageGenerationOverrides;
  // Optional callbacks used by the creation pipeline to persist progressive
  // preview artifacts while image generation is still running.
  onProgress?: ImageProgressCallback;
  onBackgroundReady?: BackgroundReadyCallback;
}

export async function generateCoverArt(
  paramsOrPrompt: GenerateCoverArtParams | string,
  outputPathArg?: string,
  userImageArg?: UploadedUserImage,
  imageModeArg?: ImageMode,
): Promise<CoverArtResult> {
  const params: GenerateCoverArtParams =
    typeof paramsOrPrompt === 'string'
      ? {
          imagePrompt: paramsOrPrompt,
          outputPath: outputPathArg!,
          userImage: userImageArg,
          imageMode: imageModeArg,
        }
      : paramsOrPrompt;

  const {
    imagePrompt,
    imageEditPrompt,
    outputPath,
    userImage,
    overrides = {},
    onProgress,
    onBackgroundReady,
  } = params;

  // New safe default: uploaded personal photos use background compositing, not
  // full-image AI editing. This preserves faces as original pixels.
  const imageMode: ImageMode = params.imageMode || (userImage ? 'background-composite' : 'generate');

  const absOutputPath = ensureOutputDirectory(outputPath);
  const client = openAiClient();

  // 1) User uploaded image and wants it used exactly/predictably.
  if (userImage && imageMode === 'use-original') {
    console.log('Using uploaded image directly without AI modification', {
      originalName: userImage.originalName,
      mimeType: userImage.mimeType,
      size: userImage.size,
    });

    await writeUploadedImageAsPng(userImage, absOutputPath);

    return {
      provider: 'user-upload',
      model: 'original-image',
      source: 'use-original',
      outputPath: absOutputPath,
    };
  }

  // 2) Uploaded-image background composite path.
  if (userImage && imageMode === 'background-composite') {
    if (client && !env.enableMockProviders) {
      return generateCompositeCoverArt({
        client,
        imagePrompt,
        imageEditPrompt,
        absOutputPath,
        userImage,
        overrides,
        onProgress,
        onBackgroundReady,
      });
    }

    console.warn('OpenAI unavailable or mock providers enabled; using original uploaded image instead of composite');
    await writeUploadedImageAsPng(userImage, absOutputPath);
    return {
      provider: 'user-upload',
      model: 'original-image-fallback-no-openai-for-composite',
      source: 'original-fallback',
      outputPath: absOutputPath,
    };
  }

  // 3) OpenAI path.
  if (client && !env.enableMockProviders) {
    // Legacy/admin full-image edit path. Not recommended for family photos.
    if (userImage && imageMode === 'enhance') {
      const promptForEdit = imageEditPrompt || imagePrompt;

      if (!imageEditPrompt) {
        console.warn(
          'No imageEditPrompt provided for upload-edit path; using generic imagePrompt. ' +
            'Edit quality will be lower because album-cover boilerplate dilutes scene instructions.',
        );
      }

      try {
        return await editUploadedImageWithResponsesApi(
          client,
          promptForEdit,
          absOutputPath,
          userImage,
          overrides.editModel,
          overrides.quality,
        );
      } catch (error: any) {
        console.error('OpenAI image edit failed:', formatError(error));
        console.warn('Falling back to original uploaded image to preserve user content');

        await writeUploadedImageAsPng(userImage, absOutputPath);

        return {
          provider: 'user-upload',
          model: 'original-image-fallback',
          source: 'original-fallback',
          outputPath: absOutputPath,
        };
      }
    }

    // Normal generation path: no user image, or explicit generate mode.
    try {
      return await generateImageWithOpenAi(
        client,
        imagePrompt,
        absOutputPath,
        userImage ? 'openai-generate-fallback' : 'openai-generate',
        overrides.model,
        overrides.quality,
      );
    } catch (error: any) {
      console.error('OpenAI image generation failed:', formatError(error));
    }
  }

  // 4) If OpenAI is unavailable but user uploaded an image, preserve it.
  if (userImage) {
    console.warn('OpenAI unavailable or disabled; using original uploaded image');
    await writeUploadedImageAsPng(userImage, absOutputPath);

    return {
      provider: 'user-upload',
      model: 'original-image-fallback',
      source: 'original-fallback',
      outputPath: absOutputPath,
    };
  }

  // 5) Final local placeholder fallback.
  console.warn('Falling back to local placeholder cover image');
  await execFileAsync(env.ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x15152e:s=1024x1024',
    '-frames:v', '1',
    absOutputPath,
  ]);

  return {
    provider: 'local',
    model: 'ffmpeg-color-card',
    source: 'local-fallback',
    outputPath: absOutputPath,
  };
}
