import { useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BaseNode } from './BaseNode';
import { configApi } from '@/api/config';
import { streamGenerateText } from '@/api/generate';
import { useCanvasStore } from '../store/canvasStore';
import { cn } from '@/lib/utils';

/** 自动伸缩 textarea（原生实现——shadcn Textarea 不透传 ref，量不到高度） */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  minRows = 3,
  maxRows = 12,
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
    const lineHeight = 20;                          // text-sm ≈ 20px 行高
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
      className="nodrag nowheel w-full resize-none overflow-y-auto border-none bg-transparent p-0 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** 铁律 #3：输入框本地 state，防抖 400ms 再提交 store（M1 同款） */
function useDebouncedNodeData(id: string, key: string, value: string) {
  const [local, setLocal] = useState<string>(() => value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestLocal = useRef(value);

  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state) => {
      const node = state.nodes.find((n) => n.id === id);
      const next = typeof node?.data[key] === 'string' ? (node.data[key] as string) : '';
      if (next !== latestLocal.current) {
        clearTimeout(timer.current);
        latestLocal.current = next;
        setLocal(next);
      }
    });
    return unsub;
  }, [id, key]);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const onChange = (next: string) => {
    setLocal(next);
    latestLocal.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      useCanvasStore.getState().updateNodeData(id, { [key]: next });
    }, 400);
  };

  return [local, onChange] as const;
}

export function TextNode({ id, data }: NodeProps) {
  const content = typeof data.content === 'string' ? data.content : '';
  const [text, setText] = useDebouncedNodeData(id, 'content', content);

  const modelsQ = useQuery({
    queryKey: ['modelRegistry'],
    queryFn: configApi.models,
    staleTime: Infinity,
  });

  const [tab, setTab] = useState<'manual' | 'ai'>('manual');
  const [instruction, setInstruction] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [modelId, setModelId] = useState('');
  const abortRef = useRef<AbortController | undefined>(undefined);
  const streamTextRef = useRef('');

  useEffect(() => {
    streamTextRef.current = streamText;
  }, [streamText]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const models = modelsQ.data?.text ?? [];
  const currentModel = modelId || models[0]?.id || '';

  const startGenerate = () => {
    if (!currentModel || streaming) return;
    const prompt = instruction.trim();
    if (!prompt) return;

    setStreaming(true);
    setStreamText('');
    setGenError(null);
    const abort = new AbortController();
    abortRef.current = abort;

    streamGenerateText(
      currentModel,
      prompt,
      {
        onDelta: (d) => setStreamText((prev) => prev + d),
        onDone: () => {
          setStreaming(false);
          useCanvasStore.getState().updateNodeData(id, { content: streamTextRef.current });
        },
        onError: (msg) => {
          setStreaming(false);
          setGenError(msg);
        },
      },
      abort.signal,
    ).catch(() => {
      setStreaming(false);
    });
  };

  const stopGenerate = () => abortRef.current?.abort();

  return (
    <BaseNode id={id} type="text">
      <div className="nowheel">
        <div className="mb-2 flex gap-1 rounded-lg bg-muted p-0.5">
          <button
            className={cn(
              'nodrag flex-1 rounded-md px-2 py-1 text-xs transition-colors',
              tab === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
            onClick={() => setTab('manual')}
          >
            手动
          </button>
          <button
            className={cn(
              'nodrag flex-1 rounded-md px-2 py-1 text-xs transition-colors',
              tab === 'ai' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
            onClick={() => setTab('ai')}
          >
            AI 生成
          </button>
        </div>

        {tab === 'manual' ? (
          <AutoTextarea
            value={text}
            onChange={setText}
            placeholder="输入文本，或从左侧连线注入上游文本…"
            minRows={3}
            maxRows={12}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                value={currentModel}
                onChange={(e) => setModelId(e.target.value)}
                className="nodrag h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                disabled={streaming}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {streaming ? (
                <Button size="sm" variant="outline" className="nodrag" onClick={stopGenerate}>
                  停止
                </Button>
              ) : (
                <Button size="sm" className="nodrag" onClick={startGenerate} disabled={!currentModel || !instruction.trim()}>
                  <Sparkles className="size-3.5" />
                  生成
                </Button>
              )}
            </div>

            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="告诉 AI 要写什么，例如：写一段赛博朋克城市夜景的文生图提示词"
              disabled={streaming}
              rows={3}
              className="nodrag nowheel w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />

            {(streaming || streamText) && (
              <div className="nowheel max-h-[160px] overflow-y-auto rounded-md bg-muted/50 p-2 text-sm whitespace-pre-wrap">
                {streamText}
                {streaming && <Loader2 className="ml-1 inline size-3 animate-spin" />}
              </div>
            )}

            {genError && <p className="text-xs text-destructive">{genError}</p>}
          </div>
        )}
      </div>
    </BaseNode>
  );
}