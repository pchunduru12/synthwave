import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { CreationArtifact } from '../domain/types.js';

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function creationArtifactDir(creationId: string) {
  const dir = path.join(env.storageDir, creationId);
  ensureDir(dir);
  return dir;
}

export function writeTextArtifact(creationId: string, filename: string, contents: string) {
  const filePath = path.join(creationArtifactDir(creationId), filename);
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export function writeJsonArtifact(creationId: string, filename: string, data: unknown) {
  return writeTextArtifact(creationId, filename, JSON.stringify(data, null, 2));
}

export function writeBufferArtifact(creationId: string, filename: string, buffer: Buffer) {
  const filePath = path.join(creationArtifactDir(creationId), filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function artifactUrl(creationId: string, filename: string) {
  return `${env.apiBaseUrl}/artifacts/${creationId}/${filename}`;
}

export function upsertArtifact(artifacts: CreationArtifact[] | undefined, artifact: CreationArtifact) {
  const next = artifacts ? [...artifacts] : [];
  const existingIndex = next.findIndex((item) => item.key === artifact.key);
  if (existingIndex >= 0) next.splice(existingIndex, 1, artifact);
  else next.push(artifact);
  return next;
}
