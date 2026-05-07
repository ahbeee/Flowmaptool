export const SCHEMA_VERSION = 1;

export type NodeId = string;
export type EdgeId = string;

export type FlowNode = {
  id: NodeId;
  label: string;
  style?: NodeStyle;
  task?: NodeTask;
};

export type FlowEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  order?: number;
  style?: EdgeStyle;
  role?: EdgeRole;
  anchors?: EdgeAnchors;
};

export type FlowDocMeta = {
  nextNodeSeq: number;
  nextEdgeSeq: number;
};

export type FlowChecklist = {
  checkedNodeIds: NodeId[];
};

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TaskStatus = 'inbox' | 'next' | 'waiting' | 'scheduled' | 'done';
export type NodeShape = 'plain' | 'rounded' | 'pill' | 'underline' | 'square';
export type TextAlign = 'left' | 'center' | 'right';
export type EdgeLineType = 'solid' | 'dashed' | 'dotted';
export type EdgeRole = 'layout' | 'manual';
export type EdgeAnchor = 'auto' | 'front' | 'back' | 'body';

export type EdgeAnchors = {
  from?: EdgeAnchor;
  to?: EdgeAnchor;
};

export type EdgeStyle = {
  width?: number;
  lineType?: EdgeLineType;
  color?: string;
};

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

export type NodeTask = {
  enabled: boolean;
  done: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  assignee?: string;
  startDate?: string;
  dueDate?: string;
  note?: string;
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
  defaultEdgeStyle: EdgeStyle;
  tags: FlowTag[];
};

export type FlowDoc = {
  schemaVersion: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  meta: FlowDocMeta;
  settings: FlowSettings;
  checklist: FlowChecklist;
};

export type EdgeValidationResult =
  | { ok: true }
  | { ok: false; reason: 'unknown-node' | 'self-edge' | 'duplicate-edge' | 'same-side-anchors' };

type LegacyFlowDoc = {
  schemaVersion?: number;
  nodes?: Array<Partial<FlowNode> & { label?: unknown; id?: unknown }>;
  edges?: Array<Partial<FlowEdge> & { from?: unknown; to?: unknown; id?: unknown }>;
  meta?: Partial<FlowDocMeta>;
  settings?: Partial<FlowSettings>;
  checklist?: Partial<FlowChecklist>;
};

const DEFAULT_TAGS: FlowTag[] = [
  { id: 'tag-blue', name: 'Blue', color: '#3b82f6' },
  { id: 'tag-pink', name: 'Pending', color: '#ec4899' },
  { id: 'tag-green', name: 'Done', color: '#22c55e' },
  { id: 'tag-orange', name: 'Orange', color: '#f97316' }
];
const SPACING_MIN = 0;
const SPACING_MAX = 320;
const EDGE_WIDTH_MIN = 1;
const EDGE_WIDTH_MAX = 8;

export function createDefaultSettings(): FlowSettings {
  return {
    themeId: 'blue-gray',
    spacing: {
      horizontal: 48,
      vertical: 48
    },
    defaultShape: 'plain',
    defaultEdgeStyle: {
      width: 2,
      lineType: 'solid',
      color: '#64748b'
    },
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
    settings: createDefaultSettings(),
    checklist: {
      checkedNodeIds: []
    }
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

function sanitizeEdgeRole(input: unknown): EdgeRole | undefined {
  return input === 'layout' || input === 'manual' ? input : undefined;
}

function sanitizeEdgeAnchor(input: unknown): EdgeAnchor | undefined {
  return input === 'auto' || input === 'front' || input === 'back' || input === 'body' ? input : undefined;
}

function sanitizeEdgeAnchors(input: unknown): EdgeAnchors | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as EdgeAnchors;
  const from = sanitizeEdgeAnchor(raw.from);
  const to = sanitizeEdgeAnchor(raw.to);
  if (!from && !to) return undefined;
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {})
  };
}

