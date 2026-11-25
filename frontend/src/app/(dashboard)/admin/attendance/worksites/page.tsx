import { RoleGate } from "@/components/auth/role-gate";
import { AttendanceConfigurationWorkspace } from "@/components/hr/attendance-configuration-workspace";

export default async function AttendanceWorksitesPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string | string[] }>;
}) {
  const { setup } = await searchParams;
  return (
    <RoleGate allowed={["SUPER_ADMIN"]}>
      <AttendanceConfigurationWorkspace
        key={setup === "gps" ? "gps" : "worksites"}
        showGpsSetup={setup === "gps"}
      />
    </RoleGate>
  );
}
