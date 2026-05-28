# Repository Instructions

## Date-Bound Notes

Daily Note content must never be read from or written to a date inferred after an async boundary. When changing editor, sync, autosave, local draft, or date navigation behavior, carry the explicit `IsoDate` and markdown snapshot through timers, promises, and editor callbacks.

Before finishing such changes, add or update regression tests that cover stale date transitions: switching from date A to date B while a load, autosave, blur, or sync operation for date A is still pending.

## Verification

Run these before finishing code changes:

```sh
npm run test
npm run typecheck
npm run build
```

For browser checks of the fake-storage milestone:

```sh
VITE_ENABLE_FAKE_AUTH=true npm run build
npm run preview
```
