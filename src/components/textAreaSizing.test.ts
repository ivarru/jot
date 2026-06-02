import { resizeTextAreaToContents } from "./textAreaSizing";

describe("textarea autosizing", () => {
  it("does not collapse a focused textarea before growing it", () => {
    const assignments: string[] = [];
    const textarea = fakeTextarea({
      currentHeight: "100px",
      scrollHeight: 120,
      assignments
    });

    resizeTextAreaToContents(textarea);

    expect(assignments).toEqual(["120px"]);
  });

  it("measures from auto when content may have shrunk", () => {
    const assignments: string[] = [];
    const textarea = fakeTextarea({
      currentHeight: "120px",
      scrollHeight: 100,
      assignments
    });

    resizeTextAreaToContents(textarea);

    expect(assignments).toEqual(["auto", "100px"]);
  });
});

function fakeTextarea(input: {
  readonly currentHeight: string;
  readonly scrollHeight: number;
  readonly assignments: string[];
}): HTMLTextAreaElement {
  let height = input.currentHeight;

  return {
    get scrollHeight() {
      return input.scrollHeight;
    },
    style: {
      get height() {
        return height;
      },
      set height(value: string) {
        input.assignments.push(value);
        height = value;
      }
    }
  } as HTMLTextAreaElement;
}
