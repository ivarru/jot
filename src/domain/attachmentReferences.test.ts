import { createImageAttachmentReference, findImageAttachmentReferences } from "./attachmentReferences";

describe("attachment references", () => {
  it("creates markdown image references with jot image targets", () => {
    expect(createImageAttachmentReference("01HZY3J2CJX6N7Y25K2K3N8E4A")).toBe(
      "![](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
    );
  });

  it("finds image attachment references", () => {
    const refs = findImageAttachmentReferences(
      "Before\n![Receipt](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)\nAfter"
    );

    expect(refs).toEqual([
      {
        altText: "Receipt",
        id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
        start: 7,
        end: 55
      }
    ]);
  });
});
