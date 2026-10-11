import { describe, expect, it } from "vitest";
import { getExportFiles } from "./exportProject";

describe("generated project export files", () => {
  it("writes every safe FILE marker as its own file", () => {
    const files = getExportFiles("// FILE: src/App.jsx\nexport default function App() { return null; }\n\n// FILE: src/components/Tile.jsx\nexport default function Tile() { return null; }");
    expect(Object.keys(files)).toEqual(["src/App.jsx", "src/components/Tile.jsx"]);
  });

  it("does not allow file markers to escape the export folder", () => {
    const files = getExportFiles("// FILE: ../outside.js\nmalicious content\n\n// FILE: src/App.jsx\nexport default function App() { return null; }");
    expect(files["../outside.js"]).toBeUndefined();
  });
});