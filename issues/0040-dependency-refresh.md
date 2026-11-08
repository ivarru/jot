---
id: "0040"
title: "Refresh dependencies in verified stages"
status: closed
type: feature
priority: medium
created: "2026-11-08"
labels: [dependencies, maintenance]
---

# Refresh dependencies in verified stages

## Scope

Update security/routine packages, then Milkdown, then SolidStart/Nitro, then evaluate Node and test-environment
updates separately. Preserve existing editor, storage, sync, auth, and static Pages behavior. Keep each successful
stage independently committed with an app patch bump. Retain deliberate pins if their regression still reproduces.

## Acceptance criteria

- [x] Security and routine dependency updates verified and committed.
- [x] Milkdown kit/automd updated together and editor regressions checked.
- [x] Framework/build updates checked for development startup, browser behavior, and Pages artifacts.
- [x] Supported Node runtime and matching types evaluated and verified.
- [x] jsdom and fake-indexeddb evaluated independently; retained pins explained with evidence.
- [x] Final audit and lockfile reviewed; verification evidence recorded; servers stopped.

## Verification

Run `npm run verify` for each retained code/dependency stage, plus focused Chrome checks appropriate to the stage.
Use the full Chrome suite for editor/framework migrations and Pages artifact checks for deployment changes.

## Progress

Stage 1 (0.39.1): security/routine packages updated; audit clear. `npm run verify` passed 879 tests, types, and build;
all 40 focused Chrome startup/math/search/formatting checks passed.

Stage 2 (0.39.2): Milkdown kit/automd 7.23.0; 879 tests, types, build, and all 210 Chrome regressions passed.

Stage 3 (0.39.3): SolidStart 2.2.2/Nitro 3 RC; reproduced and fixed Seroval SSR externalization mismatch.
879 tests, types/build, all 210 Chrome cases, seven Pages artifact checks, and actual dev startup passed.

Stage 4 (0.39.4): Node 26.13.0 LTS/types 26.6.6, checksum-verified official runtime. Clean install, 879 tests,
types/build, 17 Chrome cases, Pages/seven artifact checks, and actual dev startup passed under Node 26.

Stage 5 (0.39.5): jsdom 31.0.0; all 879 tests, types/build, Pages build, and seven artifact checks passed under
Node 26 without compatibility flags or source changes. fake-indexeddb was evaluated separately below.


Stage 6: fake-indexeddb 6.2.7 reproduced the transaction-queue uncaught exception in the existing six-case IndexedDB
suite. Restored the exact 6.2.5 pin and the 0.39.5 manifest/lockfile; a clean install and the same six cases then
passed without unhandled errors. No application transaction workaround or test suppression was introduced.

Final verification on the restored tree under Node 26: 879 tests, types, and build passed; audit reports zero
vulnerabilities; `npm ls --all` succeeds; only fake-indexeddb remains in direct `npm outdated` output. All stage
commits are independently verified. No local development/test servers remain running. The final pin decision is
pure documentation, requiring no version bump.
