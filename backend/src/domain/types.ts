export type Plan = 'free' | 'creator' | 'pro';
export type CreationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type Mode = 'economy' | 'balanced' | 'premium';
export type StageId = 'prompt' | 'lyrics' | 'music' | 'image' | 'video';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  plan: Plan;
  creditsRemaining: number;
  createdAt: string;
}

export interface BudgetSettings {
  dailySoftLimitUsd: number;
  dailyHardLimitUsd: number;
  monthlyHardLimitUsd: number;
}

export interface PipelineStage {
  id: StageId;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  detail: string;
  updatedAt: string;
  usage?: {
    provider?: string;
    model?: string;
    estimatedCostUsd?: number;
    actualCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

// Whitelist of OpenAI image models we accept from clients. Mirrors
// IMAGE_MODELS in validators.ts. Internal env-var values can be any string;
// this type only constrains the per-request override field.
export type ImageModelName =
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | 'dall-e-3'
  | 'dall-e-2';

export interface CreationInput {
  theme: string;
  genre: string;
  language: string;
  vocalist: 'female' | 'male';
  mood: string;
  tempo: string;
  duration: number;
  customPrompt?: string;
  mode: Mode;
  audioProvider?: 'suno' | 'minimax';
  // User-facing flag — anyone can opt in.
  burnLyrics?: boolean;
  // Admin-only overrides — silently ignored for non-admin users.
  imageModel?: ImageModelName;
  imageEditModel?: ImageModelName;
  imageQuality?: ImageQuality;
}

export interface CreationArtifact {
  key:
    | 'promptPackage'
    | 'lyrics'
    | 'lyricsSrt'
    | 'coverArt'
    | 'backgroundPreview'
    | 'audio'
    | 'video';
  label: string;
  url: string;
  mimeType: string;
}

export interface PromptPackage {
  title: string;
  artistPersona: string;
  detectedIntent: 'devotional' | 'romantic' | 'nature' | 'festival' | 'general';
  subject?: string;
  styleNotes: string[];
  sunoPrompt: string;
  imagePrompt: string;
  // Used when the user uploaded a reference photo. Focuses on scene/background/
  // mood — identity-preservation directives are added in image-service via the
  // strict-enhancement wrapper, not duplicated here.
  imageEditPrompt?: string;
  lyrics: string;
  // Latin-script romanization for video overlay when source script isn't Latin.
  // For Hindi/Devanagari we use Bollywood-popular style ("Radha Krishna,
  // tumhari jyoti se..."), not academic IAST/ITRANS.
  // Absent when language is already Latin-script (English, French, Spanish, etc.).
  lyricsRomanized?: string;
}

export interface Creation {
  id: string;
  userId: string;
  status: CreationStatus;
  input: CreationInput;
  songTitle?: string;
  artistPersona?: string;
  detectedIntent?: PromptPackage['detectedIntent'];
  detectedSubject?: string;
  styleNotes?: string[];
  lyricsText?: string;
  lyricsRomanized?: string;
  imagePrompt?: string;
  imageEditPrompt?: string;
  coverArtUrl?: string;
  backgroundPreviewUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  sunoPrompt?: string;
  artifacts?: CreationArtifact[];
  estimatedCostUsd: number;
  reservedCostUsd: number;
  actualCostUsd: number;
  pipelineStages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface UsageEvent {
  id: string;
  userId: string;
  creationId?: string;
  category: 'text' | 'audio' | 'image' | 'video' | 'reserve' | 'refund';
  provider: string;
  model: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  stageId?: StageId;
  createdAt: string;
}

export interface CostEstimate {
  totalUsd: number;
  stages: Array<{
    id: StageId;
    provider: string;
    model: string;
    estimatedCostUsd: number;
  }>;
}
