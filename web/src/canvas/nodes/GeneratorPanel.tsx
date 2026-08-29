import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { configApi } from '@/api/config';
import { submitImageTask } from '@/api/generate';
import { useIncoming } from '../hooks/useIncoming';
import { useNodeTask } from '../hooks/useNodeTask';
import { useCanvasStore } from '../store/canvasStore';

/**
 * 图片节点生成器（折叠面板）。任务态显示排队（含位次）/生成中/失败。
 * 生成配置存 node.data.generator（持久化 + 可撤销），面板交互态全本地（铁律 #2/#3）。
 * D6：提交带参考图 file_ids；D8：排队位次显示。
 */
export function ImageGeneratorPanel({ nodeId }: { nodeId: string }) {
  const incoming = useIncoming(nodeId);
  const task = useNodeTask(nodeId);
  const qc = useQueryClient();

  const generator = useCanvasStore((s) => {
    const g = s.nodes.find((n) => n.id === nodeId)?.data.generator;
    return (g ?? null) as Record<string, unknown> | null;
  });

  const lastError = useCanvasStore((s) => {
    const v = s.nodes.find((n) => n.id === nodeId)?.data.lastTaskError;
    return typeof v === 'string' ? v : null;
  });

  const modelsQ = useQuery({
    queryKey: ['modelRegistry'],
    queryFn: configApi.models,
    staleTime: Infinity,
  });
  const imageModels = modelsQ.data?.image ?? [];

  const open = useCanvasStore((s) =>
    Boolean(s.nodes.find((n) => n.id === nodeId)?.data.generatorOpen),
  );

  const genPrompt = typeof generator?.prompt === 'string' ? generator.prompt : '';
  const [prompt, setPrompt] = useState(genPrompt);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const onPromptChange = (next: string) => {
    setPrompt(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      useCanvasStore.getState().updateNodeData(nodeId, {
        generator: { ...(generator ?? {}), prompt: next },
      });
    }, 400);
  };

  const modelId = typeof generator?.model === 'string' && generator.model
    ? generator.model
    : imageModels[0]?.id ?? '';
  const size = typeof generator?.size === 'string' && generator.size
    ? generator.size
    : imageModels[0]?.sizes?.['1:1'] ?? '';
  const n = typeof generator?.n === 'number' ? generator.n : 1;

  const setGen = (patch: Record<string, unknown>) => {
    useCanvasStore.getState().updateNodeData(nodeId, {
      generator: { ...(generator ?? { prompt: '' }), model: modelId, size, n, ...patch },
    });
  };

  const model = imageModels.find((m) => m.id === modelId);
  const sizes = model?.sizes ?? {};

  /* 注入信息（useIncoming 变现）：
     文本上游 → 拼进提示词；图片上游（有 currentFileId）→ 参考图 */
  const injectedTexts = incoming
    .filter((i) => i.kind === 'prompt')
    .map((i) =>
      typeof i.node.data.content === 'string' ? i.node.data.content : '',
    )
    .filter((t) => t.trim().length > 0);
  const refImages = incoming.filter(
    (i) =>
      i.kind === 'reference' &&
      i.node.type === 'image' &&
      typeof i.node.data.currentFileId === 'string',
  );

  const busy = task?.status === 'queued' || task?.status === 'running';

  const submit = async () => {
    const finalPrompt = [...injectedTexts, prompt].filter(Boolean).join('\n\n');
    if (!finalPrompt.trim() || !modelId) return;
    await submitImageTask({
      node_id: nodeId,
      model: modelId,
      prompt: finalPrompt,
      ref_file_ids: refImages.map((i) => i.node.data.currentFileId as string),
      params: { size: size || undefined, n },
    });
    qc.invalidateQueries({ queryKey: ['activeTasks'] });   // 唤醒轮询
  };

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() =>
          useCanvasStore.getState().updateNodeData(nodeId, { generatorOpen: !open })
        }
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        生成器
        {busy && <Loader2 className="size-3 animate-spin text-blue-400" />}
        <span className="ml-auto">
          {injectedTexts.length > 0 && `注入 ${injectedTexts.length} 段文本`}
          {injectedTexts.length > 0 && refImages.length > 0 && ' · '}
          {refImages.length > 0 && `${refImages.length} 张参考图`}
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={modelId}
              onChange={(e) => setGen({ model: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              disabled={busy}
            >
              {imageModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={size}
              onChange={(e) => setGen({ size: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              disabled={busy}
            >
              {Object.entries(sizes).map(([ratio, px]) => (
                <option key={ratio} value={px}>
                  {ratio}（{px.replace('*', '×')}）
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">张数</span>
            {[1, 2, 3, 4].map((v) => (
              <button
                key={v}
                disabled={busy}
                onClick={() => setGen({ n: v })}
                className={cn(
                  'size-6 rounded-md border text-xs transition-colors',
                  n === v
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* 参考图缩略预览（D6） */}
          {refImages.length > 0 && (
            <div className="flex items-center gap-1.5">
              {refImages.map(({ node }) => (
                <img
                  key={node.id}
                  src={node.data.currentFileUrl as string}
                  alt="参考图"
                  className="size-10 rounded-md border object-cover"
                  draggable={false}
                />
              ))}
              <span className="text-[10px] text-muted-foreground">
                作为参考图
              </span>
            </div>
          )}

          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={
              refImages.length > 0
                ? '描述如何基于参考图生成/编辑，例如：把这张图改成水彩画风格'
                : '画面描述（上游连线文本会自动拼接在前面）'
            }
            className="min-h-[60px] resize-none text-xs"
            disabled={busy}
          />

          {task && task.status === 'queued' && (
            <p className="flex items-center gap-1.5 text-xs text-amber-500">
              <Loader2 className="size-3 animate-spin" />
              {task.queue_position && task.queue_position > 1
                ? `排队中（第 ${task.queue_position} 位）…`
                : '排队中…'}
            </p>
          )}
          {task && task.status === 'running' && (
            <p className="flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="size-3 animate-spin" />
              生成中…
            </p>
          )}
          {task && task.status === 'failed' && (
            <p className="text-xs text-destructive">
              失败：{task.error ?? lastError ?? '未知错误'}
              <Button
                size="sm"
                variant="outline"
                className="ml-2 h-6"
                onClick={() => void submit()}
                disabled={busy}
              >
                重试
              </Button>
            </p>
          )}

          <Button size="sm" onClick={() => void submit()} disabled={busy || (!prompt.trim() && injectedTexts.length === 0)}>
            <Sparkles className="size-3.5" />
            生成{n > 1 ? ` ${n} 张` : ''}
          </Button>
        </div>
      )}
    </div>
  );
}