import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const id = "4fb1fd62-5815-417c-8ddc-b755dc1bf52f";
const mediaId = "e57912cc-714c-4ab5-9fd9-1c5b38cd902b";
const record = {
  id,
  source: "CURRENT",
  code: "CNS-2020-ARCHIVE",
  title: "Bộ hồ sơ được bảo toàn sau công bố",
  subject: "owner@example.test",
  ownerUserId: "4fb1fd62-5815-417c-8ddc-b755dc1bf52e",
  ownerName: "Nguyễn Văn Chủ Hồ Sơ",
  ownerEmail: "owner@example.test",
  year: 2020,
  categoryId: null,
  categoryName: "Di sản",
  recordedAt: "2020-05-15T00:00:00Z",
  versionNo: 2,
  businessStatus: "PUBLISHED",
  publicationStatus: "HIDDEN",
  archiveStatus: null,
  documentCount: 1,
  imageCount: 2,
  videoCount: 1,
  certificateCount: 1,
  certificateReference: "THV-2020-001",
  updatedAt: "2026-11-17T00:00:00Z",
};
const envelope = (data: unknown, total = 1) => ({
  success: true,
  data,
  meta: { request_id: "archive-e2e", page: 1, page_size: 25, total },
});
const entry = {
  id: mediaId,
  title: "Tài liệu nộp ban đầu.pdf",
  status: "ACTIVE",
  occurredAt: "2020-05-15T00:00:00Z",
  actor: "Người nộp hồ sơ",
  versionId: id,
  versionNo: 2,
  mediaId,
  mimeType: "application/pdf",
  bytes: 1024,
  checksum: "a".repeat(64),
  facts: { access_scope: "PRIVATE" },
};

test("admin browses a retained source and keeps missing-file errors separate from empty metadata", async ({
  context,
  page,
}, info) => {
  await context.addCookies([
    {
      name: "cns_access",
      value: "e2e-super-admin-access",
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
    {
      name: "cns_csrf",
      value: "e2e-csrf",
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/v1/admin/nomination-records**", async (route) => {
    expect(route.request().method()).toBe("GET");
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/admin/nomination-records")
      return route.fulfill({ json: envelope([record]) });
    if (path.endsWith(`/${id}`))
      return route.fulfill({ json: envelope(record) });
    if (path.endsWith("/documents"))
      return route.fulfill({ json: envelope([entry]) });
    if (path.endsWith("/publication"))
      return route.fulfill({
        json: envelope([
          {
            ...entry,
            id,
            title: "Nội dung đã ẩn",
            mediaId: null,
            status: "HIDDEN",
            facts: {
              slug: "retained-source",
              version: 2,
              short_description: "Bản công bố tách biệt với nguồn.",
            },
          },
        ]),
      });
    if (path.endsWith("/decisions"))
      return route.fulfill({
        json: envelope([
          {
            ...entry,
            mediaId: null,
            title: "Quyết định đã ghi nhận",
            status: "APPROVED",
            facts: { note: "Căn cứ theo hồ sơ đã nộp." },
          },
        ]),
      });
    if (path.endsWith("/people"))
      return route.fulfill({
        json: envelope([
          {
            ...entry,
            mediaId: null,
            title: "Người nộp",
            facts: {
              owner_user_id: "owner@example.test",
              summary: "Hồ sơ nguồn vẫn được lưu sau khi ẩn nội dung công bố.",
            },
          },
        ]),
      });
    return route.fulfill({ json: envelope([], 0) });
  });
  await page.route(`**/api/v1/media/${mediaId}/signed-url`, (route) =>
    route.fulfill({
      status: 404,
      json: {
        success: false,
        error: {
          code: "MEDIA_NOT_FOUND",
          message: "Tệp không còn tải được từ nơi lưu trữ.",
        },
      },
    }),
  );
  await page.goto("/admin/nomination-records");
  await expect(
    page.getByRole("heading", { name: "Kho hồ sơ đề cử", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tìm hồ sơ").fill("THV-2020-ARCHIVE");
  await page
    .getByRole("button", { name: "Tra cứu hồ sơ", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("nomination-archive-list.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: record.title }).click();
  await expect(page.getByRole("heading", { name: record.title })).toBeVisible();
  async function section(value: string, label: string) {
    if (info.project.name === "mobile-chrome")
      await page.getByLabel("Chọn mục hồ sơ").selectOption(value);
    else await page.getByRole("button", { name: label, exact: true }).click();
  }
  await section("documents", "Tài liệu hồ sơ");
  await page
    .getByRole("button", { name: "Xem Tài liệu nộp ban đầu.pdf", exact: true })
    .click();
  await expect(
    page.getByText(/Không thể tạo liên kết bảo mật cho tài liệu/).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", {
        name: "Tài liệu nộp ban đầu.pdf",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("nomination-archive-documents.png"),
    fullPage: true,
  });
  await section("decisions", "Quyết định");
  await expect(page.getByText("Căn cứ theo hồ sơ đã nộp.")).toBeVisible();
  await section("publication", "Nội dung công bố");
  await expect(
    page.getByRole("link", { name: "Mở trình biên tập công bố" }),
  ).toHaveAttribute(
    "href",
    `/admin/content?workId=${id}&source=CURRENT&recordId=${id}`,
  );
  await section("documents", "Tài liệu hồ sơ");
  await expect(
    page.getByRole("button", {
      name: "Xem Tài liệu nộp ban đầu.pdf",
      exact: true,
    }),
  ).toBeVisible();
});
