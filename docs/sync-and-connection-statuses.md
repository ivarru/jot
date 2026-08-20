# Sync and Connection Statuses

Jot has two related but independent kinds of state:

- **Connection state** describes whether Google access is available. It is derived from route signals such as
  `authenticated`, `preparingAuth`, `signingIn`, `authReconnectRequired`, and `reconnectingAuth`; there is no single
  `ConnectionStatus` type.
- **Sync status** describes the selected Daily Note's local and remote replication state. It is represented by
  `SyncStatus` and drives the status disk's label and color.

Being connected does not imply that the selected Daily Note is synced. It may still be saved only locally, syncing,
conflicted, or in error.

## Effective Connection State

```mermaid
stateDiagram-v2
  direction LR

  state "Preparing sign-in" as Preparing
  state "Signed out" as SignedOut
  state "Signing in" as SigningIn
  state "Connected" as Connected
  state "Silent renewal" as Renewing
  state "Reconnect required" as ReconnectRequired
  state "Reconnecting" as Reconnecting

  [*] --> Preparing: Google runtime starts
  Preparing --> SignedOut: provider ready or initialization error shown
  SignedOut --> SigningIn: Sign in with Google
  SigningIn --> Connected: access token acquired
  SigningIn --> SignedOut: cancelled or failed

  Connected --> Renewing: three minutes before token expiry
  Renewing --> Connected: pending drafts synced and no-UI renewal succeeds
  Renewing --> ReconnectRequired: no-UI renewal requires interaction
  Connected --> ReconnectRequired: Drive or Photos reports an auth failure

  ReconnectRequired --> Reconnecting: Reconnect
  Reconnecting --> Connected: fresh token acquired and drafts synchronized
  Reconnecting --> ReconnectRequired: reconnect cancelled or failed

  Connected --> SignedOut: Sign out
  ReconnectRequired --> SignedOut: confirmed sign out

  note right of ReconnectRequired
    The modal may be open or postponed.
    Local Draft persistence continues,
    but remote synchronization is blocked.
  end note
```

Silent renewal is an internal transient state rather than a separate user-visible signal. Jot first uses the still-valid
token to synchronize pending drafts. If renewal then fails, it invalidates the cached token and requires an interactive
reconnect. Jot does not currently derive a connection state from `navigator.onLine`; ordinary network failures enter the
sync error path below.

## Selected Daily Note Sync Status

```mermaid
stateDiagram-v2
  direction LR

  state "Local only" as LocalOnly
  state "Saved locally" as SavedLocally
  state "Syncing" as Syncing
  state "Synced" as Synced
  state "Conflict" as Conflict
  state "Sync error" as Error
  state "Auth required" as AuthRequired
  state "Offline (reserved)" as Offline

  [*] --> LocalOnly: route session starts

  LocalOnly --> Synced: Drive refresh establishes a clean remote state
  LocalOnly --> SavedLocally: an edit is persisted as a dirty Local Draft
  LocalOnly --> Syncing: a save starts

  Synced --> Synced: clean polling refresh
  Synced --> SavedLocally: an edit reaches the Local Draft first
  Synced --> Syncing: blur, foreground, manual, or autosave starts

  SavedLocally --> SavedLocally: more edits persist locally
  SavedLocally --> Syncing: autosave, polling, retry, or manual sync

  Syncing --> Synced: Drive accepts the current snapshot
  Syncing --> SavedLocally: a newer edit remains after the request
  Syncing --> Conflict: local and remote edits cannot merge automatically
  Syncing --> Error: a non-authentication operation fails
  Syncing --> AuthRequired: Google access is rejected

  Error --> Syncing: automatic or manual retry
  Error --> SavedLocally: a later edit persists locally

  Conflict --> Syncing: choose a non-manual resolution
  Conflict --> Conflict: choose manual markers for further editing
  Conflict --> Syncing: edited manual markers are saved

  AuthRequired --> Syncing: reconnect succeeds and replication resumes
  AuthRequired --> SavedLocally: editing continues before reconnect

  note right of Offline
    SyncStatus declares this value,
    but current production code does not
    transition into it.
  end note
```

The status disk maps the selected note's `SyncStatus` as follows:

| Disk | Sync statuses | Meaning |
| --- | --- | --- |
| Green | `synced` | The current canonical content and revision have been acknowledged remotely. |
| Yellow | `local-only`, `saved-locally`, `syncing`, `offline` | No immediate conflict is known, but the state is not currently acknowledged as synced. `syncing` pulses. |
| Red | `auth-required`, `conflict`, `error` | User action or recovery is required. |

## Coupling Between the Two State Machines

- Entering **Reconnect required** initially sets the selected note's sync status to `auth-required`.
- The connection flag remains authoritative. If another edit is persisted while reconnect is required, the sync status
  can become `saved-locally`; remote autosave remains blocked and clicking the disk still starts reconnect.
- A successful reconnect clears the connection requirement, refreshes the selected Daily Note, and synchronizes dirty
  drafts for other dates. The resulting sync status depends on those replication results.
- A Sync Conflict is not a connection failure. Jot remains connected, but editing and diagnostics collection pause while
  the conflict decision dialog is open.
- Signing out resets the visible sync status to `local-only` after the user confirms deletion of unsynced local data when
  necessary.

The normative replication guarantees remain in [sync-safety.md](sync-safety.md); the bounded executable model is
described in [sync-model.md](sync-model.md).
