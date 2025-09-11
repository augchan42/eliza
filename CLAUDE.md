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
- `pnpm start:debug` - Start with debug logging enabled (`NODE_ENV=development VERBOSE=true DEBUG=eliza:*`)
- `pnpm cleanstart` - Remove SQLite database and start fresh
- `pnpm cleanstart:debug` - Clean start with debug logging
- `pnpm dev` - Development mode with file watching

### Testing & Code Quality
- `pnpm test` - Run all tests across packages
- `TEST_COVERAGE=1 pnpm test` - Run tests with coverage reporting
- `pnpm lint` - Run ESLint across all packages (exits on first failure)
- `pnpm prettier` - Format all code
- `pnpm prettier-check` - Check code formatting without changes
- `pnpm smokeTests` - Quick integration tests
- `pnpm integrationTests` - Full integration test suite
- `pnpm clean` - Clean all build artifacts

### Individual Package Development
Navigate to specific packages for targeted work:
```bash
cd packages/core && pnpm test        # Test core framework
cd packages/client-twitter && pnpm build  # Build Twitter client
```

### Docker Commands
- `pnpm docker:build` - Build Docker image
- `pnpm docker:run` - Run Docker container
- `pnpm docker:bash` - Interactive bash in container
- `pnpm docker:start` - Start Docker services
- `pnpm docker` - Build, run, and open bash (full pipeline)

## Architecture Key Points

### Core Framework (`packages/core/`)
Key modules in the core framework:
- **Runtime** (`runtime.ts`): Central orchestrator managing agents, memory, and actions
- **Memory** (`memory.ts`): Persistent conversation and relationship storage
- **Actions** (`actions.ts`): Extensible action system for agent behaviors
- **Evaluators** (`evaluators.ts`): Message processing and response evaluation
- **Providers** (`providers.ts`): LLM model integrations (OpenAI, Anthropic, Llama, etc.)
- **Database** (`database.ts`): SQLite default with PostgreSQL/Redis support
- **Generation** (`generation.ts`): LLM text generation and response handling
- **Models** (`models.ts`): Model configurations and types
- **Parsing** (`parsing.ts`): Response parsing utilities
- **Types** (`types.ts`): Core TypeScript interfaces and types

### Character System
- Characters defined in JSON files with personalities, knowledge, and behaviors
- Default character: `packages/core/src/defaultCharacter.ts`
- Load custom characters: `pnpm start --characters="path/to/character.json"`
- Multiple characters can be loaded simultaneously

### Plugin Architecture
Plugins extend functionality through:
- **Actions**: New behaviors the agent can perform (e.g., trading, sending messages)
- **Evaluators**: Custom message processing logic (e.g., sentiment analysis)
- **Providers**: Integration with external services (e.g., blockchain APIs)
- **Clients**: New platform connections (e.g., Discord, Twitter)
- **Services**: Internal functionality (e.g., data processing)

#### Plugin Implementation Requirements
- Always implement the complete Plugin interface
- Provide descriptive name and description
- Organize components by type with proper separation
- Handle component lifecycle (initialization, cleanup)
- Implement proper error handling and validation
- Document plugin dependencies and capabilities

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

## Monorepo Structure

### Package Organization
The repository contains ~100+ packages organized by category:
- **Core**: `packages/core/` - Central framework
- **Clients**: `packages/client-*/` - Platform integrations (Discord, Twitter, Telegram, etc.)
- **Plugins**: `packages/plugin-*/` - Blockchain, AI services, utilities
- **Adapters**: `packages/adapter-*/` - Database adapters (SQLite, PostgreSQL, Redis)
- **Examples**: `packages/_examples/` - Sample implementations

### Agent Implementation
- `agent/` - Main agent implementation directory
- `agent/src/` - Agent source code
- `agent/characters/` - Character definition files
- `agent/data/` - Runtime data and SQLite database

## Environment Setup

### Prerequisites
- Node.js 23+ (required, enforced by scripts)
- Python 2.7+
- pnpm package manager (enforced by preinstall script)

### Configuration
1. Copy `.env.example` to `.env`
2. Configure API keys for desired services
3. Character files can override environment variables
4. Use `.env.local` and `.env.production` for environment-specific configs

### Database
- Default: SQLite (`agent/data/db.sqlite`)
- Optional: PostgreSQL, Redis adapters available  
- Clean database: Delete SQLite file or use `pnpm cleanstart`

## Code Quality Standards

### Cursor Rules
The project includes comprehensive Cursor rules in `.cursor/rules/`:
- **Plugin Architecture** (`2005-plugin-architecture.mdc`): Enforces proper plugin structure
- **Actions** (`2004-actions.mdc`): Standards for action implementations
- **Evaluators** (`2003-evaluators.mdc`): Message processing standards
- **Telegram Components** (`2000-2002-telegram-*.mdc`): Client-specific rules
- **Core Standards** (`000-cursor-rules.mdc`): General development guidelines

### Testing
- Use Vitest for unit tests
- Jest configuration available (`jest.config.js` in agent/)
- Integration tests validate end-to-end workflows  
- Coverage available with `TEST_COVERAGE=1 pnpm test`
- Scripts automatically test all packages with available test scripts

### Linting
- ESLint with TypeScript support configured in `eslint.config.mjs`
- Prettier for code formatting (`prettier.config.cjs`)
- Lint scripts check Node.js version (22+) and exit on first failure
- Run `pnpm lint` before commits

### Package Manager
- **pnpm only** - enforced by preinstall script
- Workspace dependencies use `workspace:*` protocol
- Turbo handles build orchestration and caching (`turbo.json`)
- Package manager version: `pnpm@9.12.3` (defined in packageManager field)
## Sessions System Behaviors

@CLAUDE.sessions.md
