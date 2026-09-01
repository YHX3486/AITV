import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { configApi } from '@/api/config';
import { submitAudioTask, submitImageTask, submitVideoTask } from '@/api/generate';
import { useElapsed } from '../hooks/useElapsed';
import { useIncoming } from '../hooks/useIncoming';
import { useNodeTask } from '../hooks/useNodeTask';
import { useCanvasStore } from '../store/canvasStore';

/** 秒数格式化：<60 显示 "47"，>=60 显示 "1分23" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}`;
  return `${Math.floor(seconds / 60)}分${seconds % 60}`;
}

/** 自动伸缩 textarea（原生实现——shadcn Textarea 不透传 ref，量不到高度） */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  minRows = 2,
  maxRows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';                       // 先重置再量，否则只增不减
    const lineHeight = 16;                          // text-xs ≈ 16px 行高
    el.style.height = `${Math.min(
      Math.max(el.scrollHeight, minRows * lineHeight),
      maxRows * lineHeight,
    )}px`;
  }, [value, minRows, maxRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={minRows}
      className="nodrag nowheel w-full resize-none overflow-y-auto rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** 图片节点生成器 */
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

  const modelSizes = Object.values(imageModels.find((m) => m.id === modelId)?.sizes ?? {});
  const storedSize = typeof generator?.size === 'string' ? generator.size : '';
  const size = modelSizes.length > 0 && !modelSizes.includes(storedSize)
    ? modelSizes[0]
    : storedSize || modelSizes[0];

  const n = typeof generator?.n === 'number' ? generator.n : 1;

  const setGen = (patch: Record<string, unknown>) => {
    useCanvasStore.getState().updateNodeData(nodeId, {
      generator: { ...(generator ?? { prompt: '' }), model: modelId, size, n, ...patch },
    });
  };

  const model = imageModels.find((m) => m.id === modelId);
  const sizes = model?.sizes ?? {};

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
  const imageElapsed = useElapsed(task?.created_at, task?.status === 'running');

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
    qc.invalidateQueries({ queryKey: ['activeTasks'] });
  };

  return (
    <div className="nowheel">
      <button
        className="nodrag flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
              className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
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
              className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
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
                  'nodrag size-6 rounded-md border text-xs transition-colors',
                  n === v
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {v}
              </button>
            ))}
          </div>

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
              <span className="text-[10px] text-muted-foreground">作为参考图</span>
            </div>
          )}

          <AutoTextarea
            value={prompt}
            onChange={onPromptChange}
            placeholder={
              refImages.length > 0
                ? '描述如何基于参考图生成/编辑，例如：把这张图改成水彩画风格'
                : '画面描述（上游连线文本会自动拼接在前面）'
            }
            disabled={busy}
            minRows={2}
            maxRows={8}
          />

          {task && task.status === 'queued' && (
            <p className="flex items-center gap-1.5 text-xs text-amber-500">
              <Loader2 className="size-3 animate-spin" />
              排队中…
            </p>
          )}
          {task && task.status === 'running' && (
            <p className="flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="size-3 animate-spin" />
              生成中… {formatElapsed(imageElapsed)}s
            </p>
          )}
          {task && task.status === 'failed' && (
            <p className="text-xs text-destructive">
              失败：{task.error ?? lastError ?? '未知错误'}
              <Button
                size="sm"
                variant="outline"
                className="nodrag ml-2 h-6"
                onClick={() => void submit()}
                disabled={busy}
              >
                重试
              </Button>
            </p>
          )}

          <Button size="sm" className="nodrag" onClick={() => void submit()} disabled={busy || (!prompt.trim() && injectedTexts.length === 0)}>
            <Sparkles className="size-3.5" />
            生成{n > 1 ? ` ${n} 张` : ''}
          </Button>
        </div>
      )}
    </div>
  );
}

