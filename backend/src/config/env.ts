// backend/src/config/env.ts — drop-in replacement
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const defaultStorageDir = process.env.STORAGE_DIR || path.join(rootDir, 'storage');

// SECURITY: files that must never be publicly served (DB, admin lists) live here,
// OUTSIDE the publicly-served STORAGE_DIR. Override with PRIVATE_DIR.
const defaultPrivateDir = process.env.PRIVATE_DIR || path.join(rootDir, 'private');
fs.mkdirSync(defaultPrivateDir, { recursive: true });

// One-time migration: older installs kept the SQLite DB inside STORAGE_DIR
// (publicly served!). If the old default file exists and the new one doesn't, move it.
const legacyDbPath = path.join(defaultStorageDir, 'synthwave.db');
const newDefaultDbPath = path.join(defaultPrivateDir, 'synthwave.db');
if (!process.env.SQLITE_DB_PATH && fs.existsSync(legacyDbPath) && !fs.existsSync(newDefaultDbPath)) {
  fs.renameSync(legacyDbPath, newDefaultDbPath);
  // eslint-disable-next-line no-console
  console.warn(`[migrate] moved SQLite DB out of the public storage dir: ${legacyDbPath} -> ${newDefaultDbPath}`);
}

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, value: string | undefined, minLength = 1): string {
  if (!value || value.length < minLength) {
    if (isProd) {
      // eslint-disable-next-line no-console
      console.error(`[fatal] env ${name} missing or too short (need >= ${minLength} chars). Refusing to start.`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.warn(`[warn] env ${name} missing — using insecure default. NEVER do this in prod.`);
    return value || '';
  }
  return value;
}

const jwtSecretRaw = process.env.JWT_SECRET;
// In prod we demand 32+ chars (an honest random secret). In dev we allow the docs default
// but log loudly so you don't ship it.
if (isProd && (!jwtSecretRaw || jwtSecretRaw.length < 32 || jwtSecretRaw === 'change-me' || jwtSecretRaw === 'replace-with-a-strong-secret')) {
  // eslint-disable-next-line no-console
  console.error('[fatal] JWT_SECRET must be at least 32 random characters in production. Generate with: openssl rand -hex 32');
  process.exit(1);
}

// Image model resolution.
//
// We keep TWO model slots because the cost/quality tradeoff is different:
//   - Generate path (no user upload): output gets composited into a 720x720
//     H.264 video under a watermark. Detail loss is unavoidable. gpt-image-1-mini
//     at low quality is fine and ~8x cheaper.
//   - Edit path (user uploaded photo): identity preservation matters. Don't
//     downgrade the model here without an A/B comparison.
//
// If OPENAI_IMAGE_EDIT_MODEL is unset, edit calls fall back to OPENAI_IMAGE_MODEL.
const openAiImageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';
const openAiImageEditModel = process.env.OPENAI_IMAGE_EDIT_MODEL || openAiImageModel;
const openAiImageQuality = (process.env.OPENAI_IMAGE_QUALITY || 'low') as 'low' | 'medium' | 'high' | 'auto';
const openAiImageOutputFormat = (process.env.OPENAI_IMAGE_OUTPUT_FORMAT || 'jpeg') as 'png' | 'jpeg' | 'webp';
const openAiImageOutputCompression = Math.max(
  0,
  Math.min(100, Number(process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || 65)),
);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 3000),

  // Auth
  jwtSecret: jwtSecretRaw || 'dev-only-insecure-secret',
  jwtTtl: process.env.JWT_TTL || '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  // URLs
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  webOrigin: process.env.WEB_ORIGIN || '', // empty = allow none in prod, allow * in dev
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),

  // Budgets (defaults; per-user budgets stored in DB override these)
  dailySoftLimitUsd: Number(process.env.DEFAULT_DAILY_SOFT_LIMIT_USD || 3),
  dailyHardLimitUsd: Number(process.env.DEFAULT_DAILY_HARD_LIMIT_USD || 8),
  monthlyHardLimitUsd: Number(process.env.DEFAULT_MONTHLY_HARD_LIMIT_USD || 50),

  // Persistence
  storageDir: defaultStorageDir,
  privateDir: defaultPrivateDir,
  sqliteDbPath: process.env.SQLITE_DB_PATH || path.join(defaultPrivateDir, 'synthwave.db'),

  // Registration policy. SECURITY: an empty invite list now REJECTS everyone
  // (fail closed). Set ALLOW_OPEN_REGISTRATION=true only if you intentionally
  // want public sign-ups.
  allowOpenRegistration: String(process.env.ALLOW_OPEN_REGISTRATION || 'false').toLowerCase() === 'true',

  // Pipeline
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  maxConcurrentCreations: Number(process.env.MAX_CONCURRENT_CREATIONS || 2),

  // Providers
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiTextModel: process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini',
  openAiImageModel,
  openAiImageEditModel,
  openAiImageQuality,
  openAiImageOutputFormat,
  openAiImageOutputCompression,
  enableMockProviders: String(process.env.ENABLE_MOCK_PROVIDERS || 'true').toLowerCase() !== 'false',
  sunoEnabled: String(process.env.SUNO_ENABLED || 'false').toLowerCase() === 'true',
  sunoApiBaseUrl: process.env.SUNO_API_BASE_URL || '',
  sunoApiKey: process.env.SUNO_API_KEY || '',
  minimaxApiKey: process.env.MINIMAX_API_KEY || '',
  audioProvider: (process.env.AUDIO_PROVIDER || 'suno') as 'suno' | 'minimax',

  // Beta gating (whitelist of emails that may register; empty = open registration).
  // Note: this is the BOOT-TIME seed only — at runtime the live allowlist is
  // managed by admin-service (file-backed at $STORAGE_DIR/admin/invites.json).
  // The boot value is merged into the live list on first start, then ignored.
  inviteEmails: (process.env.INVITE_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  // Admin gating: emails in this list can access /v1/admin/* endpoints.
  // Empty = no admins, admin UI is inaccessible (intended for dev).
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  // Rate limits (per IP)
  rlAuthPerMin: Number(process.env.RL_AUTH_PER_MIN || 10),
  rlCreatePerHour: Number(process.env.RL_CREATE_PER_HOUR || 30),
  rlGlobalPerMin: Number(process.env.RL_GLOBAL_PER_MIN || 120),

  // Watermark
  watermarkPath: process.env.WATERMARK_PATH || '/app/assets/watermark.png',
};

// Don't crash dev, but make it easy to spot accidental misconfig.
if (env.isProd && env.corsOrigins.length === 0 && !env.webOrigin) {
  // eslint-disable-next-line no-console
  console.warn('[warn] No WEB_ORIGIN or CORS_ORIGINS set in production — API will reject all browser requests.');
}

// SECURITY startup guard: refuse to run if the SQLite DB resolves inside the
// publicly-served storage directory (it would be downloadable at /artifacts/...).
{
  const dbResolved = path.resolve(env.sqliteDbPath);
  const storageResolved = path.resolve(env.storageDir) + path.sep;
  if (dbResolved.startsWith(storageResolved)) {
    // eslint-disable-next-line no-console
    console.error(`[fatal] SQLITE_DB_PATH (${dbResolved}) is inside the public STORAGE_DIR (${storageResolved}). Move it (e.g. PRIVATE_DIR) — refusing to start.`);
    process.exit(1);
  }
}
