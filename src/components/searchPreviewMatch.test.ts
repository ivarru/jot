import { firstPreviewMatch } from "./searchPreviewMatch";

it("finds the earliest whole word across formatting and ignores partial words", () => {
  const root = document.createElement("div");
  root.innerHTML = '<p>blueberry</p><p>A <strong>blue</strong> berry, then pears</p><p>pears</p>';
  expect(firstPreviewMatch(root, "pears blue")?.toString()).toBe("blue");
  expect(firstPreviewMatch(root, '"blue berry"')?.toString()).toBe("blue berry");
  expect(firstPreviewMatch(root, "berr")).toBeNull();
});

it("handles Unicode, code blocks, and punctuation without interpreting query regex", () => {
  const root = document.createElement("div");
  root.innerHTML = '<h2>BLÅBÆR</h2><pre><code>a.b [x]</code></pre>';
  expect(firstPreviewMatch(root, "blåbær")?.toString()).toBe("BLÅBÆR");
  expect(firstPreviewMatch(root, "a.b")?.toString()).toBe("a.b");
  expect(firstPreviewMatch(root, "[x]")?.toString()).toBe("[x]");
});
