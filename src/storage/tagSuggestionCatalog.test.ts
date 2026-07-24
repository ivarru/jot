import { TagSuggestionCatalog } from "./tagSuggestionCatalog";

describe("TagSuggestionCatalog", () => {
  beforeEach(() => localStorage.clear());

  it("remembers used and encountered tags across catalog instances", () => {
    const catalog = new TagSuggestionCatalog(localStorage);
    catalog.recordExisting(["research", "project-alpha"]);
    catalog.recordUse("follow-up");

    expect(catalog.suggestions()).toEqual(["follow-up", "research", "project-alpha"]);
    expect(new TagSuggestionCatalog(localStorage).suggestions()).toEqual([
      "follow-up",
      "research",
      "project-alpha"
    ]);
  });

  it("hides a removed suggestion without changing or immediately rediscovering existing note tags", () => {
    const catalog = new TagSuggestionCatalog(localStorage);
    catalog.recordExisting(["mistake"]);
    catalog.dismiss("mistake");
    catalog.recordExisting(["mistake"]);

    expect(catalog.suggestions()).toEqual([]);
  });

  it("restores a dismissed suggestion when the tag is deliberately used again", () => {
    const catalog = new TagSuggestionCatalog(localStorage);
    catalog.recordExisting(["mistake"]);
    catalog.dismiss("mistake");
    catalog.recordUse("mistake");

    expect(catalog.suggestions()).toEqual(["mistake"]);
  });

  it("ignores malformed stored data", () => {
    localStorage.setItem("jot.tagSuggestions.v1", "{broken");
    expect(new TagSuggestionCatalog(localStorage).suggestions()).toEqual([]);
  });

  it("clears persisted and in-memory suggestions for sign-out", () => {
    const catalog = new TagSuggestionCatalog(localStorage);
    catalog.recordUse("private-project");
    catalog.dismiss("mistake");

    catalog.clear();

    expect(catalog.suggestions()).toEqual([]);
    expect(localStorage.getItem("jot.tagSuggestions.v1")).toBeNull();
    expect(new TagSuggestionCatalog(localStorage).suggestions()).toEqual([]);
  });
});
