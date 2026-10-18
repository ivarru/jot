// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isSafeExternalHref } from "~/domain/dailyNoteLinks";
import { extractJotTags } from "~/domain/jotTags";
import { parseClipboardLinkData } from "./linkEditing";

describe("untrusted link boundaries", () => {
  it.each([
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)",
    "java\nscript:alert(1)", "\u0000javascript:alert(1)", "data:text/html,test",
    "vbscript:msgbox(1)", "file:///tmp/private", "blob:https://example.test/id",
    "javascript%3Aalert(1)", "//example.test/path", "jot:tag/security-review",
    "jot:tag/../javascript:alert(1)", "jot:tag/%73ecurity"
  ])("does not open %j as an external destination", href => {
    expect(isSafeExternalHref(href)).toBe(false);
  });

  it.each(["https://example.test/path", "http://example.test/", "mailto:me@example.test", "tel:+123456789"])("accepts supported external destination %j", href => {
    expect(isSafeExternalHref(href)).toBe(true);
  });

  it.each(["javascript:alert(1)", "java&#x09;script:alert(1)", "java&#115;cript:alert(1)", "data:text/html,test"])("rejects unsafe clipboard anchor %j", href => {
    expect(parseClipboardLinkData({ text: "", html: `<a href="${href}" onclick="alert(1)">label</a>` })).toBeNull();
  });

  it("extracts only canonical tag names and plain clipboard label text", () => {
    expect(extractJotTags('[ok](jot:tag/security-review) [bad](jot:tag/../x) [encoded](jot:tag/%73ecurity)')).toEqual(["security-review"]);
    expect(parseClipboardLinkData({ text: "", html: '<a href="https://example.test/"><b>label</b></a>' })).toEqual({ url: "https://example.test/", text: "label" });
  });
});