function sanitizeEdgeOrder(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
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
    const role = sanitizeEdgeRole(rawEdge.role);
    const anchors = sanitizeEdgeAnchors(rawEdge.anchors);
    const order = sanitizeEdgeOrder(rawEdge.order);
    edges.push({
      id,
      from,
      to,
      ...(typeof order === 'number' ? { order } : {}),
      ...(role ? { role } : {}),
      ...(anchors ? { anchors } : {})
    });
  }
  return edges;
}

function normalizeMeta(nodes: FlowNode[], edges: FlowEdge[], rawMeta?: Partial<FlowDocMeta>): FlowDocMeta {
  const minNextNode =
    getMaxSeq(
      nodes.map(node => node.id),
      'n'
    ) + 1;
  const minNextEdge =
    getMaxSeq(
      edges.map(edge => edge.id),
      'e'
    ) + 1;
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
  if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize))
    next.fontSize = Math.max(10, Math.min(72, raw.fontSize));
  if (typeof raw.bold === 'boolean') next.bold = raw.bold;
  if (typeof raw.italic === 'boolean') next.italic = raw.italic;
  if (typeof raw.underline === 'boolean') next.underline = raw.underline;
  if (typeof raw.textColor === 'string') next.textColor = sanitizeHexColor(raw.textColor, '#0f172a');
  if (typeof raw.backgroundColor === 'string') next.backgroundColor = sanitizeHexColor(raw.backgroundColor, '#ffffff');
  if (raw.textAlign === 'left' || raw.textAlign === 'center' || raw.textAlign === 'right')
    next.textAlign = raw.textAlign;
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

function sanitizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeTaskPriority(value: unknown): TaskPriority {
  if (value === 'low' || value === 'high' || value === 'critical') return value;
  return 'normal';
}

function sanitizeTaskStatus(value: unknown, done: boolean): TaskStatus {
  if (done) return 'done';
  if (value === 'next' || value === 'waiting' || value === 'scheduled' || value === 'done') return value;
  return 'inbox';
}

function sanitizeTaskProgress(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeNodeTask(input: unknown): NodeTask | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Partial<NodeTask>;
  if (raw.enabled !== true) return undefined;
  const status = sanitizeTaskStatus(raw.status, raw.done === true);

  const task: NodeTask = {
    enabled: true,
    done: raw.done === true || status === 'done',
    status,
    priority: sanitizeTaskPriority(raw.priority),
    progress: sanitizeTaskProgress(raw.progress)
  };

  const assignee = sanitizeOptionalText(raw.assignee);
  if (assignee) task.assignee = assignee;
  const startDate = sanitizeOptionalText(raw.startDate);
  if (startDate) task.startDate = startDate;
  const dueDate = sanitizeOptionalText(raw.dueDate);
  if (dueDate) task.dueDate = dueDate;
  const note = sanitizeOptionalText(raw.note);
  if (note) task.note = note;
  return task;
}

function sanitizeEdgeStyle(input: unknown): EdgeStyle | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as EdgeStyle;
  const next: EdgeStyle = {};
  if (typeof raw.width === 'number' && Number.isFinite(raw.width)) {
    next.width = Math.max(EDGE_WIDTH_MIN, Math.min(EDGE_WIDTH_MAX, Math.round(raw.width)));
  }
  if (raw.lineType === 'solid' || raw.lineType === 'dashed' || raw.lineType === 'dotted') next.lineType = raw.lineType;
  if (typeof raw.color === 'string') next.color = sanitizeHexColor(raw.color, '#64748b');
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
      horizontal: Math.max(SPACING_MIN, Math.min(SPACING_MAX, raw.spacing?.horizontal ?? defaults.spacing.horizontal)),
      vertical: Math.max(SPACING_MIN, Math.min(SPACING_MAX, raw.spacing?.vertical ?? defaults.spacing.vertical))
    },
    defaultShape:
      raw.defaultShape === 'plain' ||
      raw.defaultShape === 'rounded' ||
      raw.defaultShape === 'pill' ||
      raw.defaultShape === 'underline' ||
      raw.defaultShape === 'square'
        ? raw.defaultShape
        : defaults.defaultShape,
    defaultEdgeStyle: sanitizeEdgeStyle(raw.defaultEdgeStyle) || defaults.defaultEdgeStyle,
    tags
  };
}

