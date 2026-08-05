import { z } from 'zod';

export const THEMES = ['love','adventure','melancholy','celebration','spiritual','rebellion','nostalgia','nature','urban','fantasy','heartbreak','hope'] as const;
export const GENRES = ['pop','hiphop','rock','classical','jazz','edm','rnb','country','indie','metal','folk','lofi'] as const;
export const LANGUAGES = ['English','Spanish','French','Hindi','Telugu','Tamil','Bengali','Marathi','Punjabi','Portuguese','Arabic','Japanese','Korean','Mandarin','German','Italian','Swahili'] as const;
export const MOODS = ['Uplifting','Dark','Dreamy','Aggressive','Romantic','Chill','Intense','Playful'] as const;
export const TEMPOS = ['Very Slow','Slow','Moderate','Fast','Very Fast'] as const;
export const MODES = ['economy', 'balanced', 'premium'] as const;
export const AUDIO_PROVIDERS = ['suno', 'minimax'] as const;
export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;

// Allow only the OpenAI image model families we currently support.
// This is a hard whitelist to prevent admins from passing arbitrary strings
// that hit the OpenAI API. If you add a new model later, append it here.
//
// Note on edit-model availability: the images.edit endpoint is gated
// separately from images.generate. Many accounts only have dall-e-2 enabled
// for edit, even when they have gpt-image-1 for generate. dall-e-2 is the
// safe default for OPENAI_IMAGE_EDIT_MODEL; gpt-image-1 will return a 400
// "Value must be 'dall-e-2'" error on accounts without edit access.
export const IMAGE_MODELS = [
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'dall-e-3',
  'dall-e-2',
] as const;

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128).regex(/[0-9!@#$%^&*]/, 'Must include a number or symbol'),
  displayName: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const creationSchema = z.object({
  theme: z.enum(THEMES),
  genre: z.enum(GENRES),
  language: z.enum(LANGUAGES),
  vocalist: z.enum(['female', 'male']),
  mood: z.enum(MOODS),
  tempo: z.enum(TEMPOS),
  duration: z.number().int().min(15).max(180),
  customPrompt: z.string().trim().max(300).optional(),
  mode: z.enum(MODES).default('balanced'),
  audioProvider: z.enum(AUDIO_PROVIDERS).optional(),
  // User-facing flag — anyone can opt in to burn lyrics into the video.
  burnLyrics: z.boolean().optional(),
  // Admin-only overrides — schema permits them, creation-service strips them
  // for non-admin users (same pattern as audioProvider). Whitelisted via
  // IMAGE_MODELS so admins can't smuggle arbitrary strings to OpenAI.
  imageModel: z.enum(IMAGE_MODELS).optional(),
  imageEditModel: z.enum(IMAGE_MODELS).optional(),
  imageQuality: z.enum(IMAGE_QUALITIES).optional(),
});

export const budgetPatchSchema = z.object({
  dailySoftLimitUsd: z.number().positive().max(200).optional(),
  dailyHardLimitUsd: z.number().positive().max(500).optional(),
  monthlyHardLimitUsd: z.number().positive().max(5000).optional(),
});
