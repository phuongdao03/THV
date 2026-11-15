import { RoleGate } from "@/components/auth/role-gate";
import { HistoricalReviewWorkspace } from "@/components/historical-nominations/historical-review-workspace";

export default function HistoricalNominationsReviewPage() {
  return (
    <RoleGate allowed={["SUPER_ADMIN"]}>
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
            Quản lý dữ liệu lịch sử
          </p>
          <h1 className="mt-1 text-2xl font-bold">Xác minh hồ sơ đề cử cũ</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--theme-muted)]">
            Rà soát nguồn và dữ liệu riêng tư, sau đó duyệt nội dung công khai
            riêng. Hồ sơ lịch sử không phát hành bằng xác lập hoặc ghi
            blockchain.
          </p>
        </header>
        <HistoricalReviewWorkspace />
      </div>
    </RoleGate>
  );
}
