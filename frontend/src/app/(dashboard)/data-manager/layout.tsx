import type { ReactNode } from "react";

import { RoleGate } from "@/components/auth/role-gate";

export default function DataManagerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RoleGate allowed={["DATA_MANAGER"]}>{children}</RoleGate>;
}
