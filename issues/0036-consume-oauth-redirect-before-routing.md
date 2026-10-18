---
id: "0036"
title: "Consume OAuth redirect tokens before initializing the date route"
status: closed
type: bug
priority: high
created: "2026-10-18"
labels: [auth, security, browser]
---

# Consume OAuth redirect tokens before initializing the date route

## Problem and evidence

The browser compatibility checks for [#0035](0035-enforce-browser-security-policy.md) reproduced a pre-existing failure
in the blocked-popup OAuth fallback. On return from Google, `Home` calls `routeFromHash` before consuming the OAuth
fragment. Routing replaces the token and state with today's date, preventing authentication and losing the original date.

## Outcome and scope

Consume and validate the existing redirect result before interpreting its restored date route. Preserve the existing
state validation and account verification gate. No provider configuration or external account changes.

## Acceptance criteria

- [x] A synthetic Google redirect signs in and restores the explicitly requested date without leaving token fragments.
- [x] Navigation to date B during pending verification for a redirect to date A remains on date B.
- [x] Regression fails before the production fix; routine verification and Chrome regressions pass afterward.

## Verification

Use the actual browser redirect through a mocked Google endpoint and the real token provider. This startup ordering bug
is outside the bounded Daily Note Replication model; its closest regression is the full browser authentication workflow.

## Resolution

Moved initial date-route parsing after redirect consumption. Both named Chrome regressions failed before the fix
and pass afterward, including an A→B navigation while account verification is pending. Routine unit/type/build
verification passed. Google endpoints and tokens were synthetic; no live account or deployment was used.
