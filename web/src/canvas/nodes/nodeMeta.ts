import {
  AudioLines,
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import type { CanvasNodeType } from '../store/canvasStore';

export interface NodeMeta {
  type: CanvasNodeType;
  label: string;
  icon: LucideIcon;
  iconClass: string;   // 图标颜色（Tailwind 类）
  description: string; // 添加面板/菜单里的说明文字
}

export const NODE_META: Record<CanvasNodeType, NodeMeta> = {
  text: {
    type: 'text', label: '文本', icon: FileText,
    iconClass: 'text-sky-500', description: '编写提示词或用 LLM 生成',
  },
  image: {
    type: 'image', label: '图片', icon: ImageIcon,
    iconClass: 'text-emerald-500', description: '上传图片或 AI 生成',
  },
  video: {
    type: 'video', label: '视频', icon: Film,
    iconClass: 'text-violet-500', description: '文生视频 / 图生视频',
  },
  audio: {
    type: 'audio', label: '音频', icon: AudioLines,
    iconClass: 'text-amber-500', description: '文本转语音 / 上传播放',
  },
  script: {
    type: 'script', label: '脚本', icon: Clapperboard,
    iconClass: 'text-muted-foreground', description: '分镜脚本（开发中）',
  },
};