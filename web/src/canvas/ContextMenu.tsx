import { useEffect, useRef } from 'react';
import { NODE_META } from './nodes/nodeMeta';
import { useCanvasStore, type CanvasNodeType } from './store/canvasStore';

export interface MenuState {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  /** 拖线建节点场景：新节点建好后自动连回这个源节点 id */
  connectFrom?: string;
}

export function CanvasContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const createNode = useCanvasStore((s) => s.createNode);
  const createNodeWithEdge = useCanvasStore((s) => s.createNodeWithEdge);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const create = (type: CanvasNodeType) => {
    if (menu.connectFrom) {
      createNodeWithEdge(type, menu.flowPosition, menu.connectFrom);
    } else {
      createNode(type, menu.flowPosition);
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: menu.x, top: menu.y }}
      className="z-50 w-44 rounded-xl border bg-card p-1.5 text-card-foreground shadow-lg"
    >
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {menu.connectFrom ? '新建并连接' : '添加节点'}
      </p>
      {Object.values(NODE_META).map((meta) => {
        const Icon = meta.icon;
        const disabled = meta.type === 'script';
        return (
          <button
            key={meta.type}
            disabled={disabled}
            onClick={() => create(meta.type)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
              disabled
                ? 'cursor-not-allowed opacity-40'
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Icon className={`size-4 shrink-0 ${meta.iconClass}`} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}