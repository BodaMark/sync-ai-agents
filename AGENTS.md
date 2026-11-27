# AGENTS.md — sync-ai-agents (`agentsync`)

This repository is the source code for `agentsync` (`sync-ai-agents`), a TypeScript CLI tool that synchronizes configuration, coding rules, skills, and MCP servers across Cursor, Claude Code, Cline, OpenCode, and Aider.

## Commands
- `npm run build` — Bundle CLI with `tsup`
- `npm run lint` — Type-check with `tsc --noEmit`
- `npm test` — Run unit and integration tests with `vitest`

## Architecture
- `src/index.ts` — CLI entry point (`commander`)
- `src/commands/` — Subcommands (`init`, `sync`, `scan`, `env`, `doctor`, `import`)
- `src/adapters/` — Agent-specific generators (Cursor, Claude Code, Cline, OpenCode, Aider)
- `src/security/` — Secret scanner and `.env` hygiene manager
- `tests/` — Vitest test suite
