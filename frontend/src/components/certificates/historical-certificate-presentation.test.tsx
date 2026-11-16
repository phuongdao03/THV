import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { HistoricalCertificatePresentation } from "./historical-certificate-presentation";

it("presents historical award facts without claiming blockchain verification", () => {
  render(
    <HistoricalCertificatePresentation
      title="Nghệ nhân tiêu biểu"
      number="THV-1998-01"
      recipient="Nguyễn Văn A"
      issuer="Trung tâm Tinh Hoa Việt"
      issuedAt="04/11/1998"
    />,
  );
  expect(screen.getByText("Nghệ nhân tiêu biểu")).toBeTruthy();
  expect(screen.getByText(/THV-1998-01/)).toBeTruthy();
  expect(screen.getByText(/Nguyễn Văn A/)).toBeTruthy();
  expect(screen.getByText(/Không có xác thực blockchain/)).toBeTruthy();
  expect(screen.getByText("Trung tâm Tinh Hoa Việt")).toBeTruthy();
  expect(screen.getByText("04/11/1998")).toBeTruthy();
  expect(screen.getByText("Tư liệu lịch sử · Bằng đã cấp")).toBeTruthy();
  expect(screen.queryByRole("img", { name: /Mã QR/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Chia sẻ" })).toBeNull();
});
