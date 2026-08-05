// backend/src/services/admin-service.ts — drop-in replacement
//
// Admin operations for the SynthWave beta:
//   - Manage the runtime invite-email allowlist.
//   - Disable / re-enable users.
//   - Aggregate per-user spend and token stats.
//   - Let admins inspect and delete stored user-generated creations/artifacts.

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { memoryStore, persistMemoryStore } from '../data/memory-store.js';
import { Creation, User } from '../domain/types.js';

const ADMIN_DIR = path.join(env.storageDir, 'admin');
const INVITES_FILE = path.join(ADMIN_DIR, 'invites.json');
const DISABLED_FILE = path.join(ADMIN_DIR, 'disabled-users.json');

let invitesCache: Set<string> | null = null;
let disabledCache: Set<string> | null = null;

function ensureAdminDir() {
  fs.mkdirSync(ADMIN_DIR, { recursive: true });
}

function loadInvites(): Set<string> {
  if (invitesCache) return invitesCache;
  ensureAdminDir();

  let fromFile: string[] = [];
  if (fs.existsSync(INVITES_FILE)) {
    try {
      const raw = fs.readFileSync(INVITES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        fromFile = parsed
          .filter((x) => typeof x === 'string')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
      }
    } catch (err) {
      console.warn('[admin] failed to read invites.json, using env seed only:', err);
    }
  }

  const merged = new Set<string>([...fromFile, ...env.inviteEmails]);
  invitesCache = merged;

  if (merged.size !== fromFile.length) {
    persistInvites();
  }

  return invitesCache;
}

function persistInvites() {
  if (!invitesCache) return;
  ensureAdminDir();
  const arr = [...invitesCache].sort();
  fs.writeFileSync(INVITES_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

function loadDisabled(): Set<string> {
  if (disabledCache) return disabledCache;
  ensureAdminDir();

  let arr: string[] = [];
  if (fs.existsSync(DISABLED_FILE)) {
    try {
      const raw = fs.readFileSync(DISABLED_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        arr = parsed.filter((x) => typeof x === 'string');
      }
    } catch (err) {
      console.warn('[admin] failed to read disabled-users.json, treating as empty:', err);
    }
  }
  disabledCache = new Set(arr);
  return disabledCache;
}

function persistDisabled() {
  if (!disabledCache) return;
  ensureAdminDir();
  const arr = [...disabledCache].sort();
  fs.writeFileSync(DISABLED_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

export function isEmailInvited(email: string): boolean {
  const allowList = loadInvites();
  if (allowList.size === 0) return true;
  return allowList.has(email.toLowerCase());
}

export function isAdminEmail(email: string): boolean {
  return env.adminEmails.includes(email.toLowerCase());
}

export function isUserDisabled(userId: string): boolean {
  return loadDisabled().has(userId);
}

export function listInvites(): string[] {
  return [...loadInvites()].sort();
}

export function addInvite(email: string): string[] {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) throw new Error('email is required');
  if (!cleaned.includes('@')) throw new Error('invalid email');

  const list = loadInvites();
  list.add(cleaned);
  persistInvites();
  return [...list].sort();
}

export function removeInvite(email: string): string[] {
  const cleaned = email.trim().toLowerCase();
  const list = loadInvites();
  list.delete(cleaned);
  persistInvites();
  return [...list].sort();
}

export function disableUser(userId: string): void {
  const set = loadDisabled();
  set.add(userId);
  persistDisabled();
}

export function enableUser(userId: string): void {
  const set = loadDisabled();
  set.delete(userId);
  persistDisabled();
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  plan: string;
  creditsRemaining: number;
  createdAt: string;
  disabled: boolean;
  isAdmin: boolean;
  creationCount: number;
  totalSpentUsd: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AdminCreationRow extends Creation {
  owner: {
    id: string;
    email: string;
    displayName: string;
    plan: string;
  } | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  storageBytes: number;
}

export function listUsers(): AdminUserRow[] {
  const disabled = loadDisabled();

  const counts = new Map<string, number>();
  for (const creation of memoryStore.creations.values()) {
    counts.set(creation.userId, (counts.get(creation.userId) || 0) + 1);
  }

  const spend = new Map<string, number>();
  const tokens = new Map<string, { inputTokens: number; outputTokens: number; totalTokens: number }>();

  for (const event of memoryStore.usageEvents) {
    if (event.category !== 'reserve' && event.category !== 'refund') {
      spend.set(event.userId, (spend.get(event.userId) || 0) + (event.costUsd || 0));
    }

    const inputTokens = event.inputTokens || 0;
    const outputTokens = event.outputTokens || 0;
    const totalTokens = event.totalTokens || inputTokens + outputTokens;

    if (inputTokens || outputTokens || totalTokens) {
      const existing = tokens.get(event.userId) || {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += totalTokens;
      tokens.set(event.userId, existing);
    }
  }

  const rows: AdminUserRow[] = [];
  for (const user of memoryStore.users.values()) {
    const userTokens = tokens.get(user.id) || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    rows.push({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan,
      creditsRemaining: user.creditsRemaining,
      createdAt: user.createdAt,
      disabled: disabled.has(user.id),
      isAdmin: isAdminEmail(user.email),
      creationCount: counts.get(user.id) || 0,
      totalSpentUsd: round4(spend.get(user.id) || 0),
      inputTokens: userTokens.inputTokens,
      outputTokens: userTokens.outputTokens,
      totalTokens: userTokens.totalTokens,
    });
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

export function findUserById(userId: string): User | undefined {
  return memoryStore.users.get(userId);
}

export function listAdminCreations(): AdminCreationRow[] {
  return [...memoryStore.creations.values()]
    .map(enrichCreationForAdmin)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAdminCreation(creationId: string): AdminCreationRow | undefined {
  const creation = memoryStore.creations.get(creationId);
  if (!creation) return undefined;
  return enrichCreationForAdmin(creation);
}

export function deleteAdminCreation(creationId: string): boolean {
  const creation = memoryStore.creations.get(creationId);
  if (!creation) return false;

  memoryStore.creations.delete(creationId);

  const artifactDir = path.join(env.storageDir, creationId);
  try {
    fs.rmSync(artifactDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('[admin] failed to remove artifact directory:', artifactDir, error);
  }

  // Keep usageEvents as audit history for token/spend reporting, but remove the
  // creation row and its files so storage cost is stopped immediately.
  persistMemoryStore();
  return true;
}

function enrichCreationForAdmin(creation: Creation): AdminCreationRow {
  const owner = memoryStore.users.get(creation.userId);
  const inputTokens = creation.pipelineStages?.reduce(
    (sum, stage) => sum + (stage.usage?.inputTokens || 0),
    0,
  ) || 0;
  const outputTokens = creation.pipelineStages?.reduce(
    (sum, stage) => sum + (stage.usage?.outputTokens || 0),
    0,
  ) || 0;
  const totalTokens = creation.pipelineStages?.reduce((sum, stage) => {
    const usage = stage.usage;
    if (!usage) return sum;
    return sum + (usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0));
  }, 0) || 0;

  return {
    ...creation,
    owner: owner
      ? {
          id: owner.id,
          email: owner.email,
          displayName: owner.displayName,
          plan: owner.plan,
        }
      : null,
    inputTokens,
    outputTokens,
    totalTokens,
    storageBytes: getDirectorySizeBytes(path.join(env.storageDir, creation.id)),
  };
}

function getDirectorySizeBytes(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) return 0;

    let total = 0;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirectorySizeBytes(fullPath);
      } else if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
