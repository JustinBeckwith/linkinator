# Agent Guide for Linkinator

This document provides guidance for AI coding assistants (Claude, GitHub Copilot, etc.) and developers working on linkinator. It documents architectural decisions, common pitfalls, and important considerations to prevent regressions.

## Table of Contents

1. [Build & Package Structure](#build--package-structure)
2. [Dual Runtime Targets](#dual-runtime-targets)
3. [Critical Files & Dependencies](#critical-files--dependencies)
4. [Common Pitfalls](#common-pitfalls)
5. [Testing Requirements](#testing-requirements)
6. [Release Process](#release-process)

---

## Build & Package Structure

### Directory Layout

```
linkinator/
├── src/              # TypeScript source files
│   ├── cli.ts       # CLI entry point
│   ├── index.ts     # Library entry point
│   └── ...
├── build/           # Compiled JavaScript output (gitignored)
│   ├── package.json # AUTO-GENERATED copy from root
│   ├── src/
│   │   ├── cli.js   # Compiled CLI
│   │   └── ...
│   └── test/
├── package.json     # Root package metadata
└── test/            # Test files
```

### TypeScript Compilation

The project uses TypeScript with these key settings (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "build",
    "resolveJsonModule": true  // ⚠️ IMPORTANT: Copies JSON imports to build/
  }
}
```

**Important**: When TypeScript sees `import foo from './bar.json'`, it:
1. Copies `bar.json` to the build directory (maintaining relative structure)
2. Generates a `.d.ts` declaration file for type safety

### NPM Package Contents

The `files` array in `package.json` controls what gets published to npm:

```json
{
  "files": [
    "build/src",           // All compiled source
    "build/package.json"   // REQUIRED for CLI version info
  ]
}
```

**⚠️ CRITICAL**: The npm package does NOT include:
- Root `package.json`
- `build/test/` directory
- Any files outside `build/src/` and `build/package.json`

---

## Dual Runtime Targets

Linkinator supports **two distinct runtime environments**:

### 1. NPM Package (Node.js)

```bash
npm install linkinator
linkinator ./docs
```

**How it works**:
- User installs via npm
- Gets contents specified in `files` array
- Runs `node_modules/linkinator/build/src/cli.js`
- Imports resolve to files in `node_modules/linkinator/`

### 2. Compiled Binaries (Standalone Executables)

```bash
./linkinator-linux ./docs
```

**How it works**:
- Created via `bun build --compile`
- Bundles all JavaScript and dependencies into a single executable
- No access to filesystem for imports (everything is embedded)
- Uses embedded JSON imports from build time

---

## Critical Files & Dependencies

### CLI Version Information

**File**: `src/cli.ts:6`

```typescript
import packageJson from '../package.json' with { type: 'json' };
```

**Why this exists**:
- Originally added in #760 to fix `--version` flag in compiled binaries
- Before this, meow tried to read package.json at runtime, which failed in binaries

**How it works**:
1. **During build**: TypeScript copies `package.json` → `build/package.json`
2. **Compiled to**: `import packageJson from '../package.json'` (relative path unchanged)
3. **At runtime** (npm): `build/src/cli.js` imports `build/package.json` ✅
4. **At compile time** (binaries): Bundler embeds the JSON content ✅

**⚠️ CRITICAL REQUIREMENT**:
- `build/package.json` MUST be included in the npm package
- Without it, npm users get: `Cannot find module '/node_modules/linkinator/build/package.json'`
- This caused issue #763

### Package File Checklist

When modifying packaging, verify:
- [ ] `"build/package.json"` is in the `files` array
- [ ] The import path in `cli.ts` is `../package.json` (not `../../`)
- [ ] `tsconfig.json` has `resolveJsonModule: true`
- [ ] `npm pack --dry-run` includes `build/package.json`

---

## Common Pitfalls

### 🚨 Pitfall 1: Removing `build/package.json` from `files` Array

**What happens**: NPM users can't run the CLI
**Error**: `Cannot find module '/node_modules/linkinator/build/package.json'`
**Why**: The CLI imports from `../package.json` relative to `build/src/cli.js`
**How to avoid**: Never remove `build/package.json` from the `files` array without changing how the CLI gets version info

### 🚨 Pitfall 2: Changing the Import Path to `../../package.json`

**What happens**: Works for npm, breaks for compiled binaries
**Why**:
- From `src/cli.ts`, `../../package.json` would look outside the project
- TypeScript won't copy a file from outside the project
- Compiled binaries won't have the package.json embedded
**How to avoid**: Always import from `../package.json` (one level up from src/)

### 🚨 Pitfall 3: Version Drift Between Root and Build

**What happens**: `--version` shows wrong version
**Why**:
- Someone edited `package.json` without rebuilding
- `build/package.json` has stale version
**How to avoid**:
- Always run `npm run build` after version changes
- The release workflow rebuilds automatically
- Test `test.cli.ts` verifies version consistency

### 🚨 Pitfall 4: Adding JSON Imports Without Updating `files` Array

**Scenario**: You add `import config from '../config.json'` in the CLI
**What happens**:
1. TypeScript copies it to `build/config.json` ✅
2. Works locally ✅
3. NPM package doesn't include `build/config.json` ❌
4. NPM users get import error ❌

**How to avoid**: When adding new JSON imports used by the CLI:
1. Add the file to the `files` array: `"build/config.json"`
2. Test with `npm pack --dry-run`
3. Verify the file is listed in the tarball contents

### 🚨 Pitfall 5: Forgetting About Compiled Binaries

**Scenario**: You use runtime file system access:
```typescript
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
```

**What happens**:
- Works for npm ✅
- Breaks in compiled binaries ❌ (no filesystem)

**How to avoid**:
- Use static imports for data needed in both environments
- Test changes with `npm run build-binaries`
- Run the binary and verify it works

---

## Testing Requirements

### Minimum Tests for Packaging Changes

If you modify:
- `package.json` `files` array
- Imports in `cli.ts`
- Build configuration (`tsconfig.json`)
- Package metadata

**You must verify**:

1. **All tests pass**: `npm test`
2. **Version consistency test passes**: Ensures `build/package.json` matches root
3. **NPM package contents**: `npm pack --dry-run | grep build/`
4. **Compiled binary works**:
   ```bash
   npm run build-binaries
   ./build/binaries/linkinator-macos --version
   ```
5. **Local CLI works**: `node build/src/cli.js --version`

### Test Structure

- `test/test.cli.ts` - CLI behavior, version flag, packaging
- `test/test.index.ts` - Core library functionality
- `test/test.*.ts` - Feature-specific tests

### Key Test: Version Consistency

**File**: `test/test.cli.ts:65-80`

```typescript
it('should have build/package.json with matching version', () => {
  const rootPkg = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const buildPkg = JSON.parse(
    fs.readFileSync(new URL('../build/package.json', import.meta.url), 'utf8'),
  );
  assert.strictEqual(
    buildPkg.version,
    rootPkg.version,
    'build/package.json version should match root package.json version',
  );
});
```

This test catches stale builds after version bumps.

---

## Release Process

### Automated Release Workflow

**File**: `.github/workflows/release.yaml`

The workflow:
1. **release-please**: Creates release PR with version bumps
2. **publish job** (when PR merged):
   ```yaml
   - run: npm ci          # Installs deps, runs prepare hook
   - run: npm run build   # Explicit rebuild (ensure fresh build)
   - run: npm publish     # Publishes to npm
   - run: npm run build-binaries  # Creates platform binaries
   - run: gh release upload ...   # Uploads binaries to GitHub release
   ```

### Version Bump Process

1. Release-please creates PR with version change
2. Merging PR triggers publish workflow
3. Workflow rebuilds from scratch
4. Publishes with fresh `build/package.json` matching root version

**⚠️ Important**:
- Don't manually publish without rebuilding
- Don't edit version in `build/package.json` directly (auto-generated)
- Trust the CI/CD process - it rebuilds correctly

### Manual Publishing (Emergency Only)

If you must publish manually:

```bash
# 1. Ensure clean state
git status  # Should be clean

# 2. Bump version
npm version patch|minor|major

# 3. MUST rebuild
npm run build

# 4. Verify package contents
npm pack --dry-run | grep build/package.json

# 5. Publish
npm publish

# 6. Build and upload binaries
npm run build-binaries
gh release upload <tag> build/binaries/*
```

---

## Architecture Decision Records

### ADR 1: Why `build/package.json` is in the npm package

**Context**: CLI needs to display version via `--version` flag in both npm and binary distributions.

**Decision**: Include `build/package.json` in npm packages and import it in CLI.

**Alternatives considered**:
1. ❌ Use `import.meta.url` to read at runtime - doesn't work in binaries
2. ❌ Generate `version.ts` file - extra build complexity
3. ❌ Use bundler for constant injection - requires switching from `tsc`
4. ✅ Import JSON and include in package - simple, works everywhere

**Consequences**:
- ✅ Works for npm and compiled binaries
- ✅ Minimal code changes
- ⚠️ Adds 2.5kB to package (duplicate package.json)
- ⚠️ Must keep `files` array in sync

**References**: #759, #760, #763

### ADR 2: Why We Support Both NPM and Compiled Binaries

**Context**: Users want both:
- Easy npm installation for Node.js projects
- Standalone binaries for CI/CD and non-Node environments

**Decision**: Maintain both distribution methods.

**Consequences**:
- Must test both environments
- Can't use npm-only features (like reading node_modules at runtime)
- Import statements must work when bundled
- Adds complexity to CI/CD

---

## Quick Reference

### Common Commands

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Test CLI locally
node build/src/cli.js <args>

# Check package contents
npm pack --dry-run

# Build platform binaries
npm run build-binaries

# Test binary
./build/binaries/linkinator-macos --version
```

### Files to Check When Modifying Packaging

- [ ] `package.json` - `files` array, `bin` entry
- [ ] `tsconfig.json` - `rootDir`, `outDir`, `resolveJsonModule`
- [ ] `src/cli.ts` - Import paths for JSON
- [ ] `test/test.cli.ts` - Add tests for new imports
- [ ] `.github/workflows/release.yaml` - CI/CD build steps

### Red Flags 🚩

Watch out for these in code reviews:

- ❌ Removing items from `files` array without testing npm pack
- ❌ Adding JSON imports without updating `files` array
- ❌ Using `fs.readFileSync()` in code that runs in binaries
- ❌ Changing import paths without testing both npm and binaries
- ❌ Modifying `build/` directory manually (it's auto-generated)
- ❌ Committing `build/` directory to git (it's gitignored for a reason)

---

## Historical Context

### Issue Timeline

- **#759** (Dec 2024): `--version` flag didn't work in compiled binaries
- **#760** (Dec 2024): Added `import packageJson` to fix binaries
  - ⚠️ Regression: Broke npm installs (missing build/package.json)
- **#763** (Dec 2024): Users reported "Cannot find module" error
- **#764** (Dec 2024): Added `build/package.json` to `files` array

### Lessons Learned

1. **Test both distribution methods**: npm install AND compiled binaries
2. **Verify npm package contents**: Use `npm pack --dry-run`
3. **Understand TypeScript JSON handling**: `resolveJsonModule` copies files
4. **Document architectural decisions**: Hence this file!

---

## Getting Help

If you're unsure about a change:

1. **Read this file** - especially Common Pitfalls
2. **Test locally**: `npm run build && npm test`
3. **Check package**: `npm pack --dry-run`
4. **Test binary**: `npm run build-binaries && ./build/binaries/linkinator-macos --version`
5. **Ask in PR**: Tag maintainers if uncertain

Remember: It's better to ask than to introduce a regression! 🙂

---

**Last Updated**: 2025-12-27
**Maintainer**: @JustinBeckwith
**Contributors**: Claude (learned the hard way 😅)
