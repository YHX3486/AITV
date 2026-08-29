import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import { temporal } from 'zundo';
import equal from 'fast-deep-equal';

export type CanvasNodeType = 'text' | 'image' | 'video' | 'audio' | 'script';

function defaultData(type: CanvasNodeType): Record<string, unknown> {
  switch (type) {
    case 'text':
      return { content: '' };
    case 'image':
    case 'video':
    case 'audio':
      return { currentFileId: null };
    default:
      return {};
  }
}

/* ---------- 历史净化 ---------- */

function stripNode(node: Node): Node {
  if (node.selected === undefined && node.measured === undefined) return node;
  const clone = { ...node };
  delete clone.selected;
  delete clone.measured;
  return clone;
}

function stripEdge(edge: Edge): Edge {
  if (edge.selected === undefined) return edge;
  const clone = { ...edge };
  delete clone.selected;
  return clone;
}

/* ---------- 批处理 + 拖动合并 ---------- */

let pendingNodeChanges: NodeChange[] = [];
let pendingEdgeChanges: EdgeChange[] = [];
let flushScheduled = false;

let dragging = false;
let silentUpdate = false;

interface CanvasState {
  projectId: string;
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport | null;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  setCanvas: (payload: {
    projectId: string;
    nodes: Node[];
    edges: Edge[];
    viewport: Viewport | null;
  }) => void;
  createNode: (type: CanvasNodeType, position: XYPosition) => Node;
  connectNodes: (source: string, target: string) => Edge | null;
  createNodeWithEdge: (
    type: CanvasNodeType,
    position: XYPosition,
    sourceId: string,
  ) => Node;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 任务结果回填专用：写数据但不产生撤销历史 */
  silentUpdateNodeData: (id: string, patch: Record<string, unknown>) => void;
  setViewport: (viewport: Viewport) => void;
}

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => {
      const flush = () => {
        const nodeChanges = pendingNodeChanges;
        const edgeChanges = pendingEdgeChanges;
        pendingNodeChanges = [];
        pendingEdgeChanges = [];
        flushScheduled = false;

        const { nodes, edges } = get();
        const nextNodes = nodeChanges.length
          ? applyNodeChanges(nodeChanges, nodes)
          : nodes;
        const nextEdges = edgeChanges.length
          ? applyEdgeChanges(edgeChanges, edges)
          : edges;

        const isDragFrame = nodeChanges.some((c) => c.type === 'position');
        if (!isDragFrame) {
          set({ nodes: nextNodes, edges: nextEdges });
          return;
        }

        const draggingNow = nodeChanges.some(
          (c) => c.type === 'position' && c.dragging === true,
        );

        if (!dragging && draggingNow) {
          dragging = true;
          set({ nodes: nextNodes, edges: nextEdges });
        } else {
          silentUpdate = true;
          set({ nodes: nextNodes, edges: nextEdges });
          silentUpdate = false;
          if (!draggingNow) dragging = false;
        }
      };

      const schedule = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        queueMicrotask(flush);
      };

      return {
        projectId: '',
        nodes: [],
        edges: [],
        viewport: null,

        onNodesChange: (changes) => {
          pendingNodeChanges.push(...changes);
          schedule();
        },

        onEdgesChange: (changes) => {
          pendingEdgeChanges.push(...changes);
          schedule();
        },

        onConnect: (connection) =>
          set({ edges: addEdge(connection, get().edges) }),

        setCanvas: ({ projectId, nodes, edges, viewport }) => {
          pendingNodeChanges = [];
          pendingEdgeChanges = [];
          dragging = false;
          set({ projectId, nodes, edges, viewport });
          useCanvasStore.temporal.getState().clear();
        },

        createNode: (type, position) => {
          const node: Node = {
            id: crypto.randomUUID(),
            type,
            position,
            data: defaultData(type),
          };
          set({ nodes: [...get().nodes, node] });
          return node;
        },

        connectNodes: (source, target) => {
          const { edges } = get();
          if (edges.some((e) => e.source === source && e.target === target)) {
            return null;
          }
          const edge: Edge = { id: crypto.randomUUID(), source, target };
          set({ edges: [...edges, edge] });
          return edge;
        },

        createNodeWithEdge: (type, position, sourceId) => {
          const node: Node = {
            id: crypto.randomUUID(),
            type,
            position,
            data: defaultData(type),
          };
          const edge: Edge = {
            id: crypto.randomUUID(),
            source: sourceId,
            target: node.id,
          };
          const { nodes, edges } = get();
          set({
            nodes: [...nodes, node],
            edges: [...edges, edge],
          });
          return node;
        },

        updateNodeData: (id, patch) =>
          set({
            nodes: get().nodes.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
            ),
          }),

        silentUpdateNodeData: (id, patch) => {
          // 旗标让 zundo 的 equality 判定「无变化」→ 跳过历史记录，且不清空重做栈
          silentUpdate = true;
          get().updateNodeData(id, patch);
          silentUpdate = false;
        },

        setViewport: (viewport) => set({ viewport }),
      };
    },
    {
      limit: 50,
      partialize: (state) => ({
        nodes: state.nodes.map(stripNode),
        edges: state.edges.map(stripEdge),
      }),
      equality: (past, current) =>
        silentUpdate ? true : equal(past, current),
    },
  ),
);