import { remark } from "remark";
import type { Root } from "mdast";
import { preserveParagraphTrailingSpaces } from "./markdownTrailingSpaces";

function parse(markdown: string): Root {
  const processor = remark().use(preserveParagraphTrailingSpaces);
  return processor.runSync(processor.parse(markdown), markdown) as Root;
}

describe("paragraph trailing spaces", () => {
  it("retains a separator at the end of a non-final list item", () => {
    const tree = parse("* First\n* Middle word \n* Last\n");
    expect(JSON.stringify(tree)).toContain('"value":"\u00a0"');
  });

  it("keeps a trailing separator outside a preceding mark", () => {
    const tree = parse("**word** \n");
    expect(tree.children[0]).toMatchObject({ type: "paragraph", children: [
      { type: "strong" }, { type: "text", value: "\u00a0" }
    ] });
  });

  it("does not change code, HTML, or hard line breaks", () => {
    for (const markdown of ["```\nword \n```", "    word \n", "<pre>\nword \n</pre>", "word  \nnext", "word\\\nnext"]) {
      expect(parse(markdown)).toEqual(remark().parse(markdown));
    }
  });

  it("does not duplicate an entity-encoded trailing space", () => {
    const tree = parse("word&#32;\n");
    expect(tree).toEqual(remark().parse("word&#32;\n"));
  });
});