function sanitizeChecklist(input: LegacyFlowDoc['checklist'], validNodeIds: Set<NodeId>): FlowChecklist {
  const checkedNodeIds: NodeId[] = [];
  const seen = new Set<NodeId>();
  const rawNodeIds = Array.isArray(input?.checkedNodeIds) ? input.checkedNodeIds : [];

  for (const rawNodeId of rawNodeIds) {
    const nodeId = toStringId(rawNodeId);
    if (!nodeId || !validNodeIds.has(nodeId) || seen.has(nodeId)) continue;
    seen.add(nodeId);
    checkedNodeIds.push(nodeId);
  }

  return { checkedNodeIds };
}

export function migrateToLatest(input: unknown): FlowDoc {
  const legacy = (input || {}) as LegacyFlowDoc;
  const settings = sanitizeSettings(legacy.settings);
  const validTagIds = new Set(settings.tags.map(tag => tag.id));
  const nodes = sanitizeNodes(legacy.nodes).map(node => {
    const rawNode = Array.isArray(legacy.nodes) ? legacy.nodes.find(item => item.id === node.id) : undefined;
    const style = sanitizeNodeStyle(rawNode?.style, validTagIds);
    const task = sanitizeNodeTask(rawNode?.task);
    return {
      ...node,
      ...(style ? { style } : {}),
      ...(task ? { task } : {})
    };
  });
  const validNodeIds = new Set(nodes.map(node => node.id));
  const edges = sanitizeEdges(legacy.edges, validNodeIds).map(edge => {
    const rawEdge = Array.isArray(legacy.edges) ? legacy.edges.find(item => item.id === edge.id) : undefined;
    const style = sanitizeEdgeStyle(rawEdge?.style);
    return style ? { ...edge, style } : edge;
  });
  const meta = normalizeMeta(nodes, edges, legacy.meta);
  const checklist = sanitizeChecklist(legacy.checklist, validNodeIds);

  return {
    schemaVersion: SCHEMA_VERSION,
    nodes,
    edges,
    meta,
    settings,
    checklist
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
      return Object.keys(nextStyle).length > 0
        ? { ...node, style: nextStyle }
        : { id: node.id, label: node.label, ...(node.task ? { task: node.task } : {}) };
    })
  };
}

export function updateNodeTask(doc: FlowDoc, nodeIds: NodeId[], patch: Partial<NodeTask>): FlowDoc {
  const targets = new Set(nodeIds);
  for (const nodeId of targets) assertNodeExists(doc, nodeId);
  return {
    ...doc,
    nodes: doc.nodes.map(node => {
      if (!targets.has(node.id)) return node;
      if (patch.enabled === false) {
        return {
          id: node.id,
          label: node.label,
          ...(node.style ? { style: node.style } : {})
        };
      }
      const nextTask = sanitizeNodeTask({
        enabled: true,
        done: false,
        status: 'inbox',
        priority: 'normal',
        progress: 0,
        ...(node.task || {}),
        ...patch
      });
      return nextTask ? { ...node, task: nextTask } : node;
    })
  };
}

export function updateEdgeStyle(doc: FlowDoc, edgeIds: EdgeId[], patch: EdgeStyle): FlowDoc {
  const targets = new Set(edgeIds);
  for (const edgeId of targets) {
    if (!doc.edges.some(edge => edge.id === edgeId)) throw new Error(`unknown edge id: ${edgeId}`);
  }
  return {
    ...doc,
    edges: doc.edges.map(edge => {
      if (!targets.has(edge.id)) return edge;
      const nextStyle = { ...(edge.style || {}), ...patch };
      for (const [key, value] of Object.entries(nextStyle)) {
        if (value === undefined || value === '') delete (nextStyle as Record<string, unknown>)[key];
      }
      return Object.keys(nextStyle).length > 0
        ? { ...edge, style: nextStyle }
        : {
            id: edge.id,
            from: edge.from,
            to: edge.to,
            ...(typeof edge.order === 'number' ? { order: edge.order } : {}),
            ...(edge.role ? { role: edge.role } : {}),
            ...(edge.anchors ? { anchors: edge.anchors } : {})
          };
    })
  };
}

