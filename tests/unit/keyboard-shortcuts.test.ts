import { describe, expect, it } from 'vitest';
import { getKeyboardShortcutAction } from '../../src/renderer/src/keyboard-navigation';

const emptyContext = {
  selectedNodeIds: [],
  selectedEdgeId: '',
  inEditor: false
};

describe('keyboard shortcut planner', () => {
  it('plans global document and history shortcuts even while editing text', () => {
    const inEditor = { ...emptyContext, inEditor: true };

    expect(getKeyboardShortcutAction({ key: 'z', ctrlKey: true }, inEditor)).toEqual({ type: 'undo' });
    expect(getKeyboardShortcutAction({ key: 'Z', metaKey: true, shiftKey: true }, inEditor)).toEqual({ type: 'redo' });
    expect(getKeyboardShortcutAction({ key: 'y', ctrlKey: true }, inEditor)).toEqual({ type: 'redo' });
    expect(getKeyboardShortcutAction({ key: 's', ctrlKey: true }, inEditor)).toEqual({
      type: 'save-document',
      saveAs: false
    });
    expect(getKeyboardShortcutAction({ key: 's', ctrlKey: true, shiftKey: true }, inEditor)).toEqual({
      type: 'save-document',
      saveAs: true
    });
    expect(getKeyboardShortcutAction({ key: '0', ctrlKey: true }, inEditor)).toEqual({ type: 'fit-canvas' });
    expect(getKeyboardShortcutAction({ key: 'n', ctrlKey: true }, inEditor)).toEqual({ type: 'new-document' });
    expect(getKeyboardShortcutAction({ key: 'o', ctrlKey: true }, inEditor)).toEqual({ type: 'open-document' });
  });

  it('ignores editing shortcuts while focus is inside an editor', () => {
    const inEditor = { selectedNodeIds: ['n1'], selectedEdgeId: 'e1', inEditor: true };

    expect(getKeyboardShortcutAction({ key: 'c', ctrlKey: true }, inEditor)).toBeNull();
    expect(getKeyboardShortcutAction({ key: 'Tab' }, inEditor)).toBeNull();
    expect(getKeyboardShortcutAction({ key: 'Delete' }, inEditor)).toBeNull();
    expect(getKeyboardShortcutAction({ key: ' ' }, inEditor)).toBeNull();
  });

  it('plans selection editing shortcuts based on selected node count', () => {
    const oneNode = { ...emptyContext, selectedNodeIds: ['n1'] };
    const twoNodes = { ...emptyContext, selectedNodeIds: ['n1', 'n2'] };

    expect(getKeyboardShortcutAction({ key: 'c', metaKey: true }, oneNode)).toEqual({ type: 'copy-selection' });
    expect(getKeyboardShortcutAction({ key: 'v', ctrlKey: true }, oneNode)).toEqual({ type: 'paste-selection' });
    expect(getKeyboardShortcutAction({ key: 'Tab' }, oneNode)).toEqual({ type: 'create-linked-node' });
    expect(getKeyboardShortcutAction({ key: 'Enter' }, oneNode)).toEqual({ type: 'create-sibling-node' });
    expect(getKeyboardShortcutAction({ key: 'Tab' }, twoNodes)).toBeNull();
    expect(getKeyboardShortcutAction({ key: 'Enter' }, twoNodes)).toBeNull();
    expect(getKeyboardShortcutAction({ key: ' ' }, oneNode)).toEqual({ type: 'edit-node', nodeId: 'n1' });
  });

  it('plans reorder before directional selection for modified vertical arrows', () => {
    const oneNode = { ...emptyContext, selectedNodeIds: ['n1'] };

    expect(getKeyboardShortcutAction({ key: 'ArrowUp', ctrlKey: true }, oneNode)).toEqual({
      type: 'reorder-sibling',
      direction: -1
    });
    expect(getKeyboardShortcutAction({ key: 'ArrowDown', metaKey: true }, oneNode)).toEqual({
      type: 'reorder-sibling',
      direction: 1
    });
    expect(getKeyboardShortcutAction({ key: 'ArrowLeft' }, oneNode)).toEqual({
      type: 'select-node-by-direction',
      directionKey: 'arrowleft'
    });
  });

  it('deletes selected edges before selected nodes', () => {
    expect(
      getKeyboardShortcutAction({ key: 'Delete' }, { selectedNodeIds: ['n1'], selectedEdgeId: 'e1', inEditor: false })
    ).toEqual({ type: 'delete-edge' });
    expect(
      getKeyboardShortcutAction({ key: 'Backspace' }, { selectedNodeIds: ['n1'], selectedEdgeId: '', inEditor: false })
    ).toEqual({ type: 'delete-nodes' });
    expect(getKeyboardShortcutAction({ key: 'Delete' }, emptyContext)).toBeNull();
  });
});
