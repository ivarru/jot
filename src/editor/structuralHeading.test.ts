import { structuralHeadingAvailability, structuralHeadingTarget } from "./structuralHeading";

describe("structural heading transitions", () => {
  it("forms a reversible chain below the nearest preceding heading", () => {
    expect(structuralHeadingTarget(null, 2, true)).toEqual({ type: "heading", level: 3 });
    expect(structuralHeadingTarget(3, 2, true)).toEqual({ type: "heading", level: 2 });
    expect(structuralHeadingTarget(2, 2, true)).toEqual({ type: "heading", level: 1 });
    expect(structuralHeadingTarget(1, 2, false)).toEqual({ type: "heading", level: 2 });
    expect(structuralHeadingTarget(2, 2, false)).toEqual({ type: "heading", level: 3 });
    expect(structuralHeadingTarget(3, 2, false)).toEqual({ type: "paragraph" });
  });

  it("uses h1 as the first heading when there is no preceding heading", () => {
    expect(structuralHeadingTarget(null, null, true)).toEqual({ type: "heading", level: 1 });
    expect(structuralHeadingTarget(1, null, false)).toEqual({ type: "paragraph" });
  });

  it("keeps ordinary indentation as list creation", () => {
    expect(structuralHeadingTarget(null, 3, false)).toEqual({ type: "list-item" });
  });

  it("reports heading boundaries as unavailable", () => {
    expect(structuralHeadingAvailability(1, null)).toEqual({ canIndent: true, canDedent: false });
    expect(structuralHeadingAvailability(6, 6)).toEqual({ canIndent: false, canDedent: true });
    expect(structuralHeadingAvailability(null, 6)).toEqual({ canIndent: true, canDedent: false });
  });
});
