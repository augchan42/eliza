
# Agent Runtime Core

The core runtime environment for agents, handling message processing, action registration, and interaction with external services.

## Directory Structure

```bash
agent/
├── characters/           # Your character configuration files go here
│   └── *.character.json  # Character files with .character.json extension
├── sample_characters/    # Sample character configurations for reference
│   ├── tate.character.json
│   └── trump.character.json
└── src/
```
Agents must run from the characters subdirectory.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run with debug logging
pnpm dev:debug --character="characters/8bitoracle.laozi.character.json" >> debug.log 2>&1

# Run with specific debug namespaces
DEBUG=eliza:* pnpm dev:debug --character="characters/example.character.json" >> debug.log 2>&1
```