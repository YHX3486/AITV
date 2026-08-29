import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveTasks } from './useNodeTask';
import { useCanvasStore } from '../store/canvasStore';
import type { TaskRecord } from '@/api/tasks';

/**
 * 任务完成 → 回填节点（唯一的 canvasStore 写入点，全部静默）。
 * 机制：对比前后两次 activeTasks，发现终态转变瞬间 → silent 写入。
 * prev 用 useRef（React 19 ESLint 禁止 effect 内 setState）。
 */
export function useTaskBackfill() {
  const { data: active } = useActiveTasks();
  const prevRef = useRef<TaskRecord[]>([]);
  const qc = useQueryClient();

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = active ?? [];

    if (!active) return;

    const store = useCanvasStore.getState();

    for (const t of active) {
      const before = prev.find((p) => p.id === t.id);

      if (t.status === 'succeeded' && before?.status !== 'succeeded') {
        const f = t.result_files[0];
        if (f) {
          store.silentUpdateNodeData(t.node_id, {
            currentFileId: f.id,
            currentFileUrl: f.url,
            lastTaskStatus: 'succeeded',
            resultFileIds: t.result_files.map((x) => x.id),
          });
        } else {
          store.silentUpdateNodeData(t.node_id, { lastTaskStatus: 'succeeded' });
        }
      }

      if (t.status === 'failed' && before?.status !== 'failed') {
        store.silentUpdateNodeData(t.node_id, {
          lastTaskStatus: 'failed',
          lastTaskError: t.error,
        });
      }
    }
  }, [active, qc]);
}