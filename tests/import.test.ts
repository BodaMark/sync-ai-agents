import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverAndBuildConfig } from '../src/commands/import.js';

describe('import discovery for hand-written agent configs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsync-import-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts rules, forbidden patterns, frontmatter skills, and MCP from hand-written files', () => {
    fs.writeFileSync(
      path.join(tempDir, 'CLAUDE.md'),
      [
        '# Coding Guidelines',
        '- Prefer pure functions',
        '- Never commit API keys',
        '',
        '# Architecture',
        'Keep domain services decoupled from HTTP handlers.',
      ].join(String.fromCharCode(10)),
      'utf-8'
    );

    fs.mkdirSync(path.join(tempDir, '.cursor', 'rules'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.cursor', 'rules', 'testing.mdc'),
      [
        '---',
        'description: Write unit tests for new modules',
        'alwaysApply: false',
        '---',
        'Always test edge cases with Vitest.',
      ].join(String.fromCharCode(10)),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(tempDir, 'opencode.json'),
      JSON.stringify({
        name: 'handcrafted-app',
        mcp: {
          postgres: {
            command: ['npx', '-y', '@modelcontextprotocol/server-postgres'],
          },
        },
      }),
      'utf-8'
    );

    const { config, detectedFiles } = discoverAndBuildConfig(tempDir);

    expect(detectedFiles).toContain('CLAUDE.md');
    expect(detectedFiles).toContain('opencode.json');
    expect(config.project.name).toBe('handcrafted-app');
    expect(config.targets).toEqual(expect.arrayContaining(['claude', 'cursor', 'opencode']));
    expect(config.rules.coding_style).toContain('Prefer pure functions');
    expect(config.rules.forbidden_patterns).toContain('Never commit API keys');
    expect(config.rules.architecture_notes).toContain('Keep domain services decoupled');
    expect(config.skills).toEqual([
      {
        name: 'testing',
        description: 'Write unit tests for new modules',
        instructions: 'Always test edge cases with Vitest.',
      },
    ]);
    expect(config.mcp_servers.postgres).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: {},
    });
  });
});
