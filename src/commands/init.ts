import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadAgentConfig, TARGET_AGENTS, type TargetAgent } from '../utils/yaml-parser.js';

export interface InitCommandOptions {
  yes?: boolean;
  config?: string;
}

function buildYamlContent(options: {
  projectName: string;
  language: string;
  framework?: string;
  targets: TargetAgent[];
  enableSecretScanning: boolean;
}): string {
  const targetsYaml = options.targets.map((t) => `  - ${t}`).join('\n');
  const entropyVal = options.enableSecretScanning ? 4.5 : 999.0;

  return `# ====================================================================
# agentsync configuration file
# Documentation & Schema: https://github.com/agentsync/agentsync
# ====================================================================

# 1. Project Metadata
project:
  name: "${options.projectName}"
  language: "${options.language}"
  framework: "${options.framework || ''}"

# 2. Target AI Coding Agents to synchronize with
# Supported targets: cursor, claude, cline, opencode, aider
targets:
${targetsYaml}

# 3. Universal Rules & Instructions
rules:
  # Base system prompt injected across all targets
  system_prompt: |
    You are an expert software engineer working on this repository.
    Adhere strictly to project conventions, modularity, and clean code.

  # Style guides and coding standards
  coding_style:
    - "Follow clean architecture and strict separation of concerns"
    - "Use idiomatic conventions for the chosen language"
    - "Ensure explicit error handling with detailed contextual messages"

  # Patterns, practices, and dependencies that are strictly forbidden
  forbidden_patterns:
    - "Never commit unencrypted secrets or credentials"
    - "Do not use deprecated APIs or unmaintained dependencies"
    - "Avoid hardcoded magic numbers and inline configuration"

  # Architectural guidelines and structure overview
  architecture_notes: |
    All business logic must be isolated in dedicated services.
    CLI presentation layer must stay separated from core domain utilities.

# 4. Custom Agent Skills and Slash Commands
skills:
  - name: "security-audit"
    description: "Audit repository for potential secrets, leaks, and CVEs"
    instructions: |
      Scan the codebase for unencrypted secrets, improper permissions, and outdated packages.
      Generate an actionable remediation report.
  - name: "generate-tests"
    description: "Generate comprehensive unit tests for given module"
    instructions: |
      Inspect the implementation and write edge-case tests with maximum coverage.

# 5. Model Context Protocol (MCP) Server Integrations
mcp_servers:
  filesystem:
    command: "npx"
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "."
    env: {}

# 6. Secret & Security Scanning Policies
security:
  # Shannon entropy threshold for secret detection (default: 4.5)
  entropy_threshold: ${entropyVal}
  
  # Paths exempt from scanning
  allowlist_paths:
    - "dist/**"
    - "node_modules/**"
    - "*.lock"

  # Regex patterns exempt from secret detection
  allowlist_patterns:
    - "^[0-9a-fA-F]{32}$"
`;
}

