# Repository Guidelines

## Project Structure & Module Organization
`agent/` contains the runnable bot plus default characters in `packages/core/src`; plug-ins live under `packages/*` (for example `packages/client-direct`, `packages/core`). Front-end helpers sit in `client/`, shared assets and docs in `docs/` and `characters/`, while automated scenarios live in `tests/`. Keep new durable data in `agent/data` so `scripts/clean.sh` can reset local state safely.

## Build, Test, and Development Commands
Install dependencies with `pnpm install` (the root enforces pnpm via `only-allow`). Use `pnpm build` for a Turbo-powered monorepo build and `pnpm start` to run the agent with `--isRoot`. Add `pnpm start:client` in a second shell to launch the Vite client. For coordinated hot reload across core, client-direct, and the agent, run `pnpm dev`, which executes `scripts/dev.sh` and watches package outputs. Reset artifacts with `pnpm clean`; container users can bootstrap via `pnpm docker:start`.

## Coding Style & Naming Conventions
TypeScript and JavaScript follow Standard style with 2-space indentation, enforced by the shared `eslint.config.mjs` and `prettier.config.cjs`. Run `pnpm lint` and `pnpm prettier-check` before sending a patch; staged files should already match `prettier` defaults (single quotes, trailing commas where valid). Workspace packages publish under the `@elizaos/*` scope, and new directories should use kebab-case names, e.g., `packages/conversation-tools`.

## Testing Guidelines
The canonical entry point is `pnpm test`, which executes `scripts/test.sh`; it iterates each subpackage and runs its `npm test`. Export package suites via Vitest or framework-specific CLIs, and keep spec files beside implementation as `*.test.ts`. For coverage, run `TEST_COVERAGE=1 pnpm test`, which calls `test:coverage` scripts. Smoke and integration passes run through `pnpm smokeTests` and `pnpm integrationTests`. Add cross-package fixtures to `tests/`.

## Commit & Pull Request Guidelines
Commit linting uses Conventional Commits (`feat(core): add memory index`) and keeps subject lines ≤72 characters. Branch names should start with the issue id plus a short slug (e.g., `1234--voice-regression`). Every PR must include a short behavior summary, validation steps (`pnpm test`, `pnpm lint`), updated docs if config or character files move, and UI screenshots when the client changes. Cross-link the relevant GitHub issue and mention new env vars in `.env.example`.
