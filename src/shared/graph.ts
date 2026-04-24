export const SCHEMA_VERSION = 1;

export type NodeId = string;
export type EdgeId = string;

export type FlowNode = {
  id: NodeId;
  label: string;
  style?: NodeStyle;
};

export type FlowEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
};

export type FlowDocMeta = {
  nextNodeSeq: number;
  nextEdgeSeq: number;
};

export type NodeShape = 'plain' | 'rounded' | 'pill' | 'underline' | 'square';
export type TextAlign = 'left' | 'center' | 'right';

export type NodeStyle = {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: TextAlign;
  shape?: NodeShape;
  tagId?: string;
};

export type FlowTag = {
  id: string;
  name: string;
  color: string;
};

export type FlowSettings = {
  themeId: string;
  spacing: {
    horizontal: number;
    vertical: number;
  };
  defaultShape: NodeShape;
  tags: FlowTag[];
};

export type FlowDoc = {
  schemaVersion: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  meta: FlowDocMeta;
  settings: FlowSettings;
};

export type EdgeValidationResult =
  | { ok: true }
  | { ok: false; reason: 'unknown-node' | 'self-edge' | 'duplicate-edge' };

type LegacyFlowDoc = {
  schemaVersion?: number;
  nodes?: Array<Partial<FlowNode> & { label?: unknown; id?: unknown }>;
  edges?: Array<Partial<FlowEdge> & { from?: unknown; to?: unknown; id?: unknown }>;
  meta?: Partial<FlowDocMeta>;
  settings?: Partial<FlowSettings>;
};

const DEFAULT_TAGS: FlowTag[] = [
  { id: 'tag-blue', name: 'Blue', color: '#3b82f6' },
  { id: 'tag-pink', name: 'Pending', color: '#ec4899' },
  { id: 'tag-green', name: 'Done', color: '#22c55e' },
  { id: 'tag-orange', name: 'Orange', color: '#f97316' }
];
const SPACING_MIN = 16;
const SPACING_MAX = 320;

export function createDefaultSettings(): FlowSettings {
  return {
    themeId: 'blue-gray',
    spacing: {
      horizontal: 48,
      vertical: 24
    },
    defaultShape: 'plain',
    tags: DEFAULT_TAGS.map(tag => ({ ...tag }))
  };
}

export function createEmptyDoc(): FlowDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    meta: {
      nextNodeSeq: 1,
      nextEdgeSeq: 1
    },
    settings: createDefaultSettings()
  };
}

function toStringId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getMaxSeq(ids: string[], prefix: 'n' | 'e') {
  let maxSeq = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const tail = Number(id.slice(1));
    if (!Number.isNaN(tail) && tail > maxSeq) {
      maxSeq = tail;
    }
  }
  return maxSeq;
}

function nextNodeId(doc: FlowDoc): NodeId {
  return `n${doc.meta.nextNodeSeq}`;
}

function nextEdgeId(doc: FlowDoc): EdgeId {
  return `e${doc.meta.nextEdgeSeq}`;
}

function assertNodeExists(doc: FlowDoc, nodeId: NodeId) {
  const exists = doc.nodes.some(node => node.id === nodeId);
  if (!exists) {
    throw new Error(`unknown node id: ${nodeId}`);
  }
}

function sanitizeNodes(input: LegacyFlowDoc['nodes']): FlowNode[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];
  let fallbackSeq = 1;

  for (const rawNode of input) {
    const label = typeof rawNode.label === 'string' ? rawNode.label : '';
    let id = toStringId(rawNode.id);
    if (!id) {
      while (seen.has(`n${fallbackSeq}`)) fallbackSeq++;
      id = `n${fallbackSeq}`;
      fallbackSeq++;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, label });
  }
  return nodes;
}

