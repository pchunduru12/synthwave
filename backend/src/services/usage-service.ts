import { nanoid } from 'nanoid';
import { BudgetSettings, UsageEvent } from '../domain/types.js';
import { memoryStore, persistMemoryStore } from '../data/memory-store.js';
import { env } from '../config/env.js';
import { nowIso, sameUtcDay, sameUtcMonth } from '../lib/time.js';
import { HttpError } from '../lib/http-errors.js';

export function getBudgetSettings(userId: string): BudgetSettings {
  return (
    memoryStore.budgets.get(userId) || {
      dailySoftLimitUsd: env.dailySoftLimitUsd,
      dailyHardLimitUsd: env.dailyHardLimitUsd,
      monthlyHardLimitUsd: env.monthlyHardLimitUsd,
    }
  );
}

export function patchBudgetSettings(userId: string, patch: Partial<BudgetSettings>) {
  const next = { ...getBudgetSettings(userId), ...patch };
  memoryStore.budgets.set(userId, next);
  persistMemoryStore();
  return next;
}

export function recordUsage(event: Omit<UsageEvent, 'id' | 'createdAt'>) {
  const usageEvent: UsageEvent = {
    id: nanoid(),
    createdAt: nowIso(),
    ...event,
  };
  memoryStore.usageEvents.unshift(usageEvent);
  persistMemoryStore();
  return usageEvent;
}

export function getUsageSummary(userId: string) {
  const current = nowIso();
  const daily = memoryStore.usageEvents
    .filter((event) => event.userId === userId && sameUtcDay(event.createdAt, current))
    .reduce((sum, event) => sum + event.costUsd, 0);

  const monthly = memoryStore.usageEvents
    .filter((event) => event.userId === userId && sameUtcMonth(event.createdAt, current))
    .reduce((sum, event) => sum + event.costUsd, 0);

  const events = memoryStore.usageEvents.filter((event) => event.userId === userId).slice(0, 50);
  const budgets = getBudgetSettings(userId);

  return {
    dailyUsd: roundUsd(daily),
    monthlyUsd: roundUsd(monthly),
    budgets,
    softLimitReached: daily >= budgets.dailySoftLimitUsd,
    hardLimitReached: daily >= budgets.dailyHardLimitUsd || monthly >= budgets.monthlyHardLimitUsd,
    events,
  };
}

export function assertBudgetAllowsReserve(userId: string, reserveUsd: number) {
  const summary = getUsageSummary(userId);
  const projectedDaily = summary.dailyUsd + reserveUsd;
  const projectedMonthly = summary.monthlyUsd + reserveUsd;

  if (projectedDaily > summary.budgets.dailyHardLimitUsd) {
    throw new HttpError(422, 'daily_hard_budget_exceeded');
  }
  if (projectedMonthly > summary.budgets.monthlyHardLimitUsd) {
    throw new HttpError(422, 'monthly_hard_budget_exceeded');
  }
}

function roundUsd(value: number) {
  return Math.round(value * 10000) / 10000;
}
