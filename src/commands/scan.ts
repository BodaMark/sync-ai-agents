import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadAgentConfig } from '../utils/yaml-parser.js';
import { SecretScanner, type DetectedSecret } from '../security/scanner.js';
import { installPreCommitHook, uninstallPreCommitHook } from '../security/git-hooks.js';

export interface ScanCommandOptions {
  config?: string;
  path?: string;
  staged?: boolean;
  installHook?: boolean;
  uninstallHook?: boolean;
}

export async function scanCommand(options: ScanCommandOptions): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Handle Hook operations
  if (options.installHook) {
    p.intro(pc.bgCyan(pc.black(' agentsync security --install-hook ')));
    const result = installPreCommitHook(projectRoot);
    if (result.success) {
      p.outro(pc.green(`✔ ${result.message}`));
      process.exit(0);
    } else {
      p.cancel(pc.red(`✖ ${result.message}`));
      process.exit(1);
    }
  }

  if (options.uninstallHook) {
    p.intro(pc.bgCyan(pc.black(' agentsync security --uninstall-hook ')));
    const result = uninstallPreCommitHook(projectRoot);
    if (result.success) {
      p.outro(pc.green(`✔ ${result.message}`));
      process.exit(0);
    } else {
      p.cancel(pc.red(`✖ ${result.message}`));
      process.exit(1);
    }
  }

  // 2. Secret Scanning
  const isStaged = Boolean(options.staged);
  p.intro(
    isStaged
      ? pc.bgMagenta(pc.black(' agentsync scan [STAGED FILES] '))
      : pc.bgCyan(pc.black(' agentsync scan '))
  );

  const configPath = options.config || 'agent.yaml';
  let securityConfig = {};

  try {
    const loadedConfig = loadAgentConfig(configPath);
    securityConfig = loadedConfig.security || {};
  } catch {
    // Fall back to default security config if agent.yaml is missing or invalid
  }

  const scanner = new SecretScanner(securityConfig);
  const spinner = p.spinner();
  spinner.start(
    isStaged
      ? 'Scanning git staged files for secrets and credentials...'
      : 'Scanning project files for secrets and credentials...'
  );

  let findings: DetectedSecret[] = [];
  const targetScanPath = options.path
    ? path.resolve(projectRoot, options.path)
    : projectRoot;

  try {
    if (isStaged) {
      findings = scanner.scanStagedFiles(projectRoot);
    } else {
      findings = scanner.scanDirectory(targetScanPath);
    }
  } catch (err) {
    spinner.stop(pc.red('Scanning failed'));
    console.error(pc.red(`✖ Error during scan: ${(err as Error).message}`));
    process.exit(1);
  }

  if (findings.length === 0) {
    spinner.stop(pc.green('No secrets or sensitive data detected!'));
    p.outro(
      pc.bold(
        pc.green(
          `✔ Project is clean. 0 secrets found ${isStaged ? 'in staged files' : 'in scanned path'}.`
        )
      )
    );
    process.exit(0);
  }

  spinner.stop(pc.red(`Found ${findings.length} potential secret(s)!`));

  // Format findings
  const reportLines: string[] = [];
  for (let idx = 0; idx < findings.length; idx++) {
    const item = findings[idx];
    const relPath = path.relative(projectRoot, item.filePath) || item.filePath;
    reportLines.push([
      `${pc.red(`[#${idx + 1}]`)} ${pc.bold(pc.yellow(item.ruleName))}`,
      `  ${pc.cyan('Location:')} ${relPath}:${item.lineNumber}`,
      `  ${pc.cyan('Matched:')}  ${pc.red(item.maskedSecret)}`,
      `  ${pc.cyan('Entropy:')}  ${item.entropy.toFixed(2)}`,
      `  ${pc.cyan('Context:')}  ${pc.gray(item.lineContent.slice(0, 100))}`,
    ].join('\n'));
  }

  p.note(reportLines.join('\n\n'), pc.red('Security Violations Detected'));

  p.outro(
    pc.bold(
      pc.red(
        `✖ Scan failed: ${findings.length} secret(s) found. Remove secrets before committing or update allowlist in agent.yaml.`
      )
    )
  );

  process.exit(1);
}
