import { useEffect, useRef } from 'react';

/**
 * useDialogA11y — Escape + fokus untuk modal ringan (Riwayat, Intip, dll).
 * ConfirmDialog punya focus trap lengkap; modal ad-hoc minimal harus bisa
 * ditutup dengan Escape, menerima fokus saat terbuka, dan mengembalikan
 * fokus ke pemicunya saat tertutup.
 */
export default function useDialogA11y(open, onClose) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = panelRef.current?.querySelector('button');
    target?.focus();
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const previous = restoreRef.current;
      if (previous && document.contains(previous) && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);

  return panelRef;
}
