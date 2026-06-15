import { markdownHardLineBreakSpaceRanges } from "./markdownHardLineBreaks";

describe("markdown hard line break highlighting", () => {
  it("finds runs of two or more spaces at line ends", () => {
    const markdown = "first  \nsecond \nthird   \nfour  ";

    expect(markdownHardLineBreakSpaceRanges(markdown)).toEqual([
      { start: "first".length, end: "first  ".length },
      { start: "first  \nsecond \nthird".length, end: "first  \nsecond \nthird   ".length }
    ]);
  });

  it("keeps single trailing spaces, indentation, and final-line spaces unmarked", () => {
    expect(markdownHardLineBreakSpaceRanges(" one\nnext \n  indented  ")).toEqual([]);
  });
});
