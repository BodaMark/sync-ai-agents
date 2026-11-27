import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  AgentConfigSchema,
  formatZodError,
  type AgentConfig,
  type McpServerConfig,
  type SkillConfig,
  type TargetAgent,
} from '../utils/yaml-parser.js';

export interface ImportCommandOptions {
  path?: string;
  output?: string;
  force?: boolean;
}

interface ExtractedData {
  targets: Set<TargetAgent>;
  projectName?: string;
  language?: string;
  framework?: string;
  systemPromptParts: string[];
  codingStyle: Set<string>;
  forbiddenPatterns: Set<string>;
  architectureParts: string[];
  skills: Map<string, SkillConfig>;
  mcpServers: Record<string, McpServerConfig>;
  detectedFiles: string[];
}

function stripBanner(content: string): string {
  return content
    .replace(/^<!--\s*AUTO-GENERATED[\s\S]*?-->\s*/i, '')
    .replace(/^#\s*===+\r?\n#\s*AUTO-GENERATED[\s\S]*?#\s*===+\s*/i, '')
    .trim();
}

function extractFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  try {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { frontmatter: parsed as Record<string, unknown>, body: match[2].trim() };
    }
  } catch {
    // Ignore invalid frontmatter
  }
  return { frontmatter: {}, body: match[2].trim() };
}

function parseMarkdownSections(raw: string): Record<string, string> {
  const cleaned = stripBanner(raw);
  const lines = cleaned.split(/\r?\n/);
  const sections: Record<string, string> = {};
  let currentHeading = '_root';
  let buffer: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,2}\s+(.+)$/);
    if (headingMatch) {
      const prev = buffer.join('\n').trim();
      if (prev) {
        sections[currentHeading] = sections[currentHeading]
          ? `${sections[currentHeading]}\n${prev}`
          : prev;
      }
      currentHeading = headingMatch[1].trim().toLowerCase();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  const tail = buffer.join('\n').trim();
  if (tail) {
    sections[currentHeading] = sections[currentHeading]
      ? `${sections[currentHeading]}\n${tail}`
      : tail;
  }
  return sections;
}

function extractBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]|\d+\.)\s+/.test(line))
    .map((line) =>
      line
        .replace(/^(?:[-*]|\d+\.)\s+/, '')
        .replace(/^[\u26a0\ufe0f\u274c]+\s*/, '')
        .trim()
    )
    .filter((line) => line.length > 0);
}

function isForbiddenBullet(item: string): boolean {
  return /^(?:never|do not|don't|avoid|must not|prohibited|forbidden)\b/i.test(item.trim());
}

function extractSkillsFromSection(text: string): SkillConfig[] {
  const skills: SkillConfig[] = [];
  const blocks = text.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const rawTitle = (lines[0] || '').trim();
    const name = rawTitle.replace(/^Skill:\s*/i, '').replace(/^\//, '').trim();
    if (!name) continue;

    const bodyLines = lines.slice(1);
    let description = `Imported skill: ${name}`;
    let instrStartIdx = 0;

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i].trim();
      if (!line) continue;
      if (line.startsWith('**Goal:**')) {
        description = line.replace('**Goal:**', '').trim();
        instrStartIdx = i + 1;
      } else if (line.startsWith('>') && line.length > 1) {
        description = line.slice(1).trim();
        instrStartIdx = i + 1;
      } else if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
        description = line.slice(1, -1).trim();
        instrStartIdx = i + 1;
      }
      break;
    }

    const instructions = bodyLines.slice(instrStartIdx).join('\n').trim();
    if (instructions) {
      skills.push({ name, description: description || name, instructions });
    }
  }
  return skills;
}

