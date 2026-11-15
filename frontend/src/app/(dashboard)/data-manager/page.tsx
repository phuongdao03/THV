import { FileCheck2 } from "lucide-react";

import { WorkspacePageHeader } from "@/components/layout/workspace-page-header";
import { DataManagerContentWorkspace } from "@/components/historical-nominations/data-manager-content-workspace";

export default async function DataManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const { area } = await searchParams;
  const initialTab: "historical-records" | "public-content" =
    area === "historical-records" ? area : "public-content";

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <WorkspacePageHeader
        section="Không gian dữ liệu"
        title="Hồ sơ lịch sử & nội dung công bố"
        description="Bổ sung hồ sơ cũ, người gửi, tài liệu và bằng scan; biên tập, xem trước và đăng nội dung lên trang công khai khi sẵn sàng."
        icon={FileCheck2}
      />
      <DataManagerContentWorkspace initialTab={initialTab} />
    </div>
  );
}
