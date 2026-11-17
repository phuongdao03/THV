import { CmsWorkspace } from "@/components/admin/cms-workspace";
import { RoleGate } from "@/components/auth/role-gate";
import Link from "next/link";

export default async function CmsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    workId?: string;
    source?: string;
    recordId?: string;
  }>;
}) {
  const { workId, source, recordId } = await searchParams;
  const sourcePath =
    (source === "CURRENT" || source === "LEGACY") &&
    recordId &&
    /^[0-9a-f-]{36}$/i.test(recordId)
      ? `/admin/nomination-records/${source}/${recordId}`
      : null;
  return (
    <RoleGate allowed={["SUPER_ADMIN"]}>
      {sourcePath ? (
        <Link
          className="mb-4 inline-flex min-h-11 items-center text-sm text-[var(--theme-accent)]"
          href={sourcePath}
        >
          ← Trở về bộ hồ sơ nguồn
        </Link>
      ) : null}
      <CmsWorkspace initialWorkId={workId?.slice(0, 128)} />
    </RoleGate>
  );
}
