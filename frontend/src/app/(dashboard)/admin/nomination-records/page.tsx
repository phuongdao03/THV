import { RoleGate } from "@/components/auth/role-gate";
import { NominationArchive } from "@/components/admin/nomination-archive";

export default function NominationArchivePage() {
  return (
    <RoleGate allowed={["SUPER_ADMIN"]}>
      <NominationArchive />
    </RoleGate>
  );
}
