import { renderMilkdownListItemLabel } from "./milkdownListItems";

describe("milkdown list item rendering", () => {
  it("renders task list labels as checkbox markers", () => {
    expect(renderMilkdownListItemLabel({ label: "1.", listType: "bullet", checked: false })).toContain(
      "jot-task-checkbox"
    );
    expect(renderMilkdownListItemLabel({ label: "1.", listType: "bullet", checked: true })).toContain(
      "jot-task-checkbox"
    );
  });

  it("preserves normal list markers", () => {
    expect(renderMilkdownListItemLabel({ label: "1.", listType: "ordered", checked: null })).toBe(
      '<span class="jot-list-marker">1.</span>'
    );
    expect(renderMilkdownListItemLabel({ label: "ignored", listType: "bullet", checked: null })).toBe(
      '<span class="jot-list-marker" aria-hidden="true">&bull;</span>'
    );
  });

  it("escapes ordered list labels before Milkdown inserts them as HTML", () => {
    expect(renderMilkdownListItemLabel({ label: '<img src=x onerror="bad">', listType: "ordered" })).toBe(
      '<span class="jot-list-marker">&lt;img src=x onerror=&quot;bad&quot;&gt;</span>'
    );
  });
});
