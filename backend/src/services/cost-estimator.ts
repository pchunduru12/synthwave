import { CostEstimate, CreationInput, Mode } from '../domain/types.js';
import { getStageRoute } from './provider-router.js';

const TEXT_BASE: Record<Mode, number> = {
  economy: 0.004,
  balanced: 0.010,
  premium: 0.028,
};

const AUDIO_PER_SECOND: Record<Mode, number> = {
  economy: 0.0014,
  balanced: 0.0018,
  premium: 0.0024,
};

const IMAGE_BASE: Record<Mode, number> = {
  economy: 0.010,
  balanced: 0.020,
  premium: 0.030,
};

const VIDEO_PER_SECOND: Record<Mode, number> = {
  economy: 0.0005,
  balanced: 0.0008,
  premium: 0.0012,
};

export function estimateCreationCost(input: CreationInput): CostEstimate {
  const prompt = {
    id: 'prompt' as const,
    provider: getStageRoute(input.mode, 'prompt').provider,
    model: getStageRoute(input.mode, 'prompt').model,
    estimatedCostUsd: roundUsd(TEXT_BASE[input.mode] * 0.35),
  };
  const lyrics = {
    id: 'lyrics' as const,
    provider: getStageRoute(input.mode, 'lyrics').provider,
    model: getStageRoute(input.mode, 'lyrics').model,
    estimatedCostUsd: roundUsd(TEXT_BASE[input.mode] * 0.65),
  };
  const music = {
    id: 'music' as const,
    provider: getStageRoute(input.mode, 'music').provider,
    model: getStageRoute(input.mode, 'music').model,
    estimatedCostUsd: roundUsd(input.duration * AUDIO_PER_SECOND[input.mode]),
  };
  const image = {
    id: 'image' as const,
    provider: getStageRoute(input.mode, 'image').provider,
    model: getStageRoute(input.mode, 'image').model,
    estimatedCostUsd: roundUsd(IMAGE_BASE[input.mode]),
  };
  const video = {
    id: 'video' as const,
    provider: getStageRoute(input.mode, 'video').provider,
    model: getStageRoute(input.mode, 'video').model,
    estimatedCostUsd: roundUsd(input.duration * VIDEO_PER_SECOND[input.mode]),
  };

  const stages = [prompt, lyrics, music, image, video];
  const totalUsd = roundUsd(stages.reduce((sum, item) => sum + item.estimatedCostUsd, 0));

  return { totalUsd, stages };
}

function roundUsd(value: number) {
  return Math.round(value * 10000) / 10000;
}
