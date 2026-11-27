import { BaseAdapter, type GeneratedFile } from './base.adapter.js';
import type { TargetAgent } from '../utils/yaml-parser.js';

export class ClaudeAdapter extends BaseAdapter {
  readonly target: TargetAgent = 'claude';

  generateFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // 1. Generate CLAUDE.md
    const claudeMdContent = this.generateClaudeMd();
    files.push({
      filePath: 'CLAUDE.md',
      content: claudeMdContent,
      description: 'Claude Code instructions and guidelines',
    });

    // 2. Generate .mcp.json if mcp_servers exist
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
        filePath: '.mcp.json',
        content: JSON.stringify(mcpConfig, null, 2) + '\n',
        description: 'Claude Code MCP servers configuration',
      });
    }

    return files;
  }

  private generateClaudeMd(): string {
    const banner = this.getHeaderBanner('markdown');
    const { project, rules, skills } = this.config;

    const sections: string[] = [banner];

    sections.push(`# CLAUDE.md — Guidelines for ${project.name}`);
    sections.push('');
    sections.push('## Project Information');
    sections.push(`- **Name:** ${project.name}`);
    sections.push(`- **Language:** ${project.language}`);
    if (project.framework) {
      sections.push(`- **Framework:** ${project.framework}`);
    }
    sections.push('');

    if (rules.system_prompt) {
      sections.push('## Core Mission & Directives');
      sections.push(rules.system_prompt.trim());
      sections.push('');
    }

    if (rules.coding_style && rules.coding_style.length > 0) {
      sections.push('## Code Style & Implementation Rules');
      for (const style of rules.coding_style) {
        sections.push(`- ${style}`);
      }
      sections.push('');
    }

    if (rules.forbidden_patterns && rules.forbidden_patterns.length > 0) {
      sections.push('## Prohibited Practices & Patterns');
      for (const pattern of rules.forbidden_patterns) {
        sections.push(`- ${pattern}`);
      }
      sections.push('');
    }

    if (rules.architecture_notes) {
      sections.push('## Architectural Blueprint');
      sections.push(rules.architecture_notes.trim());
      sections.push('');
    }

    if (skills && skills.length > 0) {
      sections.push('## Domain Skills & Actions');
      for (const skill of skills) {
        sections.push(`### /${skill.name}`);
        sections.push(`**Goal:** ${skill.description}`);
        sections.push('');
        sections.push(skill.instructions.trim());
        sections.push('');
      }
    }

    return sections.join('\n').trim() + '\n';
  }
}