export function resetNodeStyle(doc: FlowDoc, nodeIds: NodeId[]): FlowDoc {
  const targets = new Set(nodeIds);
  for (const nodeId of targets) assertNodeExists(doc, nodeId);
  return {
    ...doc,
    nodes: doc.nodes.map(node =>
      targets.has(node.id) ? { id: node.id, label: node.label, ...(node.task ? { task: node.task } : {}) } : node
    )
  };
}

export function setNodeChecked(doc: FlowDoc, nodeId: NodeId, checked: boolean): FlowDoc {
  assertNodeExists(doc, nodeId);
  const checkedNodeIds = doc.checklist?.checkedNodeIds || [];
  const exists = checkedNodeIds.includes(nodeId);
  if (checked && exists) return doc;
  if (!checked && !exists) return doc;

  return {
    ...doc,
    checklist: {
      checkedNodeIds: checked ? [...checkedNodeIds, nodeId] : checkedNodeIds.filter(id => id !== nodeId)
    }
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
    name: tag.name,
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

export function addEdge(
  doc: FlowDoc,
  from: NodeId,
  to: NodeId,
  role: EdgeRole = 'layout',
  anchors?: EdgeAnchors
): FlowDoc {
  const validation = validateEdge(doc, from, to, role, anchors);
  if (!validation.ok) {
    if (validation.reason === 'unknown-node') {
      throw new Error(`unknown node id: ${from} or ${to}`);
    }
    return doc;
  }

  const edge: FlowEdge = {
    id: nextEdgeId(doc),
    from,
    to,
    order: doc.meta.nextEdgeSeq,
    ...(role !== 'layout' ? { role } : {}),
    ...(anchors ? { anchors } : {}),
    style: { ...doc.settings.defaultEdgeStyle }
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

function edgeRole(edge: FlowEdge): EdgeRole {
  return edge.role || 'layout';
}

function sameAnchors(a?: EdgeAnchors, b?: EdgeAnchors): boolean {
  return (a?.from || 'auto') === (b?.from || 'auto') && (a?.to || 'auto') === (b?.to || 'auto');
}

export function validateEdge(
  doc: FlowDoc,
  from: NodeId,
  to: NodeId,
  role: EdgeRole = 'layout',
  anchors?: EdgeAnchors
): EdgeValidationResult {
  const fromExists = doc.nodes.some(node => node.id === from);
  const toExists = doc.nodes.some(node => node.id === to);
  if (!fromExists || !toExists) {
    return { ok: false, reason: 'unknown-node' };
  }
  if (from === to) {
    return { ok: false, reason: 'self-edge' };
  }
  if ((anchors?.from === 'front' && anchors.to === 'front') || (anchors?.from === 'back' && anchors.to === 'back')) {
    return { ok: false, reason: 'same-side-anchors' };
  }
  const exists = doc.edges.some(
    edge => edge.from === from && edge.to === to && edgeRole(edge) === role && sameAnchors(edge.anchors, anchors)
  );
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
    edges: doc.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId),
    checklist: {
      checkedNodeIds: (doc.checklist?.checkedNodeIds || []).filter(id => id !== nodeId)
    }
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
    edges: doc.edges.filter(edge => !toDelete.has(edge.from) && !toDelete.has(edge.to)),
    checklist: {
      checkedNodeIds: (doc.checklist?.checkedNodeIds || []).filter(id => !toDelete.has(id))
    }
  };
}

export function serialize(doc: FlowDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(raw: string): FlowDoc {
  const parsed = JSON.parse(raw) as unknown;
  return migrateToLatest(parsed);
}
