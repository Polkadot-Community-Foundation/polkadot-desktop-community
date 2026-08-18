# Overview

This project is a Web/Electron app for browsing Polkadot products. It can run as a standalone web application or as an Electron
desktop app.

A product is an application or set of applications resolvable through dotNS (Polkadot on-chain naming) names. A product can have multiple presentations: an SPA, a widget, or a separate JS worker.

## General rules

- Do not preserve backward compatibility in logical modules. Remove obsolete paths instead of adding compatibility layers of fallbacks.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Do not work around gaps in the SDKs and libraries the app depends on. When a dependency cannot do what the task needs, stop and describe the gap — what is required, what the library exposes, and what a workaround would cost — then wait for direction, which is usually either "fixed upstream, bump it" or "do X instead". Working around a dependency makes the app own that library's internals, and the hack outlives the gap.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- Run only the tests your change affects while you work. The full suite is a pre-commit/pre-PR step, not a per-iteration one — running it on every edit costs minutes each time and buys nothing the affected specs don't already tell you.
  - Known spec → `npx vitest run <path>`. **Not** `npm test -- <path>`: `npm test` chains three vitest projects and the filter reaches only the first, so the rest exit 0 under `--passWithNoTests` and the run **false-passes**. Confirm the output says `Test Files N passed`, never `No test files found`.
  - Don't know which specs cover a file → `npx vitest related --run <changed files>` runs every spec that imports them, transitively. `npx vitest run --changed` scopes to the git diff. A widely-imported file legitimately pulls in most of the suite — that is the tool working, not a reason to distrust it.
  - E2E: run the one relevant project (`npm run test:e2e:<project>`), never `test:e2e:all` mid-work.
  - Run the full `npm test` once before committing or opening a PR, and report that result — not the narrow run's.
- Report what you actually observed. If a change to UI or runtime behavior was not run, say that plainly instead of describing what it should do — an unrun change reported as working costs more than one reported as unverified.
- Every claim about this codebase cites the `file:line` you read in this session, or is labeled as inference. When a decision is questioned ("why is this X?", "check my reasoning"), re-open the file and the library's types before answering. Never construct a rationale for code you have not re-read — being wrong is cheap, a fabricated justification is not.

## Code navigation

Resolve **symbol** questions with the LSP tool, not with grep + Read. The server is the project's own TypeScript 7 binary (`@typescript/native`) in LSP mode — the same Go engine WebStorm runs — wired via the `typescript-lsp-native` plugin in `.claude/plugins/`. First-time setup on a new machine:

```bash
claude plugin marketplace add "$(git rev-parse --show-toplevel)/.claude/plugins"
claude plugin install typescript-lsp-native@polkadot-desktop-local
```

- "who calls / uses this" → `findReferences`, `incomingCalls` — these traverse the barrel `index.ts` re-exports that every domain uses as its public surface, and they exclude README prose and `vi.mock` properties. Grep does neither.
- "where is this defined / what's its type" → `goToDefinition`, `hover`. Position is 1-based and must land on the **identifier**, not the line start.
- "what symbols match this name" → `workspaceSymbol` (returns names + kinds).

Grep/Glob remain correct for free-text, filename patterns, and non-code files.

**Enforcement.** A PreToolUse hook (`.claude/hooks/prefer-lsp-for-symbols.sh`) **denies** — not nudges — a search whose pattern is a code identifier (bare, with an internal case transition). It covers both the `Grep` tool and `Bash(grep|rg|…)`, and it splits `\|` alternations, so a multi-symbol search is caught too. Free text, single dictionary words, quoted patterns with regex metacharacters, and unquoted paths all pass through. If a blocked call really is text matching — filtering command output, searching docs or prose — add the literal marker `# free-text` to the command and re-run.

A SessionStart hook (`.claude/hooks/preload-lsp-tool.sh`) tells you to load the deferred `LSP` tool immediately. Do it before the first search: grep is always resident and LSP is not, and that friction gap — not this rule — is what decides which tool gets reached for mid-task.

