## Why

The placeholder normalization introduced in 419d3f9 lets a completed save replace a freshly created, empty paragraph
or list item. This makes ordinary pause-and-type editing unreliable: the user must type before autosave rather than
being able to leave the caret on a new line.

## What Changes

- Keep the live editor's current caret line intact when it is an otherwise-normalizable empty paragraph or list item.
- Continue normalizing every other eligible placeholder line in the live editor when the existing normalization setting
  is enabled.
- Continue writing canonical placeholder-free Markdown to Local Drafts and Google Drive.
- Ensure sync completion updates replication state without replacing the protected live caret line.
- Keep a selectively normalized live document eligible for clean remote refresh when its canonical snapshot is already
  acknowledged, without erasing the retained caret line for an unchanged remote result.
- Capture the explicit Daily Note date and canonical snapshot before autosave debounce timers cross an asynchronous
  boundary.
- Add focused editor, sync, and browser regressions for pausing on an empty paragraph or list item before typing.

## Capabilities

### New Capabilities

- `editor-placeholder-normalization`: Context-sensitive normalization that preserves the active empty editor line while
  canonicalizing all other eligible placeholder lines.

### Modified Capabilities

- None.

## Impact

- Affects daily-note Markdown normalization, editor selection handling, date-bound editor/sync result application,
  autosave scheduling, and local-draft/Drive replication.
- No public API, storage schema, or Drive file-format change is expected; canonical saved Markdown remains unchanged.
