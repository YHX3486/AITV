import { MousePointerClick, GripHorizontal, Link2, FileUp } from 'lucide-react';

/** CV-07：空画布引导。画布上一个节点都没有时显示。 */
export function EmptyHint({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-muted-foreground/70">
        <div className="flex flex-col items-center gap-1.5">
          <MousePointerClick className="size-5" />
          <p className="text-sm">双击空白处 / 右键 / 左上角 + 添加节点</p>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center gap-1.5">
            <GripHorizontal className="size-5" />
            <p className="text-xs">拖动节点摆放</p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Link2 className="size-5" />
            <p className="text-xs">从节点右侧拖线连接</p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <FileUp className="size-5" />
            <p className="text-xs">拖入本地图片/视频</p>
          </div>
        </div>
      </div>
    </div>
  );
}