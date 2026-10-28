/**
 * ID acak yang aman dipakai di mana pun.
 *
 * `crypto.randomUUID()` HANYA tersedia pada secure context (HTTPS atau
 * localhost). Saat game dibuka dari perangkat lain lewat jaringan lokal
 * (mis. http://192.168.1.32:5173), fungsi itu tidak ada sama sekali sehingga
 * pembuatan/penyambungan room gagal total.
 */
export function makeId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID(); } catch { /* jatuh ke cara manual */ }
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  // format UUID v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
