import { expect, test } from "@playwright/test";

const username = "member-50000000000000000000000000000002";
const author = {
  id: "50000000-0000-0000-0000-000000000002",
  username,
  displayName: "Quản trị viên THV",
  avatarUrl: null,
  isAdmin: true,
  roleLabel: "Quản trị viên",
  membershipTier: "MEMBER",
};
const category = { id: "heritage", slug: "heritage", name: "Di sản" };
const post = {
  id: "public-post",
  slug: "di-san-lang-viet",
  title: "Di sản làng Việt",
  excerpt: "Một chuyến đi tìm hiểu nghề truyền thống.",
  publishedAt: "2026-11-12T00:00:00Z",
  author,
  category,
  images: [],
  likeCount: 0,
  commentCount: 0,
  viewCount: 0,
};
const envelope = (data: unknown) => ({
  success: true,
  data,
  meta: { requestId: "community-e2e", page: 1, pageSize: 20, total: 1 },
});

test("community Admin card and public profile work from mobile to desktop", async ({
  page,
}, info) => {
  const requests: string[] = [];
  await page.route("**/api/v1/community/**", (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/categories"))
      return route.fulfill({ json: envelope([category]) });
    if (pathname.endsWith("/posts"))
      return route.fulfill({ json: envelope([post]) });
    if (pathname.endsWith(`/members/${username}`)) {
      requests.push(pathname);
      return route.fulfill({
        json: envelope({
          ...author,
          bio: "Chia sẻ câu chuyện di sản Việt.",
          joinedAt: "2026-01-01T00:00:00Z",
          publishedPostCount: 1,
          followerCount: 0,
          followingCount: 0,
          viewerIsFollowing: false,
          professionalLinks: [],
        }),
      });
    }
    return route.fallback();
  });
  await page.goto("/community");
  const trigger = page.getByRole("link", {
    name: author.displayName,
    exact: true,
  });
  await expect(trigger).toBeVisible();
  expect(requests).toEqual([]);

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      if (theme === "light" && width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath("community-feed-light-390.png"),
        });
      }
      await trigger.focus();
      await trigger.press("Enter");
      const card = page.getByRole("dialog", { name: author.displayName });
      await expect(card).toBeVisible();
      await expect(card.getByText(`@${username}`, { exact: true })).toHaveCount(
        0,
      );
      await expect(page.locator("html")).not.toHaveAttribute(
        "data-navigation-pending",
        "true",
      );
      await expect(
        card.getByText("Chia sẻ câu chuyện di sản Việt."),
      ).toBeVisible();
      await expect(
        card.getByRole("button", { name: "Đóng hồ sơ nhanh" }),
      ).toBeFocused();
      const bounds = await card.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(851);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if (width === 390 || width === 1440) {
        await page.screenshot({
          path: info.outputPath(`community-admin-${theme}-${width}.png`),
        });
      }
      await page.keyboard.press("Escape");
      await expect(card).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  }

  await trigger.click();
  await page.getByRole("button", { name: "Đóng hồ sơ nhanh" }).press("Tab");
  const profileLink = page.getByRole("link", {
    name: "Xem hồ sơ",
    exact: true,
  });
  await expect(profileLink).toBeFocused();
  await profileLink.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/community/members/${username}$`));
  await expect(
    page.getByRole("heading", { name: author.displayName, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(`@${username}`, { exact: true })).toHaveCount(0);
});

test("old vanity usernames redirect to the same member's current handle", async ({
  page,
}) => {
  const current = "lan_anh";
  await page.route("**/api/v1/community/members/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/posts")) return route.fulfill({ json: envelope([]) });
    return route.fulfill({
      json: envelope({
        ...author,
        username: current,
        displayName: "Lan Anh",
        bio: null,
        joinedAt: "2026-01-01T00:00:00Z",
        publishedPostCount: 0,
        followerCount: 0,
        followingCount: 0,
        viewerIsFollowing: false,
      }),
    });
  });
  await page.goto("/u/ten_cu");
  await expect(page).toHaveURL(/\/u\/lan_anh$/);
  await expect(
    page.getByRole("heading", { name: "Lan Anh", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("@lan_anh", { exact: true })).toBeVisible();
});
