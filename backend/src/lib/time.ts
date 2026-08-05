export const nowIso = () => new Date().toISOString();

export function sameUtcDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10);
}

export function sameUtcMonth(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
