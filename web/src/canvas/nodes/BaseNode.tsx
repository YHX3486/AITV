import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronRight, Paperclip, TextCursorInput } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_META } from './nodeMeta';
import { useIncoming } from '../hooks/useIncoming';
import { useNodeTask } from '../hooks/useNodeTask';
import { useCanvasStore } from '../store/canvasStore';
import type { CanvasNodeType } from '../store/canvasStore';

export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';

const STATUS_DOT: Record<NodeStatus, string> = {
  idle: 'bg-muted-foreground/40',
  queued: 'bg-amber-400',
  running: 'bg-blue-400 animate-pulse',
  succeeded: 'bg-emerald-400',
  failed: 'bg-destructive',
};

export function BaseNode({
  id,
  type,
  children,
  footer,
}: {
  id: string;
  type: CanvasNodeType;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const meta = NODE_META[type];
  const Icon = meta.icon;
  const incoming = useIncoming(id);
  const task = useNodeTask(id);   // D4：状态点接真数据
  const collapsed = useCanvasStore((s) =>
    Boolean(s.nodes.find((n) => n.id === id)?.data.collapsed),
  );

  /* 状态优先级：活动任务 > node.data 里上次静默写入的 lastTaskStatus */
  const lastStatus = useCanvasStore((s) => {
    const v = s.nodes.find((n) => n.id === id)?.data.lastTaskStatus;
    return typeof v === 'string' ? (v as NodeStatus) : 'idle';
  });
  const status: NodeStatus = task
    ? (task.status as NodeStatus)
    : lastStatus;

  const toggleCollapsed = () => {
    useCanvasStore.getState().updateNodeData(id, {
      collapsed: !collapsed,
    });
  };

  const prompts = incoming.filter((i) => i.kind === 'prompt');
  const references = incoming.filter((i) => i.kind === 'reference');

  return (
    <div className="w-[360px] rounded-xl border bg-card text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className={cn('size-4 shrink-0', meta.iconClass)} />
        <span className="text-sm font-medium">{meta.label}</span>
        <span
          className={cn('ml-auto size-2 rounded-full', STATUS_DOT[status])}
          title={status}
        />
        <button
          onClick={toggleCollapsed}
          className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </header>

      {!collapsed && (
        <>
          {prompts.length > 0 && (
            <section className="border-b bg-muted/40 px-3 py-2">
              {prompts.map(({ node }) => {
                const text =
                  typeof node.data.content === 'string' ? node.data.content : '';
                return (
                  <div key={node.id} className="flex items-start gap-1.5">
                    <TextCursorInput className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {text.trim() ? text : '（上游文本为空）'}
                    </p>
                  </div>
                );
              })}
            </section>
          )}

          {references.length > 0 && (
            <section className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              {references.map(({ node }) => {
                const refMeta = NODE_META[node.type as CanvasNodeType];
                const RefIcon = refMeta?.icon;
                return (
                  <span
                    key={node.id}
                    className="flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    title={`参考：${refMeta?.label ?? node.type} 节点`}
                  >
                    {RefIcon && <RefIcon className="size-3" />}
                    {refMeta?.label ?? node.type}
                  </span>
                );
              })}
            </section>
          )}

          <main className="px-3 py-2">{children}</main>

          {footer && <footer className="border-t px-3 py-2">{footer}</footer>}
        </>
      )}
    </div>
  );
}