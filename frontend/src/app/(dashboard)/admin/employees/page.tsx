import { RoleGate } from "@/components/auth/role-gate";
import { PeopleWorkspace } from "@/components/hr/people-workspace";

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[];
    account?: string | string[];
    status?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const initialView = params.view === "accounts" ? "accounts" : "employees";
  const initialAccountSearch =
    initialView === "employees" && typeof params.account === "string"
      ? params.account.trim()
      : "";

  return (
    <RoleGate allowed={["SUPER_ADMIN"]} permissions={["hr.employees.read"]}>
      <PeopleWorkspace
        initialAccountSearch={initialAccountSearch}
        initialActiveOnly={
          initialView === "employees" && params.status === "active"
        }
        initialView={initialView}
      />
    </RoleGate>
  );
}
