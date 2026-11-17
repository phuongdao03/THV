import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdminUserWorkspace } from "@/components/admin/admin-user-workspace";
import { AuthUserProvider } from "@/lib/auth/user-context";
import {
  adminUsersApi,
  auditApi,
  nominationArchiveApi,
  staffInvitationsApi,
} from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  adminUsersApi: {
    list: vi.fn(),
    detail: vi.fn(),
    changeStatus: vi.fn(),
    setSubmissionFeeTestExemption: vi.fn(),
  },
  auditApi: { list: vi.fn() },
  nominationArchiveApi: { list: vi.fn() },
  staffInvitationsApi: { createTestApplicant: vi.fn() },
  ApiError: class extends Error {},
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthUserProvider
        user={{
          id: "admin-1",
          email: "admin@thv.vn",
          roles: ["SUPER_ADMIN"],
          permissions: [
            "users.read",
            "users.suspend",
            "audit.read",
            "admin.staff.manage",
          ],
          accountType: null,
        }}
      >
        {children}
      </AuthUserProvider>
    </QueryClientProvider>
  );
}

describe("AdminUserWorkspace", () => {
  it("renders real paginated data for desktop and mobile and audits suspension", async () => {
    vi.mocked(adminUsersApi.list).mockResolvedValue({
      success: true,
      data: [
        {
          id: "user-1",
          email: "an@example.com",
          fullName: "Nguyen Van An",
          status: "ACTIVE",
          isTestAccount: true,
          submissionFeeTestExemption: false,
          submissionFeeTestExemptionChangedAt: null,
          submissionFeeTestExemptionChangedByUserId: null,
          isEmailVerified: true,
          providers: ["GOOGLE"],
          roles: ["USER"],
          createdAt: "2026-08-20T09:00:00Z",
          lastLoginAt: "2026-08-29T09:00:00Z",
          disabledAt: null,
          deletedAt: null,
        },
      ],
      meta: { request_id: "request-1", page: 1, pageSize: 20, total: 1 },
    });
    vi.mocked(adminUsersApi.detail).mockResolvedValue({
      id: "user-1",
      email: "an@example.com",
      fullName: "Nguyen Van An",
      status: "ACTIVE",
      isEmailVerified: true,
      isTestAccount: true,
      submissionFeeTestExemption: false,
      submissionFeeTestExemptionChangedAt: null,
      submissionFeeTestExemptionChangedByUserId: null,
      providers: ["GOOGLE"],
      roles: ["USER"],
      createdAt: "2026-08-20T09:00:00Z",
      lastLoginAt: "2026-08-29T09:00:00Z",
      disabledAt: null,
      deletedAt: null,
    });
    vi.mocked(auditApi.list).mockResolvedValue({
      success: true,
      data: [],
      meta: { request_id: "audit-1", page: 1, pageSize: 20, total: 0 },
    });
    vi.mocked(nominationArchiveApi.list).mockResolvedValue({
      success: true,
      data: [
        {
          id: "dossier-1",
          source: "CURRENT",
          code: "CNS-2026-001",
          title: "Hồ sơ của An",
          subject: "an@example.com",
          ownerUserId: "user-1",
          ownerName: "Nguyen Van An",
          ownerEmail: "an@example.com",
          year: 2026,
          categoryId: "category-1",
          categoryName: "Văn hóa",
          recordedAt: "2026-08-20T09:00:00Z",
          versionNo: 1,
          businessStatus: "SUBMITTED",
          publicationStatus: null,
          archiveStatus: null,
          documentCount: 2,
          imageCount: 1,
          videoCount: 0,
          certificateCount: 0,
          certificateReference: null,
          updatedAt: "2026-08-20T09:00:00Z",
        },
      ],
      meta: { request_id: "archive-1", page: 1, pageSize: 25, total: 1 },
    });
    vi.mocked(adminUsersApi.changeStatus).mockResolvedValue(undefined as never);
    vi.mocked(adminUsersApi.setSubmissionFeeTestExemption).mockResolvedValue({
      id: "user-1",
      email: "an@example.com",
      fullName: "Nguyen Van An",
      status: "ACTIVE",
      isEmailVerified: true,
      isTestAccount: true,
      submissionFeeTestExemption: true,
      submissionFeeTestExemptionChangedAt: "2026-11-13T10:00:00Z",
      submissionFeeTestExemptionChangedByUserId: "admin-1",
      providers: ["GOOGLE"],
      roles: ["USER"],
      createdAt: "2026-08-20T09:00:00Z",
      lastLoginAt: "2026-08-29T09:00:00Z",
      disabledAt: null,
      deletedAt: null,
    });
    vi.mocked(staffInvitationsApi.createTestApplicant).mockResolvedValue({
      id: "invitation-1",
    } as never);

    render(<AdminUserWorkspace />, { wrapper: Wrapper });

    expect(await screen.findAllByText("Nguyen Van An")).toHaveLength(2);
    expect(screen.getByTestId("admin-users-table").className).toContain(
      "hidden",
    );
    expect(screen.getByTestId("admin-users-mobile").className).toContain(
      "md:hidden",
    );
    expect(screen.getAllByText("Tài khoản TEST").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Mời tài khoản TEST mới (tùy chọn)").closest("details")
        ?.open,
    ).toBe(false);
    expect(screen.queryAllByText("Miễn phí kiểm thử")).toHaveLength(0);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Xem chi tiết" })[0]!,
    );
    expect(
      await screen.findByRole("dialog", { name: "Chi tiết tài khoản" }),
    ).toBeTruthy();
    expect(await screen.findByText("Hồ sơ của An")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Xem bộ hồ sơ" }).getAttribute("href"),
    ).toBe("/admin/nomination-records/CURRENT/dossier-1");
    expect(nominationArchiveApi.list).toHaveBeenCalledWith({
      owner_user_id: "user-1",
      page: "1",
      page_size: "25",
    });
    expect(
      await screen.findByText(/Tài khoản này có cờ TEST riêng/),
    ).toBeTruthy();
    await waitFor(() =>
      expect(auditApi.list).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        resourceType: "user",
        resourceId: "user-1",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Bật kiểm thử miễn phí" }),
    );
    expect(
      await screen.findByText(
        /Các giao dịch và hồ sơ đã phát sinh trước đó không bị thay đổi/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() =>
      expect(adminUsersApi.setSubmissionFeeTestExemption).toHaveBeenCalledWith(
        "user-1",
        true,
      ),
    );

    fireEvent.click(screen.getByText("Mời tài khoản TEST mới (tùy chọn)"));
    fireEvent.change(screen.getByLabelText("Email tài khoản TEST mới"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi lời mời TEST" }));
    await waitFor(() =>
      expect(staffInvitationsApi.createTestApplicant).toHaveBeenCalledWith(
        "test@example.com",
      ),
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Tạm đình chỉ" })[0]!,
    );
    fireEvent.change(screen.getByLabelText("Lý do thay đổi trạng thái"), {
      target: { value: "Phat hien dang nhap bat thuong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đình chỉ" }));

    await waitFor(() =>
      expect(adminUsersApi.changeStatus).toHaveBeenCalledWith("user-1", {
        status: "SUSPENDED",
        expectedStatus: "ACTIVE",
        reason: "Phat hien dang nhap bat thuong",
      }),
    );
  });
});
