import type { Edge, Node, Viewport } from '@xyflow/react';
import { http } from './client';

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

interface BackendCanvas {
  nodes: Array<{
    id: string
    type: string
    x: number
    y: number
    width: number
    data: Record<string, unknown>
  }>
  edges: Array<{ id: string; source: string; target: string }>
  viewport: CanvasViewport | null
}

export interface CanvasData {
  nodes: Node[]
  edges: Edge[]
  viewport: CanvasViewport | null
}

function transform(data: BackendCanvas): CanvasData {
  return {
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.x, y: n.y },
      data: n.data,
      width: n.width,
    })),
    edges: data.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    viewport: data.viewport,
  }
}

/** React Flow 节点 → 后端格式。stripTransient 同款逻辑：selected/measured 不上传 */
function serialize(
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport | null,
) {
  return {
    nodes: nodes.map((n) => {
      const clone: Record<string, unknown> = {
        id: n.id,
        type: n.type ?? 'text',
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? 360,
        data: n.data,
      }
      return clone
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    viewport: viewport ?? null,
  }
}

export const canvasApi = {
  async get(projectId: string): Promise<CanvasData> {
    return transform(await http<BackendCanvas>(`/projects/${projectId}/canvas`))
  },

  /** 整画布保存：后端一个事务里全量替换（FS-03） */
  async put(
    projectId: string,
    nodes: Node[],
    edges: Edge[],
    viewport: Viewport | null,
  ): Promise<void> {
    await http(`/projects/${projectId}/canvas`, {
      method: 'PUT',
      body: JSON.stringify(serialize(nodes, edges, viewport)),
    })
  },
}