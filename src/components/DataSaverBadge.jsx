import React, { useEffect, useState } from 'react';
import { isDataSaverActive, subscribeConnectionChange } from '../utils/dataSaver.js';

/**
 * Indikator kecil "Mode hemat data".
 *
 * Tanpa ini pemain bingung kenapa musiknya tidak berbunyi. Indikator sengaja
 * sangat kecil (satu baris teks + ikon) dan bisa diketuk untuk melihat alasan
 * lengkapnya — tidak mengambil ruang meja.
 *
 * Tidak dirender sama sekali kalau mode hemat data tidak aktif, dan tidak
 * menampilkan apa pun di browser tanpa Network Information API.
 *
 * @param {{ className?: string }} props
 */
export default function DataSaverBadge({ className = '' }) {
  const [active, setActive] = useState(() => isDataSaverActive());

  useEffect(() => {
    setActive(isDataSaverActive());
    return subscribeConnectionChange(state => setActive(state.dataSaver));
  }, []);

  if (!active) return null;

  return (
    <span
      className={`data-saver-badge ${className}`}
      title="Mode hemat data aktif: musik latar dan preload aset dimatikan. Efek suara tetap berbunyi."
      role="status"
    >
      <span className="data-saver-dot" aria-hidden="true" />
      <span className="data-saver-text">Hemat data</span>
    </span>
  );
}
