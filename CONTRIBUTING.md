# Contributing to opencode-antigravity-auth

Thank you for your interest in contributing to `opencode-antigravity-auth`! We welcome bug reports, improvements, documentation updates, and pull requests.

---

## Development Workflow

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [npm](https://www.npmjs.com/) or [bun](https://bun.sh/)
- [OpenCode](https://opencode.ai/) installed locally for integration testing

### Local Setup

1. **Fork and Clone:**
   ```bash
   git clone https://github.com/JoshRob297/opencode-antigravity-auth.git
   cd opencode-antigravity-auth
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Build the Plugin:**
   ```bash
   npm run build
   ```

4. **Run Unit Tests:**
   ```bash
   npm test
   ```

---

## Code Quality & Standards

Before opening a pull request, ensure all checks pass:

- **Type Check & Build**: `npm run build` must complete with zero TypeScript compiler errors.
- **Unit Tests**: `npm test` must run all Vitest test suites (1,000+ tests) with zero failures.
- **Schema Synchronization**: If modifying configuration types in `src/plugin/config/schema.ts`, regenerate the schema via:
  ```bash
  npm run build:schema
  ```

---

## Pull Request Guidelines

1. **Branch Naming**: Use descriptive branch names like `fix/gemini-37-headers`, `feat/new-thinking-tier`, or `docs/update-readme`.
2. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) format (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`).
3. **No Secrets / Credentials**: Never include real OAuth tokens, refresh tokens, or private credentials in code, tests, or commit history.
4. **Scope**: Keep pull requests focused on a single feature or bug fix.

---

## Code of Conduct

Please review and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) in all community interactions.
