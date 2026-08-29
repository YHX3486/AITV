import type { NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { BaseNode } from './BaseNode';

export function AudioNode({ id, data }: NodeProps) {
  const fileId = typeof data.currentFileId === 'string' ? data.currentFileId : null;

  return (
    <BaseNode id={id} type="audio">
      {fileId ? (
        <div className="flex h-[100px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          音频播放区（fileId: {fileId.slice(0, 8)}…）
        </div>
      ) : (
        <div className="flex h-[100px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">文本转语音 / 上传播放</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => alert('TTS：P1 阶段实现')}
          >
            文本转语音
          </Button>
        </div>
      )}
    </BaseNode>
  );
}