export async function initCommand(options: InitCommandOptions): Promise<void> {
  const configFileName = options.config || 'agent.yaml';
  const targetPath = path.resolve(process.cwd(), configFileName);

  if (!options.yes) {
    p.intro(pc.bgCyan(pc.black(' agentsync init ')));
  }

  if (fs.existsSync(targetPath)) {
    if (options.yes) {
      // In non-interactive --yes mode, overwrite directly or log notice
      console.log(pc.yellow(`ℹ Existing ${configFileName} found. Overwriting (--yes flag enabled).`));
    } else {
      const shouldOverwrite = await p.confirm({
        message: `${pc.cyan(configFileName)} already exists in this directory. Overwrite?`,
        initialValue: false,
      });

      if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
        p.cancel('Initialization aborted. Existing file was not modified.');
        return;
      }
    }
  }

  let projectName = path.basename(process.cwd()) || 'my-project';
  let language = 'TypeScript';
  let framework = '';
  let targets: TargetAgent[] = ['cursor', 'claude'];
  let enableSecretScanning = true;

  if (!options.yes) {
    const projectNameInput = await p.text({
      message: 'Project name:',
      placeholder: projectName,
      defaultValue: projectName,
      validate: (value) => {
        if (value.trim().length === 0) return 'Project name cannot be empty';
      },
    });

    if (p.isCancel(projectNameInput)) {
      p.cancel('Operation cancelled.');
      return;
    }
    projectName = projectNameInput.trim();

    const languageInput = await p.select({
      message: 'Primary programming language:',
      options: [
        { value: 'TypeScript', label: 'TypeScript', hint: 'recommended' },
        { value: 'JavaScript', label: 'JavaScript' },
        { value: 'Python', label: 'Python' },
        { value: 'Go', label: 'Go' },
        { value: 'Rust', label: 'Rust' },
        { value: 'Other', label: 'Other' },
      ],
      initialValue: 'TypeScript',
    });

    if (p.isCancel(languageInput)) {
      p.cancel('Operation cancelled.');
      return;
    }
    language = languageInput as string;

    if (language === 'Other') {
      const customLang = await p.text({
        message: 'Specify your primary language:',
        placeholder: 'e.g., C++, Java, Kotlin',
        validate: (v) => (!v.trim() ? 'Language is required' : undefined),
      });
      if (p.isCancel(customLang)) {
        p.cancel('Operation cancelled.');
        return;
      }
      language = customLang.trim();
    }

    const targetsInput = await p.multiselect({
      message: 'Select AI coding agents to sync with:',
      options: [
        { value: 'cursor', label: 'Cursor (.cursorrules)' },
        { value: 'claude', label: 'Claude Code (CLAUDE.md)' },
        { value: 'cline', label: 'Cline (.clinerules)' },
        { value: 'opencode', label: 'OpenCode (.opencode/rules)' },
        { value: 'aider', label: 'Aider (.aider.conf.yml)' },
      ],
      initialValues: ['cursor', 'claude'],
      required: true,
    });

    if (p.isCancel(targetsInput)) {
      p.cancel('Operation cancelled.');
      return;
    }
    targets = targetsInput as TargetAgent[];

    const secretScanningInput = await p.confirm({
      message: 'Enable automated secret scanning for .env and credentials?',
      initialValue: true,
    });

    if (p.isCancel(secretScanningInput)) {
      p.cancel('Operation cancelled.');
      return;
    }
    enableSecretScanning = Boolean(secretScanningInput);
  }

  const spinner = p.spinner();
  if (!options.yes) {
    spinner.start('Generating agent.yaml with schema validation...');
  } else {
    console.log(pc.cyan(`⚡ Initializing ${configFileName} with default configurations...`));
  }

  try {
    const yamlString = buildYamlContent({
      projectName,
      language,
      framework,
      targets,
      enableSecretScanning,
    });

    fs.writeFileSync(targetPath, yamlString, 'utf-8');

    // Validate generated file with Zod schema parser to guarantee correctness
    loadAgentConfig(targetPath);

    if (!options.yes) {
      spinner.stop(pc.green('agent.yaml created and verified successfully!'));
      p.note(
        `${pc.cyan(configFileName)} is ready.\nSync targets: ${pc.yellow(targets.join(', '))}\nSecret scanning: ${pc.yellow(enableSecretScanning ? 'Enabled' : 'Disabled')}`,
        'Configuration Summary'
      );
      p.outro(pc.bold(pc.green('✔ Done! Run `agentsync --help` to explore commands.')));
    } else {
      console.log(pc.green(`✔ ${configFileName} successfully created and validated!`));
    }
  } catch (error) {
    if (!options.yes) {
      spinner.stop(pc.red('Failed to generate valid configuration'));
    }
    console.error(pc.red(`✖ Initialization failed: ${(error as Error).message}`));
    process.exit(1);
  }
}
