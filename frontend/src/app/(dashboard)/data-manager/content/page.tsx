import { Eye } from "lucide-react";

import { WorkspacePageHeader } from "@/components/layout/workspace-page-header";
import { DataManagerContentWorkspace } from "@/components/historical-nominations/data-manager-content-workspace";

export default function DataManagerPublicContentPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <WorkspacePageHeader
        section="Quản lý dữ liệu"
        title="Nội dung công bố"
        description="Biên tập phần trình bày công khai từ hồ sơ nguồn, xem trước và công bố khi sẵn sàng."
        icon={Eye}
      />
      <DataManagerContentWorkspace initialTab="public-content" />
    </div>
  );
}
