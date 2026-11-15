"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Eye,
  EyeOff,
  FileImage,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { useState } from "react";

import { certificateArchiveApi, publicWorkAdminApi } from "@/lib/api/client";
import type {
  CertificateArchiveContent,
  CertificateArchiveManagerData,
} from "@/lib/api/types";
import { uploadMedia } from "@/lib/media/upload";

type Page = CertificateArchiveContent["pages"][number] & { fileName?: string };
type Form = Omit<CertificateArchiveContent, "pages"> & { pages: Page[] };

const emptyForm = (): Form => ({
  title: "",
  awardName: "",
  certificateNumber: "",
  recipientDisplayName: "",
  issuerName: "",
  awardClass: "",
  issuedAt: null,
  issuedYear: null,
  publicNote: "",
  rightsConfirmed: false,
  privacyReviewed: false,
  pages: [],
});

const statusNames: Record<CertificateArchiveManagerData["status"], string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đang hiển thị",
  HIDDEN: "Đã ẩn",
  ARCHIVED: "Đã lưu trữ",
};

function toInput(form: Form) {
  return {
    title: form.title.trim(),
    awardName: form.awardName?.trim() || null,
    certificateNumber: form.certificateNumber?.trim() || null,
    recipientDisplayName: form.recipientDisplayName?.trim() || null,
    issuerName: form.issuerName?.trim() || null,
    awardClass: form.awardClass?.trim() || null,
    issuedAt: form.issuedAt || null,
    issuedYear: form.issuedYear || null,
    publicNote: form.publicNote?.trim() || null,
    rightsConfirmed: form.rightsConfirmed,
    privacyReviewed: form.privacyReviewed,
    pages: form.pages.map(({ mediaAssetId, caption, altText }) => ({
      mediaAssetId,
      caption,
      altText: altText.trim(),
    })),
  };
}

function fromRow(row: CertificateArchiveManagerData): Form {
  return {
    ...row.draft,
    pages: row.draft.pages.map((page, index) => ({
      ...page,
      fileName: "Ảnh scan " + (index + 1),
    })),
  };
}

