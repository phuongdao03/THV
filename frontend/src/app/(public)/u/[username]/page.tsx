import type { Metadata } from "next";

import { CommunityMemberProfile } from "@/components/community/community-member-profile";

export const metadata: Metadata = { title: "Hồ sơ thành viên" };

export default async function PublicUsernamePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string; view?: string }>;
}) {
  const [{ username }, { page, view }] = await Promise.all([
    params,
    searchParams,
  ]);
  const parsedPage = Number(page);
  return (
    <CommunityMemberProfile
      username={username}
      page={
        Number.isSafeInteger(parsedPage)
          ? Math.min(10_000, Math.max(1, parsedPage))
          : 1
      }
      view={view === "followers" || view === "following" ? view : "posts"}
      vanityRoute
    />
  );
}
