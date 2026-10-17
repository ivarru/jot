import { buildTagIndexFiles } from "./tagIndex";
import { parseTagIndexRows, tagIndexTarget, resolveTagIndexTarget } from "./tagIndexNavigation";
const date = "2030-02-01";
const tag = "[#work](jot:tag/work)";
const target = (source: string, ordinal = 0, limit = 200) => {
  const rows = parseTagIndexRows(buildTagIndexFiles([{ date, markdown: source }], limit).get("work")!);
  return tagIndexTarget("work", rows[ordinal]!, rows);
};
it("parses dated lines in date/occurrence order while preserving repeated and empty excerpts", () => {
  expect(parseTagIndexRows("2030-02-02 B  \n2030-02-01 Same  \n2030-02-01 Same  \n2030-02-01  \n"))
    .toEqual([{ date, excerpt: "Same", ordinal: 0 }, { date, excerpt: "Same", ordinal: 1 }, { date, excerpt: "", ordinal: 2 }, { date: "2030-02-02", excerpt: "B", ordinal: 0 }]);
  expect(() => parseTagIndexRows("2030-02-30 Wrong")).toThrow("could not be read");
  expect(() => parseTagIndexRows("arbitrary content")).toThrow("could not be read");
});
it("targets the ordinal of repeated identical excerpts without treating context as an identifier", () => {
  const source = `Same ${tag}\n\nSame ${tag}`;
  const result = resolveTagIndexTarget(source, target(source, 1));
  expect(result).toEqual({ status: "found", selection: { start: source.lastIndexOf(tag), end: source.length } });
});
it("relocates unique context after insertions and handles formatting changes and different saved excerpt limits", () => {
  const source = `First ${tag}\n\n**Long opening text** ${tag}`;
  const current = `New ${tag}\n\nFirst ${tag}\n\nLong opening text ${tag}`;
  const result = resolveTagIndexTarget(current, target(source, 1, 8));
  expect(result).toEqual({ status: "found", selection: { start: current.lastIndexOf(tag), end: current.length } });
});
it("declines ambiguous duplicate survivors, new matching instances, and removed tags", () => {
  const source = `Same ${tag}\n\nSame ${tag}`;
  expect(resolveTagIndexTarget(`Same ${tag}`, target(source, 1))).toEqual({ status: "ambiguous" });
  expect(resolveTagIndexTarget(source, target(`Same ${tag}`))).toEqual({ status: "ambiguous" });
  expect(resolveTagIndexTarget("Removed", target(source))).toEqual({ status: "missing" });
  expect(resolveTagIndexTarget(`Different ${tag}`, target(`Same ${tag}`))).toEqual({ status: "missing" });
});
it("does not let unrelated dates change a row's ordinal or comparison group", () => {
  const rows = parseTagIndexRows(`2030-02-01 A\n2030-02-01 B\n2030-02-02 C\n`);
  expect(tagIndexTarget("work", rows[1]!, rows)).toEqual({ tag: "work", date, ordinal: 1, excerpts: ["A", "B"] });
});
