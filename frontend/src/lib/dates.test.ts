import { describe, expect, it } from "vitest";

import { formatDateInput, parseDateInput } from "@/lib/dates";

describe("Vietnamese date fields", () => {
  it("formats and parses dd/mm/yyyy", () => {
    expect(formatDateInput("2024-02-29")).toBe("29/02/2024");
    expect(parseDateInput("29/02/2024")).toBe("2024-02-29");
  });

  it("rejects invalid dates and alternate formats", () => {
    expect(parseDateInput("31/02/2024")).toBeNull();
    expect(parseDateInput("02/29/2024")).toBeNull();
  });
});
