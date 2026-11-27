import { BaseAdapter, type GeneratedFile } from './base.adapter.js';
import { CursorAdapter } from './cursor.adapter.js';
import { ClaudeAdapter } from './claude.adapter.js';
import { ClineAdapter } from './cline.adapter.js';
import { OpenCodeAdapter } from './opencode.adapter.js';
import { AiderAdapter } from './aider.adapter.js';
import type { AgentConfig, TargetAgent } from '../utils/yaml-parser.js';

export { BaseAdapter, type GeneratedFile };
export { CursorAdapter } from './cursor.adapter.js';
export { ClaudeAdapter } from './claude.adapter.js';
export { ClineAdapter } from './cline.adapter.js';
export { OpenCodeAdapter } from './opencode.adapter.js';
export { AiderAdapter } from './aider.adapter.js';

export function getAdapter(target: TargetAgent, config: AgentConfig): BaseAdapter {
  switch (target) {
    case 'cursor':
      return new CursorAdapter(config);
    case 'claude':
      return new ClaudeAdapter(config);
    case 'cline':
      return new ClineAdapter(config);
    case 'opencode':
      return new OpenCodeAdapter(config);
    case 'aider':
      return new AiderAdapter(config);
    default: {
      const exhaustiveCheck: never = target;
      throw new Error(`Unsupported target agent: ${exhaustiveCheck}`);
    }
  }
}
