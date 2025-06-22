# AgentAuth Tests

This directory contains end-to-end integration tests for AgentAuth.

## What's Here

- **`e2e/`** - End-to-end tests that verify complete authentication flows between AgentAuth packages

## Quick Start

```bash
# From repository root
pnpm install
pnpm run build

# Run e2e tests
cd tests/e2e
pnpm test
```

## Test Types

### End-to-End Tests (`e2e/`)
- Full integration testing of AgentAuth flow
- Tests interaction between `@agentauth/mcp` → `@agentauth/sdk`
- Verifies complete authentication lifecycle
- Uses real CLI commands and server instances

### Unit Tests
Unit tests for individual packages are located in each package's `src/` directory:
- `packages/agentauth-core/src/` - Core cryptographic functions
- `packages/agentauth-sdk/src/` - Server SDK verification
- `packages/agentauth-mcp/src/` - CLI functionality

## Running All Tests

From the repository root:

```bash
# Build all packages first
pnpm install
pnpm run build

# Run all unit tests
pnpm test

# Run e2e tests separately
cd tests/e2e && pnpm test
```

## 📖 Comprehensive Testing Guide

For detailed information about testing AgentAuth, including:
- Anti-hanging best practices
- Manual testing procedures
- Debugging failed tests
- Test maintenance guidelines

**→ See [TESTING.md](../TESTING.md) in the repository root**

## Development Notes

- These tests are **not published** to npm
- They exist only in the GitHub repository
- Used for development verification and CI/CD
- Run tests before submitting pull requests

## Quick Tips

✅ **DO**: Use `npm test` or `npx vitest run` for single test runs  
❌ **DON'T**: Use `npx vitest` without `run` (enters watch mode and can hang)

For more testing best practices, see the [Testing Guide](../TESTING.md).