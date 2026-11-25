import { RoleGate } from "@/components/auth/role-gate";
import { HrDashboardSummary } from "@/components/hr/hr-dashboard-summary";

export default function AdminHrPage() {
  return (
    <RoleGate allowed={["SUPER_ADMIN"]}>
      <div className="pb-12">
        <HrDashboardSummary />
      </div>
    </RoleGate>
  );
}
