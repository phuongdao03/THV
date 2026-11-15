"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { formatDateInput, parseDateInput } from "@/lib/dates";

const fieldClass =
  "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm";
const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function monthStart(value: string | null) {
  if (value) {
    const [year, month] = value.split("-").map(Number);
    if (year && month) return new Date(Date.UTC(year, month - 1, 1));
  }
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
}

function toIsoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function HistoricalDateField({
  label,
  name,
  initialDate,
  disabled = false,
}: {
  label: string;
  name: string;
  initialDate?: string | null;
  disabled?: boolean;
}) {
  const [isoDate, setIsoDate] = useState(initialDate ?? "");
  const [displayValue, setDisplayValue] = useState(
    formatDateInput(initialDate),
  );
  const displayInput = useRef<HTMLInputElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(initialDate ?? null),
  );
  const calendarId = `${name}-calendar`;
  const dateParts = useMemo(
    () => ({
      year: visibleMonth.getUTCFullYear(),
      month: visibleMonth.getUTCMonth() + 1,
    }),
    [visibleMonth],
  );
  const monthTitle = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(visibleMonth);
  const monthOffset =
    (new Date(Date.UTC(dateParts.year, dateParts.month - 1, 1)).getUTCDay() +
      6) %
    7;
  const dayCount = new Date(
    Date.UTC(dateParts.year, dateParts.month, 0),
  ).getUTCDate();
  const invalidDate = Boolean(displayValue && !isoDate);

  function setSelectedDate(value: string) {
    setIsoDate(value);
    setDisplayValue(formatDateInput(value));
    displayInput.current?.setCustomValidity("");
  }

  function moveMonth(offset: -1 | 1) {
    setVisibleMonth(
      new Date(Date.UTC(dateParts.year, dateParts.month - 1 + offset, 1)),
    );
  }

  return (
    <div className="space-y-1.5 text-sm">
      <label className="block" htmlFor={`${name}-display`}>
        {label}
      </label>
      <input name={name} type="hidden" value={isoDate} />
      <input name={`${name}Display`} type="hidden" value={displayValue} />
      <div className="relative flex min-w-0 items-center gap-2">
        <input
          aria-describedby={`${name}-hint`}
          aria-invalid={invalidDate}
          autoComplete="off"
          className={`${fieldClass} min-h-11 min-w-0 pr-20 ${invalidDate ? "border-[var(--theme-danger)]" : ""}`}
          disabled={disabled}
          id={`${name}-display`}
          inputMode="numeric"
          ref={displayInput}
          onChange={(event) => {
            const input = event.currentTarget;
            const nextDisplay = input.value;
            const parsed = parseDateInput(nextDisplay);
            setDisplayValue(nextDisplay);
            setIsoDate(parsed ?? "");
            input.setCustomValidity(
              nextDisplay && !parsed
                ? "Nhập ngày hợp lệ theo định dạng dd/mm/yyyy."
                : "",
            );
          }}
          placeholder="dd/mm/yyyy"
          type="text"
          value={displayValue}
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {displayValue ? (
            <button
              aria-label="Xóa ngày"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--theme-muted)] hover:bg-[var(--theme-surface-muted)] disabled:opacity-50"
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--theme-muted)] hover:bg-[var(--theme-surface-muted)] disabled:opacity-50"
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--theme-border)] hover:bg-[var(--theme-surface-muted)]"
                onClick={() => moveMonth(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <p className="font-semibold capitalize">{monthTitle}</p>
              <button
                aria-label="Tháng sau"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--theme-border)] hover:bg-[var(--theme-surface-muted)]"
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
                    className="h-9 rounded-lg text-sm hover:bg-[var(--theme-surface-muted)] aria-pressed:bg-[var(--theme-primary)] aria-pressed:text-white"
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
        className={`text-xs ${invalidDate ? "text-[var(--theme-danger)]" : "text-[var(--theme-muted)]"}`}
        id={`${name}-hint`}
        role={invalidDate ? "alert" : undefined}
      >
        {invalidDate
          ? "Ngày không hợp lệ. Hãy nhập theo định dạng dd/mm/yyyy."
          : "Ngày dạng dd/mm/yyyy; có thể để trống nếu chưa rõ."}
      </p>
    </div>
  );
}
