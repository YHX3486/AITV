import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Download, Expand } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { ImageGeneratorPanel } from './GeneratorPanel';
import { ImageLightbox } from '../ImageLightbox';
import { filesApi } from '@/api/files';
import { tasksApi, type TaskResultFile } from '@/api/tasks';
import { useCanvasStore } from '../store/canvasStore';

export function ImageNode({ id, data }: NodeProps) {
  const fileId = typeof data.currentFileId === 'string' ? data.currentFileId : null;
  const fileUrl = typeof data.currentFileUrl === 'string' ? data.currentFileUrl : null;

  const resultIds = Array.isArray(data.resultFileIds)
    ? (data.resultFileIds as string[])
    : [];
  const currentIndex = fileId ? resultIds.indexOf(fileId) : -1;

  const [previewOpen, setPreviewOpen] = useState(false);

  const historyQ = useQuery({
    queryKey: ['nodeHistory', id],
    queryFn: () => tasksApi.nodeHistory(id),
    enabled: resultIds.length > 1 || previewOpen,
  });

  const switchTo = (index: number) => {
    const targetId = resultIds[index];
    if (!targetId) return;
    const found = historyQ.data
      ?.flatMap((t) => t.result_files)
      .find((f: TaskResultFile) => f.id === targetId);
    if (found) {
      useCanvasStore.getState().silentUpdateNodeData(id, {
        currentFileId: found.id,
        currentFileUrl: found.url,
      });
    } else {
      filesApi.fileUrl(targetId).then((url) => {
        useCanvasStore.getState().silentUpdateNodeData(id, {
          currentFileId: targetId,
          currentFileUrl: url,
        });
      });
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const onPickFile = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const rec = await filesApi.upload(file);
      useCanvasStore.getState().updateNodeData(id, {
        currentFileId: rec.id,
        currentFileUrl: rec.url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const downloadCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = `${fileId?.slice(0, 8) ?? 'image'}.png`;
    a.click();
  };

  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < resultIds.length - 1;

  return (
    <BaseNode id={id} type="image" footer={<ImageGeneratorPanel nodeId={id} />}>
      {fileId ? (
        <div className="relative">
          {fileUrl ? (
            <img
              src={fileUrl}
              alt="节点图片"
              className="nodrag max-h-[240px] w-full cursor-zoom-in rounded-lg object-cover"
              draggable={false}
              onClick={() => setPreviewOpen(true)}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              加载中…
            </div>
          )}

          {/* 悬停操作条：放大 + 下载 */}
          {fileUrl && (
            <div className="absolute right-1 top-1 flex gap-1 opacity-60 transition-opacity hover:opacity-100">
              <button
                className="nodrag rounded-md bg-background/80 p-1 shadow-sm hover:bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewOpen(true);
                }}
                title="放大预览"
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

          {/* 多图切换 */}
          {resultIds.length > 1 && (
            <>
              <button
                className="nodrag absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 shadow-sm transition-opacity disabled:opacity-0"
                disabled={!canPrev}
                onClick={() => switchTo(currentIndex - 1)}
                title="上一张"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                className="nodrag absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 shadow-sm transition-opacity disabled:opacity-0"
                disabled={!canNext}
                onClick={() => switchTo(currentIndex + 1)}
                title="下一张"
              >
                <ChevronRight className="size-4" />
              </button>
              <span className="absolute bottom-1 right-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                {currentIndex + 1}/{resultIds.length}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          {error && <p className="px-4 text-center text-xs text-destructive">{error}</p>}
          <p className="text-sm text-muted-foreground">
            {uploading ? '上传中…' : '上传图片，或在下方生成器生成'}
          </p>
          <button
            className="nodrag rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            onClick={onPickFile}
            disabled={uploading}
          >
            {uploading ? '上传中…' : '上传图片'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFileChange}
          />
        </div>
      )}

      {/* 全屏预览：必须在 React Flow 节点树之外渲染才不会被 transform 缩放！ */}
      {previewOpen && fileUrl && (
        <ImageLightboxPortal
          src={fileUrl}
          fileName={`${fileId?.slice(0, 8) ?? 'image'}.png`}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* 历史版本面板 */}
      {historyOpen && (
        <HistoryList nodeId={id} onClose={() => setHistoryOpen(false)} />
      )}
      {!historyOpen && (
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

/**
 * 用 Portal 把全屏层挂到 body——
 * 因为 React Flow 的节点在带 transform 的画布容器里，
 * fixed 定位会被祖先 transform 影响（fixed 失效，看起来就像"在节点里放大"）！
 * 这是本 bug 的真正根因。
 */
import { createPortal } from 'react-dom';

function ImageLightboxPortal(props: {
  src: string;
  fileName: string;
  onClose: () => void;
}) {
  return createPortal(
    <ImageLightbox {...props} />,
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
    return (
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        暂无生成历史
      </p>
    );
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
        {historyQ.data.map((t) => {
          const first = t.result_files[0];
          return (
            <button
              key={t.id}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
              onClick={() => {
                if (first) {
                  useCanvasStore.getState().silentUpdateNodeData(nodeId, {
                    currentFileId: first.id,
                    currentFileUrl: first.url,
                    resultFileIds: t.result_files.map((f) => f.id),
                    lastTaskStatus: 'succeeded',
                  });
                }
              }}
            >
              {first ? (
                <img
                  src={first.url}
                  alt=""
                  className="size-8 shrink-0 rounded object-cover"
                  draggable={false}
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">
                  {t.status === 'failed' ? '失败' : '…'}
                </span>
              )}
              <span className="flex flex-col overflow-hidden">
                <span className="truncate text-[10px]">{t.model}</span>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(t.created_at).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {t.result_files.length > 1 && ` · ${t.result_files.length}张`}
                  {t.status === 'failed' && ' · 失败'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}