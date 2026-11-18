import { LoaderCircle, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FileUploaderActionsProps {
  canChoose: boolean;
  chooseButtonLabel: string;
  disabled: boolean;
  isBusy: boolean;
  onChoose: () => void;
  onUpload: () => void;
  pendingCount: number;
}

export function FileUploaderActions({
  canChoose,
  chooseButtonLabel,
  disabled,
  isBusy,
  onChoose,
  onUpload,
  pendingCount,
}: FileUploaderActionsProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      {canChoose ? (
        <Button
          className="min-h-12 w-full sm:w-auto"
          disabled={disabled || isBusy}
          onClick={onChoose}
          type="button"
          variant={pendingCount > 0 ? "ghost" : "default"}
        >
          <Plus aria-hidden="true" className="size-4" />
          {chooseButtonLabel}
        </Button>
      ) : null}
      {pendingCount > 0 || isBusy ? (
        <Button
          aria-busy={isBusy}
          className="min-h-12 w-full px-6 text-sm font-bold shadow-sm sm:w-auto"
          disabled={disabled || isBusy}
          onClick={onUpload}
          type="button"
        >
          {isBusy ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Upload aria-hidden="true" className="size-4" />
          )}
          {isBusy ? "Đang xử lý" : `Tải lên ${pendingCount} tệp`}
        </Button>
      ) : null}
    </div>
  );
}
