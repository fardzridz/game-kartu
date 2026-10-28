import React, { useEffect, useState } from 'react';
import { ConnectionBadge } from './SvgPrimitives.jsx';
import { getConnectionSnapshot } from '../utils/connectionStatus.js';

// Badge status server yang dipasang di header SETIAP halaman (lobby, ruang
// tunggu, meja main). Dibaca dari snapshot App agar tidak perlu prop-drilling.
export default function ConnectionBadgeGlobal() {
  const [snap, setSnap] = useState(() => ({ ...getConnectionSnapshot() }));
  useEffect(() => {
    const timer = setInterval(() => setSnap({ ...getConnectionSnapshot() }), 1000);
    return () => clearInterval(timer);
  }, []);
  // Mode lokal memang tidak tersambung ke server: tampilkan apa adanya.
  if (snap.mode === 'local') return <span className="lobby-pill lobby-pill--ghost">1 Perangkat</span>;
  return <ConnectionBadge connection={snap.state} onRetry={snap.retry} />;
}
