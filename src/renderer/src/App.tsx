import React from 'react';
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
  type EdgeLineType,
  type EdgeAnchors,
  type EdgeStyle,
  type FlowNode,
  type NodeId,
  type NodeShape,
  type NodeStyle,
  type NodeTask,
  type TaskPriority,
  type TextAlign
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
import { edgeMidpoint, edgePath, routeControlPoint, routeFromBend } from './edge-path';
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
import {
  buildOutlineChecklistTargetsByNodeId,
  buildOutlineTree,
  toggleCollapsedOutlineNodeIds,
  type OutlineTreeNode
} from './outline';
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
  getTaskNodeLabel,
  getTaskTableDueStatus,
  getTaskTableTodayKey,
  getVisibleTaskTableColumns,
  isTaskTableColumnHideable,
  TASK_TABLE_DENSITY_OPTIONS,
  TASK_TABLE_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TABLE_COLUMNS,
  type TaskTableColumnKey,
  type TaskTableDensity,
  type TaskTableSortKey
} from './task-table';
import {
  clampNodeLabel,
  edgeStrokeDasharray,
  effectiveEdgeStyle,
  getSelectedStyleEdges,
  nextCustomTagId,
  pruneSelectionForDoc
} from './ui-helpers';
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
  EDGE_LINE_TYPES,
  EDGE_WIDTHS,
  FONT_FAMILIES,
  FONT_SIZES,
  getTheme,
  MIXED_OPTION,
  NODE_SHAPES,
  SIDE_PANEL_DEFAULT_WIDTH,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SPACING_MAX,
  SPACING_MIN,
  THEMES
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
  const {
    selectedFontFamilyMixed,
    selectedFontFamily,
    selectedFontSizeMixed,
    selectedFontSize,
    selectedTextColorMixed,
    selectedTextColor,
    selectedBackgroundColorMixed,
    selectedBackgroundColor,
    selectedTextAlign,
    selectedShapeMixed,
    selectedShape,
    isAllBold,
    isAllItalic,
    isAllUnderline,
    hasMixedBold,
    hasMixedItalic,
    hasMixedUnderline
  } = selectedNodeStyleSummary;
  const {
    selectedEdgeWidthMixed,
    selectedEdgeWidth,
    selectedEdgeLineTypeMixed,
    selectedEdgeLineType,
    selectedEdgeColorMixed,
    selectedEdgeColor
  } = summarizeSelectedEdgeStyles(selectedStyleEdges, doc.settings.defaultEdgeStyle);
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
        {title}
        {edgeCount > 0 ? ` (${edgeCount})` : ''}
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
        <button type="button" onClick={fitCanvasToView} aria-label="Fit" title="Fit graph to visible canvas">
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
        {renderColorDropdown('Text Color', selectedTextColor, '#0f172a', selectedTextColorMixed, color =>
          applySelectedNodeStyle({ textColor: color })
        )}
        {renderColorDropdown('Node Color', selectedBackgroundColor, '#ffffff', selectedBackgroundColorMixed, color =>
          applySelectedNodeStyle({ backgroundColor: color })
        )}
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
                      newTagColor.toLowerCase() === color.toLowerCase()
                        ? 'color-swatch color-swatch-active'
                        : 'color-swatch'
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
    <>
      <div className="task-table-filter-row">
        <label>
          <span>Tag</span>
          <select
            data-testid="task-filter-tag"
            value={activeTab.taskTable.filters.tagId || ''}
            onChange={event => setTaskTableFilter('tagId', event.currentTarget.value)}
          >
            <option value="">All tags</option>
            {taskTableFilterTagOptions.map(tag => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Assignee</span>
          <select
            data-testid="task-filter-assignee"
            value={activeTab.taskTable.filters.assignee || ''}
            onChange={event => setTaskTableFilter('assignee', event.currentTarget.value)}
          >
            <option value="">All assignees</option>
            {taskTableFilterAssigneeOptions.map(assignee => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Due</span>
          <select
            data-testid="task-filter-due"
            value={activeTab.taskTable.filters.due || ''}
            onChange={event => setTaskTableFilter('due', event.currentTarget.value)}
          >
            <option value="">All due dates</option>
            {TASK_TABLE_DUE_FILTERS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="task-table-filter-actions">
          <button
            type="button"
            data-testid="task-clear-query"
            onClick={clearTaskTableQueryState}
            disabled={!hasTaskTableQueryState}
            title="Clear task filters and sort"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="task-table-scroll">
        {taskTableSourceRows.length === 0 ? (
          <p className="outline-empty">Tag outline nodes to create task table rows.</p>
        ) : taskTableRows.length === 0 ? (
          <p className="outline-empty">No task table rows match the current filters.</p>
        ) : (
          <table className={`task-table task-table-${activeTab.taskTable.density}`}>
            <colgroup>
              {visibleTaskTableColumns.map(column => (
                <col key={column.key} className={`task-col-${column.key}`} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visibleTaskTableColumns.map(column => {
                  const active = taskTableSort?.key === column.key;
                  const direction = active ? taskTableSort.direction : undefined;
                  return (
                    <th
                      key={column.key}
                      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        className="task-sort-button"
                        data-testid={`task-sort-${column.key}`}
                        onClick={() => toggleTaskTableSort(column.key)}
                      >
                        <span>{column.label}</span>
                        <span
                          className={active ? 'task-sort-indicator task-sort-indicator-active' : 'task-sort-indicator'}
                        >
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
                const dueStatus = getTaskTableDueStatus(task?.dueDate, taskTableTodayKey);

                return (
                  <tr key={row.node.id}>
                    {visibleTaskTableColumnKeySet.has('task') ? (
                      <td>
                        <button type="button" className="task-node-link" onClick={() => selectOutlineNode(row.node.id)}>
                          {label}
                        </button>
                      </td>
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('category') ? (
                      <td className="task-readonly-cell">{row.category || '-'}</td>
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('priority') ? (
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
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('progress') ? (
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
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('assignee') ? (
                      <td>
                        <input
                          value={task?.assignee || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            updateTaskTableField(row.node.id, { assignee: event.currentTarget.value || undefined })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('start') ? (
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
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('due') ? (
                      <td className={dueStatus === 'none' ? undefined : `task-due-cell task-due-cell-${dueStatus}`}>
                        <input
                          aria-label={`Due date for ${label}`}
                          title={dueStatus === 'overdue' ? 'Overdue' : dueStatus === 'today' ? 'Due today' : 'Due date'}
                          type="date"
                          value={task?.dueDate || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            updateTaskTableField(row.node.id, { dueDate: event.currentTarget.value || undefined })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('tag') ? (
                      <td className="task-readonly-cell">{row.tagName || '-'}</td>
                    ) : null}
                    {visibleTaskTableColumnKeySet.has('notes') ? (
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
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
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
            title={taskTableVisible ? 'Hide task table' : 'Show task table'}
          >
            Task Table
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
          className={
            fileMessage.includes('failed') || fileMessage.includes('blocked')
              ? 'file-status file-status-error'
              : 'file-status'
          }
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
                className={
                  taskTableExpanded ? 'outline-panel task-panel task-panel-expanded' : 'outline-panel task-panel'
                }
                data-testid="task-panel"
              >
                <div className="outline-panel-header">
                  <span>Task Table</span>
                  <div className="outline-panel-actions">
                    <details className="task-column-menu">
                      <summary className="outline-panel-action" data-testid="task-columns-toggle">
                        Columns
                      </summary>
                      <div className="task-column-menu-panel" data-testid="task-columns-menu">
                        {TASK_TABLE_COLUMNS.map(column => {
                          const hideable = isTaskTableColumnHideable(column.key);
                          return (
                            <label key={column.key} className="task-column-option">
                              <input
                                type="checkbox"
                                checked={visibleTaskTableColumnKeySet.has(column.key)}
                                disabled={!hideable}
                                onChange={() => toggleTaskTableColumn(column.key)}
                              />
                              <span>{column.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                    <select
                      className="outline-panel-action task-density-select"
                      data-testid="task-density"
                      value={activeTab.taskTable.density}
                      onChange={event => setTaskTableDensity(event.currentTarget.value as TaskTableDensity)}
                      aria-label="Task table density"
                      title="Task table density"
                    >
                      {TASK_TABLE_DENSITY_OPTIONS.map(option => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
                      title="Hide task table"
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
                  <span>Outline</span>
                  <button
                    type="button"
                    data-testid="outline-hide"
                    onClick={() => setOutlineVisible(false)}
                    title="Hide outline"
                  >
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
              aria-label={taskTableVisible ? 'Resize task table panel' : 'Resize outline panel'}
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
                    const route =
                      edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
                    const edgeStyle = effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle);
                    const strokeDasharray = edgeStrokeDasharray(edgeStyle.lineType, edgeStyle.width);
                    return (
                      <path
                        key={edge.id}
                        data-testid={`edge-path-${edge.id}`}
                        data-edge-id={edge.id}
                        d={edgePath(
                          endpoints.from,
                          endpoints.to,
                          lane,
                          layoutDirection,
                          fromSize,
                          toSize,
                          forceBend,
                          route
                        )}
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
                          const point = getSvgContentPoint(
                            event.currentTarget.ownerSVGElement,
                            event.clientX,
                            event.clientY
                          );
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
                          edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
                        return (
                          <path
                            key={`route-preview-${edge.id}`}
                            data-testid="edge-route-drag-preview"
                            className="edge-route-drag-preview"
                            d={edgePath(
                              endpoints.from,
                              endpoints.to,
                              lane,
                              layoutDirection,
                              fromSize,
                              toSize,
                              forceBend,
                              route
                            )}
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
                        const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || automaticManualRoute;
                        if (!route || route.points.length === 0) return null;
                        return (
                          <path
                            key={`route-guide-${edge.id}`}
                            data-testid="edge-route-guide"
                            className="edge-route-guide"
                            d={edgePath(
                              endpoints.from,
                              endpoints.to,
                              lane,
                              layoutDirection,
                              fromSize,
                              toSize,
                              forceBend,
                              route
                            )}
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
                    const point =
                      route.points.length === 1
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
