import { notFound } from "next/navigation";
import { RoleGate } from "@/components/auth/role-gate";
import { NominationArchiveDetail } from "@/components/admin/nomination-archive-detail";

export default async function NominationArchiveRecordPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  if (source !== "CURRENT" && source !== "LEGACY") notFound();
  return (
    <RoleGate allowed={["SUPER_ADMIN", "DATA_MANAGER"]}>
      <NominationArchiveDetail source={source} recordId={id} />
    </RoleGate>
  );
}
