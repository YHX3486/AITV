import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Download, Expand } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { BaseNode } from './BaseNode';
import { VideoGeneratorPanel } from './GeneratorPanel';
import { filesApi } from '@/api/files';
import { tasksApi } from '@/api/tasks';
import { useCanvasStore } from '../store/canvasStore';
import { useEffect } from 'react';

export function VideoNode({ id, data }: NodeProps) {
  const fileId = typeof data.currentFileId === 'string' ? data.currentFileId : null;
  const fileUrl = typeof data.currentFileUrl === 'string' ? data.currentFileUrl : null;

  const [fullscreen, setFullscreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const downloadCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = `${fileId?.slice(0, 8) ?? 'video'}.mp4`;
    a.click();
  };

  return (
    <BaseNode id={id} type="video" footer={<VideoGeneratorPanel nodeId={id} />}>
      {fileId ? (
        <div className="relative">
          {fileUrl ? (
            <video
              src={fileUrl}
              controls
              preload="metadata"
              className="nodrag max-h-[240px] w-full rounded-lg"
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              加载中…
            </div>
          )}

          {fileUrl && (
            <div className="absolute right-1 top-1 flex gap-1 opacity-60 transition-opacity hover:opacity-100">
              <button
                className="nodrag rounded-md bg-background/80 p-1 shadow-sm hover:bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreen(true);
                }}
                title="全屏播放"
              >
                <Expand className="size-3.5" />
              </button>
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
        <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">上传视频或用生成器生成</p>
          <button
            className="nodrag rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            onClick={() => inputRef.current?.click()}
          >
            上传视频
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
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

      {/* 全屏播放：Portal 脱离画布 transform（Lightbox 同款根因修复） */}
      {fullscreen && fileUrl && (
        <VideoFullscreenPortal
          src={fileUrl}
          onClose={() => setFullscreen(false)}
        />
      )}

      {/* 历史（结构与 ImageNode 的 HistoryList 一致） */}
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

function VideoFullscreenPortal({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-8"
      onClick={onClose}
    >
      <video
        src={src}
        controls
        autoPlay
        className="max-h-full max-w-full rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
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
    <div className="mt-2 flex flex-col gap-1 rounded-lg border bg-muted/30 p-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-medium text-muted-foreground">生成历史</span>
        <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onClose}>
          收起
        </button>
      </div>
      <div className="max-h-[180px] overflow-y-auto">
        {historyQ.data.map((t) => (
          <button
            key={t.id}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
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
              {t.status === 'succeeded' ? '视频' : t.status === 'failed' ? '失败' : '…'}
            </span>
            <span className="flex flex-col overflow-hidden">
              <span className="truncate text-[10px]">{t.model}</span>
              <span className="text-[9px] text-muted-foreground">
                {new Date(t.created_at).toLocaleString('zh-CN', {
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