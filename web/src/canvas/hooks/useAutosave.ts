import { useEffect, useRef, useState } from 'react';
import { canvasApi } from '@/api/canvas';
import { useCanvasStore } from '../store/canvasStore';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DEBOUNCE_MS = 1000;   // FS-03：防抖 ~1s

/**
 * 订阅 canvasStore，变化 → 防抖 1s → PUT /canvas。
 * 保存状态以 React state 暴露（不进 store——它不是画布数据，铁律 #2）。
 *
 * 注意 subscribe 拿到的 state 会被 zundo 的 partialize 处理，
 * 但 nodes/edges 是引用最新状态的，直接用即可。
 */
export function useAutosave(): SaveState {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef(false);

  useEffect(() => {
    const save = async () => {
      const { projectId, nodes, edges, viewport } = useCanvasStore.getState();
      if (!projectId) return;   // 画布还没加载完
      inflight.current = true;
      setSaveState('saving');
      try {
        await canvasApi.put(projectId, nodes, edges, viewport);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      } finally {
        inflight.current = false;
      }
    };

    const unsub = useCanvasStore.subscribe((state, prev) => {
      // 只在「画布内容」变化时触发，projectId 变化是加载，不是编辑
      if (state.projectId !== prev.projectId) return;
      if (
        state.nodes === prev.nodes &&
        state.edges === prev.edges
      ) {
        return;   // 只有 viewport 变了也先存（轻量），但 nodes/edges 没变时跳过防抖重置
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      clearTimeout(timer.current);
    };
  }, []);

  return saveState;
}