The `LSP` tool may be deferred — if it isn't in your tool list, load it once with `ToolSearch("select:LSP")` before the first query. This applies to subagents too: agents with full tool access (`Explore`, `general-purpose`, `typescript-developer`) can use LSP, but must load it the same way. Agents with an explicit tool list that omits `LSP` (`feature-dev:*`, `claude-code-guide`) cannot — send code-navigation work to `Explore` instead.

> **Cold start:** the first semantic query in a session pays ~0.7 s while the project graph loads; after that, queries run between 0.2 ms and ~20 ms depending on result size. The first answer is already complete — returning only the declaration was the old Node `tsserver`'s failure mode, and it persisted across retries rather than warming up. If you ever do see a suspiciously lonely reference result, treat it as a bug worth reporting, not as something to retry around.

## Known Claude commands

- `/create-feature <feature-name>` - Create a new feature boilerplate in `features` directory. If a feature already exists —
  review it and adjust according to defined structure
- `/create-domain-module <domain-name> <module-name>` - Create a new domain module boilerplate in `domains` directory.
- `/commit-and-push` - Stage all modified/new files and push to the current branch.
- `/pr-message` - Draft a pull request message from template.

## Project skills

These skills (under `.claude/skills/`) carry the project's procedural rules. They are part of the contract — don't reimplement guidance they own.

> **Required plugin dependency:** the `superpowers` plugin (`superpowers@claude-plugins-official`) is declared in `.claude/settings.json` so the whole team/CI gets it.

- `architecture` — **entry point for any decision-driven code change, and orchestrator of the full lifecycle** (frame → place → brainstorm → approve → plan → implement → review → fix). Orchestrates `code-placement`, `domain-development`, `feature-development`; delegates brainstorming + plan-writing + implementation to `superpowers`; gates implementation on plan approval; hard-stops on mid-flight plan deviations; and runs `reviewer` as the mandatory post-implementation gate. Run it first, always.
- `code-placement` — fires first when the target layer is uncertain (domain / aggregate / feature / widget / shared). Entry point for "where does this go?".
- `domain-development` — fires when working in `src/domains/`. Points at `docs/code/domain-development.md`.
- `feature-development` — fires when working in `src/features/` or `src/routes/` files that host features. Points at `docs/code/feature-development.md`.
- `react-best-practices` — fires when writing/reviewing/refactoring React code. Performance and rendering rules in `rules/`.
- `run-app` — launches and drives the real Electron app (Playwright REPL at `e2e/driver.ts`) for screenshots and visual
  validation of a change. Renderer hot-reloads inside Electron via `RENDERER_SOURCE=localhost`.
- `reviewer` — audits a branch diff / PR against this project's checklists (`docs/claude/`) with blocking/major/minor severity. Project-rule-aware; complements the generic `/code-review`. Run after a change, before merge.

## Project Structure

> **MANDATORY — start every code change with the `architecture` skill.** Before writing or changing any non-trivial code in `src/` (new code, new/moved/renamed files, a new abstraction, extending behavior, or a refactor that relocates logic), you MUST invoke the `architecture` skill first. It is the single entry point that decides _what_ the change is and _where_ it goes, orchestrating `code-placement`, `domain-development`, and `feature-development`, and (for non-trivial changes) produces a short plan in `docs/_plans/`. Do not generate a file path, pick a layer, or open the flow docs yourself before running it — this does not depend on the skill auto-activating. Inside `src/domains/`, a leaf/container module may ONLY contain the file kinds enumerated below (`types`, `service`, `resource`, `hooks`, `gateway`, `repository`, `schemas`, `constants`, `index`, `README`, `bootstrap`, `$usecase/`) — the PreToolUse hook blocks new non-canonical files outright. If your logic has no canonical home, STOP and ask — never invent a new filename (e.g. `changes.ts`, `manager.ts`, `helpers.ts`) to resolve the ambiguity. Skip the skill only for trivial in-place edits within one existing file (`docs/code/glossary.md` defines the threshold).

@docs/code/project-structure.md

## Code style

@docs/code/style.md

## Development flows

