# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the CLI implementation. Use `src/cli.ts` for command wiring, keep command logic in `src/commands/*.ts`, and reserve shared helpers for files such as `src/config.ts`, `src/git.ts`, and `src/run.ts`. `tests/` holds Vitest suites and fixture utilities in `tests/helpers.ts`. `docs/` is a separate Nuxt documentation app with content under `docs/content/` and app code under `docs/app/`. `rfcs/` stores design proposals. `dist/` is generated output.

## Build, Test, and Development Commands

- `pnpm build` bundles the CLI with `tsdown` to `dist/index.mjs`.
- `pnpm dev` rebuilds in watch mode while changing CLI code.
- `pnpm test` runs the Vitest suite.
- `pnpm typecheck` runs `tsc --noEmit` against `src/` and `tests/`.
- `pnpm check` runs tests and type checking together.
- `pnpm docs:dev` starts the Nuxt docs site locally.
- `pnpm docs:build` builds the docs site.

For targeted runs, use commands such as `pnpm exec vitest run tests/run.test.ts`.

## Coding Style & Naming Conventions

Write TypeScript as ESM and keep it compatible with the strict `tsconfig.json`. Match the existing style: 2-space indentation, double quotes, trailing commas where appropriate, and small focused modules. Name command files after the command (`src/commands/sync.ts` exports `sync`). Add types at module boundaries and avoid weakening signatures with `any` unless a test fixture genuinely needs it.

## Testing Guidelines

Vitest is the test framework. Add or update `*.test.ts` files in `tests/` for every behavior change, especially around CLI parsing, config loading, Git interactions, and lock-file behavior. Prefer fixture-based tests using `createTempDir()` and `createRepoFixture()` over ad hoc shell setup. Run `pnpm test` before opening a PR; run `pnpm check` for broader verification.

## Commit & Pull Request Guidelines

Follow the Conventional Commit style already used in history: `fix(init): ...`, `docs(rfc): ...`, `build: ...`, `chore: ...`. Keep scopes aligned with the touched area. PRs should explain user-visible changes, list verification commands you ran, and link the relevant issue or RFC when applicable. Include screenshots only for changes inside `docs/`.

## Configuration & Safety Tips

Do not commit `.repostackrc`; it is user-local state and should stay ignored. Treat `dist/` as generated artifacts. If you change CLI behavior or configuration semantics, update both `README.md` and the matching pages under `docs/content/`.
