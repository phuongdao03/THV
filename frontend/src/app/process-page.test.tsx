import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProcessPage from "@/app/(public)/process/page";

describe("ProcessPage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("explains the five stages and keeps preview submission links gated", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_MODE", "preview");
    render(<ProcessPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Quy trình đề cử và xác lập",
      }),
    ).toBeDefined();
    [
      "Chuẩn bị thông tin và minh chứng",
      "Gửi hồ sơ",
      "Tiếp nhận và thẩm định",
      "Nhận kết quả xem xét",
      "Công bố và quản lý hồ sơ",
    ].forEach((title) => {
      expect(
        screen.getByRole("heading", { level: 3, name: title }),
      ).toBeDefined();
    });
    expect(screen.getByRole("heading", { name: "Cần bổ sung" })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Không được chấp thuận" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Đủ điều kiện đi tiếp" }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Bắt đầu gửi hồ sơ" })
        .getAttribute("href"),
    ).toBe("/coming-soon/submission");
    expect(
      screen
        .getByRole("link", { name: "Tạo hồ sơ đề cử" })
        .getAttribute("href"),
    ).toBe("/coming-soon/submission");
    expect(
      screen
        .getByRole("link", { name: "Xem các giai đoạn" })
        .getAttribute("href"),
    ).toBe("#process-details");
    expect(
      screen.getByText(/không đồng nghĩa với việc chắc chắn được chấp thuận/i),
    ).toBeDefined();
    expect(screen.queryByText(/5\.000\.000/)).toBeNull();
  });

  it("opens stage details and answers supplement questions", () => {
    const { container } = render(<ProcessPage />);

    const pageCopy =
      container.querySelector(".process-page")?.textContent ?? "";
    expect(pageCopy).not.toMatch(/phí|thanh toán|voucher|miễn/i);

    const submissionDetails = document.querySelectorAll<HTMLElement>(
      ".process-stage__details > summary",
    )[1]!;
    fireEvent.click(submissionDetails);
    expect(screen.getByText(/Trước khi xác nhận/)).toBeDefined();

    fireEvent.click(
      screen.getByText("Tôi có thể bổ sung tài liệu sau khi gửi không?"),
    );
    expect(screen.getByText(/cập nhật phần được yêu cầu/i)).toBeDefined();
  });
  it("links to dossier creation in full release mode", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_MODE", "full");
    render(<ProcessPage />);

    expect(
      screen
        .getByRole("link", { name: "Bắt đầu gửi hồ sơ" })
        .getAttribute("href"),
    ).toBe("/dossiers/new");
    expect(
      screen
        .getByRole("link", { name: "Tạo hồ sơ đề cử" })
        .getAttribute("href"),
    ).toBe("/dossiers/new");
    expect(
      screen
        .getByRole("link", { name: "Tra cứu kết quả" })
        .getAttribute("href"),
    ).toBe("/verify");
  });
});
