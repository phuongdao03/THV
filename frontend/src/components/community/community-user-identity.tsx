"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, X } from "lucide-react";
import Link from "next/link";
import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { membershipTierPalette } from "@/components/membership/membership-tier-palette";
import { MembershipAvatar } from "@/components/ui/membership-avatar";
import { communityMemberApi } from "@/lib/api/client";
import type { CommunityMemberProfile } from "@/lib/api/community-types";
import type { CommunityAuthor, MembershipTier } from "@/lib/api/types";
import { useAuthUser } from "@/lib/auth/user-context";

export function CommunityUserIdentity({
  user,
  size = 34,
  showHandle = true,
}: {
  user: Omit<CommunityAuthor, "id">;
  size?: number;
  showHandle?: boolean;
}) {
  const isMembershipStaff = isMembershipStaffIdentity(user);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CommunityProfilePreview
        user={user}
        className="shrink-0"
        label={`Xem nhanh hồ sơ ${user.displayName}`}
      >
        <MembershipAvatar
          displayName={user.displayName}
          size={size}
          showFrame={!isMembershipStaff}
          src={user.avatarUrl}
          tier={user.membershipTier ?? "MEMBER"}
        />
      </CommunityProfilePreview>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          <CommunityProfilePreview
            className="max-w-full truncate font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent)] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent)]"
            user={user}
          >
            {user.displayName?.trim() || "Thành viên"}
          </CommunityProfilePreview>
          <CommunityMembershipBadge
            isMembershipStaff={isMembershipStaff}
            tier={user.membershipTier ?? "MEMBER"}
          />
        </div>
        {showHandle && hasPublicUsername(user.username) ? (
          <CommunityProfilePreview
            user={user}
            className="max-w-full truncate text-xs text-[var(--theme-muted)]"
          >
            <CommunityPublicHandle username={user.username} />
          </CommunityProfilePreview>
        ) : null}
        <CommunityRoleBadge isAdmin={user.isAdmin} roleLabel={user.roleLabel} />
      </div>
    </div>
  );
}

export function CommunityProfilePreview({
  user,
  className,
  label,
  children,
}: {
  user: Omit<CommunityAuthor, "id">;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  const href = `/community/members/${encodeURIComponent(user.username)}`;
  const profileHref = hasPublicUsername(user.username)
    ? `/u/${encodeURIComponent(user.username)}`
    : href;

  function show(event: MouseEvent<HTMLAnchorElement>) {
    const element = panel.current;
    if (
      !element?.showPopover ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (element.matches(":popover-open")) {
      element.hidePopover();
      return;
    }
    const anchor = event.currentTarget.getBoundingClientRect();
    element.style.setProperty("--profile-left", `${anchor.left}px`);
    element.style.setProperty("--profile-top", `${anchor.bottom + 8}px`);
    element.showPopover();
    setOpen(true);
    element.querySelector<HTMLButtonElement>("button")?.focus();
  }

  return (
    <>
      <Link
        aria-haspopup="dialog"
        aria-label={label}
        className={className}
        data-navigation-feedback="off"
        href={href}
        prefetch={false}
        ref={trigger}
        onClick={show}
      >
        {children}
      </Link>
      <div
        aria-labelledby={titleId}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--theme-text)] shadow-lg sm:right-auto sm:bottom-auto sm:top-[clamp(0.5rem,var(--profile-top),calc(100dvh-20rem))] sm:left-[clamp(0.5rem,var(--profile-left),calc(100vw-21rem))] sm:w-80 sm:rounded-2xl"
        onToggle={(event) => {
          if (event.newState === "closed") {
            setOpen(false);
            if (document.activeElement === document.body)
              trigger.current?.focus();
          }
        }}
        popover="auto"
        ref={panel}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold break-words" id={titleId}>
              {open ? user.displayName?.trim() || "Thành viên" : null}
            </h2>
            {open ? (
              <CommunityPublicHandle
                username={user.username}
                className="block text-sm break-all text-[var(--theme-muted)]"
              />
            ) : null}
          </div>
          <button
            aria-label="Đóng hồ sơ nhanh"
            className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--theme-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--theme-accent)]"
            onClick={() => panel.current?.hidePopover()}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {open ? <CommunityPreviewDetails user={user} /> : null}
        <Link
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--theme-accent)] underline-offset-4 hover:underline focus-visible:outline-2"
          href={profileHref}
          onClick={() => panel.current?.hidePopover()}
        >
          Xem hồ sơ
        </Link>
      </div>
    </>
  );
}

