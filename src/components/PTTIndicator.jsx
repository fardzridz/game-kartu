import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './SvgPrimitives.jsx';

/**
 * Indikator "🔴 {nama} sedang bicara" + toast penolakan.
 *
 * Dirender ke `document.body` lewat portal supaya tidak terpotong oleh
 * `overflow: hidden` milik papan meja, dan tampil sama di kedua halaman
 * (ruang tunggu & meja main).
 *
 * @param {object} props
 * @param {{from: string, name: string}|null} props.speaking
 * @param {string} [props.notice]
 * @param {() => void} [props.onDismissNotice]
 */
export default function PTTIndicator({ speaking, notice = '', onDismissNotice }) {
  if (typeof document === 'undefined') return null;
  if (!speaking && !notice) return null;

  return createPortal(
    <div className="ptt-indicator-layer" aria-live="polite">
      {speaking && (
        <div className="ptt-speaking" role="status">
          <span className="ptt-speaking__dot" aria-hidden="true" />
          <Icon.Mic size={13} />
          <span className="ptt-speaking__name">{speaking.name || 'Pemain'}</span>
          <span className="ptt-speaking__label">sedang bicara</span>
        </div>
      )}

      {notice && (
        <div className="ptt-notice" role="alert">
          <span className="ptt-notice__text">{notice}</span>
          <button
            type="button"
            className="ptt-notice__close"
            onClick={onDismissNotice}
            aria-label="Tutup pemberitahuan"
          >
            <Icon.Close size={13} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
