"use client";

import { Modal } from "./modal";
import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The destructive/confirmable message shown to the user. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tone of the confirm button. Use "destructive" for deletes. */
  tone?: "default" | "destructive";
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Styled confirmation dialog built on the accessible <Modal>. Replaces native
 * confirm()/alert() — consistent with the app's UI, doesn't block the main
 * thread, and works the same on mobile.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "destructive" ? "destructive" : "default"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