function ingestMarkdownRules(content: string, acc: ExtractedData, sourceName?: string): void {
  const { frontmatter, body: withoutFrontmatter } = extractFrontmatter(content);
  if (
    sourceName &&
    frontmatter.alwaysApply === false &&
    typeof frontmatter.description === 'string' &&
    frontmatter.description.trim()
  ) {
    const skillName = path.basename(sourceName, path.extname(sourceName));
    const instructions = stripBanner(withoutFrontmatter);
    if (instructions && !acc.skills.has(skillName)) {
      acc.skills.set(skillName, {
        name: skillName,
        description: frontmatter.description.trim(),
        instructions,
      });
      return;
    }
  }

  const sections = parseMarkdownSections(withoutFrontmatter);
  let matchedKnownSection = false;

  for (const [heading, body] of Object.entries(sections)) {
    if (!body) continue;

    if (heading === '_root') {
      const langMatch = body.match(/\*\*(?:Primary )?Language:\*\*\s*(.+)/i);
      if (langMatch && !acc.language) acc.language = langMatch[1].trim();
      const fwMatch = body.match(/\*\*Framework:\*\*\s*(.+)/i);
      if (fwMatch && !acc.framework) acc.framework = fwMatch[1].trim();
      const nameMatch = body.match(/\*\*Name:\*\*\s*(.+)/i);
      if (nameMatch && !acc.projectName) acc.projectName = nameMatch[1].trim();
      continue;
    }

    if (
      heading.includes('forbidden') ||
      heading.includes('prohibited') ||
      heading.includes('anti-pattern') ||
      heading.includes('do not') ||
      heading.includes("don't") ||
      heading.includes('avoid') ||
      heading.includes('never')
    ) {
      matchedKnownSection = true;
      for (const item of extractBullets(body)) {
        acc.forbiddenPatterns.add(item);
      }
    } else if (
      heading.includes('coding') ||
      heading.includes('style') ||
      heading.includes('convention') ||
      heading.includes('guideline') ||
      heading.includes('best practice') ||
      heading.includes('standard') ||
      heading.includes('rule')
    ) {
      matchedKnownSection = true;
      const bullets = extractBullets(body);
      if (bullets.length > 0) {
        for (const item of bullets) {
          if (isForbiddenBullet(item)) {
            acc.forbiddenPatterns.add(item);
          } else {
            acc.codingStyle.add(item);
          }
        }
      } else {
        acc.systemPromptParts.push(body);
      }
    } else if (
      heading.includes('system') ||
      heading.includes('core mission') ||
      heading.includes('operational directives') ||
      heading.includes('role & core') ||
      heading.includes('persona') ||
      heading.includes('instructions')
    ) {
      matchedKnownSection = true;
      acc.systemPromptParts.push(body);
    } else if (
      heading.includes('architecture') ||
      heading.includes('structure') ||
      heading.includes('module organization')
    ) {
      matchedKnownSection = true;
      acc.architectureParts.push(body);
    } else if (heading.includes('skill') || heading.includes('workflow')) {
      matchedKnownSection = true;
      for (const skill of extractSkillsFromSection(body)) {
        if (!acc.skills.has(skill.name)) {
          acc.skills.set(skill.name, skill);
        }
      }
    } else if (heading.includes('project') || heading.includes('stack')) {
      const langMatch = body.match(/\*\*(?:Primary )?Language:\*\*\s*(.+)/i);
      if (langMatch && !acc.language) acc.language = langMatch[1].trim();
      const fwMatch = body.match(/\*\*Framework:\*\*\s*(.+)/i);
      if (fwMatch && !acc.framework) acc.framework = fwMatch[1].trim();
    }
  }

  if (!matchedKnownSection) {
    const cleaned = stripBanner(withoutFrontmatter);
    if (cleaned) {
      const bullets = extractBullets(cleaned);
      if (bullets.length >= 2) {
        for (const item of bullets) {
          if (isForbiddenBullet(item)) {
            acc.forbiddenPatterns.add(item);
          } else {
            acc.codingStyle.add(item);
          }
        }
      } else {
        acc.systemPromptParts.push(cleaned);
      }
    }
  }
}

function ingestMcpJson(filePath: string, acc: ExtractedData): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
      mcp?: Record<string, { command?: string | string[]; args?: string[]; env?: Record<string, string>; environment?: Record<string, string> }>;
    };
    const servers = parsed.mcpServers || parsed.mcp || {};
    for (const [name, srv] of Object.entries(servers)) {
      if (!srv) continue;
      if (typeof srv.command === 'string' && srv.command.trim()) {
        acc.mcpServers[name] = {
          command: srv.command,
          args: Array.isArray(srv.args) ? srv.args : [],
          env: srv.env && typeof srv.env === 'object' ? srv.env : {},
        };
      } else if (Array.isArray(srv.command) && srv.command.length > 0) {
        const [cmd, ...rest] = srv.command;
        acc.mcpServers[name] = {
          command: String(cmd),
          args: rest.map(String),
          env:
            srv.environment && typeof srv.environment === 'object'
              ? srv.environment
              : srv.env && typeof srv.env === 'object'
                ? srv.env
                : {},
        };
      }
    }
  } catch {
    // Ignore malformed JSON files during discovery
  }
}

