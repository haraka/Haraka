<!-- agents-version: 1 -->

# AGENTS.md

Shared instructions for every coding agent in this repo. The tool-specific files
(`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) defer to this one.
If a package-level instruction file exists, it is authoritative for that package.

## Repository model

- A monorepo of independent npm packages — each has its own `package.json`, tests, and version history. There is no root workspace and no root test runner. Run every command from the target package directory.
- Package map:
  - `Haraka/` — core SMTP server (has `./run_tests`).
  - `plugin/*` — 40+ optional plugins (`haraka-plugin-<name>`); plugins may depend on each other (e.g. bounce → spf).
  - `haraka-config/` — config loader with hot-reload.
  - `results/`, `notes/` — per-connection result / note tracking.
  - `net-utils/`, `utils/`, `constants/`, `dsn/`, `tld/`, `message-stream/` — shared libraries.
  - `email-address/` — `@haraka/email-address`, the RFC 5321/5322 parser (supersedes the deprecated `address-rfc282x`).
  - `eslint/` — `@haraka/eslint-config`
  - `test-fixtures/` — `haraka-test-fixtures`.

## Working agreement

- Do only what was asked. When you spot an adjacent bug or smell, surface it and ask before expanding scope — don't silently refactor, but don't ignore it either.
- Preserve compatibility; break it only for an explicit, stated reason.
- For protocol behavior, identify the relevant RFC and verify conformance against the existing implementation.

## Source control

- Never run history- or remote-mutating commands (`git commit`, `git push`, `git tag`, `gh pr create`) unless explicitly asked. Stage diffs; the human reviews, commits, and pushes.
- Propose a commit message in Conventional Commit format, imperative mood.
- Update `CHANGELOG.md` under `### Unreleased`: one terse clause per change, least markup. Rationale belongs in the code or PR, not the bullet.

## Coding standards

- Target current Node LTS; prefer ES2024 over legacy patterns.
- Existing code is CommonJS (`require`/`exports`) — match it. New modules should use ESM with CJS interop (see `@haraka/email-address`).
- Add `node:` prefixes to built-in requires in any file you touch (`require('fs')` → `require('node:fs')`).
- Prefer: promise APIs (`fs/promises`), `for...of`/`for...in` over `forEach`, `node:readline` for line parsing, template literals over concatenation, `true`/`false` over `1`/`0`, and guard-style early returns.
- Remove commented-out code (it lives in git history). `npm run qlty` must pass without warnings.

## Comments

- Prefer self-documenting code: a better name beats a comment.
- Keep only WHY comments — a hidden constraint, an invariant, a workaround for a specific bug, or an RFC citation that explains otherwise-surprising behavior.
- Delete WHAT comments that restate the code, and comments that narrate history or audit findings. If a rename makes a comment redundant, delete it rather than updating it.

## Haraka plugins (`plugin/*`)

- Full hook/API reference: `Haraka/docs/Plugins.md`.
- A plugin is an npm package: `index.js` (`exports.register` + hook handlers), `config/` (default `.ini`/`.json`/`.yaml`), `test/`, `README.md`.
- Register hooks in `exports.register` with `this.register_hook('phase', 'method'[, priority])`.
- Hook handlers take `(next, connection)` (rcpt hooks also take `rcpt`) and must call `next` exactly once. Gate early — return `next()` on missing transaction, disabled config, or skip conditions. Signal a verdict with `next(DENY|DENYSOFT|OK, msg)`; `DENY`/`OK`/etc. are plugin-scope globals (no import).
- Results: `connection.transaction.results.add(this, { pass|fail|skip|msg|err, emit })`; query with `results.has(plugin, list, search)`. `emit: true` already logs the collated line — don't also `loginfo`/`logerror` the same thing. results.add(this, {err}) always logs.
- Config loads via `config.get` with a hot-reload callback; declare every boolean or it stays a string and `=== true/false` silently fails:
  ```js
  this.cfg = this.config.get('name.ini', { booleans: ['+a.b', '-c.d'] }, () => this.load())
  ```
- Keep handlers thin. Push pure decision logic and I/O into `lib/*.js` as pure functions that return a verdict/value; the handler just maps that to `results.add` + `next`. For external I/O (DNS, network), expose an injectable seam — a swappable function whose default is the real implementation — so tests run without mocks.
- If you add files outside `index.js` (e.g. a `lib/` dir), add them to `package.json` `files` so they publish.

## Testing

- Test real behavior and observable outcomes — `results`, return codes, emitted headers, side effects — not how a function was called. Asserting call shape (`calledWith`, arity, call counts) tests the test and hides signature drift.
- Mocks/stubs are a smell. Prefer real inputs; when you must isolate a dependency, inject a seam and assert the outcome. Never leave a stub that neuters the path under test — that yields green tests proving nothing.
- For bug fixes, add a failing test first, then fix.
- Every feature ships with meaningful tests. A `.skip` is a coverage hole: fix it or delete it.
- Use `node:test` and `node:assert/strict` for new tests and Mocha migrations. Plugin tests use `haraka-test-fixtures` (`makePlugin`, `makeConnection`, `callHook`).
- Run the package's `lint`, `prettier`, and `format` before handoff.

## Commands (run inside the target package)

- Test: `npm test`. Single file: `node --test test/path/to/file.js`.
- Haraka core: `cd Haraka && ./run_tests [test/plugins/foo.js]`.
- Coverage: `npm run test:coverage`; lcov: `npm run test:coverage:lcov`. Keep coverage at/above ~90%.
- If coverage output includes non-source files (e.g. `package.json`, `test/*`), scope it with `--test-coverage-include` (preferred when the list is short) or `--test-coverage-exclude`.
- Lint/format: `npm run lint` / `prettier` / `format`. Version drift: `npm run versions[:fix]`.

## Package script parity

- node:test packages should expose `test`, `test:coverage`, `test:coverage:lcov`, `lint`, `prettier`, `format` with matching shapes across siblings. Standardize on node:test coverage (not c8); add the canonical scripts when touching a package that lacks them:
  ```jsonc
  "test:coverage": "node --test --experimental-test-coverage",
  "test:coverage:lcov": "mkdir -p coverage && node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.info"
  ```

## Repo badges

- Code climate is deprecated. Update with qlty.sh instead.
- The canonical format for badges should be:
  - Top of README.md:
    - [![Test][ci-img]][ci-url] [![Cover][cov-img]][cov-url] [![Qlty][qlty-img]][qlty-url]
  - Bottom of README.md:
    - [ci-img]: https://github.com/haraka/<name>/actions/workflows/ci.yml/badge.svg
    - [ci-url]: https://github.com/haraka/<name>/actions/workflows/ci.yml
    - [cov-img]: https://codecov.io/github/haraka/<name>/coverage.svg
    - [cov-url]: https://codecov.io/github/haraka/<name>
    - [qlty-img]: https://qlty.sh/gh/haraka/projects/<name>/maintainability.svg
    - [qlty-url]: https://qlty.sh/gh/haraka/projects/<name>
