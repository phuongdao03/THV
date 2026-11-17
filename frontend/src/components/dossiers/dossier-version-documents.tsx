"use client";
import { z } from "zod";
import { EvidenceViewer } from "@/components/reviews/evidence-viewer";
const snapshotSchema = z.object({
  evidences: z.array(
    z.object({
      id: z.string(),
      mediaAssetId: z.string(),
      evidenceType: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      issuedAt: z.string().nullable().optional(),
      displayOrder: z.number().optional(),
      isPublic: z.boolean().optional(),
      media: z.object({
        mimeType: z.string(),
        bytes: z.number(),
        sha256: z.string().optional(),
      }),
    }),
  ),
});
export function DossierVersionDocuments({ snapshot }: { snapshot: unknown }) {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success)
    return (
      <p className="text-sm text-[var(--theme-muted)]">
        Bản lưu này chưa có danh mục tài liệu theo định dạng hiện tại. Dữ liệu
        gốc vẫn được giữ; cần đối chiếu cấu trúc phiên bản cũ.
      </p>
    );
  return (
    <EvidenceViewer
      contextLabel="Tài liệu lưu trong hồ sơ"
      evidences={parsed.data.evidences.map((item) => ({
        ...item,
        description: item.description ?? null,
        issuedAt: item.issuedAt ?? null,
        displayOrder: item.displayOrder ?? 0,
        isPublic: item.isPublic ?? false,
        media: { ...item.media, sha256: item.media.sha256 ?? "" },
      }))}
    />
  );
}
