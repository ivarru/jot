import { normalizeJotTagName } from "~/domain/jotTags";

const STORAGE_KEY = "jot.tagSuggestions.v1";

interface StoredTagSuggestions {
  readonly known: readonly string[];
  readonly dismissed: readonly string[];
}

export class TagSuggestionCatalog {
  private known: string[];
  private dismissed: Set<string>;

  constructor(private readonly storage: Storage | null | undefined) {
    const stored = readStoredCatalog(storage);
    this.known = [...stored.known];
    this.dismissed = new Set(stored.dismissed);
  }

  suggestions(): readonly string[] {
    return [...this.known];
  }

  recordExisting(names: readonly string[]): void {
    let changed = false;
    for (const name of names) {
      if (normalizeJotTagName(name) !== name || this.dismissed.has(name) || this.known.includes(name)) continue;
      this.known.push(name);
      changed = true;
    }
    if (changed) this.persist();
  }

  recordUse(name: string): void {
    if (normalizeJotTagName(name) !== name) return;
    this.known = [name, ...this.known.filter((candidate) => candidate !== name)];
    this.dismissed.delete(name);
    this.persist();
  }

  dismiss(name: string): void {
    if (normalizeJotTagName(name) !== name) return;
    this.known = this.known.filter((candidate) => candidate !== name);
    this.dismissed.add(name);
    this.persist();
  }

  clear(): void {
    this.known = [];
    this.dismissed.clear();
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Suggestions are optional; sign-out must continue when browser storage is unavailable.
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({
        known: this.known,
        dismissed: [...this.dismissed]
      }));
    } catch {
      // Suggestions are optional; editing must still work when browser storage is unavailable.
    }
  }
}

function readStoredCatalog(storage: Storage | null | undefined): StoredTagSuggestions {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    if (value === null || value === undefined) return { known: [], dismissed: [] };
    const parsed = JSON.parse(value) as Partial<StoredTagSuggestions>;
    const dismissed = validNames(parsed.dismissed);
    const dismissedSet = new Set(dismissed);
    return {
      known: validNames(parsed.known).filter((name) => !dismissedSet.has(name)),
      dismissed
    };
  } catch {
    return { known: [], dismissed: [] };
  }
}

function validNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && normalizeJotTagName(candidate) === candidate
  )));
}
