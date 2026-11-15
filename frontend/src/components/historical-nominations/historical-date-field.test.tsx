import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { HistoricalDateField } from "@/components/historical-nominations/historical-date-field";

it("uses an exact Vietnamese day value and never shifts it through UTC", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField
        label="Ngày đề cử"
        name="nominatedAt"
        initialDate="2020-05-15"
      />
    </form>,
  );

  expect(screen.getByLabelText("Ngày đề cử")).toHaveProperty(
    "value",
    "15/05/2020",
  );
  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  expect(new FormData(form).get("nominatedAt")).toBe("2020-05-15");
});

it("lets the operator clear an exact date without inventing a replacement", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField
        label="Ngày đề cử"
        name="nominatedAt"
        initialDate="2020-05-15"
      />
    </form>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Xóa ngày" }));
  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  expect(new FormData(form).get("nominatedAt")).toBe("");
});

it("rejects impossible typed dates and shows the expected format", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField label="Ngày đề cử" name="nominatedAt" />
    </form>,
  );

  const input = screen.getByLabelText("Ngày đề cử");
  fireEvent.change(input, { target: { value: "22/22/2222" } });

  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toContain("dd/mm/yyyy");
  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  expect(new FormData(form).get("nominatedAt")).toBe("");
});
