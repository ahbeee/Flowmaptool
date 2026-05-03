import type { NodeShape, NodeStyle } from '@shared/graph';
import type { NodeSize } from '@shared/layout';
import { clampNodeLabel } from './ui-helpers';

export const DEFAULT_NODE_SIZE: NodeSize = { width: 70, height: 28 };
export const NODE_MIN_WIDTH = 48;
export const NODE_MAX_WIDTH = 360;
export const NODE_MIN_HEIGHT = 28;
export const NODE_PADDING_X = 10;
export const NODE_PADDING_Y = 6;
export const NODE_TEXT_BASELINE_Y = 26;
export const DEFAULT_FONT_FAMILY = 'Roboto';
export const DEFAULT_FONT_SIZE = 12;

export const ROOT_NODE_STYLE: NodeStyle = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  shape: 'rounded'
};

export const CHILD_NODE_STYLE: NodeStyle = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  shape: 'plain'
};

let nodeMeasureCanvas: HTMLCanvasElement | null = null;

function getNodeMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  nodeMeasureCanvas = nodeMeasureCanvas || document.createElement('canvas');
  return nodeMeasureCanvas.getContext('2d');
}

export function createChildNodeStyle(defaultShape: NodeShape): NodeStyle {
  return {
    ...CHILD_NODE_STYLE,
    shape: defaultShape
  };
}

export function quoteFontFamily(fontFamily: string): string {
  return /^[a-zA-Z0-9-]+$/.test(fontFamily) ? fontFamily : `"${fontFamily.replace(/"/g, '\\"')}"`;
}

export function fallbackTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    width += /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? fontSize : fontSize * 0.52;
  }
  return width;
}

export function measureNodeTextWidth(text: string, style?: NodeStyle): number {
  const fontSize = style?.fontSize || DEFAULT_FONT_SIZE;
  const fontFamily = style?.fontFamily || DEFAULT_FONT_FAMILY;
  const context = getNodeMeasureContext();
  if (!context) return fallbackTextWidth(text, fontSize);
  context.font = `${fontSize}px ${quoteFontFamily(fontFamily)}, sans-serif`;
  return context.measureText(text).width;
}

export function estimateNodeSize(label: string, style?: NodeStyle): NodeSize {
  const singleLine = clampNodeLabel(label).replace(/\r?\n/g, ' ');
  const fontSize = style?.fontSize || DEFAULT_FONT_SIZE;
  const unclampedWidth = measureNodeTextWidth(singleLine, style) + NODE_PADDING_X * 2 + 10;
  const width = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, unclampedWidth || NODE_MIN_WIDTH));
  const height = Math.max(NODE_MIN_HEIGHT, Math.ceil(fontSize * 1.3 + NODE_PADDING_Y * 2));
  return { width, height };
}
