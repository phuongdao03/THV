import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LinkedHistoricalRecords } from "./linked-historical-records";

const mine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ historicalNominationApi: { mine } }));
beforeEach(() => mine.mockReset());
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LinkedHistoricalRecords />
    </QueryClientProvider>,
  );
}
it("shows linked nominations and historical awards without management actions", async () => {
  mine.mockResolvedValue({
    data: [
      {
        id: "record-1",
        code: "THV-LS-2020-1",
        title: "Đề cử đã nhập",
        subjectName: "Nghệ nhân A",
        nominationYear: 2020,
        awards: [
          {
            id: "award-1",
            awardName: "Nghệ nhân tiêu biểu",
            certificateNumber: "OLD-123",
            issuedAt: "2020-05-15",
            issuedBy: "Đơn vị cấp cũ",
          },
        ],
      },
    ],
    meta: { total: 1 },
  });
  show();
  await screen.findByText("THV-LS-2020-1", { exact: false });
  fireEvent.click(screen.getByText("Xem bằng: Nghệ nhân tiêu biểu"));
  expect(screen.getByText("OLD-123")).toBeTruthy();
  expect(screen.getByText("Đơn vị cấp cũ")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Sửa|Xuất bản/ })).toBeNull();
});
it("explains how a registered user gets an old nomination linked", async () => {
  mine.mockResolvedValue({ data: [], meta: { total: 0 } });
  show();
  expect(
    await screen.findByText(/hãy liên hệ nhân viên và cung cấp email/),
  ).toBeTruthy();
});
