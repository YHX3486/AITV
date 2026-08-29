import { useReactFlow } from '@xyflow/react';
import { NODE_META } from './nodes/nodeMeta';
import { useCanvasStore, type CanvasNodeType } from './store/canvasStore';
import { cn } from '@/lib/utils';

/** 级联偏移计数器：连续新建的节点排成阶梯，避免完全重叠 */
let cascade = 0;
function nextCascadeOffset() {
  const offset = (cascade % 6) * 28;
  cascade += 1;
  return offset;
}

/**
 * 底部中间「添加节点」常驻栏（ND-04）。
 * 五类节点横排，点击直接在视口中心创建。
 * 必须渲染在 <ReactFlow> 内部（useReactFlow 需要 context）。
 */
export function AddPanel() {
  const rf = useReactFlow();
  const createNode = useCanvasStore((s) => s.createNode);

  const createAtViewportCenter = (type: CanvasNodeType) => {
    const pos = rf.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const offset = nextCascadeOffset();
    pos.x += offset;
    pos.y += offset;
    createNode(type, pos);
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border bg-card/95 px-2 py-1.5 text-card-foreground shadow-lg backdrop-blur">
        {Object.values(NODE_META).map((meta) => {
          const Icon = meta.icon;
          const disabled = meta.type === 'script';
          return (
            <button
              key={meta.type}
              disabled={disabled}
              onClick={() => createAtViewportCenter(meta.type)}
              className={cn(
                'group relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                disabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
              title={disabled ? '开发中' : `添加${meta.label}：${meta.description}`}
            >
              <Icon className={cn('size-4 shrink-0', meta.iconClass)} />
              <span className="hidden sm:inline">{meta.label}</span>
              {disabled && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-muted-foreground px-1 text-[8px] leading-3 text-background">
                  即
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}