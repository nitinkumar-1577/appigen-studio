import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createPngDocx } from "./createPngDocx";

const onePixelPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
]);

describe("PNG to DOCX export", () => {
  it("creates a Word package with the source PNG embedded", async () => {
    const file = new File([onePixelPng], "tiny.png", { type: "image/png" });
    const document = await createPngDocx(file);
    const zip = await JSZip.loadAsync(document);
    expect(zip.file("word/document.xml")).not.toBeNull();
    expect(zip.file("word/media/image.png")).not.toBeNull();
    expect(await zip.file("word/document.xml")!.async("string")).toContain('r:embed="rId1"');
  });

  it("rejects a file that is not a PNG", async () => {
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    await expect(createPngDocx(file)).rejects.toThrow("valid PNG");
  });
});
