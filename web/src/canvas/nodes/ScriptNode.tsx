import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function ScriptNode({ id }: NodeProps) {
  return (
    <BaseNode id={id} type="script">
      <div className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <p className="text-sm">脚本节点开发中</p>
        <p className="text-xs">Phase 2 提供：分镜拆解 / 资产抽取</p>
      </div>
    </BaseNode>
  );
}