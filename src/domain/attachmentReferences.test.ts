import {
  appendImageAttachmentReference,
  createImageAttachmentReference,
  findImageAttachmentReferences
} from "./attachmentReferences";

describe("attachment references", () => {
  it("creates markdown image references with jot image targets", () => {
    expect(createImageAttachmentReference("01HZY3J2CJX6N7Y25K2K3N8E4A")).toBe(
      "![](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
    );
  });

  it("escapes alt text when creating markdown image references", () => {
    expect(createImageAttachmentReference("01HZY3J2CJX6N7Y25K2K3N8E4A", String.raw`a\b]c`)).toBe(
      String.raw`![a\\b\]c](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)`
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

  it("finds image attachment references with escaped alt text", () => {
    const refs = findImageAttachmentReferences(
      String.raw`![a\\b\]c](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)`
    );

    expect(refs).toMatchObject([
      {
        altText: String.raw`a\b]c`,
        id: "01HZY3J2CJX6N7Y25K2K3N8E4A"
      }
    ]);
  });

  it("appends image references without trimming existing markdown", () => {
    expect(appendImageAttachmentReference("Existing  \n", "![x](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)")).toBe(
      "Existing  \n![x](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
    );
  });
});
