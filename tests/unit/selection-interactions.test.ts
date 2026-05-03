import { describe, expect, it } from 'vitest';
import { planNodePointerDown, toggleNodeSelection } from '../../src/renderer/src/selection-interactions';

describe('selection interaction planners', () => {
  it('toggles node selection while preserving selection order', () => {
    expect(toggleNodeSelection(['n1', 'n2'], 'n2')).toEqual(['n1']);
    expect(toggleNodeSelection(['n1', 'n2'], 'n3')).toEqual(['n1', 'n2', 'n3']);
  });

  it('plans right-click connect or right-click selection', () => {
    expect(
      planNodePointerDown({
        button: 2,
        nodeId: 'n1',
        selectedNodeIds: [],
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        handleAnchor: 'front'
      })
    ).toEqual({ type: 'right-connect', nodeId: 'n1', anchor: 'front' });

    expect(
      planNodePointerDown({
        button: 2,
        nodeId: 'n2',
        selectedNodeIds: ['n1'],
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        handleAnchor: null
      })
    ).toEqual({ type: 'right-select', nodeId: 'n2', nextSelection: ['n2'] });
  });

  it('plans shift-click edge creation only from a single different selected node', () => {
    expect(
      planNodePointerDown({
        button: 0,
        nodeId: 'n2',
        selectedNodeIds: ['n1'],
        shiftKey: true,
        ctrlKey: false,
        metaKey: false
      })
    ).toEqual({ type: 'shift-connect', fromNodeId: 'n1', targetNodeId: 'n2', nextSelection: ['n2'] });

    expect(
      planNodePointerDown({
        button: 0,
        nodeId: 'n2',
        selectedNodeIds: ['n1', 'n3'],
        shiftKey: true,
        ctrlKey: false,
        metaKey: false
      })
    ).toEqual({ type: 'shift-connect', fromNodeId: null, targetNodeId: 'n2', nextSelection: ['n2'] });
  });

  it('plans modified selection toggles and regular drag selection', () => {
    expect(
      planNodePointerDown({
        button: 0,
        nodeId: 'n2',
        selectedNodeIds: ['n1'],
        shiftKey: false,
        ctrlKey: true,
        metaKey: false
      })
    ).toEqual({ type: 'toggle-selection', nextSelection: ['n1', 'n2'] });

    expect(
      planNodePointerDown({
        button: 0,
        nodeId: 'n2',
        selectedNodeIds: ['n1'],
        shiftKey: false,
        ctrlKey: false,
        metaKey: false
      })
    ).toEqual({ type: 'select-and-drag', nodeId: 'n2', nextSelection: ['n2'] });
  });

  it('ignores unsupported mouse buttons', () => {
    expect(
      planNodePointerDown({
        button: 1,
        nodeId: 'n2',
        selectedNodeIds: ['n1'],
        shiftKey: false,
        ctrlKey: false,
        metaKey: false
      })
    ).toEqual({ type: 'ignore' });
  });
});
