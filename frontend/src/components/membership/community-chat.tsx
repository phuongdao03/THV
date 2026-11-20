"use client";
import "./community-chat.css";

import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Ellipsis,
  LockKeyhole,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  CommunityRoleBadge,
  CommunityUserIdentity,
} from "@/components/community/community-user-identity";
import { Button } from "@/components/ui/button";
import { MembershipAvatar } from "@/components/ui/membership-avatar";
import { ApiError, membershipApi } from "@/lib/api/client";
import type {
  CommunityChatMessage,
  CommunityChatPage,
  CommunityChatRoom,
} from "@/lib/api/types";
import { useAuthUser } from "@/lib/auth/user-context";
import Link from "next/link";
import { ChatRoomIcon, chatRooms } from "./community-chat-rooms";
import { membershipTiers } from "./member-card";

export type { CommunityChatRoom } from "@/lib/api/types";

type ChatHistoryData = {
  pages: CommunityChatPage[];
  pageParams: (string | null)[];
};

type ChatSendAttempt = {
  body: string;
  clientMessageId: string;
};

const dayFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "full",
  timeZone: "Asia/Ho_Chi_Minh",
});

function compareMessages(
  left: CommunityChatMessage,
  right: CommunityChatMessage,
) {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function mergeChatMessages(
  existing: CommunityChatMessage[],
  incoming: CommunityChatMessage[],
) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    const current = byId.get(message.id);
    if (
      current?.editedAt &&
      (!message.editedAt ||
        new Date(message.editedAt).getTime() <
          new Date(current.editedAt).getTime())
    ) {
      continue;
    }
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(compareMessages);
}

function mergeLatestPage(
  data: ChatHistoryData | undefined,
  latest: CommunityChatPage,
): ChatHistoryData {
  if (!data) return { pages: [latest], pageParams: [null] };
  return {
    ...data,
    pages: data.pages.map((page, index) =>
      index === 0
        ? { ...page, items: mergeChatMessages(page.items, latest.items) }
        : page,
    ),
  };
}

