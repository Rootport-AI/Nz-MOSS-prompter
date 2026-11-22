export const MAX_HISTORY = 100;
export const COALESCE_WINDOW_MS = 600;

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  lastCoalesceKey: string | null;
  lastCommitTime: number;
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return {
    past: [],
    present: initial,
    future: [],
    lastCoalesceKey: null,
    lastCommitTime: 0,
  };
}

export function pushHistory<T>(
  history: HistoryState<T>,
  next: T,
  options?: { coalesceKey?: string; now?: number },
): HistoryState<T> {
  const now = options?.now ?? Date.now();
  const key = options?.coalesceKey ?? null;
  const shouldCoalesce =
    key !== null &&
    key === history.lastCoalesceKey &&
    now - history.lastCommitTime <= COALESCE_WINDOW_MS &&
    history.past.length > 0;

  if (shouldCoalesce) {
    return {
      past: history.past,
      present: next,
      future: [],
      lastCoalesceKey: key,
      lastCommitTime: now,
    };
  }

  const nextPast = [...history.past, history.present];
  if (nextPast.length > MAX_HISTORY) {
    nextPast.splice(0, nextPast.length - MAX_HISTORY);
  }

  return {
    past: nextPast,
    present: next,
    future: [],
    lastCoalesceKey: key,
    lastCommitTime: now,
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastCoalesceKey: null,
    lastCommitTime: 0,
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    lastCoalesceKey: null,
    lastCommitTime: 0,
  };
}
