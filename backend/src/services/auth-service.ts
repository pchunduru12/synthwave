// backend/src/services/auth-service.ts — drop-in replacement
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { memoryStore, persistMemoryStore } from '../data/memory-store.js';
import { User } from '../domain/types.js';
import { HttpError } from '../lib/http-errors.js';
import { nowIso } from '../lib/time.js';
import { isAdminEmail, isEmailInvited, isUserDisabled } from './admin-service.js';

export async function registerUser(input: { email: string; password: string; displayName: string }) {
  const email = input.email.toLowerCase();

  // Beta invite gating. Empty allowlist = open registration.
  // The allowlist is now managed at runtime via the admin UI; admin-service
  // handles loading/persistence.
  if (!isEmailInvited(email)) {
    throw new HttpError(403, 'invite_required');
  }

  const existing = [...memoryStore.users.values()].find((user) => user.email === email);
  if (existing) {
    throw new HttpError(409, 'email_already_exists');
  }

  const user: User = {
    id: nanoid(),
    email,
    passwordHash: await bcrypt.hash(input.password, env.bcryptRounds),
    displayName: input.displayName,
    plan: 'free',
    creditsRemaining: 3,
    createdAt: nowIso(),
  };

  memoryStore.users.set(user.id, user);
  persistMemoryStore();
  return buildAuthResponse(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.toLowerCase();
  const user = [...memoryStore.users.values()].find((item) => item.email === email);
  if (!user) throw new HttpError(401, 'invalid_credentials');

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new HttpError(401, 'invalid_credentials');

  // Block disabled (soft-revoked) users at login.
  if (isUserDisabled(user.id)) {
    throw new HttpError(403, 'account_disabled');
  }

  return buildAuthResponse(user);
}

export function authenticateToken(token: string) {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const user = memoryStore.users.get(payload.sub);
    if (!user) throw new HttpError(401, 'invalid_token');

    // Disabled users can't use existing tokens either. Without this check
    // a revoked user could continue acting until their JWT expires.
    if (isUserDisabled(user.id)) throw new HttpError(403, 'account_disabled');

    return user;
  } catch (err) {
    // Re-throw HttpErrors (account_disabled), wrap everything else as 401.
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'invalid_token');
  }
}

function buildAuthResponse(user: User) {
  const opts: SignOptions = { expiresIn: env.jwtTtl as SignOptions['expiresIn'] };
  const accessToken = jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, opts);
  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan,
      creditsRemaining: user.creditsRemaining,
      isAdmin: isAdminEmail(user.email),
    },
  };
}
