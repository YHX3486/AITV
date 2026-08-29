import type { NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { BaseNode } from './BaseNode';

export function VideoNode({ id, data }: NodeProps) {
  const fileId = typeof data.currentFileId === 'string' ? data.currentFileId : null;

  return (
    <BaseNode id={id} type="video">
      {fileId ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          视频播放区（fileId: {fileId.slice(0, 8)}…）
        </div>
      ) : (
        <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">上传视频或图生视频</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => alert('参数面板：M2 接模型时实现')}
          >
            生成参数
          </Button>
        </div>
      )}
    </BaseNode>
  );
}