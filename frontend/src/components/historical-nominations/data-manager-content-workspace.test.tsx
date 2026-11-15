import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { DataManagerContentWorkspace } from "@/components/historical-nominations/data-manager-content-workspace";

vi.mock(
  "@/components/historical-nominations/historical-data-manager-workspace",
  () => ({
    HistoricalDataManagerWorkspace: () => (
      <section aria-label="Hồ sơ lịch sử">
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
  PublicWorkEditor: () => <div />,
}));

it("separates legacy source records from publication-ready content", () => {
  render(<DataManagerContentWorkspace />);

  expect(screen.getByRole("tab", { name: "Hồ sơ lịch sử" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Hồ sơ lịch sử" }));
  expect(screen.getByRole("region", { name: "Hồ sơ lịch sử" })).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Nội dung công bố" }));
  expect(screen.getByRole("region", { name: "Nội dung công bố" })).toBeTruthy();
});

it("opens the legacy records area when returning from a source record", () => {
  render(<DataManagerContentWorkspace initialTab="historical-records" />);

  expect(
    screen
      .getByRole("tab", { name: "Hồ sơ lịch sử" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByRole("region", { name: "Hồ sơ lịch sử" })).toBeTruthy();
});