function sanitizeEdges(input: LegacyFlowDoc['edges'], validNodeIds: Set<string>): FlowEdge[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const edgePairs = new Set<string>();
  const edges: FlowEdge[] = [];
  let fallbackSeq = 1;

  for (const rawEdge of input) {
    const from = toStringId(rawEdge.from);
    const to = toStringId(rawEdge.to);
    if (!from || !to) continue;
    if (!validNodeIds.has(from) || !validNodeIds.has(to)) continue;

    const pairKey = `${from}->${to}`;
    if (edgePairs.has(pairKey)) continue;
    edgePairs.add(pairKey);

    let id = toStringId(rawEdge.id);
    if (!id) {
      while (seen.has(`e${fallbackSeq}`)) fallbackSeq++;
      id = `e${fallbackSeq}`;
      fallbackSeq++;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, from, to });
  }
  return edges;
}

function normalizeMeta(nodes: FlowNode[], edges: FlowEdge[], rawMeta?: Partial<FlowDocMeta>): FlowDocMeta {
  const minNextNode = getMaxSeq(nodes.map(node => node.id), 'n') + 1;
  const minNextEdge = getMaxSeq(edges.map(edge => edge.id), 'e') + 1;
  const rawNodeSeq = typeof rawMeta?.nextNodeSeq === 'number' ? rawMeta.nextNodeSeq : 0;
  const rawEdgeSeq = typeof rawMeta?.nextEdgeSeq === 'number' ? rawMeta.nextEdgeSeq : 0;

  return {
    nextNodeSeq: Math.max(minNextNode, rawNodeSeq, 1),
    nextEdgeSeq: Math.max(minNextEdge, rawEdgeSeq, 1)
  };
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function sanitizeNodeStyle(input: unknown, validTagIds?: Set<string>): NodeStyle | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as NodeStyle;
  const next: NodeStyle = {};
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) next.fontFamily = raw.fontFamily;
  if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) next.fontSize = Math.max(10, Math.min(72, raw.fontSize));
  if (typeof raw.bold === 'boolean') next.bold = raw.bold;
  if (typeof raw.italic === 'boolean') next.italic = raw.italic;
  if (typeof raw.underline === 'boolean') next.underline = raw.underline;
  if (typeof raw.textColor === 'string') next.textColor = sanitizeHexColor(raw.textColor, '#0f172a');
  if (typeof raw.backgroundColor === 'string') next.backgroundColor = sanitizeHexColor(raw.backgroundColor, '#ffffff');
  if (raw.textAlign === 'left' || raw.textAlign === 'center' || raw.textAlign === 'right') next.textAlign = raw.textAlign;
  if (
    raw.shape === 'plain' ||
    raw.shape === 'rounded' ||
    raw.shape === 'pill' ||
    raw.shape === 'underline' ||
    raw.shape === 'square'
  ) {
    next.shape = raw.shape;
  }
  if (typeof raw.tagId === 'string' && (!validTagIds || validTagIds.has(raw.tagId))) next.tagId = raw.tagId;
  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeSettings(input: unknown): FlowSettings {
  const defaults = createDefaultSettings();
  if (!input || typeof input !== 'object') return defaults;
  const raw = input as Partial<FlowSettings>;
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map((tag, index) => {
          const id = typeof tag?.id === 'string' && tag.id.trim() ? tag.id : `tag-custom-${index + 1}`;
          const name = typeof tag?.name === 'string' && tag.name.trim() ? tag.name : `Tag ${index + 1}`;
          const color = sanitizeHexColor(tag?.color, '#64748b');
          return { id, name, color };
        })
        .filter((tag, index, list) => list.findIndex(item => item.id === tag.id) === index)
    : defaults.tags;
  return {
    themeId: typeof raw.themeId === 'string' && raw.themeId.trim() ? raw.themeId : defaults.themeId,
    spacing: {
      horizontal: Math.max(SPACING_MIN, Math.min(SPACING_MAX, raw.spacing?.horizontal || defaults.spacing.horizontal)),
      vertical: Math.max(SPACING_MIN, Math.min(SPACING_MAX, raw.spacing?.vertical || defaults.spacing.vertical))
    },
    defaultShape:
      raw.defaultShape === 'plain' ||
      raw.defaultShape === 'rounded' ||
      raw.defaultShape === 'pill' ||
      raw.defaultShape === 'underline' ||
      raw.defaultShape === 'square'
        ? raw.defaultShape
        : defaults.defaultShape,
    tags
  };
}

