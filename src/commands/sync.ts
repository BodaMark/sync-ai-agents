import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  loadAgentConfig,
  TARGET_AGENTS,
  type TargetAgent,
  type AgentConfig,
} from '../utils/yaml-parser.js';
import { getAdapter, type GeneratedFile } from '../adapters/index.js';

export interface SyncCommandOptions {
  config?: string;
  target?: string;
  dryRun?: boolean;
  watch?: boolean;
}

interface SyncResultItem {
  target: TargetAgent;
  file: GeneratedFile;
  action: 'created' | 'updated' | 'simulated';
  sizeBytes: number;
}

function executeSyncPass(configPath: string, options: SyncCommandOptions): SyncResultItem[] {
  const isDryRun = Boolean(options.dryRun);
  const config: AgentConfig = loadAgentConfig(configPath);

  let targetsToSync: TargetAgent[] = [];
  if (options.target) {
    const targetNormalized = options.target.toLowerCase() as TargetAgent;
    if (!TARGET_AGENTS.includes(targetNormalized)) {
      throw new Error(
        `Invalid target agent "${options.target}". Supported: ${TARGET_AGENTS.join(', ')}`
      );
    }
    targetsToSync = [targetNormalized];
  } else {
    targetsToSync = config.targets;
  }

  if (targetsToSync.length === 0) {
    return [];
  }

  const syncResults: SyncResultItem[] = [];
  for (const target of targetsToSync) {
    const adapter = getAdapter(target, config);
    const generatedFiles = adapter.generateFiles();

    for (const file of generatedFiles) {
      const resolvedPath = path.resolve(process.cwd(), file.filePath);
      const targetDir = path.dirname(resolvedPath);
      const fileExists = fs.existsSync(resolvedPath);
      const sizeBytes = Buffer.byteLength(file.content, 'utf-8');

      if (!isDryRun) {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(resolvedPath, file.content, 'utf-8');
      }

      syncResults.push({
        target,
        file,
        action: isDryRun ? 'simulated' : fileExists ? 'updated' : 'created',
        sizeBytes,
      });
    }
  }

  return syncResults;
}

export async function syncCommand(options: SyncCommandOptions): Promise<void> {
  const configPath = options.config || 'agent.yaml';
  const isDryRun = Boolean(options.dryRun);
  const isWatch = Boolean(options.watch);

  p.intro(
    isDryRun
      ? pc.bgYellow(pc.black(' agentsync sync [DRY-RUN] '))
      : isWatch
        ? pc.bgCyan(pc.black(' agentsync sync [WATCH] '))
        : pc.bgCyan(pc.black(' agentsync sync '))
  );

  const spinner = p.spinner();
  spinner.start(
    isDryRun
      ? 'Simulating configuration synchronization...'
      : 'Synchronizing agent configurations and rules...'
  );

  let syncResults: SyncResultItem[] = [];
  try {
    syncResults = executeSyncPass(configPath, options);
  } catch (error) {
    spinner.stop(pc.red('Synchronization failed'));
    p.cancel(pc.red((error as Error).message));
    process.exit(1);
  }

  if (syncResults.length === 0) {
    spinner.stop(pc.yellow('No target agents specified in agent.yaml or CLI options.'));
    return;
  }

  spinner.stop(
    isDryRun
      ? pc.yellow('✔ Dry-run simulation completed successfully!')
      : pc.green('✔ All target agent configurations synchronized!')
  );

  const summaryLines: string[] = [];
  summaryLines.push(
    pc.bold(
      `${'Agent'.padEnd(12)} ${'Action'.padEnd(12)} ${'Size'.padEnd(10)} ${'File Path'}`
    )
  );
  summaryLines.push(pc.gray(''.padEnd(65, '-')));

  for (const item of syncResults) {
    const actionLabel =
      item.action === 'created'
        ? pc.green('Created')
        : item.action === 'updated'
          ? pc.cyan('Updated')
          : pc.yellow('Dry-Run');

    const sizeLabel = `${(item.sizeBytes / 1024).toFixed(2)} KB`;
    summaryLines.push(
      `${pc.magenta(item.target.padEnd(12))} ${actionLabel.padEnd(21)} ${pc.gray(
        sizeLabel.padEnd(10)
      )} ${pc.bold(item.file.filePath)}`
    );
  }

  p.note(summaryLines.join('\n'), 'Synchronization Report');

  const targetCount = new Set(syncResults.map((r) => r.target)).size;

  if (!isWatch) {
    if (isDryRun) {
      p.outro(
        pc.yellow(
          '⚠️ Dry-run mode: No files were written to disk. Run `agentsync sync` to apply.'
        )
      );
    } else {
      p.outro(
        pc.green(
          `✔ Successfully synchronized ${syncResults.length} file(s) across ${targetCount} agent(s).`
        )
      );
    }
    return;
  }

  const resolvedConfig = path.resolve(process.cwd(), configPath);
  p.log.info(
    pc.cyan(`Watching ${configPath} for changes... Press Ctrl+C to stop.`)
  );

  let debounceTimer: NodeJS.Timeout | undefined;
  const watcher = fs.watch(resolvedConfig, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString();
      try {
        const updated = executeSyncPass(configPath, options);
        const fileList = updated.map((u) => u.file.filePath).join(', ');
        console.log(
          pc.green(`[${timestamp}] ✔ Synced ${updated.length} file(s): ${pc.bold(fileList)}`)
        );
      } catch (err) {
        console.error(
          pc.red(`[${timestamp}] ✖ Sync skipped (invalid config): ${(err as Error).message}`)
        );
      }
    }, 300);
  });

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
      p.outro(pc.gray('Watch mode stopped.'));
      resolve();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
