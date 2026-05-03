import React from 'react';
import {
  addEdge,
  addNode,
  deleteTag,
  reparentNode,
  removeEdge,
  removeNodes,
  resetNodeStyle,
  setNodeChecked,
  updateEdgeStyle,
  updateNodeLabel,
  updateNodeStyle,
  updateNodeTask,
  updateSettings,
  upsertTag,
  validateEdge,
  type FlowEdge,
  type FlowTag,
  type FlowDoc,
  type EdgeLineType,
  type EdgeAnchors,
  type EdgeId,
  type EdgeStyle,
  type FlowNode,
  type NodeId,
  type NodeShape,
  type NodeStyle,
  type NodeTask,
  type TaskPriority,
  type TextAlign
} from '@shared/graph';
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory
} from '@shared/history';
import {
  getLayoutSecondaryGap,
  layoutFlow,
  type LayoutDirection,
  type NodeSize,
  type NodeSizeMap
} from '@shared/layout';
import {
  applyNodeOffset,
  getLayerReorderPreview,
  getNodeOffset,
  hasAnyNodeOffset,
  mergeNodeOffsets,
  removeNodeOffsets,
  type NodeOffset,
  type NodeOffsetMap
} from '@shared/local-reflow';
import { extractSelection, pasteDetached, type CopiedSelection } from '@shared/subflow';
import {
  FRONT_HANDLE_CONNECT_ANCHORS,
  HANDLE_CONNECT_ANCHORS,
  isNodeSideAnchor,
  resolveDraggedEdgeAnchors,
  reverseEdgeAnchors
} from './connect-anchors';
import {
  applyEdgeUiSnapshot,
  cloneEdgeBendMap,
  cloneEdgeBendsByDirection,
  cloneEdgeRouteMap,
  cloneEdgeRoutesByDirection,
  edgeUiSnapshotsEqual,
  emptyInteractionHistory,
  getEdgeUiSnapshot,
  pushInteractionPast,
  translateEdgeBendsForMovedNodes,
  translateEdgeRoutesForMovedNodes,
  type EdgeUiSnapshot
} from './edge-ui-state';
import {
  createSeedDoc,
  createTabDocument,
  ensureDocHasNode,
  NEW_NODE_LABEL,
  ROOT_LABEL,
  type TabDocument
} from './document-state';
import {
  distanceToPathSquared,
  edgeMidpoint,
  edgePath,
  routeControlPoint,
  routeFromBend,
  shouldBendEdge
} from './edge-path';
import {
  computeAutoEdgeRoute,
  edgeIntersectsNodeCorridor,
  filterNodeBoxesByIds,
  getDirectionalAnchorPoint,
  getEdgeRenderEndpoints,
  getEndpointSpacingOffset,
  getNodeCenter,
  getRouteSpacingOffsets,
  isForwardIncomingManualEdge,
  routeForwardIncomingConverge,
  routeFromSnappedDraggedControl,
  type DraggedRouteEndpointOffsets,
  type LayoutPoint,
  type RouteSpacing
} from './edge-routing';
import { basename, bytesToBase64, escapeXml } from './export-utils';
import {
  analyzeLayoutEdges,
  collectConnectedComponent,
  collectEdgeComponent,
  getOrderedLayoutChildEdges,
  getPrimaryParentEdge,
  getPrimaryParentId,
  type LayoutEdgeAnalysis
} from './graph-analysis';
import {
  createChildNodeStyle,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_NODE_SIZE,
  estimateNodeSize,
  NODE_PADDING_X,
  NODE_TEXT_BASELINE_Y,
  ROOT_NODE_STYLE
} from './node-style';
import {
  buildOutlineChecklistTargetsByNodeId,
  buildOutlineTree,
  toggleCollapsedOutlineNodeIds,
  type OutlineTreeNode
} from './outline';
import {
  emptyEdgeBendsByDirection,
  emptyEdgeRoutesByDirection,
  emptyOffsetsByDirection,
  parsePersistedQflow,
  serializePersistedQflow,
  type EdgeBend,
  type EdgeBendMap,
  type EdgeRoute,
  type EdgeRouteMap
} from './persistence';
import {
  distanceSquared,
  pointInsideBox,
  routeLength,
  segmentIntersectsBox,
  segmentsIntersect,
  type NodeBox,
  type Point
} from './routing-geometry';
import {
  buildTaskTableRows,
  getNextTaskTableSort,
  getTaskNodeLabel,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TABLE_COLUMNS,
  type TaskTableSort,
  type TaskTableSortKey
} from './task-table';
import {
  boxesOverlap,
  clampNodeLabel,
  edgeStrokeDasharray,
  effectiveEdgeStyle,
  getSelectedStyleEdges,
  hasMixedValues,
  nextCustomTagId,
  pruneSelectionForDoc,
  sameValues
} from './ui-helpers';
import {
  ADVANCED_ROUTE_EDGE_LIMIT,
  ADVANCED_ROUTE_NODE_LIMIT,
  clamp,
  clampSidePanelWidth,
  COLOR_SWATCHES,
  EDGE_LINE_TYPES,
  EDGE_WIDTHS,
  FONT_FAMILIES,
  FONT_SIZES,
  getTheme,
  MIXED_OPTION,
  NODE_SHAPES,
  PNG_FILTER,
  SIDE_PANEL_DEFAULT_WIDTH,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SPACING_MAX,
  SPACING_MIN,
  THEMES
} from './ui-config';
import {
  getConnectHandleHitFromViewportPoint,
  getNodeIdFromEventTarget,
  getNodeIdFromViewportPoint,
  getViewportConnectHandleHit,
  isNodeLabelInputTarget,
  isViewportPointOnConnectHandle
} from './viewport-hit-testing';

type DragState = {
  nodeIds: NodeId[];
  anchorNodeId: NodeId;
  startX: number;
  startY: number;
  startOffsets: Record<NodeId, NodeOffset>;
  startEdgeBends: EdgeBendMap;
  startEdgeRoutes: EdgeRouteMap;
};
type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type EdgeBendDragState = { edgeId: string; pointIndex: number };
type EdgeRouteControlSelection = { edgeId: string; pointIndex: number };
type SidePanelResizeState = { pointerId: number; startX: number; startWidth: number };
type ConnectDragState = {
  fromNodeId: NodeId;
  anchors: EdgeAnchors;
  start: Point;
  current: Point;
  hoverTargetNodeId: NodeId | null;
};
type DragPointerLikeEvent = {
  clientX: number;
  clientY: number;
  target?: EventTarget | null;
};
type SvgEdgeSnapshot = {
  id: string;
  from: Point;
  to: Point;
  lane: number;
  fromSize: NodeSize;
  toSize: NodeSize;
  forceBend: boolean;
  style: Required<EdgeStyle>;
  route?: EdgeRoute;
};

type SvgNodeSnapshot = {
  id: NodeId;
  label: string;
  style: NodeStyle | undefined;
  isRoot: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};
