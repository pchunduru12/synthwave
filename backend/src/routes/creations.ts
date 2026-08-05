import fs from 'node:fs';
import os from 'node:os';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { creationSchema } from '../lib/validators.js';
import type { CreationInput } from '../domain/types.js';
import {
  cancelCreation,
  createCreation,
  estimateOnly,
  getCreation,
  listCreations,
} from '../services/creation-service.js';

export const creationsRouter = Router();

creationsRouter.use(authMiddleware);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WEBP images are accepted'));
    }
  },
});

creationsRouter.post('/estimate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = creationSchema.parse(req.body) as CreationInput;
    const estimate = estimateOnly(input);
    res.json(estimate);
  } catch (error) {
    next(error);
  }
});

creationsRouter.post(
  '/',
  upload.single('coverImage'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = req.is('multipart/form-data') ? parseFormFields(req.body) : req.body;
      const input = creationSchema.parse(rawBody) as CreationInput;
      const user = (req as any).user;

      const creation = createCreation(
        user,
        input,
        req.file
          ? {
              path: req.file.path,
              mimeType: req.file.mimetype,
              originalName: req.file.originalname,
              size: req.file.size,
            }
          : undefined,
      );

      res.status(202).json({
        creationId: creation.id,
        status: creation.status,
        estimatedCostUsd: creation.estimatedCostUsd,
      });
    } catch (error) {
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      next(error);
    }
  },
);

creationsRouter.get('/', (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ creations: listCreations(user.id) });
});

creationsRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const creationId = getRouteParam(req.params.id, 'id');
    res.json(getCreation(user.id, creationId));
  } catch (error) {
    next(error);
  }
});

creationsRouter.get('/:id/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const creationId = getRouteParam(req.params.id, 'id');
    const creation = getCreation(user.id, creationId);

    res.json({
      id: creation.id,
      status: creation.status,
      songTitle: creation.songTitle,
      artistPersona: creation.artistPersona,
      detectedIntent: creation.detectedIntent,
      detectedSubject: creation.detectedSubject,
      styleNotes: creation.styleNotes,
      lyricsText: creation.lyricsText,
      sunoPrompt: creation.sunoPrompt,
      imagePrompt: creation.imagePrompt,
      coverArtUrl: creation.coverArtUrl,
      backgroundPreviewUrl: creation.backgroundPreviewUrl,
      audioUrl: creation.audioUrl,
      videoUrl: creation.videoUrl,
      artifacts: creation.artifacts,
      estimatedCostUsd: creation.estimatedCostUsd,
      actualCostUsd: creation.actualCostUsd,
      errorMessage: creation.errorMessage,
      pipelineStages: creation.pipelineStages,
    });
  } catch (error) {
    next(error);
  }
});

creationsRouter.post('/:id/cancel', (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const creationId = getRouteParam(req.params.id, 'id');
    const creation = cancelCreation(user.id, creationId);

    res.json({
      id: creation.id,
      status: creation.status,
    });
  } catch (error) {
    next(error);
  }
});

function parseFormFields(body: Record<string, string>) {
  return {
    ...body,
    duration: body.duration !== undefined ? Number(body.duration) : undefined,
  };
}

function getRouteParam(value: string | string[] | undefined, name: string) {
  if (Array.isArray(value)) return value[0];
  if (!value) throw new Error(`Missing route parameter: ${name}`);
  return value;
}