import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NominationArchivePage from "@/app/(dashboard)/admin/nomination-records/page";
import NominationArchiveRecordPage from "@/app/(dashboard)/admin/nomination-records/[source]/[id]/page";
import ReviewsLayout from "@/app/(dashboard)/reviews/layout";
import DataManagerLayout from "@/app/(dashboard)/data-manager/layout";
import { AuthUserProvider } from "@/lib/auth/user-context";

vi.mock("@/components/admin/nomination-archive", () => ({
  NominationArchive: () => <p>Nomination archive list</p>,
}));
vi.mock("@/components/admin/nomination-archive-detail", () => ({
  NominationArchiveDetail: ({
    source,
    recordId,
  }: {
    source: string;
    recordId: string;
  }) => <p>{`${source}:${recordId}`}</p>,
}));

function userWith(roles: string[]) {
  return {
    id: "user-1",
    email: "user@cnsgroup.vn",
    roles,
    accountType: "PUBLIC_USER" as const,
  };
}

describe("operations route gates", () => {
  it("blocks a public account from direct reviewer navigation", () => {
    render(
      <AuthUserProvider user={userWith(["PUBLIC_USER"])}>
        <ReviewsLayout>
          <p>Reviewer private content</p>
        </ReviewsLayout>
      </AuthUserProvider>,
    );

    expect(screen.queryByText("Reviewer private content")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Trang này chưa mở cho tài khoản của bạn",
      }),
    ).toBeDefined();
  });

  it("opens the review queue for a moderator", () => {
    render(
      <AuthUserProvider user={userWith(["MODERATOR"])}>
        <ReviewsLayout>
          <p>Review queue</p>
        </ReviewsLayout>
      </AuthUserProvider>,
    );
    expect(screen.getByText("Review queue")).toBeDefined();
  });

  it("opens the data-manager workspace only for the data-manager role", () => {
    const { rerender } = render(
      <AuthUserProvider user={userWith(["USER"])}>
        <DataManagerLayout>
          <p>Historical data workspace</p>
        </DataManagerLayout>
      </AuthUserProvider>,
    );

    expect(screen.queryByText("Historical data workspace")).toBeNull();

    rerender(
      <AuthUserProvider user={userWith(["DATA_MANAGER"])}>
        <DataManagerLayout>
          <p>Historical data workspace</p>
        </DataManagerLayout>
      </AuthUserProvider>,
    );
    expect(screen.getByText("Historical data workspace")).toBeDefined();
  });

  it("opens both read-only archive routes for a data manager", async () => {
    const listPage = render(
      <AuthUserProvider user={userWith(["DATA_MANAGER"])}>
        <NominationArchivePage />
      </AuthUserProvider>,
    );
    expect(screen.getByText("Nomination archive list")).toBeDefined();
    listPage.unmount();

    const detailPage = await NominationArchiveRecordPage({
      params: Promise.resolve({ source: "CURRENT", id: "record-1" }),
    });
    render(
      <AuthUserProvider user={userWith(["DATA_MANAGER"])}>
        {detailPage}
      </AuthUserProvider>,
    );
    expect(screen.getByText("CURRENT:record-1")).toBeDefined();
  });
});