function inferProjectDefaults(searchRoot: string, acc: ExtractedData): {
  name: string;
  language: string;
  framework: string;
} {
  let name = acc.projectName || path.basename(searchRoot) || 'my-project';
  let language = acc.language || 'TypeScript';
  let framework = acc.framework || '';

  const pkgPath = path.join(searchRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (!acc.projectName && pkg.name) name = pkg.name;
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (!acc.language) {
        language = allDeps.typescript ? 'TypeScript' : 'JavaScript';
      }
      if (!framework) {
        if (allDeps.next) framework = 'Next.js';
        else if (allDeps.react) framework = 'React';
        else if (allDeps.express) framework = 'Express';
        else if (allDeps.commander) framework = 'Node.js CLI';
      }
    } catch {
      // Ignore package.json parse errors
    }
  } else if (fs.existsSync(path.join(searchRoot, 'pyproject.toml')) || fs.existsSync(path.join(searchRoot, 'requirements.txt'))) {
    if (!acc.language) language = 'Python';
  } else if (fs.existsSync(path.join(searchRoot, 'go.mod'))) {
    if (!acc.language) language = 'Go';
  }

  return { name, language, framework };
}

export function discoverAndBuildConfig(searchRoot: string): {
  config: AgentConfig;
  detectedFiles: string[];
} {
  const acc: ExtractedData = {
    targets: new Set<TargetAgent>(),
    systemPromptParts: [],
    codingStyle: new Set<string>(),
    forbiddenPatterns: new Set<string>(),
    architectureParts: [],
    skills: new Map<string, SkillConfig>(),
    mcpServers: {},
    detectedFiles: [],
  };

  const cursorRulesPath = path.join(searchRoot, '.cursorrules');
  if (fs.existsSync(cursorRulesPath)) {
    acc.targets.add('cursor');
    acc.detectedFiles.push('.cursorrules');
    ingestMarkdownRules(fs.readFileSync(cursorRulesPath, 'utf-8'), acc);
  }

  const cursorRulesDir = path.join(searchRoot, '.cursor', 'rules');
  if (fs.existsSync(cursorRulesDir) && fs.statSync(cursorRulesDir).isDirectory()) {
    const entries = fs.readdirSync(cursorRulesDir).filter((f) => f.endsWith('.md') || f.endsWith('.mdc'));
    if (entries.length > 0) {
      acc.targets.add('cursor');
      for (const entry of entries) {
        const rel = path.join('.cursor', 'rules', entry);
        acc.detectedFiles.push(rel);
        ingestMarkdownRules(fs.readFileSync(path.join(cursorRulesDir, entry), 'utf-8'), acc, entry);
      }
    }
  }

  const cursorMcpPath = path.join(searchRoot, '.cursor', 'mcp.json');
  if (fs.existsSync(cursorMcpPath)) {
    acc.targets.add('cursor');
    acc.detectedFiles.push('.cursor/mcp.json');
    ingestMcpJson(cursorMcpPath, acc);
  }

  const claudeMdPath = path.join(searchRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    acc.targets.add('claude');
    acc.detectedFiles.push('CLAUDE.md');
    ingestMarkdownRules(fs.readFileSync(claudeMdPath, 'utf-8'), acc);
  }

  const rootMcpPath = path.join(searchRoot, '.mcp.json');
  if (fs.existsSync(rootMcpPath)) {
    acc.targets.add('claude');
    acc.detectedFiles.push('.mcp.json');
    ingestMcpJson(rootMcpPath, acc);
  }

  const clineRulesPath = path.join(searchRoot, '.clinerules');
  if (fs.existsSync(clineRulesPath)) {
    acc.targets.add('cline');
    acc.detectedFiles.push('.clinerules');
    ingestMarkdownRules(fs.readFileSync(clineRulesPath, 'utf-8'), acc);
  }

  const openCodeJsonPath = path.join(searchRoot, 'opencode.json');
  if (fs.existsSync(openCodeJsonPath)) {
    acc.targets.add('opencode');
    acc.detectedFiles.push('opencode.json');
    ingestMcpJson(openCodeJsonPath, acc);
    try {
      const oc = JSON.parse(fs.readFileSync(openCodeJsonPath, 'utf-8')) as { name?: string };
      if (oc.name && !acc.projectName) acc.projectName = oc.name;
    } catch {
      // Ignore malformed opencode.json
    }
  }

  const openCodeInstrPath = path.join(searchRoot, '.opencode', 'instructions.md');
  if (fs.existsSync(openCodeInstrPath)) {
    acc.targets.add('opencode');
    acc.detectedFiles.push('.opencode/instructions.md');
    ingestMarkdownRules(fs.readFileSync(openCodeInstrPath, 'utf-8'), acc);
  }

  const aiderConfPath = path.join(searchRoot, '.aider.conf.yml');
  if (fs.existsSync(aiderConfPath)) {
    acc.targets.add('aider');
    acc.detectedFiles.push('.aider.conf.yml');
    try {
      const aiderCfg = YAML.parse(fs.readFileSync(aiderConfPath, 'utf-8')) as { read?: string | string[] };
      const readFiles = Array.isArray(aiderCfg?.read)
        ? aiderCfg.read
        : typeof aiderCfg?.read === 'string'
          ? [aiderCfg.read]
          : [];
      for (const rf of readFiles) {
        if (typeof rf === 'string' && rf !== 'CONVENTIONS.md') {
          const resolvedRf = path.resolve(searchRoot, rf);
          if (fs.existsSync(resolvedRf) && fs.statSync(resolvedRf).isFile()) {
            ingestMarkdownRules(fs.readFileSync(resolvedRf, 'utf-8'), acc, rf);
          }
        }
      }
    } catch {
      // Ignore malformed .aider.conf.yml
    }
  }

  const conventionsPath = path.join(searchRoot, 'CONVENTIONS.md');
  if (fs.existsSync(conventionsPath)) {
    acc.targets.add('aider');
    acc.detectedFiles.push('CONVENTIONS.md');
    ingestMarkdownRules(fs.readFileSync(conventionsPath, 'utf-8'), acc);
  }

  const project = inferProjectDefaults(searchRoot, acc);
  const targets: TargetAgent[] =
    acc.targets.size > 0 ? Array.from(acc.targets) : ['cursor', 'claude'];

  const uniqueSystemPrompts = Array.from(
    new Set(acc.systemPromptParts.map((s) => s.trim()).filter(Boolean))
  );
  const uniqueArchNotes = Array.from(
    new Set(acc.architectureParts.map((s) => s.trim()).filter(Boolean))
  );

  const candidateConfig = {
    project,
    targets,
    rules: {
      system_prompt: uniqueSystemPrompts.join('\n\n'),
      coding_style: Array.from(acc.codingStyle),
      forbidden_patterns: Array.from(acc.forbiddenPatterns),
      architecture_notes: uniqueArchNotes.join('\n\n'),
    },
    skills: Array.from(acc.skills.values()),
    mcp_servers: acc.mcpServers,
    security: {
      entropy_threshold: 4.5,
      allowlist_paths: ['node_modules', 'dist', '.git', 'agent.yaml'],
      allowlist_patterns: [],
    },
  };

  const parsed = AgentConfigSchema.safeParse(candidateConfig);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  return { config: parsed.data, detectedFiles: acc.detectedFiles };
}

