import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, removeEdge } from '../../src/shared/graph';
import {
  getLayoutSecondaryGap,
  layoutFlow,
  layoutHorizontal,
  layoutVertical,
  type LayoutResult,
  type NodeSizeMap,
  type NodePosition
} from '../../src/shared/layout';

function findPos(layoutResult: LayoutResult, id: string): NodePosition {
  return layoutResult.positions.find(position => position.id === id)!;
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('horizontal layout', () => {
  it('places downstream nodes to the right', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n2', 'n3');

    const result = layoutHorizontal(doc);
    const n1 = findPos(result, 'n1');
    const n2 = findPos(result, 'n2');
    const n3 = findPos(result, 'n3');

    expect(n2.x).toBeGreaterThan(n1.x);
    expect(n3.x).toBeGreaterThan(n2.x);
  });

  it('auto-updates after deleting an edge', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');
    let result = layoutHorizontal(doc);
    const n2Before = findPos(result, 'n2');

    doc = removeEdge(doc, 'e1');
    result = layoutHorizontal(doc);
    const n2After = findPos(result, 'n2');

    expect(n2After.x).toBeLessThan(n2Before.x);
  });

  it('expands parent sibling spacing while subtree grows', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Root');
    doc = addNode(doc, '1');
    doc = addNode(doc, '2');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');
    const base = layoutHorizontal(doc);
    const baseN2 = findPos(base, 'n2');
    const baseN3 = findPos(base, 'n3');
    const baseGap = Math.abs(baseN3.y - baseN2.y);

    doc = addNode(doc, '3');
    doc = addNode(doc, '4');
    doc = addNode(doc, '5');
    doc = addEdge(doc, 'n2', 'n4');
    doc = addEdge(doc, 'n2', 'n5');
    doc = addEdge(doc, 'n3', 'n6');
    const grown = layoutHorizontal(doc);
    const n2 = findPos(grown, 'n2');
    const n3 = findPos(grown, 'n3');
    const n4 = findPos(grown, 'n4');
    const n5 = findPos(grown, 'n5');
    const n6 = findPos(grown, 'n6');
    const grownGap = Math.abs(n3.y - n2.y);

    expect(grownGap).toBeGreaterThan(baseGap);
    expect(Math.abs(n5.y - n4.y)).toBe(Math.abs(n6.y - n5.y));
  });
});

