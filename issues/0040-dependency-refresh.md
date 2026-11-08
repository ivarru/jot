---
id: "0040"
title: "Refresh dependencies in verified stages"
status: in-progress
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
- [ ] Milkdown kit/automd updated together and editor regressions checked.
- [ ] Framework/build updates checked for development startup, browser behavior, and Pages artifacts.
- [ ] Supported Node runtime and matching types evaluated and verified.
- [ ] jsdom and fake-indexeddb evaluated independently; retained pins explained with evidence.
- [ ] Final audit and lockfile reviewed; verification evidence recorded; servers stopped.

## Verification

Run `npm run verify` for each retained code/dependency stage, plus focused Chrome checks appropriate to the stage.
Use the full Chrome suite for editor/framework migrations and Pages artifact checks for deployment changes.

## Progress

Stage 1 (0.39.1): security/routine packages updated; audit clear. `npm run verify` passed 879 tests, types, and build;
all 40 focused Chrome startup/math/search/formatting checks passed.