export async function importCommand(options: ImportCommandOptions): Promise<void> {
  const searchRoot = path.resolve(process.cwd(), options.path || '.');
  const outputPath = path.resolve(process.cwd(), options.output || 'agent.yaml');

  p.intro(pc.bgCyan(pc.black(' agentsync import ')));

  if (!fs.existsSync(searchRoot) || !fs.statSync(searchRoot).isDirectory()) {
    p.cancel(pc.red(`Directory not found: ${searchRoot}`));
    process.exit(1);
  }

  if (fs.existsSync(outputPath) && !options.force) {
    const overwrite = await p.confirm({
      message: `${path.basename(outputPath)} already exists. Overwrite it with imported configuration?`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Import cancelled. Existing configuration kept untouched.');
      return;
    }
  }

  const spinner = p.spinner();
  spinner.start(`Scanning ${searchRoot} for existing AI agent configurations...`);

  let result: { config: AgentConfig; detectedFiles: string[] };
  try {
    result = discoverAndBuildConfig(searchRoot);
  } catch (err) {
    spinner.stop(pc.red('Import failed during validation'));
    p.cancel(pc.red((err as Error).message));
    process.exit(1);
  }

  if (result.detectedFiles.length === 0) {
    spinner.stop(pc.yellow('No existing agent configuration files found.'));
    p.outro(pc.yellow('Run `agentsync init` to create a fresh agent.yaml.'));
    return;
  }

  const yamlHeader = [
    '# ====================================================================',
    '# agentsync configuration file (imported from existing agent configs)',
    '# ====================================================================',
    '',
    '',
  ].join('\n');
  const yamlOutput = yamlHeader + YAML.stringify(result.config);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, yamlOutput, 'utf-8');

  spinner.stop(pc.green(`✔ Imported ${result.detectedFiles.length} file(s) into ${path.basename(outputPath)}`));

  const summary = [
    `${pc.bold('Detected files:')} ${result.detectedFiles.join(', ')}`,
    `${pc.bold('Targets:')} ${result.config.targets.join(', ')}`,
    `${pc.bold('Coding rules:')} ${result.config.rules.coding_style.length}`,
    `${pc.bold('Skills:')} ${result.config.skills.length}`,
    `${pc.bold('MCP servers:')} ${Object.keys(result.config.mcp_servers).length}`,
  ];
  p.note(summary.join('\n'), 'Import Summary');
  p.outro(pc.green(`✔ Saved configuration to ${outputPath}`));
}
