import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadAgentConfig, type AgentConfig } from '../utils/yaml-parser.js';
import { getAdapter } from '../adapters/index.js';
import { checkGitignoreEnvProtection } from '../security/env-manager.js';
import { PRE_COMMIT_HOOK_IDENTIFIER } from '../security/git-hooks.js';

export interface DoctorCommandOptions {
  config?: string;
}

type CheckStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function formatStatusBadge(status: CheckStatus): string {
  if (status === 'pass') return pc.green('[PASS]');
  if (status === 'warn') return pc.yellow('[WARN]');
  return pc.red('[FAIL]');
}

export async function doctorCommand(options: DoctorCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = options.config || 'agent.yaml';
  const checks: DoctorCheckItem[] = [];

  p.intro(pc.bgCyan(pc.black(' agentsync doctor ')));

  let config: AgentConfig | null = null;
  try {
    config = loadAgentConfig(configPath);
    checks.push({
      label: 'Configuration (agent.yaml)',
      status: 'pass',
      detail: `Valid schema (${config.targets.length} target(s): ${config.targets.join(', ')})`,
    });
  } catch (err) {
    checks.push({
      label: 'Configuration (agent.yaml)',
      status: 'fail',
      detail: (err as Error).message.split('\n')[0],
    });
  }

  if (config) {
    const missingFiles: string[] = [];
    const driftedFiles: string[] = [];
    let totalGenerated = 0;

    for (const target of config.targets) {
      const adapter = getAdapter(target, config);
      const expectedFiles = adapter.generateFiles();

      for (const file of expectedFiles) {
        totalGenerated++;
        const fullPath = path.resolve(projectRoot, file.filePath);
        if (!fs.existsSync(fullPath)) {
          missingFiles.push(file.filePath);
          continue;
        }

        const diskContent = fs.readFileSync(fullPath, 'utf-8');
        if (normalizeLineEndings(diskContent) !== normalizeLineEndings(file.content)) {
          driftedFiles.push(file.filePath);
        }
      }
    }

    if (missingFiles.length === 0 && driftedFiles.length === 0) {
      checks.push({
        label: 'Target Sync State',
        status: 'pass',
        detail: `All ${totalGenerated} generated file(s) match agent.yaml`,
      });
    } else {
      const parts: string[] = [];
      if (missingFiles.length > 0) {
        parts.push(`missing: ${missingFiles.join(', ')}`);
      }
      if (driftedFiles.length > 0) {
        parts.push(`modified: ${driftedFiles.join(', ')}`);
      }
      checks.push({
        label: 'Target Sync State',
        status: 'warn',
        detail: `Drift detected (${parts.join('; ')}). Run 'agentsync sync'.`,
      });
    }
  } else {
    checks.push({
      label: 'Target Sync State',
      status: 'fail',
      detail: 'Skipped because agent.yaml could not be loaded.',
    });
  }

  const gitignoreStatus = checkGitignoreEnvProtection(projectRoot);
  if (gitignoreStatus.isProtected) {
    checks.push({
      label: '.gitignore Env Protection',
      status: 'pass',
      detail: '.env and .env.* patterns are ignored',
    });
  } else {
    checks.push({
      label: '.gitignore Env Protection',
      status: 'warn',
      detail: `Missing ${gitignoreStatus.missingPatterns.join(', ')}. Run 'agentsync env --fix-gitignore'.`,
    });
  }

  const gitDir = path.join(projectRoot, '.git');
  const hookPath = path.join(gitDir, 'hooks', 'pre-commit');
  if (!fs.existsSync(gitDir)) {
    checks.push({
      label: 'Git Pre-Commit Hook',
      status: 'warn',
      detail: 'Not a git repository (.git directory not found).',
    });
  } else if (!fs.existsSync(hookPath)) {
    checks.push({
      label: 'Git Pre-Commit Hook',
      status: 'warn',
      detail: 'Hook not installed. Run ' + "'agentsync scan --install-hook'.",
    });
  } else {
    const hookContent = fs.readFileSync(hookPath, 'utf-8');
    if (hookContent.includes(PRE_COMMIT_HOOK_IDENTIFIER)) {
      checks.push({
        label: 'Git Pre-Commit Hook',
        status: 'pass',
        detail: 'agentsync pre-commit hook is installed',
      });
    } else {
      checks.push({
        label: 'Git Pre-Commit Hook',
        status: 'warn',
        detail: 'Custom pre-commit hook exists without agentsync integration.',
      });
    }
  }

  const lines = checks.map(
    (c) => `${formatStatusBadge(c.status)} ${pc.bold(c.label)}: ${pc.gray(c.detail)}`
  );
  p.note(lines.join('\n'), 'Project Health Checklist');

  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  if (failCount > 0) {
    p.outro(pc.red(`✖ Doctor found ${failCount} failure(s) and ${warnCount} warning(s).`));
    process.exitCode = 1;
  } else if (warnCount > 0) {
    p.outro(pc.yellow(`⚠ Doctor completed with ${warnCount} warning(s).`));
  } else {
    p.outro(pc.green('✔ All checks passed! Your agentsync project is in great shape.'));
  }
}
