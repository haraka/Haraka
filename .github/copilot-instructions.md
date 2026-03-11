## Principles

- Single Responsibility Principle (SRP): Each function, class, or module should have one distinct responsibility and a single reason to change. Avoid creating monolithic entities that handle too many concerns.
- DRY (Don't Repeat Yourself): Strive to eliminate redundancy. Abstract common logic, patterns, or values into reusable functions, modules, components, or variables.
- Code Quality & Maintainability: Consistently write code that is clean, readable, extensible, and maintainable. Apply SOLID principles where appropriate to foster a robust and adaptable codebase.
- Modularity & Composability: Design code in a modular fashion. Break down complex problems and logic into smaller, self-contained, reusable, and independently testable units (functions, components, modules).

## Code Style
- prefer ESNext (ES6+) features and syntax
- prettier
- `true`/`false` instead of `1`/`0`
- Prefer template literals over string concatenation
- Remove commented-out code; it lives in git history
- When updating files, add `node:` prefixes to any Node.js built-in `require()` calls that lack them (e.g. `require('fs')` → `require('node:fs')`)

# Test
- `npm test`                          # run all tests
./run_tests                           # Same as npm test
./run_tests test/plugins/bounce.js    # Single test file

# Lint & format
npm run lint                          # ESLint check
npm run lint:fix                      # Auto-fix lint issues
npm run prettier                      # Check formatting
npm run prettier:fix                  # Auto-format
npm run format                        # prettier:fix + lint:fix (run before committing)

# Dependency version management
npm run versions                      # Check for version drift
npm run versions:fix                  # Update versions

## Workflow
- Run `npm run test && npm run format` after making changes
- Commit messages follow conventional commits format
- Create feature branches from `master`
