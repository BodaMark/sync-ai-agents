# sync-ai-agents (`agentsync`)

[![CI](https://github.com/BodaMark/sync-ai-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/BodaMark/sync-ai-agents/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](tsconfig.json)

**Unified configuration, coding rules, reusable skills, Model Context Protocol (MCP) sync, and secret-hygiene CLI for AI coding agents.**

Write your project rules, architecture notes, skills, and MCP servers once in `agent.yaml`, and synchronize them across **Cursor**, **Claude Code**, **Cline**, **OpenCode**, and **Aider** — with built-in secret scanning, `.env` hygiene, and config drift detection.

## Why `agentsync`?

Developers and teams switching between Cursor, Claude Code, Cline, OpenCode, and Aider end up maintaining duplicated files (`.cursorrules`, `CLAUDE.md`, `.clinerules`, `CONVENTIONS.md`, `.mcp.json`, `opencode.json`). `agentsync` gives your repository a **single source of truth (`agent.yaml`)**:

- **One Config, 5 AI Agents:** Generate native rules and MCP configurations for Cursor, Claude Code, Cline, OpenCode, and Aider from a single Zod-validated YAML file.
- **Live Watch Mode (`--watch`):** Automatically re-sync all agent files whenever `agent.yaml` is saved.
- **Reverse Import (`import`):** Migrate existing hand-written `.cursorrules`, `.cursor/rules/*.mdc`, `CLAUDE.md`, `.clinerules`, `opencode.json`, and `.aider.conf.yml` into `agent.yaml`.
- **Built-in Secret Scanner (`scan`):** Catch leaked OpenAI, Anthropic, Gemini, AWS, GitHub, Stripe, and Slack tokens, private keys, and high-entropy strings — plus a one-command Git `pre-commit` hook.
- **Environment & Drift Hygiene (`env` & `doctor`):** Generate safe `.env.example` templates, enforce `.gitignore` rules for `.env`, and verify that generated agent files match `agent.yaml`.

## Demo Videos

- [1. One Config to 5 AI Coding Agents (init & sync)](assets/demos/01-sync-agents.mp4)
- [2. Secret Scanner & .env Hygiene (scan, env, doctor)](assets/demos/02-secret-scanner-hygiene.mp4)
- [3. Reverse Import & Live Watch Mode (import & --watch)](assets/demos/03-reverse-import-watch.mp4)

## Quick Start

```bash
# Initialize agent.yaml in your project
npx agentsync init

# Generate configuration files for all configured agents
npx agentsync sync

# Scan repository for leaked secrets
npx agentsync scan
```

## Supported Agents & Generated Files

| Agent | Target ID | Generated Files |
| --- | --- | --- |
| **Cursor** | `cursor` | `.cursorrules`, `.cursor/mcp.json` |
| **Claude Code** | `claude` | `CLAUDE.md`, `.mcp.json` |
| **Cline** | `cline` | `.clinerules` |
| **OpenCode** | `opencode` | `.opencode/instructions.md`, `opencode.json` |
| **Aider** | `aider` | `CONVENTIONS.md`, `.aider.conf.yml` |

## CLI Commands

### `agentsync init`
Interactive wizard to create `agent.yaml`.
```bash
agentsync init          # Interactive setup
agentsync init -y       # Non-interactive defaults
```

### `agentsync sync`
Generate or update target agent files from `agent.yaml`.
```bash
agentsync sync                # Sync all configured targets
agentsync sync -t cursor      # Sync a single target
agentsync sync --dry-run      # Preview without writing files
agentsync sync --watch        # Watch agent.yaml and re-sync on save
```

### `agentsync scan`
Scan the codebase (or staged git files) for API keys, private keys, and high-entropy secrets.
```bash
agentsync scan                # Scan entire repository
agentsync scan --staged       # Scan only git staged files
agentsync scan --install-hook # Install git pre-commit hook
```

### `agentsync env`
Manage `.env` templates and `.gitignore` protection.
```bash
agentsync env --generate-example  # Generate .env.example with safe placeholders
agentsync env --check             # Compare .env against .env.example
agentsync env --fix-gitignore     # Ensure .env and .env.* are in .gitignore
```

### `agentsync doctor`
Run a full health check on `agent.yaml`, generated file drift, `.gitignore` rules, and the git pre-commit hook.
```bash
agentsync doctor
```

### `agentsync import`
Reverse-import existing agent config files (`.cursorrules`, `CLAUDE.md`, `.clinerules`, `opencode.json`, `.aider.conf.yml`, `.mcp.json`, etc.) into a unified `agent.yaml`.
```bash
agentsync import
agentsync import --path ./my-repo --output agent.yaml --force
```

## `agent.yaml` Schema

```yaml
project:
  name: "my-app"
  language: "TypeScript"
  framework: "Next.js"

targets:
  - cursor
  - claude
  - cline
  - opencode
  - aider

rules:
  system_prompt: |
    You are an expert software engineer working on this repository.
  coding_style:
    - "Follow clean architecture and strict separation of concerns"
  forbidden_patterns:
    - "Never commit unencrypted secrets or credentials"
  architecture_notes: |
    Keep domain logic isolated from CLI or UI presentation layers.

skills:
  - name: "security-audit"
    description: "Audit repository for secrets and CVEs"
    instructions: |
      Scan the codebase and report actionable remediations.

mcp_servers:
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    env: {}

security:
  entropy_threshold: 4.5
  allowlist_paths:
    - "dist/**"
    - "node_modules/**"
  allowlist_patterns:
    - "^[0-9a-fA-F]{32}$"
```

## AI & Agent Discoverability

- **Machine-Readable Index:** See [llms.txt](llms.txt) and [AGENTS.md](AGENTS.md) for structured project context indexed by AI coding agents and LLM search engines.
- **Common Use Cases:** Syncing `.cursorrules` with `CLAUDE.md`, sharing MCP server definitions across Cursor / Claude Code / OpenCode, preventing `.env` and API key leaks before `git commit`, and migrating legacy AI assistant configs into a single `agent.yaml`.

## License

MIT
