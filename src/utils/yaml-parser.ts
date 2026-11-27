import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import pc from 'picocolors';

export const TARGET_AGENTS = [
  'cursor',
  'claude',
  'cline',
  'opencode',
  'aider',
] as const;

export type TargetAgent = (typeof TARGET_AGENTS)[number];

export const ProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  language: z.string().min(1, 'Primary language is required'),
  framework: z.string().optional().default(''),
});

export const RulesSchema = z.object({
  system_prompt: z.string().default(''),
  coding_style: z.array(z.string()).default([]),
  forbidden_patterns: z.array(z.string()).default([]),
  architecture_notes: z.string().default(''),
});

export const SkillSchema = z.object({
  name: z.string().min(1, 'Skill name is required'),
  description: z.string().min(1, 'Skill description is required'),
  instructions: z.string().min(1, 'Skill instructions are required'),
});

export const McpServerSchema = z.object({
  command: z.string().min(1, 'MCP command is required'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
});

export const SecuritySchema = z.object({
  entropy_threshold: z.number().default(4.5),
  allowlist_paths: z.array(z.string()).default([]),
  allowlist_patterns: z.array(z.string()).default([]),
});

export const AgentConfigSchema = z.object({
  project: ProjectSchema,
  targets: z
    .array(z.enum(TARGET_AGENTS))
    .min(1, 'At least one target coding agent must be selected'),
  rules: RulesSchema,
  skills: z.array(SkillSchema).default([]),
  mcp_servers: z.record(McpServerSchema).default({}),
  security: SecuritySchema.default({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectSchema>;
export type RulesConfig = z.infer<typeof RulesSchema>;
export type SkillConfig = z.infer<typeof SkillSchema>;
export type McpServerConfig = z.infer<typeof McpServerSchema>;
export type SecurityConfig = z.infer<typeof SecuritySchema>;

export function formatZodError(error: z.ZodError): string {
  const lines: string[] = [];
  lines.push(pc.bold(pc.red('✖ Configuration Validation Errors in agent.yaml:')));

  for (const issue of error.issues) {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : 'root';
    lines.push(
      `  ${pc.red('•')} ${pc.cyan(fieldPath)}: ${pc.yellow(issue.message)}`
    );
  }
  return lines.join('\n');
}

export function loadAgentConfig(filePath: string): AgentConfig {
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    const errorMsg = `Configuration file not found at: ${resolvedPath}`;
    console.error(pc.red(`✖ ${errorMsg}`));
    throw new Error(errorMsg);
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    const errorMsg = `Failed to read file ${resolvedPath}: ${(err as Error).message}`;
    console.error(pc.red(`✖ ${errorMsg}`));
    throw new Error(errorMsg);
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = YAML.parse(rawContent);
  } catch (err) {
    const errorMsg = `YAML Syntax Error in ${resolvedPath}:\n${(err as Error).message}`;
    console.error(pc.red(`✖ ${errorMsg}`));
    throw new Error(errorMsg);
  }

  const validationResult = AgentConfigSchema.safeParse(parsedYaml);

  if (!validationResult.success) {
    const formattedError = formatZodError(validationResult.error);
    console.error(formattedError);
    throw new Error('Invalid agent.yaml configuration format.');
  }

  return validationResult.data;
}
