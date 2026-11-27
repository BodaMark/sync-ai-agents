import { BaseAdapter, type GeneratedFile } from './base.adapter.js';
import type { TargetAgent } from '../utils/yaml-parser.js';

export class ClineAdapter extends BaseAdapter {
  readonly target: TargetAgent = 'cline';

  generateFiles(): GeneratedFile[] {
    const content = this.generateClineRules();
    return [
      {
        filePath: '.clinerules',
        content,
        description: 'Cline rules, memory directives, and system instructions',
      },
    ];
  }

  private generateClineRules(): string {
    const banner = this.getHeaderBanner('markdown');
    const { project, rules, skills } = this.config;

    const sections: string[] = [banner];

    sections.push(`# Cline Instructions — ${project.name}`);
    sections.push('');
    sections.push('## Project Overview');
    sections.push(`- **Language:** ${project.language}`);
    if (project.framework) {
      sections.push(`- **Framework:** ${project.framework}`);
    }
    sections.push('');

    if (rules.system_prompt) {
      sections.push('## Operational Directives');
      sections.push(rules.system_prompt.trim());
      sections.push('');
    }

    if (rules.coding_style && rules.coding_style.length > 0) {
      sections.push('## Coding Standards & Style Requirements');
      for (const style of rules.coding_style) {
        sections.push(`- ${style}`);
      }
      sections.push('');
    }

    if (rules.forbidden_patterns && rules.forbidden_patterns.length > 0) {
      sections.push('## Prohibited Actions & Anti-Patterns');
      for (const pattern of rules.forbidden_patterns) {
        sections.push(`- ❌ ${pattern}`);
      }
      sections.push('');
    }

    if (rules.architecture_notes) {
      sections.push('## Architecture & Module Organization');
      sections.push(rules.architecture_notes.trim());
      sections.push('');
    }

    if (skills && skills.length > 0) {
      sections.push('## Custom Workflows & Task Playbooks');
      for (const skill of skills) {
        sections.push(`### ${skill.name}`);
        sections.push(`> ${skill.description}`);
        sections.push('');
        sections.push(skill.instructions.trim());
        sections.push('');
      }
    }

    return sections.join('\n').trim() + '\n';
  }
}
