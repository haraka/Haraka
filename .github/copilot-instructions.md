<!-- agents-version: 3 -->

# AGENTS.md

Shared instructions for every coding agent in this repo. The tool-specific files
(`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) defer to this one.
If a package-level instruction file exists, it is authoritative for that package.

## Repository model

- This file is shared across every Haraka repository. It describes the whole family — not just this repo. Each repo is an independent npm package, there is no root workspace. Run every command from the package root.
- Repos are worked on both standalone and as sibling checkouts in a combined tree (`Haraka/`, `plugin/<name>/`, …). Don't assume sibling packages are present on disk.
- The family:
  - `Haraka` — core SMTP server (has `./run_tests`).
  - `haraka-plugin-<name>` — optional plugins; may depend on each other (e.g. bounce → spf).
  - `haraka-config` — config loader with hot-reload.
  - `haraka-results`, `haraka-notes` — per-connection result / note tracking.
  - `haraka-net-utils`, `haraka-utils`, `haraka-constants`, `haraka-dsn`, `haraka-tld`, `haraka-message-stream` — shared libraries.
  - `@haraka/email-address` — the RFC 5321/5322 parser (supersedes the deprecated `address-rfc282x`).
  - `@haraka/eslint-config`, `haraka-test-fixtures`.

## Working agreement

- Do only what was asked. When you spot an adjacent bug or smell, surface it and ask before expanding scope. Don't silently refactor, and don't ignore it.
- Preserve compatibility; break it only for an explicit, stated reason.
- For protocol behavior, identify the relevant RFC and verify conformance against the existing implementation.

## Source control

- Never run history- or remote-mutating commands (`git commit`, `git push`, `git tag`, `gh pr create`) unless explicitly asked.
- create diffs; the human reviews, commits, and pushes.
- No trailers on commit messages or PR bodies.
- When asked to generate a PR:
  - keep it succinct, terse, and DRY
  - Post a link to it in the console
- Document changes relative to main in CHANGELOG.md
  - one clear concise entry per change, < 50 chars
  - prefer Conventional Commit format, imperative mood.
  - Rationale belongs in the code or PR, not the bullet.

## Coding standards

- Target current Node LTS; prefer ES2024 over legacy patterns.
- Existing code is CommonJS (`require`/`exports`) — match it. New modules should use ESM with CJS interop (see `@haraka/email-address`).
- Add `node:` prefixes to built-in requires in any file you touch (`require('fs')` → `require('node:fs')`).
- Prefer: promise APIs (`fs/promises`), `for...of`/`for...in` over `forEach`, `node:readline` for line parsing, template literals over concatenation, `true`/`false` over `1`/`0`, and guard-style early returns.
- Remove commented-out code (it lives in git history). `npm run qlty` must pass without warnings.

## Concision

- Don't Repeat Yourself: Say each thing exactly once, in the place it belongs.
- Sentences: must carry non-obvious facts the reader cannot get from the surroundings.
- Cut scaffolding, keep facts.

Never write these:

- **Announcements.** "One question:", "Two reasons:", "The point is:", "Here's the thing:". Say the thing. If you announce a count, the count must be right — so don't announce one.
- **Justification tails.** A clause after a comma or dash that argues for the clause before it: "…and a guess there is worse than none", "…which is the failure this exists to prevent".
- **The contrast tic.** "X, not Y" and "X rather than Y" where Y is obvious. State X.
- **Clauses doing an adjective's job.** "a setting nobody has written" is "an unwritten setting"; "a copy nobody has opened" is "an unopened copy"; "still has to" is "must". A state with a name takes the name.
- **Closing morals.** A final sentence restating the paragraph's point.

## Comments

- Keep only WHY comments — a hidden constraint, an invariant, a workaround for a specific bug, or an RFC citation that explains otherwise-surprising behavior.
- Delete WHAT comments that restate the code.
- When a rename makes a comment redundant, delete it.
- Never narrate history or audit findings.
- Never count the code — counts rot.
- Prefer self-documenting code: a better name beats any comment.

## Haraka plugins

- Full hook/API reference: `docs/Plugins.md` in the `Haraka` core repo.
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
- Haraka core repo only: `./run_tests [test/plugins/foo.js]`.
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
