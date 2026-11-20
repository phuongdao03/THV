import type { Metadata } from "next";

import { CommunityChat } from "@/components/membership/community-chat";
import { parseChatRoom } from "@/components/membership/community-chat-rooms";

export const metadata: Metadata = {
  title: "Trò chuyện hội viên",
  alternates: { canonical: "/community/chat" },
};

export default async function CommunityChatPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string | string[] }>;
}) {
  const { room } = await searchParams;
  return (
    <div className="public-theme-surface px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <CommunityChat dedicated initialRoom={parseChatRoom(room)} />
      </div>
    </div>
  );
}
