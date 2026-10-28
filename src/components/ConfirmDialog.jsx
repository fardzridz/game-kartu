import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'danger',
  onConfirm,
  onCancel,
  children,
}) {
  const confirmRef = useRef(null);
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Remember the opener so keyboard users get focus back on close.
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();

    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
        return;
      }
      // Enter is confirmed by the auto-focused button itself. If the user
      // moved focus to "Batal" (or a child field), let that control win —
      // otherwise Enter would fire onConfirm *and* onCancel together.
      if (event.key === 'Enter') {
        const target = event.target;
        if (target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.tagName === 'A')) return;
        event.preventDefault();
        onConfirm?.();
        return;
      }
      if (event.key !== 'Tab') return;
      // Focus trap inside the dialog.
      const nodes = panelRef.current ? Array.from(panelRef.current.querySelectorAll(FOCUSABLE)) : [];
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !panelRef.current.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !panelRef.current.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    const doc = document;
    doc.addEventListener('keydown', onKey, true);
    return () => {
      doc.removeEventListener('keydown', onKey, true);
      const previous = restoreRef.current;
      if (previous && doc.contains(previous) && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={message ? 'confirm-dialog-message' : undefined}
    >
      <section
        ref={panelRef}
        className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl flex flex-col gap-3 text-white text-center"
      >
        <h3 id="confirm-dialog-title" className="text-base font-bold text-white tracking-tight">
          {title}
        </h3>
        {message && (
          <p id="confirm-dialog-message" className="text-xs text-periwinkleMuted leading-relaxed">
            {message}
          </p>
        )}

        {children}

        <div className="flex items-center justify-center gap-2.5 mt-3 pt-3 border-t border-white/10">
          <button
            type="button"
            className="flex-1 min-h-11 py-2.5 rounded-xl bg-btnSurface hover:bg-[#5B649B] text-xs font-semibold text-white transition active:scale-95"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`flex-1 min-h-11 py-2.5 rounded-xl font-bold text-xs shadow-lg transition active:scale-95 ${
              tone === 'danger'
                ? 'bg-crimsonDanger hover:brightness-110 text-white'
                : 'bg-emeraldPrimary hover:brightness-110 text-canvasDeep'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
