import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory
} from '../../src/shared/history';

describe('history', () => {
  it('commits undo stack and clears redo stack', () => {
    let history = createHistory(1);
    history = commitHistory(history, 2);
    history = commitHistory(history, 3);

    expect(history.present).toBe(3);
    expect(history.past).toEqual([1, 2]);
    expect(history.future).toEqual([]);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);
  });

  it('supports undo then redo', () => {
    let history = createHistory('a');
    history = commitHistory(history, 'b');
    history = commitHistory(history, 'c');

    history = undoHistory(history);
    expect(history.present).toBe('b');
    expect(history.future).toEqual(['c']);

    history = redoHistory(history);
    expect(history.present).toBe('c');
    expect(history.future).toEqual([]);
  });

  it('ignores commit when present is unchanged', () => {
    const initial = { value: 1 };
    let history = createHistory(initial);
    history = commitHistory(history, initial);

    expect(history.past).toEqual([]);
    expect(history.present).toBe(initial);
  });
});
