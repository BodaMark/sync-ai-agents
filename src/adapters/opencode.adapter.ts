import { BaseAdapter, type GeneratedFile } from './base.adapter.js';
import type { TargetAgent } from '../utils/yaml-parser.js';

export class OpenCodeAdapter extends BaseAdapter {
  readonly target: TargetAgent = 'opencode';

  generateFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // 1. Generate .opencode/instructions.md
    const instructionsContent = this.generateInstructionsMd();
    files.push({
      filePath: '.opencode/instructions.md',
      content: instructionsContent,
      description: 'OpenCode instructions, coding guidelines, and skills',
    });

    // 2. Generate opencode.json for OpenCode settings & MCP configuration
    const mcpServers = this.config.mcp_servers || {};
    const opencodeConfig: Record<string, unknown> = {
      $schema: 'https://opencode.ai/config.json',
      name: this.config.project.name,
      instructions: '.opencode/instructions.md',
    };

    if (Object.keys(mcpServers).length > 0) {
      opencodeConfig.mcpServers = Object.entries(mcpServers).reduce(
        (acc, [name, srv]) => {
          acc[name] = {
            command: srv.command,
            args: srv.args || [],
            env: srv.env || {},
          };
          return acc;
        },
        {} as Record<string, unknown>
      );
    }

    files.push({
      filePath: 'opencode.json',
      content: JSON.stringify(opencodeConfig, null, 2) + '\n',
      description: 'OpenCode project configuration and MCP bindings',
    });

    return files;
  }

  private generateInstructionsMd(): string {
    const banner = this.getHeaderBanner('markdown');
    const { project, rules, skills } = this.config;

    const sections: string[] = [banner];

    sections.push(`# OpenCode Instructions — ${project.name}`);
    sections.push('');
    sections.push('## Project Information');
    sections.push(`- **Language:** ${project.language}`);
    if (project.framework) {
      sections.push(`- **Framework:** ${project.framework}`);
    }
    sections.push('');

    if (rules.system_prompt) {
      sections.push('## System Prompt');
      sections.push(rules.system_prompt.trim());
      sections.push('');
    }

    if (rules.coding_style && rules.coding_style.length > 0) {
      sections.push('## Coding Guidelines');
      for (const style of rules.coding_style) {
        sections.push(`- ${style}`);
      }
      sections.push('');
    }

    if (rules.forbidden_patterns && rules.forbidden_patterns.length > 0) {
      sections.push('## Prohibited Practices');
      for (const pattern of rules.forbidden_patterns) {
        sections.push(`- ${pattern}`);
      }
      sections.push('');
    }

    if (rules.architecture_notes) {
      sections.push('## Architecture Notes');
      sections.push(rules.architecture_notes.trim());
      sections.push('');
    }

    if (skills && skills.length > 0) {
      sections.push('## Skills & Custom Commands');
      for (const skill of skills) {
        sections.push(`### ${skill.name}`);
        sections.push(`*${skill.description}*`);
        sections.push('');
        sections.push(skill.instructions.trim());
        sections.push('');
      }
    }

    return sections.join('\n').trim() + '\n';
  }
}