describe('vertical layout', () => {
  it('places downstream nodes downward', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n2', 'n3');

    const result = layoutVertical(doc);
    const n1 = findPos(result, 'n1');
    const n2 = findPos(result, 'n2');
    const n3 = findPos(result, 'n3');

    expect(n2.y).toBeGreaterThan(n1.y);
    expect(n3.y).toBeGreaterThan(n2.y);
  });

  it('keeps siblings separated to avoid overlap', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');

    const result = layoutVertical(doc);
    const n2 = findPos(result, 'n2');
    const n3 = findPos(result, 'n3');

    expect(Math.abs(n2.x - n3.x)).toBeGreaterThanOrEqual(getLayoutSecondaryGap('vertical'));
  });

  it('keeps deterministic secondary spacing after direction switch', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Root');
    doc = addNode(doc, '1');
    doc = addNode(doc, '2');
    doc = addNode(doc, '3');
    doc = addNode(doc, '4');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');
    doc = addEdge(doc, 'n2', 'n4');
    doc = addEdge(doc, 'n3', 'n5');

    const horizontal = layoutHorizontal(doc);
    const vertical = layoutVertical(doc);
    const hN2 = findPos(horizontal, 'n2');
    const hN3 = findPos(horizontal, 'n3');
    const vN2 = findPos(vertical, 'n2');
    const vN3 = findPos(vertical, 'n3');

    expect(Math.abs(hN3.y - hN2.y)).toBeGreaterThanOrEqual(getLayoutSecondaryGap('horizontal'));
    expect(Math.abs(vN3.x - vN2.x)).toBeGreaterThanOrEqual(getLayoutSecondaryGap('vertical'));
  });

  it('keeps a multi-level branch tree from overlapping after switching vertical', () => {
    let doc = createEmptyDoc();
    for (let i = 1; i <= 10; i += 1) {
      doc = addNode(doc, `Node ${i}`);
    }
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');
    doc = addEdge(doc, 'n2', 'n4');
    doc = addEdge(doc, 'n2', 'n5');
    doc = addEdge(doc, 'n2', 'n6');
    doc = addEdge(doc, 'n3', 'n7');
    doc = addEdge(doc, 'n3', 'n8');
    doc = addEdge(doc, 'n8', 'n9');
    doc = addEdge(doc, 'n8', 'n10');

    const nodeSizes: NodeSizeMap = {};
    for (let i = 1; i <= 10; i += 1) {
      nodeSizes[`n${i}`] = { width: 70, height: 28 };
    }
    const result = layoutFlow(doc, 'vertical', nodeSizes, { primary: 24, secondary: 48 });
    const boxes = new Map(
      result.positions.map(position => [
        position.id,
        {
          ...position,
          width: nodeSizes[position.id].width,
          height: nodeSizes[position.id].height
        }
      ])
    );

    for (const [idA, boxA] of boxes.entries()) {
      for (const [idB, boxB] of boxes.entries()) {
        if (idA >= idB) continue;
        expect(boxesOverlap(boxA, boxB), `${idA} overlaps ${idB}`).toBe(false);
      }
    }
  });

  it('shifts downstream layers when an upstream node width grows', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Root');
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n2', 'n3');

    const baseSizes: NodeSizeMap = {
      n1: { width: 140, height: 44 },
      n2: { width: 140, height: 44 },
      n3: { width: 140, height: 44 }
    };
    const widenedSizes: NodeSizeMap = {
      ...baseSizes,
      n2: { width: 300, height: 44 }
    };

    const base = layoutFlow(doc, 'horizontal', baseSizes);
    const widened = layoutFlow(doc, 'horizontal', widenedSizes);
    const baseN2 = findPos(base, 'n2');
    const baseN3 = findPos(base, 'n3');
    const widenedN2 = findPos(widened, 'n2');
    const widenedN3 = findPos(widened, 'n3');

    expect(widenedN2.y).toBe(baseN2.y);
    expect(widenedN3.x).toBeGreaterThan(baseN3.x);
    expect(widenedN3.y).toBe(baseN3.y);
  });

  it('keeps sibling spacing stable in unrelated branches when one node widens', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Root'); // n1
    doc = addNode(doc, 'Node 2'); // n2
    doc = addNode(doc, 'Long'); // n3
    doc = addNode(doc, 'Node 4'); // n4
    doc = addNode(doc, 'Node 5'); // n5
    doc = addNode(doc, 'Node 6'); // n6
    doc = addNode(doc, 'Node 7'); // n7
    doc = addNode(doc, 'Node 8'); // n8
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');
    doc = addEdge(doc, 'n3', 'n4');
    doc = addEdge(doc, 'n3', 'n5');
    doc = addEdge(doc, 'n4', 'n6');
    doc = addEdge(doc, 'n5', 'n7');
    doc = addEdge(doc, 'n2', 'n8');

    const baseSizes: NodeSizeMap = {};
    for (let i = 1; i <= 8; i += 1) {
      baseSizes[`n${i}`] = { width: 140, height: 44 };
    }
    const widenedSizes: NodeSizeMap = { ...baseSizes, n3: { width: 320, height: 44 } };

    const base = layoutFlow(doc, 'horizontal', baseSizes);
    const widened = layoutFlow(doc, 'horizontal', widenedSizes);
    const baseN4 = findPos(base, 'n4');
    const baseN5 = findPos(base, 'n5');
    const baseN6 = findPos(base, 'n6');
    const baseN7 = findPos(base, 'n7');
    const widenedN4 = findPos(widened, 'n4');
    const widenedN5 = findPos(widened, 'n5');
    const widenedN6 = findPos(widened, 'n6');
    const widenedN7 = findPos(widened, 'n7');

    expect(Math.abs(widenedN5.y - widenedN4.y)).toBe(Math.abs(baseN5.y - baseN4.y));
    expect(Math.abs(widenedN7.y - widenedN6.y)).toBe(Math.abs(baseN7.y - baseN6.y));
  });

  it('keeps parent-child depth spacing fixed when another branch grows', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Root Topic'); // n1
    doc = addNode(doc, 'Node 2'); // n2
    doc = addNode(doc, 'Node 3'); // n3
    doc = addNode(doc, 'Node 4'); // n4
    doc = addNode(doc, 'Node 5'); // n5
    doc = addNode(doc, 'Node 6'); // n6
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');
    doc = addEdge(doc, 'n2', 'n4');
    doc = addEdge(doc, 'n3', 'n5');
    doc = addEdge(doc, 'n3', 'n6');

    const baseSizes: NodeSizeMap = {};
    for (let i = 1; i <= 6; i += 1) {
      baseSizes[`n${i}`] = { width: 140, height: 44 };
    }
    const widenedSizes: NodeSizeMap = { ...baseSizes, n3: { width: 320, height: 44 } };

    const base = layoutFlow(doc, 'horizontal', baseSizes);
    const widened = layoutFlow(doc, 'horizontal', widenedSizes);
    const baseN2 = findPos(base, 'n2');
    const baseN4 = findPos(base, 'n4');
    const widenedN2 = findPos(widened, 'n2');
    const widenedN4 = findPos(widened, 'n4');

    expect(widenedN4.y).toBe(baseN4.y);
    expect(widenedN2.y).toBe(baseN2.y);
    expect(widenedN4.x - widenedN2.x).toBe(baseN4.x - baseN2.x);
  });

  it('keeps subtree-aware spacing in multi-parent merge scenario', () => {
    const addNodeWithId = (docInput: ReturnType<typeof createEmptyDoc>, label: string) => {
      const id = `n${docInput.meta.nextNodeSeq}`;
      const docOut = addNode(docInput, label);
      return { doc: docOut, id };
    };

    let doc = createEmptyDoc();
    const root = addNodeWithId(doc, 'Root Topic');
    doc = root.doc;
    const n2 = addNodeWithId(doc, 'Node 2');
    doc = n2.doc;
    const n3 = addNodeWithId(doc, 'Node 3');
    doc = n3.doc;
    const n5 = addNodeWithId(doc, 'Node 5');
    doc = n5.doc;
    const n6 = addNodeWithId(doc, 'Node 6');
    doc = n6.doc;
    const n4 = addNodeWithId(doc, 'Node 4');
    doc = n4.doc;
    const n7 = addNodeWithId(doc, 'Node 7');
    doc = n7.doc;
    const n8 = addNodeWithId(doc, 'Node 8');
    doc = n8.doc;
    const n9 = addNodeWithId(doc, 'Node 9');
    doc = n9.doc;
    const n10 = addNodeWithId(doc, 'Node 10');
    doc = n10.doc;
    const n11 = addNodeWithId(doc, 'Node 11');
    doc = n11.doc;
    const n12 = addNodeWithId(doc, 'Node 12');
    doc = n12.doc;

    doc = addEdge(doc, root.id, n2.id);
    doc = addEdge(doc, root.id, n3.id);
    doc = addEdge(doc, root.id, n5.id);
    doc = addEdge(doc, root.id, n6.id);
    doc = addEdge(doc, n2.id, n4.id);
    doc = addEdge(doc, n3.id, n4.id);
    doc = addEdge(doc, n5.id, n4.id);
    doc = addEdge(doc, n4.id, n7.id);
    doc = addEdge(doc, n4.id, n8.id);
    doc = addEdge(doc, n8.id, n11.id);
    doc = addEdge(doc, n8.id, n12.id);
    doc = addEdge(doc, n6.id, n9.id);
    doc = addEdge(doc, n6.id, n10.id);

    const result = layoutFlow(doc, 'horizontal');
    const gap = getLayoutSecondaryGap('horizontal');

    const p2 = findPos(result, n2.id);
    const p3 = findPos(result, n3.id);
    const p5 = findPos(result, n5.id);
    const p6 = findPos(result, n6.id);
    expect(p2.y).toBeLessThan(p3.y);
    expect(p3.y).toBeLessThan(p5.y);
    expect(p5.y).toBeLessThan(p6.y);
    expect(Math.abs(p3.y - p2.y)).toBeGreaterThanOrEqual(gap);
    expect(Math.abs(p5.y - p3.y)).toBeGreaterThanOrEqual(gap);
    expect(Math.abs(p6.y - p5.y)).toBeGreaterThanOrEqual(gap);

    const p7 = findPos(result, n7.id);
    const p8 = findPos(result, n8.id);
    expect(Math.abs(p8.y - p7.y)).toBeGreaterThanOrEqual(gap);
  });

  it('centers each parent over the full span of its downstream subtree', () => {
    let doc = createEmptyDoc();
    for (const label of [
      'Root Topic',
      'Node 2',
      'Node 3',
      'Node 4',
      'Node 5',
      'Node 6',
      'Node 7',
      'Node 8',
      'Node 9',
      'Node 10',
      'Node 11',
      'Node 12',
      'Node 13',
      'Node 14',
      'Node 15'
    ]) {
      doc = addNode(doc, label);
    }

    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');
    doc = addEdge(doc, 'n2', 'n4');
    doc = addEdge(doc, 'n2', 'n5');
    doc = addEdge(doc, 'n2', 'n9');
    doc = addEdge(doc, 'n5', 'n14');
    doc = addEdge(doc, 'n5', 'n15');
    doc = addEdge(doc, 'n9', 'n13');
    doc = addEdge(doc, 'n3', 'n6');
    doc = addEdge(doc, 'n3', 'n7');
    doc = addEdge(doc, 'n3', 'n8');
    doc = addEdge(doc, 'n8', 'n10');
    doc = addEdge(doc, 'n8', 'n11');
    doc = addEdge(doc, 'n8', 'n12');

    const result = layoutFlow(doc, 'horizontal');
    const n2 = findPos(result, 'n2');
    const n3 = findPos(result, 'n3');
    const n4 = findPos(result, 'n4');
    const n5 = findPos(result, 'n5');
    const n8 = findPos(result, 'n8');
    const n9 = findPos(result, 'n9');
    const n10 = findPos(result, 'n10');
    const n12 = findPos(result, 'n12');
    const n13 = findPos(result, 'n13');
    const n14 = findPos(result, 'n14');
    const n15 = findPos(result, 'n15');

    expect(n2.y).toBeCloseTo((n4.y + n9.y) / 2, 6);
    expect(n3.y).toBeLessThan(n8.y);
    expect(n5.y).toBeCloseTo((n14.y + n15.y) / 2, 6);
    expect(n8.y).toBeCloseTo((n10.y + n12.y) / 2, 6);
    expect(n9.y).toBeCloseTo(n13.y, 6);
  });

  it('does not let a secondary cycle edge change node layout', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Root Topic'); // n1
    doc = addNode(doc, 'Node 2'); // n2
    doc = addNode(doc, 'Node 3'); // n3
    doc = addNode(doc, 'Node 4'); // n4
    doc = addNode(doc, 'Node 5'); // n5
    doc = addNode(doc, 'Node 6'); // n6
    doc = addNode(doc, 'Node 7'); // n7
    doc = addNode(doc, 'Node 8'); // n8
    doc = addNode(doc, 'Node 9'); // n9
    doc = addNode(doc, 'Node 10'); // n10
    doc = addNode(doc, 'Node 11'); // n11
    doc = addNode(doc, 'Node 12'); // n12
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n4');
    doc = addEdge(doc, 'n1', 'n5');
    doc = addEdge(doc, 'n1', 'n6');
    doc = addEdge(doc, 'n2', 'n3');
    doc = addEdge(doc, 'n4', 'n3');
    doc = addEdge(doc, 'n5', 'n3');
    doc = addEdge(doc, 'n3', 'n9');
    doc = addEdge(doc, 'n3', 'n10');
    doc = addEdge(doc, 'n10', 'n11');
    doc = addEdge(doc, 'n10', 'n12');
    doc = addEdge(doc, 'n6', 'n7');
    doc = addEdge(doc, 'n6', 'n8');

    const before = layoutFlow(doc, 'horizontal');
    const beforeById = new Map(before.positions.map(position => [position.id, position]));

    doc = addEdge(doc, 'n12', 'n4');
    const after = layoutFlow(doc, 'horizontal');

    for (const position of after.positions) {
      const oldPosition = beforeById.get(position.id);
      expect(oldPosition).toBeDefined();
      expect(position.x).toBeCloseTo(oldPosition!.x, 6);
      expect(position.y).toBeCloseTo(oldPosition!.y, 6);
    }
  });
});