export function migrateToLatest(input: unknown): FlowDoc {
  const legacy = (input || {}) as LegacyFlowDoc;
  const settings = sanitizeSettings(legacy.settings);
  const validTagIds = new Set(settings.tags.map(tag => tag.id));
  const nodes = sanitizeNodes(legacy.nodes).map(node => {
    const rawNode = Array.isArray(legacy.nodes) ? legacy.nodes.find(item => item.id === node.id) : undefined;
    const style = sanitizeNodeStyle(rawNode?.style, validTagIds);
    return style ? { ...node, style } : node;
  });
  const validNodeIds = new Set(nodes.map(node => node.id));
  const edges = sanitizeEdges(legacy.edges, validNodeIds);
  const meta = normalizeMeta(nodes, edges, legacy.meta);

  return {
    schemaVersion: SCHEMA_VERSION,
    nodes,
    edges,
    meta,
    settings
  };
}

export function addNode(doc: FlowDoc, label: string, style?: NodeStyle): FlowDoc {
  const node: FlowNode = {
    id: nextNodeId(doc),
    label,
    ...(style ? { style } : {})
  };
  return {
    ...doc,
    nodes: [...doc.nodes, node],
    meta: {
      ...doc.meta,
      nextNodeSeq: doc.meta.nextNodeSeq + 1
    }
  };
}

export function updateNodeLabel(doc: FlowDoc, nodeId: NodeId, label: string): FlowDoc {
  assertNodeExists(doc, nodeId);
  return {
    ...doc,
    nodes: doc.nodes.map(node => (node.id === nodeId ? { ...node, label } : node))
  };
}

export function updateNodeStyle(doc: FlowDoc, nodeIds: NodeId[], patch: NodeStyle): FlowDoc {
  const targets = new Set(nodeIds);
  for (const nodeId of targets) assertNodeExists(doc, nodeId);
  return {
    ...doc,
    nodes: doc.nodes.map(node => {
      if (!targets.has(node.id)) return node;
      const nextStyle = { ...(node.style || {}), ...patch };
      for (const [key, value] of Object.entries(nextStyle)) {
        if (value === undefined || value === '') delete (nextStyle as Record<string, unknown>)[key];
      }
      return Object.keys(nextStyle).length > 0 ? { ...node, style: nextStyle } : { id: node.id, label: node.label };
    })
  };
}

export function resetNodeStyle(doc: FlowDoc, nodeIds: NodeId[]): FlowDoc {
  const targets = new Set(nodeIds);
  for (const nodeId of targets) assertNodeExists(doc, nodeId);
  return {
    ...doc,
    nodes: doc.nodes.map(node => (targets.has(node.id) ? { id: node.id, label: node.label } : node))
  };
}

export function updateSettings(doc: FlowDoc, patch: Partial<FlowSettings>): FlowDoc {
  return {
    ...doc,
    settings: {
      ...doc.settings,
      ...patch,
      spacing: {
        ...doc.settings.spacing,
        ...(patch.spacing || {})
      },
      tags: patch.tags || doc.settings.tags
    }
  };
}

export function upsertTag(doc: FlowDoc, tag: FlowTag): FlowDoc {
  const nextTag = {
    id: tag.id,
    name: tag.name.trim() || 'Tag',
    color: sanitizeHexColor(tag.color, '#64748b')
  };
  const exists = doc.settings.tags.some(item => item.id === nextTag.id);
  return updateSettings(doc, {
    tags: exists
      ? doc.settings.tags.map(item => (item.id === nextTag.id ? nextTag : item))
      : [...doc.settings.tags, nextTag]
  });
}

