import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calculateShannonEntropy,
  maskSecret,
  SecretScanner,
} from '../src/security/scanner.js';

describe('SecretScanner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsync-scan-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('computes Shannon entropy accurately', () => {
    expect(calculateShannonEntropy('')).toBe(0);
    expect(calculateShannonEntropy('aaaaaaaaaa')).toBe(0);
    expect(calculateShannonEntropy('aB3$kL9!pQ2@zX7&')).toBeGreaterThan(3.5);
  });

  it('masks secrets while preserving only safe prefix/suffix', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret('short')).toBe('****');
    expect(maskSecret('medium123456')).toBe('med****...****56');
    expect(maskSecret('very_long_secret_value_1234')).toBe('very_lo****...****1234');
  });

  it('detects OpenAI, GitHub, AWS, and private key secrets', () => {
    const scanner = new SecretScanner();
    const fakeOpenAi = ['sk', 'proj', 'AbCdEf1234567890GhIjKlMnOpQr'].join('-');
    const fakeGithub = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');
    const fakeAws = ['AKIA', '1234567890ABCDEF'].join('');
    const fakePem = ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('');

    const content = [
      `OPENAI_KEY=${fakeOpenAi}`,
      `GH_TOKEN=${fakeGithub}`,
      `AWS_ID=${fakeAws}`,
      fakePem,
    ].join(String.fromCharCode(10));

    const findings = scanner.scanText(content, 'config.ts');
    const ruleIds = findings.map((f) => f.ruleId);

    expect(ruleIds).toContain('openai-api-key');
    expect(ruleIds).toContain('github-token');
    expect(ruleIds).toContain('aws-access-key');
    expect(ruleIds).toContain('private-key');
  });

  it('ignores common placeholder values', () => {
    const scanner = new SecretScanner();
    const content = [
      'API_KEY="your_api_key_here_12345"',
      'SECRET_KEY="changeme_please_now"',
      'AUTH_TOKEN="example_token_value_123"',
    ].join(String.fromCharCode(10));

    const findings = scanner.scanText(content, '.env.example');
    expect(findings).toHaveLength(0);
  });

  it('respects allowlist_paths and allowlist_patterns', () => {
    const fakeOpenAi = ['sk', 'proj', 'ZzYyXx9876543210WwVvUuTtSsRr'].join('-');
    const allowedFile = path.join(tempDir, 'fixtures', 'keys.ts');
    fs.mkdirSync(path.dirname(allowedFile), { recursive: true });
    fs.writeFileSync(allowedFile, `const k = "${fakeOpenAi}";
`, 'utf-8');

    const scannerWithPathAllow = new SecretScanner({
      allowlist_paths: ['fixtures/**'],
    });
    expect(scannerWithPathAllow.scanDirectory(tempDir)).toHaveLength(0);

    const scannerWithPatternAllow = new SecretScanner({
      allowlist_patterns: ['^sk-proj-'],
    });
    expect(scannerWithPatternAllow.scanText(`const k = "${fakeOpenAi}";`, 'app.ts')).toHaveLength(0);
  });
});
