import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Download } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { AudioGeneratorPanel } from './GeneratorPanel';
import { filesApi } from '@/api/files';
import { tasksApi } from '@/api/tasks';
import { useCanvasStore } from '../store/canvasStore';

/** 后端 created_at 是 naive UTC，补 Z 再解析（时区修复） */
function parseUtc(s: string): Date {
  return new Date(/[Zz]$/.test(s) ? s : `${s}Z`);
}

export function AudioNode({ id, data }: NodeProps) {
  const fileId = typeof data.currentFileId === 'string' ? data.currentFileId : null;
  const fileUrl = typeof data.currentFileUrl === 'string' ? data.currentFileUrl : null;

  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const downloadCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = `${fileId?.slice(0, 8) ?? 'audio'}.mp3`;
    a.click();
  };

  return (
    <BaseNode id={id} type="audio" footer={<AudioGeneratorPanel nodeId={id} />}>
      {fileId ? (
        <div className="nowheel relative">
          {fileUrl ? (
            <audio
              src={fileUrl}
              controls
              preload="metadata"
              className="nodrag w-full"
            />
          ) : (
            <div className="flex h-[60px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              加载中…
            </div>
          )}

          {fileUrl && (
            <div className="absolute right-1 top-1 flex gap-1 opacity-60 transition-opacity hover:opacity-100">
              <button
                className="nodrag rounded-md bg-background/80 p-1 shadow-sm hover:bg-background"
                onClick={downloadCurrent}
                title="下载"
              >
                <Download className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[100px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">文本转语音，或上传音频</p>
          <button
            className="nodrag rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            onClick={() => inputRef.current?.click()}
          >
            上传音频
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const rec = await filesApi.upload(file);
              useCanvasStore.getState().updateNodeData(id, {
                currentFileId: rec.id,
                currentFileUrl: rec.url,
              });
            }}
          />
        </div>
      )}

      {historyOpen ? (
        <HistoryList nodeId={id} onClose={() => setHistoryOpen(false)} />
      ) : (
        <button
          className="nodrag mt-2 flex w-full items-center justify-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
          onClick={() => setHistoryOpen(true)}
        >
          <Clock className="size-3" />
          历史
        </button>
      )}
    </BaseNode>
  );
}

function HistoryList({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const historyQ = useQuery({
    queryKey: ['nodeHistory', nodeId],
    queryFn: () => tasksApi.nodeHistory(nodeId),
  });

  if (historyQ.isLoading) {
    return <p className="mt-2 text-center text-[10px] text-muted-foreground">加载历史…</p>;
  }
  if (historyQ.isError || !historyQ.data?.length) {
    return <p className="mt-2 text-center text-[10px] text-muted-foreground">暂无生成历史</p>;
  }

  return (
    <div className="nowheel mt-2 flex flex-col gap-1 rounded-lg border bg-muted/30 p-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-medium text-muted-foreground">生成历史</span>
        <button className="nodrag text-[10px] text-muted-foreground hover:text-foreground" onClick={onClose}>
          收起
        </button>
      </div>
      <div className="nowheel max-h-[180px] overflow-y-auto">
        {historyQ.data.map((t) => (
          <button
            key={t.id}
            className="nodrag flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
            onClick={() => {
              const first = t.result_files[0];
              if (first) {
                useCanvasStore.getState().silentUpdateNodeData(nodeId, {
                  currentFileId: first.id,
                  currentFileUrl: first.url,
                  lastTaskStatus: 'succeeded',
                });
              }
            }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">
              {t.status === 'succeeded' ? '音频' : t.status === 'failed' ? '失败' : '…'}
            </span>
            <span className="flex flex-col overflow-hidden">
              <span className="truncate text-[10px]">{t.model}</span>
              <span className="text-[9px] text-muted-foreground">
                {parseUtc(t.created_at).toLocaleString('zh-CN', {
                  month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}