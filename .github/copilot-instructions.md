## Principles

- Single Responsibility Principle (SRP): Each function, class, or module should have one distinct responsibility and a single reason to change. Avoid creating monolithic entities that handle too many concerns.
- DRY (Don't Repeat Yourself): Strive to eliminate redundancy. Abstract common logic, patterns, or values into reusable functions, modules, components, or variables.
- Code Quality & Maintainability: Consistently write code that is clean, readable, extensible, and maintainable. Apply SOLID principles where appropriate to foster a robust and adaptable codebase.
- Modularity & Composability: Design code in a modular fashion. Break down complex problems and logic into smaller, self-contained, reusable, and independently testable units (functions, components, modules).

## Build Commands
- `npm run test` - Run all tests
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Fix formatting issues (prettier)

## Code Style
- prefer ESNext (ES6+) features and syntax

## Workflow
- Run `npm run test && npm run format` after making changes
- Commit messages follow conventional commits format
- Create feature branches from `master`
