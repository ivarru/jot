import { VIEWPORT_META_CONTENT } from "./documentHead";

describe("document head metadata", () => {
  it("asks Android browsers to resize viewport content for the on-screen keyboard", () => {
    expect(VIEWPORT_META_CONTENT).toContain("interactive-widget=resizes-content");
  });

  it("prevents pinch zoom from shrinking the page below its responsive default", () => {
    expect(VIEWPORT_META_CONTENT).toContain("minimum-scale=1");
  });
});
