"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileSpreadsheet, Plus, Search } from "lucide-react";
import { useState } from "react";

import { historicalNominationApi } from "@/lib/api/client";
import type {
  HistoricalNomination,
  HistoricalNominationInput,
} from "@/lib/api/historical-nomination-types";

import { HistoricalImportWorkspace } from "./historical-import-workspace";
import { HistoricalRecordDetail } from "./historical-record-detail";
import { HistoricalRecordForm } from "./historical-record-form";

export function HistoricalNominationsWorkspace() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"records" | "import">("records");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const records = useQuery({
    queryKey: ["historical-nominations", query],
    queryFn: () => historicalNominationApi.list({ query, pageSize: 50 }),
  });
  const selected = useQuery({
    queryKey: ["historical-nomination", selectedId],
    queryFn: () => historicalNominationApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  async function saveRecord(input: HistoricalNominationInput) {
    setBusy(true);
    setError(null);
    try {
      const saved = selectedId
        ? await historicalNominationApi.update(selectedId, {
            ...input,
            expectedUpdatedAt: selected.data?.updatedAt,
          })
        : await historicalNominationApi.create(input);
      setSelectedId(saved.id);
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", saved.id],
        }),
      ]);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không lưu được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitRecord() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.submit(selectedId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", selectedId],
        }),
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Không gửi được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedRecord = selected.data;
  const canEdit =
    selectedRecord?.verificationStatus === "DRAFT" ||
    selectedRecord?.verificationStatus === "NEEDS_CORRECTION";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-md border border-[var(--theme-border)] p-1"
          role="tablist"
          aria-label="Chế độ quản lý"
        >
          <button
            aria-selected={tab === "records"}
            className="rounded px-3 py-2 text-sm aria-selected:bg-[var(--theme-surface-muted)]"
            onClick={() => setTab("records")}
            role="tab"
            type="button"
          >
            Hồ sơ
          </button>
          <button
            aria-selected={tab === "import"}
            className="rounded px-3 py-2 text-sm aria-selected:bg-[var(--theme-surface-muted)]"
            onClick={() => setTab("import")}
            role="tab"
            type="button"
          >
            <FileSpreadsheet className="mr-1 inline h-4 w-4" />
            Nhập bảng
          </button>
        </div>
        {tab === "records" ? (
          <button
            className="inline-flex items-center gap-2 rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
            onClick={() => {
              setSelectedId(null);
              setEditing(true);
              setError(null);
            }}
            type="button"
          >
            <Plus className="h-4 w-4" /> Tạo hồ sơ
          </button>
        ) : null}
      </div>
      {tab === "import" ? (
        <HistoricalImportWorkspace
          onImported={() =>
            void queryClient.invalidateQueries({
              queryKey: ["historical-nominations"],
            })
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.5fr)]">
          <section
            className="space-y-3 rounded-lg border border-[var(--theme-border)] p-3"
            aria-label="Danh sách hồ sơ lịch sử"
          >
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-muted)]" />
              <input
                aria-label="Tìm hồ sơ"
                className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] py-2 pl-9 pr-3 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên, tiêu đề hoặc mã"
                value={query}
              />
            </label>
            {records.isLoading ? (
              <div aria-busy="true" className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <div
                    className="h-16 animate-pulse rounded bg-[var(--theme-surface-muted)]"
                    key={item}
                  />
                ))}
              </div>
            ) : null}
            {records.error ? (
              <p className="text-sm text-[var(--theme-danger)]" role="alert">
                {records.error.message}
              </p>
            ) : null}
            {!records.isLoading && records.data?.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-[var(--theme-muted)]">
                Chưa có hồ sơ phù hợp.
              </p>
            ) : null}
            <ul className="space-y-1">
              {records.data?.map((record) => (
                <RecordButton
                  key={record.id}
                  record={record}
                  selected={record.id === selectedId}
                  onSelect={() => {
                    setSelectedId(record.id);
                    setEditing(false);
                    setError(null);
                  }}
                />
              ))}
            </ul>
          </section>
          <section className="min-w-0 rounded-lg border border-[var(--theme-border)] p-4 sm:p-5">
            {editing ? (
              <HistoricalRecordForm
                key={selectedRecord?.id ?? "new"}
                busy={busy}
                onCancel={() => {
                  setEditing(false);
                  if (!selectedRecord) setSelectedId(null);
                }}
                onSave={(input) => void saveRecord(input)}
                record={selectedRecord}
              />
            ) : selectedRecord ? (
              selected.isLoading ? (
                <p className="text-sm text-[var(--theme-muted)]">
                  Đang tải hồ sơ…
                </p>
              ) : (
                <HistoricalRecordDetail
                  canEdit={Boolean(canEdit)}
                  onEdit={() => setEditing(true)}
                  onSubmit={() => void submitRecord()}
                  record={selectedRecord}
                  submitting={busy}
                />
              )
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Archive className="h-8 w-8 text-[var(--theme-muted)]" />
                <p className="mt-3 font-medium">Chọn một hồ sơ</p>
                <p className="mt-1 max-w-sm text-sm text-[var(--theme-muted)]">
                  Bản nháp chỉ trở thành hồ sơ chờ xác minh sau khi người quản
                  lý gửi cho Admin.
                </p>
              </div>
            )}
            {error ? (
              <p
                className="mt-4 text-sm text-[var(--theme-danger)]"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

function RecordButton({
  record,
  selected,
  onSelect,
}: {
  record: HistoricalNomination;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className="w-full rounded-md border border-transparent p-3 text-left hover:border-[var(--theme-border)] aria-current:border-[var(--theme-accent)] aria-current:bg-[var(--theme-surface-muted)]"
        onClick={onSelect}
        type="button"
      >
        <span className="block truncate text-sm font-medium">
          {record.subjectName}
        </span>
        <span className="mt-1 block truncate text-xs text-[var(--theme-muted)]">
          {record.code} · {record.title}
        </span>
        <span className="mt-2 inline-flex rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-xs">
          {record.verificationStatus}
        </span>
      </button>
    </li>
  );
}
