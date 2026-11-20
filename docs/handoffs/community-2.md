# Tinh Hoa Việt Community 2.0

## Audit and fixes

- Chrome reproduced the production Admin error. The page requested
  `/api/v1/members/<handle>` and its posts subroute and received 404. The
  existing `/api/v1/community/members/<handle>` endpoint returned 200 for the
  same handle as a guest. Profile reads, post history, bookmarks, and follow
  actions now use the Community prefix.
- Separately, author serializers emit `member-<user-id-hex>` for posts without a
  community profile. The username lookup previously required a matching
  `community_profiles` row. A synthetic active Admin with a published post and
  no profile row reproduced this second 404.
- The public resolver first checks existing handles. A canonical fallback handle
  is accepted for an active account with a currently public post. The response
  uses public identity fields and defaults for missing profile fields. A read
  leaves the database untouched. Membership tier remains independent of
  identity.
- Post and comment lists already paginate. Comments preserve parent IDs, and the
  UI renders deeper replies in the same indented column with links to their
  parents. Reactions already have idempotent PUT and DELETE endpoints. The UI
  now updates while the request is pending and uses the server count on success
  or restores the previous value on failure.
- Comment and reply drafts survive failed requests. Enter submits and Shift +
  Enter inserts a newline. Retries reuse an optional `clientCommentId`. The
  server returns the original comment for a matching retry and skips duplicate
  notifications.
- Chat already checks membership access on the server and pages history by a
  room-bound cursor. It polls the latest page every ten seconds while the
  selected room is accessible. The chat API now returns an active sender's
  existing public handle when available. Posts, comments, member directories,
  follower lists, and chat share the same profile preview.

## Interface and API

- The feed uses category chips on small screens, a category rail from 1024 px,
  and a member-room panel from 1280 px. The single post column retains search,
  sorting, pagination, and media.
- Profile previews use a native popover on desktop and a bottom panel on mobile.
  Public data loads when opened and shares a 30-second cache with the profile
  route, keyed by viewer. Follow actions update that cache. The full profile
  uses existing brand imagery and provides a share action, public biography, and
  paginated posts.
- The chat composer preserves drafts per room and shows pending messages
  immediately. A retry of the same draft reuses its optional `clientMessageId`.
  The server derives the stored ID from the account, room, and client ID under
  the existing user lock. Replays return the stored message, and reuse for
  different text returns HTTP 409. The response adds nullable `username` and
  `roleLabel`. No migration is required.
- Chat counts incoming messages locally while the reader is above the latest
  message. The reader can jump to the end when ready. The room picker shows
  locked indicators from server decisions, including manual room grants.

## Verification

- Chrome exercises public Admin profile navigation, Escape, focus return, and
  horizontal bounds at 320, 375, 390, 768, 1024, and 1440 px in both themes. It
  uses synthetic API fixtures and saves local screenshots through Playwright.
- The current production baseline was measured in Chrome DevTools at 390 px with
  4× CPU slowdown, Slow 4G, and cache bypass. This single navigation recorded
  LCP 3,481 ms and CLS 0.05. It recorded no INP sample, and CrUX returned no
  page-level field data. The changed build has no production p75 measurements.
- Backend regressions cover the Admin fallback, suspended accounts, and chat
  replay, changed-request conflicts, and room permissions. Frontend regressions
  cover the API prefix, pending chat messages, same-ID retry, and optimistic
  comment reaction rollback.

## Changed source

- Backend routing and services in `backend/app/api/v1/memberships.py`,
  `backend/app/modules/community/engagement_repository.py`,
  `backend/app/modules/community/engagement_schemas.py`,
  `backend/app/modules/community/engagement_service.py`, and
  `backend/app/modules/memberships/service.py`.
- Feed, posts, discussions, profiles, author previews, and room entry in
  `frontend/src/components/community/community-feed.tsx`,
  `community-post-card.tsx`, `community-comment-threads.tsx`,
  `community-member-profile.tsx`, `community-user-identity.tsx`, and
  `community-vip-rooms.tsx`.
- Chat and navigation feedback in
  `frontend/src/components/membership/community-chat.tsx`,
  `frontend/src/components/membership/community-chat.css`,
  `frontend/src/components/membership/membership-benefit-center.tsx`,
  `frontend/src/components/membership/membership-workspace.tsx`, and
  `frontend/src/components/ui/navigation-loading.tsx`.
- API client and types in `frontend/src/lib/api/client.ts` and
  `frontend/src/lib/api/community-types.ts`.
- Regressions in `backend/app/tests/test_community_api.py`,
  `backend/app/tests/test_membership_chat_api.py`, and the frontend
  `community-interactions-api.test.ts`, `community-user-identity.test.tsx`,
  `community-comment-threads.test.tsx`, `community-member-profile.test.tsx`,
  `community-chat.test.tsx`, `e2e/community-profile.spec.ts`, and
  `e2e/membership-wallet.spec.ts`.

## Open scope

- Push-based chat, presence, and cross-device unread and read state need a
  transport and room authorization design. Chat attachments and reactions remain
  outside this implementation.
- An organization-verification workflow, profile visibility controls, and public
  comment history need explicit backend policy and API support. Chat authors
  without a public handle remain text-only.
- Reply branches can collapse after loading. The API still returns all replies
  attached to the current page of root comments. Mentions and notification
  actors do not have preview triggers yet.
- Mobile keyboard occlusion, field Core Web Vitals after rollout, and
  accessibility across the complete Community surface still need device or
  deployed-environment verification.

## Chat UI V2

- The previous room cards repeated entry actions and occupied most of the feed
  sidebar. The feed now links compact room rows to `/community/chat`. The
  original membership chat entry still opens its embedded conversation.
- `community-chat-rooms.tsx` shares room labels and icons across both surfaces.
  Đồng hành uses Lucide UsersRound. Tinh hoa uses the existing `trong-dong.png`
  brand asset.
- `community-chat.tsx` and `community-chat.css` implement a desktop room rail
  and conversation, and separate mobile room and conversation views. The
  conversation uses the visual viewport when available, temporarily hides the
  site's bottom navigation, and restores room focus on return. Drafts stay in
  memory by room. Older pages preserve the first message's position.
- Message rows show date separators and place copy, edit, and remove in a
  disclosure menu. Edit and remove remain gated by the API response. The
  composer and room entry reuse the existing send, retry, and access checks.
- `e2e/community-chat-v2.spec.ts` covers guest access, denied rooms, mobile back
  navigation and draft preservation, shared Admin profiles, and two themes at
  seven viewport widths. A reduced viewport simulates the effect of an on-screen
  keyboard. A physical iOS/Android keyboard still needs testing.
- One local development trace of the guest room list at 390 px recorded LCP
  3,038 ms and CLS 0.00 with cache bypass, Slow 4G, and 4× CPU slowdown. The run
  uses fixture data and describes the local preview.
- Reply, reaction, report, and attachments need chat API support. The current
  transport remains polling and room permissions remain server-controlled.
