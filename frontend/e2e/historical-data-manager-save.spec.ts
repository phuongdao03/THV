import { expect, test } from "@playwright/test";
import type { HistoricalNomination } from "../src/lib/api/historical-nomination-types";

const recordId = "e57912cc-714c-4ab5-9fd9-1c5b38cd902b";
const recordCode = "HSLS-2024-001";
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

  await page.goto(`/data-manager/records/${recordId}`);
  await expect(page.getByText(recordCode)).toBeVisible();
  await page.getByRole("button", { name: "Sửa thông tin" }).click();

  await page.getByLabel("Tên hồ sơ đề cử").fill("Nghề thủ công truyền thống");
  await page.getByLabel("Ngày đề cử (nếu biết đầy đủ)").fill("15/05/2020");
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
  await page.getByRole("tab", { name: "Thông tin" }).click();
  await expect(page.getByText("15/05/2020", { exact: true })).toBeVisible();
});
