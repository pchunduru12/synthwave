import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { execFileAsync } from './process-service.js';

export interface VideoRenderOptions {
  duration?: number;
  // Burn lyrics into the video as karaoke-style subtitles. Off by default.
  // Requires `lyricsText` (and optionally `lyricsRomanized` for non-Latin scripts)
  // — if neither is provided, lyrics overlay is silently skipped.
  burnLyrics?: boolean;
  lyricsText?: string;
  lyricsRomanized?: string;
  // Where to write the SRT file. If omitted, derived from outputPath
  // (sibling file named `lyrics.srt` in the same directory).
  srtOutputPath?: string;
}

export interface VideoRenderResult {
  provider: string;
  model: string;
  outputPath: string;
  elapsedMs: number;
  // Set when lyrics overlay was applied. Caller registers as artifact.
  srtPath?: string;
  burnedLyrics?: boolean;
}

const DEFAULT_WATERMARK_PATH = '/app/assets/watermark.png';

export async function renderVideoFromCoverAndAudio(
  coverPath: string,
  audioPath: string,
  outputPath: string,
  options: VideoRenderOptions = {},
): Promise<VideoRenderResult> {
  const absCoverPath = path.resolve(coverPath);
  const absAudioPath = path.resolve(audioPath);
  const absOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });

  // Resolve effective video duration. We need the *actual* audio duration
  // (not the user-requested duration) for two reasons:
  //   1. MiniMax returns a complete song whose length we don't pre-trim, so
  //      `options.duration` is undefined for that path. We still need to
  //      time the lyrics across whatever the song actually is.
  //   2. Suno-trimmed audio matches request, so probe ≈ request — same answer.
  // Probing is cheap (~50ms) so we always do it when we need it.
  let effectiveDuration: number | null = null;
  if (options.duration && options.duration > 0) {
    effectiveDuration = Math.min(options.duration, 600);
  }

  const wantLyrics = options.burnLyrics === true && (options.lyricsText || options.lyricsRomanized);
  if (wantLyrics) {
    // Need a real duration to time the SRT. If user didn't pass one, probe.
    if (effectiveDuration === null) {
      try {
        effectiveDuration = await probeAudioDurationSeconds(absAudioPath);
        console.log(`Probed audio duration: ${effectiveDuration}s`);
      } catch (err: any) {
        console.warn('ffprobe failed, lyrics overlay disabled:', err?.message || err);
      }
    }
  }

  // Decide whether to actually burn lyrics, and prepare the SRT if so.
  let srtPath: string | undefined;
  let burnedLyrics = false;
  if (wantLyrics && effectiveDuration !== null) {
    const lyricsForOverlay = options.lyricsRomanized?.trim() || options.lyricsText?.trim();
    if (lyricsForOverlay) {
      const lines = parseLyricsLines(lyricsForOverlay);
      if (lines.length > 0) {
        const srt = buildSrt(lines, effectiveDuration);
        srtPath = options.srtOutputPath || path.join(path.dirname(absOutputPath), 'lyrics.srt');
        fs.writeFileSync(srtPath, srt, 'utf8');
        burnedLyrics = true;
        console.log(`Wrote SRT for lyrics overlay: ${srtPath} (${lines.length} lines, ${effectiveDuration}s)`);
      } else {
        console.warn('Lyrics text contained no usable lines after parsing; overlay skipped');
      }
    }
  }

  const fadeStart = effectiveDuration ? Math.max(0, effectiveDuration - 1.5) : null;

  // Resolve watermark path. If the file is missing, skip watermarking entirely
  // and log a warning — render should not fail just because the asset is absent.
  const watermarkPath = env.watermarkPath || DEFAULT_WATERMARK_PATH;
  const watermarkExists = fs.existsSync(watermarkPath);
  if (!watermarkExists) {
    console.warn('Watermark file not found at', watermarkPath, '- rendering without watermark');
  }

  const args: string[] = [
    '-y',
    '-loop', '1',
    '-i', absCoverPath,
    '-i', absAudioPath,
  ];

  if (watermarkExists) {
    args.push('-i', watermarkPath);
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'stillimage',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-r', '24',
    // Move moov atom to the front so the MP4 starts playing before fully
    // downloaded. Critical for web/mobile streaming.
    '-movflags', '+faststart',
  );

  // Build the video filter graph. The chain composes (in order):
  //   1. cover scaling      — always
  //   2. watermark overlay  — when watermark file exists
  //   3. subtitles burn     — when lyrics overlay is requested
  //
  // Subtitles MUST be the last filter on the video stream because they need
  // a fully-formed frame to draw onto.
  const filterGraph = buildFilterGraph(watermarkExists, srtPath);
  args.push('-filter_complex', filterGraph);

  if (effectiveDuration !== null) {
    args.push('-t', String(effectiveDuration));
    if (fadeStart !== null) {
      args.push('-af', `afade=t=out:st=${fadeStart}:d=1.5`);
    }
  } else {
    args.push('-shortest');
  }

  args.push(absOutputPath);

  console.log('FFmpeg render starting', {
    effectiveDuration,
    output: absOutputPath,
    watermark: watermarkExists ? watermarkPath : null,
    burnedLyrics,
    srtPath: srtPath || null,
  });

  const startedAt = Date.now();
  await execFileAsync(env.ffmpegPath, args);
  const elapsedMs = Date.now() - startedAt;
  console.log(`FFmpeg render complete in ${elapsedMs}ms`);

  return {
    provider: 'local',
    model: 'ffmpeg-renderer',
    outputPath: absOutputPath,
    elapsedMs,
    srtPath: burnedLyrics ? srtPath : undefined,
    burnedLyrics,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Filter graph construction
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds the -filter_complex graph string. We always start with [0:v] and
 * end with the final video output (un-named, so ffmpeg auto-maps it).
 *
 * Stages:
 *   [0:v] scale -> [bg]
 *   [2:v] watermark process -> [wm]    (if watermark)
 *   [bg][wm] overlay -> [withWm]       (if watermark)
 *   subtitles burn                     (if lyrics)
 */
function buildFilterGraph(watermarkExists: boolean, srtPath?: string): string {
  const parts: string[] = [];

  // Stage 1: scale cover to 720x720 with safe pixel format.
  parts.push('[0:v]scale=720:720,format=yuv420p[bg]');

  let lastLabel = '[bg]';

  // Stage 2: watermark.
  if (watermarkExists) {
    // Scale watermark to 80px wide, preserve aspect ratio (-1), apply 65%
    // alpha multiply via colorchannelmixer (works whether or not the source
    // PNG has true alpha). Position with 16px padding from bottom-right.
    parts.push('[2:v]scale=80:-1,format=rgba,colorchannelmixer=aa=0.65[wm]');
    parts.push(`${lastLabel}[wm]overlay=W-w-16:H-h-16:format=auto[withWm]`);
    lastLabel = '[withWm]';
  }

  // Stage 3: subtitles burn.
  if (srtPath) {
    // Escape the SRT path for ffmpeg's filter syntax. Inside `subtitles=`,
    // colons (`:`) and backslashes (`\`) are filter separators and must be
    // escaped. Single quotes wrap the path so spaces are tolerated.
    const escaped = escapeForFilter(srtPath);
    // force_style values (ASS format):
    //   FontName=Arial          - default sans, present in all ffmpeg builds
    //   FontSize=22             - readable at 720p
    //   PrimaryColour=&HFFFFFF  - white text
    //   OutlineColour=&H80000000 - 50% transparent black box (BBGGRR with alpha AA)
    //   BorderStyle=3           - opaque box behind text (vs. just outline)
    //   Outline=1               - small box padding
    //   Shadow=0                - no drop shadow
    //   MarginV=50              - 50px from bottom
    //   Alignment=2             - bottom-center
    const style = [
      'FontName=Arial',
      'FontSize=22',
      'PrimaryColour=&HFFFFFF',
      'OutlineColour=&H80000000',
      'BorderStyle=3',
      'Outline=1',
      'Shadow=0',
      'MarginV=50',
      'Alignment=2',
    ].join(',');
    parts.push(`${lastLabel}subtitles='${escaped}':force_style='${style}'`);
  } else {
    // No subtitle stage. If there were no other stages either, ffmpeg still
    // needs the final filter to be unlabeled. We handle that by ensuring
    // stage 1's label-only output gets a passthrough.
    if (lastLabel === '[bg]') {
      // Stage 1 wrote to [bg] but nothing consumed it. Replace with a null filter
      // that consumes [bg] and produces the unlabeled final output.
      parts.push(`${lastLabel}null`);
    } else {
      // We had a watermark stage. Its output [withWm] needs to become the
      // unlabeled final.
      parts.push(`${lastLabel}null`);
    }
  }

  return parts.join(';');
}

/**
 * Escape a filesystem path for use inside an ffmpeg filter argument.
 * Backslashes and colons are filter syntax; single quotes are the path delimiter.
 */
function escapeForFilter(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

// ────────────────────────────────────────────────────────────────────────────
// SRT generation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse lyrics text into clean lines suitable for subtitle display.
 * Skips section markers like [Verse 1], [Chorus], [bridge], blank lines.
 */
export function parseLyricsLines(lyrics: string): string[] {
  return lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^\[.*\]$/.test(line));
}

/**
 * Build SRT content from lyric lines, evenly spread across the audio duration.
 *
 * This is the "even-divide" baseline. A future iteration can replace this with
 * forced alignment (aeneas/whisper-timestamped) for better sync to actual
 * vocal entry points. For now it's good enough for short songs and a fair
 * approximation for longer ones, given that:
 *   - Suno trims to user-requested duration, so lines/duration is roughly stable
 *   - We skip section markers, so timing is per actual lyric line
 *   - We disclose to users that timing is approximate
 */
export function buildSrt(lines: string[], totalDurationSeconds: number): string {
  if (lines.length === 0 || totalDurationSeconds <= 0) return '';

  const perLine = totalDurationSeconds / lines.length;

  return lines
    .map((line, i) => {
      const start = i * perLine;
      const end = Math.min((i + 1) * perLine, totalDurationSeconds);
      const safe = sanitizeSrtText(line);
      return `${i + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${safe}\n`;
    })
    .join('\n');
}

function sanitizeSrtText(text: string): string {
  // SRT is forgiving but strip HTML-like brackets just in case, and collapse
  // runs of whitespace. Don't escape anything else — UTF-8 passes through fine.
  return text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

function formatSrtTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 1000);
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// ffprobe
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run ffprobe to get the actual duration of an audio file in seconds.
 * Throws if ffprobe is unavailable or the file is unreadable.
 *
 * Implementation note: process-service.ts in this repo wraps Node's
 * promisified execFile, which returns { stdout, stderr }. But existing
 * callers in this codebase only ever `await` it without destructuring, so we
 * defensively support both shapes — the result might be a string, an object
 * with .stdout, or even void if the wrapper was customized to swallow output.
 * If we can't get stdout, we fall back to the lower-level approach.
 */
async function probeAudioDurationSeconds(audioPath: string): Promise<number> {
  const result: any = await execFileAsync(env.ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ]);

  // Try to extract stdout from any of the plausible return shapes.
  let stdout: string | undefined;
  if (typeof result === 'string') {
    stdout = result;
  } else if (result && typeof result.stdout === 'string') {
    stdout = result.stdout;
  } else if (result && Buffer.isBuffer(result.stdout)) {
    stdout = result.stdout.toString('utf8');
  }

  if (!stdout) {
    // Fall back to direct execFile from node:child_process if the wrapper
    // doesn't return stdout (e.g. it was written for fire-and-forget use).
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const { stdout: directStdout } = await exec(env.ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);
    stdout = directStdout;
  }

  const trimmed = String(stdout || '').trim();
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`ffprobe returned invalid duration: "${trimmed}"`);
  }
  return value;
}
