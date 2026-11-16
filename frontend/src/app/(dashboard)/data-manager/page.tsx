import { FileCheck2 } from "lucide-react";
import { redirect } from "next/navigation";

import { WorkspacePageHeader } from "@/components/layout/workspace-page-header";
import { DataManagerContentWorkspace } from "@/components/historical-nominations/data-manager-content-workspace";

export default async function DataManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const { area } = await searchParams;
  if (area === "public-content") redirect("/data-manager/content");

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <WorkspacePageHeader
        section="Quản lý dữ liệu"
        title="Hồ sơ đề cử lịch sử"
        description="Tìm hồ sơ cũ, tiếp tục nhập thông tin và bổ sung tài liệu lưu trữ."
        icon={FileCheck2}
      />
      <DataManagerContentWorkspace initialTab="historical-records" />
    </div>
  );
}
