import { describe, expect, it } from 'vitest';
import type { FlowEdge, FlowNode } from '../../src/shared/graph';
import {
  getNodeVisualStyle,
  summarizeSelectedEdgeStyles,
  summarizeSelectedNodeStyles
} from '../../src/renderer/src/selection-style';

const theme = {
  rootBg: '#111111',
  rootText: '#ffffff',
  nodeBg: '#eeeeee',
  nodeText: '#222222'
};
const defaults = {
  fontFamily: 'Roboto',
  fontSize: 14,
  defaultShape: 'rounded' as const
};

describe('selection style helpers', () => {
  it('builds node visual styles from theme, root status, shape, and text settings', () => {
    expect(
      getNodeVisualStyle({
        nodeId: 'n1',
        rootNodeIds: new Set(['n1']),
        theme,
        defaults,
        style: { shape: 'underline', textAlign: 'right', italic: true }
      })
    ).toMatchObject({
      fontFamily: 'Roboto',
      fontSize: 14,
      fontStyle: 'italic',
      color: '#ffffff',
      background: 'transparent',
      borderRadius: 0,
      borderWidth: '0 0 2px 0',
      justifyContent: 'flex-end'
    });
  });

  it('summarizes selected node styles including mixed values and tri-state toggles', () => {
    const nodes: FlowNode[] = [
      {
        id: 'n1',
        label: 'Root',
        style: { fontFamily: 'Inter', fontSize: 18, bold: true, textColor: '#123456', shape: 'pill' }
      },
      {
        id: 'n2',
        label: 'Child',
        style: { fontFamily: 'Inter', fontSize: 18, italic: true, backgroundColor: '#abcdef', shape: 'pill' }
      }
    ];

    expect(summarizeSelectedNodeStyles(nodes, new Set(['n1']), theme, defaults)).toEqual({
      selectedFontFamilyMixed: false,
      selectedFontFamily: 'Inter',
      selectedFontSizeMixed: false,
      selectedFontSize: 18,
      selectedTextColorMixed: true,
      selectedTextColor: '',
      selectedBackgroundColorMixed: true,
      selectedBackgroundColor: '',
      selectedTextAlign: 'left',
      selectedShapeMixed: false,
      selectedShape: 'pill',
      isAllBold: false,
      isAllItalic: false,
      isAllUnderline: false,
      hasMixedBold: true,
      hasMixedItalic: true,
      hasMixedUnderline: false
    });
  });

  it('summarizes empty node selections with empty values and no mixed state', () => {
    expect(summarizeSelectedNodeStyles([], new Set(), theme, defaults)).toMatchObject({
      selectedFontFamilyMixed: false,
      selectedFontFamily: '',
      selectedFontSizeMixed: false,
      selectedFontSize: '',
      selectedTextColorMixed: false,
      selectedTextColor: '',
      isAllBold: false,
      hasMixedBold: false
    });
  });

  it('summarizes selected edge styles against the default edge style', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', from: 'n1', to: 'n2', style: { width: 3, color: '#ff0000' } },
      { id: 'e2', from: 'n2', to: 'n3', style: { width: 3, lineType: 'dashed', color: '#00ff00' } }
    ];

    expect(
      summarizeSelectedEdgeStyles(edges, {
        width: 2,
        lineType: 'solid',
        color: '#64748b'
      })
    ).toEqual({
      selectedEdgeWidthMixed: false,
      selectedEdgeWidth: 3,
      selectedEdgeLineTypeMixed: true,
      selectedEdgeLineType: '',
      selectedEdgeColorMixed: true,
      selectedEdgeColor: ''
    });
  });
});
