"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function WorkspaceDialog({
  title, description, trigger, children, triggerClassName = "platform-button", drawer = true, open, onClose,
}: {
  title: string;
  description?: string;
  trigger?: ReactNode;
  children: ReactNode;
  triggerClassName?: string;
  drawer?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (open === true && !dialog.current?.open) dialog.current?.showModal();
    if (open === false && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <>
    {trigger ? <button type="button" className={triggerClassName} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">{trigger}</button> : null}
    <dialog ref={dialog} onClose={onClose} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      className={`platform-detail-dialog ${drawer ? "platform-detail-drawer" : ""}`}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--platform-line)] bg-[var(--platform-surface)] px-6 py-5">
        <div className="min-w-0"><h2 id={titleId} className="break-words text-lg font-semibold tracking-tight">{title}</h2>
          {description ? <p id={descriptionId} className="mt-1 text-sm text-[var(--platform-muted)]">{description}</p> : null}
        </div>
        <button type="button" autoFocus aria-label="Close details" className="platform-icon-button shrink-0" onClick={() => dialog.current?.close()}><X size={18} /></button>
      </header>
      <div className="space-y-6 p-6">{children}</div>
    </dialog>
  </>;
}
