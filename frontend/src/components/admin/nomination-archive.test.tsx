import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NominationArchive } from "./nomination-archive";
import { NominationArchiveDetail } from "./nomination-archive-detail";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  section: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({
  nominationArchiveApi: api,
  publicApi: { categories: vi.fn().mockResolvedValue([]) },
  mediaApi: { signedUrl: vi.fn() },
}));
const record = {
  id: "record-1",
  source: "CURRENT",
  code: "CNS-2020-OLD",
  title: "Hồ sơ đã kết thúc",
  subject: "owner@example.test",
  year: 2020,
  categoryId: null,
  businessStatus: "REJECTED",
  publicationStatus: "HIDDEN",
  archiveStatus: null,
  updatedAt: "2026-11-17T00:00:00Z",
};
function show(component: React.ReactNode) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {component}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue(record);
  api.section.mockResolvedValue({ data: [], meta: { total: 0 } });
});

it("discovers completed records and searches without conflating status dimensions", async () => {
  api.list.mockResolvedValue({ data: [record], meta: { total: 1 } });
  show(<NominationArchive />);
  expect(
    (await screen.findByRole("link", { name: record.title })).getAttribute(
      "href",
    ),
  ).toBe("/admin/nomination-records/CURRENT/record-1");
  expect(within(screen.getByRole("list")).getByText("Bị từ chối")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tìm hồ sơ"), {
    target: { value: "THV-2020-OLD" },
  });
  fireEvent.change(screen.getByLabelText("Lưu trữ"), {
    target: { value: "ARCHIVED" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tra cứu hồ sơ" }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "THV-2020-OLD",
        archive_status: "ARCHIVED",
      }),
    ),
  );
});

it("distinguishes a section retrieval error from an empty archive", async () => {
  api.section.mockImplementation(async (_source, _id, section) => {
    if (section === "documents") throw new Error("Unavailable");
    return { data: [], meta: { total: 0 } };
  });
  show(<NominationArchiveDetail source="CURRENT" recordId="record-1" />);
  await screen.findByRole("heading", { name: record.title });
  fireEvent.click(screen.getByRole("button", { name: "Tài liệu hồ sơ" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Không tải được dữ liệu mục này"),
  );
  expect(screen.queryByText(/Chưa có bản ghi cho mục này/)).toBeNull();
});

it("retains file metadata when the storage reference is missing", async () => {
  api.section.mockResolvedValue({
    data: [
      {
        id: "file-1",
        title: "Bản gốc đã nộp.pdf",
        status: "METADATA_WITHOUT_ASSET",
        facts: {},
        mediaId: null,
      },
    ],
    meta: { total: 1 },
  });
  show(<NominationArchiveDetail source="CURRENT" recordId="record-1" />);
  await screen.findByRole("heading", { name: record.title });
  fireEvent.click(screen.getByRole("button", { name: "Tài liệu hồ sơ" }));
  expect(
    await screen.findByText(/Có metadata nhưng thiếu bản ghi tệp/),
  ).toBeTruthy();
  expect(screen.getByText("Bản gốc đã nộp.pdf")).toBeTruthy();
});

it("opens the existing publication editor with a source return link", async () => {
  api.section.mockResolvedValue({
    data: [{ id: "work-1", title: "Bài công bố", status: "HIDDEN", facts: {} }],
    meta: { total: 1 },
  });
  show(<NominationArchiveDetail source="CURRENT" recordId="record-1" />);
  await screen.findByRole("heading", { name: record.title });
  fireEvent.click(screen.getByRole("button", { name: "Nội dung công bố" }));
  expect(
    (
      await screen.findByRole("link", { name: "Mở trình biên tập công bố" })
    ).getAttribute("href"),
  ).toBe("/admin/content?workId=work-1&source=CURRENT&recordId=record-1");
  expect(
    screen.queryByRole("button", { name: /Xuất bản|Lưu thay đổi/ }),
  ).toBeNull();
});
