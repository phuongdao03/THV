"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { historicalNominationApi } from "@/lib/api/client";
import type { HistoricalNominationInput } from "@/lib/api/historical-nomination-types";

import { HistoricalRecordDetailComplete } from "./historical-record-detail-complete";
import { HistoricalRecordFormComplete } from "./historical-record-form-complete";

export function DataManagerRecordWorkspace({ recordId }: { recordId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const record = useQuery({
    queryKey: ["historical-nomination", recordId],
    queryFn: () => historicalNominationApi.get(recordId),
  });
  async function saveRecord(input: HistoricalNominationInput) {
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.update(recordId, input);
      setEditing(false);
      await invalidateRecordQueries();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không lưu được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveRecord() {
    const reason = window.prompt("Lý do lưu trữ hồ sơ:")?.trim();
    if (!reason || !record.data) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.archive(
        recordId,
        reason,
        record.data.updatedAt,
      );
      await queryClient.invalidateQueries({
        queryKey: ["historical-nominations"],
      });
      router.push("/data-manager?area=historical-records");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không lưu trữ được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function invalidateRecordQueries() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["historical-nomination", recordId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["historical-nomination-publication", recordId],
      }),
      queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
      queryClient.invalidateQueries({
        queryKey: ["historical-nomination-dashboard-summary"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["historical-nomination-activity", recordId],
      }),
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <Link
        className="inline-flex min-h-10 items-center text-sm font-medium text-[var(--theme-primary)]"
        href="/data-manager?area=historical-records"
      >
        ← Danh sách hồ sơ
      </Link>
      {record.isLoading ? (
        <p
          aria-busy="true"
          className="rounded-lg border border-[var(--theme-border)] p-5 text-sm text-[var(--theme-muted)]"
        >
          Đang tải hồ sơ…
        </p>
      ) : record.error || !record.data ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--theme-danger)] p-4 text-sm text-[var(--theme-danger)]"
        >
          {record.error?.message ?? "Không tìm thấy hồ sơ."}
        </p>
      ) : editing ? (
        <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-6">
          <HistoricalRecordFormComplete
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={(input) => void saveRecord(input)}
            record={record.data}
          />
        </section>
      ) : (
        <>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--theme-danger)] p-3 text-sm text-[var(--theme-danger)]"
            >
              {error}
            </p>
          ) : null}
          <HistoricalRecordDetailComplete
            canEdit={record.data.archiveStatus === "ACTIVE"}
            onArchive={() => void archiveRecord()}
            onEdit={() => setEditing(true)}
            record={record.data}
            submitting={busy}
          />
        </>
      )}
    </div>
  );
}
