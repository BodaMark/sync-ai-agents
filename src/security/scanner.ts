import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { SecurityConfig } from '../utils/yaml-parser.js';

export interface SecretRule {
  id: string;
  name: string;
  pattern: RegExp;
  requiresEntropy?: boolean;
}

export interface DetectedSecret {
  ruleId: string;
  ruleName: string;
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchedRaw: string;
  maskedSecret: string;
  entropy: number;
}

export const DEFAULT_RULES: SecretRule[] = [
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    pattern: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g,
  },
  {
    id: 'anthropic-api-key',
    name: 'Anthropic / Claude API Key',
    pattern: /\b(?:sk-ant-[A-Za-z0-9_-]{20,})\b/g,
  },
  {
    id: 'google-gemini-key',
    name: 'Google / Gemini API Key',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  },
  {
    id: 'aws-access-key',
    name: 'AWS Access Key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'github-token',
    name: 'GitHub Token',
    pattern: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})\b/g,
  },
  {
    id: 'stripe-key',
    name: 'Stripe API Key',
    pattern: /\b(?:sk_live|rk_live)_[0-9a-zA-Z]{24,}\b/g,
  },
  {
    id: 'slack-token',
    name: 'Slack Token',
    pattern: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g,
  },
  {
    id: 'private-key',
    name: 'Private Key Block',
    pattern: /-----BEGIN(?:[ A-Z0-9_-]+)?PRIVATE KEY-----/g,
  },
  {
    id: 'generic-secret-assignment',
    name: 'High-Entropy Secret Assignment',
    pattern: /\b(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY|AUTH_TOKEN|SECRET|PASSWORD|DATABASE_URL)\s*[:=]\s*["']([^"'\s]{12,})["']/gi,
    requiresEntropy: true,
  },
];

export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  '.nuxt',
]);

export const IGNORED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
]);

export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
]);

const COMMON_PLACEHOLDERS = [
  'your_api_key',
  'your_secret_key',
  'your_token',
  'your-api-key',
  'changeme',
  'example',
  'dummy',
  'placeholder',
  'xxxxxxxx',
  '<api_key>',
  '<token>',
  'test_token',
];

/**
 * Calculate Shannon Entropy of a string
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies: Record<string, number> = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(3));
}

/**
 * Masks a secret string showing prefix and suffix with asterisks in between
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) {
    return '****';
  }
  if (secret.length <= 16) {
    const prefix = secret.slice(0, 3);
    const suffix = secret.slice(-2);
    return `${prefix}****...****${suffix}`;
  }
  const prefix = secret.slice(0, 7);
  const suffix = secret.slice(-4);
  return `${prefix}****...****${suffix}`;
}

/**
 * Checks if a string is a trivial placeholder
 */
export function isPlaceholder(val: string): boolean {
  const lower = val.toLowerCase().trim();
  return COMMON_PLACEHOLDERS.some((p) => lower.includes(p));
}

/**
 * Scanner Engine
 */
export class SecretScanner {
  private securityConfig: SecurityConfig;
  private allowlistRegexes: RegExp[] = [];

  constructor(securityConfig: Partial<SecurityConfig> = {}) {
    this.securityConfig = {
      entropy_threshold: securityConfig.entropy_threshold ?? 4.5,
      allowlist_paths: securityConfig.allowlist_paths ?? [],
      allowlist_patterns: securityConfig.allowlist_patterns ?? [],
    };

    for (const pat of this.securityConfig.allowlist_patterns || []) {
      try {
        this.allowlistRegexes.push(new RegExp(pat));
      } catch {
        // Ignore invalid regex
      }
    }
  }

  /**
   * Checks whether a file path is ignored or allowlisted
   */
  isFileIgnored(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const filename = path.basename(normalized);
    const ext = path.extname(normalized).toLowerCase();

    if (parts.some((p) => IGNORED_DIRS.has(p))) return true;
    if (IGNORED_FILES.has(filename)) return true;
    if (BINARY_EXTENSIONS.has(ext)) return true;

function globToRegex(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  const escaped = normalized
    .replace(/[.+^${}()|\[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§GLOBSTAR§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§GLOBSTAR§§/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`(^|/)${escaped}($|/)`);
}

    const allowPaths = this.securityConfig.allowlist_paths || [];
    for (const allow of allowPaths) {
      try {
        const regex = globToRegex(allow);
        if (regex.test(normalized)) {
          return true;
        }
      } catch {
        if (normalized.includes(allow)) return true;
      }
    }

    return false;
  }

  /**
   * Scans a single file on disk
   */
  scanFile(filePath: string): DetectedSecret[] {
    if (this.isFileIgnored(filePath)) return [];
    if (!fs.existsSync(filePath)) return [];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    return this.scanText(content, filePath);
  }

  /**
   * Scans string content line by line
   */
  scanText(content: string, filePath: string): DetectedSecret[] {
    const results: DetectedSecret[] = [];
    const lines = content.split(/\r?\n/);
    const threshold = this.securityConfig.entropy_threshold ?? 4.5;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineNum = lineIdx + 1;

      // Skip empty or comment lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        if (!DEFAULT_RULES.some((r) => r.id === 'private-key' && r.pattern.test(trimmed))) {
          continue;
        }
      }

      for (const rule of DEFAULT_RULES) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = rule.pattern.exec(line)) !== null) {
          const matchedValue = match[1] || match[0];
          if (!matchedValue) continue;

          if (isPlaceholder(matchedValue)) continue;

          // Check allowlist patterns
          if (this.allowlistRegexes.some((re) => re.test(matchedValue))) {
            continue;
          }

          const entropy = calculateShannonEntropy(matchedValue);

          if (rule.requiresEntropy) {
            if (entropy < threshold) {
              continue;
            }
          }

          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            filePath,
            lineNumber: lineNum,
            lineContent: trimmed,
            matchedRaw: matchedValue,
            maskedSecret: maskSecret(matchedValue),
            entropy,
          });
        }
      }
    }

    return results;
  }

  /**
   * Scan an entire directory recursively
   */
  scanDirectory(dirPath: string): DetectedSecret[] {
    const allFindings: DetectedSecret[] = [];

    const traverse = (currentDir: string) => {
      if (this.isFileIgnored(currentDir)) return;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          const findings = this.scanFile(fullPath);
          allFindings.push(...findings);
        }
      }
    };

    traverse(dirPath);
    return allFindings;
  }

  /**
   * Scan staged git files using git diff --cached --name-only
   */
  scanStagedFiles(projectRoot: string): DetectedSecret[] {
    const allFindings: DetectedSecret[] = [];
    try {
      const output = execSync('git diff --cached --name-only', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      const files = output
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean);

      for (const relFile of files) {
        const fullPath = path.resolve(projectRoot, relFile);
        const findings = this.scanFile(fullPath);
        allFindings.push(...findings);
      }
    } catch {
      // Not a git repository or git command unavailable
    }
    return allFindings;
  }
}
