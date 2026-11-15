import { describe, expect, it } from "vitest";

import { categoryLabels } from "@/lib/categories";

describe("categoryLabels", () => {
  it("keeps the shared taxonomy hierarchy in display labels", () => {
    const labels = categoryLabels([
      {
        id: "root",
        parentId: null,
        code: "root",
        name: "Heritage",
        slug: "heritage",
        description: null,
        assetCount: 0,
      },
      {
        id: "child",
        parentId: "root",
        code: "child",
        name: "Archive",
        slug: "archive",
        description: null,
        assetCount: 0,
      },
    ]);

    expect(labels.get("child")).toBe("Heritage / Archive");
  });
});