export function CommunityChat({
  initialRoom,
  dedicated = false,
}: {
  initialRoom?: CommunityChatRoom;
  dedicated?: boolean;
}) {
  const [room, setRoom] = useState<CommunityChatRoom>(initialRoom ?? "MEMBER");
  const [conversationOpen, setConversationOpen] = useState(
    Boolean(initialRoom),
  );
  const [smallScreen, setSmallScreen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const shell = useRef<HTMLElement>(null);
  const roomList = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const historyAnchor = useRef<{ firstId: string; offset: number } | null>(
    null,
  );
  const conversationActive = !dedicated || !smallScreen || conversationOpen;
  useEffect(() => {
    if (!dedicated) return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setSmallScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [dedicated]);

  useEffect(() => {
    if (
      !dedicated ||
      !smallScreen ||
      !conversationOpen ||
      !window.visualViewport
    )
      return;
    const viewport = window.visualViewport;
    const element = shell.current;
    if (!element) return;
    const resize = () => {
      element.style.setProperty(
        "--chat-viewport-height",
        `${viewport.height}px`,
      );
      element.style.setProperty(
        "--chat-viewport-top",
        `${viewport.offsetTop}px`,
      );
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
      element.style.removeProperty("--chat-viewport-height");
      element.style.removeProperty("--chat-viewport-top");
    };
  }, [dedicated, smallScreen, conversationOpen]);
  const [drafts, setDrafts] = useState<
    Partial<Record<CommunityChatRoom, string>>
  >({});
  const body = drafts[room] ?? "";
  const lastAttempt = useRef<
    Partial<Record<CommunityChatRoom, ChatSendAttempt>>
  >({});
  const sending = useRef(false);
  const timeline = useRef<HTMLDivElement>(null);
  const atLatest = useRef(true);
  const lastTail = useRef<CommunityChatMessage | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [removedMessageIds, setRemovedMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const user = useAuthUser();
  const client = useQueryClient();
  const historyKey = useMemo(
    () => ["membership-chat-history", user?.id, room],
    [room, user?.id],
  );
  const latestKey = [...historyKey, "latest"];
  const roomAccess = useQueries({
    queries: chatRooms.map(({ key }) => ({
      queryKey: ["membership-chat-access", user?.id, key],
      queryFn: () => membershipApi.chatAccess(key),
      enabled: Boolean(user?.id),
      staleTime: 30_000,
      refetchInterval: room === key ? 30_000 : false,
      retry: false,
    })),
  });
  const access = roomAccess[chatRooms.findIndex((item) => item.key === room)];
  const allowed = access?.data?.allowed === true;
  const history = useInfiniteQuery({
    queryKey: historyKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      membershipApi.messages(room, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: allowed && conversationActive,
    retry: false,
  });
  const latest = useQuery({
    queryKey: latestKey,
    queryFn: () => membershipApi.messages(room, { limit: 50 }),
    enabled: allowed && conversationActive && history.isSuccess,
    refetchInterval:
      allowed && conversationActive && history.isSuccess ? 10_000 : false,
    retry: false,
  });
  useEffect(() => {
    if (!latest.data) return;
    const filteredPage = {
      ...latest.data,
      items: latest.data.items.filter(
        (message) => !removedMessageIds.has(message.id),
      ),
    };
    client.setQueryData<ChatHistoryData>(historyKey, (current) =>
      mergeLatestPage(current, filteredPage),
    );
  }, [client, historyKey, latest.data, removedMessageIds]);
  const send = useMutation({
    mutationFn: (attempt: ChatSendAttempt) =>
      membershipApi.send(room, attempt.body, attempt.clientMessageId),
    onSuccess: (message) => {
      const page: CommunityChatPage = {
        items: [message],
        hasMore: false,
        nextCursor: null,
      };
      client.setQueryData<ChatHistoryData>(historyKey, (current) =>
        mergeLatestPage(current, page),
      );
      client.setQueryData<CommunityChatPage>(latestKey, (current) => ({
        items: mergeChatMessages(current?.items ?? [], [message]),
        hasMore: current?.hasMore ?? false,
        nextCursor: current?.nextCursor ?? null,
      }));
      setDrafts((current) => ({ ...current, [room]: "" }));
      delete lastAttempt.current[room];
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      membershipApi.editMessage(id, body),
    onSuccess: (updated) => {
      client.setQueryData<ChatHistoryData>(historyKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.map((message) =>
                  message.id === updated.id ? updated : message,
                ),
              })),
            }
          : current,
      );
      client.setQueryData<CommunityChatPage>(latestKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((message) =>
                message.id === updated.id ? updated : message,
              ),
            }
          : current,
      );
      setEditingMessageId(null);
      setEditBody("");
    },
  });
  const remove = useMutation({
    mutationFn: membershipApi.removeMessage,
    onSuccess: (_result, id) => {
      setRemovedMessageIds((current) => new Set(current).add(id));
      client.setQueryData<ChatHistoryData>(historyKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.filter((message) => message.id !== id),
              })),
            }
          : current,
      );
      client.setQueryData<CommunityChatPage>(latestKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.filter((message) => message.id !== id),
            }
          : current,
      );
    },
  });
  const renderedMessages = useMemo(() => {
    const messagesById = new Map<string, CommunityChatMessage>();
    for (const page of [...(history.data?.pages ?? [])].reverse()) {
      for (const message of page.items) {
        if (!removedMessageIds.has(message.id)) {
          messagesById.set(message.id, message);
        }
      }
    }
    return [...messagesById.values()].sort(compareMessages);
  }, [history.data?.pages, removedMessageIds]);
  const isSending = send.isPending;
  const RoomListHeading = dedicated ? "h1" : "h2";
  useLayoutEffect(() => {
    const element = timeline.current;
    if (!element) return;
    const anchor = historyAnchor.current;
    if (anchor && renderedMessages[0]?.id !== anchor.firstId) {
      const previousFirst = Array.from(
        element.querySelectorAll<HTMLElement>("[data-message-id]"),
      ).find((node) => node.dataset.messageId === anchor.firstId);
      if (previousFirst) {
        element.scrollTop +=
          previousFirst.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          anchor.offset;
      }
      historyAnchor.current = null;
      atLatest.current = false;
    }
    const previousTail = lastTail.current;
    const tail = renderedMessages.at(-1);
    if (tail && (!previousTail || compareMessages(tail, previousTail) > 0)) {
      lastTail.current = tail;
    }
    if (atLatest.current) {
      element.scrollTop = element.scrollHeight;
    } else if (
      previousTail &&
      tail &&
      compareMessages(tail, previousTail) > 0
    ) {
      const incoming = renderedMessages.filter(
        (message) => compareMessages(message, previousTail) > 0,
      ).length;
      setUnreadCount((current) => current + incoming);
    }
  }, [renderedMessages, isSending, room]);
  return (
    <section
      id="community-chat"
      ref={shell}
      aria-label="Trò chuyện hội viên"
      className="member-chat"
      data-dedicated={dedicated || undefined}
      data-conversation-open={
        (conversationOpen && Boolean(user?.id)) || undefined
      }
    >
      <div className="member-chat__layout">
        <nav
          aria-label="Các phòng hội viên"
          ref={roomList}
          className="member-chat__rooms"
        >
          {dedicated ? (
            <Link className="member-chat-link" href="/community">
              <ArrowLeft size={16} aria-hidden="true" /> Cộng đồng
            </Link>
          ) : null}
          <RoomListHeading className="member-chat__rooms-title">
            Trò chuyện hội viên
          </RoomListHeading>
          {chatRooms.map((item, index) => {
            const selected = item.key === room;
            const decision = roomAccess[index];
            const isLocked = decision?.data?.allowed === false;
            const status = decision?.data?.allowed
              ? "Có thể tham gia"
              : isLocked
                ? "Đang khóa"
                : user?.id
                  ? "Chưa xác định quyền"
                  : "";
            return (
              <button
                key={item.key}
                type="button"
                aria-label={item.label}
                data-locked={isLocked || undefined}
                aria-pressed={selected}
                disabled={send.isPending}
                onClick={() => {
                  if (item.key !== room) {
                    setRoom(item.key);
                    atLatest.current = true;
                    lastTail.current = undefined;
                    historyAnchor.current = null;
                    setUnreadCount(0);
                    setEditingMessageId(null);
                    setEditBody("");
                    setRemovedMessageIds(new Set());
                    send.reset();
                    edit.reset();
                    remove.reset();
                    setCopyStatus("");
                  }
                  setConversationOpen(true);
                  if (dedicated && smallScreen && user?.id)
                    requestAnimationFrame(() => heading.current?.focus());
                }}
                className="member-chat__room"
              >
                <ChatRoomIcon room={item.key} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {item.label}
                  </span>
                  <span className="block text-xs text-[var(--theme-muted)]">
                    {item.audience}
                    {status ? ` · ${status}` : ""}
                  </span>
                  {dedicated ? (
                    <span className="member-chat__room-summary">
                      {item.summary}
                    </span>
                  ) : null}
                </span>
                {isLocked ? (
                  <LockKeyhole aria-hidden="true" size={15} />
                ) : (
                  <ChevronRight aria-hidden="true" size={16} />
                )}
              </button>
            );
          })}
          {!user?.id ? (
            <Link
              className="member-chat-link"
              href={`/login?next=${encodeURIComponent("/community/chat")}`}
            >
              Đăng nhập để trò chuyện
            </Link>
          ) : null}
        </nav>
        <div className="member-chat__conversation">
          <header className="member-chat__header">
            {dedicated ? (
              <button
                type="button"
                className="member-chat__back"
                aria-label="Quay lại danh sách phòng"
                disabled={send.isPending}
                onClick={() => {
                  setConversationOpen(false);
                  requestAnimationFrame(() =>
                    roomList.current
                      ?.querySelector<HTMLButtonElement>(
                        '[aria-pressed="true"]',
                      )
                      ?.focus(),
                  );
                }}
              >
                <ArrowLeft aria-hidden="true" size={21} />
              </button>
            ) : null}
            <ChatRoomIcon room={room} />
            <div className="min-w-0">
              <h2
                ref={heading}
                tabIndex={-1}
                className="text-base font-semibold"
              >
                {membershipTiers[room].room}
              </h2>
              <p className="text-xs text-[var(--theme-muted)]">
                {access?.data?.source === "ADMIN"
                  ? "Quyền quản trị · mọi phòng"
                  : chatRooms.find((item) => item.key === room)?.audience}
              </p>
            </div>
          </header>
          {!user?.id ? (
            <div
              role="status"
              className="flex min-h-36 flex-col items-center justify-center text-center"
            >
              <LockKeyhole
                aria-hidden="true"
                className="size-6 text-[var(--theme-accent)]"
              />
              <p className="mt-3 font-semibold">Đăng nhập để vào phòng</p>
            </div>
          ) : !access || access.isPending ? (
            <div
              role="status"
              aria-label="Đang kiểm tra quyền vào phòng"
              className="space-y-3 py-4"
            >
              <div className="h-4 w-40 motion-safe:animate-pulse rounded bg-[var(--theme-elevated)]" />
              <div className="h-16 motion-safe:animate-pulse rounded-xl bg-[var(--theme-elevated)]" />
              <div className="h-16 w-4/5 motion-safe:animate-pulse rounded-xl bg-[var(--theme-elevated)]" />
            </div>
          ) : access.isError ? (
            <div
              role="alert"
              className="flex min-h-36 flex-col items-center justify-center text-center"
            >
              <p className="font-semibold">Chưa kiểm tra được quyền truy cập</p>
              <button
                className="mt-2 min-h-10 px-3 text-sm font-semibold text-[var(--theme-accent)] underline"
                onClick={() => void access.refetch()}
                type="button"
              >
                Thử kiểm tra lại
              </button>
            </div>
          ) : !allowed ? (
            <div
              role="status"
              className="flex min-h-36 flex-col items-center justify-center rounded-xl bg-[var(--theme-elevated)] px-4 text-center"
            >
              <LockKeyhole
                aria-hidden="true"
                className="size-6 text-[var(--theme-accent)]"
              />
              <h3 className="mt-3 font-semibold">
                Phòng này dành cho hạng {membershipTiers[room].name} trở lên
              </h3>
              <p className="mt-1 max-w-lg text-sm leading-6 text-[var(--theme-muted)]">
                Hạng hiện tại chưa mở phòng này. Xem các hạng hội viên và quyền
                lợi để chọn không gian phù hợp.
              </p>
              <a
                className="mt-3 inline-flex min-h-10 items-center font-semibold text-[var(--theme-accent)] underline"
                href="/cong-dong/hoi-vien"
              >
                Xem hạng hội viên
              </a>
            </div>
          ) : (
            <>
              <div
                aria-label="Tin nhắn trong phòng"
                aria-live="polite"
                className="member-chat__messages"
                ref={timeline}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  atLatest.current =
                    element.scrollHeight -
                      element.clientHeight -
                      element.scrollTop <
                    48;
                  if (atLatest.current) setUnreadCount(0);
                }}
              >
                {history.hasNextPage ? (
                  <div className="flex justify-center">
                    <button
                      className="min-h-10 rounded-full border border-[var(--theme-border)] px-4 text-sm font-semibold text-[var(--theme-accent)] hover:bg-[var(--theme-elevated)] disabled:opacity-60"
                      disabled={history.isFetchingNextPage}
                      onClick={() => {
                        const viewport = timeline.current;
                        const first =
                          viewport?.querySelector<HTMLElement>(
                            "[data-message-id]",
                          );
                        if (viewport && first?.dataset.messageId) {
                          historyAnchor.current = {
                            firstId: first.dataset.messageId,
                            offset:
                              first.getBoundingClientRect().top -
                              viewport.getBoundingClientRect().top,
                          };
                        }
                        void history.fetchNextPage().then((result) => {
                          if (result.isFetchNextPageError)
                            historyAnchor.current = null;
                        });
                      }}
                      type="button"
                    >
                      {history.isFetchingNextPage
                        ? "Đang tải tin cũ hơn…"
                        : "Tải tin cũ hơn"}
                    </button>
                  </div>
                ) : null}
                {history.isPending ? (
                  <p
                    role="status"
                    className="py-8 text-center text-sm text-[var(--theme-muted)]"
                  >
                    Đang tải cuộc trò chuyện…
                  </p>
                ) : history.isError ? (
                  <p role="alert" className="py-8 text-center text-sm">
                    Chưa thể tải cuộc trò chuyện.{" "}
                    <button
                      className="font-semibold text-[var(--theme-accent)] underline"
                      onClick={() => void history.refetch()}
                      type="button"
                    >
                      Thử lại
                    </button>
                  </p>
                ) : renderedMessages.length === 0 ? (
                  <div className="flex min-h-40 flex-col items-center justify-center text-center">
                    <MessageCircle
                      aria-hidden="true"
                      className="size-7 text-[var(--theme-accent)]/70"
                    />
                    <p className="mt-3 font-semibold">
                      Phòng đang chờ câu chuyện đầu tiên
                    </p>
                    <p className="mt-1 text-sm text-[var(--theme-muted)]">
                      Gửi lời chào để bắt đầu kết nối với hội viên.
                    </p>
                  </div>
                ) : (
                  renderedMessages.map((message, index) => {
                    const day = dayFormatter.format(
                      new Date(message.createdAt),
                    );
                    const previous = renderedMessages[index - 1];
                    return (
                      <div key={message.id}>
                        {!previous ||
                        day !==
                          dayFormatter.format(new Date(previous.createdAt)) ? (
                          <p className="member-chat__day">{day}</p>
                        ) : null}
                        <article
                          data-message-id={message.id}
                          className="member-chat__message"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {message.username ? (
                              <CommunityUserIdentity
                                size={36}
                                user={{
                                  ...message,
                                  username: message.username,
                                  membershipTier: message.tier,
                                }}
                              />
                            ) : (
                              <>
                                <MembershipAvatar
                                  displayName={message.displayName}
                                  src={message.avatarUrl}
                                  size={36}
                                  tier={message.tier}
                                  showFrame={!message.isAdmin}
                                />
                                <strong>{message.displayName}</strong>
                                {message.isAdmin ? (
                                  <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-elevated)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--theme-accent)]">
                                    Quản trị viên
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-elevated)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--theme-muted)]">
                                    {membershipTiers[message.tier].name}
                                  </span>
                                )}
                                {!message.isAdmin && message.roleLabel ? (
                                  <CommunityRoleBadge
                                    roleLabel={message.roleLabel}
                                  />
                                ) : null}
                              </>
                            )}
                            <time
                              className="ml-auto text-xs text-[var(--theme-muted)]"
                              dateTime={message.createdAt}
                            >
                              {new Date(message.createdAt).toLocaleTimeString(
                                "vi-VN",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </time>
                            <details className="member-chat__actions">
                              <summary
                                aria-label={`Thao tác tin nhắn của ${message.displayName}`}
                              >
                                <Ellipsis aria-hidden="true" size={19} />
                              </summary>
                              <div
                                className="member-chat__action-list"
                                onClick={(event) => {
                                  event.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(
                                        message.body,
                                      );
                                      setCopyStatus("Đã sao chép tin nhắn.");
                                    } catch {
                                      setCopyStatus(
                                        "Không thể sao chép tin nhắn.",
                                      );
                                    }
                                  }}
                                >
                                  Sao chép
                                </button>
                                {message.canEdit &&
                                editingMessageId !== message.id ? (
                                  <button
                                    type="button"
                                    aria-label={`Sửa tin nhắn của ${message.displayName}`}
                                    onClick={() => {
                                      edit.reset();
                                      setEditingMessageId(message.id);
                                      setEditBody(message.body);
                                    }}
                                  >
                                    Sửa
                                  </button>
                                ) : null}
                                {message.canRemove ? (
                                  <button
                                    type="button"
                                    disabled={remove.isPending}
                                    aria-label={`Gỡ tin nhắn của ${message.displayName}`}
                                    onClick={() => remove.mutate(message.id)}
                                  >
                                    Gỡ
                                  </button>
                                ) : null}
                              </div>
                            </details>
                          </div>
                          {editingMessageId === message.id ? (
                            <form
                              className="mt-3 space-y-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (editBody.trim() && !edit.isPending) {
                                  edit.mutate({
                                    id: message.id,
                                    body: editBody.trim(),
                                  });
                                }
                              }}
                            >
                              <label
                                className="sr-only"
                                htmlFor={"edit-chat-" + message.id}
                              >
                                Sửa nội dung tin nhắn
                              </label>
                              <textarea
                                id={"edit-chat-" + message.id}
                                className="min-h-20 w-full resize-y rounded-xl border border-[var(--theme-border)] bg-[var(--theme-elevated)] px-3 py-2.5 text-sm leading-6 text-[var(--theme-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent)]"
                                maxLength={2000}
                                value={editBody}
                                onChange={(event) =>
                                  setEditBody(event.target.value)
                                }
                                disabled={edit.isPending}
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs text-[var(--theme-muted)]">
                                  {editBody.length}/2.000 ký tự
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--theme-muted)] hover:bg-[var(--theme-elevated)]"
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      setEditBody("");
                                      edit.reset();
                                    }}
                                    type="button"
                                    disabled={edit.isPending}
                                  >
                                    <X
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                    Hủy
                                  </button>
                                  <Button
                                    className="min-h-9 rounded-lg px-3 text-xs"
                                    disabled={
                                      !editBody.trim() || edit.isPending
                                    }
                                    type="submit"
                                  >
                                    {edit.isPending ? "Đang lưu…" : "Lưu sửa"}
                                  </Button>
                                </div>
                              </div>
                              {edit.isError ? (
                                <p
                                  role="alert"
                                  className="text-sm text-red-700"
                                >
                                  Chưa thể sửa tin nhắn. Vui lòng thử lại.
                                </p>
                              ) : null}
                            </form>
                          ) : (
                            <>
                              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 sm:text-base">
                                {message.body}
                              </p>
                              {message.editedAt ? (
                                <p className="mt-1 text-xs text-[var(--theme-muted)]">
                                  Đã chỉnh sửa
                                </p>
                              ) : null}
                            </>
                          )}
                          {remove.isError ? (
                            <p
                              role="alert"
                              className="mt-2 text-sm text-red-700"
                            >
                              Chưa thể gỡ tin nhắn. Vui lòng thử lại.
                            </p>
                          ) : null}
                        </article>
                      </div>
                    );
                  })
                )}
                {send.isPending ? (
                  <article className="member-chat__message" aria-busy="true">
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {send.variables?.body}
                    </p>
                    <span className="text-xs text-[var(--theme-muted)]">
                      Đang gửi…
                    </span>
                  </article>
                ) : null}
              </div>
              {unreadCount > 0 ? (
                <button
                  className="min-h-11 px-3 text-sm font-semibold text-[var(--theme-accent)]"
                  onClick={() => {
                    const element = timeline.current;
                    if (element) element.scrollTop = element.scrollHeight;
                    atLatest.current = true;
                    setUnreadCount(0);
                  }}
                  type="button"
                >
                  Tin nhắn mới ({unreadCount})
                </button>
              ) : null}
              {copyStatus ? (
                <p className="member-chat__feedback" role="status">
                  {copyStatus}
                </p>
              ) : null}
              <form
                className="member-chat__composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  const message = body.trim();
                  if (!message || sending.current) return;
                  const previous = lastAttempt.current[room];
                  const attempt =
                    previous?.body === message
                      ? previous
                      : { body: message, clientMessageId: crypto.randomUUID() };
                  lastAttempt.current[room] = attempt;
                  sending.current = true;
                  send.mutate(attempt);
                }}
              >
                <label
                  className="min-w-0 flex-1 text-xs font-semibold text-[var(--theme-muted)]"
                  htmlFor="community-chat-body"
                >
                  <span className="sr-only">Tin nhắn</span>
                  <textarea
                    id="community-chat-body"
                    className="min-h-11 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-elevated)] px-3 py-2.5 text-base font-normal leading-6 text-[var(--theme-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent)]"
                    maxLength={2000}
                    rows={1}
                    placeholder="Viết tin nhắn…"
                    value={body}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [room]: event.target.value,
                      }))
                    }
                    disabled={send.isPending}
                  />
                </label>
                <Button
                  className="min-h-11 shrink-0 rounded-lg px-3"
                  aria-label={
                    send.isPending
                      ? "Đang gửi"
                      : send.isError
                        ? "Thử gửi lại"
                        : "Gửi tin nhắn"
                  }
                  type="submit"
                  disabled={!body.trim() || send.isPending}
                >
                  <Send aria-hidden="true" className="size-4" />
                  {send.isError ? "Thử gửi lại" : null}
                </Button>
              </form>
              {send.isError && (
                <p role="alert" className="member-chat__feedback">
                  {send.error instanceof ApiError
                    ? send.error.status === 429
                      ? "Bạn gửi tin quá nhanh. Vui lòng chờ một chút rồi thử lại."
                      : send.error.message
                    : "Chưa gửi được tin nhắn. Nội dung của bạn vẫn được giữ lại."}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
