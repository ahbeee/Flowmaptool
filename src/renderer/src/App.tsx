import React from 'react';
import { AppHeader, FileStatus } from './app-header';
import { CanvasEdgesLayer } from './canvas-edges-layer';
import { CanvasNodesLayer } from './canvas-nodes-layer';
import { CanvasOverlaysLayer } from './canvas-overlays-layer';
import {
  addEdge,
  deleteTag,
  removeEdge,
  removeNodes,
  resetNodeStyle,
  setNodeChecked,
  updateEdgeStyle,
  updateNodeStyle,
  updateNodeTask,
  updateSettings,
  upsertTag,
  type FlowEdge,
  type FlowTag,
  type FlowDoc,
  type EdgeAnchors,
  type EdgeStyle,
  type FlowNode,
  type NodeId,
  type NodeStyle,
  type NodeTask
} from '@shared/graph';
import { commitHistory } from '@shared/history';
import {
  getLayoutSecondaryGap,
  layoutFlow,
  type LayoutDirection,
  type NodeSize,
  type NodeSizeMap
} from '@shared/layout';
import {
  buildRenderedPositionMap,
  hasAnyNodeOffset,
  mergeNodeOffsets,
  removeNodeOffsets,
  type NodeOffset,
  type NodeOffsetMap
} from '@shared/local-reflow';
import { extractSelection, type CopiedSelection } from '@shared/subflow';
import {
  buildDragInsertPreviewRect,
  buildNodeBoxMap,
  buildRouteScopeNodeIdsByNodeId,
  getCanvasSize,
  getMarqueeSelectedNodeIds,
  getNodeIdAtCanvasPoint,
  getScopedRouteNodeBoxes
} from './canvas-geometry';
import {
  getCenteredScrollTarget,
  getNodeScrollTarget,
  planCanvasFitToView,
  planCanvasWheelZoom
} from './canvas-viewport';
import { FRONT_HANDLE_CONNECT_ANCHORS, HANDLE_CONNECT_ANCHORS } from './connect-anchors';
import { planConnectDragFinish, updateConnectDragForPoint, type ConnectDragState } from './connect-dragging';
import { planEdgeConnection } from './edge-connection';
import {
  cloneEdgeBendsByDirection,
  cloneEdgeRoutesByDirection,
  commitDocHistoryToHost,
  commitCurrentEdgeUiSnapshotToHost,
  commitEdgeUiChangeToHost,
  getEdgeUiSnapshot,
  redoInteractionInHost,
  undoInteractionInHost,
  type EdgeUiSnapshot
} from './edge-ui-state';
import { exportPdfFromSvg as exportPdfDiagramFromSvg, exportPngFromSvg, printSvgDiagram } from './diagram-export';
import {
  buildCloseTabUpdate,
  buildNewTabUpdate,
  createTabDocument,
  ensureDocHasNode,
  getTabResetNodeId,
  pruneTabTransientUiState,
  replaceTabWithNewDocument,
  ROOT_LABEL,
  type TabDocument
} from './document-state';
import { findEdgeHitAtPoint as findEdgeHitAtPointFromState } from './edge-hit-testing';
import { buildAutoEdgeRouteMap, buildEdgeForceBendMap, buildEdgeLaneMap } from './edge-render-state';
import {
  getDirectionalAnchorPoint,
  getEdgeRenderEndpoints,
  getNodeCenter,
  getRouteSpacingOffsets,
  type LayoutPoint,
  type RouteSpacing
} from './edge-routing';
import {
  applyDraggedEdgeRouteToHost,
  buildDraggedEdgeRoute as buildDraggedEdgeRouteFromState,
  planEdgeSegmentDragFinish,
  planEdgeSegmentDragMove
} from './edge-route-dragging';
import { basename } from './export-utils';
import { analyzeLayoutEdges, type LayoutEdgeAnalysis } from './graph-analysis';
import {
  getKeyboardShortcutAction,
  getNodeSelectionByDirection,
  isTextEditingTarget,
  reorderSelectedNodeSibling as reorderDocSelectedNodeSibling
} from './keyboard-navigation';
import {
  createChildNodeStyle,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_NODE_SIZE,
  estimateNodeSize,
  NODE_TEXT_BASELINE_Y,
  ROOT_NODE_STYLE
} from './node-style';
import {
  applyCommittedNodeLabel,
  buildInsertNodeFromSelectionResult,
  buildPasteDetachedSelectionResult,
  getNodeEditingDraft
} from './node-actions';
import {
  applyPreservedComponentOffsetToNodeOffsets,
  applyNodeDragToHost,
  buildNodeDragStartState,
  hasNodeDragExceededThreshold,
  planNodeDragFinish,
  restoreDetachedNodeDragToHost,
  type NodeDragStateSnapshot
} from './node-dragging';
import { buildOutlineChecklistTargetsByNodeId, buildOutlineTree, toggleCollapsedOutlineNodeIds } from './outline';
import { OutlinePanel } from './outline-panel';
import { PanelResizer } from './panel-resizer';
import {
  parsePersistedQflow,
  serializePersistedQflow,
  type EdgeBend,
  type EdgeBendMap,
  type EdgeRoute,
  type EdgeRouteMap
} from './persistence';
import { pointInsideBox, segmentIntersectsBox, segmentsIntersect, type Point } from './routing-geometry';
import {
  buildTaskTableRows,
  getNextVisibleTaskTableColumnKeys,
  getNextTaskTableSort,
  getTaskTableTodayKey,
  getVisibleTaskTableColumns,
  isTaskTableColumnHideable,
  type TaskTableColumnKey,
  type TaskTableDensity,
  type TaskTableSortKey
} from './task-table';
import { TaskTablePanel } from './task-table-panel';
import { ToolbarPanel } from './toolbar-panel';
import { clampNodeLabel, getSelectedStyleEdges, nextCustomTagId, pruneSelectionForDoc } from './ui-helpers';
import {
  getNodeVisualStyle as buildNodeVisualStyle,
  summarizeSelectedEdgeStyles,
  summarizeSelectedNodeStyles
} from './selection-style';
import { planNodePointerDown } from './selection-interactions';
import {
  ADVANCED_ROUTE_EDGE_LIMIT,
  ADVANCED_ROUTE_NODE_LIMIT,
  clamp,
  COLOR_SWATCHES,
  getTheme,
  SIDE_PANEL_DEFAULT_WIDTH,
  SPACING_MAX,
  SPACING_MIN
} from './ui-config';
import {
  beginSidePanelResize,
  getSidePanelDragWidth,
  getSidePanelKeyboardWidth,
  shouldFinishSidePanelResize,
  type SidePanelResizeState
} from './side-panel-resize';
import {
  getConnectHandleHitFromViewportPoint,
  getNodeIdFromEventTarget,
  getNodeIdFromViewportPoint,
  getViewportConnectHandleHit,
  isNodeLabelInputTarget,
  isViewportPointOnConnectHandle
} from './viewport-hit-testing';
import { buildCanvasSvg as buildCanvasSvgMarkup, buildSvgSnapshot } from './svg-export';

