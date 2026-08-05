import { Mode, StageId } from '../domain/types.js';

export interface ProviderRoute {
  provider: 'google' | 'openai' | 'anthropic' | 'suno' | 'local';
  model: string;
}

const TEXT_ROUTING: Record<Mode, Record<'normalize' | 'lyrics' | 'packaging', ProviderRoute>> = {
  economy: {
    normalize: { provider: 'openai', model: 'gpt-4.1-mini' },
    lyrics: { provider: 'openai', model: 'gpt-4.1-mini' },
    packaging: { provider: 'openai', model: 'gpt-4.1-mini' },
  },
  balanced: {
    normalize: { provider: 'openai', model: 'gpt-4.1-mini' },
    lyrics: { provider: 'openai', model: 'gpt-4.1-mini' },
    packaging: { provider: 'openai', model: 'gpt-4.1-mini' },
  },
  premium: {
    normalize: { provider: 'openai', model: 'gpt-4.1' },
    lyrics: { provider: 'openai', model: 'gpt-4.1' },
    packaging: { provider: 'openai', model: 'gpt-4.1' },
  },
};

export function getStageRoute(mode: Mode, stageId: StageId): ProviderRoute {
  if (stageId === 'prompt') return TEXT_ROUTING[mode].normalize;
  if (stageId === 'lyrics') return TEXT_ROUTING[mode].lyrics;
  if (stageId === 'music') return { provider: 'suno', model: 'suno-adapter' };
  if (stageId === 'image') return { provider: 'openai', model: 'gpt-image-1' };
  return { provider: 'local', model: 'ffmpeg-renderer' };
}
