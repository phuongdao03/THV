// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

import { GET } from "@/app/(public)/works/[slug]/share-image/route";

const api = vi.hoisted(() => ({ loadPublicWork: vi.fn() }));
vi.mock("@/lib/api/public-work-server", () => api);
const params = { params: Promise.resolve({ slug: "de-cu" }) };
const request = new Request("http://localhost/works/de-cu/share-image");
const detail = {
  id: "8a831bab-fb14-4fad-bd5f-daf14756bb11",
  title: "Nghề thủ công truyền thống",
  categoryName: "Văn hóa",
  media: [],
};

afterEach(() => vi.unstubAllGlobals());

it("renders a PNG when a chosen derivative is missing", async () => {
  const fetchImage = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchImage);
  api.loadPublicWork.mockResolvedValue({
    kind: "detail",
    detail: {
      ...detail,
      media: [
        {
          id: "06aeca80-1189-4d03-bed5-b7f300079454",
          isThumbnail: true,
          kind: "IMAGE",
          url: "https://private.example/evidence.pdf",
        },
      ],
    },
  });
  const result = await GET(request, params);
  expect(result.headers.get("content-type")).toContain("image/png");
  expect(new Uint8Array(await result.arrayBuffer()).slice(0, 4)).toEqual(
    Uint8Array.of(137, 80, 78, 71),
  );
  expect(fetchImage.mock.calls[0]?.[0]).toContain("/api/v1/public/works/");
});

it("returns 404 and never requests media for a private record", async () => {
  const fetchImage = vi.fn();
  vi.stubGlobal("fetch", fetchImage);
  api.loadPublicWork.mockResolvedValue({ kind: "not_found" });
  expect((await GET(request, params)).status).toBe(404);
  expect(fetchImage).not.toHaveBeenCalled();
});
