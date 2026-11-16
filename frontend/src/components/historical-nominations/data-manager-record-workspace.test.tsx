import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { DataManagerRecordWorkspace } from "@/components/historical-nominations/data-manager-record-workspace";
import type { HistoricalNomination } from "@/lib/api/historical-nomination-types";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  listPeople: vi.fn().mockResolvedValue([]),
  listAwards: vi.fn().mockResolvedValue([]),
  listMedia: vi.fn().mockResolvedValue([]),
  publicContentDraft: vi.fn().mockResolvedValue(null),
  publication: vi.fn().mockResolvedValue(null),
  recordActivity: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api/client", () => ({
  dossierApi: { listTypes: vi.fn().mockResolvedValue([]) },
  historicalNominationApi: api,
  mediaApi: { signedUrl: vi.fn() },
  publicApi: { categories: vi.fn().mockResolvedValue([]) },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

beforeEach(() => {
  vi.clearAllMocks();
});

it("refreshes the record version before opening the edit form", async () => {
  let resolveLatest!: (value: HistoricalNomination) => void;
  const latestRecord = {
    ...record,
    title: "Hồ sơ vừa được cập nhật",
    updatedAt: "2026-11-16T07:43:00.000Z",
  };
  api.get.mockImplementationOnce(
    () =>
      new Promise<HistoricalNomination>((resolve) => {
        resolveLatest = resolve;
      }),
  );
  api.get.mockResolvedValue(latestRecord);
  api.update.mockRejectedValue(new Error("409 Conflict"));

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false, staleTime: Infinity },
    },
  });
  queryClient.setQueryData(["historical-nomination", record.id], record);

  render(
    <QueryClientProvider client={queryClient}>
      <DataManagerRecordWorkspace recordId={record.id} />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Sửa thông tin" }));

  await waitFor(() => expect(api.get).toHaveBeenCalledWith(record.id));
  expect(screen.queryByRole("heading", { name: "Chỉnh sửa hồ sơ" })).toBeNull();
  expect(screen.getByRole("button", { name: "Sửa thông tin" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Đang kiểm tra phiên bản hồ sơ mới nhất",
  );

  await act(async () => resolveLatest(latestRecord));

  expect(
    await screen.findByRole("heading", { name: "Chỉnh sửa hồ sơ" }),
  ).toBeTruthy();
  expect(screen.getByDisplayValue(latestRecord.title)).toBeTruthy();

  queryClient.setQueryData(["historical-nomination", record.id], {
    ...latestRecord,
    title: "Hồ sơ cập nhật trong lúc đang sửa",
    updatedAt: "2026-11-16T08:00:00.000Z",
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu bản nháp" }));

  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ expectedUpdatedAt: latestRecord.updatedAt }),
    ),
  );
});
