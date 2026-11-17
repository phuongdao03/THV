import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { HistoricalRecordDetailComplete } from "@/components/historical-nominations/historical-record-detail-complete";
import type {
  HistoricalNomination,
  HistoricalRelatedPerson,
  HistoricalRelatedPersonInput,
} from "@/lib/api/historical-nomination-types";

const api = vi.hoisted(() => {
  const people: HistoricalRelatedPerson[] = [];
  return {
    people,
    listPeople: vi.fn(async () => people),
    addPerson: vi.fn(
      async (_recordId: string, input: HistoricalRelatedPersonInput) => {
        const person: HistoricalRelatedPerson = {
          id: "person-1",
          displayName: input.displayName,
          organizationName: input.organizationName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          internalNotes: input.internalNotes ?? null,
          role: input.role,
        };
        people.push(person);
        return person;
      },
    ),
    addAward: vi.fn().mockResolvedValue(null),
    listAwards: vi.fn().mockResolvedValue([]),
    listMedia: vi.fn().mockResolvedValue([]),
    publicContentDraft: vi.fn().mockResolvedValue(null),
    publication: vi.fn().mockResolvedValue(null),
    recordActivity: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/api/client", () => ({
  dossierApi: { listTypes: vi.fn().mockResolvedValue([]) },
  historicalNominationApi: api,
  mediaApi: { signedUrl: vi.fn() },
  publicApi: { categories: vi.fn().mockResolvedValue([]) },
}));

const record: HistoricalNomination = {
  id: "record-1",
  code: "THV-LS-2026-TEST",
  subjectType: "PERSON",
  subjectName: "Nguyễn Văn A",
  title: "Hồ sơ lịch sử",
  summary: null,
  description: null,
  dossierTypeId: null,
  categoryId: null,
  legacyCategoryLabel: null,
  nominationYear: 2020,
  nominatedAt: null,
  historicalResult: null,
  sourceKind: "ARCHIVE",
  sourceLabel: null,
  sourceReference: null,
  sourceRecordedAt: null,
  provenanceNotes: null,
  verificationStatus: "DRAFT",
  archiveStatus: "ACTIVE",
  archiveReason: null,
  publicationStatus: "PRIVATE",
  missingFieldsJson: [],
  submittedAt: null,
  verifiedAt: null,
  verificationReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mediaCount: 0,
};

function renderDetail(
  detailRecord: HistoricalNomination = record,
  onEdit = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["historical-nomination", record.id], record);
  render(
    <QueryClientProvider client={queryClient}>
      <HistoricalRecordDetailComplete
        canEdit
        onArchive={() => undefined}
        onEdit={onEdit}
        record={detailRecord}
        submitting={false}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  api.people.splice(0);
  vi.clearAllMocks();
});

it("keeps stopping work in secondary actions and distinguishes it from saving", async () => {
  renderDetail();
  expect(screen.getByRole("button", { name: "Chỉnh sửa hồ sơ" })).toBeTruthy();
  const menu = screen
    .getByText("Thao tác khác", { exact: true })
    .closest("details");
  expect(menu?.hasAttribute("open")).toBe(false);
  fireEvent.click(screen.getByText("Thao tác khác", { exact: true }));
  expect(menu?.hasAttribute("open")).toBe(true);
  expect(
    screen.getByRole("button", { name: "Ngừng xử lý hồ sơ" }),
  ).toBeTruthy();
  expect(screen.getByText(/Thao tác này không phải lưu thay đổi/)).toBeTruthy();
});

it("marks completed steps with a visible label and keeps optional empty steps unfinished", async () => {
  renderDetail({ ...record, publicationStatus: "PUBLISHED" });
  const overview = screen.getByRole("region", {
    name: "Các bước hoàn thiện hồ sơ",
  });
  await waitFor(() =>
    expect(within(overview).getAllByText("Đã hoàn thành")).toHaveLength(2),
  );
  const steps = within(overview).getAllByRole("listitem");
  expect(steps).toHaveLength(4);
  steps.forEach((step, index) => {
    expect(Boolean(within(step).queryByLabelText("Đã hoàn thành"))).toBe(
      index === 0 || index === 3,
    );
  });
});

