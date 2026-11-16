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

it("captures a year or exact nomination date in one field", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField
        initialYear={1998}
        label="Thời gian đề cử"
        name="nominatedAt"
        yearName="nominationYear"
      />
    </form>,
  );

  const input = screen.getByLabelText("Thời gian đề cử");
  expect(input).toHaveProperty("value", "1998");
  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  expect(new FormData(form).get("nominationYear")).toBe("1998");

  fireEvent.change(input, { target: { value: "15/05/2020" } });

  const values = new FormData(form);
  expect(values.get("nominatedAt")).toBe("2020-05-15");
  expect(values.get("nominationYear")).toBe("2020");
});

it("preserves year-only values before year 1000", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField
        initialYear={982}
        label="Thời gian đề cử"
        name="nominatedAt"
        yearName="nominationYear"
      />
    </form>,
  );

  const input = screen.getByLabelText("Thời gian đề cử");
  expect(input).toHaveProperty("value", "982");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  const values = new FormData(form);
  expect(values.get("nominationYear")).toBe("982");
  expect(values.get("nominatedAt")).toBe("");
});

it("opens the calendar on a year-only date before year 100", () => {
  render(
    <HistoricalDateField
      initialYear={87}
      label="Thời gian đề cử"
      name="nominatedAt"
      yearName="nominationYear"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Mở lịch chọn ngày" }));

  expect(
    screen
      .getByRole("button", { name: "1 tháng 1 năm 87" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

it("keeps the calendar within the supported year range", () => {
  render(
    <HistoricalDateField
      initialYear={2200}
      label="Thời gian đề cử"
      name="nominatedAt"
      yearName="nominationYear"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Mở lịch chọn ngày" }));
  for (let month = 0; month < 11; month += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Tháng sau" }));
  }

  const nextMonthButton = screen.getByRole("button", {
    name: "Tháng sau",
  }) as HTMLButtonElement;
  expect(nextMonthButton.disabled).toBe(true);
  fireEvent.click(nextMonthButton);
  expect(
    screen
      .getByRole("button", { name: "1 tháng 12 năm 2200" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

it("does not navigate the calendar before year 1", () => {
  render(
    <HistoricalDateField
      initialYear={1}
      label="Thời gian đề cử"
      name="nominatedAt"
      yearName="nominationYear"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Mở lịch chọn ngày" }));
  const previousMonthButton = screen.getByRole("button", {
    name: "Tháng trước",
  }) as HTMLButtonElement;
  expect(previousMonthButton.disabled).toBe(true);
});

it("clears year and exact date together from the combined time field", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField
        initialDate="2020-05-15"
        initialYear={2020}
        label="Thời gian đề cử"
        name="nominatedAt"
        yearName="nominationYear"
      />
    </form>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Xóa thời gian" }));

  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  const values = new FormData(form);
  expect(values.get("nominatedAt")).toBe("");
  expect(values.get("nominationYear")).toBe("");
});

it("rejects a nomination year outside the existing API range", () => {
  render(
    <form aria-label="Thời gian">
      <HistoricalDateField
        label="Thời gian đề cử"
        name="nominatedAt"
        yearName="nominationYear"
      />
    </form>,
  );

  const input = screen.getByLabelText("Thời gian đề cử");
  fireEvent.change(input, { target: { value: "2201" } });

  expect(input.getAttribute("aria-invalid")).toBe("true");
  const form = screen.getByRole("form", {
    name: "Thời gian",
  }) as HTMLFormElement;
  const values = new FormData(form);
  expect(values.get("nominatedAt")).toBe("");
  expect(values.get("nominationYear")).toBe("");
});
