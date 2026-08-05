/**
 * minimax-audio-service.ts
 * ─────────────────────────────────────────────────────────────
 * ARCHITECT NOTE: Single-response (no-polling) adapter for
 * MiniMax music-2.6. Hex-decode → temp MP3 → hand off to the
 * existing ffmpeg trim layer — zero changes to downstream code.
 *
 * ROLE: Backend Service (Expert Backend / Full-Stack)
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { env } from "../config/env.js";

// ─── Types ────────────────────────────────────────────────────

export interface MinimaxGenerateParams {
  prompt: string;          // short style / mood description ≤ 200 chars
  lyrics: string;          // full bracketed lyrics  [Verse] … [Chorus] …
  isInstrumental?: boolean;
  referenceAudioPath?: string; // optional: path to a reference MP3 for timbre
}

interface MinimaxApiResponse {
  task_id?: string;
  data?: {
    audio?: string;        // hex-encoded MP3
    music_duration?: number;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

// ─── Constants ────────────────────────────────────────────────

const MINIMAX_ENDPOINT = "https://api.minimax.io/v1/music_generation";
const MODEL = "music-2.6";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

// ─── Helpers ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hexToBuffer(hex: string): Buffer {
  // MiniMax returns a plain hex string (no "0x" prefix, no spaces).
  const clean = hex.replace(/\s/g, "");
  if (clean.length % 2 !== 0) {
    throw new Error("MiniMax: malformed hex audio payload (odd length)");
  }
  return Buffer.from(clean, "hex");
}

/** Write hex audio to a temp MP3 and return its absolute path. */
async function hexToTempMp3(hexAudio: string): Promise<string> {
  const buf = hexToBuffer(hexAudio);
  const tmpPath = path.join(
    os.tmpdir(),
    `minimax_${crypto.randomUUID()}.mp3`
  );
  await fs.promises.writeFile(tmpPath, buf);
  return tmpPath;
}

// ─── Core API call ────────────────────────────────────────────

async function callMinimaxApi(
  params: MinimaxGenerateParams
): Promise<MinimaxApiResponse> {
  const apiKey = env.minimaxApiKey;
  if (!apiKey) {
    throw new Error(
      "MINIMAX_API_KEY is not set. Add it to .env.production and restart."
    );
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    prompt: params.prompt,
    lyrics: params.lyrics,
    is_instrumental: params.isInstrumental ?? false,
  };

  // Optional reference audio — send as base64 if provided
  if (params.referenceAudioPath) {
    const refBuf = await fs.promises.readFile(params.referenceAudioPath);
    body.reference_audio = refBuf.toString("base64");
  }

  const res = await fetch(MINIMAX_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(unreadable body)");
    throw new Error(
      `MiniMax HTTP ${res.status}: ${errText.slice(0, 400)}`
    );
  }

  const json = (await res.json()) as MinimaxApiResponse;
  return json;
}

// ─── Public API ───────────────────────────────────────────────

export interface MinimaxResult {
  /** Absolute path to a raw (untrimmed) MP3 temp file. Caller is responsible
   *  for deletion after the ffmpeg trim layer processes it.  */
  rawMp3Path: string;
  /** Reported duration in seconds (may be 0 if MiniMax omits it). */
  reportedDuration: number;
}

/**
 * Generate music via MiniMax and return the path to a temp MP3.
 * Retries up to MAX_RETRIES times on transient failures.
 */
export async function generateWithMinimax(
  params: MinimaxGenerateParams
): Promise<MinimaxResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.warn(
        `[minimax] Attempt ${attempt + 1}/${MAX_RETRIES + 1} after error: ${lastError?.message}`
      );
      await sleep(RETRY_DELAY_MS * attempt);
    }

    try {
      const json = await callMinimaxApi(params);

      // Validate API-level status
      if (
        json.base_resp &&
        json.base_resp.status_code !== 0
      ) {
        throw new Error(
          `MiniMax API error ${json.base_resp.status_code}: ${json.base_resp.status_msg}`
        );
      }

      const hexAudio = json.data?.audio;
      if (!hexAudio || hexAudio.length === 0) {
        throw new Error(
          "MiniMax returned an empty audio payload. Check prompt/lyrics constraints."
        );
      }

      const rawMp3Path = await hexToTempMp3(hexAudio);
      const reportedDuration = json.data?.music_duration ?? 0;

      console.log(
        `[minimax] ✓ Generated audio → ${rawMp3Path} (~${reportedDuration}s)`
      );

      return { rawMp3Path, reportedDuration };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[minimax] Attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  throw new Error(
    `MiniMax generation failed after ${MAX_RETRIES + 1} attempts. Last: ${lastError?.message}`
  );
}
