import {
  dailyNoteRelativeSectionHref,
  dailyNoteSectionLinkHref,
  dailyNoteSectionHref,
  extractDailyNoteHeadings,
  findDailyNoteHeadingBySlug,
  insertMarkdownLinkAtSelection,
  isSafeExternalHref,
  markdownLinkAtOffset,
  parseDailyNoteLinkTarget,
  selectionOverlapsMarkdownLinkOrCode
} from "./dailyNoteLinks";

describe("Daily Note links", () => {
  it("extracts heading targets with duplicate-safe slugs", () => {
    const markdown = "# Decisions\n\n## Follow up?\n\n## Follow up!\n\n### Café plan";

    expect(extractDailyNoteHeadings(markdown)).toEqual([
      {
        depth: 1,
        text: "Decisions",
        slug: "decisions",
        selection: { start: 2, end: "Decisions".length + 2 }
      },
      {
        depth: 2,
        text: "Follow up?",
        slug: "follow-up",
        selection: { start: markdown.indexOf("Follow up?"), end: markdown.indexOf("Follow up?") + "Follow up?".length }
      },
      {
        depth: 2,
        text: "Follow up!",
        slug: "follow-up-1",
        selection: { start: markdown.indexOf("Follow up!"), end: markdown.indexOf("Follow up!") + "Follow up!".length }
      },
      {
        depth: 3,
        text: "Café plan",
        slug: "cafe-plan",
        selection: { start: markdown.indexOf("Café plan"), end: markdown.indexOf("Café plan") + "Café plan".length }
      }
    ]);
  });

  it("builds and parses Daily Note section hrefs", () => {
    const href = dailyNoteSectionHref("2030-02-02", "cafe-plan");

    expect(href).toBe("#/date/2030-02-02#cafe-plan");
    expect(parseDailyNoteLinkTarget(href)).toEqual({
      date: "2030-02-02",
      headingSlug: "cafe-plan"
    });
    expect(parseDailyNoteLinkTarget("https://jot.local/#/date/2030-02-02#cafe-plan")).toEqual({
      date: "2030-02-02",
      headingSlug: "cafe-plan"
    });
    expect(parseDailyNoteLinkTarget(
      "https://notes.example/#/date/2030-02-02#cafe-plan",
      null,
      "https://notes.example"
    )).toEqual({
      date: "2030-02-02",
      headingSlug: "cafe-plan"
    });
    expect(parseDailyNoteLinkTarget("https://example.com/#/date/2030-02-02#cafe-plan")).toBeNull();
    expect(parseDailyNoteLinkTarget("#/date/not-a-date#cafe-plan")).toBeNull();
  });

  it("builds and parses relative same-note heading hrefs", () => {
    expect(dailyNoteRelativeSectionHref("decisions")).toBe("#decisions");
    expect(dailyNoteSectionLinkHref("2030-02-02", "2030-02-02", "decisions")).toBe("#decisions");
    expect(dailyNoteSectionLinkHref("2030-02-02", "2030-02-01", "decisions")).toBe("#/date/2030-02-01#decisions");
    expect(parseDailyNoteLinkTarget("#decisions", "2030-02-02")).toEqual({
      date: "2030-02-02",
      headingSlug: "decisions"
    });
    expect(parseDailyNoteLinkTarget("#decisions")).toBeNull();
  });

  it("finds a heading by its generated slug", () => {
    expect(findDailyNoteHeadingBySlug("# One\n\n## Two", "two")).toEqual({
      depth: 2,
      text: "Two",
      slug: "two",
      selection: { start: "# One\n\n## ".length, end: "# One\n\n## Two".length }
    });
    expect(findDailyNoteHeadingBySlug("# One", "missing")).toBeNull();
  });

  it("inserts a link at a cursor or selected label", () => {
    expect(insertMarkdownLinkAtSelection("See ", { start: 4, end: 4 }, "Decisions", "#/date/2030-02-01#decisions")).toEqual({
      markdown: "See [Decisions](#/date/2030-02-01#decisions)",
      selection: { start: "See [".length, end: "See [Decisions".length }
    });

    expect(insertMarkdownLinkAtSelection(
      "See that decision",
      { start: "See ".length, end: "See that decision".length },
      "Decisions",
      "#/date/2030-02-01#decisions"
    )).toEqual({
      markdown: "See [that decision](#/date/2030-02-01#decisions)",
      selection: { start: "See [".length, end: "See [that decision".length }
    });
  });

  it("detects Markdown links under a cursor", () => {
    const markdown = "See [that decision](#/date/2030-02-01#decisions) and <https://example.com>.";

    expect(markdownLinkAtOffset(markdown, markdown.indexOf("decision"))).toEqual({
      start: "See ".length,
      end: "See [that decision](#/date/2030-02-01#decisions)".length,
      label: "that decision",
      destination: "#/date/2030-02-01#decisions"
    });
    expect(markdownLinkAtOffset(markdown, markdown.indexOf("example"))).toEqual({
      start: markdown.indexOf("<https"),
      end: markdown.indexOf(">") + 1,
      label: "https://example.com",
      destination: "https://example.com"
    });
  });

  it("detects selections that overlap existing links or code", () => {
    const markdown = [
      "Before [decision](#/date/2030-02-01#decisions) after `code`.",
      "",
      "```ts",
      "const answer = 42;",
      "```"
    ].join("\n");

    expect(selectionOverlapsMarkdownLinkOrCode(markdown, collapsedAt(markdown, "decision"))).toBe(true);
    expect(selectionOverlapsMarkdownLinkOrCode(markdown, range(markdown, "Before", "decision"))).toBe(true);
    expect(selectionOverlapsMarkdownLinkOrCode(markdown, collapsedAt(markdown, "code"))).toBe(true);
    expect(selectionOverlapsMarkdownLinkOrCode(markdown, collapsedAt(markdown, "answer"))).toBe(true);
    expect(selectionOverlapsMarkdownLinkOrCode(markdown, collapsedAt(markdown, "after"))).toBe(false);
    expect(selectionOverlapsMarkdownLinkOrCode(markdown, {
      start: markdown.indexOf("[decision]"),
      end: markdown.indexOf("[decision]")
    })).toBe(false);
  });

  it("classifies safe external hrefs without treating Daily Note links as external", () => {
    expect(isSafeExternalHref("https://example.com")).toBe(true);
    expect(isSafeExternalHref("mailto:hello@example.com")).toBe(true);
    expect(isSafeExternalHref("https://example.com/#/date/2030-02-02#decisions")).toBe(true);
    expect(isSafeExternalHref("relative/page")).toBe(false);
    expect(isSafeExternalHref("#/date/2030-02-02#decisions")).toBe(false);
    expect(isSafeExternalHref("javascript:alert(1)")).toBe(false);
  });
});

function collapsedAt(markdown: string, text: string): { readonly start: number; readonly end: number } {
  const offset = markdown.indexOf(text);
  if (offset === -1) throw new Error(`Text not found: ${text}`);
  return { start: offset, end: offset };
}

function range(
  markdown: string,
  startText: string,
  endText: string
): { readonly start: number; readonly end: number } {
  const start = markdown.indexOf(startText);
  const endStart = markdown.indexOf(endText);
  if (start === -1) throw new Error(`Text not found: ${startText}`);
  if (endStart === -1) throw new Error(`Text not found: ${endText}`);
  return { start, end: endStart + endText.length };
}