it("allows publishing a saved short title and summary and explains missing values", async () => {
  api.publicContentDraft.mockResolvedValueOnce({
    id: "draft-1",
    nominationId: record.id,
    slug: "a",
    title: "A",
    shortDescription: "B",
    fullDescription: null,
    authorDisplayName: null,
    categoryId: "category-1",
    coverMediaId: "cover-1",
    featuredVideoMediaId: null,
    publicMediaIds: [],
    revision: 1,
    status: "DRAFT",
    updatedAt: record.updatedAt,
  });
  renderDetail();
  fireEvent.click(screen.getByRole("tab", { name: "Nội dung công khai" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Xuất bản" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  expect(
    screen.getByText("Nội dung đã có thông tin bắt buộc để xuất bản."),
  ).toBeTruthy();
});

it("shows readable history without database field names", async () => {
  api.recordActivity.mockResolvedValueOnce([
    {
      id: "event-1",
      action: "historical_nomination.public_content_draft_saved",
      changedFields: ["revision"],
      occurredAt: record.updatedAt,
      actorUserId: null,
    },
  ]);
  renderDetail();
  fireEvent.click(screen.getByRole("tab", { name: "Lịch sử chỉnh sửa" }));
  expect(
    await screen.findByText("Lưu bản nháp nội dung công khai"),
  ).toBeTruthy();
  expect(screen.queryByText("revision")).toBeNull();
});

it("directs an empty record to basic information before publication", async () => {
  const onEdit = vi.fn();
  renderDetail(
    { ...record, title: "Hồ sơ chưa đặt tên", subjectName: null },
    onEdit,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Bắt đầu nhập thông tin" }),
  );
  expect(onEdit).toHaveBeenCalledOnce();
  expect(screen.getByText("Cần nhập để bắt đầu")).toBeTruthy();
  expect(await screen.findByText("0 bằng · Bỏ qua nếu không có")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Thêm \/ xem bằng cũ/ }));
  expect(
    screen
      .getByRole("tab", { name: "Bằng xác lập" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});

it("keeps award details when the operator switches to another section", async () => {
  renderDetail();

  fireEvent.click(await screen.findByRole("tab", { name: "Bằng xác lập" }));
  fireEvent.click(screen.getByRole("button", { name: "Thêm bằng cũ" }));
  fireEvent.change(screen.getByLabelText("Tên bằng xác lập / giải thưởng"), {
    target: { value: "Bằng khen năm 1998" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Người gửi & liên quan" }));
  fireEvent.click(screen.getByRole("tab", { name: "Bằng xác lập" }));

  expect(
    screen.getByLabelText("Tên bằng xác lập / giải thưởng"),
  ).toHaveProperty("value", "Bằng khen năm 1998");
});

it("explains how to link an award recipient and where the record will be published", async () => {
  const queryClient = renderDetail();
  const recordQueryKey = ["historical-nomination", record.id];

  fireEvent.click(await screen.findByRole("tab", { name: "Bằng xác lập" }));
  fireEvent.click(screen.getByRole("button", { name: "Thêm bằng cũ" }));

  expect(screen.getByLabelText("Người nhận ghi trên bằng")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Thêm người để liên kết" }),
  );
  expect(
    screen.getByText(/Thêm người ở tab “Người gửi & liên quan”/),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Người gửi & liên quan" }));
  fireEvent.change(screen.getByLabelText("Họ tên / tên tổ chức *"), {
    target: { value: "Nguyễn Văn A" },
  });
  fireEvent.change(screen.getByLabelText("Vai trò"), {
    target: { value: "NOMINEE" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Thêm người gửi \/ người liên quan/ }),
  );
  await waitFor(() => expect(api.people).toHaveLength(1));
  await waitFor(() =>
    expect(queryClient.getQueryState(recordQueryKey)?.isInvalidated).toBe(true),
  );
  queryClient.setQueryData(recordQueryKey, record);

  fireEvent.click(screen.getByRole("tab", { name: "Bằng xác lập" }));
  const recipient = screen.getByLabelText(
    "Người nhận ghi trên bằng",
  ) as HTMLSelectElement;
  await waitFor(() =>
    expect(
      Array.from(recipient.options).map((option) => option.text),
    ).toContain("Nguyễn Văn A"),
  );
  fireEvent.change(recipient, { target: { value: "person-1" } });
  fireEvent.change(screen.getByLabelText("Tên bằng xác lập / giải thưởng"), {
    target: { value: "Bằng khen" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu bằng cũ" }));
  await waitFor(() =>
    expect(api.addAward).toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ recipientPersonId: "person-1" }),
    ),
  );
  await waitFor(() =>
    expect(queryClient.getQueryState(recordQueryKey)?.isInvalidated).toBe(true),
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Soạn nội dung công khai" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Nội dung dự kiến công bố" }),
  ).toBeTruthy();
});
