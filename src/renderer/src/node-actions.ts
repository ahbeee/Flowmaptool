import { addEdge, addNode, updateNodeLabel, type FlowDoc, type NodeId } from '../../shared/graph';
import { getNodeOffset, type NodeOffset, type NodeOffsetMap } from '../../shared/local-reflow';
import { pasteDetached, type CopiedSelection } from '../../shared/subflow';
import { ensureDocHasNode, NEW_NODE_LABEL } from './document-state';
import { getPrimaryParentId } from './graph-analysis';
import { createChildNodeStyle } from './node-style';
import { clampNodeLabel } from './ui-helpers';

export type NodeEditingDraft = {
  nodeId: NodeId;
  label: string;
};

export type InsertNodeMode = 'child' | 'sibling';

export type InsertNodeFromSelectionResult = {
  doc: FlowDoc;
  newNodeId: NodeId;
  newLabel: string;
  offset: NodeOffset;
};

export type PasteDetachedSelectionResult = {
  doc: FlowDoc;
  newNodeIds: NodeId[];
  offsetUpdates: Record<NodeId, NodeOffset>;
};

export function getNodeEditingDraft(doc: FlowDoc, nodeId: NodeId): NodeEditingDraft | null {
  const node = doc.nodes.find(item => item.id === nodeId);
  return node ? { nodeId, label: clampNodeLabel(node.label) } : null;
}

export function applyCommittedNodeLabel(doc: FlowDoc, nodeId: NodeId, label: string): FlowDoc {
  const nextLabel = clampNodeLabel(label).trim();
  const currentNode = doc.nodes.find(node => node.id === nodeId);
  if (currentNode?.label === nextLabel) return doc;
  return updateNodeLabel(doc, nodeId, nextLabel);
}

export function buildPasteDetachedSelectionResult(
  doc: FlowDoc,
  copiedSelection: CopiedSelection,
  pasteOffset: NodeOffset = { dx: 40, dy: 40 }
): PasteDetachedSelectionResult | null {
  if (copiedSelection.nodes.length === 0) return null;
  const result = pasteDetached(doc, copiedSelection);
  const offsetUpdates: Record<NodeId, NodeOffset> = {};
  for (const id of result.newNodeIds) {
    offsetUpdates[id] = pasteOffset;
  }
  return {
    doc: ensureDocHasNode(result.doc),
    newNodeIds: result.newNodeIds,
    offsetUpdates
  };
}

export function buildInsertNodeFromSelectionResult(
  doc: FlowDoc,
  selectedNodeIds: NodeId[],
  nodeOffsets: NodeOffsetMap,
  mode: InsertNodeMode
): InsertNodeFromSelectionResult | null {
  if (selectedNodeIds.length !== 1) return null;
  const selectedNodeId = selectedNodeIds[0];
  const parentId = mode === 'child' ? selectedNodeId : getPrimaryParentId(doc, selectedNodeId) || selectedNodeId;
  const parentOffset = getNodeOffset(nodeOffsets, parentId);
  const newNodeId = `n${doc.meta.nextNodeSeq}`;
  const newLabel = NEW_NODE_LABEL;
  let nextDoc = addNode(doc, newLabel, createChildNodeStyle(doc.settings.defaultShape));
  nextDoc = addEdge(nextDoc, parentId, newNodeId);

  return {
    doc: nextDoc,
    newNodeId,
    newLabel,
    offset: { dx: parentOffset.dx, dy: parentOffset.dy }
  };
}
