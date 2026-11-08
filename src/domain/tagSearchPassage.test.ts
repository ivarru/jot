import { tagSearchPassage } from "./tagSearchPassage";
import { findTaggableSearchPassage } from "./taggedNoteSearch";

const work = "[#work](jot:tag/work)";
it("appends only missing tags to the first qualifying paragraph without rewriting source", () => {
  const source = `# Work\n\nTags: ${work}\n\nBudget **approved**.\n\nOther budget.`;
  const expected = source.replace("Budget **approved**.", "Budget **approved**. [#finance](jot:tag/finance)");
  expect(tagSearchPassage(source, "budget", ["work"], ["work", "Finance", "finance"])).toBe(expected);
  expect(tagSearchPassage(expected, "budget", ["work"], ["finance"])).toBe(expected);
});
it("targets list items without extending tags to their nested items", () => {
  const source = "- Budget approved.\n  - Private details.\n- Other budget.";
  expect(tagSearchPassage(source, "budget", [], ["work"])).toBe(source.replace("Budget approved.", `Budget approved. ${work}`));
});
it("tags inside quoted paragraphs and table cells without changing containers", () => {
  expect(tagSearchPassage("> Budget approved.\n", "budget", [], ["work"])).toBe(`> Budget approved. ${work}\n`);
  const source = "| Budget | Private |\n| --- | --- |";
  const result = tagSearchPassage(source, "budget", [], ["work"]);
  expect(result).toContain(work);
  expect(findTaggableSearchPassage(result, "private", ["work"])).toBeNull();
});
it("does not offer headings or section declarations as paragraph targets", () => {
  expect(findTaggableSearchPassage(`# Budget\n\nTags: ${work}`, "budget", [])).toBeNull();
  expect(findTaggableSearchPassage(`# Budget\n\nTags: ${work}`, "", ["work"])).toBeNull();
});

it.each([
  ["final header cell", "| Budget | Private |\n| --- | --- |"],
  ["final body cell", "| Topic | Details |\n| --- | --- |\n| Budget | Private |"]
])("keeps tags inside the %s and preserves table structure", (_name, source) => {
  const result = tagSearchPassage(source, "private", [], ["work"]);
  expect(result).toBe(source.replace("Private", `Private ${work}`));
  expect(findTaggableSearchPassage(result, "private", ["work"])).not.toBeNull();
  expect(findTaggableSearchPassage(result, "budget", ["work"])).toBeNull();
});

it.each([
  ["**Private**", "  |"],
  ["`Private`", "|"],
  ["Private \\| details", " |"],
  ["Private", ""],
  ["Private", "   "]
])("preserves inline content and final cell suffix: %s %s", (content, suffix) => {
  const source = `| Topic | Details |\r\n| --- | --- |\r\n| Budget | ${content}${suffix}\r\n`;
  expect(tagSearchPassage(source, "private", [], ["work"]))
    .toBe(source.replace(content, `${content} ${work}`));
});
