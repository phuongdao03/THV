import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CertificateArchiveWorkspace } from "@/components/certificates/certificate-archive-workspace";
import { certificateArchiveApi } from "@/lib/api/client";
import type { CertificateArchiveManagerData } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({
  certificateArchiveApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    hide: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  },
  publicWorkAdminApi: {
    list: vi.fn().mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    }),
  },
}));

vi.mock("@/lib/media/upload", () => ({ uploadMedia: vi.fn() }));

const archived: CertificateArchiveManagerData = {
  id: "archive-1",
  publicWorkId: "work-1",
  publicWorkTitle: "Tác phẩm cũ",
  status: "ARCHIVED",
  version: 3,
  draftVersionNo: 2,
  publishedVersionNo: 1,
  draft: {
    title: "Bằng scan cũ",
    awardName: null,
    certificateNumber: "OLD-001",
    recipientDisplayName: "Người nhận",
    issuerName: null,
    awardClass: null,
    issuedAt: null,
    issuedYear: 1998,
    publicNote: null,
    rightsConfirmed: true,
    privacyReviewed: true,
    pages: [],
  },
  published: null,
  updatedAt: "2026-11-15T00:00:00Z",
};

function renderWorkspace(canRestore = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CertificateArchiveWorkspace canRestore={canRestore} />
    </QueryClientProvider>,
  );
}

describe("CertificateArchiveWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(certificateArchiveApi.list).mockResolvedValue([archived]);
  });

  it("does not offer restore to DataManager", async () => {
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole("button", { name: /Bằng scan cũ/ }),
    );
    expect(screen.queryByRole("button", { name: "Khôi phục" })).toBeNull();
  });

  it("offers restore to Admin for an archived scan record", async () => {
    renderWorkspace(true);
    fireEvent.click(
      await screen.findByRole("button", { name: /Bằng scan cũ/ }),
    );
    expect(
      await screen.findByRole("button", { name: "Khôi phục" }),
    ).not.toBeNull();
  });
});
