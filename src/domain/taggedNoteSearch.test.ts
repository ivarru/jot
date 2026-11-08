import { matchingTaggedPassage } from "./taggedNoteSearch";
const tag = (name: string) => `[#${name}](jot:tag/${name})`;
const source = `# Work\n\nTags: ${tag("work")}\n\n## Planning\n\nTags: ${tag("planning")}\n\n### Budget\n\nThe annual budget. ${tag("finance")}\n\n### Other\n\nUnrelated text.\n\n## Personal\n\nBudget elsewhere.\n\n# Home\n\nBudget at home.`;
it("inherits all ancestor section tags and direct paragraph tags", () => {
  expect(matchingTaggedPassage(source, "annual budget", ["work", "planning", "finance"])).toContain("annual budget");
});
it("does not leak paragraph tags or sibling and terminated section tags", () => {
  expect(matchingTaggedPassage(source, "unrelated", ["finance"])).toBeNull();
  expect(matchingTaggedPassage(source, "elsewhere", ["planning"])).toBeNull();
  expect(matchingTaggedPassage(source, "home", ["work"])).toBeNull();
});
it("requires words in one passage and supports tag-only searches", () => {
  expect(matchingTaggedPassage(source, "annual unrelated", ["planning"])).toBeNull();
  expect(matchingTaggedPassage(source, "", ["finance"])).toContain("annual budget");
  expect(matchingTaggedPassage("ordinary #finance prose", "", ["finance"])).toBeNull();
});
it("resolves reference tags and excludes code and sibling list item tags", () => {
  expect(matchingTaggedPassage("Budget [#work][w]\n\n[w]: jot:tag/work", "budget", ["work"])).toContain("Budget");
  expect(matchingTaggedPassage(`- Budget ${tag("work")}\n- Private plans`, "private", ["work"])).toBeNull();
  expect(matchingTaggedPassage('```md\nBudget '+tag("work")+'\n```', "budget", ["work"])).toBeNull();
});

it("preserves word boundaries at Markdown hard breaks", () => {
  expect(matchingTaggedPassage(`Annual  \nbudget ${tag("work")}`, '"annual budget"', ["work"])).not.toBeNull();
});

it("matches table tags within one cell, without leaking across rows or cells", () => {
  const table = `| Topic | Details |\n| --- | --- |\n| Budget ${tag("work")} | Team |\n| Private ${tag("home")} | Plans |`;
  expect(matchingTaggedPassage(table, "private", ["work"])).toBeNull();
  expect(matchingTaggedPassage(table, "team", ["work"])).toBeNull();
  expect(matchingTaggedPassage(table, "budget", ["work"])).toContain("Budget");
});

it("inherits section declarations within blockquotes without leaking their scope", () => {
  const note = `# Outer\n\nTags: ${tag("outer")}\n\n> # Work\n>\n> Tags: ${tag("work")}\n>\n> ## Plans\n>\n> Budget approved.\n>\n> # Home\n>\n> Private budget.\n\nOutside budget.`;
  expect(matchingTaggedPassage(note, "approved", ["work", "outer"])).toContain("Budget approved");
  expect(matchingTaggedPassage(note, "private", ["work"])).toBeNull();
  expect(matchingTaggedPassage(note, "outside", ["work"])).toBeNull();
  expect(matchingTaggedPassage(note, "outside", ["outer"])).toContain("Outside budget");
});

it("keeps cell boundaries inside lists and preserves inline formatting word boundaries", () => {
  const note = `- | Topic | Details |\n  | --- | --- |\n  | Budget ${tag("work")} | Private |`;
  expect(matchingTaggedPassage(note, "private", ["work"])).toBeNull();
  expect(matchingTaggedPassage(`An**nual** budget ${tag("work")}`, '"annual budget"', ["work"])).not.toBeNull();
});

it("retains a quoted multi-line passage without interpreting quote markers as prose", () => {
  const note = `> # Work\n>\n> Tags: ${tag("work")}\n>\n> Annual  \n> budget approved.`;
  const hit = matchingTaggedPassage(note, '"annual budget"', ["work"]);
  expect(hit).toContain("budget approved");
  expect(hit).not.toContain("> budget");
});

it.each(["> [w]: jot:tag/work", "- [w]: jot:tag/work"])("resolves document-wide nested definitions: %s", (definition) => {
  const hit = matchingTaggedPassage(`Budget [#work][w]\n\n${definition}`, "budget", ["work"]);
  expect(hit).toContain("Budget");
  expect(hit).toContain("jot:tag/work");
});

it("preserves document order for duplicate reference definitions across containers", () => {
  const note = `Budget [#work][w]\n\n> [w]: jot:tag/work\n\n[w]: jot:tag/home`;
  expect(matchingTaggedPassage(note, "budget", ["work"])).toContain("Budget");
  expect(matchingTaggedPassage(note, "budget", ["home"])).toBeNull();
  const reverse = `Budget [#work][w]\n\n[w]: jot:tag/home\n\n> [w]: jot:tag/work`;
  expect(matchingTaggedPassage(reverse, "budget", ["work"])).toBeNull();
  expect(matchingTaggedPassage(reverse, "budget", ["home"])).toContain("Budget");
});