- Adding or extending business logic → [docs/code/domain-development.md](./docs/code/domain-development.md).
- Building user-facing scenarios → [docs/code/feature-development.md](./docs/code/feature-development.md).
- Finding the seam (when domain/feature boundary is unclear) → [docs/abstract/event-storming.md](docs/abstract/event-storming.md).
- Sizing a change before designing it (blast radius vs braid — "looks easy, is complex") → [docs/abstract/simple-vs-easy.md](docs/abstract/simple-vs-easy.md).
- Auditing a change before merge → the `reviewer` skill (checklists in [docs/claude/](docs/claude/); review output to [docs/\_reviews/](docs/_reviews/)).
- Thresholds (trivial vs non-trivial, peer file, composition) → [docs/code/glossary.md](./docs/code/glossary.md).
- Turning a recurring correction into a durable rule → [docs/code/rule-extraction.md](./docs/code/rule-extraction.md).

Always check whether the change belongs in a domain before touching a feature.

## Stack

- **TypeScript** - Primary language
- **React** - UI framework
- **RxJS** - Reactive programming for data streams
- **Immer** - Immutable cache updates (`produce`)
- **Vite** - Build tool
- **Electron** - Desktop app shell
- **TanStack Router** (`@tanstack/react-router`) - File-based routing from `src/routes/`
- **Valibot** - Schema validation
- **Tailwind CSS 4** - Styling
- **@novasamatech/tr-ui** - Main UI kit
- **polkadot-api** - Polkadot chain interaction
- **Dexie** - IndexedDB persistence
- **Vitest** + **React Testing Library** - Unit tests
- **Playwright + playwright-bdd** - E2E tests (Electron)
- **react-intl** - i18n

## Key Patterns

### Dependency Injection (DI) System

@docs/code/di.md

### Effector Utilities (deprecated)

Located in `src/shared/effector/`. Custom utilities for Effector state management. **Do not use in new code** — features must not depend on Effector (see `docs/code/project-structure.md`). Listed here only for navigating existing code:

### E2E Tests

See [e2e/CLAUDE.md](e2e/CLAUDE.md) for writing tests and [e2e/README.md](e2e/README.md) for architecture.

> **Keep docs in sync:** When changing E2E test architecture, fixtures, conventions, or adding new projects/features — update
> `e2e/CLAUDE.md` (rules for AI) and `e2e/README.md` (architecture for developers) accordingly.

## Commands

```bash
# Development
npm start                # Electron dev (main + preload + renderer + electron, watches all)
npm run start:web        # Web-only renderer dev server (Use this for developing web-only features)

# Building
npm run build            # Production build (main + preload + renderer)
npm run build:dev        # Development build of all three targets
npm run build:staging    # Staging build

# Packaging (Electron)
npm run dist             # Package the Electron app (electron-builder). Needs APP_ID, PRODUCT_NAME
                         # and APP_NAME — there is no default identity and packaging refuses
                         # without them. BUILD_TYPE=production picks those three; anything else
                         # prefers their _DEVELOP variants. See docs/PUBLISHING.md section 4.

# Testing
npm test                       # Run unit tests
npm run test:watch             # Watch mode
npm run test:coverage          # Coverage report

# E2E Testing
npm run build:e2e              # Build for e2e (AUTOTEST + filesystem renderer)
npm run test:e2e               # Smoke tests
npm run test:e2e:auth          # Auth flow tests (sign-in, logout)
npm run test:e2e:authenticated # Authenticated session tests
npm run test:e2e:product-sdk   # Product SDK tests (Accounts, Signing, etc.)
npm run test:e2e:chat          # All chat tests (contact search + two-client Alice+Bob pair)
npm run test:e2e:all           # All BDD tests (smoke, auth, authenticated, product-sdk, chat, link-navigation, browser)
npm run test:e2e:security      # Security probe tests
npm run test:e2e:ui            # Playwright interactive UI mode
npm run test:e2e:record        # Launch Electron with Playwright Inspector for recording

# Code Quality
npm run lint             # Lint code
npm run lint:fix         # Fix lint issues
npm run types            # Type check
npm run fmt:check        # Check formatting
npm run fmt:fix          # Fix formatting

# Polkadot API
npm run papi:generate    # Generate Polkadot API types
npm run papi:update      # Update Polkadot API metadata

# Misc
npm run knip             # Detect unused files/exports/dependencies
npm run storybook        # Run Storybook dev server
npm run storybook:build  # Build static Storybook
```
