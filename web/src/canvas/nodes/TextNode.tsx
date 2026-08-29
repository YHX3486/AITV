import { useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BaseNode } from './BaseNode'
import { configApi } from '@/api/config'
import { streamGenerateText } from '@/api/generate'
import { useCanvasStore } from '../store/canvasStore'
import { cn } from '@/lib/utils'

/** 铁律 #3：输入框本地 state，防抖 400ms 再提交 store（M1 同款） */
function useDebouncedNodeData(id: string, key: string, value: string) {
  const [local, setLocal] = useState<string>(() => value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestLocal = useRef(value)

  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state) => {
      const node = state.nodes.find((n) => n.id === id)
      const next = typeof node?.data[key] === 'string' ? (node.data[key] as string) : ''
      if (next !== latestLocal.current) {
        clearTimeout(timer.current)
        latestLocal.current = next
        setLocal(next)
      }
    })
    return unsub
  }, [id, key])

  useEffect(() => {
    return () => clearTimeout(timer.current)
  }, [])

  const onChange = (next: string) => {
    setLocal(next)
    latestLocal.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      useCanvasStore.getState().updateNodeData(id, { [key]: next })
    }, 400)
  }

  return [local, onChange] as const
}

export function TextNode({ id, data }: NodeProps) {
  const content = typeof data.content === 'string' ? data.content : ''
  const [text, setText] = useDebouncedNodeData(id, 'content', content)

  const modelsQ = useQuery({
    queryKey: ['modelRegistry'],
    queryFn: configApi.models,
    staleTime: Infinity,
  })

  const [tab, setTab] = useState<'manual' | 'ai'>('manual')
  const [instruction, setInstruction] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [genError, setGenError] = useState<string | null>(null)
  const [modelId, setModelId] = useState('')
  const abortRef = useRef<AbortController | undefined>(undefined)
  const streamTextRef = useRef('')

  useEffect(() => {
    streamTextRef.current = streamText
  }, [streamText])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const models = modelsQ.data?.text ?? []
  const currentModel = modelId || models[0]?.id || ''

  const startGenerate = () => {
    if (!currentModel || streaming) return
    const prompt = instruction.trim()
    if (!prompt) return

    setStreaming(true)
    setStreamText('')
    setGenError(null)
    const abort = new AbortController()
    abortRef.current = abort

    streamGenerateText(
      currentModel,
      prompt,
      {
        onDelta: (d) => setStreamText((prev) => prev + d),
        onDone: () => {
          setStreaming(false)
          useCanvasStore.getState().updateNodeData(id, { content: streamTextRef.current })
        },
        onError: (msg) => {
          setStreaming(false)
          setGenError(msg)
        },
      },
      abort.signal,
    ).catch(() => {
      setStreaming(false)
    })
  }

  const stopGenerate = () => abortRef.current?.abort()

  return (
    <BaseNode id={id} type="text">
      {/* 自绘小切换条：不依赖 shadcn Tabs，节点内环境零水土不服 */}
      <div className="mb-2 flex gap-1 rounded-lg bg-muted p-0.5">
        <button
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
            tab === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
          )}
          onClick={() => setTab('manual')}
        >
          手动
        </button>
        <button
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
            tab === 'ai' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
          )}
          onClick={() => setTab('ai')}
        >
          AI 生成
        </button>
      </div>

      {tab === 'manual' ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入文本，或从左侧连线注入上游文本…"
          className="min-h-[120px] resize-none border-none bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select
              value={currentModel}
              onChange={(e) => setModelId(e.target.value)}
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
              disabled={streaming}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {streaming ? (
              <Button size="sm" variant="outline" onClick={stopGenerate}>
                停止
              </Button>
            ) : (
              <Button size="sm" onClick={startGenerate} disabled={!currentModel || !instruction.trim()}>
                <Sparkles className="size-3.5" />
                生成
              </Button>
            )}
          </div>

          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="告诉 AI 要写什么，例如：写一段赛博朋克城市夜景的文生图提示词"
            className="min-h-[60px] resize-none text-xs"
            disabled={streaming}
          />

          {(streaming || streamText) && (
            <div className="max-h-[160px] overflow-y-auto rounded-md bg-muted/50 p-2 text-sm whitespace-pre-wrap">
              {streamText}
              {streaming && <Loader2 className="ml-1 inline size-3 animate-spin" />}
            </div>
          )}

          {genError && <p className="text-xs text-destructive">{genError}</p>}
        </div>
      )}
    </BaseNode>
  )
}