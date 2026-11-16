import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { DataManagerContentWorkspace } from "@/components/historical-nominations/data-manager-content-workspace";

vi.mock(
  "@/components/historical-nominations/historical-data-manager-workspace",
  () => ({
    HistoricalDataManagerWorkspace: () => (
      <section aria-label="Hồ sơ lịch sử">
        <h2>Tổng quan hồ sơ lịch sử</h2>
        Bổ sung hồ sơ đề cử, người gửi và tài liệu nguồn.
      </section>
    ),
  }),
);
vi.mock("@/components/admin/certificate-correction-list", () => ({
  CertificateCorrectionList: () => <div />,
}));
vi.mock("@/components/admin/certificate-content-correction", () => ({
  CertificateContentCorrection: () => <div />,
}));
vi.mock("@/components/admin/certificate-content-drafts", () => ({
  CertificateContentDrafts: () => <div />,
}));
vi.mock("@/components/certificates/certificate-archive-workspace", () => ({
  CertificateArchiveWorkspace: () => <div />,
}));
vi.mock("@/components/admin/public-work-editor", () => ({
  PublicWorkEditor: () => <div>Trình biên tập nội dung công bố</div>,
}));

it("opens directly on the historical record list without nested tabs", () => {
  render(<DataManagerContentWorkspace />);

  expect(screen.getByRole("region", { name: "Hồ sơ lịch sử" })).toBeTruthy();
  expect(screen.queryByRole("tab")).toBeNull();
});

it("keeps publication editing and certificate tools inside the publication area", () => {
  render(<DataManagerContentWorkspace initialTab="public-content" />);

  expect(screen.getByText("Trình biên tập nội dung công bố")).toBeTruthy();
  expect(screen.getByText("Quản lý bằng số và scan lưu trữ")).toBeTruthy();
  expect(screen.queryByRole("tab")).toBeNull();
});

it("opens the historical records route when returning from a source record", () => {
  render(<DataManagerContentWorkspace initialTab="historical-records" />);

  expect(screen.getByRole("region", { name: "Hồ sơ lịch sử" })).toBeTruthy();
});
