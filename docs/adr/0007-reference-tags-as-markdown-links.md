# Reference Tags as Markdown Links

Status: Accepted

## Context

Daily Notes need durable tags for sections, paragraphs, and list items. The representation must survive Milkdown
round-trips, remain readable outside Jot, and preserve the plain Markdown source model.

Bare hashtags are simple to type but ambiguous in prose and provide no Markdown structure for reliable extraction.
Front matter centralizes metadata but cannot identify individual paragraphs or list items without a second addressing
scheme. A custom inline node would weaken portability and require every Markdown consumer to understand Jot syntax.

## Decision

Represent a tag as an ordinary Markdown link whose destination is `jot:tag/<canonical-name>`, conventionally displayed
as `#<canonical-name>`. A trailing tag link applies to its paragraph or list item. A `Tags:` paragraph immediately after
a heading applies to that section.

Keep the suggestion catalog as dismissible browser-local convenience state and clear it on sign-out. Daily Note
Markdown remains the durable tag source; removing a catalog suggestion does not rewrite notes.

## Consequences

- Milkdown and external Markdown tools can parse and preserve tags as normal links.
- Jot can style and extract tags by destination without interpreting arbitrary hashtags.
- Section association is a documented structural convention rather than hidden metadata.
- Suggestion history does not automatically follow the user to another browser.
- A future tag index or search feature can derive durable associations from Daily Note Markdown.
