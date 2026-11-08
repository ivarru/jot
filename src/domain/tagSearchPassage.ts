import { findTaggableSearchPassage } from "./taggedNoteSearch";
import { jotTagMarkdown, normalizeJotTagName } from "./jotTags";

/** Append only missing tags, preserving every byte outside the explicit insertion point. */
export function tagSearchPassage(source: string, query: string, conditions: readonly string[], names: readonly string[]): string {
  const passage = findTaggableSearchPassage(source, query, conditions);
  if (!passage) throw new Error("No matching paragraph or list item is available to tag. Refresh the passage.");
  const normalized = names.map((name) => normalizeJotTagName(name));
  if (!normalized.length || normalized.some((name) => name === null)) throw new Error("Choose valid tags to add.");
  const missing = [...new Set(normalized as string[])].filter((name) => !passage.effectiveTags.includes(name));
  if (!missing.length) return source;
  return source.slice(0, passage.insertionOffset) + " " + missing.map(jotTagMarkdown).join(" ") + source.slice(passage.insertionOffset);
}
