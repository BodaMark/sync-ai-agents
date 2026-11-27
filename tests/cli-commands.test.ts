import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../src/commands/init.js';
import { syncCommand } from '../src/commands/sync.js';
import { scanCommand } from '../src/commands/scan.js';

describe('CLI commands integration', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsync-cli-'));
    process.chdir(tempDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs init -y, sync --dry-run, sync, and scan cleanly in a fresh directory', async () => {
    await initCommand({ yes: true });
    expect(fs.existsSync(path.join(tempDir, 'agent.yaml'))).toBe(true);

    await syncCommand({ dryRun: true });
    expect(fs.existsSync(path.join(tempDir, '.cursorrules'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(false);

    await syncCommand({});
    expect(fs.existsSync(path.join(tempDir, '.cursorrules'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(true);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await scanCommand({});
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
