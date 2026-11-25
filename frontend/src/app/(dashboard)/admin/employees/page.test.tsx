import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import AdminEmployeesPage from "./page";

vi.mock("@/components/auth/role-gate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/hr/people-workspace", () => ({
  PeopleWorkspace: ({
    initialAccountSearch,
    initialActiveOnly,
    initialView,
  }: {
    initialAccountSearch: string;
    initialActiveOnly: boolean;
    initialView: string;
  }) => (
    <div>
      <span data-testid="view">{initialView}</span>
      <span data-testid="account">{initialAccountSearch}</span>
      <span data-testid="status">{initialActiveOnly ? "active" : "all"}</span>
    </div>
  ),
}));

describe("AdminEmployeesPage", () => {
  it("opens the employee view with the invited account from the URL", async () => {
    render(
      await AdminEmployeesPage({
        searchParams: Promise.resolve({
          view: "employees",
          account: " reviewer@example.com ",
        }),
      }),
    );

    expect(screen.getByTestId("view").textContent).toBe("employees");
    expect(screen.getByTestId("account").textContent).toBe(
      "reviewer@example.com",
    );
  });

  it("initializes the active employee filter from the overview link", async () => {
    render(
      await AdminEmployeesPage({
        searchParams: Promise.resolve({ view: "employees", status: "active" }),
      }),
    );

    expect(screen.getByTestId("view").textContent).toBe("employees");
    expect(screen.getByTestId("status").textContent).toBe("active");
  });
});