/** 视频节点生成器：模型/分辨率/时长/比例 + 首帧注入。时长选项跟注册表。 */
export function VideoGeneratorPanel({ nodeId }: { nodeId: string }) {
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
  const videoModels = modelsQ.data?.video ?? [];

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
    : videoModels[0]?.id ?? '';

  const modelResolutions = videoModels.find((m) => m.id === modelId)?.resolutions ?? ['720P', '1080P'];
  const storedResolution = typeof generator?.resolution === 'string' ? generator.resolution : '';
  const resolution = modelResolutions.includes(storedResolution)
    ? storedResolution
    : modelResolutions[0];

  const modelDurations = videoModels.find((m) => m.id === modelId)?.durations ?? [5];
  const currentDuration = typeof generator?.duration === 'number'
    ? generator.duration
    : modelDurations[0];
  const duration = modelDurations.includes(currentDuration)
    ? currentDuration
    : modelDurations[0];

  const ratio = typeof generator?.ratio === 'string' && generator.ratio
    ? generator.ratio
    : videoModels[0]?.ratios?.[0] ?? '';

  const setGen = (patch: Record<string, unknown>) => {
    useCanvasStore.getState().updateNodeData(nodeId, {
      generator: {
        ...(generator ?? { prompt: '' }),
        model: modelId, resolution, duration, ratio,
        ...patch,
      },
    });
  };

  const model = videoModels.find((m) => m.id === modelId);

  const injectedTexts = incoming
    .filter((i) => i.kind === 'prompt')
    .map((i) =>
      typeof i.node.data.content === 'string' ? i.node.data.content : '',
    )
    .filter((t) => t.trim().length > 0);
  const firstFrames = incoming.filter(
    (i) =>
      i.kind === 'reference' &&
      i.node.type === 'image' &&
      typeof i.node.data.currentFileId === 'string',
  );

  const busy = task?.status === 'queued' || task?.status === 'running';
  const videoElapsed = useElapsed(task?.created_at, task?.status === 'running');

  const submit = async () => {
    const finalPrompt = [...injectedTexts, prompt].filter(Boolean).join('\n\n');
    if (!modelId) return;
    if (!finalPrompt.trim() && firstFrames.length === 0) return;
    await submitVideoTask({
      node_id: nodeId,
      model: modelId,
      prompt: finalPrompt || '让画面自然地动起来',
      ref_file_ids: firstFrames.map((i) => i.node.data.currentFileId as string),
      params: {
        resolution,
        duration,
        ratio: model?.ratios && model.ratios.length > 0 ? ratio : undefined,
      },
    });
    qc.invalidateQueries({ queryKey: ['activeTasks'] });
  };

  return (
    <div className="nowheel">
      <button
        className="nodrag flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() =>
          useCanvasStore.getState().updateNodeData(nodeId, { generatorOpen: !open })
        }
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        生成器
        {busy && <Loader2 className="size-3 animate-spin text-blue-400" />}
        <span className="ml-auto">
          {firstFrames.length > 0 && `首帧 × ${firstFrames.length}`}
          {firstFrames.length > 0 && injectedTexts.length > 0 && ' · '}
          {injectedTexts.length > 0 && `${injectedTexts.length} 段文本`}
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={modelId}
              onChange={(e) => setGen({ model: e.target.value })}
              className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
              disabled={busy}
            >
              {videoModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={resolution}
              onChange={(e) => setGen({ resolution: e.target.value })}
              className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
              disabled={busy}
            >
              {modelResolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">时长</span>
            {modelDurations.map((v) => (
              <button
                key={v}
                disabled={busy}
                onClick={() => setGen({ duration: v })}
                className={cn(
                  'nodrag rounded-md border px-2 py-0.5 text-xs transition-colors',
                  duration === v
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {v}s
              </button>
            ))}
            {model?.ratios && model.ratios.length > 0 && (
              <>
                <span className="ml-2 text-muted-foreground">比例</span>
                <select
                  value={ratio}
                  onChange={(e) => setGen({ ratio: e.target.value })}
                  className="nodrag h-6 rounded-md border bg-background px-1 text-xs"
                  disabled={busy}
                >
                  {model.ratios.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {firstFrames.length > 0 && (
            <div className="flex items-center gap-1.5">
              <img
                src={firstFrames[0].node.data.currentFileUrl as string}
                alt="首帧"
                className="size-10 rounded-md border object-cover"
                draggable={false}
              />
              <span className="text-[10px] text-muted-foreground">作为视频首帧</span>
            </div>
          )}

          <AutoTextarea
            value={prompt}
            onChange={onPromptChange}
            placeholder={
              firstFrames.length > 0
                ? '描述画面如何运动，例如：镜头缓缓推近，人物微笑'
                : '描述视频内容（上游连线文本会自动拼接在前面）'
            }
            disabled={busy}
            minRows={2}
            maxRows={8}
          />

          {task && task.status === 'queued' && (
            <p className="flex items-center gap-1.5 text-xs text-amber-500">
              <Loader2 className="size-3 animate-spin" />
              排队中…
            </p>
          )}
          {task && task.status === 'running' && (
            <p className="flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="size-3 animate-spin" />
              生成中… {formatElapsed(videoElapsed)}s（视频通常需要 1-5 分钟）
            </p>
          )}
          {task && task.status === 'failed' && (
            <p className="text-xs text-destructive">
              失败：{task.error ?? lastError ?? '未知错误'}
              <Button
                size="sm"
                variant="outline"
                className="nodrag ml-2 h-6"
                onClick={() => void submit()}
                disabled={busy}
              >
                重试
              </Button>
            </p>
          )}

          <Button size="sm" className="nodrag" onClick={() => void submit()} disabled={busy || (!prompt.trim() && injectedTexts.length === 0 && firstFrames.length === 0)}>
            <Sparkles className="size-3.5" />
            生成视频
          </Button>
        </div>
      )}
    </div>
  );
}

/** 音频节点生成器（TTS）：模型/音色 + 文本注入。秒级任务。 */
export function AudioGeneratorPanel({ nodeId }: { nodeId: string }) {
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
  const audioModels = modelsQ.data?.audio ?? [];

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
    : audioModels[0]?.id ?? '';

  const modelVoices = audioModels.find((m) => m.id === modelId)?.voices ?? [];
  const storedVoice = typeof generator?.voice === 'string' ? generator.voice : '';
  const voice = modelVoices.some((v) => v.id === storedVoice)
    ? storedVoice
    : modelVoices[0]?.id ?? '';   // 音色回落（换模型时防御）

  const setGen = (patch: Record<string, unknown>) => {
    useCanvasStore.getState().updateNodeData(nodeId, {
      generator: { ...(generator ?? { prompt: '' }), model: modelId, voice, ...patch },
    });
  };

  const injectedTexts = incoming
    .filter((i) => i.kind === 'prompt')
    .map((i) =>
      typeof i.node.data.content === 'string' ? i.node.data.content : '',
    )
    .filter((t) => t.trim().length > 0);

  const busy = task?.status === 'queued' || task?.status === 'running';

  const submit = async () => {
    const finalText = [...injectedTexts, prompt].filter(Boolean).join('\n\n');
    if (!finalText.trim() || !modelId) return;
    await submitAudioTask({
      node_id: nodeId,
      model: modelId,
      prompt: finalText,
      params: { voice: voice || undefined },
    });
    qc.invalidateQueries({ queryKey: ['activeTasks'] });
  };

  return (
    <div className="nowheel">
      <button
        className="nodrag flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() =>
          useCanvasStore.getState().updateNodeData(nodeId, { generatorOpen: !open })
        }
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        生成器
        {busy && <Loader2 className="size-3 animate-spin text-blue-400" />}
        <span className="ml-auto">
          {injectedTexts.length > 0 && `注入 ${injectedTexts.length} 段文本`}
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={modelId}
              onChange={(e) => setGen({ model: e.target.value })}
              className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
              disabled={busy}
            >
              {audioModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={voice}
              onChange={(e) => setGen({ voice: e.target.value })}
              className="nodrag h-8 rounded-md border bg-background px-2 text-xs"
              disabled={busy}
            >
              {modelVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <AutoTextarea
            value={prompt}
            onChange={onPromptChange}
            placeholder="输入要朗读的文本（上游连线文本会自动拼接在前面）"
            disabled={busy}
            minRows={2}
            maxRows={8}
          />

          {task && task.status === 'queued' && (
            <p className="flex items-center gap-1.5 text-xs text-amber-500">
              <Loader2 className="size-3 animate-spin" />
              排队中…
            </p>
          )}
          {task && task.status === 'running' && (
            <p className="flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="size-3 animate-spin" />
              合成中…
            </p>
          )}
          {task && task.status === 'failed' && (
            <p className="text-xs text-destructive">
              失败：{task.error ?? lastError ?? '未知错误'}
              <Button
                size="sm"
                variant="outline"
                className="nodrag ml-2 h-6"
                onClick={() => void submit()}
                disabled={busy}
              >
                重试
              </Button>
            </p>
          )}

          <Button size="sm" className="nodrag" onClick={() => void submit()} disabled={busy || (!prompt.trim() && injectedTexts.length === 0)}>
            <Sparkles className="size-3.5" />
            合成语音
          </Button>
        </div>
      )}
    </div>
  );
}