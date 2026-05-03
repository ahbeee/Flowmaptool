import type { EdgeLineType, NodeShape } from '../../shared/graph';

export const SPACING_MIN = 0;
export const SPACING_MAX = 320;
export const SIDE_PANEL_MIN_WIDTH = 220;
export const SIDE_PANEL_DEFAULT_WIDTH = 360;
export const SIDE_PANEL_MAX_WIDTH = 760;
export const ADVANCED_ROUTE_NODE_LIMIT = 300;
export const ADVANCED_ROUTE_EDGE_LIMIT = 800;
export const FONT_FAMILIES = ['Roboto', 'Segoe UI', 'Arial', 'Microsoft JhengHei', 'Noto Sans TC'];
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 32, 48, 64];
export const EDGE_WIDTHS = [1, 2, 3, 4, 5, 6, 7, 8];
export const EDGE_LINE_TYPES: Array<{ value: EdgeLineType; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' }
];
export const MIXED_OPTION = '__mixed__';
export const COLOR_SWATCHES = [
  '#111827',
  '#6b7280',
  '#b91c1c',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#0ea5e9',
  '#4f46e5',
  '#a855f7',
  '#ffffff',
  '#e5e7eb',
  '#c08457',
  '#f9a8d4',
  '#fbbf24',
  '#f5e7a1',
  '#a3e635',
  '#67e8f9',
  '#93c5fd',
  '#c4b5fd'
];
export const NODE_SHAPES: Array<{ value: NodeShape; label: string }> = [
  { value: 'plain', label: 'No Frame' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' },
  { value: 'underline', label: 'Underline' },
  { value: 'square', label: 'Square' }
];
export const THEMES = {
  'blue-gray': {
    label: 'Blue Gray',
    canvas: '#f8fafc',
    rootBg: '#1f2937',
    rootText: '#ffffff',
    nodeBg: '#ffffff',
    nodeText: '#0f172a',
    edge: '#64748b'
  },
  'gray-red': {
    label: 'Gray Red',
    canvas: '#eef2f3',
    rootBg: '#102027',
    rootText: '#ffffff',
    nodeBg: '#d1d5db',
    nodeText: '#111827',
    edge: '#b91c1c'
  },
  clean: {
    label: 'Light Clean',
    canvas: '#ffffff',
    rootBg: '#111827',
    rootText: '#ffffff',
    nodeBg: '#f8fafc',
    nodeText: '#111827',
    edge: '#38bdf8'
  },
  dark: {
    label: 'Dark Contrast',
    canvas: '#111827',
    rootBg: '#f8fafc',
    rootText: '#111827',
    nodeBg: '#1f2937',
    nodeText: '#f8fafc',
    edge: '#93c5fd'
  }
} as const;

export type ThemeId = keyof typeof THEMES;

export const PNG_FILTER = [{ name: 'PNG Image', extensions: ['png'] }];

export function getTheme(themeId: string) {
  return THEMES[(themeId as ThemeId) in THEMES ? (themeId as ThemeId) : 'blue-gray'];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampSidePanelWidth(width: number, viewportWidth?: number): number {
  const resolvedViewportWidth =
    viewportWidth ?? (typeof window === 'undefined' ? undefined : window.innerWidth);
  const viewportMax =
    resolvedViewportWidth === undefined
      ? SIDE_PANEL_MAX_WIDTH
      : Math.max(SIDE_PANEL_MIN_WIDTH, resolvedViewportWidth - 520);
  return clamp(width, SIDE_PANEL_MIN_WIDTH, Math.min(SIDE_PANEL_MAX_WIDTH, viewportMax));
}
