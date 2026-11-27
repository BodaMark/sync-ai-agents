import fs from 'node:fs';
import path from 'node:path';

export interface EnvEntry {
  key: string;
  value: string;
  rawLine: string;
  lineNumber: number;
  hasExportPrefix: boolean;
  quoteStyle: '"' | "'" | '';
  inlineComment: string;
}

export interface EnvDiffResult {
  envExists: boolean;
  exampleExists: boolean;
  missingInEnv: string[];
  undocumentedInExample: string[];
  matchedKeys: string[];
}

export interface GitignoreCheckResult {
  gitignoreExists: boolean;
  gitignorePath: string;
  hasEnvRule: boolean;
  hasEnvWildcardRule: boolean;
  isProtected: boolean;
  missingPatterns: string[];
}

const ENV_LINE_REGEX = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function parseEnvValue(rawValue: string): {
  value: string;
  quoteStyle: '"' | "'" | '';
  inlineComment: string;
} {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return { value: '', quoteStyle: '', inlineComment: '' };
  }

  const firstChar = trimmed[0];
  if (firstChar === '"' || firstChar === "'") {
    const closingIndex = trimmed.indexOf(firstChar, 1);
    if (closingIndex !== -1) {
      const value = trimmed.slice(1, closingIndex);
      const rest = trimmed.slice(closingIndex + 1).trim();
      const inlineComment = rest.startsWith('#') ? rest : '';
      return { value, quoteStyle: firstChar, inlineComment };
    }
  }

  const hashIndex = trimmed.indexOf(' #');
  if (hashIndex !== -1) {
    return {
      value: trimmed.slice(0, hashIndex).trim(),
      quoteStyle: '',
      inlineComment: trimmed.slice(hashIndex + 1).trim(),
    };
  }

  return { value: trimmed, quoteStyle: '', inlineComment: '' };
}

export function parseEnvFile(filePath: string): EnvEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const entries: EnvEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = line.match(ENV_LINE_REGEX);
    if (!match) {
      continue;
    }

    const [, prefix, key, rawValue] = match;
    const parsed = parseEnvValue(rawValue);
    entries.push({
      key,
      value: parsed.value,
      rawLine: line,
      lineNumber: i + 1,
      hasExportPrefix: prefix.includes('export'),
      quoteStyle: parsed.quoteStyle,
      inlineComment: parsed.inlineComment,
    });
  }

  return entries;
}

function buildPlaceholder(key: string, currentValue: string): string {
  if (currentValue.trim() === '') {
    return '';
  }

  const upper = key.toUpperCase();
  if (upper.includes('URL') || upper.includes('URI') || upper.includes('ENDPOINT')) {
    return 'https://example.com';
  }
  if (upper.includes('PORT')) {
    return '3000';
  }
  if (upper.includes('HOST')) {
    return 'localhost';
  }
  if (upper.includes('EMAIL') || upper.includes('MAIL')) {
    return 'user@example.com';
  }
  return `YOUR_${upper}_HERE`;
}

export function generateEnvExample(
  envPath: string,
  examplePath: string
): { variableCount: number; examplePath: string } {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Source .env file not found at: ${envPath}`);
  }

  const rawContent = fs.readFileSync(envPath, 'utf-8');
  const lines = rawContent.split(/\r?\n/);
  const outputLines: string[] = [];
  let variableCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      outputLines.push(line);
      continue;
    }

    const match = line.match(ENV_LINE_REGEX);
    if (!match) {
      outputLines.push(line);
      continue;
    }

    const [, prefix, key, rawValue] = match;
    const parsed = parseEnvValue(rawValue);
    const placeholder = buildPlaceholder(key, parsed.value);
    const quotedPlaceholder =
      parsed.quoteStyle && placeholder
        ? `${parsed.quoteStyle}${placeholder}${parsed.quoteStyle}`
        : placeholder;
    const commentSuffix = parsed.inlineComment ? ` # ${parsed.inlineComment}` : '';

    outputLines.push(`${prefix}${key}=${quotedPlaceholder}${commentSuffix}`);
    variableCount++;
  }

  const targetDir = path.dirname(examplePath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(examplePath, outputLines.join('\n'), 'utf-8');
  return { variableCount, examplePath };
}

export function compareEnvWithExample(
  envPath: string,
  examplePath: string
): EnvDiffResult {
  const envExists = fs.existsSync(envPath);
  const exampleExists = fs.existsSync(examplePath);

  const envEntries = parseEnvFile(envPath);
  const exampleEntries = parseEnvFile(examplePath);

  const envKeys = new Set(envEntries.map((e) => e.key));
  const exampleKeys = new Set(exampleEntries.map((e) => e.key));

  const missingInEnv = [...exampleKeys].filter((k) => !envKeys.has(k));
  const undocumentedInExample = [...envKeys].filter((k) => !exampleKeys.has(k));
  const matchedKeys = [...exampleKeys].filter((k) => envKeys.has(k));

  return {
    envExists,
    exampleExists,
    missingInEnv,
    undocumentedInExample,
    matchedKeys,
  };
}

export function checkGitignoreEnvProtection(projectRoot: string): GitignoreCheckResult {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return {
      gitignoreExists: false,
      gitignorePath,
      hasEnvRule: false,
      hasEnvWildcardRule: false,
      isProtected: false,
      missingPatterns: ['.env', '.env.*'],
    };
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const hasGlobalWildcard = lines.some((l) => l === '.env*' || l === '**/.env*');
  const hasEnvRule =
    hasGlobalWildcard || lines.some((l) => l === '.env' || l === '/.env' || l === '**/.env');
  const hasEnvWildcardRule =
    hasGlobalWildcard ||
    lines.some((l) => l === '.env.*' || l === '/.env.*' || l === '**/.env.*' || l === '.env.local');

  const missingPatterns: string[] = [];
  if (!hasEnvRule) missingPatterns.push('.env');
  if (!hasEnvWildcardRule) missingPatterns.push('.env.*');

  return {
    gitignoreExists: true,
    gitignorePath,
    hasEnvRule,
    hasEnvWildcardRule,
    isProtected: hasEnvRule && hasEnvWildcardRule,
    missingPatterns,
  };
}

export function fixGitignoreEnvProtection(projectRoot: string): {
  updated: boolean;
  addedPatterns: string[];
  gitignorePath: string;
} {
  const status = checkGitignoreEnvProtection(projectRoot);
  if (status.isProtected) {
    return {
      updated: false,
      addedPatterns: [],
      gitignorePath: status.gitignorePath,
    };
  }

  const existing = status.gitignoreExists
    ? fs.readFileSync(status.gitignorePath, 'utf-8')
    : '';
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const block = [
    needsNewline ? '' : null,
    existing.length > 0 ? '' : null,
    '# Environment variables (added by agentsync)',
    ...status.missingPatterns,
    '!.env.example',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  fs.writeFileSync(status.gitignorePath, existing + block, 'utf-8');

  return {
    updated: true,
    addedPatterns: status.missingPatterns,
    gitignorePath: status.gitignorePath,
  };
}
