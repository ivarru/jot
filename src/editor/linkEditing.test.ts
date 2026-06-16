import {
  applyLinkEdit,
  createLinkEditDraft,
  parseClipboardLinkData,
  parseClipboardLinkSuggestion,
  parseShareTargetLinkData,
  suggestedLinkText
} from "./linkEditing";

describe("link editing", () => {
  it("picks up a raw URL under the cursor", () => {
    const markdown = "Read https://example.com/docs/sync-model today";
    const draft = createLinkEditDraft(markdown, { start: markdown.indexOf("example"), end: markdown.indexOf("example") });

    expect(draft.target.kind).toBe("raw-url");
    expect(draft.url).toBe("https://example.com/docs/sync-model");
    expect(draft.text).toBe("sync-model (example.com)");

    expect(applyLinkEdit(markdown, draft.target, "Sync model", draft.url)).toEqual({
      markdown: "Read [Sync model](<https://example.com/docs/sync-model>) today",
      selection: { start: "Read [".length, end: "Read [Sync model".length }
    });
  });

  it("edits an existing link without automatically applying a clipboard URL", () => {
    const markdown = "Read [old text](<https://example.com/old>) today";
    const clipboard = { url: "https://example.com/new", text: null };
    const draft = createLinkEditDraft(markdown, { start: markdown.indexOf("old text"), end: markdown.indexOf("old text") }, clipboard);

    expect(draft.target.kind).toBe("existing-link");
    expect(draft.text).toBe("old text");
    expect(draft.url).toBe("https://example.com/old");
    expect(draft.clipboardLink).toBe(clipboard);
  });

  it("uses a readable default label for an existing autolink", () => {
    const markdown = "Read <https://example.com/docs/sync-model> today";
    const draft = createLinkEditDraft(markdown, { start: markdown.indexOf("example"), end: markdown.indexOf("example") });

    expect(draft.target.kind).toBe("existing-link");
    expect(draft.text).toBe("sync-model (example.com)");
    expect(draft.url).toBe("https://example.com/docs/sync-model");
  });

  it("uses selected text with a clipboard URL for a new link", () => {
    const markdown = "Read selected text today";
    const draft = createLinkEditDraft(
      markdown,
      { start: "Read ".length, end: "Read selected text".length },
      { url: "https://example.com/target", text: null }
    );

    expect(draft.target.kind).toBe("selection");
    expect(draft.text).toBe("selected text");
    expect(draft.url).toBe("https://example.com/target");
  });

  it("extracts a copied HTML anchor", () => {
    expect(parseClipboardLinkData({
      html: '<a href="https://example.com/page">Example page</a>',
      text: "Example page"
    })).toEqual({
      url: "https://example.com/page",
      text: "Example page"
    });
  });

  it("extracts a raw clipboard URL", () => {
    expect(parseClipboardLinkData({
      html: "",
      text: "https://example.com/page"
    })).toEqual({
      url: "https://example.com/page",
      text: null
    });
  });

  it("extracts clipboard text with an embedded URL", () => {
    expect(parseClipboardLinkSuggestion({
      html: "",
      text: "Example page https://example.com/page"
    })).toEqual({
      url: "https://example.com/page",
      text: "Example page"
    });
  });

  it("does not leave URL punctuation in clipboard link text", () => {
    expect(parseClipboardLinkSuggestion({
      html: "",
      text: "Example page https://example.com/page."
    })).toEqual({
      url: "https://example.com/page",
      text: "Example page"
    });
  });

  it("keeps clipboard text even when no URL is present", () => {
    expect(parseClipboardLinkSuggestion({
      html: "",
      text: "Example page"
    })).toEqual({
      url: null,
      text: "Example page"
    });
    expect(parseClipboardLinkData({
      html: "",
      text: "Example page"
    })).toBeNull();
  });

  it("extracts Android share target fields", () => {
    const params = new URLSearchParams({
      title: "Page title",
      text: "ignored description",
      url: "https://example.com/page"
    });

    expect(parseShareTargetLinkData(params)).toEqual({
      url: "https://example.com/page",
      text: "Page title"
    });
  });

  it("falls back from share text to the first URL", () => {
    const params = new URLSearchParams({
      text: "Page title https://example.com/page"
    });

    expect(parseShareTargetLinkData(params)).toEqual({
      url: "https://example.com/page",
      text: "Page title"
    });
  });

  it("does not leave URL punctuation in share target fallback text", () => {
    const params = new URLSearchParams({
      text: "Page title https://example.com/page."
    });

    expect(parseShareTargetLinkData(params)).toEqual({
      url: "https://example.com/page",
      text: "Page title"
    });
  });

  it("combines URL slugs with the domain for suggested text", () => {
    expect(suggestedLinkText("https://example.com/a%20page")).toBe("a page (example.com)");
    expect(suggestedLinkText("https://example.com/")).toBe("example.com");
  });

  it("does not append an empty host for supported hostless URL schemes", () => {
    expect(suggestedLinkText("mailto:user@example.com")).toBe("user@example.com");
    expect(suggestedLinkText("tel:+4712345678")).toBe("+4712345678");
  });
});
