import { useCanvasStore } from '../store/canvasStore';
import type { Node } from '@xyflow/react';

export interface IncomingNode {
  node: Node;
  /** 上游类型：文本 → 提示词注入；媒体 → 参考素材注入 */
  kind: 'prompt' | 'reference';
}

/**
 * 派生计算：当前节点接收的所有上游注入（连线语义 ED-03）。
 * 不存 store，每次画布变化实时重算——断线/删上游自动同步，零状态同步问题。
 */
export function useIncoming(nodeId: string): IncomingNode[] {
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);

  const result: IncomingNode[] = [];
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = nodes.find((n) => n.id === edge.source);
    if (!source) continue;
    result.push({
      node: source,
      kind: source.type === 'text' ? 'prompt' : 'reference',
    });
  }
  return result;
}