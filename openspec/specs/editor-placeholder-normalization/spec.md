# Editor Placeholder Normalization Specification

## Purpose

Keeps a user's active empty paragraph or list item editable while Jot canonicalizes all other eligible editor placeholders
and persists placeholder-free Daily Note Markdown.

## Requirements

### Requirement: Preserve the active empty editor line during normalization

When empty-editor-placeholder normalization is enabled and an editor has a collapsed caret inside an otherwise eligible
empty paragraph or list item, Jot SHALL retain that line in the live editor across autosave, blur save, foreground save,
and sync completion. The caret SHALL remain on the retained line and the editor SHALL remain editable.

#### Scenario: Pause in a new empty list item
- **WHEN** a user creates a new list item, leaves the caret in it, and waits for synchronization before typing
- **THEN** the empty list item remains available for typing and the caret remains in that item

#### Scenario: Pause in a new empty paragraph
- **WHEN** a user creates a new paragraph, leaves the caret in it, and waits for synchronization before typing
- **THEN** the empty paragraph remains available for typing and the caret remains in that paragraph

### Requirement: Canonicalize non-active eligible placeholders in the live editor

When empty-editor-placeholder normalization is enabled, Jot SHALL remove or convert every eligible placeholder line
other than the line containing the collapsed caret from the live editor. It SHALL continue to exclude literal
placeholder-looking content inside fenced code, indented code, and raw HTML blocks from normalization.

#### Scenario: Preserve one active item while removing another
- **WHEN** an editor contains multiple eligible empty placeholders and the caret is in one of them during normalization
- **THEN** Jot retains the caret line and canonicalizes the other eligible placeholder lines without moving the caret
away from the retained line

#### Scenario: Protect raw HTML when the caret is on its opening line
- **WHEN** the caret is on the opening line of a raw HTML block, such as `<pre>`, during normalization
- **THEN** Jot continues tracking that block and preserves literal `<br />` and `* <br />` lines inside it while
canonicalizing eligible placeholder lines outside the block

### Requirement: Persist canonical Daily Note Markdown

When empty-editor-placeholder normalization is enabled, Jot SHALL persist and synchronize fully canonical Markdown to
Local Drafts and Google Drive, including removal of the active line's placeholder. A completed sync SHALL NOT use that
canonical persisted representation to erase the retained live caret line.

#### Scenario: Sync an active empty item
- **WHEN** synchronization completes while the caret remains in an empty list item
- **THEN** the Local Draft and Google Drive content omit the empty item while the live editor retains it

#### Scenario: Type after a canonical sync
- **WHEN** a user types into a retained empty line after its placeholder-free snapshot has synchronized
- **THEN** the typed content is retained in order and synchronizes as normal content

#### Scenario: Refresh an unchanged canonical note while retaining a caret line
- **WHEN** polling refreshes a note whose remote canonical Markdown equals the acknowledged persistence snapshot while
  the live editor retains its active empty line
- **THEN** Jot keeps the live line, remains eligible for later remote refreshes, and does not replace the editor

#### Scenario: Autosave after date navigation
- **WHEN** date A has a pending autosave and the user navigates to date B before its debounce expires
- **THEN** the timer uses its captured date-A canonical snapshot and never infers or saves date B

### Requirement: Respect the normalization preference

When empty-editor-placeholder normalization is disabled, Jot SHALL preserve existing live-editor and persisted-Markdown
behavior without applying active-line or non-active-line placeholder normalization.

#### Scenario: Disable normalization
- **WHEN** a user disables empty-editor-placeholder normalization and synchronizes a note containing placeholders
- **THEN** Jot does not selectively remove placeholders from the live editor or canonicalize them for persistence

#### Scenario: Autosave with normalization disabled
- **WHEN** a user leaves active and non-active eligible placeholder lines in a note while normalization is disabled and
  autosave completes
- **THEN** the live editor, Local Draft, and Google Drive retain those placeholder lines unchanged

#### Scenario: Sync completion with normalization disabled
- **WHEN** synchronization completes for a note containing placeholders while normalization is disabled
- **THEN** Jot does not apply active-caret protection or selective live normalization and does not replace the raw
  placeholder Markdown with a canonical representation