export function App() {
  const [tabs, setTabs] = React.useState<TabDocument[]>([createTabDocument('tab-1', 'Untitled 1')]);
  const [activeTabId, setActiveTabId] = React.useState('tab-1');
  const [tabCounter, setTabCounter] = React.useState(2);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState('');
  const [selectedRouteControl, setSelectedRouteControl] = React.useState<EdgeRouteControlSelection | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<NodeId[]>([]);
  const selectedNodeIdsRef = React.useRef<NodeId[]>([]);
  const [copiedSelection, setCopiedSelection] = React.useState<CopiedSelection | null>(null);
  const [editingNodeId, setEditingNodeId] = React.useState<NodeId | null>(null);
  const [editingLabel, setEditingLabel] = React.useState('');
  const editingNodeIdRef = React.useRef<NodeId | null>(null);
  const editingLabelRef = React.useRef('');
  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const [marquee, setMarquee] = React.useState<MarqueeState | null>(null);
  const [edgeBendDrag, setEdgeBendDrag] = React.useState<EdgeBendDragState | null>(null);
  const edgeBendDragStartSnapshotRef = React.useRef<EdgeUiSnapshot | null>(null);
  const [connectDrag, setConnectDrag] = React.useState<ConnectDragState | null>(null);
  const connectDragRef = React.useRef<ConnectDragState | null>(null);
  const [dropParentTargetId, setDropParentTargetId] = React.useState<NodeId | null>(null);
  const [fileMessage, setFileMessage] = React.useState('Ready');
  const [canvasZoom, setCanvasZoom] = React.useState(1);
  const [newTagColor, setNewTagColor] = React.useState(COLOR_SWATCHES[0]);
  const [outlineVisible, setOutlineVisible] = React.useState(true);
  const [taskTableVisible, setTaskTableVisible] = React.useState(false);
  const [taskTableExpanded, setTaskTableExpanded] = React.useState(false);
  const [taskTableSort, setTaskTableSort] = React.useState<TaskTableSort | undefined>();
  const [sidePanelWidth, setSidePanelWidth] = React.useState(SIDE_PANEL_DEFAULT_WIDTH);
  const [sidePanelResizing, setSidePanelResizing] = React.useState(false);
  const [collapsedOutlineNodeIds, setCollapsedOutlineNodeIds] = React.useState<Set<NodeId>>(() => new Set());
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const canvasSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const sidePanelResizeRef = React.useRef<SidePanelResizeState | null>(null);
  const dragDidMoveRef = React.useRef(false);
  const suppressNextEdgeClickRef = React.useRef(false);
  const pendingRightConnectFromRef = React.useRef<NodeId | null>(null);
  const pendingRightConnectAnchorsRef = React.useRef<EdgeAnchors>(HANDLE_CONNECT_ANCHORS);
  const connectDragListenersRef = React.useRef<{
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onMouseMove: (event: MouseEvent) => void;
    onMouseUp: (event: MouseEvent) => void;
  } | null>(null);
  const edgeSegmentDragListenersRef = React.useRef<{
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
  } | null>(null);

  const onSidePanelResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      sidePanelResizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidePanelWidth
      };
      setSidePanelResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }
      event.preventDefault();
    },
    [sidePanelWidth]
  );

  const finishSidePanelResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = sidePanelResizeRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;

    sidePanelResizeRef.current = null;
    setSidePanelResizing(false);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onSidePanelResizePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = sidePanelResizeRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    setSidePanelWidth(clampSidePanelWidth(resizeState.startWidth + event.clientX - resizeState.startX));
  }, []);

  const onSidePanelResizeKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -16 : 16;
    setSidePanelWidth(width => clampSidePanelWidth(width + delta));
  }, []);

  React.useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, []);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
  const doc = activeTab.history.present;
  const isLiveCanvasInteraction = Boolean(dragState || marquee || edgeBendDrag || connectDrag);
  const layoutDirection = activeTab.layoutDirection;
  const nodeOffsets = activeTab.nodeOffsetsByDirection[layoutDirection];
  const edgeBends = activeTab.edgeBendsByDirection[layoutDirection];
  const edgeRoutes = activeTab.edgeRoutesByDirection[layoutDirection];
  selectedNodeIdsRef.current = selectedNodeIds;
  const activeTheme = getTheme(doc.settings.themeId);
  const layoutEdgeAnalysis = React.useMemo(() => analyzeLayoutEdges(doc), [doc]);
  const layoutDoc = React.useMemo(
    () => ({ ...doc, edges: layoutEdgeAnalysis.layoutEdges }),
    [doc, layoutEdgeAnalysis.layoutEdges]
  );
  const outlineTree = React.useMemo(() => buildOutlineTree(doc), [doc]);
  const rootNodeIds = layoutEdgeAnalysis.rootNodeIds;
  const primaryRootNodeId = React.useMemo(
    () => doc.nodes.find(node => rootNodeIds.has(node.id))?.id || '',
    [doc.nodes, rootNodeIds]
  );
  const selectedNodes = React.useMemo(
    () => doc.nodes.filter(node => selectedNodeIds.includes(node.id)),
    [doc.nodes, selectedNodeIds]
  );
  const nodeById = React.useMemo(() => new Map(doc.nodes.map(node => [node.id, node])), [doc.nodes]);
  const selectedNodeIdSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const checkedNodeIdSet = React.useMemo(
    () => new Set(doc.checklist.checkedNodeIds),
    [doc.checklist.checkedNodeIds]
  );
  const tagById = React.useMemo(() => new Map(doc.settings.tags.map(tag => [tag.id, tag])), [doc.settings.tags]);
  const outlineChecklistTargetsByNodeId = React.useMemo(
    () => buildOutlineChecklistTargetsByNodeId(outlineTree, new Set(tagById.keys())),
    [outlineTree, tagById]
  );
  const isChecklistNodeChecked = React.useCallback(
    (nodeId: NodeId) => checkedNodeIdSet.has(nodeId),
    [checkedNodeIdSet]
  );
  const taskTableRows = React.useMemo(
    () => buildTaskTableRows(outlineTree, tagById, taskTableSort),
    [outlineTree, tagById, taskTableSort]
  );
  const selectedStyleEdges = React.useMemo(
    () => getSelectedStyleEdges(doc.edges, selectedEdgeId, selectedNodeIds),
    [doc.edges, selectedEdgeId, selectedNodeIds]
  );

  const updateActiveTab = React.useCallback((recipe: (tab: TabDocument) => TabDocument) => {
    setTabs(prev => prev.map(tab => (tab.id === activeTabId ? recipe(tab) : tab)));
  }, [activeTabId]);

  const stopConnectDragListeners = React.useCallback(() => {
    const handlers = connectDragListenersRef.current;
    if (!handlers) return;
    window.removeEventListener('pointermove', handlers.onPointerMove);
    window.removeEventListener('pointerup', handlers.onPointerUp);
    window.removeEventListener('mousemove', handlers.onMouseMove);
    window.removeEventListener('mouseup', handlers.onMouseUp);
    connectDragListenersRef.current = null;
  }, []);

  const stopEdgeSegmentDragListeners = React.useCallback(() => {
    const handlers = edgeSegmentDragListenersRef.current;
    if (!handlers) return;
    window.removeEventListener('pointermove', handlers.onPointerMove);
    window.removeEventListener('pointerup', handlers.onPointerUp);
    edgeSegmentDragListenersRef.current = null;
  }, []);

  const resetTransientUiState = React.useCallback((defaultNodeId?: NodeId) => {
    stopConnectDragListeners();
    stopEdgeSegmentDragListeners();
    setSelectedEdgeId('');
    setSelectedRouteControl(null);
    setSelectedNodeIds(defaultNodeId ? [defaultNodeId] : []);
    setCopiedSelection(null);
    setEditingNodeId(null);
    setEditingLabel('');
    editingNodeIdRef.current = null;
    editingLabelRef.current = '';
    setMarquee(null);
    setDragState(null);
    setEdgeBendDrag(null);
    connectDragRef.current = null;
    setConnectDrag(null);
    setDropParentTargetId(null);
  }, [stopConnectDragListeners, stopEdgeSegmentDragListeners]);

  const setCurrentNodeOffsets = React.useCallback((updater: (prev: NodeOffsetMap) => NodeOffsetMap) => {
    updateActiveTab(tab => ({
      ...tab,
      nodeOffsetsByDirection: {
        ...tab.nodeOffsetsByDirection,
        [tab.layoutDirection]: updater(tab.nodeOffsetsByDirection[tab.layoutDirection])
      }
    }));
  }, [updateActiveTab]);

  const restoreCurrentNodeOffsets = React.useCallback((offsets: Record<NodeId, NodeOffset>) => {
    setCurrentNodeOffsets(prev => mergeNodeOffsets(prev, offsets));
  }, [setCurrentNodeOffsets]);

  const setCurrentEdgeBends = React.useCallback((updater: (prev: EdgeBendMap) => EdgeBendMap) => {
    updateActiveTab(tab => ({
      ...tab,
      edgeBendsByDirection: {
        ...tab.edgeBendsByDirection,
        [tab.layoutDirection]: updater(tab.edgeBendsByDirection[tab.layoutDirection])
      }
    }));
  }, [updateActiveTab]);

  const setCurrentEdgeRoutes = React.useCallback((updater: (prev: EdgeRouteMap) => EdgeRouteMap) => {
    updateActiveTab(tab => ({
      ...tab,
      edgeRoutesByDirection: {
        ...tab.edgeRoutesByDirection,
        [tab.layoutDirection]: updater(tab.edgeRoutesByDirection[tab.layoutDirection])
      }
    }));
  }, [updateActiveTab]);

  const commitEdgeUiChange = React.useCallback(
    (recipe: (snapshot: EdgeUiSnapshot, layoutDirection: LayoutDirection) => EdgeUiSnapshot) => {
      updateActiveTab(tab => {
        const before = getEdgeUiSnapshot(tab);
        const after = recipe(before, tab.layoutDirection);
        if (edgeUiSnapshotsEqual(before, after)) return tab;
        return {
          ...applyEdgeUiSnapshot(tab, after),
          isDirty: true,
          interactionHistory: {
            past: pushInteractionPast(tab.interactionHistory.past, { kind: 'edge-ui', snapshot: before }),
            future: []
          }
        };
      });
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const commitCurrentEdgeUiSnapshot = React.useCallback(
    (before: EdgeUiSnapshot | null) => {
      if (!before) return;
      updateActiveTab(tab => {
        const after = getEdgeUiSnapshot(tab);
        if (edgeUiSnapshotsEqual(before, after)) return tab;
        return {
          ...tab,
          isDirty: true,
          interactionHistory: {
            past: pushInteractionPast(tab.interactionHistory.past, { kind: 'edge-ui', snapshot: before }),
            future: []
          }
        };
      });
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const undoInteraction = React.useCallback(() => {
    updateActiveTab(tab => {
      const entry = tab.interactionHistory.past[tab.interactionHistory.past.length - 1];
      if (!entry) {
        const nextHistory = undoHistory(tab.history);
        return nextHistory === tab.history ? tab : { ...tab, history: nextHistory, isDirty: true };
      }
      const base = {
        ...tab,
        isDirty: true,
        interactionHistory: {
          past: tab.interactionHistory.past.slice(0, -1),
          future: [
            entry.kind === 'edge-ui'
              ? { kind: 'edge-ui' as const, snapshot: getEdgeUiSnapshot(tab) }
              : { kind: 'doc' as const },
            ...tab.interactionHistory.future
          ]
        }
      };
      return entry.kind === 'edge-ui'
        ? applyEdgeUiSnapshot(base, entry.snapshot)
        : { ...base, history: undoHistory(tab.history) };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const redoInteraction = React.useCallback(() => {
    updateActiveTab(tab => {
      const entry = tab.interactionHistory.future[0];
      if (!entry) {
        const nextHistory = redoHistory(tab.history);
        return nextHistory === tab.history ? tab : { ...tab, history: nextHistory, isDirty: true };
      }
      const base = {
        ...tab,
        isDirty: true,
        interactionHistory: {
          past: pushInteractionPast(
            tab.interactionHistory.past,
            entry.kind === 'edge-ui'
              ? { kind: 'edge-ui' as const, snapshot: getEdgeUiSnapshot(tab) }
              : { kind: 'doc' as const }
          ),
          future: tab.interactionHistory.future.slice(1)
        }
      };
      return entry.kind === 'edge-ui'
        ? applyEdgeUiSnapshot(base, entry.snapshot)
        : { ...base, history: redoHistory(tab.history) };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const autoPanCanvas = React.useCallback((event: DragPointerLikeEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const threshold = 44;
    const maxStep = 24;
    let deltaX = 0;
    let deltaY = 0;
    if (event.clientX < rect.left + threshold) {
      deltaX = -Math.min(maxStep, rect.left + threshold - event.clientX);
    } else if (event.clientX > rect.right - threshold) {
      deltaX = Math.min(maxStep, event.clientX - (rect.right - threshold));
    }
    if (event.clientY < rect.top + threshold) {
      deltaY = -Math.min(maxStep, rect.top + threshold - event.clientY);
    } else if (event.clientY > rect.bottom - threshold) {
      deltaY = Math.min(maxStep, event.clientY - (rect.bottom - threshold));
    }
    if (deltaX === 0 && deltaY === 0) return;
    const maxScrollLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
    const maxScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
    canvas.scrollLeft = clamp(canvas.scrollLeft + deltaX, 0, maxScrollLeft);
    canvas.scrollTop = clamp(canvas.scrollTop + deltaY, 0, maxScrollTop);
  }, []);

  const getCanvasContentPoint = React.useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const surface = canvasSurfaceRef.current;
      const rect = surface?.getBoundingClientRect() || canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / canvasZoom,
        y: (clientY - rect.top) / canvasZoom
      };
    },
    [canvasZoom]
  );

  const getSvgContentPoint = React.useCallback((svg: SVGSVGElement | null, clientX: number, clientY: number): Point | null => {
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const commitDoc = React.useCallback((recipe: (current: FlowDoc) => FlowDoc) => {
    updateActiveTab(tab => {
      const nextDoc = ensureDocHasNode(recipe(tab.history.present));
      const nextHistory = commitHistory(tab.history, nextDoc);
      return {
        ...tab,
        history: nextHistory,
        interactionHistory:
          nextHistory === tab.history
            ? tab.interactionHistory
            : {
                past: pushInteractionPast(tab.interactionHistory.past, { kind: 'doc' }),
                future: []
              },
        isDirty: true
      };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const toggleChecklistNodes = React.useCallback(
    (nodeIds: NodeId[], checked: boolean) => {
      if (nodeIds.length === 0) return;
      commitDoc(prev => nodeIds.reduce((nextDoc, nodeId) => setNodeChecked(nextDoc, nodeId, checked), prev));
    },
    [commitDoc]
  );

  const newTab = React.useCallback(() => {
    const id = `tab-${tabCounter}`;
    const title = `Untitled ${tabCounter}`;
    setTabs(prev => [...prev, createTabDocument(id, title)]);
    setActiveTabId(id);
    setTabCounter(prev => prev + 1);
    setFileMessage('New tab');
    resetTransientUiState('n1');
  }, [resetTransientUiState, tabCounter]);

  const closeTab = React.useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length === 1) return prev;
      const index = prev.findIndex(tab => tab.id === tabId);
      const next = prev.filter(tab => tab.id !== tabId);
      if (tabId === activeTabId) {
        const fallback = next[Math.max(0, index - 1)] || next[0];
        setActiveTabId(fallback.id);
      }
      return next;
    });
    setFileMessage('Tab closed');
    resetTransientUiState();
  }, [activeTabId, resetTransientUiState]);

  const switchTab = React.useCallback((tabId: string) => {
    setActiveTabId(tabId);
    const tab = tabs.find(item => item.id === tabId);
    const firstNodeId = tab?.history.present.nodes[0]?.id;
    resetTransientUiState(firstNodeId);
  }, [resetTransientUiState, tabs]);

  const createNewDocument = React.useCallback(() => {
    const nextDoc = createSeedDoc();
    updateActiveTab(tab => ({
      ...tab,
      history: createHistory(nextDoc),
      currentFilePath: null,
      isDirty: false,
      title: tab.title.startsWith('Untitled') ? tab.title : `Untitled ${tabCounter}`,
      nodeOffsetsByDirection: emptyOffsetsByDirection(),
      edgeBendsByDirection: emptyEdgeBendsByDirection(),
      edgeRoutesByDirection: emptyEdgeRoutesByDirection(),
      toolbarVisible: true,
      interactionHistory: emptyInteractionHistory()
    }));
    setFileMessage('New document');
    resetTransientUiState(nextDoc.nodes[0]?.id);
  }, [resetTransientUiState, tabCounter, updateActiveTab]);

  const openDocument = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.openDocument();
      if (!result) return;
      const loaded = parsePersistedQflow(result.content, {
        emptyRootLabel: ROOT_LABEL,
        emptyRootStyle: ROOT_NODE_STYLE
      });
      const id = `tab-${tabCounter}`;
      setTabs(prev => [
        ...prev,
        {
          ...createTabDocument(id, basename(result.filePath), loaded.doc),
          currentFilePath: result.filePath,
          layoutDirection: loaded.ui.layoutDirection,
          nodeOffsetsByDirection: loaded.ui.nodeOffsetsByDirection,
          edgeBendsByDirection: loaded.ui.edgeBendsByDirection,
          edgeRoutesByDirection: loaded.ui.edgeRoutesByDirection,
          toolbarVisible: loaded.ui.toolbarVisible
        }
      ]);
      setActiveTabId(id);
      setTabCounter(prev => prev + 1);
      setFileMessage(`Opened: ${result.filePath}`);
      resetTransientUiState(loaded.doc.nodes[0]?.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open file';
      setFileMessage(`Open failed: ${message}`);
    }
  }, [resetTransientUiState, tabCounter]);

  const saveDocument = React.useCallback(
    async (saveAs: boolean) => {
      try {
        const result = await window.flowmaptool.saveDocument({
          filePath: activeTab.currentFilePath,
          content: serializePersistedQflow({
            doc: activeTab.history.present,
            layoutDirection: activeTab.layoutDirection,
            nodeOffsetsByDirection: activeTab.nodeOffsetsByDirection,
            edgeBendsByDirection: activeTab.edgeBendsByDirection,
            edgeRoutesByDirection: activeTab.edgeRoutesByDirection,
            toolbarVisible: activeTab.toolbarVisible
          }),
          saveAs
        });
        if (!result) return;
        updateActiveTab(tab => ({
          ...tab,
          currentFilePath: result.filePath,
          title: basename(result.filePath),
          isDirty: false
        }));
        setFileMessage(`Saved: ${result.filePath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save file';
        setFileMessage(`Save failed: ${message}`);
      }
    },
    [activeTab, updateActiveTab]
  );

  const nodeSizeMap = React.useMemo<NodeSizeMap>(() => {
    const sizes: NodeSizeMap = {};
    for (const node of doc.nodes) {
      const effectiveLabel = editingNodeId === node.id ? editingLabel : node.label;
      sizes[node.id] = estimateNodeSize(effectiveLabel, node.style);
    }
    return sizes;
  }, [doc.nodes, editingLabel, editingNodeId]);

  const layoutSpacing = React.useMemo(
    () =>
      layoutDirection === 'horizontal'
        ? {
            primary: doc.settings.spacing.horizontal,
            secondary: doc.settings.spacing.vertical
          }
        : {
            primary: doc.settings.spacing.vertical,
            secondary: doc.settings.spacing.horizontal
          },
    [doc.settings.spacing.horizontal, doc.settings.spacing.vertical, layoutDirection]
  );

  const layout = React.useMemo(
    () => layoutFlow(layoutDoc, layoutDirection, nodeSizeMap, layoutSpacing),
    [layoutDoc, layoutDirection, layoutSpacing, nodeSizeMap]
  );
  const renderedPositionMap = React.useMemo(() => {
    const map = new Map<NodeId, LayoutPoint>();
    for (const pos of layout.positions) {
      const withOffset = applyNodeOffset(pos, getNodeOffset(nodeOffsets, pos.id));
      map.set(pos.id, { x: withOffset.x, y: withOffset.y });
    }
    return map;
  }, [layout.positions, nodeOffsets]);

  const scrollNodeIntoCanvas = React.useCallback(
    (nodeId: NodeId) => {
      const canvas = canvasRef.current;
      const rendered = renderedPositionMap.get(nodeId);
      if (!canvas || !rendered) return;
      const size = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
      canvas.scrollTo({
        left: Math.max(0, (rendered.x + size.width / 2) * canvasZoom - canvas.clientWidth / 2),
        top: Math.max(0, (rendered.y + size.height / 2) * canvasZoom - canvas.clientHeight / 2),
        behavior: 'auto'
      });
    },
    [canvasZoom, nodeSizeMap, renderedPositionMap]
  );

  const nodeBoxMap = React.useMemo(() => {
    const map = new Map<NodeId, NodeBox>();
    for (const node of doc.nodes) {
      const pos = renderedPositionMap.get(node.id);
      const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
      if (!pos) continue;
      map.set(node.id, {
        left: pos.x,
        right: pos.x + size.width,
        top: pos.y,
        bottom: pos.y + size.height
      });
    }
    return map;
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const routeScopeNodeIdsByNodeId = React.useMemo(() => {
    const map = new Map<NodeId, NodeId[]>();
    for (const node of doc.nodes) {
      if (map.has(node.id)) continue;
      const componentNodeIds = collectEdgeComponent(doc, node.id, layoutEdgeAnalysis.layoutEdgeIds);
      for (const componentNodeId of componentNodeIds) {
        map.set(componentNodeId, componentNodeIds);
      }
    }
    return map;
  }, [doc, layoutEdgeAnalysis.layoutEdgeIds]);

  const getRouteNodeBoxes = React.useCallback(
    (edge: FlowEdge) => {
      const componentNodeIds = new Set<NodeId>();
      for (const nodeId of routeScopeNodeIdsByNodeId.get(edge.from) || [edge.from]) {
        componentNodeIds.add(nodeId);
      }
      for (const nodeId of routeScopeNodeIdsByNodeId.get(edge.to) || [edge.to]) {
        componentNodeIds.add(nodeId);
      }
      const scopedNodeBoxes = filterNodeBoxesByIds(nodeBoxMap, [...componentNodeIds]);
      return scopedNodeBoxes.size > 0 ? scopedNodeBoxes : nodeBoxMap;
    },
    [nodeBoxMap, routeScopeNodeIdsByNodeId]
  );

  const getRenderedEdgeEndpoints = React.useCallback(
    (edge: FlowEdge, fromPos: LayoutPoint, toPos: LayoutPoint, fromSize: NodeSize, toSize: NodeSize) =>
      getEdgeRenderEndpoints(
        edge,
        fromPos,
        toPos,
        layoutDirection,
        fromSize,
        toSize,
        layoutEdgeAnalysis.layoutEdgeIds.has(edge.id),
        rootNodeIds.has(edge.to)
      ),
    [layoutDirection, layoutEdgeAnalysis.layoutEdgeIds, rootNodeIds]
  );

  const useAdvancedAutoRouting =
    doc.nodes.length <= ADVANCED_ROUTE_NODE_LIMIT && doc.edges.length <= ADVANCED_ROUTE_EDGE_LIMIT;

  const edgeForceBendMap = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      if (!useAdvancedAutoRouting && edge.role !== 'manual') {
        map.set(edge.id, !layoutEdgeAnalysis.layoutEdgeIds.has(edge.id));
        continue;
      }
      const routeNodeBoxes = getRouteNodeBoxes(edge);
      map.set(
        edge.id,
        !layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) ||
          edgeIntersectsNodeCorridor(endpoints.from, endpoints.to, layoutDirection, edge.from, edge.to, routeNodeBoxes)
      );
    }
    return map;
  }, [
    doc.edges,
    getRenderedEdgeEndpoints,
    getRouteNodeBoxes,
    layoutSpacing,
    layoutDirection,
    layoutEdgeAnalysis.layoutEdgeIds,
    nodeSizeMap,
    renderedPositionMap,
    useAdvancedAutoRouting
  ]);

  const edgeLaneMap = React.useMemo(() => {
    const laneByEdgeId = new Map<string, number>();
    const byFrom = new Map<NodeId, { id: string; delta: number; needsBend: boolean }[]>();
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const forceBend = edgeForceBendMap.get(edge.id) || false;
      const needsBend = forceBend || shouldBendEdge(endpoints.from, endpoints.to, layoutDirection, fromSize, toSize);
      if (!needsBend) {
        laneByEdgeId.set(edge.id, 0);
        continue;
      }
      const delta = layoutDirection === 'horizontal'
        ? Math.abs(endpoints.to.y - endpoints.from.y)
        : Math.abs(endpoints.to.x - endpoints.from.x);
      const group = byFrom.get(edge.from) || [];
      group.push({ id: edge.id, delta, needsBend });
      byFrom.set(edge.from, group);
    }
    for (const group of byFrom.values()) {
      group.sort((a, b) => a.delta - b.delta || a.id.localeCompare(b.id));
      group.forEach((entry, index) => {
        laneByEdgeId.set(entry.id, index);
      });
    }
    return laneByEdgeId;
  }, [doc.edges, edgeForceBendMap, getRenderedEdgeEndpoints, layoutDirection, nodeSizeMap, renderedPositionMap]);

  const autoEdgeRouteMap = React.useMemo(() => {
    const map = new Map<string, EdgeRoute>();
    const forwardIncomingManualEdgesByTarget = new Map<NodeId, Set<EdgeId>>();

    for (const edge of doc.edges) {
      if (edgeRoutes[edge.id] || edgeBends[edge.id]) continue;
      if (!edgeForceBendMap.get(edge.id)) continue;
      if (!useAdvancedAutoRouting && edge.role !== 'manual') continue;
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      if (!isForwardIncomingManualEdge(edge, endpoints.from, endpoints.to, layoutDirection, layoutEdgeAnalysis.layoutEdgeIds)) {
        continue;
      }
      const group = forwardIncomingManualEdgesByTarget.get(edge.to) || new Set<EdgeId>();
      group.add(edge.id);
      forwardIncomingManualEdgesByTarget.set(edge.to, group);
    }

    for (const edge of doc.edges) {
      if (edgeRoutes[edge.id] || edgeBends[edge.id]) continue;
      if (!edgeForceBendMap.get(edge.id)) continue;
      if (!useAdvancedAutoRouting && edge.role !== 'manual') continue;
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const routeNodeBoxes = getRouteNodeBoxes(edge);
      const forwardIncomingManualGroup = forwardIncomingManualEdgesByTarget.get(edge.to);
      const route = forwardIncomingManualGroup && forwardIncomingManualGroup.size >= 2 && forwardIncomingManualGroup.has(edge.id)
        ? routeForwardIncomingConverge(
          endpoints.from,
          endpoints.to,
          layoutDirection,
          layoutDirection === 'horizontal' ? doc.settings.spacing.horizontal : doc.settings.spacing.vertical
        )
        : computeAutoEdgeRoute(
        endpoints.from,
        endpoints.to,
        layoutDirection,
        edge.from,
        edge.to,
        routeNodeBoxes,
        edgeLaneMap.get(edge.id) || 0,
        layoutSpacing,
        edge.anchors
      );
      if (route) map.set(edge.id, route);
    }
    return map;
  }, [
    doc.edges,
    doc.settings.spacing.horizontal,
    doc.settings.spacing.vertical,
    edgeBends,
    edgeForceBendMap,
    edgeLaneMap,
    edgeRoutes,
    getRenderedEdgeEndpoints,
    getRouteNodeBoxes,
    layoutDirection,
    layoutEdgeAnalysis.layoutEdgeIds,
    nodeSizeMap,
    renderedPositionMap,
    useAdvancedAutoRouting
  ]);

  const buildDraggedEdgeRoute = React.useCallback((edgeId: string, pointer: Point): EdgeRoute | undefined => {
    const edge = doc.edges.find(candidate => candidate.id === edgeId);
    if (!edge) return undefined;
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) return undefined;
    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    const endpointOffsets: DraggedRouteEndpointOffsets = {
      source: getEndpointSpacingOffset(layoutSpacing.primary),
      target: getEndpointSpacingOffset(layoutSpacing.primary)
    };
    return routeFromSnappedDraggedControl(
      endpoints.from,
      endpoints.to,
      layoutDirection,
      pointer,
      edge.from,
      edge.to,
      getRouteNodeBoxes(edge),
      layoutSpacing,
      edge.anchors,
      endpointOffsets
    );
  }, [
    doc.edges,
    getRenderedEdgeEndpoints,
    getRouteNodeBoxes,
    layoutSpacing,
    layoutDirection,
    nodeSizeMap,
    renderedPositionMap
  ]);

  const tryCreateEdge = React.useCallback(
    (from: NodeId, to: NodeId, anchors?: EdgeAnchors) => {
      if (
        (anchors?.from === 'front' && anchors.to === 'front') ||
        (anchors?.from === 'back' && anchors.to === 'back')
      ) {
        setFileMessage('Connect blocked: use opposite node handles');
        return false;
      }
      let nextFrom = from;
      let nextTo = to;
      let nextAnchors = anchors;
      const sameComponentBeforeConnect = new Set(collectConnectedComponent(doc, from)).has(to);
      const isExplicitOppositeHandleConnection = Boolean(
        isNodeSideAnchor(anchors?.from) &&
          isNodeSideAnchor(anchors.to) &&
          anchors.from !== anchors.to
      );
      if (from === primaryRootNodeId && to !== from && isExplicitOppositeHandleConnection) {
        nextFrom = to;
        nextTo = from;
        nextAnchors = reverseEdgeAnchors(anchors);
      } else if (to === primaryRootNodeId && from !== to && !sameComponentBeforeConnect) {
        nextFrom = to;
        nextTo = from;
        nextAnchors = reverseEdgeAnchors(anchors);
      }
      const fromComponent = new Set(collectConnectedComponent(doc, nextFrom));
      const mergesTwoComponents = !fromComponent.has(nextTo);
      const mergedComponentNodeIds = mergesTwoComponents
        ? new Set([...fromComponent, ...collectConnectedComponent(doc, nextTo)])
        : null;
      const edgeRole = mergesTwoComponents ? 'layout' : 'manual';
      const validation = validateEdge(doc, nextFrom, nextTo, edgeRole, nextAnchors);
      if (!validation.ok) {
        if (validation.reason === 'self-edge') setFileMessage('Connect blocked: source and target are the same node');
        if (validation.reason === 'duplicate-edge') setFileMessage('Connect blocked: edge already exists');
        if (validation.reason === 'same-side-anchors') setFileMessage('Connect blocked: use opposite node handles');
        return false;
      }
      const shouldNormalizeAttachedRoot =
        rootNodeIds.has(nextTo) && nextTo !== primaryRootNodeId;
      commitDoc(prev => {
        const withEdge = addEdge(prev, nextFrom, nextTo, edgeRole, nextAnchors);
        return shouldNormalizeAttachedRoot
          ? updateNodeStyle(withEdge, [nextTo], createChildNodeStyle(withEdge.settings.defaultShape))
          : withEdge;
      });
      if (mergedComponentNodeIds) {
        setCurrentNodeOffsets(prev => {
          const next = { ...prev };
          for (const nodeId of mergedComponentNodeIds) {
            delete next[nodeId];
          }
          return next;
        });
      }
      return true;
    },
    [commitDoc, doc, primaryRootNodeId, rootNodeIds, setCurrentNodeOffsets]
  );

  const dragInsertPreview = React.useMemo(() => {
    if (!dragState) return null;
    const preview = getLayerReorderPreview(
      layout.positions,
      nodeOffsets,
      dragState.nodeIds,
      dragState.anchorNodeId,
      layoutDirection,
      getLayoutSecondaryGap(layoutDirection)
    );
    if (!preview) return null;

    const layerIds = layout.positions
      .filter(pos => (layoutDirection === 'horizontal' ? pos.x === preview.primary : pos.y === preview.primary))
      .map(pos => pos.id);
    if (layerIds.length === 0) return null;

    const extents = layerIds
      .map(id => {
        const rendered = renderedPositionMap.get(id);
        const size = nodeSizeMap[id] || DEFAULT_NODE_SIZE;
        if (!rendered) return null;
        return {
          minX: rendered.x,
          maxX: rendered.x + size.width,
          minY: rendered.y,
          maxY: rendered.y + size.height
        };
      })
      .filter((item): item is { minX: number; maxX: number; minY: number; maxY: number } => item !== null);
    if (extents.length === 0) return null;

    const minX = Math.min(...extents.map(item => item.minX));
    const maxX = Math.max(...extents.map(item => item.maxX));
    const minY = Math.min(...extents.map(item => item.minY));
    const maxY = Math.max(...extents.map(item => item.maxY));

    return layoutDirection === 'horizontal'
      ? {
          left: minX - 8,
          top: preview.secondary - 1,
          width: Math.max(16, maxX - minX + 16),
          height: 2
        }
      : {
          left: preview.secondary - 1,
          top: minY - 8,
          width: 2,
          height: Math.max(16, maxY - minY + 16)
        };
  }, [dragState, layout.positions, layoutDirection, nodeOffsets, nodeSizeMap, renderedPositionMap]);

  const canvasSize = React.useMemo(() => {
    const boxes = doc.nodes.map(node => {
      const pos = renderedPositionMap.get(node.id);
      const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
      if (!pos) return null;
      return { x: pos.x, y: pos.y, width: size.width, height: size.height };
    });
    const maxX = boxes.reduce((acc, box) => Math.max(acc, box ? box.x + box.width : 0), 0);
    const maxY = boxes.reduce((acc, box) => Math.max(acc, box ? box.y + box.height : 0), 0);
    return {
      width: Math.max(980, maxX + 120),
      height: Math.max(520, maxY + 120)
    };
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const fitCanvasToView = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || doc.nodes.length === 0) return;
    const padding = 96;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of doc.nodes) {
      const pos = renderedPositionMap.get(node.id);
      if (!pos) continue;
      const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + size.width);
      maxY = Math.max(maxY, pos.y + size.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    const boundsWidth = Math.max(1, maxX - minX + padding * 2);
    const boundsHeight = Math.max(1, maxY - minY + padding * 2);
    const nextZoom = clamp(
      Number(Math.min(canvas.clientWidth / boundsWidth, canvas.clientHeight / boundsHeight, 1.25).toFixed(2)),
      0.5,
      2.5
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setCanvasZoom(nextZoom);
    requestAnimationFrame(() => {
      const maxScrollLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
      const maxScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
      canvas.scrollTo({
        left: clamp(centerX * nextZoom - canvas.clientWidth / 2, 0, maxScrollLeft),
        top: clamp(centerY * nextZoom - canvas.clientHeight / 2, 0, maxScrollTop),
        behavior: 'auto'
      });
    });
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const buildSvgSnapshot = React.useCallback(() => {
    const nodes: SvgNodeSnapshot[] = doc.nodes
      .map(node => {
        const pos = renderedPositionMap.get(node.id);
        if (!pos) return null;
        const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
        return {
          id: node.id,
          label: node.label,
          style: node.style,
          isRoot: rootNodeIds.has(node.id),
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height
        };
      })
      .filter((item): item is SvgNodeSnapshot => item !== null);

    const edges: SvgEdgeSnapshot[] = [];
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
      edges.push({
        id: edge.id,
        from: endpoints.from,
        to: endpoints.to,
        lane: edgeLaneMap.get(edge.id) || 0,
        fromSize,
        toSize,
        forceBend: edgeForceBendMap.get(edge.id) || false,
        style: effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle),
        ...(route ? { route } : {})
      });
    }
    return { nodes, edges };
  }, [autoEdgeRouteMap, doc.edges, doc.nodes, doc.settings.defaultEdgeStyle, edgeBends, edgeForceBendMap, edgeLaneMap, edgeRoutes, getRenderedEdgeEndpoints, nodeSizeMap, renderedPositionMap, rootNodeIds]);

  const buildCanvasSvg = React.useCallback((fitToContent = false) => {
    const snapshot = buildSvgSnapshot();
    let offsetX = 0;
    let offsetY = 0;
    let svgWidth = canvasSize.width;
    let svgHeight = canvasSize.height;

    if (fitToContent && (snapshot.nodes.length > 0 || snapshot.edges.length > 0)) {
      const padding = 48;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const node of snapshot.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      }

      for (const edge of snapshot.edges) {
        const routePoints = edge.route?.points || [];
        minX = Math.min(minX, edge.from.x, edge.to.x, ...routePoints.map(point => point.x));
        minY = Math.min(minY, edge.from.y, edge.to.y, ...routePoints.map(point => point.y));
        maxX = Math.max(maxX, edge.from.x, edge.to.x, ...routePoints.map(point => point.x));
        maxY = Math.max(maxY, edge.from.y, edge.to.y, ...routePoints.map(point => point.y));
      }

      if (Number.isFinite(minX) && Number.isFinite(minY)) {
        offsetX = padding - minX;
        offsetY = padding - minY;
        svgWidth = Math.ceil(maxX - minX + padding * 2);
        svgHeight = Math.ceil(maxY - minY + padding * 2);
      }
    }

    const shiftPoint = (point: Point): Point => ({ x: point.x + offsetX, y: point.y + offsetY });
    const edgeMarkup = snapshot.edges
      .map(
        edge => {
          const from = shiftPoint(edge.from);
          const to = shiftPoint(edge.to);
          const route = edge.route
            ? { points: edge.route.points.map(point => shiftPoint(point)) }
            : undefined;
          const dash = edgeStrokeDasharray(edge.style.lineType, edge.style.width);
          const dashMarkup = dash ? ` stroke-dasharray="${dash}"` : '';
          return `<path d="${edgePath(from, to, edge.lane, layoutDirection, edge.fromSize, edge.toSize, edge.forceBend, route)}" stroke="${edge.style.color}" stroke-width="${edge.style.width}"${dashMarkup} fill="none" stroke-linecap="round" />`;
        }
      )
      .join('');
    const nodeMarkup = snapshot.nodes
      .map(
        node => {
          const text = clampNodeLabel(node.label).replace(/\r?\n/g, ' ') || ' ';
          const style = node.style || {};
          const shape = style.shape || (node.isRoot ? 'rounded' : doc.settings.defaultShape);
          const fill = style.backgroundColor || (node.isRoot ? activeTheme.rootBg : activeTheme.nodeBg);
          const textColor = style.textColor || (node.isRoot ? activeTheme.rootText : activeTheme.nodeText);
          const fontSize = style.fontSize || DEFAULT_FONT_SIZE;
          const fontWeight = style.bold ? 700 : 400;
          const fontStyle = style.italic ? 'italic' : 'normal';
          const textDecoration = style.underline ? 'underline' : 'none';
          const radius =
            shape === 'pill' ? node.height / 2 : shape === 'square' || shape === 'underline' || shape === 'plain' ? 0 : 8;
          const textAnchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
          const textX =
            style.textAlign === 'center'
              ? node.width / 2
              : style.textAlign === 'right'
                ? node.width - NODE_PADDING_X
                : NODE_PADDING_X;
          const textY = Math.round(node.height / 2 + fontSize * 0.35);
          const textMarkup = `<text x="${textX}" y="${textY}" text-anchor="${textAnchor}" font-family="${escapeXml(style.fontFamily || DEFAULT_FONT_FAMILY)}, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}" fill="${textColor}">${escapeXml(text)}</text>`;
          const x = node.x + offsetX;
          const y = node.y + offsetY;
          if (shape === 'underline') {
            return `<g transform="translate(${x},${y})"><line x1="0" y1="${node.height - 1}" x2="${node.width}" y2="${node.height - 1}" stroke="${activeTheme.edge}" stroke-width="2" />${textMarkup}</g>`;
          }
          if (shape === 'plain') {
            return `<g transform="translate(${x},${y})">${textMarkup}</g>`;
          }
          return `<g transform="translate(${x},${y})"><rect rx="${radius}" ry="${radius}" width="${node.width}" height="${node.height}" fill="${fill}" stroke="${activeTheme.edge}" />${textMarkup}</g>`;
        }
      )
      .join('');
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
      `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${activeTheme.canvas}" />`,
      edgeMarkup,
      nodeMarkup,
      '</svg>'
    ].join('');
  }, [activeTheme.canvas, activeTheme.edge, activeTheme.nodeBg, activeTheme.nodeText, activeTheme.rootBg, activeTheme.rootText, buildSvgSnapshot, canvasSize.height, canvasSize.width, doc.settings.defaultShape, layoutDirection]);

  React.useEffect(() => {
    setSelectedNodeIds(prev => {
      return pruneSelectionForDoc(doc.nodes, doc.edges, prev, selectedEdgeId).selectedNodeIds;
    });
    const nextSelectedEdgeId = pruneSelectionForDoc(doc.nodes, doc.edges, selectedNodeIdsRef.current, selectedEdgeId)
      .selectedEdgeId;
    if (nextSelectedEdgeId !== selectedEdgeId) {
      setSelectedEdgeId(nextSelectedEdgeId);
    }
  }, [doc.edges, doc.nodes, selectedEdgeId]);

  React.useEffect(() => {
    if (!selectedRouteControl) return;
    if (selectedRouteControl.edgeId !== selectedEdgeId) {
      setSelectedRouteControl(null);
      return;
    }
    const route = edgeRoutes[selectedRouteControl.edgeId];
    if (!route || !route.points[selectedRouteControl.pointIndex]) {
      setSelectedRouteControl(null);
    }
  }, [edgeRoutes, selectedEdgeId, selectedRouteControl]);

  React.useEffect(() => {
    if (!editingNodeId) return;
    if (!doc.nodes.some(node => node.id === editingNodeId)) {
      setEditingNodeId(null);
      setEditingLabel('');
      editingNodeIdRef.current = null;
      editingLabelRef.current = '';
    }
  }, [doc.nodes, editingNodeId]);

  React.useEffect(() => {
    const validIds = new Set(doc.nodes.map(node => node.id));
    updateActiveTab(tab => {
      const prune = (map: NodeOffsetMap) => {
        const next: NodeOffsetMap = {};
        for (const [id, offset] of Object.entries(map)) {
          if (validIds.has(id)) next[id] = offset;
        }
        return next;
      };
      const nextHorizontal = prune(tab.nodeOffsetsByDirection.horizontal);
      const nextVertical = prune(tab.nodeOffsetsByDirection.vertical);
      const validEdgeIds = new Set(tab.history.present.edges.map(edge => edge.id));
      const pruneBends = (map: EdgeBendMap) => {
        const next: EdgeBendMap = {};
        for (const [id, bend] of Object.entries(map)) {
          if (validEdgeIds.has(id)) next[id] = bend;
        }
        return next;
      };
      const pruneRoutes = (map: EdgeRouteMap) => {
        const next: EdgeRouteMap = {};
        for (const [id, route] of Object.entries(map)) {
          if (validEdgeIds.has(id) && route.points.length > 0) next[id] = route;
        }
        return next;
      };
      return {
        ...tab,
        nodeOffsetsByDirection: { horizontal: nextHorizontal, vertical: nextVertical },
        edgeBendsByDirection: {
          horizontal: pruneBends(tab.edgeBendsByDirection.horizontal),
          vertical: pruneBends(tab.edgeBendsByDirection.vertical)
        },
        edgeRoutesByDirection: {
          horizontal: pruneRoutes(tab.edgeRoutesByDirection.horizontal),
          vertical: pruneRoutes(tab.edgeRoutesByDirection.vertical)
        }
      };
    });
  }, [doc.edges, doc.nodes, updateActiveTab]);

  const deleteSelectedEdge = React.useCallback(() => {
    if (!selectedEdgeId) return;
    commitDoc(prev => removeEdge(prev, selectedEdgeId));
    setSelectedEdgeId('');
    setSelectedRouteControl(null);
  }, [commitDoc, selectedEdgeId]);

  const deleteSelectedNodes = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    commitDoc(prev => removeNodes(prev, selectedNodeIds));
    setSelectedNodeIds([]);
  }, [commitDoc, selectedNodeIds]);

  const copySelectedNodes = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setCopiedSelection(extractSelection(doc, selectedNodeIds));
  }, [doc, selectedNodeIds]);

  const pasteSelectedNodes = React.useCallback(() => {
    if (!copiedSelection || copiedSelection.nodes.length === 0) return;
    const result = pasteDetached(doc, copiedSelection);
    commitDoc(() => ensureDocHasNode(result.doc));
    setSelectedNodeIds(result.newNodeIds);
    setSelectedEdgeId('');
    setCurrentNodeOffsets(prev => {
      const next = { ...prev };
      for (const id of result.newNodeIds) next[id] = { dx: 40, dy: 40 };
      return next;
    });
  }, [commitDoc, copiedSelection, doc, setCurrentNodeOffsets]);

  const startEditingNode = React.useCallback((nodeId: NodeId) => {
    const node = doc.nodes.find(item => item.id === nodeId);
    if (!node) return;
    const label = clampNodeLabel(node.label);
    editingNodeIdRef.current = nodeId;
    editingLabelRef.current = label;
    setEditingNodeId(nodeId);
    setEditingLabel(label);
  }, [doc.nodes]);

  const updateEditingLabel = React.useCallback((value: string) => {
    const label = clampNodeLabel(value);
    editingLabelRef.current = label;
    setEditingLabel(label);
  }, []);

  const commitEditingNode = React.useCallback(() => {
    const nodeId = editingNodeIdRef.current;
    if (!nodeId) return;
    const nextLabel = clampNodeLabel(editingLabelRef.current).trim();
    editingNodeIdRef.current = null;
    editingLabelRef.current = '';
    setEditingNodeId(null);
    setEditingLabel('');
    const currentNode = doc.nodes.find(node => node.id === nodeId);
    if (currentNode?.label === nextLabel) return;
    commitDoc(prev => updateNodeLabel(prev, nodeId, nextLabel));
  }, [commitDoc, doc.nodes]);

  const selectOutlineNode = React.useCallback(
    (nodeId: NodeId) => {
      if (editingNodeIdRef.current) commitEditingNode();
      setSelectedNodeIds([nodeId]);
      selectedNodeIdsRef.current = [nodeId];
      setSelectedEdgeId('');
      setSelectedRouteControl(null);
      requestAnimationFrame(() => scrollNodeIntoCanvas(nodeId));
    },
    [commitEditingNode, scrollNodeIntoCanvas]
  );

  const toggleOutlineNode = React.useCallback((nodeId: NodeId) => {
    setCollapsedOutlineNodeIds(prev => toggleCollapsedOutlineNodeIds(prev, nodeId));
  }, []);

  const createLinkedNodeFromSelection = React.useCallback(() => {
    const currentSelection = selectedNodeIdsRef.current;
    if (currentSelection.length !== 1) return;
    const parentId = currentSelection[0];
    const parentOffset = getNodeOffset(nodeOffsets, parentId);
    const newNodeId = `n${doc.meta.nextNodeSeq}`;
    const newLabel = NEW_NODE_LABEL;
    commitDoc(prev => {
      let next = addNode(prev, newLabel, createChildNodeStyle(prev.settings.defaultShape));
      next = addEdge(next, parentId, newNodeId);
      return next;
    });
    setCurrentNodeOffsets(prev => ({
      ...prev,
      [newNodeId]: { dx: parentOffset.dx, dy: parentOffset.dy }
    }));
    setSelectedNodeIds([newNodeId]);
    selectedNodeIdsRef.current = [newNodeId];
    setSelectedEdgeId('');
    editingNodeIdRef.current = newNodeId;
    editingLabelRef.current = newLabel;
    setEditingNodeId(newNodeId);
    setEditingLabel(newLabel);
  }, [commitDoc, doc.meta.nextNodeSeq, nodeOffsets, setCurrentNodeOffsets]);

  const createSiblingNodeFromSelection = React.useCallback(() => {
    const currentSelection = selectedNodeIdsRef.current;
    if (currentSelection.length !== 1) return;
    const selectedNodeId = currentSelection[0];
    const parentId = getPrimaryParentId(doc, selectedNodeId);
    if (!parentId) {
      createLinkedNodeFromSelection();
      return;
    }
    const parentOffset = getNodeOffset(nodeOffsets, parentId);
    const newNodeId = `n${doc.meta.nextNodeSeq}`;
    const newLabel = NEW_NODE_LABEL;
    commitDoc(prev => {
      let next = addNode(prev, newLabel, createChildNodeStyle(prev.settings.defaultShape));
      next = addEdge(next, parentId, newNodeId);
      return next;
    });
    setCurrentNodeOffsets(prev => ({
      ...prev,
      [newNodeId]: { dx: parentOffset.dx, dy: parentOffset.dy }
    }));
    setSelectedNodeIds([newNodeId]);
    selectedNodeIdsRef.current = [newNodeId];
    setSelectedEdgeId('');
    editingNodeIdRef.current = newNodeId;
    editingLabelRef.current = newLabel;
    setEditingNodeId(newNodeId);
    setEditingLabel(newLabel);
  }, [
    commitDoc,
    createLinkedNodeFromSelection,
    doc,
    doc.meta.nextNodeSeq,
    nodeOffsets,
    setCurrentNodeOffsets
  ]);

  const selectNodeByDirection = React.useCallback((directionKey: string) => {
    const currentSelection = selectedNodeIdsRef.current;
    if (currentSelection.length !== 1) return false;
    const selectedNodeId = currentSelection[0];
    const selectedPos = renderedPositionMap.get(selectedNodeId);
    if (!selectedPos) return false;
    const selectedSize = nodeSizeMap[selectedNodeId] || DEFAULT_NODE_SIZE;
    const selectedCenter = getNodeCenter(selectedPos.x, selectedPos.y, selectedSize);
    const candidates = doc.nodes
      .filter(node => node.id !== selectedNodeId)
      .map(node => {
        const pos = renderedPositionMap.get(node.id);
        if (!pos) return null;
        const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
        const center = getNodeCenter(pos.x, pos.y, size);
        const dx = center.x - selectedCenter.x;
        const dy = center.y - selectedCenter.y;
        let primaryDelta = 0;
        let secondaryDelta = 0;
        if (directionKey === 'arrowright') {
          if (dx <= 0) return null;
          primaryDelta = dx;
          secondaryDelta = Math.abs(dy);
        } else if (directionKey === 'arrowleft') {
          if (dx >= 0) return null;
          primaryDelta = Math.abs(dx);
          secondaryDelta = Math.abs(dy);
        } else if (directionKey === 'arrowdown') {
          if (dy <= 0) return null;
          primaryDelta = dy;
          secondaryDelta = Math.abs(dx);
        } else if (directionKey === 'arrowup') {
          if (dy >= 0) return null;
          primaryDelta = Math.abs(dy);
          secondaryDelta = Math.abs(dx);
        } else {
          return null;
        }
        return {
          nodeId: node.id,
          score: secondaryDelta * 1000 + primaryDelta
        };
      })
      .filter((entry): entry is { nodeId: NodeId; score: number } => Boolean(entry))
      .sort((a, b) => a.score - b.score);
    const next = candidates[0]?.nodeId;
    if (!next) return false;
    setSelectedNodeIds([next]);
    selectedNodeIdsRef.current = [next];
    setSelectedEdgeId('');
    setSelectedRouteControl(null);
    return true;
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const reorderSelectedNodeSibling = React.useCallback(
    (direction: -1 | 1) => {
      const currentSelection = selectedNodeIdsRef.current;
      if (currentSelection.length !== 1) return false;
      const selectedNodeId = currentSelection[0];
      let changed = false;
      commitDoc(prev => {
        const parentEdge = getPrimaryParentEdge(prev, selectedNodeId);
        if (!parentEdge) return prev;
        const siblings = getOrderedLayoutChildEdges(prev, parentEdge.from);
        const selectedIndex = siblings.findIndex(edge => edge.id === parentEdge.id);
        const targetIndex = selectedIndex + direction;
        if (selectedIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return prev;

        const siblingOrderById = new Map<string, number>();
        siblings.forEach((edge, index) => {
          siblingOrderById.set(edge.id, typeof edge.order === 'number' ? edge.order : index + 1);
        });
        const selectedOrder = siblingOrderById.get(siblings[selectedIndex].id)!;
        const targetOrder = siblingOrderById.get(siblings[targetIndex].id)!;
        siblingOrderById.set(siblings[selectedIndex].id, targetOrder);
        siblingOrderById.set(siblings[targetIndex].id, selectedOrder);
        changed = true;

        return {
          ...prev,
          edges: prev.edges.map(edge =>
            siblingOrderById.has(edge.id) ? { ...edge, order: siblingOrderById.get(edge.id)! } : edge
          )
        };
      });
      if (changed) {
        setSelectedNodeIds([selectedNodeId]);
        selectedNodeIdsRef.current = [selectedNodeId];
        setSelectedEdgeId('');
        setSelectedRouteControl(null);
      }
      return changed;
    },
    [commitDoc]
  );

  const resetSelectedEdgeBend = React.useCallback(() => {
    if (!selectedEdgeId) return;
    setSelectedRouteControl(null);
    commitEdgeUiChange((snapshot, direction) => {
      const nextBends = cloneEdgeBendsByDirection(snapshot.edgeBendsByDirection);
      const nextRoutes = cloneEdgeRoutesByDirection(snapshot.edgeRoutesByDirection);
      delete nextBends[direction][selectedEdgeId];
      delete nextRoutes[direction][selectedEdgeId];
      return {
        edgeBendsByDirection: nextBends,
        edgeRoutesByDirection: nextRoutes
      };
    });
  }, [commitEdgeUiChange, selectedEdgeId]);

  const hasManualOffset = React.useMemo(
    () => hasAnyNodeOffset(nodeOffsets, selectedNodeIds),
    [nodeOffsets, selectedNodeIds]
  );

  const resetSelectedNodeOffsets = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setCurrentNodeOffsets(prev => removeNodeOffsets(prev, selectedNodeIds));
  }, [selectedNodeIds, setCurrentNodeOffsets]);

  const applySelectedNodeStyle = React.useCallback(
    (patch: NodeStyle) => {
      if (selectedNodeIds.length === 0) return;
      commitDoc(prev => updateNodeStyle(prev, selectedNodeIds, patch));
    },
    [commitDoc, selectedNodeIds]
  );

  const updateTaskTableField = React.useCallback(
    (nodeId: NodeId, patch: Partial<NodeTask>) => {
      commitDoc(prev => updateNodeTask(prev, [nodeId], { enabled: true, ...patch }));
    },
    [commitDoc]
  );

  const toggleTaskTableSort = React.useCallback((key: TaskTableSortKey) => {
    setTaskTableSort(prev => getNextTaskTableSort(prev, key));
  }, []);

  const applySelectedEdgeStyle = React.useCallback(
    (patch: EdgeStyle) => {
      if (selectedStyleEdges.length === 0) return;
      commitDoc(prev => updateEdgeStyle(prev, selectedStyleEdges.map(edge => edge.id), patch));
    },
    [commitDoc, selectedStyleEdges]
  );

  const applyDefaultEdgeStyle = React.useCallback(
    (patch: EdgeStyle) => {
      commitDoc(prev =>
        updateSettings(prev, {
          defaultEdgeStyle: {
            ...prev.settings.defaultEdgeStyle,
            ...patch
          }
        })
      );
    },
    [commitDoc]
  );

  const clearSelectedNodeStyle = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    commitDoc(prev => resetNodeStyle(prev, selectedNodeIds));
  }, [commitDoc, selectedNodeIds]);

  const applyTheme = React.useCallback(
    (themeId: string) => {
      commitDoc(prev => updateSettings(prev, { themeId }));
    },
    [commitDoc]
  );

  const applySpacing = React.useCallback(
    (key: 'horizontal' | 'vertical', value: number) => {
      const nextValue = clamp(value, SPACING_MIN, SPACING_MAX);
      commitDoc(prev =>
        updateSettings(prev, {
          spacing: {
            ...prev.settings.spacing,
            [key]: nextValue
          }
        })
      );
    },
    [commitDoc]
  );

  const addCustomTag = React.useCallback(() => {
    const id = nextCustomTagId(doc.settings.tags);
    commitDoc(prev => upsertTag(prev, { id, name: 'New Tag', color: newTagColor }));
  }, [commitDoc, doc.settings.tags, newTagColor]);

  const renameTag = React.useCallback(
    (tag: FlowTag, name: string) => {
      commitDoc(prev => upsertTag(prev, { ...tag, name }));
    },
    [commitDoc]
  );

  const removeTagById = React.useCallback(
    (tagId: string) => {
      commitDoc(prev => deleteTag(prev, tagId));
    },
    [commitDoc]
  );

  const setToolbarVisible = React.useCallback(
    (visible: boolean) => {
      updateActiveTab(tab => ({ ...tab, toolbarVisible: visible }));
    },
    [updateActiveTab]
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditor =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoInteraction();
        return;
      }
      if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault();
        redoInteraction();
        return;
      }
      if (mod && key === 'n') {
        event.preventDefault();
        createNewDocument();
        return;
      }
      if (mod && key === 'o') {
        event.preventDefault();
        void openDocument();
        return;
      }
      if (mod && key === 's' && event.shiftKey) {
        event.preventDefault();
        void saveDocument(true);
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        void saveDocument(false);
        return;
      }
      if (mod && key === '0') {
        event.preventDefault();
        fitCanvasToView();
        return;
      }
      if (inEditor) return;
      const latestSelectedNodeIds = selectedNodeIdsRef.current;
      if (mod && key === 'c') {
        event.preventDefault();
        copySelectedNodes();
        return;
      }
      if (mod && key === 'v') {
        event.preventDefault();
        pasteSelectedNodes();
        return;
      }
      if (key === 'tab' && latestSelectedNodeIds.length === 1) {
        event.preventDefault();
        createLinkedNodeFromSelection();
        return;
      }
      if (key === 'enter' && latestSelectedNodeIds.length === 1) {
        event.preventDefault();
        createSiblingNodeFromSelection();
        return;
      }
      if (mod && latestSelectedNodeIds.length === 1 && (key === 'arrowup' || key === 'arrowdown')) {
        event.preventDefault();
        reorderSelectedNodeSibling(key === 'arrowdown' ? 1 : -1);
        return;
      }
      if (latestSelectedNodeIds.length > 0 && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        selectNodeByDirection(key);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (selectedEdgeId) {
          event.preventDefault();
          deleteSelectedEdge();
          return;
        }
        if (latestSelectedNodeIds.length > 0) {
          event.preventDefault();
          deleteSelectedNodes();
          return;
        }
      }
      if (key === ' ' && latestSelectedNodeIds.length === 1) {
        event.preventDefault();
        startEditingNode(latestSelectedNodeIds[0]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copySelectedNodes,
    createLinkedNodeFromSelection,
    createSiblingNodeFromSelection,
    createNewDocument,
    deleteSelectedEdge,
    deleteSelectedNodes,
    openDocument,
    pasteSelectedNodes,
    redoInteraction,
    reorderSelectedNodeSibling,
    saveDocument,
    selectNodeByDirection,
    setCanvasZoom,
    selectedEdgeId,
    startEditingNode,
    fitCanvasToView,
    undoInteraction
  ]);

  const onCanvasWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const oldZoom = canvasZoom;
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = clamp(Number((oldZoom + delta).toFixed(2)), 0.5, 2.5);
      if (nextZoom === oldZoom) return;
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const worldX = (canvas.scrollLeft + pointerX) / oldZoom;
      const worldY = (canvas.scrollTop + pointerY) / oldZoom;
      setCanvasZoom(nextZoom);
      requestAnimationFrame(() => {
        canvas.scrollTo({
          left: Math.max(0, worldX * nextZoom - pointerX),
          top: Math.max(0, worldY * nextZoom - pointerY)
        });
      });
    },
    [canvasZoom]
  );

  React.useEffect(() => {
    if (!dragState) return;
    const dragNodeSet = new Set(dragState.nodeIds);
    const dragCollisionGap = 10;
    const snapThreshold = 14;
    const dragThreshold = 3;
    const baseById = new Map(layout.positions.map(pos => [pos.id, pos]));
    const onPointerMove = (event: PointerEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const deltaX = pointer.x - dragState.startX;
      const deltaY = pointer.y - dragState.startY;
      if (!dragDidMoveRef.current && Math.hypot(deltaX, deltaY) < dragThreshold) return;
      dragDidMoveRef.current = true;
      updateActiveTab(tab => {
        const direction = tab.layoutDirection;
        const prev = tab.nodeOffsetsByDirection[direction];
        let next = { ...prev };
        let appliedDeltaX = deltaX;
        let appliedDeltaY = deltaY;
        for (const nodeId of dragState.nodeIds) {
          const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
          next[nodeId] = { dx: startOffset.dx + deltaX, dy: startOffset.dy + deltaY };
        }
        const anchorBase = baseById.get(dragState.anchorNodeId);
        const anchorSize = nodeSizeMap[dragState.anchorNodeId] || DEFAULT_NODE_SIZE;
        if (anchorBase) {
          const anchorOffset = getNodeOffset(next, dragState.anchorNodeId);
          const anchorCenter = getNodeCenter(anchorBase.x + anchorOffset.dx, anchorBase.y + anchorOffset.dy, anchorSize);
          let snapDx = 0;
          let snapDy = 0;
          let bestX = Number.POSITIVE_INFINITY;
          let bestY = Number.POSITIVE_INFINITY;
          for (const rootId of rootNodeIds) {
            if (dragNodeSet.has(rootId)) continue;
            const rootBase = baseById.get(rootId);
            if (!rootBase) continue;
            const rootSize = nodeSizeMap[rootId] || DEFAULT_NODE_SIZE;
            const rootOffset = getNodeOffset(prev, rootId);
            const rootCenter = getNodeCenter(rootBase.x + rootOffset.dx, rootBase.y + rootOffset.dy, rootSize);
            const dxToSnap = rootCenter.x - anchorCenter.x;
            const dyToSnap = rootCenter.y - anchorCenter.y;
            if (Math.abs(dxToSnap) <= snapThreshold && Math.abs(dxToSnap) < bestX) {
              bestX = Math.abs(dxToSnap);
              snapDx = dxToSnap;
            }
            if (Math.abs(dyToSnap) <= snapThreshold && Math.abs(dyToSnap) < bestY) {
              bestY = Math.abs(dyToSnap);
              snapDy = dyToSnap;
            }
          }
          if (snapDx !== 0 || snapDy !== 0) {
            const snapped = { ...next };
            for (const nodeId of dragState.nodeIds) {
              const current = getNodeOffset(snapped, nodeId);
              snapped[nodeId] = { dx: current.dx + snapDx, dy: current.dy + snapDy };
            }
            appliedDeltaX += snapDx;
            appliedDeltaY += snapDy;
            next = snapped;
          }
        }

        const staticBoxes: NodeBox[] = [];
        for (const node of doc.nodes) {
          if (dragNodeSet.has(node.id)) continue;
          const base = baseById.get(node.id);
          if (!base) continue;
          const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
          const offset = getNodeOffset(prev, node.id);
          staticBoxes.push({
            left: base.x + offset.dx,
            right: base.x + offset.dx + size.width,
            top: base.y + offset.dy,
            bottom: base.y + offset.dy + size.height
          });
        }
        for (const nodeId of dragState.nodeIds) {
          const base = baseById.get(nodeId);
          if (!base) continue;
          const size = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
          const offset = getNodeOffset(next, nodeId);
          const movingBox: NodeBox = {
            left: base.x + offset.dx,
            right: base.x + offset.dx + size.width,
            top: base.y + offset.dy,
            bottom: base.y + offset.dy + size.height
          };
          if (staticBoxes.some(box => boxesOverlap(movingBox, box, dragCollisionGap))) {
            return tab;
          }
        }
        const nextBendsForDirection = translateEdgeBendsForMovedNodes(
          doc,
          dragState.startEdgeBends,
          dragNodeSet,
          appliedDeltaX,
          appliedDeltaY
        );
        const nextRoutesForDirection = translateEdgeRoutesForMovedNodes(
          doc,
          dragState.startEdgeRoutes,
          dragNodeSet,
          appliedDeltaX,
          appliedDeltaY
        );

        return {
          ...tab,
          nodeOffsetsByDirection: {
            ...tab.nodeOffsetsByDirection,
            [direction]: next
          },
          edgeBendsByDirection: {
            ...tab.edgeBendsByDirection,
            [direction]: nextBendsForDirection
          },
          edgeRoutesByDirection: {
            ...tab.edgeRoutesByDirection,
            [direction]: nextRoutesForDirection
          }
        };
      });
      if (dragState.nodeIds.length === 1) {
        const x = pointer.x;
        const y = pointer.y;
        const ordered = [...layout.positions].reverse();
        let candidate: NodeId | null = null;
        for (const pos of ordered) {
          if (pos.id === dragState.anchorNodeId) continue;
          const rendered = renderedPositionMap.get(pos.id);
          const nodeSize = nodeSizeMap[pos.id] || DEFAULT_NODE_SIZE;
          if (!rendered) continue;
          const hit = x >= rendered.x && x <= rendered.x + nodeSize.width && y >= rendered.y && y <= rendered.y + nodeSize.height;
          if (hit) {
            candidate = pos.id;
            break;
          }
        }
        setDropParentTargetId(candidate);
      }
    };
    const onPointerUp = (event: PointerEvent | MouseEvent) => {
      if (!dragDidMoveRef.current) {
        setDragState(null);
        setDropParentTargetId(null);
        return;
      }
      const isRootDrag = rootNodeIds.has(dragState.anchorNodeId);
      let finalDropParentTargetId = dropParentTargetId;
      if (dragState.nodeIds.length === 1) {
        finalDropParentTargetId = null;
        const pointer = getCanvasContentPoint(event.clientX, event.clientY);
        if (pointer) {
          const ordered = [...layout.positions].reverse();
          for (const pos of ordered) {
            if (pos.id === dragState.anchorNodeId) continue;
            const rendered = renderedPositionMap.get(pos.id);
            const nodeSize = nodeSizeMap[pos.id] || DEFAULT_NODE_SIZE;
            if (!rendered) continue;
            const hit =
              pointer.x >= rendered.x &&
              pointer.x <= rendered.x + nodeSize.width &&
              pointer.y >= rendered.y &&
              pointer.y <= rendered.y + nodeSize.height;
            if (hit) {
              finalDropParentTargetId = pos.id;
              break;
            }
          }
        }
      }
      if (dragState.nodeIds.length === 1 && finalDropParentTargetId && !isRootDrag) {
        const movingNodeId = dragState.anchorNodeId;
        const nextDoc = reparentNode(doc, movingNodeId, finalDropParentTargetId);
        const anchorRootId = primaryRootNodeId || doc.nodes[0]?.id || movingNodeId;
        const rootRenderedBefore = renderedPositionMap.get(anchorRootId);
        const nextLayoutEdgeAnalysis = analyzeLayoutEdges(nextDoc);
        const nextLayoutDoc = { ...nextDoc, edges: nextLayoutEdgeAnalysis.layoutEdges };
        const nextLayout = layoutFlow(nextLayoutDoc, layoutDirection, nodeSizeMap, layoutSpacing);
        const rootBaseAfter = nextLayout.positions.find(pos => pos.id === anchorRootId);
        commitDoc(() => nextDoc);
        if (rootRenderedBefore && rootBaseAfter) {
          const nextComponentIds = collectEdgeComponent(
            nextDoc,
            anchorRootId,
            nextLayoutEdgeAnalysis.layoutEdgeIds
          );
          const preservedOffset = {
            dx: rootRenderedBefore.x - rootBaseAfter.x,
            dy: rootRenderedBefore.y - rootBaseAfter.y
          };
          setCurrentNodeOffsets(prev => {
            const next = { ...prev };
            for (const nodeId of nextComponentIds) {
              if (preservedOffset.dx === 0 && preservedOffset.dy === 0) {
                delete next[nodeId];
              } else {
                next[nodeId] = preservedOffset;
              }
            }
            return next;
          });
        } else {
          restoreCurrentNodeOffsets(dragState.startOffsets);
        }
        setSelectedNodeIds([movingNodeId]);
      } else if (!isRootDrag) {
        updateActiveTab(tab => {
          const nextOffsets = { ...tab.nodeOffsetsByDirection[layoutDirection] };
          for (const nodeId of dragState.nodeIds) {
            const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
            if (startOffset.dx === 0 && startOffset.dy === 0) {
              delete nextOffsets[nodeId];
            } else {
              nextOffsets[nodeId] = startOffset;
            }
          }
          return {
            ...tab,
            nodeOffsetsByDirection: {
              ...tab.nodeOffsetsByDirection,
              [layoutDirection]: nextOffsets
            },
            edgeBendsByDirection: {
              ...tab.edgeBendsByDirection,
              [layoutDirection]: dragState.startEdgeBends
            },
            edgeRoutesByDirection: {
              ...tab.edgeRoutesByDirection,
              [layoutDirection]: dragState.startEdgeRoutes
            }
          };
        });
      }
      setDragState(null);
      setDropParentTargetId(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
    };
  }, [autoPanCanvas, commitDoc, doc, dragState, dropParentTargetId, getCanvasContentPoint, layout.positions, layoutDirection, layoutSpacing, nodeSizeMap, primaryRootNodeId, renderedPositionMap, restoreCurrentNodeOffsets, rootNodeIds, setCurrentNodeOffsets, updateActiveTab]);

  const findNodeAtCanvasPoint = React.useCallback((x: number, y: number): NodeId | null => {
    const ordered = [...layout.positions].reverse();
    for (const pos of ordered) {
      const rendered = renderedPositionMap.get(pos.id);
      const nodeSize = nodeSizeMap[pos.id] || DEFAULT_NODE_SIZE;
      if (!rendered) continue;
      const hit =
        x >= rendered.x &&
        x <= rendered.x + nodeSize.width &&
        y >= rendered.y &&
        y <= rendered.y + nodeSize.height;
      if (hit) return pos.id;
    }
    return null;
  }, [layout.positions, nodeSizeMap, renderedPositionMap]);

  const updateConnectDragFromPointer = React.useCallback((event: DragPointerLikeEvent) => {
    autoPanCanvas(event);
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    if (!pointer) return;
    const { x, y } = pointer;
    setConnectDrag(prev => {
      if (!prev) return prev;
      const hitId = findNodeAtCanvasPoint(x, y);
      const hoverTargetNodeId = hitId && hitId !== prev.fromNodeId ? hitId : null;
      const next = { ...prev, current: { x, y }, hoverTargetNodeId };
      connectDragRef.current = next;
      return next;
    });
  }, [autoPanCanvas, findNodeAtCanvasPoint, getCanvasContentPoint]);

  const finishConnectDragFromPointer = React.useCallback((event: DragPointerLikeEvent) => {
    stopConnectDragListeners();
    pendingRightConnectFromRef.current = null;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    const targetFromEvent = getNodeIdFromEventTarget(event.target);
    const targetFromPoint = getNodeIdFromViewportPoint(event.clientX, event.clientY);
    if (!pointer) {
      connectDragRef.current = null;
      setConnectDrag(null);
      return;
    }
    const { x, y } = pointer;
    const drag = connectDragRef.current;
    connectDragRef.current = null;
    setConnectDrag(null);
    if (!drag) return;
    const targetHandleHit = getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection);
    const targetId = targetHandleHit?.nodeId || targetFromPoint || drag.hoverTargetNodeId || findNodeAtCanvasPoint(x, y) || targetFromEvent;
    if (targetId && targetId !== drag.fromNodeId) {
      const anchors = resolveDraggedEdgeAnchors(
        drag.anchors,
        targetHandleHit?.nodeId === targetId ? targetHandleHit.anchor : undefined
      );
      if (anchors && tryCreateEdge(drag.fromNodeId, targetId, anchors)) {
        setSelectedNodeIds([targetId]);
      }
    }
  }, [findNodeAtCanvasPoint, getCanvasContentPoint, layoutDirection, stopConnectDragListeners, tryCreateEdge]);

  React.useEffect(() => {
    if (!edgeBendDrag) return;
    const moveEdgeBend = (event: PointerEvent | MouseEvent) => {
      event.preventDefault();
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const route = buildDraggedEdgeRoute(edgeBendDrag.edgeId, pointer);
      if (!route) return;
      setCurrentEdgeBends(prev => {
        const { [edgeBendDrag.edgeId]: _removed, ...rest } = prev;
        return rest;
      });
      setCurrentEdgeRoutes(prev => ({ ...prev, [edgeBendDrag.edgeId]: route }));
    };
    const finishEdgeBend = (event: PointerEvent | MouseEvent) => {
      event.preventDefault();
      commitCurrentEdgeUiSnapshot(edgeBendDragStartSnapshotRef.current);
      edgeBendDragStartSnapshotRef.current = null;
      setEdgeBendDrag(null);
    };
    window.addEventListener('pointermove', moveEdgeBend);
    window.addEventListener('pointerup', finishEdgeBend);
    window.addEventListener('mousemove', moveEdgeBend);
    window.addEventListener('mouseup', finishEdgeBend);
    return () => {
      window.removeEventListener('pointermove', moveEdgeBend);
      window.removeEventListener('pointerup', finishEdgeBend);
      window.removeEventListener('mousemove', moveEdgeBend);
      window.removeEventListener('mouseup', finishEdgeBend);
    };
  }, [
    autoPanCanvas,
    buildDraggedEdgeRoute,
    commitCurrentEdgeUiSnapshot,
    edgeBendDrag,
    getCanvasContentPoint,
    setCurrentEdgeBends,
    setCurrentEdgeRoutes
  ]);

  React.useEffect(() => {
    if (!marquee) return;
    const onPointerMove = (event: PointerEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const currentX = pointer.x;
      const currentY = pointer.y;
      setMarquee(prev => (prev ? { ...prev, currentX, currentY } : prev));
    };
    const onPointerUp = () => {
      setMarquee(prev => {
        if (!prev) return null;
        const left = Math.min(prev.startX, prev.currentX);
        const right = Math.max(prev.startX, prev.currentX);
        const top = Math.min(prev.startY, prev.currentY);
        const bottom = Math.max(prev.startY, prev.currentY);
        const hits: NodeId[] = [];
        for (const node of doc.nodes) {
          const pos = renderedPositionMap.get(node.id);
          const nodeSize = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
          if (!pos) continue;
          const intersects =
            pos.x < right &&
            pos.x + nodeSize.width > left &&
            pos.y < bottom &&
            pos.y + nodeSize.height > top;
          if (intersects) hits.push(node.id);
        }
        setSelectedNodeIds(hits);
        setSelectedEdgeId('');
        return null;
      });
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [autoPanCanvas, doc.nodes, getCanvasContentPoint, marquee, nodeSizeMap, renderedPositionMap]);

  const startEdgeSegmentDragAtPoint = (
    edgeId: string,
    start: Point,
    getPointerPoint: (clientX: number, clientY: number) => Point | null = getCanvasContentPoint
  ) => {
    stopEdgeSegmentDragListeners();
    setSelectedEdgeId(edgeId);
    setSelectedRouteControl(null);
    setSelectedNodeIds([]);
    const initialEdgeUiSnapshot = getEdgeUiSnapshot(activeTab);
    let didDrag = false;
    const onPointerMove = (nativeEvent: PointerEvent) => {
      autoPanCanvas(nativeEvent);
      const pointer = getPointerPoint(nativeEvent.clientX, nativeEvent.clientY);
      if (!pointer) return;
      if (!didDrag && distanceSquared(start, pointer) < 16) return;
      didDrag = true;
      suppressNextEdgeClickRef.current = true;
      const route = buildDraggedEdgeRoute(edgeId, pointer);
      if (!route) return;
      setCurrentEdgeBends(prev => {
        const { [edgeId]: _removed, ...rest } = prev;
        return rest;
      });
      setCurrentEdgeRoutes(prev => ({ ...prev, [edgeId]: route }));
    };
    const onPointerUp = () => {
      if (didDrag) {
        commitCurrentEdgeUiSnapshot(initialEdgeUiSnapshot);
      }
      setSelectedEdgeId(edgeId);
      setSelectedRouteControl(null);
      setSelectedNodeIds([]);
      stopEdgeSegmentDragListeners();
    };
    edgeSegmentDragListenersRef.current = { onPointerMove, onPointerUp };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const findEdgeHitAtPoint = (point: Point, preferredEdgeId?: string) => {
    type EdgeHitCandidate = {
      edgeId: string;
      endpoints: { from: Point; to: Point };
      route: EdgeRoute | undefined;
      distance: number;
      score: number;
    };
    let best: EdgeHitCandidate | null = null;
    let bestNearbyLayoutEdge: EdgeHitCandidate | null = null;
    let preferred: EdgeHitCandidate | null = null;
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
      const lane = edgeLaneMap.get(edge.id) || 0;
      const forceBend = edgeForceBendMap.get(edge.id) || false;
      const path = edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route);
      const distance = distanceToPathSquared(point, path);
      const linearDistance = Math.sqrt(distance);
      const isLayoutEdge = layoutEdgeAnalysis.layoutEdgeIds.has(edge.id);
      const isRoutedEdge = Boolean(edgeRoutes[edge.id] || edgeBends[edge.id] || (route && route.points.length > 1));
      const routeDistance = route ? routeLength([endpoints.from, ...route.points, endpoints.to]) : 0;
      const routeLengthPenalty = isRoutedEdge && !isLayoutEdge
        ? Math.min(18, Math.max(0, (routeDistance - 240) / 70))
        : 0;
      const routePenalty = linearDistance <= 3
        ? 0
        : (isLayoutEdge ? 0 : 8) + (isRoutedEdge ? 6 + routeLengthPenalty : 0);
      const preferredBonus = preferredEdgeId === edge.id && distance <= 18 * 18 ? 16 : 0;
      const score = linearDistance + routePenalty - preferredBonus;
      if (preferredEdgeId === edge.id && distance <= 18 * 18) {
        preferred = { edgeId: edge.id, endpoints, route, distance, score };
      }
      if (!best || score < best.score || (score === best.score && distance < best.distance)) {
        best = { edgeId: edge.id, endpoints, route, distance, score };
      }
      if (isLayoutEdge && distance <= 12 * 12) {
        const layoutScore = linearDistance;
        if (
          !bestNearbyLayoutEdge ||
          layoutScore < bestNearbyLayoutEdge.score ||
          (layoutScore === bestNearbyLayoutEdge.score && distance < bestNearbyLayoutEdge.distance)
        ) {
          bestNearbyLayoutEdge = { edgeId: edge.id, endpoints, route, distance, score: layoutScore };
        }
      }
    }
    if (
      bestNearbyLayoutEdge &&
      preferred &&
      !layoutEdgeAnalysis.layoutEdgeIds.has(preferred.edgeId)
    ) {
      return bestNearbyLayoutEdge;
    }
    if (preferred) {
      return preferred;
    }
    if (
      bestNearbyLayoutEdge &&
      best &&
      best.edgeId !== bestNearbyLayoutEdge.edgeId &&
      !layoutEdgeAnalysis.layoutEdgeIds.has(best.edgeId)
    ) {
      return bestNearbyLayoutEdge;
    }
    return best && best.distance <= 18 * 18 ? best : null;
  };

  const onCanvasPointerDown = (event: React.PointerEvent<Element>) => {
    if (event.target !== event.currentTarget) return;
    if (isNodeLabelInputTarget(event.target)) return;
    if (editingNodeIdRef.current) commitEditingNode();
    if (connectDrag) return;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    if (!pointer) return;
    const edgeHit = findEdgeHitAtPoint(pointer);
    if (edgeHit && event.button === 0) {
      startEdgeSegmentDragAtPoint(edgeHit.edgeId, pointer, getCanvasContentPoint);
      return;
    }
    const x = pointer.x;
    const y = pointer.y;
    setMarquee({ startX: x, startY: y, currentX: x, currentY: y });
    setSelectedNodeIds([]);
    setSelectedEdgeId('');
  };

  const onNodePointerDown = (event: React.PointerEvent<HTMLButtonElement>, nodeId: NodeId) => {
    if (isNodeLabelInputTarget(event.target)) return;
    if (editingNodeIdRef.current) commitEditingNode();
    if (connectDrag) return;
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      const handleHit = getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection);
      if (handleHit) {
        pendingRightConnectFromRef.current = nodeId;
        const anchors = handleHit.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
        pendingRightConnectAnchorsRef.current = anchors;
        beginConnectDrag(nodeId, anchors);
        return;
      }
      setSelectedEdgeId('');
      setSelectedNodeIds([nodeId]);
      selectedNodeIdsRef.current = [nodeId];
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    setDragState(null);
    setDropParentTargetId(null);
    setSelectedEdgeId('');
    if (event.shiftKey) {
      const from = selectedNodeIds.length === 1 ? selectedNodeIds[0] : '';
      if (from && from !== nodeId) {
        tryCreateEdge(from, nodeId);
      }
      setSelectedNodeIds([nodeId]);
      selectedNodeIdsRef.current = [nodeId];
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const nextSelection = selectedNodeIdsRef.current.includes(nodeId)
        ? selectedNodeIdsRef.current.filter(id => id !== nodeId)
        : [...selectedNodeIdsRef.current, nodeId];
      selectedNodeIdsRef.current = nextSelection;
      setSelectedNodeIds(nextSelection);
      return;
    }
    const isRootNode = rootNodeIds.has(nodeId);
    const nextSelection: NodeId[] = [nodeId];
    setSelectedNodeIds(nextSelection);
    selectedNodeIdsRef.current = nextSelection;
    const connectedNodeIds = isRootNode
      ? collectEdgeComponent(doc, nodeId, layoutEdgeAnalysis.layoutEdgeIds)
      : [nodeId];
    const startOffsets: Record<NodeId, NodeOffset> = {};
    for (const id of connectedNodeIds) {
      startOffsets[id] = getNodeOffset(nodeOffsets, id);
    }
    const startPoint = getCanvasContentPoint(event.clientX, event.clientY);
    if (!startPoint) return;
    dragDidMoveRef.current = false;
    setDragState({
      nodeIds: connectedNodeIds,
      anchorNodeId: nodeId,
      startX: startPoint.x,
      startY: startPoint.y,
      startOffsets,
      startEdgeBends: cloneEdgeBendMap(edgeBends),
      startEdgeRoutes: cloneEdgeRouteMap(edgeRoutes)
    });
  };

  const onNodeMouseUp = (event: React.MouseEvent<HTMLButtonElement>, nodeId: NodeId) => {
    const drag = connectDragRef.current || connectDrag;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const fromId = drag.fromNodeId;
    pendingRightConnectFromRef.current = null;
    stopConnectDragListeners();
    connectDragRef.current = null;
    setConnectDrag(null);
    const targetHandleHit = getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection);
    const anchors = resolveDraggedEdgeAnchors(drag.anchors, targetHandleHit?.anchor);
    if (fromId !== nodeId && anchors && tryCreateEdge(fromId, nodeId, anchors)) {
      setSelectedNodeIds([nodeId]);
      return;
    }
    setSelectedNodeIds([fromId]);
  };

  const onNodeContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!pendingRightConnectFromRef.current && !connectDrag) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const beginEdgeBendDrag = (edgeId: string, pointIndex: number) => {
    edgeBendDragStartSnapshotRef.current = getEdgeUiSnapshot(activeTab);
    setSelectedEdgeId(edgeId);
    setSelectedNodeIds([]);
    setSelectedRouteControl({ edgeId, pointIndex });
    setEdgeBendDrag({ edgeId, pointIndex });
  };

  const startEdgeBendDrag = (event: React.PointerEvent<SVGCircleElement>, edgeId: string, pointIndex: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    beginEdgeBendDrag(edgeId, pointIndex);
  };

  const startEdgeSegmentDrag = (event: React.PointerEvent<SVGPathElement>) => {
    if (event.button !== 0) return;
    if (editingNodeIdRef.current) commitEditingNode();
    event.stopPropagation();
    const start = getSvgContentPoint(event.currentTarget.ownerSVGElement, event.clientX, event.clientY);
    if (!start) return;
    const edgeHit = findEdgeHitAtPoint(start, event.currentTarget.dataset.edgeId);
    if (!edgeHit) return;
    const svg = event.currentTarget.ownerSVGElement;
    startEdgeSegmentDragAtPoint(edgeHit.edgeId, start, (clientX, clientY) =>
      getSvgContentPoint(svg, clientX, clientY)
    );
  };

  const beginConnectDrag = (nodeId: NodeId, anchors: EdgeAnchors = HANDLE_CONNECT_ANCHORS) => {
    stopConnectDragListeners();
    const nodePos = renderedPositionMap.get(nodeId);
    const nodeSize = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
    if (!nodePos) return;
    const fromAnchor = anchors.from === 'front' ? 'front' : 'back';
    const start = getDirectionalAnchorPoint(nodePos, nodeSize, layoutDirection, fromAnchor);
    const initialDrag = {
      fromNodeId: nodeId,
      anchors,
      start,
      current: start,
      hoverTargetNodeId: null
    };
    connectDragRef.current = initialDrag;
    setConnectDrag(initialDrag);
    const onPointerMove = (nativeEvent: PointerEvent) => updateConnectDragFromPointer(nativeEvent);
    const onPointerUp = (nativeEvent: PointerEvent) => finishConnectDragFromPointer(nativeEvent);
    const onMouseMove = (nativeEvent: MouseEvent) => updateConnectDragFromPointer(nativeEvent);
    const onMouseUp = (nativeEvent: MouseEvent) => finishConnectDragFromPointer(nativeEvent);
    connectDragListenersRef.current = { onPointerMove, onPointerUp, onMouseMove, onMouseUp };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    setSelectedNodeIds([nodeId]);
    setSelectedEdgeId('');
  };

  const startConnectDrag = (event: React.PointerEvent<HTMLSpanElement>, nodeId: NodeId, anchors = HANDLE_CONNECT_ANCHORS) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2 || event.buttons === 2) {
      pendingRightConnectFromRef.current = nodeId;
    }
    beginConnectDrag(nodeId, anchors);
  };

  React.useEffect(() => {
    const onRightMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (editingNodeId || connectDrag) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const handleHit = getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection);
      const nodeId = getNodeIdFromEventTarget(target) || handleHit?.nodeId;
      if (!nodeId) return;
      if (!target.closest('.node-connect-handle') && !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
        return;
      }
      event.preventDefault();
      pendingRightConnectFromRef.current = nodeId;
      const anchors = handleHit?.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
      pendingRightConnectAnchorsRef.current = anchors;
      beginConnectDrag(nodeId, anchors);
    };
    window.addEventListener('mousedown', onRightMouseDown, true);
    return () => window.removeEventListener('mousedown', onRightMouseDown, true);
  }, [beginConnectDrag, connectDrag, editingNodeId, layoutDirection]);

  const onCanvasMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeId =
      getNodeIdFromEventTarget(target) ||
      getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection)?.nodeId;
    if (!nodeId) return;
    if (!target.closest('.node-connect-handle') && !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
      return;
    }
    pendingRightConnectFromRef.current = nodeId;
    const handleHit = getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection);
    const anchors = handleHit?.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
    pendingRightConnectAnchorsRef.current = anchors;
    event.preventDefault();
    event.stopPropagation();
    beginConnectDrag(nodeId, anchors);
  };

  const onCanvasMouseUpCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    const fromId = pendingRightConnectFromRef.current;
    const anchors = pendingRightConnectAnchorsRef.current;
    pendingRightConnectFromRef.current = null;
    pendingRightConnectAnchorsRef.current = HANDLE_CONNECT_ANCHORS;
    if (!fromId) return;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    const targetId =
      getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection)?.nodeId ||
      getNodeIdFromViewportPoint(event.clientX, event.clientY) ||
      getNodeIdFromEventTarget(event.target) ||
      (pointer ? findNodeAtCanvasPoint(pointer.x, pointer.y) : null);
    stopConnectDragListeners();
    setConnectDrag(null);
    const targetHandleHit = getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection);
    const resolvedAnchors = resolveDraggedEdgeAnchors(
      anchors,
      targetHandleHit?.nodeId === targetId ? targetHandleHit.anchor : undefined
    );
    if (targetId && targetId !== fromId && resolvedAnchors && tryCreateEdge(fromId, targetId, resolvedAnchors)) {
      setSelectedNodeIds([targetId]);
      return;
    }
    setSelectedNodeIds([fromId]);
  };

  const exportPng = React.useCallback(async () => {
    try {
      const snapshot = buildCanvasSvg(true);
      const svgBlob = new Blob([snapshot], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to render export image'));
        image.src = svgUrl;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      const exportWidth = image.naturalWidth || image.width || canvasSize.width;
      const exportHeight = image.naturalHeight || image.height || canvasSize.height;
      canvas.width = exportWidth * scale;
      canvas.height = exportHeight * scale;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context unavailable');
      context.scale(scale, scale);
      context.fillStyle = '#f8fafc';
      context.fillRect(0, 0, exportWidth, exportHeight);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(svgUrl);
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
      });
      const bytes = new Uint8Array(await pngBlob.arrayBuffer());
      const result = await window.flowmaptool.saveBinary({
        dataBase64: bytesToBase64(bytes),
        defaultPath: `${activeTab.title.replace('.qflow', '')}.png`,
        filters: PNG_FILTER
      });
      if (!result) return;
      setFileMessage(`Exported PNG: ${result.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PNG export failed';
      setFileMessage(`PNG export failed: ${message}`);
    }
  }, [activeTab.title, buildCanvasSvg, canvasSize.height, canvasSize.width]);

  const exportPdf = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.exportPdfFromSvg({
        svg: buildCanvasSvg(),
        defaultPath: `${activeTab.title.replace('.qflow', '')}.pdf`,
        width: canvasSize.width,
        height: canvasSize.height
      });
      if (!result) return;
      setFileMessage(`Exported PDF: ${result.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF export failed';
      setFileMessage(`PDF export failed: ${message}`);
    }
  }, [activeTab.title, buildCanvasSvg, canvasSize.height, canvasSize.width]);

  const printDiagram = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.printSvg({ svg: buildCanvasSvg() });
      setFileMessage(result.success ? 'Print completed' : 'Print canceled');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed';
      setFileMessage(`Print failed: ${message}`);
    }
  }, [buildCanvasSvg]);

  const switchLayoutDirection = React.useCallback(
    (direction: LayoutDirection) => {
      updateActiveTab(tab =>
        tab.layoutDirection === direction
          ? tab
          : {
              ...tab,
              layoutDirection: direction
            }
      );
      setSelectedEdgeId('');
      setDropParentTargetId(null);
    },
    [updateActiveTab]
  );

  React.useEffect(() => {
    return window.flowmaptool.onMenuAction(action => {
      if (action === 'file:new') void createNewDocument();
      if (action === 'file:open') void openDocument();
      if (action === 'file:save') void saveDocument(false);
      if (action === 'file:saveAs') void saveDocument(true);
      if (action === 'file:exportPng') void exportPng();
      if (action === 'file:exportPdf') void exportPdf();
      if (action === 'file:print') void printDiagram();
    });
  }, [createNewDocument, exportPdf, exportPng, openDocument, printDiagram, saveDocument]);

  React.useEffect(() => {
    return () => {
      stopConnectDragListeners();
      stopEdgeSegmentDragListeners();
    };
  }, [stopConnectDragListeners, stopEdgeSegmentDragListeners]);

  const getNodeVisualStyle = React.useCallback(
    (nodeId: NodeId, style?: NodeStyle): React.CSSProperties => {
      const isRoot = rootNodeIds.has(nodeId);
      const shape = style?.shape || (isRoot ? 'rounded' : doc.settings.defaultShape);
      const backgroundColor = style?.backgroundColor || (isRoot ? activeTheme.rootBg : activeTheme.nodeBg);
      const textColor = style?.textColor || (isRoot ? activeTheme.rootText : activeTheme.nodeText);
      const borderRadius =
        shape === 'pill' ? 999 : shape === 'square' || shape === 'underline' || shape === 'plain' ? 0 : 8;
      return {
        fontFamily: style?.fontFamily || DEFAULT_FONT_FAMILY,
        fontSize: style?.fontSize || DEFAULT_FONT_SIZE,
        fontWeight: style?.bold ? 700 : 400,
        fontStyle: style?.italic ? 'italic' : 'normal',
        textDecoration: style?.underline ? 'underline' : 'none',
        color: textColor,
        background: shape === 'underline' || shape === 'plain' ? 'transparent' : backgroundColor,
        borderRadius,
        borderStyle: 'solid',
        borderWidth: shape === 'underline' ? '0 0 2px 0' : shape === 'plain' ? 0 : 1,
        textAlign: style?.textAlign || 'left',
        justifyContent:
          style?.textAlign === 'center' ? 'center' : style?.textAlign === 'right' ? 'flex-end' : 'flex-start'
      };
    },
    [activeTheme, doc.settings.defaultShape, rootNodeIds]
  );

  const selectedEffectiveFontFamilies = selectedNodes.map(node => node.style?.fontFamily || DEFAULT_FONT_FAMILY);
  const selectedFontFamilyMixed = hasMixedValues(selectedEffectiveFontFamilies);
  const selectedFontFamily = sameValues(selectedEffectiveFontFamilies);
  const selectedEffectiveFontSizes = selectedNodes.map(node => node.style?.fontSize || DEFAULT_FONT_SIZE);
  const selectedFontSizeMixed = hasMixedValues(selectedEffectiveFontSizes);
  const selectedFontSize = sameValues(selectedEffectiveFontSizes);
  const selectedEffectiveTextColors = selectedNodes.map(node =>
    node.style?.textColor || (rootNodeIds.has(node.id) ? activeTheme.rootText : activeTheme.nodeText)
  );
  const selectedTextColorMixed = new Set(selectedEffectiveTextColors).size > 1;
  const selectedTextColor =
    selectedEffectiveTextColors.length > 0 && !selectedTextColorMixed ? selectedEffectiveTextColors[0] : '';
  const selectedEffectiveBackgroundColors = selectedNodes.map(node =>
    node.style?.backgroundColor || (rootNodeIds.has(node.id) ? activeTheme.rootBg : activeTheme.nodeBg)
  );
  const selectedBackgroundColorMixed = new Set(selectedEffectiveBackgroundColors).size > 1;
  const selectedBackgroundColor =
    selectedEffectiveBackgroundColors.length > 0 && !selectedBackgroundColorMixed
      ? selectedEffectiveBackgroundColors[0]
      : '';
  const selectedEffectiveTextAligns = selectedNodes.map(node => node.style?.textAlign || 'left');
  const selectedTextAlign = sameValues(selectedEffectiveTextAligns);
  const selectedEffectiveShapes = selectedNodes.map(node =>
    node.style?.shape || (rootNodeIds.has(node.id) ? 'rounded' : doc.settings.defaultShape)
  );
  const selectedShapeMixed = hasMixedValues(selectedEffectiveShapes);
  const selectedShape = sameValues(selectedEffectiveShapes);
  const selectedEffectiveEdgeStyles = selectedStyleEdges.map(edge =>
    effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle)
  );
  const selectedEffectiveEdgeWidths = selectedEffectiveEdgeStyles.map(style => style.width);
  const selectedEdgeWidthMixed = hasMixedValues(selectedEffectiveEdgeWidths);
  const selectedEdgeWidth = sameValues(selectedEffectiveEdgeWidths);
  const selectedEffectiveEdgeLineTypes = selectedEffectiveEdgeStyles.map(style => style.lineType);
  const selectedEdgeLineTypeMixed = hasMixedValues(selectedEffectiveEdgeLineTypes);
  const selectedEdgeLineType = sameValues(selectedEffectiveEdgeLineTypes);
  const selectedEffectiveEdgeColors = selectedEffectiveEdgeStyles.map(style => style.color);
  const selectedEdgeColorMixed = new Set(selectedEffectiveEdgeColors).size > 1;
  const selectedEdgeColor =
    selectedEffectiveEdgeColors.length > 0 && !selectedEdgeColorMixed ? selectedEffectiveEdgeColors[0] : '';
  const isAnyBold = selectedNodes.some(node => node.style?.bold === true);
  const isAllBold = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.bold === true);
  const isAnyItalic = selectedNodes.some(node => node.style?.italic === true);
  const isAllItalic = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.italic === true);
  const isAnyUnderline = selectedNodes.some(node => node.style?.underline === true);
  const isAllUnderline = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.underline === true);
  const hasMixedBold = isAnyBold && !isAllBold;
  const hasMixedItalic = isAnyItalic && !isAllItalic;
  const hasMixedUnderline = isAnyUnderline && !isAllUnderline;
  const hasNodeSelection = selectedNodeIds.length > 0;
  const tagNameById = React.useMemo(
    () => new Map(doc.settings.tags.map(tag => [tag.id, tag.name])),
    [doc.settings.tags]
  );

  const renderColorDropdown = (
    label: string,
    value: string | '',
    fallback: string,
    mixed: boolean,
    onSelect: (color: string) => void
  ) => {
    const displayColor = value || fallback;
    const isMixed = mixed;
    return (
      <div className="toolbar-field">
        <span>{label}</span>
        <details className="color-dropdown">
          <summary aria-label={label}>
            <span
              className={isMixed ? 'color-preview color-preview-mixed' : 'color-preview'}
              style={isMixed ? undefined : { backgroundColor: displayColor }}
            />
            <span className="color-dropdown-label">{isMixed ? 'Mixed' : displayColor.toUpperCase()}</span>
          </summary>
          <div className="color-swatch-grid" role="group" aria-label={`${label} options`}>
            {COLOR_SWATCHES.map(color => {
              const active = !isMixed && displayColor.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  className={active ? 'color-swatch color-swatch-active' : 'color-swatch'}
                  style={{ backgroundColor: color }}
                  aria-label={`${label} ${color}`}
                  onClick={event => {
                    onSelect(color);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                />
              );
            })}
          </div>
        </details>
      </div>
    );
  };

  const renderEdgeStyleControls = (
    title: string,
    edgeCount: number,
    widthValue: number | '',
    widthMixed: boolean,
    lineTypeValue: EdgeLineType | '',
    lineTypeMixed: boolean,
    colorValue: string | '',
    colorMixed: boolean,
    fallback: Required<EdgeStyle>,
    onPatch: (patch: EdgeStyle) => void
  ) => (
    <div className="edge-style-controls">
      <div className="toolbar-section-title">
        {title}{edgeCount > 0 ? ` (${edgeCount})` : ''}
      </div>
      <label className="toolbar-field">
        <span>Line Width</span>
        <select
          value={widthMixed ? MIXED_OPTION : String(widthValue || fallback.width)}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onPatch({ width: Number(event.target.value) });
          }}
        >
          {widthMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {EDGE_WIDTHS.map(width => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Line Type</span>
        <select
          value={lineTypeMixed ? MIXED_OPTION : lineTypeValue || fallback.lineType}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onPatch({ lineType: event.target.value as EdgeLineType });
          }}
        >
          {lineTypeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {EDGE_LINE_TYPES.map(lineType => (
            <option key={lineType.value} value={lineType.value}>
              {lineType.label}
            </option>
          ))}
        </select>
      </label>
      {renderColorDropdown('Line Color', colorValue, fallback.color, colorMixed, color => onPatch({ color }))}
    </div>
  );

  const renderMapToolbar = () => (
    <>
      <div className="toolbar-title">Mind Map Style</div>
      <label className="toolbar-field">
        <span>Theme</span>
        <select value={doc.settings.themeId} onChange={event => applyTheme(event.target.value)}>
          {Object.entries(THEMES).map(([id, theme]) => (
            <option key={id} value={id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Layout</span>
        <select
          value={layoutDirection}
          onChange={event => switchLayoutDirection(event.target.value as LayoutDirection)}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <label className="toolbar-field">
        <span>Horizontal Gap</span>
        <input
          type="number"
          min={SPACING_MIN}
          max={SPACING_MAX}
          value={doc.settings.spacing.horizontal}
          onChange={event => applySpacing('horizontal', Number(event.target.value))}
        />
      </label>
      <label className="toolbar-field">
        <span>Vertical Gap</span>
        <input
          type="number"
          min={SPACING_MIN}
          max={SPACING_MAX}
          value={doc.settings.spacing.vertical}
          onChange={event => applySpacing('vertical', Number(event.target.value))}
        />
      </label>
      <label className="toolbar-field">
        <span>Default Shape</span>
        <select
          value={doc.settings.defaultShape}
          onChange={event => commitDoc(prev => updateSettings(prev, { defaultShape: event.target.value as NodeShape }))}
        >
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      {renderEdgeStyleControls(
        'Default Line',
        0,
        doc.settings.defaultEdgeStyle.width || 2,
        false,
        doc.settings.defaultEdgeStyle.lineType || 'solid',
        false,
        doc.settings.defaultEdgeStyle.color || activeTheme.edge,
        false,
        {
          width: doc.settings.defaultEdgeStyle.width || 2,
          lineType: doc.settings.defaultEdgeStyle.lineType || 'solid',
          color: doc.settings.defaultEdgeStyle.color || activeTheme.edge
        },
        applyDefaultEdgeStyle
      )}
      <div className="toolbar-button-row">
        <button
          type="button"
          onClick={fitCanvasToView}
          aria-label="Fit"
          title="Fit graph to visible canvas"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={resetSelectedEdgeBend}
          aria-label="Reset Bend"
          title="Reset selected line route"
          disabled={!selectedEdgeId || (!edgeRoutes[selectedEdgeId] && !edgeBends[selectedEdgeId])}
        >
          Reset Bend
        </button>
      </div>
    </>
  );

  const renderNodeToolbar = () => {
    return (
      <>
      <div className="toolbar-title">Node Style</div>
      <div className="toolbar-subtitle">{selectedNodeIds.length} selected</div>
      <label className="toolbar-field">
        <span>Font</span>
        <select
          value={selectedFontFamilyMixed ? MIXED_OPTION : selectedFontFamily || DEFAULT_FONT_FAMILY}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            applySelectedNodeStyle({ fontFamily: event.target.value });
          }}
        >
          {selectedFontFamilyMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {FONT_FAMILIES.map(font => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Size</span>
        <select
          value={selectedFontSizeMixed ? MIXED_OPTION : String(selectedFontSize || DEFAULT_FONT_SIZE)}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            applySelectedNodeStyle({ fontSize: Number(event.target.value) });
          }}
        >
          {selectedFontSizeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {FONT_SIZES.map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="toolbar-toggle-row">
        <button
          type="button"
          aria-label="Bold"
          title="Bold"
          className={isAllBold ? 'mode-btn-active' : hasMixedBold ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ bold: !isAllBold })}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          title="Italic"
          className={isAllItalic ? 'mode-btn-active' : hasMixedItalic ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ italic: !isAllItalic })}
        >
          I
        </button>
        <button
          type="button"
          aria-label="Underline"
          title="Underline"
          className={isAllUnderline ? 'mode-btn-active' : hasMixedUnderline ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ underline: !isAllUnderline })}
        >
          U
        </button>
      </div>
      <div className="toolbar-toggle-row">
        {(['left', 'center', 'right'] as TextAlign[]).map(align => (
          <button
            key={align}
            type="button"
            aria-label={align === 'left' ? 'Align Left' : align === 'center' ? 'Align Center' : 'Align Right'}
            title={align === 'left' ? 'Align Left' : align === 'center' ? 'Align Center' : 'Align Right'}
            className={selectedTextAlign === align ? 'mode-btn-active' : ''}
            onClick={() => applySelectedNodeStyle({ textAlign: align })}
          >
            {align[0].toUpperCase()}
          </button>
        ))}
      </div>
      {renderColorDropdown('Text Color', selectedTextColor, '#0f172a', selectedTextColorMixed, color => applySelectedNodeStyle({ textColor: color }))}
      {renderColorDropdown('Node Color', selectedBackgroundColor, '#ffffff', selectedBackgroundColorMixed, color => applySelectedNodeStyle({ backgroundColor: color }))}
      <label className="toolbar-field">
        <span>Shape</span>
        <select
          value={selectedShapeMixed ? MIXED_OPTION : selectedShape || doc.settings.defaultShape}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            applySelectedNodeStyle({ shape: event.target.value as NodeShape });
          }}
        >
          {selectedShapeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      {selectedStyleEdges.length > 0
        ? renderEdgeStyleControls(
            'Related Lines',
            selectedStyleEdges.length,
            selectedEdgeWidth,
            selectedEdgeWidthMixed,
            selectedEdgeLineType,
            selectedEdgeLineTypeMixed,
            selectedEdgeColor,
            selectedEdgeColorMixed,
            {
              width: doc.settings.defaultEdgeStyle.width || 2,
              lineType: doc.settings.defaultEdgeStyle.lineType || 'solid',
              color: doc.settings.defaultEdgeStyle.color || activeTheme.edge
            },
            applySelectedEdgeStyle
          )
        : null}
      <div className="tag-list">
        <div className="tag-list-create">
          <span>Tag Color</span>
          <details className="color-dropdown tag-color-picker">
            <summary aria-label="New tag color">
              <span className="color-preview" style={{ backgroundColor: newTagColor }} />
              <span className="color-dropdown-label">{newTagColor.toUpperCase()}</span>
            </summary>
            <div className="color-swatch-grid" role="group" aria-label="New tag color options">
              {COLOR_SWATCHES.map(color => (
                <button
                  key={color}
                  type="button"
                  className={
                    newTagColor.toLowerCase() === color.toLowerCase() ? 'color-swatch color-swatch-active' : 'color-swatch'
                  }
                  style={{ backgroundColor: color }}
                  aria-label={`New tag color ${color}`}
                  onClick={event => {
                    setNewTagColor(color);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                />
              ))}
            </div>
          </details>
          <button type="button" aria-label="Add tag" title="Add tag" onClick={addCustomTag}>
            +
          </button>
        </div>
        {doc.settings.tags.map(tag => (
          <div key={tag.id} className="tag-row">
            <button
              type="button"
              className="tag-color-button"
              aria-label={`Apply tag ${tag.name}`}
              title={`Apply tag ${tag.name}`}
              style={{ backgroundColor: tag.color }}
              onClick={() => applySelectedNodeStyle({ tagId: tag.id })}
            />
            <input value={tag.name} onChange={event => renameTag(tag, event.target.value)} />
            <button type="button" aria-label={`Delete tag ${tag.name}`} onClick={() => removeTagById(tag.id)}>
              x
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={clearSelectedNodeStyle}>
        Reset Node Style
      </button>
      </>
    );
  };

  const renderEdgeToolbar = () => (
    <>
      <div className="toolbar-title">Line Style</div>
      <label className="toolbar-field">
        <span>Layout</span>
        <select
          aria-label="Layout"
          value={layoutDirection}
          onChange={event => switchLayoutDirection(event.target.value as LayoutDirection)}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      {renderEdgeStyleControls(
        'Selected Line',
        selectedStyleEdges.length,
        selectedEdgeWidth,
        selectedEdgeWidthMixed,
        selectedEdgeLineType,
        selectedEdgeLineTypeMixed,
        selectedEdgeColor,
        selectedEdgeColorMixed,
        {
          width: doc.settings.defaultEdgeStyle.width || 2,
          lineType: doc.settings.defaultEdgeStyle.lineType || 'solid',
          color: doc.settings.defaultEdgeStyle.color || activeTheme.edge
        },
        applySelectedEdgeStyle
      )}
      <div className="toolbar-button-row">
        <button
          type="button"
          onClick={resetSelectedEdgeBend}
          aria-label="Reset Bend"
          title="Reset selected line route"
          disabled={!selectedEdgeId || (!edgeRoutes[selectedEdgeId] && !edgeBends[selectedEdgeId])}
        >
          Reset Bend
        </button>
      </div>
    </>
  );

  const renderOutlineNodes = (items: OutlineTreeNode[], depth = 0): React.ReactNode =>
    items.map(item => {
      const hasChildren = item.children.length > 0;
      const collapsed = collapsedOutlineNodeIds.has(item.node.id);
      const selected = selectedNodeIdSet.has(item.node.id);
      const label = item.node.label.trim() || 'Untitled Node';
      const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
      const displayLabel = `${label}${tag ? ` [${tag.name}]` : ''}`;
      const checklistTargets = outlineChecklistTargetsByNodeId.get(item.node.id) || [];
      const checkedTargetCount = checklistTargets.filter(isChecklistNodeChecked).length;
      const canCheck = checklistTargets.length > 0;
      const checked = canCheck && checkedTargetCount === checklistTargets.length;
      const indeterminate = canCheck && checkedTargetCount > 0 && checkedTargetCount < checklistTargets.length;
      const nodeButtonClassName = [
        'outline-node-button',
        selected ? 'outline-node-selected' : '',
        checked ? 'outline-node-complete' : ''
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <React.Fragment key={item.node.id}>
          <div
            className={selected ? 'outline-row outline-row-selected' : 'outline-row'}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <button
              type="button"
              className="outline-disclosure"
              data-testid={`outline-toggle-${item.node.id}`}
              disabled={!hasChildren}
              onClick={() => toggleOutlineNode(item.node.id)}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {hasChildren ? (collapsed ? '▸' : '▾') : ''}
            </button>
            {canCheck ? (
              <input
                ref={input => {
                  if (input) input.indeterminate = indeterminate;
                }}
                type="checkbox"
                className="outline-check"
                data-testid={`outline-check-${item.node.id}`}
                checked={checked}
                onChange={event => toggleChecklistNodes(checklistTargets, event.currentTarget.checked)}
                onClick={event => event.stopPropagation()}
                title={checked ? 'Mark related tasks not done' : 'Mark related tasks done'}
                aria-label={`${checked ? 'Mark related tasks not done' : 'Mark related tasks done'}: ${displayLabel}`}
              />
            ) : (
              <span className="outline-check-placeholder" aria-hidden="true" />
            )}
            <button
              type="button"
              className={nodeButtonClassName}
              data-testid={`outline-node-${item.node.id}`}
              onClick={() => selectOutlineNode(item.node.id)}
              title={displayLabel}
            >
              {displayLabel}
            </button>
          </div>
          {hasChildren && !collapsed ? renderOutlineNodes(item.children, depth + 1) : null}
        </React.Fragment>
      );
    });

  const renderTaskTable = () => (
    <div className="task-table-scroll">
      {taskTableRows.length === 0 ? (
        <p className="outline-empty">Add tags to nodes to create task rows.</p>
      ) : (
        <table className="task-table">
          <colgroup>
            <col className="task-col-task" />
            <col className="task-col-category" />
            <col className="task-col-priority" />
            <col className="task-col-progress" />
            <col className="task-col-assignee" />
            <col className="task-col-start" />
            <col className="task-col-due" />
            <col className="task-col-tag" />
            <col className="task-col-notes" />
          </colgroup>
          <thead>
            <tr>
              {TASK_TABLE_COLUMNS.map(column => {
                const active = taskTableSort?.key === column.key;
                const direction = active ? taskTableSort.direction : undefined;
                return (
                  <th
                    key={column.key}
                    aria-sort={
                      active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="task-sort-button"
                      data-testid={`task-sort-${column.key}`}
                      onClick={() => toggleTaskTableSort(column.key)}
                    >
                      <span>{column.label}</span>
                      <span className={active ? 'task-sort-indicator task-sort-indicator-active' : 'task-sort-indicator'}>
                        {active ? (direction === 'asc' ? '^' : 'v') : ''}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {taskTableRows.map(row => {
              const task = row.node.task;
              const label = getTaskNodeLabel(row.node);

              return (
                <tr key={row.node.id}>
                  <td>
                    <button type="button" className="task-node-link" onClick={() => selectOutlineNode(row.node.id)}>
                      {label}
                    </button>
                  </td>
                  <td className="task-readonly-cell">{row.category || '-'}</td>
                  <td>
                    <select
                      value={task?.priority || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, {
                          priority: (event.currentTarget.value || 'normal') as TaskPriority
                        })
                      }
                    >
                      <option value="">-</option>
                      {TASK_PRIORITIES.map(priority => (
                        <option key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="task-progress-input"
                      type="number"
                      min={0}
                      max={100}
                      value={task?.progress ?? ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, {
                          progress:
                            event.currentTarget.value === ''
                              ? 0
                              : Math.max(0, Math.min(100, Number(event.currentTarget.value)))
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={task?.assignee || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { assignee: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={task?.startDate || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { startDate: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={task?.dueDate || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { dueDate: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                  <td className="task-readonly-cell">{row.tagName || '-'}</td>
                  <td>
                    <input
                      className="task-notes-input"
                      value={task?.note || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { note: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  const sidePanelVisible = outlineVisible || taskTableVisible;
  const workspaceClassName = [
    'canvas-workspace',
    taskTableVisible ? 'canvas-workspace-task-visible' : outlineVisible ? 'canvas-workspace-outline-visible' : '',
    taskTableVisible && taskTableExpanded ? 'canvas-workspace-task-expanded' : '',
    activeTab.toolbarVisible ? 'canvas-workspace-toolbar-visible' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const workspaceStyle = {
    ['--side-panel-width' as string]: `${sidePanelWidth}px`
  } as React.CSSProperties;

  return (
    <main className="app">
      <header className="tabs-header">
        <div className="tabs-strip">
          {tabs.map(tab => {
            const active = tab.id === activeTab.id;
            const label = tab.currentFilePath ? basename(tab.currentFilePath) : tab.title;
            return (
              <div key={tab.id} className={active ? 'tab-item tab-item-active' : 'tab-item'}>
                <button type="button" className="tab-switch" onClick={() => switchTab(tab.id)}>
                  {label}
                  {tab.isDirty ? <span className="tab-dirty-dot" /> : null}
                </button>
                {tabs.length > 1 ? (
                  <button type="button" className="tab-close" onClick={() => closeTab(tab.id)}>
                    x
                  </button>
                ) : null}
              </div>
            );
          })}
          <button type="button" className="tab-add" onClick={newTab}>
            +
          </button>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="outline-toggle-btn"
            data-testid="outline-toggle"
            onClick={() => {
              setTaskTableVisible(false);
              setTaskTableExpanded(false);
              setOutlineVisible(prev => !prev);
            }}
            title={outlineVisible ? 'Hide outline' : 'Show outline'}
          >
            {outlineVisible ? '☰' : '☷'}
          </button>
          <button
            type="button"
            className="task-toggle-btn"
            data-testid="task-toggle"
            onClick={() => {
              setOutlineVisible(false);
              const nextVisible = !taskTableVisible;
              setTaskTableVisible(nextVisible);
              if (!nextVisible) {
                setTaskTableExpanded(false);
              }
            }}
            title={taskTableVisible ? 'Hide tasks' : 'Show tasks'}
          >
            Task
          </button>
          <button
            type="button"
            className="toolbar-toggle-btn"
            onClick={() => setToolbarVisible(!activeTab.toolbarVisible)}
            title={activeTab.toolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
          >
            {activeTab.toolbarVisible ? '▧' : '▨'}
          </button>
        </div>
      </header>

      {fileMessage !== 'Ready' ? (
        <div
          className={fileMessage.includes('failed') || fileMessage.includes('blocked') ? 'file-status file-status-error' : 'file-status'}
          data-testid="file-status"
          role="status"
        >
          {fileMessage}
        </div>
      ) : null}

      <section className="panel canvas-panel">
        <div className={workspaceClassName} style={workspaceStyle}>
          {sidePanelVisible ? (
            taskTableVisible ? (
              <aside
                className={taskTableExpanded ? 'outline-panel task-panel task-panel-expanded' : 'outline-panel task-panel'}
                data-testid="task-panel"
              >
                <div className="outline-panel-header">
                  <span>Task</span>
                  <div className="outline-panel-actions">
                    <button
                      type="button"
                      className="outline-panel-action"
                      data-testid="task-expand-toggle"
                      onClick={() => setTaskTableExpanded(prev => !prev)}
                      title={taskTableExpanded ? 'Collapse task table' : 'Expand task table'}
                      aria-label={taskTableExpanded ? 'Collapse task table' : 'Expand task table'}
                    >
                      {taskTableExpanded ? 'Collapse' : 'Expand'}
                    </button>
                    <button
                      type="button"
                      data-testid="task-hide"
                      onClick={() => {
                        setTaskTableExpanded(false);
                        setTaskTableVisible(false);
                      }}
                      title="Hide tasks"
                    >
                      x
                    </button>
                  </div>
                </div>
                {renderTaskTable()}
              </aside>
            ) : (
              <aside className="outline-panel" data-testid="outline-panel">
                <div className="outline-panel-header">
                  <span>Checklist</span>
                  <button type="button" data-testid="outline-hide" onClick={() => setOutlineVisible(false)} title="Hide outline">
                    x
                  </button>
                </div>
                <div className="outline-tree">
                  {outlineTree.length > 0 ? renderOutlineNodes(outlineTree) : <p className="outline-empty">No nodes</p>}
                </div>
              </aside>
            )
          ) : null}
          {sidePanelVisible ? (
            <div
              className={sidePanelResizing ? 'panel-resizer panel-resizer-active' : 'panel-resizer'}
              role="separator"
              aria-orientation="vertical"
              aria-label={taskTableVisible ? 'Resize task panel' : 'Resize checklist panel'}
              aria-valuemin={SIDE_PANEL_MIN_WIDTH}
              aria-valuemax={SIDE_PANEL_MAX_WIDTH}
              aria-valuenow={sidePanelWidth}
              tabIndex={0}
              data-testid="side-panel-resizer"
              onPointerDown={onSidePanelResizePointerDown}
              onPointerMove={onSidePanelResizePointerMove}
              onPointerUp={finishSidePanelResize}
              onPointerCancel={finishSidePanelResize}
              onKeyDown={onSidePanelResizeKeyDown}
            />
          ) : null}
          <div className="canvas-main">
            <h2>
              Flow Canvas ({layoutDirection === 'horizontal' ? 'Horizontal' : 'Vertical'} Auto Layout)
            </h2>
            <div
              ref={canvasRef}
              className="canvas"
              data-testid="canvas-viewport"
              style={{ background: activeTheme.canvas }}
            >
              <div
                ref={canvasSurfaceRef}
                className={isLiveCanvasInteraction ? 'canvas-surface' : 'canvas-surface canvas-surface-animated'}
                data-testid="canvas-surface"
                style={{ width: canvasSize.width, height: canvasSize.height, zoom: canvasZoom }}
                onPointerDown={onCanvasPointerDown}
                onMouseDownCapture={onCanvasMouseDownCapture}
                onMouseUpCapture={onCanvasMouseUpCapture}
                onWheel={onCanvasWheel}
                onContextMenu={event => event.preventDefault()}
              >
                <svg
                  className="edge-layer"
                  aria-label="edge-layer"
                  style={{ width: canvasSize.width, height: canvasSize.height }}
                  onPointerDown={onCanvasPointerDown}
                >
                  {doc.edges.map(edge => {
                    const fromPos = renderedPositionMap.get(edge.from);
                    const toPos = renderedPositionMap.get(edge.to);
                    if (!fromPos || !toPos) return null;
                    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                    const lane = edgeLaneMap.get(edge.id) || 0;
                    const forceBend = edgeForceBendMap.get(edge.id) || false;
                    const selected = edge.id === selectedEdgeId;
                    const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
                    const edgeStyle = effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle);
                    const strokeDasharray = edgeStrokeDasharray(edgeStyle.lineType, edgeStyle.width);
                    return (
                      <path
                        key={edge.id}
                        data-testid={`edge-path-${edge.id}`}
                        data-edge-id={edge.id}
                        d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route)}
                        className={selected ? 'edge-path edge-path-selected' : 'edge-path'}
                        style={{
                          stroke: edgeStyle.color,
                          strokeWidth: selected ? edgeStyle.width + 1 : edgeStyle.width,
                          strokeDasharray
                        }}
                        onPointerDown={event => {
                          startEdgeSegmentDrag(event);
                        }}
                        onClick={event => {
                          if (suppressNextEdgeClickRef.current) {
                            event.preventDefault();
                            event.stopPropagation();
                            suppressNextEdgeClickRef.current = false;
                            return;
                          }
                          const point = getSvgContentPoint(event.currentTarget.ownerSVGElement, event.clientX, event.clientY);
                          const edgeHit = point ? findEdgeHitAtPoint(point, event.currentTarget.dataset.edgeId) : null;
                          setSelectedEdgeId(edgeHit?.edgeId || edge.id);
                          setSelectedRouteControl(null);
                          setSelectedNodeIds([]);
                        }}
                      />
                    );
                  })}
                  {connectDrag ? (
                    <path
                      className="edge-path edge-path-preview"
                      d={`M ${connectDrag.start.x} ${connectDrag.start.y} Q ${(connectDrag.start.x + connectDrag.current.x) / 2} ${(connectDrag.start.y + connectDrag.current.y) / 2} ${connectDrag.current.x} ${connectDrag.current.y}`}
                    />
                  ) : null}
                  {edgeBendDrag
                    ? doc.edges.map(edge => {
                        if (edge.id !== edgeBendDrag.edgeId) return null;
                        const fromPos = renderedPositionMap.get(edge.from);
                        const toPos = renderedPositionMap.get(edge.to);
                        if (!fromPos || !toPos) return null;
                        const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                        const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                        const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                        const lane = edgeLaneMap.get(edge.id) || 0;
                        const forceBend = edgeForceBendMap.get(edge.id) || false;
                        const route =
                          edgeRoutes[edge.id] ||
                          routeFromBend(edgeBends[edge.id]) ||
                          autoEdgeRouteMap.get(edge.id);
                        return (
                          <path
                            key={`route-preview-${edge.id}`}
                            data-testid="edge-route-drag-preview"
                            className="edge-route-drag-preview"
                            d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route)}
                          />
                        );
                      })
                    : null}
                  {!edgeBendDrag && selectedEdgeId
                    ? doc.edges.map(edge => {
                        if (edge.id !== selectedEdgeId) return null;
                        const fromPos = renderedPositionMap.get(edge.from);
                        const toPos = renderedPositionMap.get(edge.to);
                        if (!fromPos || !toPos) return null;
                        const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                        const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                        const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                        const lane = edgeLaneMap.get(edge.id) || 0;
                        const forceBend = edgeForceBendMap.get(edge.id) || false;
                        const isForwardAlignedEdge =
                          layoutDirection === 'horizontal'
                            ? endpoints.to.x >= endpoints.from.x && Math.abs(endpoints.to.y - endpoints.from.y) <= 2
                            : endpoints.to.y >= endpoints.from.y && Math.abs(endpoints.to.x - endpoints.from.x) <= 2;
                        const automaticManualRoute =
                          layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) || isForwardAlignedEdge
                            ? undefined
                            : autoEdgeRouteMap.get(edge.id);
                        const route =
                          edgeRoutes[edge.id] ||
                          routeFromBend(edgeBends[edge.id]) ||
                          automaticManualRoute;
                        if (!route || route.points.length === 0) return null;
                        return (
                          <path
                            key={`route-guide-${edge.id}`}
                            data-testid="edge-route-guide"
                            className="edge-route-guide"
                            d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route)}
                          />
                        );
                      })
                    : null}
                  {doc.edges.map(edge => {
                    if (edge.id !== selectedEdgeId) return null;
                    const fromPos = renderedPositionMap.get(edge.from);
                    const toPos = renderedPositionMap.get(edge.to);
                    if (!fromPos || !toPos) return null;
                    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                    const isForwardAlignedEdge =
                      layoutDirection === 'horizontal'
                        ? endpoints.to.x >= endpoints.from.x && Math.abs(endpoints.to.y - endpoints.from.y) <= 2
                        : endpoints.to.y >= endpoints.from.y && Math.abs(endpoints.to.x - endpoints.from.x) <= 2;
                    const automaticManualRoute =
                      layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) || isForwardAlignedEdge
                        ? undefined
                        : autoEdgeRouteMap.get(edge.id);
                    const route =
                      edgeRoutes[edge.id] ||
                      routeFromBend(edgeBends[edge.id]) ||
                      automaticManualRoute ||
                      routeFromBend(edgeMidpoint(endpoints.from, endpoints.to));
                    const point = route.points.length === 1
                      ? route.points[0]
                      : routeControlPoint(endpoints.from, endpoints.to, route);
                    const pointIndex = 0;
                    return (
                      <g key={`bend-${edge.id}`}>
                        <circle
                          className="edge-bend-hit-area"
                          cx={point.x}
                          cy={point.y}
                          r={9}
                          onPointerDown={event => startEdgeBendDrag(event, edge.id, pointIndex)}
                          onContextMenu={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        />
                        <circle
                          data-testid={`edge-route-point-${pointIndex}`}
                          className={
                            selectedRouteControl?.edgeId === edge.id && selectedRouteControl.pointIndex === pointIndex
                              ? 'edge-bend-handle edge-bend-handle-selected'
                              : 'edge-bend-handle'
                          }
                          cx={point.x}
                          cy={point.y}
                          r={7}
                          onPointerDown={event => startEdgeBendDrag(event, edge.id, pointIndex)}
                          onContextMenu={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        />
                      </g>
                    );
                  })}
                </svg>

                {marquee ? (
                  <div
                    className="marquee-selection"
                    style={{
                      left: Math.min(marquee.startX, marquee.currentX),
                      top: Math.min(marquee.startY, marquee.currentY),
                      width: Math.abs(marquee.currentX - marquee.startX),
                      height: Math.abs(marquee.currentY - marquee.startY)
                    }}
                  />
                ) : null}
                {dragInsertPreview ? (
                  <div
                    className="drag-insert-preview"
                    style={{
                      left: dragInsertPreview.left,
                      top: dragInsertPreview.top,
                      width: dragInsertPreview.width,
                      height: dragInsertPreview.height
                    }}
                  />
                ) : null}

                {layout.positions.map(pos => {
                  const node = doc.nodes.find(item => item.id === pos.id);
                  if (!node) return null;
                  const rendered = renderedPositionMap.get(node.id) || pos;
                  const nodeSize = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
                  const selected = selectedNodeIds.includes(node.id);
                  const editing = editingNodeId === node.id;
                  const connectHandleVisible = Boolean(connectDrag);
                  const nodeTag = node.style?.tagId
                    ? doc.settings.tags.find(tag => tag.id === node.style?.tagId)
                    : undefined;
                  return (
                    <button
                      key={node.id}
                      className={[
                        'flow-node',
                        selected ? 'flow-node-selected' : '',
                        connectHandleVisible ? 'flow-node-connect-visible' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-drop-target={
                        dropParentTargetId === node.id || connectDrag?.hoverTargetNodeId === node.id
                          ? 'true'
                          : undefined
                      }
                      data-tag-name={nodeTag?.name || undefined}
                      style={{
                        left: rendered.x,
                        top: rendered.y,
                        width: nodeSize.width,
                        height: nodeSize.height,
                        ...getNodeVisualStyle(node.id, node.style)
                      }}
                      data-testid={`node-${node.id}`}
                      type="button"
                      onPointerDown={event => onNodePointerDown(event, node.id)}
                      onMouseUp={event => onNodeMouseUp(event, node.id)}
                      onContextMenu={onNodeContextMenu}
                      onDoubleClick={() => startEditingNode(node.id)}
                    >
                      {editing ? (
                        <input
                          className="node-label-input"
                          value={editingLabel}
                          onInput={event => updateEditingLabel(event.currentTarget.value)}
                          onCompositionUpdate={event => updateEditingLabel(event.currentTarget.value)}
                          onCompositionEnd={event => updateEditingLabel(event.currentTarget.value)}
                          onChange={event => updateEditingLabel(event.currentTarget.value)}
                          onBlur={commitEditingNode}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitEditingNode();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              editingNodeIdRef.current = null;
                              editingLabelRef.current = '';
                              setEditingNodeId(null);
                              setEditingLabel('');
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <div className="node-label">{node.label}</div>
                      )}
                      {nodeTag ? (
                        <span
                          className="node-tag-marker"
                          style={{ backgroundColor: nodeTag.color }}
                          aria-label={nodeTag.name}
                        />
                      ) : null}
                      <span
                        className={
                          layoutDirection === 'horizontal'
                            ? 'node-connect-handle-front'
                            : 'node-connect-handle-front node-connect-handle-front-vertical'
                        }
                        title="Drag from input side"
                        onPointerDown={event => startConnectDrag(event, node.id, FRONT_HANDLE_CONNECT_ANCHORS)}
                        onContextMenu={event => event.preventDefault()}
                      />
                      <span
                        className={
                          layoutDirection === 'horizontal'
                            ? 'node-connect-handle'
                            : 'node-connect-handle node-connect-handle-vertical'
                        }
                        title="Drag to connect"
                        onPointerDown={event => startConnectDrag(event, node.id)}
                        onContextMenu={event => event.preventDefault()}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {activeTab.toolbarVisible ? (
            <aside className="right-toolbar-rail">
              <div className="right-toolbar right-toolbar-vertical">
                {hasNodeSelection ? renderNodeToolbar() : selectedEdgeId ? renderEdgeToolbar() : renderMapToolbar()}
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
