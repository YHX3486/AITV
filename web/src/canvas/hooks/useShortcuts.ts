import { useEffect } from 'react';
import { useCanvasStore } from '../store/canvasStore';

/**
 * 画布级快捷键。挂在 window 上，全局生效。
 * 注意 Delete 优先交给 React Flow（选中态存在时它自己处理删除），
 * 这里只负责撤销/重做，避免和 React Flow 的内置行为打架。
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;   // Windows: Ctrl，Mac: Cmd
      const z = e.key.toLowerCase() === 'z';

      if (mod && z && !e.shiftKey) {
        e.preventDefault();   // 阻止浏览器默认行为（有些浏览器 Ctrl+Z 会尝试撤销输入框内容）
        useCanvasStore.temporal.getState().undo();
      } else if (mod && z && e.shiftKey) {
        e.preventDefault();
        useCanvasStore.temporal.getState().redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}