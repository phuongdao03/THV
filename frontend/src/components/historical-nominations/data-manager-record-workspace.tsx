"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { historicalNominationApi } from "@/lib/api/client";
import type {
  HistoricalNomination,
  HistoricalNominationInput,
} from "@/lib/api/historical-nomination-types";

import { HistoricalRecordDetailComplete } from "./historical-record-detail-complete";
import { HistoricalRecordFormComplete } from "./historical-record-form-complete";

type ExitRequest = { href: string | null; backSteps?: number };

export function DataManagerRecordWorkspace({ recordId }: { recordId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editingRecord, setEditingRecord] =
    useState<HistoricalNomination | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshingForEdit, setRefreshingForEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingExit, setPendingExit] = useState<ExitRequest | null>(null);
  const saving = useRef(false);
  const savedNotice = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const exitAfterSave = useRef<ExitRequest | null>(null);
  const restoringHistory = useRef(false);
  const allowNextPopstate = useRef(false);
  const record = useQuery({
    queryKey: ["historical-nomination", recordId],
    queryFn: () => historicalNominationApi.get(recordId),
  });
  useEffect(() => {
    if (!savedAt) return;
    savedNotice.current?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [savedAt]);

  useEffect(() => {
    if (!editing || !dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.target) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingExit({
        href: destination.pathname + destination.search + destination.hash,
      });
    };
    const guardedUrl =
      window.location.pathname + window.location.search + window.location.hash;
    const restoreHistoryGuard = (event: PopStateEvent) => {
      if (allowNextPopstate.current) {
        allowNextPopstate.current = false;
        return;
      }
      event.stopImmediatePropagation();
      if (restoringHistory.current) {
        restoringHistory.current = false;
        return;
      }
      const destination =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      if (event.state?.dataManagerDirtyGuard === recordId) return;
      restoringHistory.current = true;
      window.history.go(1);
      setPendingExit({
        href: destination,
        backSteps: destination === guardedUrl ? 2 : 1,
      });
    };
    if (window.history.state?.dataManagerDirtyGuard !== recordId) {
      window.history.pushState(
        { dataManagerDirtyGuard: recordId },
        "",
        guardedUrl,
      );
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    window.addEventListener("popstate", restoreHistoryGuard, true);
    document.addEventListener("click", guardInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      window.removeEventListener("popstate", restoreHistoryGuard, true);
      document.removeEventListener("click", guardInternalNavigation, true);
    };
  }, [dirty, editing, recordId]);

  function requestExit(target: ExitRequest) {
    if (dirty) {
      setPendingExit(target);
      return;
    }
    setEditing(false);
    setEditingRecord(null);
    if (target.href) router.push(target.href);
  }

  function discardAndExit() {
    if (!pendingExit) return;
    const target = pendingExit;
    setPendingExit(null);
    setDirty(false);
    setEditing(false);
    setEditingRecord(null);
    if (target.backSteps) {
      allowNextPopstate.current = true;
      window.history.go(-target.backSteps);
    } else if (target.href) {
      router.push(target.href);
    }
  }

  function saveAndExit() {
    if (!pendingExit || !formRef.current) return;
    exitAfterSave.current = pendingExit;
    setPendingExit(null);
    formRef.current.requestSubmit();
  }

  async function beginEditing() {
    if (!record.data || busy || refreshingForEdit) return;
    setRefreshingForEdit(true);
    setError(null);
    try {
      const refreshed = await record.refetch();
      if (refreshed.isError || !refreshed.data) {
        throw (
          refreshed.error ??
          new Error("Không tải được phiên bản hồ sơ mới nhất.")
        );
      }
      setEditingRecord(refreshed.data);
      setEditing(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không tải được phiên bản hồ sơ mới nhất.",
      );
    } finally {
      setRefreshingForEdit(false);
    }
  }

  async function saveRecord(input: HistoricalNominationInput) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const baseline = editingRecord ?? record.data;
      let saved: HistoricalNomination;
      try {
        saved = await historicalNominationApi.update(recordId, {
          ...input,
          expectedUpdatedAt: baseline?.updatedAt,
        });
      } catch (cause) {
        if (
          !baseline ||
          typeof cause !== "object" ||
          cause === null ||
          !("status" in cause) ||
          cause.status !== 409
        )
          throw cause;
        const latest = await historicalNominationApi.get(recordId);
        // Related files and publication metadata also advance the record version.
        // Merge only local edits; preserve remote changes to other source fields.
        const localFields = (
          Object.keys(input) as (keyof HistoricalNominationInput)[]
        )
          .filter((key) => key !== "expectedUpdatedAt")
          .filter(
            (key) => input[key] !== baseline[key as keyof HistoricalNomination],
          );
        const sourceChanged = localFields.some(
          (key) =>
            latest[key as keyof HistoricalNomination] !==
              baseline[key as keyof HistoricalNomination] &&
            latest[key as keyof HistoricalNomination] !== input[key],
        );
        if (
          sourceChanged ||
          latest.archiveStatus !== baseline.archiveStatus ||
          latest.verificationStatus !== baseline.verificationStatus
        ) {
          throw new Error(
            "Thông tin hồ sơ đã được thay đổi ở phiên khác. Nội dung bạn nhập vẫn được giữ lại; hãy đối chiếu bản mới trước khi lưu.",
          );
        }
        saved = localFields.every(
          (key) => latest[key as keyof HistoricalNomination] === input[key],
        )
          ? latest
          : await historicalNominationApi.update(recordId, {
              ...Object.fromEntries(
                localFields.map((key) => [key, input[key]]),
              ),
              expectedUpdatedAt: latest.updatedAt,
            });
      }
      queryClient.setQueryData(["historical-nomination", recordId], saved);
      setSavedAt(saved.updatedAt);
      setDirty(false);
      setEditing(false);
      setEditingRecord(null);
      await invalidateRecordQueries();
      const target = exitAfterSave.current;
      exitAfterSave.current = null;
      if (target?.backSteps) {
        allowNextPopstate.current = true;
        window.history.go(-target.backSteps);
      } else if (target?.href) {
        router.push(target.href);
      }
    } catch (cause) {
      exitAfterSave.current = null;
      setError(
        cause instanceof Error ? cause.message : "Không lưu được hồ sơ.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function archiveRecord() {
    const reason = window
      .prompt(
        "Ngừng xử lý hồ sơ này? Hồ sơ sẽ ra khỏi danh sách đang làm; dữ liệu vẫn được giữ. Nhập lý do để xác nhận:",
      )
      ?.trim();
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
      router.push("/data-manager");
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
        className="inline-flex min-h-10 items-center text-sm font-medium text-[var(--theme-accent)]"
        href="/data-manager"
      >
        ← Danh sách hồ sơ
      </Link>
      {refreshingForEdit ? (
        <p className="text-sm text-[var(--theme-muted)]" role="status">
          Đang kiểm tra phiên bản hồ sơ mới nhất…
        </p>
      ) : null}
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
          className="rounded-lg border border-red-700 p-4 text-sm text-red-700 dark:border-red-400 dark:text-red-300"
        >
          {record.error?.message ?? "Không tìm thấy hồ sơ."}
        </p>
      ) : editing ? (
        <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-6">
          <HistoricalRecordFormComplete
            busy={busy}
            error={error}
            formRef={formRef}
            onCancel={() => requestExit({ href: null })}
            onDirtyChange={() => setDirty(true)}
            onSave={(input) => void saveRecord(input)}
            record={editingRecord ?? record.data}
          />
          <p className="mt-4 text-sm text-[var(--theme-muted)]" role="status">
            {busy
              ? "Đang lưu…"
              : dirty
                ? "Chưa lưu thay đổi"
                : "Mọi thay đổi đã được lưu"}
          </p>
        </section>
      ) : (
        <>
          {savedAt ? (
            <p
              className="rounded-md border border-emerald-700/25 bg-emerald-700/5 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-300"
              ref={savedNotice}
              role="status"
            >
              Đã lưu thay đổi lúc{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(savedAt))}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-700 p-3 text-sm text-red-700 dark:border-red-400 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
          <HistoricalRecordDetailComplete
            canEdit={record.data.archiveStatus === "ACTIVE"}
            onArchive={() => void archiveRecord()}
            onEdit={() => void beginEditing()}
            record={record.data}
            submitting={busy || refreshingForEdit}
          />
        </>
      )}
      {pendingExit ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <section
            aria-describedby="unsaved-record-description"
            aria-labelledby="unsaved-record-title"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-xl"
            role="alertdialog"
          >
            <h2 className="text-lg font-semibold" id="unsaved-record-title">
              Bạn có thay đổi chưa lưu
            </h2>
            <p
              className="mt-2 text-sm text-[var(--theme-muted)]"
              id="unsaved-record-description"
            >
              Lưu thay đổi trước khi rời khỏi hồ sơ, hoặc bỏ phần chỉnh sửa hiện
              tại.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm"
                autoFocus
                onClick={() => setPendingExit(null)}
                type="button"
              >
                Tiếp tục chỉnh sửa
              </button>
              <button
                className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm"
                onClick={discardAndExit}
                type="button"
              >
                Bỏ thay đổi
              </button>
              <button
                className="min-h-10 rounded-md bg-primary-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
                disabled={busy}
                onClick={saveAndExit}
                type="button"
              >
                {pendingExit.href ? "Lưu rồi rời trang" : "Lưu thay đổi"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
