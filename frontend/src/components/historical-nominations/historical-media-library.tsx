"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { FileText, Image as ImageIcon, Play, Search } from "lucide-react";
import { useState } from "react";

import { historicalNominationApi, mediaApi } from "@/lib/api/client";
import type {
  HistoricalMediaKind,
  HistoricalMediaLibraryItem,
} from "@/lib/api/historical-nomination-types";

const kindLabels: Record<HistoricalMediaKind, string> = {
  PHOTO: "Hình ảnh",
  VIDEO: "Video",
  SCANNED_DOCUMENT: "Bản scan",
  AWARD_SCAN: "Tài liệu bằng",
  SUPPORTING_DOCUMENT: "Minh chứng",
  OTHER: "Tài liệu khác",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HistoricalMediaLibrary() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<HistoricalMediaKind | "">("");
  const listing = useQuery({
    queryKey: ["historical-media-library", query, kind],
    queryFn: () =>
      historicalNominationApi.mediaLibrary({ query, kind: kind || undefined }),
  });

  return (
    <section
      className="space-y-5"
      aria-labelledby="historical-media-library-title"
    >
      <div>
        <p className="text-sm text-[var(--theme-muted)]">
          Lưu trữ nội bộ · không tự động công khai
        </p>
        <h2
          className="mt-1 text-2xl font-semibold"
          id="historical-media-library-title"
        >
          Thư viện tài liệu
        </h2>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-muted)]"
          />
          <input
            aria-label="Tìm tài liệu"
            className="min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] py-2 pl-9 pr-3 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tên file, mã hồ sơ hoặc tiêu đề"
            value={query}
          />
        </label>
        <label className="sr-only" htmlFor="historical-media-kind">
          Lọc loại tài liệu
        </label>
        <select
          className="min-h-11 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
          id="historical-media-kind"
          onChange={(event) =>
            setKind(event.target.value as HistoricalMediaKind | "")
          }
          value={kind}
        >
          <option value="">Tất cả loại tài liệu</option>
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {listing.isLoading ? (
        <p
          aria-busy="true"
          className="py-10 text-center text-sm text-[var(--theme-muted)]"
        >
          Đang tải thư viện…
        </p>
      ) : null}
      {listing.error ? (
        <p
          className="rounded-md border border-[var(--theme-danger)] p-3 text-sm text-[var(--theme-danger)]"
          role="alert"
        >
          {listing.error.message}
        </p>
      ) : null}
      {!listing.isLoading && listing.data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--theme-border)] px-5 py-12 text-center">
          <FileText
            aria-hidden
            className="mx-auto h-8 w-8 text-[var(--theme-muted)]"
          />
          <p className="mt-3 font-medium">Chưa có tài liệu phù hợp</p>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Tải tài liệu lên từ hồ sơ để tài liệu xuất hiện tại đây.
          </p>
        </div>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {listing.data?.data.map((item) => (
          <MediaLibraryItem item={item} key={item.id} />
        ))}
      </ul>
      {listing.data?.meta ? (
        <p className="text-xs text-[var(--theme-muted)]">
          {listing.data.meta.total} tài liệu · đang hiển thị{" "}
          {listing.data.data.length}
        </p>
      ) : null}
    </section>
  );
}

function MediaLibraryItem({ item }: { item: HistoricalMediaLibraryItem }) {
  const preview = useQuery({
    queryKey: ["historical-media-preview", item.mediaId],
    queryFn: async () => {
      const delivery = await mediaApi.signedUrl(item.mediaId);
      const url = delivery.url.startsWith("/api/v1/media/")
        ? `${delivery.url}${delivery.url.includes("?") ? "&" : "?"}inline=true`
        : delivery.url;
      return url;
    },
    enabled:
      item.status === "ACTIVE" &&
      (item.mimeType.startsWith("image/") ||
        item.mimeType.startsWith("video/")),
    retry: false,
  });
  const isImage = item.mimeType.startsWith("image/");
  const isVideo = item.mimeType.startsWith("video/");

  async function openPreview() {
    const tab = window.open("about:blank", "_blank");
    if (!tab) return;
    try {
      const delivery = await mediaApi.signedUrl(item.mediaId);
      const url = delivery.url.startsWith("/api/v1/media/")
        ? `${delivery.url}?inline=true`
        : delivery.url;
      tab.opener = null;
      tab.location.replace(url);
    } catch {
      tab.close();
    }
  }

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-[var(--theme-surface-muted)]">
        {preview.data && isImage ? (
          <Image
            alt={item.filename}
            className="h-full w-full object-cover"
            height={360}
            loading="lazy"
            unoptimized
            width={640}
            src={preview.data}
          />
        ) : null}
        {preview.data && isVideo ? (
          <video
            aria-label={`Video ${item.filename}`}
            className="h-full w-full object-contain"
            controls
            preload="metadata"
            src={preview.data}
          />
        ) : null}
        {!preview.data ? (
          <span className="flex h-full items-center justify-center text-[var(--theme-muted)]">
            {isImage ? (
              <ImageIcon aria-hidden className="h-8 w-8" />
            ) : isVideo ? (
              <Play aria-hidden className="h-8 w-8" />
            ) : (
              <FileText aria-hidden className="h-8 w-8" />
            )}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium" title={item.filename}>
          {item.filename}
        </p>
        <p
          className="truncate text-xs text-[var(--theme-muted)]"
          title={`${item.recordCode} · ${item.recordTitle}`}
        >
          {item.recordCode} · {item.recordTitle}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--theme-muted)]">
          <span>
            {kindLabels[item.mediaKind]} · {formatBytes(item.bytes)}
          </span>
          <span>{item.status === "ACTIVE" ? "Sẵn sàng" : "Đang xử lý"}</span>
        </div>
        <p className="text-xs font-medium">
          {item.publicCandidate
            ? "Đã chọn làm media dự kiến công khai"
            : "Lưu trữ nội bộ"}
        </p>
        <button
          className="min-h-9 rounded-md border border-[var(--theme-border)] px-3 text-xs font-medium"
          onClick={() => void openPreview()}
          type="button"
        >
          Xem trước
        </button>
      </div>
    </li>
  );
}
