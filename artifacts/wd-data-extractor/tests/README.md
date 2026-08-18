# Tests — Parser Verification Suite

This folder contains automated tests for the data extraction parsers used by
the WD Data Extractor app. The tests are completely isolated from the
production build and are never deployed to the VPS.

## Quick start

From `artifacts/wd-data-extractor/`:

```bash
# Run all tests once
corepack pnpm test

# Run tests in watch mode (re-runs on file change)
corepack pnpm test:watch

# Open the Vitest UI in the browser
corepack pnpm test:ui
```

## What is tested

| Parser file | Test file | What it verifies |
| ----------- | --------- | ---------------- |
| `src/pages/GigaCopyDpHoki.tsx` (`parseGigaCopyDpHoki`) | `parseGigaCopyDpHoki.test.ts` | QRISHOKI panel text → row extraction |

More parser tests will be added once the team is comfortable with the workflow.

## Why these tests are safe to add

1. **Production code is not touched.** Every test only *imports* parser
   functions from `src/pages/*`. The source files themselves are not edited.
2. **Tests are excluded from the production build.** `tsconfig.json` excludes
   `**/*.test.ts`, and `vite.config.ts` only bundles files referenced by
   `src/main.tsx`. Tests are picked up exclusively by Vitest.
3. **Tests are excluded from the deploy archive.** The deploy script tars the
   `dist/public/` folder — the `tests/` directory is never included.
4. **You can delete this folder anytime.** Removing `tests/` and the four
   `package.json` script entries returns the project to its pre-test state
   with zero side effects.

## How tests are organized

Each test file follows this structure:

```
describe('<parser name>', () => {
  describe('happy path', () => {
    it('parses a single confirmed transaction', () => { ... });
    it('parses multiple transactions in one paste', () => { ... });
  });

  describe('gatekeepers', () => {
    it('skips Rejected transactions', () => { ... });
    it('skips rows without the required keyword', () => { ... });
  });

  describe('edge cases', () => {
    it('handles empty input', () => { ... });
    it('handles malformed text without throwing', () => { ... });
  });
});
```

Tests use the parser's exported sample text and real-world fixtures captured
from production traffic to verify behavior.