function CommunityPreviewDetails({
  user,
}: {
  user: Omit<CommunityAuthor, "id">;
}) {
  const viewer = useAuthUser();
  const profileKey = [
    "community",
    "member",
    user.username,
    viewer?.id ?? "anonymous",
  ] as const;
  const follow = useCommunityFollow(profileKey);
  const profile = useQuery({
    queryKey: profileKey,
    queryFn: ({ signal }) => communityMemberApi.profile(user.username, signal),
    staleTime: 30_000,
  });
  const member = profile.data;
  const identity = member ?? user;
  const staff = isMembershipStaffIdentity(identity);
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <MembershipAvatar
          displayName={identity.displayName}
          showFrame={!staff}
          size={44}
          src={identity.avatarUrl}
          tier={identity.membershipTier ?? "MEMBER"}
        />
        <CommunityRoleBadge
          isAdmin={identity.isAdmin}
          roleLabel={identity.roleLabel}
        />
        <CommunityMembershipBadge
          isMembershipStaff={staff}
          tier={identity.membershipTier ?? "MEMBER"}
        />
      </div>
      {member ? (
        <>
          {member.bio ? (
            <p className="line-clamp-3 break-words">{member.bio}</p>
          ) : null}
          <p className="text-[var(--theme-muted)]">
            {member.publishedPostCount} bài viết · {member.followerCount} người
            theo dõi
          </p>
          {viewer && viewer.id !== member.id ? (
            <button
              aria-pressed={member.viewerIsFollowing}
              className="min-h-11 rounded-lg border border-[var(--theme-border)] px-3 font-semibold text-[var(--theme-accent)] hover:bg-[var(--theme-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--theme-accent)]"
              disabled={follow.isPending}
              onClick={() => follow.mutate(member)}
              type="button"
            >
              {member.viewerIsFollowing ? "Đang theo dõi" : "Theo dõi"}
            </button>
          ) : null}
          {follow.isError ? (
            <p className="text-[var(--theme-muted)]" role="alert">
              Chưa thể cập nhật theo dõi. Vui lòng thử lại.
            </p>
          ) : null}
        </>
      ) : (
        <p role="status" className="text-[var(--theme-muted)]">
          {profile.isError
            ? "Chưa tải được thông tin hồ sơ."
            : "Đang tải hồ sơ…"}
        </p>
      )}
    </div>
  );
}

export function useCommunityFollow(
  profileKey: readonly ["community", "member", string, string],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (member: CommunityMemberProfile) =>
      member.viewerIsFollowing
        ? communityMemberApi.unfollow(member.id)
        : communityMemberApi.follow(member.id),
    onSuccess: (result) => {
      queryClient.setQueryData<CommunityMemberProfile>(profileKey, (current) =>
        current
          ? {
              ...current,
              viewerIsFollowing: result.isFollowing,
              followerCount: result.followerCount,
            }
          : current,
      );
    },
  });
}

export function CommunityPublicHandle({
  username,
  className,
}: {
  username?: string | null;
  className?: string;
}) {
  if (!hasPublicUsername(username)) return null;
  return <span className={className}>@{username}</span>;
}

export function hasPublicUsername(
  username?: string | null,
): username is string {
  return Boolean(username && !/^member-[0-9a-f]{32}$/i.test(username));
}

export function CommunityMembershipBadge({
  tier,
  isMembershipStaff = false,
}: {
  tier: MembershipTier;
  isMembershipStaff?: boolean;
}) {
  if (isMembershipStaff) return null;
  const palette = membershipTierPalette[tier];
  return (
    <span
      aria-label={`Hạng thẻ ${palette.name}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4"
      style={{
        borderColor: palette.border,
        backgroundColor: palette.surface,
        color: palette.ink,
      }}
    >
      <span aria-hidden="true">✦</span>
      {palette.name}
    </span>
  );
}

export function isMembershipStaffIdentity(
  user: Pick<CommunityAuthor, "isAdmin" | "roleLabel">,
): boolean {
  return (
    user.isAdmin === true ||
    user.roleLabel === "Quản trị viên" ||
    user.roleLabel === "Quản lý hội viên"
  );
}

export function getAuthenticatedCommunityIdentity({
  displayName,
  roles = [],
  permissions = [],
}: {
  displayName?: string | null;
  roles?: readonly string[];
  permissions?: readonly string[];
}) {
  const isAdmin = roles.includes("SUPER_ADMIN");
  const isModerator = !isAdmin && roles.includes("MODERATOR");
  const isMembershipManager = permissions.includes("memberships.manage");
  const roleLabel = isAdmin
    ? "Quản trị viên"
    : isMembershipManager
      ? "Quản lý hội viên"
      : isModerator
        ? "Thẩm định viên"
        : null;
  return {
    displayName:
      displayName?.trim() || (isAdmin ? "Quản trị viên THV" : "Thành viên"),
    isAdmin,
    roleLabel,
  };
}

export function CommunityRoleBadge({
  isAdmin,
  roleLabel,
}: {
  isAdmin?: boolean;
  roleLabel?: string | null;
}) {
  if (!roleLabel) return null;
  return (
    <span
      className={
        isAdmin
          ? "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--theme-accent)]/35 bg-[var(--theme-accent)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--theme-accent)]"
          : "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--theme-muted)]"
      }
    >
      {isAdmin ? <BadgeCheck aria-hidden="true" className="size-3.5" /> : null}
      {roleLabel}
    </span>
  );
}
