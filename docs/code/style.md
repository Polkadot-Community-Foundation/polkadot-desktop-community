# Code style

Most rules below are enforced by ESLint (`eslint.config.js`) — `npm run lint` to check, `npm run lint:fix` to auto-fix.

## Files and tests

- Source: camelCase (`createQueryResource.ts`). React components: PascalCase (`HomeButton.tsx`).
- Unit tests co-located as `*.spec.ts`.
- DOM/React tests co-located as `*.test.tsx`, using `@testing-library/react` with `happy-dom`.
- Do not write tests for schemas or any other static definitions.

## Imports

- Use the `@/` alias for `src/` — relative imports across layers are forbidden.
- Inline type imports: `import { type Foo } from '...'` — never a separate `import type` line.
- Remove unused imports/variables; prefix intentionally unused args with `_`.
- Max **25** module imports per file (type imports excluded).

## TypeScript

- Use `type`, not `interface`.
- No classes.
- String-literal enums.
- No `as` assertions in production code. If unavoidable, disable the rule on that line with a justification. Tests and `**/mocks/*.ts` are exempt.
- Array type: `T[]`, not `Array<T>`.
- Use the global `Nullable<T>` / `NullableMap<T>` from `src/shared/types/`.
- DI identifiers follow `local-rules/enforce-di-naming-convention` (see `di.md`).

## Comments

**The test: a comment must carry what the code cannot.** If deleting it loses nothing a reader could recover by reading the code itself, delete it. Code is the description of _what_ happens and is kept honest by the compiler and the tests; a comment is not, so it earns its place only by holding information that has nowhere else to live.

Write a comment when it is one of these:

- **Why, not what** — the constraint that forced this shape: a spec/RFC clause, an upstream bug, a protocol quirk, or the reason the obvious approach does not work. The reader can see the code; they cannot see what you rejected.
- **An assumption or invariant the code relies on but cannot enforce locally** — a guarantee the caller must uphold, a required ordering, an expectation about chain or peer behavior. Example: `src/features/call/state/callActivity.ts:5` records that a single active call is assumed.
- **A temporary state or deferral** — a workaround, a migration half-done, a branch that exists only for an old client. **It MUST name the condition that removes it**, in the existing form: `// TODO(<scope>): <what> when <condition>`. A deferral with no exit condition is not a comment, it is rot — either finish it in this PR or open a tracked issue and reference that (`docs/claude/architecture-checklist.md § Complexity`).
- **TSDoc on a public surface** — a `/**` block on something exported through a domain / aggregate / feature `index.ts`, describing the contract for callers who will never open the file. Not on internal helpers.

Do not write a comment that:

- **Restates the code** (`// increment the counter`, `// map over products`) — this is the common case and it is always deletable.
- **Explains a name that should be renamed instead.** Fix the name; the comment is a workaround for it.
- **Records history** — who changed it, what it used to be, a ticket it came from. Git owns that, and unlike the comment, git stays correct.
- **Is commented-out code.** Delete it.
- **Is a section banner or divider.** A file that needs internal signposting is a file that should be split.

Not every line needs the full context of the system around it. When in doubt, leave it out — an absent comment costs a reader one lookup; a stale one sends them the wrong way and nothing in CI will ever catch it.

## JS patterns

- No `for..in` — use `for..of`.
- No `.forEach(arrow)` — use `for..of`.
- No `console.log`. Console levels: `console.debug` is the verbose-diagnostics level (e.g. WebRTC traces) — it is
  silenced app-wide in production builds at startup (`silenceDebugConsole` from `@/shared/logger`, wired in
  `src/index.tsx`); `console.info` / `warn` / `error` are meaningful output and stay in every build.
- Non-UI files: `function` declarations.
- React components: arrow functions.
- A producer with discrete states exposes **one** `onXChange(status)` callback over a typed union, not several narrow boolean callbacks (`onIdle` + `onError` + …). One callback keeps a single source of truth and lets the producer report every state it owns (including the "active" one a split API tends to omit).
- Do not use manual bytes arrays checks and offsets. use `scale` codecs if it is applicable.

## React

- Function components only, as arrow functions.
- Never the `React` namespace in types — `FC`, not `React.FC`.
- `VoidFunction` over `() => void`.
- `PropsWithChildren<{}>` over manual `type Props = { children: ReactNode }`.
- No inline values in `Context.Provider value={...}` — memoize.
- No curly braces around string literals in JSX props/children.

# Tailwind

- Avoid using px units in Tailwind classes, use default grid values instead.
- All tailwind classes outside JSX must be wrapped in `cnTw` call for correct ordering and parsing.
- Do not defile tailwind classes as separate variable. composition should be done with React components, not low level primitives.

## i18n

- No string literals in JSX. Use `react-intl`. Stories and tests are exempt.

## Feature / Resource conventions

- Feature names: `domain/feature`.
- Resources use the builder pattern ending in `.build()`.
- `immer`'s `produce` only for nested immutable updates — not for flat objects.
- Slots define extension points for feature UI injection (see `di.md`).
