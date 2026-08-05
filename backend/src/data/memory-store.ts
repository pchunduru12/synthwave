// backend/src/data/memory-store.ts — drop-in replacement
import { BudgetSettings, Creation, UsageEvent, User } from '../domain/types.js';
import { loadSnapshot, persistSnapshot } from './sqlite-store.js';

const snapshot = loadSnapshot();

export const memoryStore = {
  users: snapshot.users as Map<string, User>,
  creations: snapshot.creations as Map<string, Creation>,
  refreshTokens: new Map<string, string>(),
  budgets: snapshot.budgets as Map<string, BudgetSettings>,
  usageEvents: snapshot.usageEvents as UsageEvent[],
};

export function seedDefaults(defaultBudget: BudgetSettings) {
  let changed = false;
  for (const user of memoryStore.users.values()) {
    if (!memoryStore.budgets.has(user.id)) {
      memoryStore.budgets.set(user.id, { ...defaultBudget });
      changed = true;
    }
  }
  if (changed) persistMemoryStore();
}

/**
 * Mark any creations stuck in 'pending' or 'processing' as 'failed'.
 * Called once at startup. The pipeline runs in-process via setImmediate,
 * so a process restart kills any in-flight job — without this, the row
 * stays "processing" forever and the UI polls into the void.
 */
export function reapInterruptedCreations() {
  let reaped = 0;
  const now = new Date().toISOString();
  for (const creation of memoryStore.creations.values()) {
    if (creation.status === 'pending' || creation.status === 'processing') {
      creation.status = 'failed';
      creation.errorMessage = 'Job interrupted by server restart. Please try creating again.';
      creation.updatedAt = now;
      reaped++;
    }
  }
  if (reaped > 0) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      t: now, lvl: 'info', msg: 'reaped_stuck_creations', count: reaped,
    }));
    persistMemoryStore();
  }
}

export function persistMemoryStore() {
  persistSnapshot({
    users: memoryStore.users,
    budgets: memoryStore.budgets,
    creations: memoryStore.creations,
    usageEvents: memoryStore.usageEvents,
  });
}
