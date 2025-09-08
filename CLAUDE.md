# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Eliza is a multi-agent AI framework with extensible plugin architecture. The codebase is organized as a monorepo with:
- **Core Framework**: `packages/core/` - Central types, runtime, database, memory, and evaluation systems
- **Agents**: `agent/` - Main agent implementation using the core framework
- **Clients**: `packages/client-*/` - Platform connectors (Discord, Twitter, Telegram, etc.)
- **Plugins**: `packages/plugin-*/` - Blockchain integrations, AI services, and utilities
- **Adapters**: `packages/adapter-*/` - Database adapters (SQLite, PostgreSQL, Redis)

## Development Commands

### Building
- `pnpm build` - Build all packages (uses turbo for dependency management)
- `pnpm build-docker` - Build for Docker (includes docs)

### Running
- `pnpm start` - Start the main agent
- `pnpm start:client` - Start the web client for interaction
- `pnpm start:debug` - Start with debug logging enabled
- `pnpm cleanstart` - Remove database and start fresh
- `pnpm dev` - Development mode with file watching

### Testing & Code Quality
- `pnpm test` - Run all tests across packages
- `pnpm lint` - Run ESLint across all packages
- `pnpm prettier` - Format all code
- `pnpm smokeTests` - Quick integration tests
- `pnpm integrationTests` - Full integration test suite
- `pnpm clean` - Clean all build artifacts

### Individual Package Development
Navigate to specific packages for targeted work:
```bash
cd packages/core && pnpm test        # Test core framework
cd packages/client-twitter && pnpm build  # Build Twitter client
```

## Architecture Key Points

### Core Framework (`packages/core/`)
- **Runtime**: Central orchestrator managing agents, memory, and actions
- **Memory**: Persistent conversation and relationship storage
- **Actions**: Extensible action system for agent behaviors
- **Evaluators**: Message processing and response evaluation
- **Providers**: LLM model integrations (OpenAI, Anthropic, Llama, etc.)
- **Database**: SQLite default with PostgreSQL/Redis support

### Character System
- Characters defined in JSON files with personalities, knowledge, and behaviors
- Default character: `packages/core/src/defaultCharacter.ts`
- Load custom characters: `pnpm start --characters="path/to/character.json"`

### Plugin Architecture
Plugins extend functionality through:
- **Actions**: New behaviors the agent can perform
- **Evaluators**: Custom message processing logic
- **Providers**: Integration with external services
- **Clients**: New platform connections

### Response Format (Critical)
All LLM responses must follow the Eliza JSON format:
```json
{
  "user": "AgentName",
  "text": "Response with escaped newlines\\n\\nLike this",
  "action": "ACTION_TYPE"
}
```

Use core parsing functions:
- `parseJSONObjectFromText()` for parsing responses
- `normalizeJsonContent()` for newline handling
- `messageCompletionFooter` in templates

## Environment Setup

### Prerequisites
- Node.js 23+ (required)
- Python 2.7+
- pnpm package manager

### Configuration
1. Copy `.env.example` to `.env`
2. Configure API keys for desired services
3. Character files can override environment variables

### Database
- Default: SQLite (`agent/data/db.sqlite`)
- Optional: PostgreSQL, Redis adapters available
- Clean database: Delete SQLite file or use `pnpm cleanstart`

## Code Quality Standards

### Cursor Rules
The project includes Cursor rules in `.cursor/rules/`:
- **JSON Response Format**: Enforces proper Eliza response formatting
- **TypeScript Standards**: Linting and type checking requirements

### Testing
- Use Vitest for unit tests
- Integration tests validate end-to-end workflows
- Coverage available with `TEST_COVERAGE=1 pnpm test`

### Linting
- ESLint with TypeScript support
- Prettier for code formatting
- Run `pnpm lint` before commits

## Package Manager
- **pnpm only** - enforced by preinstall script
- Workspace dependencies use `workspace:*` protocol
- Turbo handles build orchestration and caching