export function deleteTag(doc: FlowDoc, tagId: string): FlowDoc {
  return {
    ...doc,
    settings: {
      ...doc.settings,
      tags: doc.settings.tags.filter(tag => tag.id !== tagId)
    },
    nodes: doc.nodes.map(node =>
      node.style?.tagId === tagId
        ? {
            ...node,
            style: {
              ...node.style,
              tagId: undefined
            }
          }
        : node
    )
  };
}

export function addEdge(doc: FlowDoc, from: NodeId, to: NodeId): FlowDoc {
  const validation = validateEdge(doc, from, to);
  if (!validation.ok) {
    if (validation.reason === 'unknown-node') {
      throw new Error(`unknown node id: ${from} or ${to}`);
    }
    return doc;
  }

  const edge: FlowEdge = {
    id: nextEdgeId(doc),
    from,
    to
  };
  return {
    ...doc,
    edges: [...doc.edges, edge],
    meta: {
      ...doc.meta,
      nextEdgeSeq: doc.meta.nextEdgeSeq + 1
    }
  };
}

export function validateEdge(doc: FlowDoc, from: NodeId, to: NodeId): EdgeValidationResult {
  const fromExists = doc.nodes.some(node => node.id === from);
  const toExists = doc.nodes.some(node => node.id === to);
  if (!fromExists || !toExists) {
    return { ok: false, reason: 'unknown-node' };
  }
  if (from === to) {
    return { ok: false, reason: 'self-edge' };
  }
  const exists = doc.edges.some(edge => edge.from === from && edge.to === to);
  if (exists) {
    return { ok: false, reason: 'duplicate-edge' };
  }
  return { ok: true };
}

function edgeSeq(edgeId: string): number {
  if (!edgeId.startsWith('e')) return Number.MAX_SAFE_INTEGER;
  const value = Number(edgeId.slice(1));
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

export function reparentNode(doc: FlowDoc, nodeId: NodeId, newParentId: NodeId): FlowDoc {
  assertNodeExists(doc, nodeId);
  assertNodeExists(doc, newParentId);
  if (nodeId === newParentId) return doc;

  const incoming = doc.edges
    .filter(edge => edge.to === nodeId && edge.from !== newParentId)
    .sort((a, b) => edgeSeq(a.id) - edgeSeq(b.id));

  let nextDoc = doc;
  if (incoming.length > 0) {
    nextDoc = removeEdge(nextDoc, incoming[0].id);
  }
  return addEdge(nextDoc, newParentId, nodeId);
}

export function removeEdge(doc: FlowDoc, edgeId: EdgeId): FlowDoc {
  return {
    ...doc,
    edges: doc.edges.filter(edge => edge.id !== edgeId)
  };
}

export function removeNode(doc: FlowDoc, nodeId: NodeId): FlowDoc {
  assertNodeExists(doc, nodeId);
  return {
    ...doc,
    nodes: doc.nodes.filter(node => node.id !== nodeId),
    edges: doc.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId)
  };
}

export function removeNodes(doc: FlowDoc, nodeIds: NodeId[]): FlowDoc {
  if (nodeIds.length === 0) return doc;
  for (const id of nodeIds) {
    assertNodeExists(doc, id);
  }
  const toDelete = new Set(nodeIds);
  return {
    ...doc,
    nodes: doc.nodes.filter(node => !toDelete.has(node.id)),
    edges: doc.edges.filter(edge => !toDelete.has(edge.from) && !toDelete.has(edge.to))
  };
}

export function serialize(doc: FlowDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(raw: string): FlowDoc {
  const parsed = JSON.parse(raw) as unknown;
  return migrateToLatest(parsed);
}
