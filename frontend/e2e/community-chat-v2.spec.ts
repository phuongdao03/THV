import { expect, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  success: true,
  data,
  meta: { requestId: "chat-redesign" },
});
const username = "chat-admin";
const screenshotStyle = "nextjs-portal { display: none !important; }";
const author = {
  id: "chat-admin-id",
  username,
  displayName: "Quản trị viên THV",
  avatarUrl: null,
  isAdmin: true,
};
const history = {
  items: [
    {
      id: "message-0",
      username: null,
      displayName: "Lan Anh",
      avatarUrl: null,
      tier: "COMPANION",
      body: "Mọi người có gợi ý làng nghề nào để tham quan cuối tuần không?",
      createdAt: "2026-11-19T08:00:00Z",
      editedAt: null,
      isAdmin: false,
      canEdit: false,
      canRemove: false,
    },
    {
      ...author,
      id: "message-1",
      tier: "MEMBER",
      body: "Chào mừng đến phòng Đồng hành.",
      createdAt: "2026-11-20T02:00:00Z",
      editedAt: null,
      canEdit: false,
      canRemove: false,
    },
  ],
  hasMore: false,
  nextCursor: null,
};

test("guest browses room list with one sign-in link and no history requests", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/v1/community/chat/**/messages*", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 401, json: { success: false } });
  });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/community/chat");
  await expect(
    page.getByRole("heading", { level: 1, name: "Trò chuyện hội viên" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Đăng nhập để trò chuyện" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Phòng Đồng hành" }).click();
  await expect(
    page.getByRole("navigation", { name: "Các phòng hội viên" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tin nhắn" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("chat separates mobile screens, preserves drafts, and opens the shared Admin card", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    {
      name: "cns_access",
      value: "e2e-access",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
    },
    {
      name: "cns_refresh",
      value: "e2e-refresh",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
    },
    { name: "cns_csrf", value: "e2e-csrf", domain: "127.0.0.1", path: "/" },
  ]);
  const historyRooms: string[] = [];
  await page.route("**/api/v1/community/chat/**", (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const room = parts.at(-2);
    if (parts.at(-1) === "access") {
      return route.fulfill({
        json: envelope({
          room,
          allowed: room !== "PRESTIGE",
          source: room === "PRESTIGE" ? "NONE" : "MANUAL",
        }),
      });
    }
    historyRooms.push(room ?? "");
    return route.fulfill({ json: envelope(history) });
  });
  await page.route(`**/api/v1/community/members/${username}`, (route) =>
    route.fulfill({
      json: envelope({
        ...author,
        bio: "Hồ sơ công khai.",
        publishedPostCount: 1,
        followerCount: 0,
      }),
    }),
  );

  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto("/community/chat");
  const list = page.getByRole("navigation", { name: "Các phòng hội viên" });
  const companion = list.getByRole("button", { name: "Phòng Đồng hành" });
  const prestige = list.getByRole("button", { name: "Phòng Tinh hoa" });
  const back = page.getByRole("button", { name: "Quay lại danh sách phòng" });
  const composer = page.getByRole("textbox", { name: "Tin nhắn" });
  const bottomNav = page.locator(".site-mobile-navigation");
  await expect(companion).toBeVisible();
  await expect(composer).toBeHidden();
  await expect(bottomNav).toBeVisible();
  await page.screenshot({
    path: info.outputPath("chat-rooms-mobile.png"),
    style: screenshotStyle,
  });

  await companion.click();
  await expect(list).toBeHidden();
  await expect(bottomNav).toBeHidden();
  await expect(composer).toBeVisible();
  await composer.fill("Bản nháp phòng Đồng hành");
  await page
    .getByRole("link", { name: author.displayName, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: author.displayName }),
  ).toContainText("Hồ sơ công khai.");
  await page.keyboard.press("Escape");
  await back.click();
  await expect(companion).toBeFocused();
  await expect(bottomNav).toBeVisible();
  await prestige.click();
  await expect(
    page.getByText(/Phòng này dành cho hạng Kim cương/),
  ).toBeVisible();
  await expect(composer).toHaveCount(0);
  expect(historyRooms).not.toContain("PRESTIGE");
  await back.click();
  await companion.click();
  await expect(composer).toHaveValue("Bản nháp phòng Đồng hành");

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [320, 375, 390, 400, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 530 : 900 });
      await expect(composer).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if (width === 390 || width === 1440) {
        await page.screenshot({
          path: info.outputPath(`chat-${theme}-${width}.png`),
          style: screenshotStyle,
        });
      }
    }
  }
});
