// Papan kecil untuk status koneksi global. Dipisah dari App.jsx supaya badge
// bisa dipakai di semua halaman tanpa prop-drilling.
export const connSnapshot = { state: 'connecting', mode: '', retry: null };

export function setConnectionSnapshot(next) {
  Object.assign(connSnapshot, next);
}

export function getConnectionSnapshot() {
  return connSnapshot;
}
