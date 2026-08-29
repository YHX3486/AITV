import type { NodeTypes } from '@xyflow/react';
import { AudioNode } from './AudioNode';
import { ImageNode } from './ImageNode';
import { ScriptNode } from './ScriptNode';
import { TextNode } from './TextNode';
import { VideoNode } from './VideoNode';

export const nodeTypes: NodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  script: ScriptNode,
};