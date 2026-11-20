"use client";

import "../membership/community-chat.css";

import { useQueries } from "@tanstack/react-query";
import { ChevronRight, LockKeyhole } from "lucide-react";
import Link from "next/link";

import {
  ChatRoomIcon,
  chatRooms,
} from "@/components/membership/community-chat-rooms";
import { membershipApi } from "@/lib/api/client";
import { useAuthStatus, useAuthUser } from "@/lib/auth/user-context";

const chatHref = "/community/chat";

export function CommunityVipRooms() {
  const authStatus = useAuthStatus();
  const user = useAuthUser();
  const signedIn = authStatus === "authenticated" && Boolean(user?.id);
  const roomAccess = useQueries({
    queries: chatRooms.map(({ key }) => ({
      queryKey: ["membership-chat-access", user?.id, key],
      queryFn: () => membershipApi.chatAccess(key),
      enabled: signedIn,
      staleTime: 30_000,
      retry: false,
    })),
  });

  return (
    <section
      aria-labelledby="community-member-rooms-heading"
      className="member-room-entry"
    >
      <h2 id="community-member-rooms-heading" className="text-lg font-semibold">
        Trò chuyện hội viên
      </h2>
      <ul className="member-room-entry__list">
        {chatRooms.map((room, index) => {
          const access = roomAccess[index];
          const locked = signedIn && access?.data?.allowed === false;
          const status =
            authStatus === "loading" || (signedIn && access?.isPending)
              ? "Đang kiểm tra"
              : access?.isError
                ? "Chưa xác định quyền"
                : locked
                  ? "Đang khóa"
                  : access?.data?.allowed
                    ? "Có thể tham gia"
                    : room.audience;
          return (
            <li key={room.key}>
              <Link
                className="member-room-entry__row"
                href={`${chatHref}?room=${room.key}`}
              >
                <ChatRoomIcon room={room.key} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {room.label}
                  </span>
                  <span className="block text-xs text-[var(--theme-muted)]">
                    {room.summary}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--theme-muted)]">
                    {status === room.audience
                      ? status
                      : `${room.audience} · ${status}`}
                  </span>
                </span>
                {locked ? (
                  <LockKeyhole aria-hidden="true" size={15} />
                ) : (
                  <ChevronRight aria-hidden="true" size={16} />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        className="member-chat-link"
        href={
          authStatus === "unauthenticated"
            ? `/login?next=${encodeURIComponent(chatHref)}`
            : chatHref
        }
      >
        {authStatus === "unauthenticated"
          ? "Đăng nhập để trò chuyện"
          : "Mở khu vực trò chuyện"}
      </Link>
    </section>
  );
}