export function CertificateArchiveWorkspace({
  canRestore = false,
}: {
  canRestore?: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [workId, setWorkId] = useState("");
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archives = useQuery({
    queryKey: ["certificate-archives"],
    queryFn: () => certificateArchiveApi.list(),
  });
  const works = useQuery({
    queryKey: ["certificate-archive-public-works"],
    queryFn: async () =>
      (await publicWorkAdminApi.list({ page: 1, pageSize: 100 })).data,
  });
  const selected = archives.data?.find((row) => row.id === selectedId);
  const dirty = Boolean(
    selected &&
      form &&
      JSON.stringify(toInput(form)) !==
        JSON.stringify(toInput(fromRow(selected))),
  );
  const refresh = async (row?: CertificateArchiveManagerData) => {
    if (row) {
      setSelectedId(row.id);
      setForm(fromRow(row));
    }
    await queryClient.invalidateQueries({ queryKey: ["certificate-archives"] });
  };
  const create = useMutation({
    mutationFn: () => certificateArchiveApi.create(workId, toInput(form!)),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: () =>
      certificateArchiveApi.update(
        selected!.id,
        selected!.version,
        toInput(form!),
      ),
    onSuccess: refresh,
  });
  const transition = useMutation({
    mutationFn: async (action: "publish" | "hide" | "archive" | "restore") => {
      if (action === "publish")
        return certificateArchiveApi.publish(selected!.id, selected!.version);
      if (action === "hide")
        return certificateArchiveApi.hide(selected!.id, selected!.version);
      if (action === "restore")
        return certificateArchiveApi.restore(selected!.id, selected!.version);
      return certificateArchiveApi.archive(
        selected!.id,
        selected!.version,
        reason,
      );
    },
    onSuccess: (row) => {
      setReason("");
      return refresh(row);
    },
  });

  const startNew = () => {
    setSelectedId(null);
    setForm(emptyForm());
    setError(null);
  };
  const uploadScans = async (files: FileList | null) => {
    if (!files?.length || !form) return;
    if (form.pages.length + files.length > 20) {
      setError("Mỗi bằng lưu trữ có thể có tối đa 20 ảnh scan.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const added: Page[] = [];
      for (const file of Array.from(files)) {
        const asset = await uploadMedia(file, "CERTIFICATE_ARCHIVE_SCAN");
        const index = form.pages.length + added.length;
        added.push({
          mediaAssetId: asset.id,
          sortOrder: index,
          caption: "",
          altText: "Ảnh scan bằng xác lập, trang " + (index + 1),
          url: null,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          fileName: file.name,
        });
      }
      setForm((current) =>
        current ? { ...current, pages: [...current.pages, ...added] } : current,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không tải được ảnh scan.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="certificate-archive-title">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
            <Archive aria-hidden="true" className="size-4" /> Hồ sơ tư liệu
          </p>
          <h2
            id="certificate-archive-title"
            className="mt-2 text-2xl font-bold"
          >
            Bằng xác lập lưu trữ
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Nhập thông tin lưu trữ và đăng ảnh scan cũ. Không cần PDF hay
            blockchain; bản gốc được giữ riêng, chỉ bản đã kiểm tra mới hiển thị
            công khai.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-bold text-white"
          onClick={startNew}
          type="button"
        >
          <FileImage className="size-4" /> Thêm bằng lưu trữ
        </button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <nav aria-label="Danh sách bằng lưu trữ" className="space-y-2">
          {archives.isPending ? (
            <p className="rounded-xl border p-4 text-sm" role="status">
              Đang tải danh sách…
            </p>
          ) : null}
          {archives.isError ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              Không tải được danh sách bằng lưu trữ.
            </p>
          ) : null}
          {archives.data?.map((row) => (
            <button
              aria-current={row.id === selectedId ? "true" : undefined}
              className={
                row.id === selectedId
                  ? "w-full rounded-xl border border-primary-700 bg-primary-50 p-4 text-left"
                  : "w-full rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50"
              }
              key={row.id}
              onClick={() => {
                setSelectedId(row.id);
                setForm(fromRow(row));
                setError(null);
              }}
              type="button"
            >
              <span className="block font-bold">{row.draft.title}</span>
              <span className="mt-1 block text-sm text-neutral-600">
                {row.publicWorkTitle}
              </span>
              <span className="mt-2 inline-block rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold">
                {statusNames[row.status]}
              </span>
            </button>
          ))}
          {!archives.isPending &&
          !archives.isError &&
          !archives.data?.length ? (
            <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-600">
              Chưa có bằng lưu trữ. Tạo bản nháp đầu tiên từ một tác phẩm đã
              công bố.
            </p>
          ) : null}
        </nav>

        {form ? (
          <form
            className="min-w-0 space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              if (selected) save.mutate();
              else create.mutate();
            }}
          >
            {!selected ? (
              <label className="block text-sm font-bold">
                Tác phẩm đã công bố
                <select
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
                  onChange={(event) => setWorkId(event.target.value)}
                  required
                  value={workId}
                >
                  <option value="">Chọn tác phẩm</option>
                  {works.data
                    ?.filter(
                      (work) =>
                        work.publicationStatus === "PUBLISHED" &&
                        ["PUBLIC", "UNLISTED"].includes(work.visibility),
                    )
                    .map((work) => (
                      <option key={work.id} value={work.id}>
                        {work.title}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <p className="font-bold">{selected.publicWorkTitle}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Bản nháp v{selected.draftVersionNo} · phiên bản hồ sơ{" "}
                    {selected.version}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold">
                  {statusNames[selected.status]}
                </span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold sm:col-span-2">
                Tên ghi trên bằng
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                  maxLength={255}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  required
                  value={form.title}
                />
              </label>
              {(
                [
                  ["awardName", "Danh hiệu / giải thưởng"],
                  ["certificateNumber", "Số bằng lưu trữ"],
                  ["recipientDisplayName", "Người được ghi nhận"],
                  ["issuerName", "Đơn vị cấp"],
                  ["awardClass", "Hạng / loại"],
                ] as const
              ).map(([key, label]) => (
                <label className="block text-sm font-bold" key={key}>
                  {label}
                  <input
                    className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                    maxLength={255}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                    value={form[key] ?? ""}
                  />
                </label>
              ))}
              <label className="block text-sm font-bold">
                Ngày cấp
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                  onChange={(event) =>
                    setForm({ ...form, issuedAt: event.target.value || null })
                  }
                  type="date"
                  value={form.issuedAt ?? ""}
                />
              </label>
              <label className="block text-sm font-bold">
                Năm cấp (nếu không rõ ngày)
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                  max="2200"
                  min="1"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      issuedYear: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  type="number"
                  value={form.issuedYear ?? ""}
                />
              </label>
              <label className="block text-sm font-bold sm:col-span-2">
                Ghi chú công khai
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-neutral-300 p-3"
                  maxLength={2000}
                  onChange={(event) =>
                    setForm({ ...form, publicNote: event.target.value })
                  }
                  value={form.publicNote ?? ""}
                />
              </label>
            </div>

            <section
              className="space-y-3 rounded-xl border border-neutral-200 p-4"
              aria-labelledby="archive-pages-title"
            >
              <div>
                <h3 id="archive-pages-title" className="font-bold">
                  Ảnh scan các trang
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Tối đa 20 ảnh JPEG, PNG hoặc WebP; mỗi ảnh tối đa 5 MB. PDF
                  không bắt buộc.
                </p>
              </div>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-bold">
                <Upload className="size-4" />{" "}
                {uploading ? "Đang tải và kiểm tra ảnh…" : "Tải ảnh scan"}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploading || form.pages.length >= 20}
                  multiple
                  onChange={(event) => {
                    void uploadScans(event.target.files);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              {form.pages.length ? (
                <ol className="space-y-3">
                  {form.pages.map((page, index) => (
                    <li
                      className="grid gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-[minmax(8rem,12rem)_1fr_auto]"
                      key={page.mediaAssetId + "-" + index}
                    >
                      <div className="text-sm">
                        <p className="font-bold">Trang {index + 1}</p>
                        <p className="mt-1 break-all text-xs text-neutral-500">
                          {page.fileName ?? page.mediaAssetId}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <input
                          aria-label={"Chú thích trang " + (index + 1)}
                          className="min-h-10 rounded-md border border-neutral-300 px-3 text-sm"
                          maxLength={500}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              pages: form.pages.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      caption: event.target.value || null,
                                    }
                                  : item,
                              ),
                            })
                          }
                          placeholder="Chú thích (không bắt buộc)"
                          value={page.caption ?? ""}
                        />
                        <input
                          aria-label={"Mô tả ảnh trang " + (index + 1)}
                          className="min-h-10 rounded-md border border-neutral-300 px-3 text-sm"
                          maxLength={500}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              pages: form.pages.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, altText: event.target.value }
                                  : item,
                              ),
                            })
                          }
                          required
                          value={page.altText}
                        />
                      </div>
                      <button
                        aria-label={"Bỏ trang " + (index + 1)}
                        className="min-h-10 rounded-md border border-neutral-300 px-3 text-sm"
                        onClick={() =>
                          setForm({
                            ...form,
                            pages: form.pages.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          })
                        }
                        type="button"
                      >
                        Bỏ trang
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600">
                  Chưa tải trang scan nào.
                </p>
              )}
            </section>

            <div className="space-y-3 border-t border-neutral-100 pt-4">
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  checked={form.rightsConfirmed}
                  className="mt-1 size-4"
                  onChange={(event) =>
                    setForm({ ...form, rightsConfirmed: event.target.checked })
                  }
                  type="checkbox"
                />
                Tôi xác nhận có quyền công bố các ảnh scan này.
              </label>
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  checked={form.privacyReviewed}
                  className="mt-1 size-4"
                  onChange={(event) =>
                    setForm({ ...form, privacyReviewed: event.target.checked })
                  }
                  type="checkbox"
                />
                Tôi đã rà soát và che thông tin cá nhân / giấy tờ không cần công
                khai.
              </label>
              <p className="text-xs leading-5 text-neutral-500">
                Không tải lên giấy tờ định danh hoặc dữ liệu riêng tư.
              </p>
            </div>
            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            {create.isError || save.isError || transition.isError ? (
              <p className="text-sm text-red-700" role="alert">
                Không lưu được thao tác. Kiểm tra nội dung và trạng thái tác
                phẩm rồi thử lại.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                disabled={
                  uploading ||
                  create.isPending ||
                  save.isPending ||
                  selected?.status === "ARCHIVED" ||
                  !form.title.trim() ||
                  (!selected && !workId)
                }
                type="submit"
              >
                <Save className="size-4" />{" "}
                {create.isPending || save.isPending
                  ? "Đang lưu…"
                  : selected
                    ? "Lưu bản nháp"
                    : "Tạo bản nháp"}
              </button>
              {selected && selected.status !== "ARCHIVED" ? (
                <>
                  {selected.status !== "PUBLISHED" ||
                  selected.draftVersionNo !== selected.publishedVersionNo ? (
                    <button
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-bold disabled:opacity-50"
                      disabled={
                        dirty ||
                        !form.pages.length ||
                        !form.rightsConfirmed ||
                        !form.privacyReviewed ||
                        transition.isPending
                      }
                      onClick={() => transition.mutate("publish")}
                      type="button"
                    >
                      <Eye className="size-4" />{" "}
                      {selected.status === "PUBLISHED"
                        ? "Công bố bản cập nhật"
                        : "Công bố bản scan"}
                    </button>
                  ) : (
                    <button
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-bold"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate("hide")}
                      type="button"
                    >
                      <EyeOff className="size-4" /> Ẩn bản scan
                    </button>
                  )}
                  <div className="flex min-w-64 flex-1 gap-2">
                    <input
                      aria-label="Lý do lưu trữ bằng scan"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 text-sm"
                      minLength={3}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Lý do lưu trữ"
                      value={reason}
                    />
                    <button
                      className="min-h-11 rounded-lg border border-neutral-300 px-3 text-sm font-bold disabled:opacity-50"
                      disabled={
                        reason.trim().length < 3 || transition.isPending
                      }
                      onClick={() => transition.mutate("archive")}
                      type="button"
                    >
                      <Archive className="mr-1 inline size-4" /> Lưu trữ
                    </button>
                  </div>
                </>
              ) : null}
              {selected?.status === "ARCHIVED" && canRestore ? (
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-bold"
                  disabled={transition.isPending}
                  onClick={() => transition.mutate("restore")}
                  type="button"
                >
                  <RotateCcw className="size-4" /> Khôi phục
                </button>
              ) : null}
            </div>
            {selected?.published ? (
              <details className="rounded-lg border border-neutral-200 p-4">
                <summary className="cursor-pointer font-bold">
                  Thông tin đã công bố · v{selected.publishedVersionNo}
                </summary>
                <p className="mt-2 text-sm">
                  {selected.published.title} · {selected.published.pages.length}{" "}
                  trang scan
                </p>
              </details>
            ) : null}
          </form>
        ) : (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <div>
              <FileImage className="mx-auto size-9 text-neutral-400" />
              <p className="mt-3 font-semibold">
                Chọn một bằng lưu trữ hoặc tạo mới
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Ảnh chỉ hiện trên trang công khai sau khi được công bố.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
