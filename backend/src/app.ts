// backend/src/app.ts — drop-in replacement
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import { env } from './config/env.js';
import { seedDefaults, reapInterruptedCreations } from './data/memory-store.js';
import { requestIdMiddleware } from './lib/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';
import { creationsRouter } from './routes/creations.js';
import { healthRouter } from './routes/health.js';
import { usageRouter } from './routes/usage.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  seedDefaults({
    dailySoftLimitUsd: env.dailySoftLimitUsd,
    dailyHardLimitUsd: env.dailyHardLimitUsd,
    monthlyHardLimitUsd: env.monthlyHardLimitUsd,
  });

  // Reap any creations stuck in 'processing' from a previous boot.
  // The pipeline runs in-process, so a restart kills any in-flight job.
  // Mark them failed so the UI doesn't poll forever on a dead row.
  reapInterruptedCreations();

  fs.mkdirSync(env.storageDir, { recursive: true });

  const app = express();

  // Trust the reverse proxy (Caddy) so req.ip uses X-Forwarded-For.
  // 1 = trust the first hop only — exactly what we want behind Caddy.
  app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: false,
    // CSP would break the web bundle's inline styles; leave it off and rely on Caddy.
    contentSecurityPolicy: false,
  }));

  // CORS: in dev, allow anything (Expo dev server runs on a random port).
  // In prod, allow only the configured web origin(s).
  const corsAllowList = env.corsOrigins.length > 0
    ? env.corsOrigins
    : env.webOrigin
      ? [env.webOrigin]
      : [];

  app.use(cors({
    origin: env.isProd
      ? (origin, cb) => {
          // No Origin header (server-to-server, curl) → allow.
          if (!origin) return cb(null, true);
          if (corsAllowList.includes(origin)) return cb(null, true);
          return cb(new Error(`Origin ${origin} not allowed`));
        }
      : true, // dev: reflect any origin
    credentials: false,
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(requestIdMiddleware);

  // Tiny structured access log. Avoids pulling in morgan/pino just for this.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const reqId = (req as any).requestId || '-';
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        t: new Date().toISOString(),
        lvl: 'info',
        reqId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms,
        ip: req.ip,
      }));
    });
    next();
  });

  // Global gentle rate limit — catches accidental loops, scrapers.
  app.use(rateLimit({
    windowMs: 60_000,
    limit: env.rlGlobalPerMin,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  }));

  // Stricter limits on the expensive / abuse-prone endpoints.
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.rlAuthPerMin,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many auth attempts. Try again in a minute.' },
  });

  const createLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: env.rlCreatePerHour,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Hourly creation limit reached.' },
  });

  // Static artifact serving. We allow CORS here too because the web app fetches them via <img>/<audio>/<video>.
  app.use('/artifacts', express.static(env.storageDir, {
    setHeaders: (res) => {
      // Caddy will further restrict via CORS headers if needed; be permissive here so media tags work.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');
    },
  }));

  app.use(healthRouter);
  app.use('/v1/auth', authLimiter, authRouter);

  // Apply createLimiter only to POST /v1/creations (the expensive endpoint).
  // GETs (list, status) are cheap and frequently polled, so they ride the global limiter.
  app.use('/v1/creations', (req, res, next) => {
    if (req.method === 'POST' && (req.path === '/' || req.path === '')) {
      return createLimiter(req, res, next);
    }
    next();
  }, creationsRouter);

  app.use('/v1/usage', usageRouter);
  app.use('/v1/admin', adminRouter);

  // 404 fallthrough as JSON instead of Express's default HTML.
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.use(errorHandler);
  return app;
}
