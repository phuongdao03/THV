"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { formatDateInput, parseDateInput } from "@/lib/dates";

const fieldClass =
  "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm";
const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function calendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function monthStart(value: string | null) {
  if (value) {
    const [year, month] = value.split("-").map(Number);
    if (year && month) return calendarDate(year, month, 1);
  }
  const today = new Date();
  return calendarDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 1);
}

function toIsoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYearInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const year = Number(trimmed);
  return year >= 1 && year <= 2200 ? year : null;
}

export function HistoricalDateField({
  label,
  name,
  initialDate,
  initialYear,
  yearName,
  disabled = false,
}: {
  label: string;
  name: string;
  initialDate?: string | null;
  initialYear?: number | null;
  yearName?: string;
  disabled?: boolean;
}) {
  const resolvedInitialYear = initialDate
    ? Number(initialDate.slice(0, 4))
    : (initialYear ?? null);
  const [isoDate, setIsoDate] = useState(initialDate ?? "");
  const [displayValue, setDisplayValue] = useState(
    formatDateInput(initialDate) ||
      (yearName && resolvedInitialYear ? String(resolvedInitialYear) : ""),
  );
  const [yearValue, setYearValue] = useState(
    yearName && resolvedInitialYear ? String(resolvedInitialYear) : "",
  );
  const displayInput = useRef<HTMLInputElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(
      initialDate ??
        (yearName && resolvedInitialYear
          ? `${resolvedInitialYear}-01-01`
          : null),
    ),
  );
  const calendarId = `${name}-calendar`;
  const dateParts = useMemo(
    () => ({
      year: visibleMonth.getUTCFullYear(),
      month: visibleMonth.getUTCMonth() + 1,
    }),
    [visibleMonth],
  );
  const previousMonthDisabled = Boolean(
    disabled || (yearName && dateParts.year <= 1 && dateParts.month === 1),
  );
  const nextMonthDisabled = Boolean(
    disabled || (yearName && dateParts.year >= 2200 && dateParts.month === 12),
  );
  const monthTitle = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(visibleMonth);
  const monthOffset =
    (calendarDate(dateParts.year, dateParts.month, 1).getUTCDay() + 6) % 7;
  const dayCount = calendarDate(
    dateParts.year,
    dateParts.month + 1,
    0,
  ).getUTCDate();
  const invalidDate = Boolean(
    displayValue &&
      !isoDate &&
      !(yearName && parseYearInput(displayValue) !== null),
  );

  function setSelectedDate(value: string) {
    const year = value ? Number(value.slice(0, 4)) : null;
    if (yearName && year !== null && (year < 1 || year > 2200)) {
      displayInput.current?.setCustomValidity(
        "Nhập năm từ 1 đến 2200 hoặc ngày hợp lệ dd/mm/yyyy.",
      );
      return;
    }
    setIsoDate(value);
    setYearValue(yearName && value ? value.slice(0, 4) : "");
    setDisplayValue(formatDateInput(value));
    displayInput.current?.setCustomValidity("");
  }

  function moveMonth(offset: -1 | 1) {
    setVisibleMonth(calendarDate(dateParts.year, dateParts.month + offset, 1));
  }

  return (
    <div className="space-y-1.5 text-sm">
      <label className="block" htmlFor={`${name}-display`}>
        {label}
      </label>
      <input name={name} type="hidden" value={isoDate} />
      {yearName ? (
        <input name={yearName} type="hidden" value={yearValue} />
      ) : null}
      <input name={`${name}Display`} type="hidden" value={displayValue} />
      <div className="relative flex min-w-0 items-center gap-2">
        <input
          aria-describedby={`${name}-hint`}
          aria-invalid={invalidDate}
          autoComplete="off"
          className={`${fieldClass} min-h-11 min-w-0 pr-20 ${invalidDate ? "border-red-700 dark:border-red-300" : ""}`}
          disabled={disabled}
          id={`${name}-display`}
          inputMode="numeric"
          ref={displayInput}
          onChange={(event) => {
            const input = event.currentTarget;
            const nextDisplay = input.value;
            const parsedDate = parseDateInput(nextDisplay);
            const dateYear = parsedDate ? Number(parsedDate.slice(0, 4)) : null;
            const validDate =
              parsedDate && (!yearName || (dateYear ?? 0) <= 2200)
                ? parsedDate
                : null;
            const parsedYear = yearName ? parseYearInput(nextDisplay) : null;
            setDisplayValue(nextDisplay);
            setIsoDate(validDate ?? "");
            if (validDate) {
              setVisibleMonth(monthStart(validDate));
            } else if (parsedYear) {
              setVisibleMonth(monthStart(`${parsedYear}-01-01`));
            }
            setYearValue(
              yearName
                ? String(parsedYear ?? (validDate ? dateYear : "") ?? "")
                : "",
            );
            input.setCustomValidity(
              nextDisplay && !validDate && parsedYear === null
                ? yearName
                  ? "Nhập năm từ 1 đến 2200 hoặc ngày hợp lệ dd/mm/yyyy."
                  : "Nhập ngày hợp lệ theo định dạng dd/mm/yyyy."
                : "",
            );
          }}
          placeholder={yearName ? "dd/mm/yyyy hoặc yyyy" : "dd/mm/yyyy"}
          type="text"
          value={displayValue}
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {displayValue ? (
            <button
              aria-label={yearName ? "Xóa thời gian" : "Xóa ngày"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--theme-muted)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] disabled:opacity-50"
              disabled={disabled}
              onClick={() => setSelectedDate("")}
              type="button"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
          <button
            aria-controls={calendarId}
            aria-expanded={calendarOpen}
            aria-label={calendarOpen ? "Đóng lịch" : "Mở lịch chọn ngày"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--theme-muted)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] disabled:opacity-50"
            disabled={disabled}
            onClick={() => setCalendarOpen((open) => !open)}
            type="button"
          >
            <CalendarDays aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {calendarOpen ? (
          <div
            aria-label={`Lịch chọn ${label.toLocaleLowerCase("vi-VN")}`}
            className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 shadow-lg"
            id={calendarId}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <button
                aria-label="Tháng trước"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--theme-border)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={previousMonthDisabled}
                onClick={() => moveMonth(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <p className="font-semibold capitalize">{monthTitle}</p>
              <button
                aria-label="Tháng sau"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--theme-border)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={nextMonthDisabled}
                onClick={() => moveMonth(1)}
                type="button"
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div
              aria-label="Các ngày trong tháng"
              className="mt-3 grid grid-cols-7 gap-1 text-center text-xs"
              role="grid"
            >
              {weekDays.map((day) => (
                <span
                  aria-label={day}
                  className="grid h-9 place-items-center font-medium text-[var(--theme-muted)]"
                  key={day}
                  role="columnheader"
                >
                  {day}
                </span>
              ))}
              {Array.from({ length: monthOffset }, (_, index) => (
                <span aria-hidden className="h-9" key={`blank-${index}`} />
              ))}
              {Array.from({ length: dayCount }, (_, index) => {
                const day = index + 1;
                const value = toIsoDate(dateParts.year, dateParts.month, day);
                const selected = value === isoDate;
                return (
                  <button
                    aria-label={`${day} tháng ${dateParts.month} năm ${dateParts.year}`}
                    aria-pressed={selected}
                    className="h-9 rounded-lg text-sm hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] aria-pressed:bg-primary-700 aria-pressed:text-white"
                    disabled={
                      disabled ||
                      Boolean(
                        yearName &&
                          (dateParts.year < 1 || dateParts.year > 2200),
                      )
                    }
                    key={value}
                    onClick={() => {
                      setSelectedDate(value);
                      setCalendarOpen(false);
                    }}
                    type="button"
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-center text-xs text-[var(--theme-muted)]">
              Chọn ngày chính xác nếu tài liệu có ghi nhận.
            </p>
          </div>
        ) : null}
      </div>
      <p
        className={`text-xs ${invalidDate ? "text-red-700 dark:text-red-300" : "text-[var(--theme-muted)]"}`}
        id={`${name}-hint`}
        role={invalidDate ? "alert" : undefined}
      >
        {invalidDate
          ? yearName
            ? "Thời gian không hợp lệ. Nhập năm từ 1 đến 2200 hoặc ngày dd/mm/yyyy."
            : "Ngày không hợp lệ. Hãy nhập theo định dạng dd/mm/yyyy."
          : yearName
            ? "Nhập năm (ví dụ 1998) hoặc ngày dd/mm/yyyy. Có thể để trống nếu chưa rõ."
            : "Ngày dạng dd/mm/yyyy; có thể để trống nếu chưa rõ."}
      </p>
    </div>
  );
}
