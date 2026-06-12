This document provides foundational mandates and expert guidance. These instructions take precedence over general workflows.

## Technical Standards

- Consistency: Compatibiilty is important, only break it for Good Cause.
- Research: Identify the relevant RFC(s). Analyze existing implementation and verify conformance.
- JS features: this project targets LTS versions of Node.js and/or modern web browsers.
  - ES2024 features should be preferred over legacy patterns.
  - When updating files, add `node:` prefixes to any Node.js built-in `require()` calls that lack them (e.g. `require('fs')` → `require('node:fs')`)
- Use Conventional Commit format for all commit messages.
- Prefer for..(of|in) iterators over forEach
- Prefer node:readline for parsing files into lines

## Testing

- Empirical Reproduction: For bug fixes, first create a failing test case in the corresponding test file.
- Coverage: Every new feature MUST have a corresponding test file with high coverage.
- Linting & Formatting: Adhere to the project's `eslint` and `prettier` configurations.
- Migrate existing tests from mocha to `node --test`
- when loading node:assert, load it as node:assert/strict

## Tooling Commands

```bash
# Test
npm run test                          # Run full test suite
npm run test:coverage                 # Run tests with coverage
node --test test/path/to/file.js      # Run a single test file (node:test packages)

# Lint & Format
npm run lint                          # Check for linting errors.
npm run lint:fix                      # Auto-fix lint issues
npm run prettier                      # Check formatting
npm run prettier:fix                  # Auto-format
npm run format                        # prettier:fix + lint:fix (run before committing)

# Dependency version management
npm run versions                      # Check for version drift
npm run versions:fix                  # Update versions
```
