import { useEffect } from 'react';
import { tasksApi } from '@/api/tasks';
import { useCanvasStore } from '../store/canvasStore';

/**
 * 离场对账：画布加载后，拉本项目各图片节点的最新任务，
 * 把「用户不在场时完成」的结果补回填（或修正 lastTaskStatus）。
 * 解决场景：切到项目列表/关浏览器期间任务完成，回来状态点卡死、无图。
 */
export function useReconcile() {
  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state, prev) => {
      // 画布刚灌入数据时跑一次（projectId 从空变有值 = 加载完成）
      if (state.projectId && state.projectId !== prev.projectId) {
        void reconcile(state.nodes.map((n) => n.id));
      }
    });
    return unsub;
  }, []);
}

async function reconcile(nodeIds: string[]) {
  const store = useCanvasStore.getState();
  for (const nodeId of nodeIds) {
    const node = store.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'image') continue;   // M2 W2 只对图片节点对账

    try {
      const history = await tasksApi.nodeHistory(nodeId, 1);
      const latest = history[0];
      if (!latest) continue;

      const current = node.data.currentFileId;
      const first = latest.result_files[0];

      if (latest.status === 'succeeded' && first && current !== first.id) {
        // 不在场时完成且未回填 → 补
        store.silentUpdateNodeData(nodeId, {
          currentFileId: first.id,
          currentFileUrl: first.url,
          lastTaskStatus: 'succeeded',
          resultFileIds: latest.result_files.map((f) => f.id),
        });
      } else if (latest.status === 'failed' && !node.data.lastTaskError) {
        // 不在场时失败 → 补状态
        store.silentUpdateNodeData(nodeId, {
          lastTaskStatus: 'failed',
          lastTaskError: latest.error,
        });
      } else if (
        latest.status === 'succeeded' &&
        current === first?.id &&
        node.data.lastTaskStatus !== 'succeeded'
      ) {
        // 图已在（老数据）但状态点没跟上 → 修状态
        store.silentUpdateNodeData(nodeId, { lastTaskStatus: 'succeeded' });
      }
    } catch {
      /* 单节点对账失败不影响其他节点 */
    }
  }
}