type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type EdgeBendDragState = { edgeId: string; pointIndex: number };
type EdgeRouteControlSelection = { edgeId: string; pointIndex: number };
type DragPointerLikeEvent = {
  clientX: number;
  clientY: number;
  target?: EventTarget | null;
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
  const [dragState, setDragState] = React.useState<NodeDragStateSnapshot | null>(null);
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
      const resizeState = beginSidePanelResize({
        button: event.button,
        pointerId: event.pointerId,
        clientX: event.clientX,
        currentWidth: sidePanelWidth
      });
      if (!resizeState) return;
      sidePanelResizeRef.current = resizeState;
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
    if (!shouldFinishSidePanelResize(resizeState, event.pointerId)) return;

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
    const nextWidth = getSidePanelDragWidth(sidePanelResizeRef.current, event.pointerId, event.clientX);
    if (nextWidth === null) return;
    setSidePanelWidth(nextWidth);
  }, []);

  const onSidePanelResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const nextWidth = getSidePanelKeyboardWidth(sidePanelWidth, event.key);
      if (nextWidth === null) return;
      event.preventDefault();
      setSidePanelWidth(nextWidth);
    },
    [sidePanelWidth]
  );

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
  const taskTableExpanded = activeTab.taskTable.expanded;
  const taskTableSort = activeTab.taskTable.sort;
  const taskTableTodayKey = React.useMemo(() => getTaskTableTodayKey(), []);
  const visibleTaskTableColumnKeys = activeTab.taskTable.visibleColumnKeys;
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
  const checkedNodeIdSet = React.useMemo(() => new Set(doc.checklist.checkedNodeIds), [doc.checklist.checkedNodeIds]);
  const tagById = React.useMemo(() => new Map(doc.settings.tags.map(tag => [tag.id, tag])), [doc.settings.tags]);
  const outlineChecklistTargetsByNodeId = React.useMemo(
    () => buildOutlineChecklistTargetsByNodeId(outlineTree, new Set(tagById.keys())),
    [outlineTree, tagById]
  );
  const isChecklistNodeChecked = React.useCallback(
    (nodeId: NodeId) => checkedNodeIdSet.has(nodeId),
    [checkedNodeIdSet]
  );
  const taskTableSourceRows = React.useMemo(() => buildTaskTableRows(outlineTree, tagById), [outlineTree, tagById]);
  const taskTableRows = React.useMemo(
    () => buildTaskTableRows(outlineTree, tagById, taskTableSort, activeTab.taskTable.filters, taskTableTodayKey),
    [outlineTree, tagById, taskTableSort, activeTab.taskTable.filters, taskTableTodayKey]
  );
  const taskTableFilterTagOptions = React.useMemo(
    () => doc.settings.tags.filter(tag => taskTableSourceRows.some(row => row.tagId === tag.id)),
    [doc.settings.tags, taskTableSourceRows]
  );
  const taskTableFilterAssigneeOptions = React.useMemo(() => {
    const names = new Set<string>();
    for (const row of taskTableSourceRows) {
      const assignee = row.node.task?.assignee?.trim();
      if (assignee) names.add(assignee);
    }
    return [...names].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [taskTableSourceRows]);
  const hasTaskTableQueryState = taskTableSort !== undefined || Object.keys(activeTab.taskTable.filters).length > 0;
  const visibleTaskTableColumns = React.useMemo(
    () => getVisibleTaskTableColumns(visibleTaskTableColumnKeys),
    [visibleTaskTableColumnKeys]
  );
  const visibleTaskTableColumnKeySet = React.useMemo(
    () => new Set(visibleTaskTableColumns.map(column => column.key)),
    [visibleTaskTableColumns]
  );
  const selectedStyleEdges = React.useMemo(
    () => getSelectedStyleEdges(doc.edges, selectedEdgeId, selectedNodeIds),
    [doc.edges, selectedEdgeId, selectedNodeIds]
  );

  const updateActiveTab = React.useCallback(
    (recipe: (tab: TabDocument) => TabDocument) => {
      setTabs(prev => prev.map(tab => (tab.id === activeTabId ? recipe(tab) : tab)));
    },
    [activeTabId]
  );

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

  const resetTransientUiState = React.useCallback(
    (defaultNodeId?: NodeId) => {
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
    },
    [stopConnectDragListeners, stopEdgeSegmentDragListeners]
  );

  const setCurrentNodeOffsets = React.useCallback(
    (updater: (prev: NodeOffsetMap) => NodeOffsetMap) => {
      updateActiveTab(tab => ({
        ...tab,
        nodeOffsetsByDirection: {
          ...tab.nodeOffsetsByDirection,
          [tab.layoutDirection]: updater(tab.nodeOffsetsByDirection[tab.layoutDirection])
        }
      }));
    },
    [updateActiveTab]
  );

  const restoreCurrentNodeOffsets = React.useCallback(
    (offsets: Record<NodeId, NodeOffset>) => {
      setCurrentNodeOffsets(prev => mergeNodeOffsets(prev, offsets));
    },
    [setCurrentNodeOffsets]
  );

  const setCurrentEdgeBends = React.useCallback(
    (updater: (prev: EdgeBendMap) => EdgeBendMap) => {
      updateActiveTab(tab => ({
        ...tab,
        edgeBendsByDirection: {
          ...tab.edgeBendsByDirection,
          [tab.layoutDirection]: updater(tab.edgeBendsByDirection[tab.layoutDirection])
        }
      }));
    },
    [updateActiveTab]
  );

  const setCurrentEdgeRoutes = React.useCallback(
    (updater: (prev: EdgeRouteMap) => EdgeRouteMap) => {
      updateActiveTab(tab => ({
        ...tab,
        edgeRoutesByDirection: {
          ...tab.edgeRoutesByDirection,
          [tab.layoutDirection]: updater(tab.edgeRoutesByDirection[tab.layoutDirection])
        }
      }));
    },
    [updateActiveTab]
  );

  const commitEdgeUiChange = React.useCallback(
    (recipe: (snapshot: EdgeUiSnapshot, layoutDirection: LayoutDirection) => EdgeUiSnapshot) => {
      updateActiveTab(tab => commitEdgeUiChangeToHost(tab, recipe, tab.layoutDirection));
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const commitCurrentEdgeUiSnapshot = React.useCallback(
    (before: EdgeUiSnapshot | null) => {
      if (!before) return;
      updateActiveTab(tab => commitCurrentEdgeUiSnapshotToHost(tab, before));
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const undoInteraction = React.useCallback(() => {
    updateActiveTab(undoInteractionInHost);
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const redoInteraction = React.useCallback(() => {
    updateActiveTab(redoInteractionInHost);
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

  const getSvgContentPoint = React.useCallback(
    (svg: SVGSVGElement | null, clientX: number, clientY: number): Point | null => {
      if (!svg) return null;
      const matrix = svg.getScreenCTM();
      if (!matrix) return null;
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const transformed = point.matrixTransform(matrix.inverse());
      return { x: transformed.x, y: transformed.y };
    },
    []
  );

  const commitDoc = React.useCallback(
    (recipe: (current: FlowDoc) => FlowDoc) => {
      updateActiveTab(tab => {
        const nextDoc = ensureDocHasNode(recipe(tab.history.present));
        const nextHistory = commitHistory(tab.history, nextDoc);
        return commitDocHistoryToHost(tab, nextHistory);
      });
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const toggleChecklistNodes = React.useCallback(
    (nodeIds: NodeId[], checked: boolean) => {
      if (nodeIds.length === 0) return;
      commitDoc(prev => nodeIds.reduce((nextDoc, nodeId) => setNodeChecked(nextDoc, nodeId, checked), prev));
    },
    [commitDoc]
  );

  const newTab = React.useCallback(() => {
    const update = buildNewTabUpdate(tabs, tabCounter);
    setTabs(update.tabs);
    setActiveTabId(update.activeTabId);
    setTabCounter(update.tabCounter);
    setFileMessage('New tab');
    resetTransientUiState(update.resetNodeId);
  }, [resetTransientUiState, tabCounter, tabs]);

  const closeTab = React.useCallback(
    (tabId: string) => {
      const update = buildCloseTabUpdate(tabs, activeTabId, tabId);
      if (!update) return;
      setTabs(update.tabs);
      setActiveTabId(update.activeTabId);
      setFileMessage('Tab closed');
      resetTransientUiState();
    },
    [activeTabId, resetTransientUiState, tabs]
  );

  const switchTab = React.useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      const tab = tabs.find(item => item.id === tabId);
      resetTransientUiState(getTabResetNodeId(tab));
    },
    [resetTransientUiState, tabs]
  );

  const createNewDocument = React.useCallback(() => {
    let resetNodeId: string | undefined;
    updateActiveTab(tab => {
      const update = replaceTabWithNewDocument(tab, tabCounter);
      resetNodeId = update.resetNodeId;
      return update.tab;
    });
    setFileMessage('New document');
    resetTransientUiState(resetNodeId);
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
          toolbarVisible: loaded.ui.toolbarVisible,
          taskTable: loaded.ui.taskTable
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
            toolbarVisible: activeTab.toolbarVisible,
            taskTable: activeTab.taskTable
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
  const renderedPositionMap = React.useMemo(
    () => buildRenderedPositionMap(layout.positions, nodeOffsets),
    [layout.positions, nodeOffsets]
  );

  const scrollNodeIntoCanvas = React.useCallback(
    (nodeId: NodeId) => {
      const canvas = canvasRef.current;
      const rendered = renderedPositionMap.get(nodeId);
      if (!canvas || !rendered) return;
      const size = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
      canvas.scrollTo({
        ...getNodeScrollTarget(rendered, size, canvasZoom, {
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight
        }),
        behavior: 'auto'
      });
    },
    [canvasZoom, nodeSizeMap, renderedPositionMap]
  );

  const nodeBoxMap = React.useMemo(
    () => buildNodeBoxMap(doc.nodes, renderedPositionMap, nodeSizeMap, DEFAULT_NODE_SIZE),
    [doc.nodes, nodeSizeMap, renderedPositionMap]
  );

  const routeScopeNodeIdsByNodeId = React.useMemo(
    () => buildRouteScopeNodeIdsByNodeId(doc, layoutEdgeAnalysis.layoutEdgeIds),
    [doc, layoutEdgeAnalysis.layoutEdgeIds]
  );

  const getRouteNodeBoxes = React.useCallback(
    (edge: FlowEdge) => getScopedRouteNodeBoxes(edge, nodeBoxMap, routeScopeNodeIdsByNodeId),
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

  const edgeForceBendMap = React.useMemo(
    () =>
      buildEdgeForceBendMap({
        edges: doc.edges,
        renderedPositionMap,
        nodeSizeMap,
        layoutDirection,
        layoutEdgeIds: layoutEdgeAnalysis.layoutEdgeIds,
        useAdvancedAutoRouting,
        getRenderedEdgeEndpoints,
        getRouteNodeBoxes
      }),
    [
      doc.edges,
      getRenderedEdgeEndpoints,
      getRouteNodeBoxes,
      layoutDirection,
      layoutEdgeAnalysis.layoutEdgeIds,
      nodeSizeMap,
      renderedPositionMap,
      useAdvancedAutoRouting
    ]
  );

  const edgeLaneMap = React.useMemo(
    () =>
      buildEdgeLaneMap({
        edges: doc.edges,
        renderedPositionMap,
        nodeSizeMap,
        edgeForceBendMap,
        layoutDirection,
        getRenderedEdgeEndpoints
      }),
    [doc.edges, edgeForceBendMap, getRenderedEdgeEndpoints, layoutDirection, nodeSizeMap, renderedPositionMap]
  );

  const autoEdgeRouteMap = React.useMemo(
    () =>
      buildAutoEdgeRouteMap({
        edges: doc.edges,
        renderedPositionMap,
        nodeSizeMap,
        edgeRoutes,
        edgeBends,
        edgeForceBendMap,
        edgeLaneMap,
        layoutDirection,
        layoutEdgeIds: layoutEdgeAnalysis.layoutEdgeIds,
        layoutSpacing,
        convergePrimarySpacing:
          layoutDirection === 'horizontal' ? doc.settings.spacing.horizontal : doc.settings.spacing.vertical,
        useAdvancedAutoRouting,
        getRenderedEdgeEndpoints,
        getRouteNodeBoxes
      }),
    [
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
      layoutSpacing,
      nodeSizeMap,
      renderedPositionMap,
      useAdvancedAutoRouting
    ]
  );

  const buildDraggedEdgeRoute = React.useCallback(
    (edgeId: string, pointer: Point): EdgeRoute | undefined => {
      return buildDraggedEdgeRouteFromState({
        doc,
        edgeId,
        pointer,
        renderedPositionMap,
        nodeSizeMap,
        defaultNodeSize: DEFAULT_NODE_SIZE,
        layoutDirection,
        layoutSpacing,
        getRouteNodeBoxes,
        getRenderedEdgeEndpoints
      });
    },
    [doc, getRenderedEdgeEndpoints, getRouteNodeBoxes, layoutSpacing, layoutDirection, nodeSizeMap, renderedPositionMap]
  );

  const tryCreateEdge = React.useCallback(
    (from: NodeId, to: NodeId, anchors?: EdgeAnchors) => {
      const plan = planEdgeConnection(doc, from, to, primaryRootNodeId, rootNodeIds, anchors);
      if (!plan.ok) {
        setFileMessage(plan.message);
        return false;
      }
      commitDoc(prev => {
        const withEdge = addEdge(prev, plan.from, plan.to, plan.role, plan.anchors);
        return plan.shouldNormalizeAttachedRoot
          ? updateNodeStyle(withEdge, [plan.to], createChildNodeStyle(withEdge.settings.defaultShape))
          : withEdge;
      });
      if (plan.mergedComponentNodeIds) {
        setCurrentNodeOffsets(prev => {
          const next = { ...prev };
          for (const nodeId of plan.mergedComponentNodeIds || []) {
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
    return buildDragInsertPreviewRect(
      dragState,
      layout.positions,
      nodeOffsets,
      renderedPositionMap,
      nodeSizeMap,
      DEFAULT_NODE_SIZE,
      layoutDirection,
      getLayoutSecondaryGap(layoutDirection)
    );
  }, [dragState, layout.positions, layoutDirection, nodeOffsets, nodeSizeMap, renderedPositionMap]);

  const canvasSize = React.useMemo(
    () => getCanvasSize(doc.nodes, renderedPositionMap, nodeSizeMap, DEFAULT_NODE_SIZE),
    [doc.nodes, nodeSizeMap, renderedPositionMap]
  );

  const fitCanvasToView = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fitPlan = planCanvasFitToView(doc.nodes, renderedPositionMap, nodeSizeMap, DEFAULT_NODE_SIZE, {
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight
    });
    if (!fitPlan) return;
    setCanvasZoom(fitPlan.zoom);
    requestAnimationFrame(() => {
      canvas.scrollTo({
        ...getCenteredScrollTarget(
          fitPlan.center,
          fitPlan.zoom,
          { clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight },
          { scrollWidth: canvas.scrollWidth, scrollHeight: canvas.scrollHeight }
        ),
        behavior: 'auto'
      });
    });
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const buildCurrentSvgSnapshot = React.useCallback(
    () =>
      buildSvgSnapshot({
        doc,
        renderedPositionMap,
        nodeSizeMap,
        rootNodeIds,
        edgeRoutes,
        edgeBends,
        autoEdgeRouteMap,
        edgeLaneMap,
        edgeForceBendMap,
        getRenderedEdgeEndpoints
      }),
    [
      autoEdgeRouteMap,
      doc,
      edgeBends,
      edgeForceBendMap,
      edgeLaneMap,
      edgeRoutes,
      getRenderedEdgeEndpoints,
      nodeSizeMap,
      renderedPositionMap,
      rootNodeIds
    ]
  );

  const buildCanvasSvg = React.useCallback(
    (fitToContent = false) => {
      return buildCanvasSvgMarkup(buildCurrentSvgSnapshot(), {
        canvasSize,
        theme: activeTheme,
        defaultShape: doc.settings.defaultShape,
        layoutDirection,
        fitToContent
      });
    },
    [activeTheme, buildCurrentSvgSnapshot, canvasSize, doc.settings.defaultShape, layoutDirection]
  );

  React.useEffect(() => {
    setSelectedNodeIds(prev => {
      return pruneSelectionForDoc(doc.nodes, doc.edges, prev, selectedEdgeId).selectedNodeIds;
    });
    const nextSelectedEdgeId = pruneSelectionForDoc(
      doc.nodes,
      doc.edges,
      selectedNodeIdsRef.current,
      selectedEdgeId
    ).selectedEdgeId;
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
    updateActiveTab(pruneTabTransientUiState);
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
    const result = buildPasteDetachedSelectionResult(doc, copiedSelection);
    if (!result) return;
    commitDoc(() => result.doc);
    setSelectedNodeIds(result.newNodeIds);
    setSelectedEdgeId('');
    setCurrentNodeOffsets(prev => {
      const next = { ...prev };
      for (const [id, offset] of Object.entries(result.offsetUpdates)) next[id] = offset;
      return next;
    });
  }, [commitDoc, copiedSelection, doc, setCurrentNodeOffsets]);

  const startEditingNode = React.useCallback(
    (nodeId: NodeId) => {
      const draft = getNodeEditingDraft(doc, nodeId);
      if (!draft) return;
      editingNodeIdRef.current = draft.nodeId;
      editingLabelRef.current = draft.label;
      setEditingNodeId(draft.nodeId);
      setEditingLabel(draft.label);
    },
    [doc]
  );

  const updateEditingLabel = React.useCallback((value: string) => {
    const label = clampNodeLabel(value);
    editingLabelRef.current = label;
    setEditingLabel(label);
  }, []);

  const cancelEditingNode = React.useCallback(() => {
    editingNodeIdRef.current = null;
    editingLabelRef.current = '';
    setEditingNodeId(null);
    setEditingLabel('');
  }, []);

  const commitEditingNode = React.useCallback(() => {
    const nodeId = editingNodeIdRef.current;
    if (!nodeId) return;
    const nextLabel = clampNodeLabel(editingLabelRef.current).trim();
    editingNodeIdRef.current = null;
    editingLabelRef.current = '';
    setEditingNodeId(null);
    setEditingLabel('');
    if (applyCommittedNodeLabel(doc, nodeId, nextLabel) === doc) return;
    commitDoc(prev => applyCommittedNodeLabel(prev, nodeId, nextLabel));
  }, [commitDoc, doc]);

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
    const result = buildInsertNodeFromSelectionResult(doc, currentSelection, nodeOffsets, 'child');
    if (!result) return;
    commitDoc(() => result.doc);
    setCurrentNodeOffsets(prev => ({
      ...prev,
      [result.newNodeId]: result.offset
    }));
    setSelectedNodeIds([result.newNodeId]);
    selectedNodeIdsRef.current = [result.newNodeId];
    setSelectedEdgeId('');
    editingNodeIdRef.current = result.newNodeId;
    editingLabelRef.current = result.newLabel;
    setEditingNodeId(result.newNodeId);
    setEditingLabel(result.newLabel);
  }, [commitDoc, doc, nodeOffsets, setCurrentNodeOffsets]);

  const createSiblingNodeFromSelection = React.useCallback(() => {
    const currentSelection = selectedNodeIdsRef.current;
    const result = buildInsertNodeFromSelectionResult(doc, currentSelection, nodeOffsets, 'sibling');
    if (!result) return;
    commitDoc(() => result.doc);
    setCurrentNodeOffsets(prev => ({
      ...prev,
      [result.newNodeId]: result.offset
    }));
    setSelectedNodeIds([result.newNodeId]);
    selectedNodeIdsRef.current = [result.newNodeId];
    setSelectedEdgeId('');
    editingNodeIdRef.current = result.newNodeId;
    editingLabelRef.current = result.newLabel;
    setEditingNodeId(result.newNodeId);
    setEditingLabel(result.newLabel);
  }, [commitDoc, doc, nodeOffsets, setCurrentNodeOffsets]);

  const selectNodeByDirection = React.useCallback(
    (directionKey: string) => {
      const currentSelection = selectedNodeIdsRef.current;
      if (currentSelection.length !== 1) return false;
      const next = getNodeSelectionByDirection(
        doc.nodes,
        currentSelection[0],
        directionKey,
        renderedPositionMap,
        nodeSizeMap,
        DEFAULT_NODE_SIZE
      );
      if (!next) return false;
      setSelectedNodeIds([next]);
      selectedNodeIdsRef.current = [next];
      setSelectedEdgeId('');
      setSelectedRouteControl(null);
      return true;
    },
    [doc.nodes, nodeSizeMap, renderedPositionMap]
  );

  const reorderSelectedNodeSibling = React.useCallback(
    (direction: -1 | 1) => {
      const currentSelection = selectedNodeIdsRef.current;
      if (currentSelection.length !== 1) return false;
      const selectedNodeId = currentSelection[0];
      let changed = false;
      commitDoc(prev => {
        const next = reorderDocSelectedNodeSibling(prev, selectedNodeId, direction);
        changed = next !== prev;
        return next;
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

  const toggleTaskTableSort = React.useCallback(
    (key: TaskTableSortKey) => {
      updateActiveTab(tab => ({
        ...tab,
        taskTable: {
          ...tab.taskTable,
          sort: getNextTaskTableSort(tab.taskTable.sort, key)
        }
      }));
    },
    [updateActiveTab]
  );

  const toggleTaskTableColumn = React.useCallback(
    (key: TaskTableColumnKey) => {
      updateActiveTab(tab => {
        const nextVisibleColumnKeys = getNextVisibleTaskTableColumnKeys(tab.taskTable.visibleColumnKeys, key);
        const nextSort =
          tab.taskTable.sort?.key === key && isTaskTableColumnHideable(key) ? undefined : tab.taskTable.sort;
        return {
          ...tab,
          taskTable: {
            ...tab.taskTable,
            sort: nextSort,
            visibleColumnKeys: nextVisibleColumnKeys
          }
        };
      });
    },
    [updateActiveTab]
  );

  const setTaskTableExpanded = React.useCallback(
    (expanded: boolean | ((current: boolean) => boolean)) => {
      updateActiveTab(tab => ({
        ...tab,
        taskTable: {
          ...tab.taskTable,
          expanded: typeof expanded === 'function' ? expanded(tab.taskTable.expanded) : expanded
        }
      }));
    },
    [updateActiveTab]
  );

  const setTaskTableDensity = React.useCallback(
    (density: TaskTableDensity) => {
      updateActiveTab(tab => ({
        ...tab,
        taskTable: {
          ...tab.taskTable,
          density
        }
      }));
    },
    [updateActiveTab]
  );

  const setTaskTableFilter = React.useCallback(
    (key: 'tagId' | 'assignee' | 'due', value: string) => {
      updateActiveTab(tab => {
        const nextFilters = { ...tab.taskTable.filters, [key]: value || undefined };
        if (!nextFilters[key]) delete nextFilters[key];
        return {
          ...tab,
          taskTable: {
            ...tab.taskTable,
            filters: nextFilters
          }
        };
      });
    },
    [updateActiveTab]
  );

  const clearTaskTableQueryState = React.useCallback(() => {
    updateActiveTab(tab => ({
      ...tab,
      taskTable: {
        ...tab.taskTable,
        sort: undefined,
        filters: {}
      }
    }));
  }, [updateActiveTab]);

  const applySelectedEdgeStyle = React.useCallback(
    (patch: EdgeStyle) => {
      if (selectedStyleEdges.length === 0) return;
      commitDoc(prev =>
        updateEdgeStyle(
          prev,
          selectedStyleEdges.map(edge => edge.id),
          patch
        )
      );
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
      const latestSelectedNodeIds = selectedNodeIdsRef.current;
      const action = getKeyboardShortcutAction(
        {
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey
        },
        {
          selectedNodeIds: latestSelectedNodeIds,
          selectedEdgeId,
          inEditor: isTextEditingTarget(event.target)
        }
      );
      if (!action) return;
      event.preventDefault();

      switch (action.type) {
        case 'undo':
          undoInteraction();
          break;
        case 'redo':
          redoInteraction();
          break;
        case 'new-document':
          createNewDocument();
          break;
        case 'open-document':
          void openDocument();
          break;
        case 'save-document':
          void saveDocument(action.saveAs);
          break;
        case 'fit-canvas':
          fitCanvasToView();
          break;
        case 'copy-selection':
          copySelectedNodes();
          break;
        case 'paste-selection':
          pasteSelectedNodes();
          break;
        case 'create-linked-node':
          createLinkedNodeFromSelection();
          break;
        case 'create-sibling-node':
          createSiblingNodeFromSelection();
          break;
        case 'reorder-sibling':
          reorderSelectedNodeSibling(action.direction);
          break;
        case 'select-node-by-direction':
          selectNodeByDirection(action.directionKey);
          break;
        case 'delete-edge':
          deleteSelectedEdge();
          break;
        case 'delete-nodes':
          deleteSelectedNodes();
          break;
        case 'edit-node':
          startEditingNode(action.nodeId);
          break;
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
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const zoomPlan = planCanvasWheelZoom(
        canvasZoom,
        event.deltaY,
        { x: pointerX, y: pointerY },
        { left: canvas.scrollLeft, top: canvas.scrollTop }
      );
      if (!zoomPlan) return;
      setCanvasZoom(zoomPlan.zoom);
      requestAnimationFrame(() => {
        canvas.scrollTo(zoomPlan.scroll);
      });
    },
    [canvasZoom]
  );

  React.useEffect(() => {
    if (!dragState) return;
    const onPointerMove = (event: PointerEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      if (!dragDidMoveRef.current && !hasNodeDragExceededThreshold(dragState, pointer)) return;
      dragDidMoveRef.current = true;
      updateActiveTab(tab => {
        return applyNodeDragToHost(tab, {
          doc,
          dragState,
          pointer,
          basePositions: layout.positions,
          rootNodeIds,
          nodeSizeMap,
          defaultNodeSize: DEFAULT_NODE_SIZE
        });
      });
      if (dragState.nodeIds.length === 1) {
        const x = pointer.x;
        const y = pointer.y;
        const candidate = getNodeIdAtCanvasPoint(
          { x, y },
          layout.positions,
          renderedPositionMap,
          nodeSizeMap,
          DEFAULT_NODE_SIZE,
          [dragState.anchorNodeId]
        );
        setDropParentTargetId(candidate);
      }
    };
    const onPointerUp = (event: PointerEvent | MouseEvent) => {
      if (!dragDidMoveRef.current) {
        setDragState(null);
        setDropParentTargetId(null);
        return;
      }
      let finalDropParentTargetId = dropParentTargetId;
      if (dragState.nodeIds.length === 1) {
        finalDropParentTargetId = null;
        const pointer = getCanvasContentPoint(event.clientX, event.clientY);
        if (pointer) {
          finalDropParentTargetId = getNodeIdAtCanvasPoint(
            pointer,
            layout.positions,
            renderedPositionMap,
            nodeSizeMap,
            DEFAULT_NODE_SIZE,
            [dragState.anchorNodeId]
          );
        }
      }
      const finishPlan = planNodeDragFinish({
        doc,
        dragState,
        dropParentTargetId: finalDropParentTargetId,
        rootNodeIds,
        primaryRootNodeId: primaryRootNodeId || '',
        renderedPositionMap,
        layoutDirection,
        nodeSizeMap,
        layoutSpacing
      });
      if (finishPlan.type === 'reparent') {
        const { result: reparentResult } = finishPlan;
        const movingNodeId = reparentResult.movingNodeId;
        commitDoc(() => reparentResult.doc);
        const preservedComponentOffset = reparentResult.preservedComponentOffset;
        if (preservedComponentOffset) {
          setCurrentNodeOffsets(prev => applyPreservedComponentOffsetToNodeOffsets(prev, preservedComponentOffset));
        } else {
          restoreCurrentNodeOffsets(dragState.startOffsets);
        }
        setSelectedNodeIds([movingNodeId]);
      } else if (finishPlan.type === 'restore-detached') {
        updateActiveTab(tab => restoreDetachedNodeDragToHost(tab, dragState));
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
  }, [
    autoPanCanvas,
    commitDoc,
    doc,
    dragState,
    dropParentTargetId,
    getCanvasContentPoint,
    layout.positions,
    layoutDirection,
    layoutSpacing,
    nodeSizeMap,
    primaryRootNodeId,
    renderedPositionMap,
    restoreCurrentNodeOffsets,
    rootNodeIds,
    setCurrentNodeOffsets,
    updateActiveTab
  ]);

  const findNodeAtCanvasPoint = React.useCallback(
    (x: number, y: number): NodeId | null => {
      return getNodeIdAtCanvasPoint({ x, y }, layout.positions, renderedPositionMap, nodeSizeMap, DEFAULT_NODE_SIZE);
    },
    [layout.positions, nodeSizeMap, renderedPositionMap]
  );

  const updateConnectDragFromPointer = React.useCallback(
    (event: DragPointerLikeEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const { x, y } = pointer;
      setConnectDrag(prev => {
        if (!prev) return prev;
        const hitId = findNodeAtCanvasPoint(x, y);
        const next = updateConnectDragForPoint(prev, { x, y }, hitId);
        connectDragRef.current = next;
        return next;
      });
    },
    [autoPanCanvas, findNodeAtCanvasPoint, getCanvasContentPoint]
  );

  const finishConnectDragFromPointer = React.useCallback(
    (event: DragPointerLikeEvent) => {
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
      const plan = planConnectDragFinish(drag, {
        handleTargetNodeId: targetHandleHit?.nodeId,
        viewportTargetNodeId: targetFromPoint,
        hoverTargetNodeId: drag.hoverTargetNodeId,
        canvasTargetNodeId: findNodeAtCanvasPoint(x, y),
        eventTargetNodeId: targetFromEvent,
        handleAnchor: targetHandleHit?.anchor
      });
      if (plan && tryCreateEdge(plan.fromNodeId, plan.targetNodeId, plan.anchors)) {
        setSelectedNodeIds([plan.targetNodeId]);
      }
    },
    [findNodeAtCanvasPoint, getCanvasContentPoint, layoutDirection, stopConnectDragListeners, tryCreateEdge]
  );

  React.useEffect(() => {
    if (!edgeBendDrag) return;
    const moveEdgeBend = (event: PointerEvent | MouseEvent) => {
      event.preventDefault();
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const route = buildDraggedEdgeRoute(edgeBendDrag.edgeId, pointer);
      if (!route) return;
      updateActiveTab(tab => applyDraggedEdgeRouteToHost(tab, edgeBendDrag.edgeId, route));
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
    updateActiveTab
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
        const hits = getMarqueeSelectedNodeIds(prev, doc.nodes, renderedPositionMap, nodeSizeMap, DEFAULT_NODE_SIZE);
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
      const movePlan = planEdgeSegmentDragMove(start, pointer, didDrag);
      if (movePlan.type === 'ignore') return;
      didDrag = movePlan.didDrag;
      suppressNextEdgeClickRef.current = movePlan.suppressNextEdgeClick;
      const route = buildDraggedEdgeRoute(edgeId, pointer);
      if (!route) return;
      updateActiveTab(tab => applyDraggedEdgeRouteToHost(tab, edgeId, route));
    };
    const onPointerUp = () => {
      const finishPlan = planEdgeSegmentDragFinish(edgeId, didDrag);
      if (finishPlan.shouldCommitSnapshot) {
        commitCurrentEdgeUiSnapshot(initialEdgeUiSnapshot);
      }
      setSelectedEdgeId(finishPlan.selectedEdgeId);
      setSelectedRouteControl(null);
      setSelectedNodeIds([]);
      stopEdgeSegmentDragListeners();
    };
    edgeSegmentDragListenersRef.current = { onPointerMove, onPointerUp };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const findEdgeHitAtPoint = (point: Point, preferredEdgeId?: string) => {
    return findEdgeHitAtPointFromState({
      edges: doc.edges,
      point,
      preferredEdgeId,
      renderedPositionMap,
      nodeSizeMap,
      defaultNodeSize: DEFAULT_NODE_SIZE,
      layoutDirection,
      layoutEdgeIds: layoutEdgeAnalysis.layoutEdgeIds,
      edgeRoutes,
      edgeBends,
      autoEdgeRouteMap,
      edgeLaneMap,
      edgeForceBendMap,
      getRenderedEdgeEndpoints
    });
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
    const handleHit =
      event.button === 2 ? getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection) : null;
    const handleAnchor = handleHit?.anchor === 'front' || handleHit?.anchor === 'back' ? handleHit.anchor : null;
    const pointerPlan = planNodePointerDown({
      button: event.button,
      nodeId,
      selectedNodeIds: selectedNodeIdsRef.current,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      handleAnchor
    });
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      if (pointerPlan.type === 'right-connect') {
        pendingRightConnectFromRef.current = nodeId;
        const anchors = pointerPlan.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
        pendingRightConnectAnchorsRef.current = anchors;
        beginConnectDrag(nodeId, anchors);
        return;
      }
      setSelectedEdgeId('');
      if (pointerPlan.type === 'right-select') {
        setSelectedNodeIds(pointerPlan.nextSelection);
        selectedNodeIdsRef.current = pointerPlan.nextSelection;
      }
      return;
    }
    if (pointerPlan.type === 'ignore') return;
    event.preventDefault();
    setDragState(null);
    setDropParentTargetId(null);
    setSelectedEdgeId('');
    if (pointerPlan.type === 'shift-connect') {
      if (pointerPlan.fromNodeId) {
        tryCreateEdge(pointerPlan.fromNodeId, pointerPlan.targetNodeId);
      }
      setSelectedNodeIds(pointerPlan.nextSelection);
      selectedNodeIdsRef.current = pointerPlan.nextSelection;
      return;
    }
    if (pointerPlan.type === 'toggle-selection') {
      selectedNodeIdsRef.current = pointerPlan.nextSelection;
      setSelectedNodeIds(pointerPlan.nextSelection);
      return;
    }
    if (pointerPlan.type !== 'select-and-drag') return;
    setSelectedNodeIds(pointerPlan.nextSelection);
    selectedNodeIdsRef.current = pointerPlan.nextSelection;
    const startPoint = getCanvasContentPoint(event.clientX, event.clientY);
    if (!startPoint) return;
    dragDidMoveRef.current = false;
    setDragState(
      buildNodeDragStartState({
        doc,
        nodeId,
        startPoint,
        nodeOffsets,
        edgeBends,
        edgeRoutes,
        rootNodeIds,
        layoutEdgeIds: layoutEdgeAnalysis.layoutEdgeIds
      })
    );
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
    const plan = planConnectDragFinish(drag, {
      handleTargetNodeId: nodeId,
      handleAnchor: targetHandleHit?.anchor
    });
    if (plan && tryCreateEdge(plan.fromNodeId, plan.targetNodeId, plan.anchors)) {
      setSelectedNodeIds([plan.targetNodeId]);
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
    startEdgeSegmentDragAtPoint(edgeHit.edgeId, start, (clientX, clientY) => getSvgContentPoint(svg, clientX, clientY));
  };

  const selectEdgeFromPathClick = (event: React.MouseEvent<SVGPathElement>, edge: FlowEdge) => {
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

  const startConnectDrag = (
    event: React.PointerEvent<HTMLSpanElement>,
    nodeId: NodeId,
    anchors = HANDLE_CONNECT_ANCHORS
  ) => {
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
      if (
        !target.closest('.node-connect-handle') &&
        !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)
      ) {
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
    if (
      !target.closest('.node-connect-handle') &&
      !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)
    ) {
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
    const plan = targetId
      ? planConnectDragFinish(
          {
            fromNodeId: fromId,
            anchors,
            start: pointer || { x: 0, y: 0 },
            current: pointer || { x: 0, y: 0 },
            hoverTargetNodeId: null
          },
          {
            handleTargetNodeId: targetHandleHit?.nodeId,
            viewportTargetNodeId: targetId,
            handleAnchor: targetHandleHit?.anchor
          }
        )
      : null;
    if (plan && tryCreateEdge(plan.fromNodeId, plan.targetNodeId, plan.anchors)) {
      setSelectedNodeIds([plan.targetNodeId]);
      return;
    }
    setSelectedNodeIds([fromId]);
  };

  const exportPng = React.useCallback(async () => {
    const result = await exportPngFromSvg({
      svg: buildCanvasSvg(true),
      title: activeTab.title,
      canvasSize,
      saveBinary: window.flowmaptool.saveBinary
    });
    if (!result.ok) {
      setFileMessage(`PNG export failed: ${result.message}`);
    } else if (result.filePath) {
      setFileMessage(`Exported PNG: ${result.filePath}`);
    }
  }, [activeTab.title, buildCanvasSvg, canvasSize.height, canvasSize.width]);

  const exportPdf = React.useCallback(async () => {
    const result = await exportPdfDiagramFromSvg({
      svg: buildCanvasSvg(),
      title: activeTab.title,
      canvasSize,
      exportPdfFromSvg: window.flowmaptool.exportPdfFromSvg
    });
    if (!result.ok) {
      setFileMessage(`PDF export failed: ${result.message}`);
    } else if (result.filePath) {
      setFileMessage(`Exported PDF: ${result.filePath}`);
    }
  }, [activeTab.title, buildCanvasSvg, canvasSize.height, canvasSize.width]);

  const printDiagram = React.useCallback(async () => {
    const result = await printSvgDiagram({
      svg: buildCanvasSvg(),
      printSvg: window.flowmaptool.printSvg
    });
    setFileMessage(result.ok ? result.message || 'Print completed' : `Print failed: ${result.message}`);
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
      return buildNodeVisualStyle({
        nodeId,
        style,
        rootNodeIds,
        theme: activeTheme,
        defaults: {
          fontFamily: DEFAULT_FONT_FAMILY,
          fontSize: DEFAULT_FONT_SIZE,
          defaultShape: doc.settings.defaultShape
        }
      });
    },
    [activeTheme, doc.settings.defaultShape, rootNodeIds]
  );

  const selectedNodeStyleSummary = summarizeSelectedNodeStyles(selectedNodes, rootNodeIds, activeTheme, {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    defaultShape: doc.settings.defaultShape
  });
  const selectedEdgeStyleSummary = summarizeSelectedEdgeStyles(selectedStyleEdges, doc.settings.defaultEdgeStyle);
  const hasNodeSelection = selectedNodeIds.length > 0;

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
  const toggleOutlinePanel = React.useCallback(() => {
    setTaskTableVisible(false);
    setTaskTableExpanded(false);
    setOutlineVisible(prev => !prev);
  }, [setTaskTableExpanded]);
  const toggleTaskTablePanel = React.useCallback(() => {
    setOutlineVisible(false);
    const nextVisible = !taskTableVisible;
    setTaskTableVisible(nextVisible);
    if (!nextVisible) {
      setTaskTableExpanded(false);
    }
  }, [setTaskTableExpanded, taskTableVisible]);

  return (
    <main className="app">
      <AppHeader
        tabs={tabs}
        activeTabId={activeTab.id}
        outlineVisible={outlineVisible}
        taskTableVisible={taskTableVisible}
        toolbarVisible={activeTab.toolbarVisible}
        onNewTab={newTab}
        onCloseTab={closeTab}
        onSwitchTab={switchTab}
        onToggleOutline={toggleOutlinePanel}
        onToggleTaskTable={toggleTaskTablePanel}
        onToggleToolbar={() => setToolbarVisible(!activeTab.toolbarVisible)}
      />

      <FileStatus message={fileMessage} />

      <section className="panel canvas-panel">
        <div className={workspaceClassName} style={workspaceStyle}>
          {sidePanelVisible ? (
            taskTableVisible ? (
              <TaskTablePanel
                expanded={taskTableExpanded}
                density={activeTab.taskTable.density}
                filters={activeTab.taskTable.filters}
                sort={taskTableSort}
                rows={taskTableRows}
                sourceRows={taskTableSourceRows}
                filterTagOptions={taskTableFilterTagOptions}
                filterAssigneeOptions={taskTableFilterAssigneeOptions}
                visibleColumns={visibleTaskTableColumns}
                visibleColumnKeySet={visibleTaskTableColumnKeySet}
                todayKey={taskTableTodayKey}
                hasQueryState={hasTaskTableQueryState}
                onSetFilter={setTaskTableFilter}
                onClearQueryState={clearTaskTableQueryState}
                onToggleSort={toggleTaskTableSort}
                onToggleColumn={toggleTaskTableColumn}
                onSetDensity={setTaskTableDensity}
                onToggleExpanded={() => setTaskTableExpanded(prev => !prev)}
                onHide={() => {
                  setTaskTableExpanded(false);
                  setTaskTableVisible(false);
                }}
                onSelectNode={selectOutlineNode}
                onUpdateTaskField={updateTaskTableField}
              />
            ) : (
              <OutlinePanel
                outlineTree={outlineTree}
                collapsedNodeIds={collapsedOutlineNodeIds}
                selectedNodeIds={selectedNodeIdSet}
                tagById={tagById}
                checklistTargetsByNodeId={outlineChecklistTargetsByNodeId}
                isChecklistNodeChecked={isChecklistNodeChecked}
                onToggleNode={toggleOutlineNode}
                onToggleChecklistNodes={toggleChecklistNodes}
                onSelectNode={selectOutlineNode}
                onHide={() => setOutlineVisible(false)}
              />
            )
          ) : null}
          {sidePanelVisible ? (
            <PanelResizer
              active={sidePanelResizing}
              label={taskTableVisible ? 'Resize task table panel' : 'Resize outline panel'}
              value={sidePanelWidth}
              onPointerDown={onSidePanelResizePointerDown}
              onPointerMove={onSidePanelResizePointerMove}
              onPointerUp={finishSidePanelResize}
              onKeyDown={onSidePanelResizeKeyDown}
            />
          ) : null}
          <div className="canvas-main">
            <h2>Flow Canvas ({layoutDirection === 'horizontal' ? 'Horizontal' : 'Vertical'} Auto Layout)</h2>
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
                <CanvasEdgesLayer
                  width={canvasSize.width}
                  height={canvasSize.height}
                  edges={doc.edges}
                  defaultEdgeStyle={doc.settings.defaultEdgeStyle}
                  renderedPositionMap={renderedPositionMap}
                  nodeSizeMap={nodeSizeMap}
                  defaultNodeSize={DEFAULT_NODE_SIZE}
                  layoutDirection={layoutDirection}
                  layoutEdgeIds={layoutEdgeAnalysis.layoutEdgeIds}
                  edgeRoutes={edgeRoutes}
                  edgeBends={edgeBends}
                  autoEdgeRouteMap={autoEdgeRouteMap}
                  edgeLaneMap={edgeLaneMap}
                  edgeForceBendMap={edgeForceBendMap}
                  selectedEdgeId={selectedEdgeId}
                  selectedRouteControl={selectedRouteControl}
                  edgeBendDrag={edgeBendDrag}
                  connectDrag={connectDrag}
                  getRenderedEdgeEndpoints={getRenderedEdgeEndpoints}
                  onCanvasPointerDown={onCanvasPointerDown}
                  onStartEdgeSegmentDrag={startEdgeSegmentDrag}
                  onSelectEdge={selectEdgeFromPathClick}
                  onStartEdgeBendDrag={startEdgeBendDrag}
                />

                <CanvasOverlaysLayer marquee={marquee} dragInsertPreview={dragInsertPreview} />

                <CanvasNodesLayer
                  positions={layout.positions}
                  nodeById={nodeById}
                  tags={doc.settings.tags}
                  renderedPositionMap={renderedPositionMap}
                  nodeSizeMap={nodeSizeMap}
                  defaultNodeSize={DEFAULT_NODE_SIZE}
                  selectedNodeIds={selectedNodeIds}
                  editingNodeId={editingNodeId}
                  editingLabel={editingLabel}
                  layoutDirection={layoutDirection}
                  connectHandleVisible={Boolean(connectDrag)}
                  dropParentTargetId={dropParentTargetId}
                  hoverTargetNodeId={connectDrag?.hoverTargetNodeId}
                  getNodeVisualStyle={getNodeVisualStyle}
                  onNodePointerDown={onNodePointerDown}
                  onNodeMouseUp={onNodeMouseUp}
                  onNodeContextMenu={onNodeContextMenu}
                  onStartEditingNode={startEditingNode}
                  onUpdateEditingLabel={updateEditingLabel}
                  onCommitEditingNode={commitEditingNode}
                  onCancelEditingNode={cancelEditingNode}
                  onStartConnectDrag={startConnectDrag}
                />
              </div>
            </div>
          </div>
          {activeTab.toolbarVisible ? (
            <ToolbarPanel
              hasNodeSelection={hasNodeSelection}
              hasEdgeSelection={Boolean(selectedEdgeId)}
              selectedNodeCount={selectedNodeIds.length}
              selectedStyleEdgeCount={selectedStyleEdges.length}
              nodeStyleSummary={selectedNodeStyleSummary}
              edgeStyleSummary={selectedEdgeStyleSummary}
              settings={doc.settings}
              layoutDirection={layoutDirection}
              themeEdgeColor={activeTheme.edge}
              canResetSelectedEdgeBend={Boolean(
                selectedEdgeId && (edgeRoutes[selectedEdgeId] || edgeBends[selectedEdgeId])
              )}
              newTagColor={newTagColor}
              onApplyTheme={applyTheme}
              onSwitchLayoutDirection={switchLayoutDirection}
              onApplySpacing={applySpacing}
              onSetDefaultShape={shape => commitDoc(prev => updateSettings(prev, { defaultShape: shape }))}
              onApplyDefaultEdgeStyle={applyDefaultEdgeStyle}
              onFitCanvasToView={fitCanvasToView}
              onResetSelectedEdgeBend={resetSelectedEdgeBend}
              onApplySelectedNodeStyle={applySelectedNodeStyle}
              onApplySelectedEdgeStyle={applySelectedEdgeStyle}
              onSetNewTagColor={setNewTagColor}
              onAddCustomTag={addCustomTag}
              onRenameTag={renameTag}
              onRemoveTag={removeTagById}
              onClearSelectedNodeStyle={clearSelectedNodeStyle}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
