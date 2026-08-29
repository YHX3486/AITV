import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 全屏图片预览：点击遮罩或 Esc 关闭，右上角下载。
 * 自绘 overlay（不引 lightbox 库——需求就这三个交互，引库不值）。
 */
export function ImageLightbox({
  src,
  fileName,
  onClose,
}: {
  src: string;
  fileName?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const download = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = fileName ?? 'image.png';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            download();
          }}
          title="下载"
        >
          <Download className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={onClose}
          title="关闭（Esc）"
        >
          <X className="size-4" />
        </Button>
      </div>
      <img
        src={src}
        alt="预览"
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}