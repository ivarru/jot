import {
  availableImageAttachmentResolutions,
  googlePhotosImageContentUrl,
  imageAttachmentIdFromFilename,
  imageAttachmentMetadataFilename,
  resolveImageAttachmentResolution
} from "./imageAttachments";

describe("image attachments", () => {
  it("stores one metadata file per image attachment id", () => {
    expect(imageAttachmentMetadataFilename("01HZY3J2CJX6N7Y25K2K3N8E4A")).toBe(
      "01HZY3J2CJX6N7Y25K2K3N8E4A.json"
    );
  });

  it("recovers Jot image attachment ids from app-created filenames", () => {
    expect(imageAttachmentIdFromFilename("01HZY3J2CJX6N7Y25K2K3N8E4A.jpg")).toBe("01HZY3J2CJX6N7Y25K2K3N8E4A");
    expect(imageAttachmentIdFromFilename("manual.jpg")).toBeNull();
  });

  it("creates Google Photos content URLs for the selected resolution", () => {
    expect(googlePhotosImageContentUrl("https://lh3.googleusercontent.com/p/test", resolveImageAttachmentResolution("medium"))).toBe(
      "https://lh3.googleusercontent.com/p/test=w2048"
    );
  });

  it("only offers smaller width choices plus the actual full-size width", () => {
    expect(availableImageAttachmentResolutions({ width: 1800, height: 1200 }).map((resolution) => resolution.label)).toEqual([
      "Small",
      "Full size (1800 px wide)"
    ]);
  });

  it("does not offer size choices that are not smaller than the original width", () => {
    expect(availableImageAttachmentResolutions({ width: 900, height: 600 }).map((resolution) => resolution.name)).toEqual([
      "original"
    ]);
  });
});
