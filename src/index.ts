#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { scanCommand } from './commands/scan.js';
import { envCommand } from './commands/env.js';
import { doctorCommand } from './commands/doctor.js';
import { importCommand } from './commands/import.js';

export * from './utils/yaml-parser.js';
export * from './adapters/index.js';
export * from './security/scanner.js';
export * from './security/git-hooks.js';
export * from './security/env-manager.js';
export * from './commands/init.js';
export * from './commands/sync.js';
export * from './commands/scan.js';
export * from './commands/env.js';
export * from './commands/doctor.js';
export * from './commands/import.js';

const program = new Command();

program
  .name('agentsync')
  .description('Universal sync tool for AI coding agent rules, skills, MCP, and secrets security')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize agent.yaml configuration with interactive prompts or defaults')
  .option('-y, --yes', 'Skip interactive questions and use standard defaults')
  .option('-c, --config <path>', 'Custom path for the configuration file', 'agent.yaml')
  .action(async (options) => {
    await initCommand(options);
  });

program
  .command('sync')
  .description('Synchronize rules, skills, and MCP configs across configured AI coding agents')
  .option('-c, --config <path>', 'Custom path to agent.yaml', 'agent.yaml')
  .option('-t, --target <agent>', 'Sync a specific target agent only (cursor, claude, cline, opencode, aider)')
  .option('--dry-run', 'Simulate file generation without writing to disk', false)
  .option('-w, --watch', 'Watch agent.yaml for changes and re-sync automatically', false)
  .action(async (options) => {
    await syncCommand(options);
  });

program
  .command('scan')
  .description('Scan project or staged files for secrets and credentials')
  .option('-c, --config <path>', 'Custom path to agent.yaml', 'agent.yaml')
  .option('-p, --path <path>', 'Path to directory or file to scan')
  .option('--staged', 'Scan files staged for git commit only', false)
  .option('--install-hook', 'Install automated pre-commit scanning hook in .git/hooks')
  .option('--uninstall-hook', 'Uninstall pre-commit hook from .git/hooks')
  .action(async (options) => {
    await scanCommand(options);
  });

program
  .command('env')
  .description('Manage .env files, generate .env.example, and verify .gitignore protection')
  .option('--generate-example', 'Generate or update .env.example from .env', false)
  .option('--check', 'Compare .env against .env.example for missing or undocumented keys', false)
  .option('--fix-gitignore', 'Add .env and .env.* patterns to .gitignore', false)
  .option('--env <path>', 'Custom path to .env file', '.env')
  .option('--example <path>', 'Custom path to .env.example file', '.env.example')
  .action(async (options) => {
    await envCommand(options);
  });

program
  .command('doctor')
  .description('Run project health diagnostics (config, sync drift, .gitignore, git hook)')
  .option('-c, --config <path>', 'Custom path to agent.yaml', 'agent.yaml')
  .action(async (options) => {
    await doctorCommand(options);
  });

program
  .command('import')
  .description('Reverse-import existing agent config files into agent.yaml')
  .option('-p, --path <dir>', 'Directory to scan for existing agent configurations', '.')
  .option('-o, --output <path>', 'Output path for generated agent.yaml', 'agent.yaml')
  .option('-f, --force', 'Overwrite existing agent.yaml without prompting', false)
  .action(async (options) => {
    await importCommand(options);
  });

program.parse(process.argv);
