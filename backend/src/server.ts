// backend/src/server.ts — drop-in replacement
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

// eslint-disable-next-line no-console
console.log(JSON.stringify({
  t: new Date().toISOString(),
  lvl: 'info',
  msg: 'startup',
  nodeEnv: env.nodeEnv,
  port: env.port,
  mockProviders: env.enableMockProviders,
  hasOpenAiKey: !!env.openAiApiKey,
  openAiTextModel: env.openAiTextModel,
  openAiImageModel: env.openAiImageModel,
  storageDir: env.storageDir,
  corsOrigins: env.corsOrigins.length ? env.corsOrigins : (env.webOrigin ? [env.webOrigin] : 'dev:any'),
  inviteOnly: env.inviteEmails.length > 0,
}));

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`SynthWave backend listening on http://localhost:${env.port}`);
});

// Graceful shutdown — let in-flight requests finish, then exit.
// Critical for Docker so the container actually stops on `docker stop`.
function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl: 'info', msg: 'shutdown', signal }));
  server.close((err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error('shutdown error', err);
      process.exit(1);
    }
    process.exit(0);
  });
  // Hard timeout: if something hangs, don't wait forever.
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('shutdown timeout, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', msg: 'unhandledRejection', reason: String(reason) }));
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', msg: 'uncaughtException', err: String(err) }));
  // Don't exit — let the process supervisor (Docker) decide if it's terminal.
});
