export type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

export function createHistory<T>(initial: T): HistoryState<T> {
  return {
    past: [],
    present: initial,
    future: []
  };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}

export function commitHistory<T>(
  history: HistoryState<T>,
  nextPresent: T,
  maxPast = 100
): HistoryState<T> {
  if (Object.is(nextPresent, history.present)) {
    return history;
  }

  const nextPast =
    history.past.length >= maxPast
      ? [...history.past.slice(1), history.present]
      : [...history.past, history.present];

  return {
    past: nextPast,
    present: nextPresent,
    future: []
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (!canUndo(history)) return history;

  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (!canRedo(history)) return history;

  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1)
  };
}
