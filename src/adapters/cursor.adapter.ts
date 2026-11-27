import { BaseAdapter, type GeneratedFile } from './base.adapter.js';
import type { TargetAgent } from '../utils/yaml-parser.js';

export class CursorAdapter extends BaseAdapter {
  readonly target: TargetAgent = 'cursor';

  generateFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // 1. Generate .cursorrules
    const rulesContent = this.generateCursorRules();
    files.push({
      filePath: '.cursorrules',
      content: rulesContent,
      description: 'Cursor rules and instructions file',
    });

    // 2. Generate .cursor/mcp.json if mcp_servers exist
    const mcpServers = this.config.mcp_servers || {};
    if (Object.keys(mcpServers).length > 0) {
      const mcpConfig = {
        mcpServers: Object.entries(mcpServers).reduce(
          (acc, [name, srv]) => {
            acc[name] = {
              command: srv.command,
              args: srv.args || [],
              env: srv.env || {},
            };
            return acc;
          },
          {} as Record<string, unknown>
        ),
      };

      files.push({
        filePath: '.cursor/mcp.json',
        content: JSON.stringify(mcpConfig, null, 2) + '\n',
        description: 'Cursor Model Context Protocol (MCP) servers configuration',
      });
    }

    return files;
  }

  private generateCursorRules(): string {
    const banner = this.getHeaderBanner('markdown');
    const { project, rules, skills } = this.config;

    const sections: string[] = [banner];

    // Project header
    sections.push(`# Project: ${project.name}`);
    sections.push(`- **Primary Language:** ${project.language}`);
    if (project.framework) {
      sections.push(`- **Framework:** ${project.framework}`);
    }
    sections.push('');

    // System Prompt
    if (rules.system_prompt) {
      sections.push('## System Instructions');
      sections.push(rules.system_prompt.trim());
      sections.push('');
    }

    // Coding Style
    if (rules.coding_style && rules.coding_style.length > 0) {
      sections.push('## Coding Standards & Style');
      for (const style of rules.coding_style) {
        sections.push(`- ${style}`);
      }
      sections.push('');
    }

    // Forbidden Patterns
    if (rules.forbidden_patterns && rules.forbidden_patterns.length > 0) {
      sections.push('## Forbidden Patterns & Practices');
      for (const pattern of rules.forbidden_patterns) {
        sections.push(`- ⚠️ ${pattern}`);
      }
      sections.push('');
    }

    // Architecture Notes
    if (rules.architecture_notes) {
      sections.push('## Architecture & Design Guidelines');
      sections.push(rules.architecture_notes.trim());
      sections.push('');
    }

    // Skills / Capabilities
    if (skills && skills.length > 0) {
      sections.push('## Specialized Skills & Workflows');
      for (const skill of skills) {
        sections.push(`### Skill: ${skill.name}`);
        sections.push(`*${skill.description}*`);
        sections.push('');
        sections.push(skill.instructions.trim());
        sections.push('');
      }
    }

    return sections.join('\n').trim() + '\n';
  }
}
