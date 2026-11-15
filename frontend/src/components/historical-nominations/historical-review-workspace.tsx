"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { historicalNominationApi, mediaApi, publicApi } from "@/lib/api/client";

function makeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

export function HistoricalReviewWorkspace() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedWork, setApprovedWork] = useState<{
    id: string;
    slug: string;
  } | null>(null);
  const queue = useQuery({
    queryKey: ["historical-nomination-review-queue", page],
    queryFn: () => historicalNominationApi.reviewQueue(page, 25),
  });
  const detail = useQuery({
    queryKey: ["historical-nomination", selectedId],
    queryFn: () => historicalNominationApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });
  const people = useQuery({
    queryKey: ["historical-nomination-people", selectedId],
    queryFn: () => historicalNominationApi.listPeople(selectedId!),
    enabled: Boolean(selectedId),
  });
  const awards = useQuery({
    queryKey: ["historical-nomination-awards", selectedId],
    queryFn: () => historicalNominationApi.listAwards(selectedId!),
    enabled: Boolean(selectedId),
  });
  const media = useQuery({
    queryKey: ["historical-nomination-media", selectedId],
    queryFn: () => historicalNominationApi.listMedia(selectedId!),
    enabled: Boolean(selectedId),
  });
  const publicDraft = useQuery({
    queryKey: ["historical-nomination-public-content-draft", selectedId],
    queryFn: () => historicalNominationApi.publicContentDraft(selectedId!),
    enabled: Boolean(selectedId),
  });
  const categories = useQuery({
    queryKey: ["historical-nomination-public-categories"],
    queryFn: () => publicApi.categories(),
  });
  const record = detail.data;

  async function openPrivateDocument(mediaId: string) {
    const documentTab = window.open("about:blank", "_blank");
    if (!documentTab) {
      setError("Cho phép cửa sổ bật lên để mở tài liệu riêng tư.");
      return;
    }
    try {
      const delivery = await mediaApi.signedUrl(mediaId);
      documentTab.opener = null;
      documentTab.location.replace(
        delivery.url.startsWith("/api/v1/media/")
          ? `${delivery.url}?inline=true`
          : delivery.url,
      );
    } catch (documentError) {
      documentTab.close();
      setError(
        documentError instanceof Error
          ? documentError.message
          : "Không mở được tài liệu riêng tư.",
      );
    }
  }

  async function review(
    action: "VERIFY" | "REQUEST_CORRECTION" | "HOLD" | "REJECT",
  ) {
    if (!selectedId) return;
    if (!record) return;
    if (action !== "VERIFY" && !reason.trim()) {
      setError("Nhập lý do cho hành động này.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.review(
        selectedId,
        action,
        record.updatedAt,
        reason.trim() || undefined,
      );
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-review-queue"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", selectedId],
        }),
      ]);
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Không cập nhật được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewAward(
    awardId: string,
    action: "VERIFY" | "REQUEST_EVIDENCE" | "MARK_UNVERIFIABLE",
  ) {
    if (!selectedId) return;
    if (action !== "VERIFY" && !reason.trim()) {
      setError(
        "Nhập lý do khi yêu cầu thêm căn cứ hoặc không xác minh được bằng.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.reviewAward(
        selectedId,
        awardId,
        action,
        reason.trim() || undefined,
      );
      await queryClient.invalidateQueries({
        queryKey: ["historical-nomination-awards", selectedId],
      });
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Không cập nhật được trạng thái xác minh bằng.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function approvePublicContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const approved = await historicalNominationApi.approvePublicContent(
        record.id,
        {
          expectedUpdatedAt: record.updatedAt,
          slug: String(form.get("slug") ?? "").trim(),
          title: String(form.get("title") ?? "").trim(),
          shortDescription: String(form.get("shortDescription") ?? "").trim(),
          fullDescription:
            String(form.get("fullDescription") ?? "").trim() || null,
          authorDisplayName:
            String(form.get("authorDisplayName") ?? "").trim() || null,
          categoryId: String(form.get("categoryId") ?? ""),
        },
      );
      setApprovedWork({ id: approved.publicWorkId, slug: approved.slug });
      await queryClient.invalidateQueries({
        queryKey: ["historical-nomination", record.id],
      });
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Không duyệt được nội dung công khai.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveRecord() {
    if (!record || !archiveReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.archive(
        record.id,
        archiveReason.trim(),
        record.updatedAt,
      );
      setSelectedId(null);
      setArchiveReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-review-queue"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", record.id],
        }),
      ]);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Không lưu trữ được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.5fr)]">
      <section
        className="space-y-3 rounded-lg border border-[var(--theme-border)] p-3"
        aria-label="Hồ sơ chờ Admin"
      >
        <div>
          <h2 className="font-semibold">Chờ xác minh</h2>
          <p className="text-sm text-[var(--theme-muted)]">
            {queue.data?.length ?? 0} hồ sơ trong trang này
          </p>
        </div>
        {queue.isLoading ? (
          <p aria-busy="true" className="text-sm">
            Đang tải hàng chờ…
          </p>
        ) : null}
        {queue.error ? (
          <p className="text-sm text-[var(--theme-danger)]" role="alert">
            {queue.error.message}
          </p>
        ) : null}
        <ul className="space-y-1">
          {queue.data?.map((item) => (
            <li key={item.id}>
              <button
                aria-current={selectedId === item.id ? "true" : undefined}
                className="w-full rounded-md border border-transparent p-3 text-left hover:border-[var(--theme-border)] aria-current:border-[var(--theme-primary)] aria-current:bg-[var(--theme-surface-muted)]"
                onClick={() => {
                  setSelectedId(item.id);
                  setApprovedWork(null);
                  setError(null);
                }}
                type="button"
              >
                <span className="block text-sm font-medium">
                  {item.subjectName}
                </span>
                <span className="mt-1 block text-xs text-[var(--theme-muted)]">
                  {item.code} · {item.title}
                </span>
                <span className="mt-2 inline-flex rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-xs">
                  {item.verificationStatus}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!queue.isLoading && !queue.data?.length ? (
          <p className="py-8 text-center text-sm text-[var(--theme-muted)]">
            Không có hồ sơ chờ xác minh.
          </p>
        ) : null}
        <div className="flex items-center justify-between border-t border-[var(--theme-border)] pt-3">
          <button
            className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm disabled:opacity-50"
            disabled={page === 1 || queue.isFetching}
            onClick={() => setPage((current) => current - 1)}
            type="button"
          >
            Trước
          </button>
          <span className="text-xs text-[var(--theme-muted)]">
            Trang {page}
          </span>
          <button
            className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm disabled:opacity-50"
            disabled={(queue.data?.length ?? 0) < 25 || queue.isFetching}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Sau
          </button>
        </div>
      </section>
      <section className="min-w-0 space-y-5 rounded-lg border border-[var(--theme-border)] p-4 sm:p-5">
        {!record ? (
          <p className="py-12 text-center text-sm text-[var(--theme-muted)]">
            Chọn hồ sơ để xem nguồn và dữ liệu liên quan.
          </p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                {record.code} · {record.verificationStatus}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{record.title}</h2>
              <p className="mt-1 text-sm text-[var(--theme-muted)]">
                {record.subjectName} · {record.nominationYear ?? "Chưa rõ năm"}
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Summary label="Loại nguồn" value={record.sourceKind} />
              <Summary label="Nhãn nguồn" value={record.sourceLabel ?? "—"} />
              <Summary
                label="Mã tham chiếu"
                value={record.sourceReference ?? "—"}
              />
              <Summary
                label="Ghi chú nguồn gốc"
                value={record.provenanceNotes ?? "—"}
              />
              <Summary label="Tóm tắt" value={record.summary ?? "—"} />
              <Summary label="Mô tả" value={record.description ?? "—"} />
            </dl>
            <section className="space-y-2">
              <h3 className="font-semibold">
                Người liên quan và thông tin nội bộ
              </h3>
              {people.data?.length ? (
                people.data.map((person) => (
                  <p className="text-sm" key={person.id}>
                    {person.displayName} · {person.role}
                    {person.email ? ` · ${person.email}` : ""}
                    {person.phone ? ` · ${person.phone}` : ""}
                  </p>
                ))
              ) : (
                <p className="text-sm text-[var(--theme-muted)]">
                  Chưa có người liên quan.
                </p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Giải thưởng / bằng xác lập cũ</h3>
              {awards.data?.length ? (
                awards.data.map((award) => (
                  <p className="text-sm" key={award.id}>
                    <span className="mb-1 block text-xs text-[var(--theme-muted)]">
                      {award.verificationStatus === "VERIFIED"
                        ? "Bằng đã xác minh"
                        : award.verificationStatus === "NEEDS_EVIDENCE"
                          ? "Cần thêm căn cứ"
                          : award.verificationStatus === "UNVERIFIABLE"
                            ? "Không xác minh được"
                            : "Chưa xác minh"}
                    </span>
                    <button
                      className="mr-2 rounded border border-[var(--theme-border)] px-2 py-1 text-xs disabled:opacity-50"
                      disabled={busy || award.verificationStatus === "VERIFIED"}
                      onClick={() => void reviewAward(award.id, "VERIFY")}
                      type="button"
                    >
                      Xác minh bằng
                    </button>
                    <button
                      className="mr-2 rounded border border-[var(--theme-border)] px-2 py-1 text-xs disabled:opacity-50"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void reviewAward(award.id, "REQUEST_EVIDENCE")
                      }
                      type="button"
                    >
                      Yêu cầu căn cứ
                    </button>
                    <button
                      className="rounded border border-[var(--theme-border)] px-2 py-1 text-xs disabled:opacity-50"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void reviewAward(award.id, "MARK_UNVERIFIABLE")
                      }
                      type="button"
                    >
                      Không xác minh được
                    </button>
                    {award.awardName} ·{" "}
                    {award.certificateNumber ?? "Không có số bằng"}
                    {award.issuedBy ? ` · ${award.issuedBy}` : ""}
                    {award.provenanceNotes
                      ? ` · Nguồn: ${award.provenanceNotes}`
                      : ""}
                  </p>
                ))
              ) : (
                <p className="text-sm text-[var(--theme-muted)]">
                  Chưa có dữ liệu giải thưởng.
                </p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Tài liệu nội bộ</h3>
              {media.data?.length ? (
                <ul className="flex flex-wrap gap-2">
                  {media.data.map((item) => (
                    <li key={item.id}>
                      <button
                        className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm"
                        onClick={() => void openPrivateDocument(item.mediaId)}
                        type="button"
                      >
                        <span className="block font-medium">
                          {item.filename ?? item.mediaKind.toLocaleLowerCase()}
                        </span>
                        <span className="mt-1 block text-xs text-[var(--theme-muted)]">
                          {item.mimeType ?? item.mediaKind.toLocaleLowerCase()}{" "}
                          ·{" "}
                          {item.status === "ACTIVE" ? "Sẵn sàng" : "Đang xử lý"}
                          {item.publicCandidate
                            ? " · Được đề xuất công khai"
                            : " · Lưu trữ nội bộ"}
                        </span>
                        Mở {item.mediaKind.toLocaleLowerCase()}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--theme-muted)]">
                  Chưa có tài liệu riêng tư.
                </p>
              )}
            </section>
            {record.verificationStatus !== "VERIFIED" ? (
              <section className="space-y-3 border-t border-[var(--theme-border)] pt-4">
                <label className="block space-y-1 text-sm">
                  <span>Ghi chú cho người quản lý</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-[var(--theme-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void review("VERIFY")}
                    type="button"
                  >
                    Xác minh hồ sơ
                  </button>
                  <button
                    className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm disabled:opacity-60"
                    disabled={busy || !reason.trim()}
                    onClick={() => void review("REQUEST_CORRECTION")}
                    type="button"
                  >
                    Yêu cầu sửa
                  </button>
                  <button
                    className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm disabled:opacity-60"
                    disabled={busy || !reason.trim()}
                    onClick={() => void review("HOLD")}
                    type="button"
                  >
                    Tạm giữ
                  </button>
                  <button
                    className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm disabled:opacity-60"
                    disabled={busy || !reason.trim()}
                    onClick={() => void review("REJECT")}
                    type="button"
                  >
                    Từ chối
                  </button>
                </div>
              </section>
            ) : (
              <section className="space-y-3 border-t border-[var(--theme-border)] pt-4">
                <div>
                  <h3 className="font-semibold">Duyệt nội dung công khai</h3>
                  <p className="text-sm text-[var(--theme-muted)]">
                    Đây là bước riêng sau xác minh. Chứng chỉ và blockchain
                    không được tạo.
                  </p>
                </div>
                {publicDraft.data ? (
                  <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
                    <p className="text-sm font-medium">
                      Bản dự thảo từ DATA_MANAGER · lần sửa{" "}
                      {publicDraft.data.revision}
                    </p>
                    <p className="mt-1 text-xs text-[var(--theme-muted)]">
                      Trạng thái:{" "}
                      {publicDraft.data.status === "SUBMITTED"
                        ? "Đã gửi Admin"
                        : publicDraft.data.status}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {publicDraft.data.publicMediaIds.map((mediaId) => {
                        const item = media.data?.find(
                          (entry) => entry.mediaId === mediaId,
                        );
                        return (
                          <li key={mediaId}>
                            <button
                              className="rounded border border-[var(--theme-border)] px-2 py-1 text-xs underline"
                              onClick={() => void openPrivateDocument(mediaId)}
                              type="button"
                            >
                              {item?.filename ?? "Mở media đã chọn"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {publicDraft.data.coverMediaId ? (
                      <p className="mt-2 text-xs text-[var(--theme-muted)]">
                        Ảnh bìa được đề xuất:{" "}
                        {media.data?.find(
                          (entry) =>
                            entry.mediaId === publicDraft.data?.coverMediaId,
                        )?.filename ?? "đã chọn"}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  key={`${record.id}-${publicDraft.data?.revision ?? "empty"}`}
                  onSubmit={approvePublicContent}
                >
                  <label className="space-y-1 text-sm">
                    <span>Slug *</span>
                    <input
                      className="w-full rounded border px-3 py-2"
                      defaultValue={
                        publicDraft.data?.slug ?? makeSlug(record.title)
                      }
                      maxLength={180}
                      name="slug"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Danh mục *</span>
                    <select
                      className="w-full rounded border px-3 py-2"
                      defaultValue={
                        publicDraft.data?.categoryId ??
                        categories.data?.[0]?.id ??
                        ""
                      }
                      name="categoryId"
                      required
                    >
                      {categories.data?.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Tiêu đề công khai *</span>
                    <input
                      className="w-full rounded border px-3 py-2"
                      defaultValue={publicDraft.data?.title ?? record.title}
                      maxLength={255}
                      name="title"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Mô tả ngắn *</span>
                    <textarea
                      className="min-h-20 w-full rounded border px-3 py-2"
                      defaultValue={publicDraft.data?.shortDescription ?? ""}
                      maxLength={500}
                      minLength={10}
                      name="shortDescription"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Mô tả công khai</span>
                    <textarea
                      className="min-h-24 w-full rounded border px-3 py-2"
                      defaultValue={publicDraft.data?.fullDescription ?? ""}
                      maxLength={50_000}
                      name="fullDescription"
                    />
                    <span className="block text-xs text-[var(--theme-muted)]">
                      Chỉ nhập nội dung đã rà soát để công khai; không đưa thông
                      tin liên hệ hoặc ghi chú nội bộ vào đây.
                    </span>
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Tên hiển thị</span>
                    <input
                      className="w-full rounded border px-3 py-2"
                      defaultValue={
                        publicDraft.data?.authorDisplayName ??
                        record.subjectName ??
                        ""
                      }
                      maxLength={255}
                      name="authorDisplayName"
                    />
                  </label>
                  <button
                    className="w-fit rounded-md bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    disabled={busy || !categories.data?.length}
                    type="submit"
                  >
                    {busy ? "Đang duyệt…" : "Duyệt và tạo bản nháp công khai"}
                  </button>
                </form>
                {approvedWork ? (
                  <p
                    className="text-sm text-[var(--theme-success)]"
                    role="status"
                  >
                    Nội dung đã duyệt.{" "}
                    <Link
                      className="underline"
                      href={`/admin/publications/${approvedWork.id}`}
                    >
                      Mở trang biên tập để xem trước và xuất bản
                    </Link>
                  </p>
                ) : null}
              </section>
            )}
            <details className="border-t border-[var(--theme-border)] pt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Lưu trữ hồ sơ
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-[var(--theme-muted)]">
                  Hồ sơ đã công bố phải được ẩn khỏi catalog trước khi lưu trữ.
                  Thao tác lưu trữ ẩn hồ sơ khỏi danh sách quản lý thường ngày.
                </p>
                <label className="block space-y-1 text-sm">
                  <span>Lý do lưu trữ *</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
                    onChange={(event) => setArchiveReason(event.target.value)}
                    value={archiveReason}
                  />
                </label>
                <button
                  className="rounded-md border border-[var(--theme-danger)] px-3 py-2 text-sm text-[var(--theme-danger)] disabled:opacity-50"
                  disabled={
                    busy ||
                    !archiveReason.trim() ||
                    record.publicationStatus === "PUBLISHED"
                  }
                  onClick={() => void archiveRecord()}
                  type="button"
                >
                  {busy ? "Đang lưu trữ…" : "Lưu trữ hồ sơ"}
                </button>
              </div>
            </details>
          </>
        )}
        {error ? (
          <p className="text-sm text-[var(--theme-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--theme-border)] p-3">
      <dt className="text-xs text-[var(--theme-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value}</dd>
    </div>
  );
}
