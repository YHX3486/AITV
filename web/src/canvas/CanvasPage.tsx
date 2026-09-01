import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canvasApi } from '@/api/canvas';
import { filesApi } from '@/api/files';
import { statsApi } from '@/api/stats';
import { nodeTypes } from './nodes';
import { EmptyHint } from './EmptyHint';
import { useActiveTasks } from './hooks/useNodeTask';
import { useReconcile } from './hooks/useReconcile';
import { useTaskBackfill } from './hooks/useTaskBackfill';
import { useAutosave } from './hooks/useAutosave';
import { useShortcuts } from './hooks/useShortcuts';
import { useCanvasStore } from './store/canvasStore';
import { AddPanel } from './AddPanel';
import { CanvasContextMenu, type MenuState } from './ContextMenu';
import type { Project } from '@/api/projects';

export default function CanvasPage(props: {
  project: Project;
  onBack: () => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasPageInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasPageInner({ project, onBack }: { project: Project; onBack: () => void }) {
  useShortcuts();
  const saveState = useAutosave();
  useActiveTasks();
  useTaskBackfill();
  useReconcile();
  const rf = useReactFlow();

  const usageQ = useQuery({
    queryKey: ['usage'],
    queryFn: statsApi.usage,
    refetchInterval: 30000,
  });

  const canvasQ = useQuery({
    queryKey: ['canvas', project.id],
    queryFn: () => canvasApi.get(project.id),
  });

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);

  useEffect(() => {
    if (canvasQ.isSuccess && canvasQ.data) {
      useCanvasStore.getState().setCanvas({
        projectId: project.id,
        nodes: canvasQ.data.nodes,
        edges: canvasQ.data.edges,
        viewport: canvasQ.data.viewport,
      });
    }
  }, [canvasQ.isSuccess, canvasQ.data, project.id]);

  const [menu, setMenu] = useState<MenuState | null>(null);

  const openMenuAt = (clientX: number, clientY: number, connectFrom?: string) => {
    setMenu({
      x: clientX,
      y: clientY,
      flowPosition: rf.screenToFlowPosition({ x: clientX, y: clientY }),
      connectFrom,
    });
  };

  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (state.isValid || !state.fromNode) return;
    const point =
      'clientX' in event
        ? { x: event.clientX, y: event.clientY }
        : {
            x: event.changedTouches[0].clientX,
            y: event.changedTouches[0].clientY,
          };
    openMenuAt(point.x, point.y, state.fromNode.id);
  };

  const handleDropFile = async (file: globalThis.File, position: { x: number; y: number }) => {
    const kind = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : null;
    if (!kind) return;

    const { createNode, updateNodeData } = useCanvasStore.getState();
    const node = createNode(kind as 'image' | 'video' | 'audio', {
      x: position.x + Math.random() * 20,
      y: position.y + Math.random() * 20,
    });
    try {
      const rec = await filesApi.upload(file);
      updateNodeData(node.id, { currentFileId: rec.id, currentFileUrl: rec.url });
    } catch {
      /* 上传失败节点保持空态，用户可重试 */
    }
  };

  if (canvasQ.isLoading) {
    return <FullPageMessage text="加载画布中…" />;
  }
  if (canvasQ.isError || !canvasQ.data) {
    return (
      <FullPageMessage
        text={`画布加载失败：${(canvasQ.error as Error)?.message ?? '未知错误'}`}
        error
      />
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        deleteKeyCode={['Backspace', 'Delete']}
        zoomOnScroll
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length === 0) return;
          for (const file of files) {
            void handleDropFile(
              file,
              rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
            );
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        zoomOnDoubleClick={false}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          const ev = e as MouseEvent;
          openMenuAt(ev.clientX, ev.clientY);
        }}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.classList.contains('react-flow__pane')) {
            openMenuAt(e.clientX, e.clientY);
          }
        }}
        defaultViewport={canvasQ.data.viewport ?? undefined}
        fitView={!canvasQ.data.viewport}
        colorMode="system"
      >
        <Background />
        <Controls />
        <MiniMap pannable />
        <AddPanel />
      </ReactFlow>

      <EmptyHint visible={nodes.length === 0} />

      <Button
        variant="outline"
        size="icon"
        className="absolute left-3 top-4 z-10"
        onClick={onBack}
        title="返回项目列表"
      >
        <ArrowLeft className="size-4" />
      </Button>

      <div className="absolute left-16 top-4 z-10 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-card-foreground shadow-sm">
        <span>{project.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {saveState === 'saving' && (
            <>
              <Loader2 className="size-3 animate-spin" />
              保存中…
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Cloud className="size-3" />
              已保存
            </>
          )}
          {saveState === 'error' && (
            <>
              <CloudOff className="size-3 text-destructive" />
              保存失败
            </>
          )}
          {saveState === 'idle' && (
            <>
              <Cloud className="size-3" />
              已保存
            </>
          )}
        </span>
        {usageQ.data && (
          <span
            className={`ml-2 flex items-center gap-1 border-l pl-2 text-xs ${
              usageQ.data.remaining_budget < 10
                ? 'text-destructive'
                : 'text-muted-foreground'
            }`}
            title={`累计 ${usageQ.data.total_count} 次 · ¥${usageQ.data.total_cost}`}
          >
            ¥{usageQ.data.today_cost} / {usageQ.data.daily_budget}
          </span>
        )}
      </div>

      {menu && <CanvasContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function FullPageMessage({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      className={`flex h-screen w-screen items-center justify-center ${
        error ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {text}
    </div>
  );
}