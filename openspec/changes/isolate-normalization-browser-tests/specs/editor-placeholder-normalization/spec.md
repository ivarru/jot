## ADDED Requirements

### Requirement: Avoid unrelated live document replacement

When empty-editor-placeholder normalization is enabled, Jot SHALL replace live editor Markdown only when applying the
normalization rules changes the editor's current serialized Markdown. Equivalent serialization differences that are not
normalization results SHALL NOT cause replacement, selection restoration, or focus movement.

#### Scenario: Equivalent editor serialization needs no normalization
- **WHEN** the live editor serializes Markdown differently from the acknowledged application snapshot but contains no
  eligible placeholder change
- **THEN** autosave and synchronization leave the live document, focus, selection, and typed-character order unchanged

#### Scenario: Use an app control after leaving a caret in an empty line
- **WHEN** a user leaves a collapsed caret in an empty paragraph or list item and moves focus to a toolbar or modal
  control before normalization runs
- **THEN** Jot preserves the editing target and uses its insertion anchor for the requested action

#### Scenario: Normalization changes another line
- **WHEN** normalization removes an eligible non-active placeholder while retaining the caret line
- **THEN** Jot applies only that selective normalization and preserves the translated collapsed caret

### Requirement: Invalidate saves superseded by remote refresh

While a clean remote refresh is in flight for a Daily Note, Jot SHALL hold saves captured from that date's pre-refresh
state before they perform remote I/O. When the refresh resolves, Jot SHALL discard superseded snapshots and re-evaluate
the current explicit date and Markdown before deciding whether a save remains necessary. A superseded save SHALL NOT
replace refreshed editor, Local Draft, or remote state.

#### Scenario: Newer remote note supersedes a clean phone cache
- **WHEN** a clean local snapshot containing short Markdown at revision 7 schedules a save and a remote refresh then
  begins loading longer Markdown at revision 8 before that save performs remote I/O
- **THEN** Jot holds the revision-7 save until the refresh applies, discards it, and retains the longer revision-8
  Markdown in the editor, Local Draft, and remote storage

#### Scenario: Refresh is unchanged or fails
- **WHEN** a held save is waiting and the clean refresh finds no newer revision or fails without applying remote content
- **THEN** Jot releases the refresh barrier, re-captures the current explicit snapshot, and saves it only if it remains
  dirty and eligible

#### Scenario: User edits during refresh
- **WHEN** the user edits the same date while a clean refresh and an older held save are pending
- **THEN** Jot preserves the newer edit and evaluates that current snapshot after refresh resolution rather than writing
  the older held Markdown

#### Scenario: Superseded save belongs to another date
- **WHEN** date A has an older scheduled save and the user navigates to date B while a newer remote revision is applied
  to either date
- **THEN** Jot validates each operation against its captured explicit date and generation and never writes A Markdown
  to B or applies an invalidated A result to B

#### Scenario: Current-generation concurrent save conflicts normally
- **WHEN** a current-generation save reaches a remote revision that changed independently
- **THEN** Jot preserves the existing conditional-write and conflict-resolution behavior
