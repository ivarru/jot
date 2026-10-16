import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { buildTagIndexFiles, extractTagIndexOccurrences } from "./tagIndex";

const date = "2030-02-01";
const tag = "[#work](jot:tag/work)";
const excerpts = (source: string, limit = 200) => extractTagIndexOccurrences(date, source, limit).map((entry) => entry.excerpt);
const parser = remark().use(remarkGfm);

it("uses whole elements regardless of soft wrapping and excludes content after each tag", () => {
  expect(excerpts(`Opening text\ncontinued ${tag} ignored text`)).toEqual(["Opening text continued"]);
  expect(excerpts(`- Opening text\n  continued ${tag} ignored\n- Sibling`)).toEqual(["Opening text continued"]);
  expect(excerpts(`- Opening text continued ${tag} ignored`)).toEqual(["Opening text continued"]);
  expect(excerpts(`Before ${tag} middle ${tag} after`)).toEqual(["Before", "Before middle"]);
});

it("supports ordered/tasks/nested and multi-paragraph list items without sibling leakage", () => {
  expect(excerpts(`1. [x] First\n\n   Second ${tag}\n\n2. Sibling`)).toEqual(["First Second"]);
  expect(excerpts(`- Parent\n  - Nested ${tag}\n  - Sibling ${tag}`)).toEqual(["Nested", "Sibling"]);
  expect(excerpts(`## Heading ${tag}`)).toEqual(["Heading"]);
});

it("uses preceding structural context for standalone and section-declaration tags", () => {
  expect(excerpts(`## Storage design\n\n${tag}`)).toEqual(["Storage design"]);
  expect(excerpts(`## Storage design\n\nTags: ${tag} [#api](jot:tag/api)`)).toEqual(["Storage design", "Storage design"]);
  expect(excerpts(tag)).toEqual([""]);
  expect(excerpts(`\`\`\`ts\nexample\n\`\`\`\n\n${tag}`)).toEqual([""]);
});

it("recognizes destinations and references, not labels, code, images, or ordinary links", () => {
  expect(extractTagIndexOccurrences(date, `Text [different](jot:tag/work) [#work](https://example.com) ![image](jot:tag/work) [invalid](jot:tag/../work) [noncanonical](jot:tag/Work) [unsupported](jot:tag/blå)\n\n\`${tag}\`\n\n\`\`\`\n${tag}\n\`\`\`\n\nReference [label][tag]\n\n[tag]: jot:tag/api`, 200).map((entry) => entry.tag)).toEqual(["work", "api"]);
});

it("clips parsed inline formatting and resolves reference links into self-contained Markdown", () => {
  expect(excerpts(`**abcdef ${tag}**`, 4)).toEqual(["**abc**…"]);
  expect(excerpts(`*abcdef* ${tag}`, 4)).toEqual(["*abc*…"]);
  expect(excerpts(`~~abcdef~~ ${tag}`, 4)).toEqual(["~~abc~~…"]);
  expect(excerpts(`\`abcdef\` ${tag}`, 4)).toEqual(["`abc`…"]);
  expect(excerpts(`[abcdef][ref] ${tag}\n\n[ref]: https://example.com`, 4)).toEqual(["[abc](https://example.com)…"]);
  expect(excerpts(`abc ${tag}`, 3)).toEqual(["abc"]);
  expect(excerpts(`abcd ${tag}`, 1)).toEqual(["…"]);
});

it("counts visible graphemes and does not split emoji or combining characters", () => {
  expect(excerpts(`👩‍💻a\u0301bc ${tag}`, 3)).toEqual(["👩‍💻á…"]);
  expect(excerpts(`**ab** ${tag}`, 2)).toEqual(["**ab**"]);
});

it("sorts by date then position, preserves equal occurrences, and emits one hard-break line per entry", () => {
  const files = buildTagIndexFiles([
    { date: "2030-02-02", markdown: `B ${tag}` },
    { date, markdown: `Same ${tag}\n\nSame ${tag}\n\nLast ${tag}` }
  ], 200);
  expect(files.get("work")).toBe("2030-02-01 Same  \n2030-02-01 Same  \n2030-02-01 Last  \n2030-02-02 B  \n");
  const tree = parser.parse(files.get("work")!);
  expect(tree.children.map((node) => node.type)).toEqual(["paragraph"]);
  expect(JSON.stringify(tree)).toContain('"type":"break"');
});

it("prevents block/fence/HTML leakage and keeps clipped files safe to concatenate", () => {
  const sources = [
    `\\\`\\\`\\\` ${tag}`, `~~~\n${tag}\n~~~\n\n${tag}`, `<span>hello</span> ${tag}`,
    `# **A [link](https://example.com)** ${tag}`, `\\*literal* ${tag}`, `\`a\\b\` ${tag}`
  ];
  for (let limit = 1; limit < 15; limit++) {
    const files = buildTagIndexFiles(sources.map((markdown, index) => ({ date: `2030-02-0${index + 1}` as typeof date, markdown })), limit);
    const source = files.get("work")!;
    expect(source.trimEnd().split("\n")).toHaveLength(6);
    const tree = parser.parse(source);
    expect(tree.children.every((node) => node.type === "paragraph")).toBe(true);
    expect(JSON.stringify(tree)).not.toContain('"type":"html"');
    expect(JSON.stringify(tree)).not.toContain('"type":"definition"');
  }
});

it("keeps multiline inline code and link titles on one physical index line", () => {
  const source = 'A [link](https://example.com "a\nmultiline title") and `wrapped\ncode` ' + tag;
  const file = buildTagIndexFiles([{ date, markdown: source }], 200).get("work")!;
  expect(file.trimEnd().split("\n")).toHaveLength(1);
  expect(file).toContain("[link](https://example.com)");
  expect(file).toContain("`wrapped code`");
});

it("uses a section heading for tag declarations inside a list item", () => {
  expect(excerpts(`- ## Nested section\n\n  Tags: ${tag}\n\n  Section body`)).toEqual(["Nested section"]);
});
