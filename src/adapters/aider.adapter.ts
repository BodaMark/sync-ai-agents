import { BaseAdapter, type GeneratedFile } from './base.adapter.js';
import type { TargetAgent } from '../utils/yaml-parser.js';

export class AiderAdapter extends BaseAdapter {
  readonly target: TargetAgent = 'aider';

  generateFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // 1. Generate CONVENTIONS.md (rules, skills, and coding standards)
    const conventionsContent = this.generateConventionsMd();
    files.push({
      filePath: 'CONVENTIONS.md',
      content: conventionsContent,
      description: 'Aider project conventions and coding instructions',
    });

    // 2. Generate .aider.conf.yml
    const aiderConfContent = this.generateAiderConf();
    files.push({
      filePath: '.aider.conf.yml',
      content: aiderConfContent,
      description: 'Aider configuration pointing to CONVENTIONS.md',
    });

    return files;
  }

  private generateAiderConf(): string {
    const banner = this.getHeaderBanner('hash');
    const lines: string[] = [banner];

    lines.push('# Files to automatically read into every Aider chat session');
    lines.push('read:');
    lines.push('  - CONVENTIONS.md');
    lines.push('');
    lines.push('# General behavior settings');
    lines.push('auto-commits: false');
    lines.push('check-update: false');
    lines.push('analytics: false');
    lines.push('');

    return lines.join('\n');
  }

  private generateConventionsMd(): string {
    const banner = this.getHeaderBanner('markdown');
    const { project, rules, skills } = this.config;

    const sections: string[] = [banner];

    sections.push(`# Coding Conventions & Guidelines — ${project.name}`);
    sections.push('');
    sections.push('## Project Stack');
    sections.push(`- **Language:** ${project.language}`);
    if (project.framework) {
      sections.push(`- **Framework:** ${project.framework}`);
    }
    sections.push('');

    if (rules.system_prompt) {
      sections.push('## Role & Core Guidelines');
      sections.push(rules.system_prompt.trim());
      sections.push('');
    }

    if (rules.coding_style && rules.coding_style.length > 0) {
      sections.push('## Style Conventions');
      for (const style of rules.coding_style) {
        sections.push(`- ${style}`);
      }
      sections.push('');
    }

    if (rules.forbidden_patterns && rules.forbidden_patterns.length > 0) {
      sections.push('## Prohibited Code Patterns');
      for (const pattern of rules.forbidden_patterns) {
        sections.push(`- ${pattern}`);
      }
      sections.push('');
    }

    if (rules.architecture_notes) {
      sections.push('## Architectural Decisions & Constraints');
      sections.push(rules.architecture_notes.trim());
      sections.push('');
    }

    if (skills && skills.length > 0) {
      sections.push('## Specialized Workflows & Tasks');
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
