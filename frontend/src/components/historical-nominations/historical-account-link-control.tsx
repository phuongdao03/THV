"use client";

import { useId, useState } from "react";
import { historicalNominationApi } from "@/lib/api/client";

export function HistoricalAccountLinkControl({
  recordId,
  personId,
  linkedUserId,
  onLinked,
}: {
  recordId: string;
  personId: string;
  linkedUserId?: string | null;
  onLinked: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState<{ id: string; email: string } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [linked, setLinked] = useState(linkedUserId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldClass =
    "mt-1 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm";

  async function lookup() {
    setBusy(true);
    setError(null);
    setAccount(null);
    try {
      setAccount(
        await historicalNominationApi.findLinkableAccount(email.trim()),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không tìm được tài khoản.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!account || reason.trim().length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.linkAccount(recordId, personId, {
        userId: account.id,
        reason: reason.trim(),
      });
      setLinked(account.id);
      onLinked();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không liên kết được tài khoản.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (linked || linkedUserId)
    return (
      <p
        role="status"
        className="break-all text-sm text-emerald-800 dark:text-emerald-200"
      >
        ✓ Đã liên kết tài khoản · {linked || linkedUserId}
      </p>
    );
  return (
    <section
      aria-label="Liên kết tài khoản"
      className="space-y-3 border-t border-[var(--theme-border)] pt-3"
    >
      <h4 className="text-sm font-semibold">Liên kết tài khoản</h4>
      <p className="text-xs leading-5 text-[var(--theme-muted)]">
        Mời người nhận đăng ký nền tảng, sau đó tìm đúng tài khoản và xác nhận
        liên kết. Không tự liên kết theo tên hoặc email trên hồ sơ.
      </p>
      <label className="block text-sm" htmlFor={`${id}-email`}>
        Email tài khoản đã đăng ký
        <input
          id={`${id}-email`}
          type="email"
          maxLength={320}
          className={fieldClass}
          value={email}
          disabled={busy}
          onChange={(event) => {
            setEmail(event.target.value);
            setAccount(null);
            setError(null);
          }}
        />
      </label>
      <button
        className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm disabled:opacity-60"
        type="button"
        disabled={busy || !email.trim()}
        onClick={() => void lookup()}
      >
        {busy ? "Đang xử lý…" : "Tìm tài khoản"}
      </button>
      {account ? (
        <div className="space-y-3 rounded-md border border-[var(--theme-border)] p-3">
          <p className="break-all text-sm font-semibold">{account.email}</p>
          <p className="break-all text-xs text-[var(--theme-muted)]">
            Mã tài khoản: {account.id}
          </p>
          <label className="block text-sm" htmlFor={`${id}-reason`}>
            Căn cứ liên kết
            <textarea
              id={`${id}-reason`}
              className={fieldClass}
              maxLength={2000}
              minLength={10}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--theme-muted)]">
            Xác nhận đây là tài khoản của người được đề cử hoặc đại diện. Người
            nhận sẽ thấy đề cử cũ và thông tin bằng trong “Hồ sơ của tôi”.
          </p>
          <button
            type="button"
            disabled={busy || reason.trim().length < 10}
            className="min-h-10 rounded-md bg-[var(--theme-accent)] px-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void confirm()}
          >
            Xác nhận liên kết tài khoản
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
