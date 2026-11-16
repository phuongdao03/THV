import { expect, test } from "@playwright/test";
import type { HistoricalNomination } from "../src/lib/api/historical-nomination-types";

test.use({ serviceWorkers: "block" });

const recordId = "e57912cc-714c-4ab5-9fd9-1c5b38cd902b";
const recordCode = "THV-LS-2026-0000000000000001";
const initialUpdatedAt = "2026-11-14T00:00:00Z";
const savedUpdatedAt = "2026-11-16T04:05:00Z";
const envelope = <Data>(data: Data) => ({
  success: true as const,
  data,
  meta: { request_id: "historical-save-e2e" },
});

test("data manager saves historical dates and sees persisted edits after reload", async ({
  context,
  page,
}, info) => {
  await context.addCookies(
    (
      [
        ["cns_access", "e2e-access"],
        ["cns_refresh", "e2e-refresh"],
        ["cns_csrf", "e2e-csrf"],
        ["cns_e2e_persona", "data-manager"],
      ] as const
    ).map(([name, value]) => ({
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax" as const,
    })),
  );

  let persistedRecord: HistoricalNomination = {
    id: recordId,
    code: recordCode,
    subjectType: "PERSON",
    subjectName: "Nghệ nhân Nguyễn An",
    title: "Gìn giữ nghề thủ công truyền thống",
    summary: "Tư liệu được nhập trong hệ thống lưu trữ.",
    description: null,
    dossierTypeId: null,
    categoryId: null,
    legacyCategoryLabel: null,
    nominationYear: 2020,
    nominatedAt: null,
    historicalResult: null,
    sourceKind: "ARCHIVE",
    sourceLabel: "Tư liệu lưu trữ",
    sourceReference: null,
    sourceRecordedAt: null,
    provenanceNotes: null,
    verificationStatus: "DRAFT",
    archiveStatus: "ACTIVE",
    archiveReason: null,
    publicationStatus: "NOT_PUBLISHED",
    missingFieldsJson: [],
    submittedAt: null,
    verifiedAt: null,
    verificationReason: null,
    createdAt: initialUpdatedAt,
    updatedAt: initialUpdatedAt,
    mediaCount: 0,
    photoVideoCount: 0,
    documentCount: 0,
    awardCount: 0,
  };
  const patchBodies: Record<string, unknown>[] = [];
  const apiRecordUrl = `**/api/v1/historical-nominations/${recordId}`;

  await page.route(apiRecordUrl, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({ json: envelope(persistedRecord) });
      return;
    }
    if (method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      persistedRecord = {
        ...persistedRecord,
        subjectName: String(body.subjectName ?? persistedRecord.subjectName),
        title: String(body.title ?? persistedRecord.title),
        nominationYear:
          typeof body.nominationYear === "number"
            ? body.nominationYear
            : persistedRecord.nominationYear,
        nominatedAt:
          typeof body.nominatedAt === "string" ? body.nominatedAt : null,
        updatedAt: savedUpdatedAt,
      };
      await route.fulfill({ json: envelope(persistedRecord) });
      return;
    }
    await route.continue();
  });

  await page.goto("/data-manager");
  await page
    .getByRole("link", { name: /Gìn giữ nghề thủ công truyền thống/ })
    .click();
  await expect(page.getByText(recordCode)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Các bước hoàn thiện hồ sơ" }),
  ).toContainText("Lưu từng phần để tiếp tục sau.");
  await expect(
    page.getByRole("button", { name: "Soạn nội dung công khai", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "mobile-chrome") {
    const sectionPicker = page.getByLabel("Chọn mục hồ sơ");
    await expect(sectionPicker).toBeVisible();
    await expect(page.getByRole("tablist")).not.toBeVisible();
    await sectionPicker.selectOption("Bằng xác lập");
    await expect(
      page.getByRole("heading", { name: "Bằng xác lập đã cấp" }),
    ).toBeVisible();
    await sectionPicker.selectOption("Thông tin");
  }
  await page
    .getByRole("button", { name: "Sửa thông tin", exact: true })
    .click();

  await page.getByLabel("Tên hồ sơ đề cử").fill("Nghề thủ công truyền thống");
  await expect(page.getByLabel("Năm đề cử (nếu chỉ biết năm)")).toHaveCount(0);
  await page.getByLabel("Thời gian đề cử").fill("15/05/2020");
  await page.getByRole("button", { name: "Lưu bản nháp" }).click();

  const saveStatus = page.getByRole("status");
  await expect(saveStatus).toContainText("Đã lưu thay đổi lúc");
  await expect
    .poll(() =>
      saveStatus.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeGreaterThan(80);
  await expect(
    page.getByRole("heading", { name: "Nghề thủ công truyền thống" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Soạn nội dung công khai" }).click();
  await expect(
    page.getByRole("heading", { name: "Nội dung dự kiến công bố" }),
  ).toBeVisible();
  const publicTitle = page.getByLabel("Tiêu đề công khai");
  await publicTitle.fill("Nghề thủ công truyền thống");
  const savePublicDraftButton = page.getByRole("button", {
    name: "Lưu nội dung dự kiến",
  });
  await expect(savePublicDraftButton).toBeVisible();
  const lightButtonBackground = await savePublicDraftButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(lightButtonBackground).not.toBe("rgba(0, 0, 0, 0)");
  if (info.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "Mở điều hướng workspace" }).click();
  }
  await page.getByRole("button", { name: "Giao diện tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkButtonBackground = await savePublicDraftButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(darkButtonBackground).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Giao diện sáng" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  if (info.project.name === "mobile-chrome") {
    await page
      .getByRole("dialog", { name: "Điều hướng workspace" })
      .getByRole("button", { name: "Đóng điều hướng workspace" })
      .click();
  }
  if (info.project.name === "mobile-chrome") {
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Bằng xác lập");
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Nội dung công khai");
  } else {
    await page.getByRole("tab", { name: "Bằng xác lập" }).click();
    await page.getByRole("tab", { name: "Nội dung công khai" }).click();
  }
  await expect(publicTitle).toHaveValue("Nghề thủ công truyền thống");

  if (info.project.name === "mobile-chrome") {
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Bằng xác lập");
  } else {
    await page.getByRole("tab", { name: "Bằng xác lập" }).click();
  }
  await expect(
    page.getByRole("button", { name: "Thêm bằng cũ" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Tên bằng xác lập / giải thưởng"),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Thêm bằng cũ" }).click();
  const awardName = page.getByLabel("Tên bằng xác lập / giải thưởng");
  await expect(awardName).toBeVisible();
  await awardName.fill("Bằng xác lập năm 1998");
  if (info.project.name === "mobile-chrome") {
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Thông tin");
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Bằng xác lập");
  } else {
    await page.getByRole("tab", { name: "Thông tin" }).click();
    await page.getByRole("tab", { name: "Bằng xác lập" }).click();
  }
  await expect(awardName).toHaveValue("Bằng xác lập năm 1998");
  await page.getByRole("button", { name: "Hủy" }).click();
  if (info.project.name === "mobile-chrome") {
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Thông tin");
  } else {
    await page.getByRole("tab", { name: "Thông tin" }).click();
  }
  expect(patchBodies).toHaveLength(1);
  expect(patchBodies[0]).toMatchObject({
    title: "Nghề thủ công truyền thống",
    nominationYear: 2020,
    nominatedAt: "2020-05-15",
    expectedUpdatedAt: initialUpdatedAt,
  });
  await page.screenshot({
    path: info.outputPath("historical-data-manager-save.png"),
  });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nghề thủ công truyền thống" }),
  ).toBeVisible();
  if (info.project.name === "mobile-chrome") {
    await page.getByLabel("Chọn mục hồ sơ").selectOption("Thông tin");
  } else {
    await page.getByRole("tab", { name: "Thông tin" }).click();
  }
  await expect(page.getByText("15/05/2020", { exact: true })).toBeVisible();
});

test("confirms before browser back leaves a dirty historical record", async ({
  context,
  page,
}) => {
  await context.addCookies(
    (
      [
        ["cns_access", "e2e-access"],
        ["cns_refresh", "e2e-refresh"],
        ["cns_csrf", "e2e-csrf"],
        ["cns_e2e_persona", "data-manager"],
      ] as const
    ).map(([name, value]) => ({
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax" as const,
    })),
  );

  let persistedRecord: HistoricalNomination | null = null;
  const patchBodies: Record<string, unknown>[] = [];
  await page.route(
    `**/api/v1/historical-nominations/${recordId}`,
    async (route) => {
      if (route.request().method() === "GET") {
        if (persistedRecord) {
          await route.fulfill({ json: envelope(persistedRecord) });
          return;
        }
        const response = await route.fetch();
        const payload = (await response.json()) as {
          data: HistoricalNomination;
        };
        persistedRecord = payload.data;
        await route.fulfill({ response });
        return;
      }
      if (route.request().method() === "PATCH" && persistedRecord) {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        patchBodies.push(body);
        persistedRecord = {
          ...persistedRecord,
          title: String(body.title ?? persistedRecord.title),
          updatedAt: savedUpdatedAt,
        };
        await route.fulfill({ json: envelope(persistedRecord) });
        return;
      }
      await route.continue();
    },
  );

  await page.goto("/data-manager");
  await page
    .getByRole("link", { name: /Gìn giữ nghề thủ công truyền thống/ })
    .click();
  await page
    .getByRole("button", { name: "Sửa thông tin", exact: true })
    .click();
  await page.getByLabel("Tên hồ sơ đề cử").fill("Thay đổi chưa lưu");

  await page.goBack();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page).toHaveURL(/\/data-manager\/records\//);

  await page.getByRole("button", { name: "Tiếp tục chỉnh sửa" }).click();
  await expect(page.getByLabel("Tên hồ sơ đề cử")).toHaveValue(
    "Thay đổi chưa lưu",
  );
  await page.goBack();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Lưu rồi rời trang" }).click();
  await expect(page).toHaveURL(/\/data-manager\/?$/);
  expect(patchBodies.at(-1)?.title).toBe("Thay đổi chưa lưu");

  await page
    .getByRole("link", { name: /Gìn giữ nghề thủ công truyền thống/ })
    .click();
  await page
    .getByRole("button", { name: "Sửa thông tin", exact: true })
    .click();
  await page.getByLabel("Tên hồ sơ đề cử").fill("Thay đổi sẽ bỏ");
  await page.goBack();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Bỏ thay đổi" }).click();
  await expect(page).toHaveURL(/\/data-manager\/?$/);
});
