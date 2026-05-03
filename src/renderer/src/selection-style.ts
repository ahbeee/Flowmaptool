import type { CSSProperties } from 'react';
import type { EdgeLineType, EdgeStyle, FlowEdge, FlowNode, NodeId, NodeShape, NodeStyle } from '../../shared/graph';
import { effectiveEdgeStyle, hasMixedValues, sameValues } from './ui-helpers';

type ThemeColors = {
  rootBg: string;
  rootText: string;
  nodeBg: string;
  nodeText: string;
};

export type NodeStyleDefaults = {
  fontFamily: string;
  fontSize: number;
  defaultShape: NodeShape;
};

export type SelectedNodeStyleSummary = {
  selectedFontFamilyMixed: boolean;
  selectedFontFamily: string | '';
  selectedFontSizeMixed: boolean;
  selectedFontSize: number | '';
  selectedTextColorMixed: boolean;
  selectedTextColor: string;
  selectedBackgroundColorMixed: boolean;
  selectedBackgroundColor: string;
  selectedTextAlign: string | '';
  selectedShapeMixed: boolean;
  selectedShape: NodeShape | '';
  isAllBold: boolean;
  isAllItalic: boolean;
  isAllUnderline: boolean;
  hasMixedBold: boolean;
  hasMixedItalic: boolean;
  hasMixedUnderline: boolean;
};

export type SelectedEdgeStyleSummary = {
  selectedEdgeWidthMixed: boolean;
  selectedEdgeWidth: number | '';
  selectedEdgeLineTypeMixed: boolean;
  selectedEdgeLineType: EdgeLineType | '';
  selectedEdgeColorMixed: boolean;
  selectedEdgeColor: string;
};

function getNodeTextColor(node: FlowNode, rootNodeIds: Set<NodeId>, theme: ThemeColors): string {
  return node.style?.textColor || (rootNodeIds.has(node.id) ? theme.rootText : theme.nodeText);
}

function getNodeBackgroundColor(node: FlowNode, rootNodeIds: Set<NodeId>, theme: ThemeColors): string {
  return node.style?.backgroundColor || (rootNodeIds.has(node.id) ? theme.rootBg : theme.nodeBg);
}

function uniqueOrEmpty(values: string[]): string {
  if (values.length === 0) return '';
  return new Set(values).size === 1 ? values[0] : '';
}

export function getNodeVisualStyle(options: {
  nodeId: NodeId;
  style?: NodeStyle;
  rootNodeIds: Set<NodeId>;
  theme: ThemeColors;
  defaults: NodeStyleDefaults;
}): CSSProperties {
  const { nodeId, style, rootNodeIds, theme, defaults } = options;
  const isRoot = rootNodeIds.has(nodeId);
  const shape = style?.shape || (isRoot ? 'rounded' : defaults.defaultShape);
  const backgroundColor = style?.backgroundColor || (isRoot ? theme.rootBg : theme.nodeBg);
  const textColor = style?.textColor || (isRoot ? theme.rootText : theme.nodeText);
  const borderRadius =
    shape === 'pill' ? 999 : shape === 'square' || shape === 'underline' || shape === 'plain' ? 0 : 8;
  return {
    fontFamily: style?.fontFamily || defaults.fontFamily,
    fontSize: style?.fontSize || defaults.fontSize,
    fontWeight: style?.bold ? 700 : 400,
    fontStyle: style?.italic ? 'italic' : 'normal',
    textDecoration: style?.underline ? 'underline' : 'none',
    color: textColor,
    background: shape === 'underline' || shape === 'plain' ? 'transparent' : backgroundColor,
    borderRadius,
    borderStyle: 'solid',
    borderWidth: shape === 'underline' ? '0 0 2px 0' : shape === 'plain' ? 0 : 1,
    textAlign: style?.textAlign || 'left',
    justifyContent: style?.textAlign === 'center' ? 'center' : style?.textAlign === 'right' ? 'flex-end' : 'flex-start'
  };
}

export function summarizeSelectedNodeStyles(
  selectedNodes: FlowNode[],
  rootNodeIds: Set<NodeId>,
  theme: ThemeColors,
  defaults: NodeStyleDefaults
): SelectedNodeStyleSummary {
  const fontFamilies = selectedNodes.map(node => node.style?.fontFamily || defaults.fontFamily);
  const fontSizes = selectedNodes.map(node => node.style?.fontSize || defaults.fontSize);
  const textColors = selectedNodes.map(node => getNodeTextColor(node, rootNodeIds, theme));
  const backgroundColors = selectedNodes.map(node => getNodeBackgroundColor(node, rootNodeIds, theme));
  const textAligns = selectedNodes.map(node => node.style?.textAlign || 'left');
  const shapes = selectedNodes.map(
    node => node.style?.shape || (rootNodeIds.has(node.id) ? 'rounded' : defaults.defaultShape)
  );
  const isAnyBold = selectedNodes.some(node => node.style?.bold === true);
  const isAllBold = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.bold === true);
  const isAnyItalic = selectedNodes.some(node => node.style?.italic === true);
  const isAllItalic = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.italic === true);
  const isAnyUnderline = selectedNodes.some(node => node.style?.underline === true);
  const isAllUnderline = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.underline === true);

  return {
    selectedFontFamilyMixed: hasMixedValues(fontFamilies),
    selectedFontFamily: sameValues(fontFamilies),
    selectedFontSizeMixed: hasMixedValues(fontSizes),
    selectedFontSize: sameValues(fontSizes),
    selectedTextColorMixed: new Set(textColors).size > 1,
    selectedTextColor: uniqueOrEmpty(textColors),
    selectedBackgroundColorMixed: new Set(backgroundColors).size > 1,
    selectedBackgroundColor: uniqueOrEmpty(backgroundColors),
    selectedTextAlign: sameValues(textAligns),
    selectedShapeMixed: hasMixedValues(shapes),
    selectedShape: sameValues(shapes),
    isAllBold,
    isAllItalic,
    isAllUnderline,
    hasMixedBold: isAnyBold && !isAllBold,
    hasMixedItalic: isAnyItalic && !isAllItalic,
    hasMixedUnderline: isAnyUnderline && !isAllUnderline
  };
}

export function summarizeSelectedEdgeStyles(
  selectedStyleEdges: FlowEdge[],
  defaultEdgeStyle: EdgeStyle
): SelectedEdgeStyleSummary {
  const effectiveStyles = selectedStyleEdges.map(edge => effectiveEdgeStyle(edge, defaultEdgeStyle));
  const widths = effectiveStyles.map(style => style.width);
  const lineTypes = effectiveStyles.map(style => style.lineType);
  const colors = effectiveStyles.map(style => style.color);
  return {
    selectedEdgeWidthMixed: hasMixedValues(widths),
    selectedEdgeWidth: sameValues(widths),
    selectedEdgeLineTypeMixed: hasMixedValues(lineTypes),
    selectedEdgeLineType: sameValues(lineTypes),
    selectedEdgeColorMixed: new Set(colors).size > 1,
    selectedEdgeColor: uniqueOrEmpty(colors)
  };
}
