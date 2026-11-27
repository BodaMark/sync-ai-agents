import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentConfigSchema, loadAgentConfig } from '../src/utils/yaml-parser.js';

describe('yaml-parser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsync-yaml-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates a complete configuration and applies defaults', () => {
    const parsed = AgentConfigSchema.parse({
      project: { name: 'demo-app', language: 'TypeScript' },
      targets: ['cursor', 'claude'],
      rules: {},
    });

    expect(parsed.project.name).toBe('demo-app');
    expect(parsed.project.language).toBe('TypeScript');
    expect(parsed.targets).toEqual(['cursor', 'claude']);
    expect(parsed.rules.coding_style).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect(parsed.mcp_servers).toEqual({});
    expect(parsed.security.entropy_threshold).toBe(4.5);
  });

  it('loads a valid agent.yaml file from disk', () => {
    const yamlPath = path.join(tempDir, 'agent.yaml');
    fs.writeFileSync(
      yamlPath,
      `project:
  name: "my-service"
  language: "Python"
  framework: "FastAPI"
targets:
  - cursor
  - aider
rules:
  system_prompt: "Be concise."
  coding_style:
    - "Use type hints"
`,
      'utf-8'
    );

    const config = loadAgentConfig(yamlPath);
    expect(config.project.name).toBe('my-service');
    expect(config.project.framework).toBe('FastAPI');
    expect(config.targets).toEqual(['cursor', 'aider']);
    expect(config.rules.coding_style).toEqual(['Use type hints']);
  });

  it('throws when the configuration file does not exist', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const missingPath = path.join(tempDir, 'nonexistent.yaml');
    expect(() => loadAgentConfig(missingPath)).toThrow(/Configuration file not found/);
  });

  it('throws on invalid YAML syntax', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const badYamlPath = path.join(tempDir, 'bad.yaml');
    fs.writeFileSync(badYamlPath, 'project:' + String.fromCharCode(10) + '  name: [unclosed', 'utf-8');
    expect(() => loadAgentConfig(badYamlPath)).toThrow(/YAML Syntax Error/);
  });

  it('throws on Zod schema validation errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalidSchemaPath = path.join(tempDir, 'invalid.yaml');
    fs.writeFileSync(
      invalidSchemaPath,
      `project:
  name: ""
  language: "TypeScript"
targets:
  - unknown_agent
`,
      'utf-8'
    );
    expect(() => loadAgentConfig(invalidSchemaPath)).toThrow(/Invalid agent\.yaml configuration format/);
  });
});
