/**
 * Perintah slash internal di kolom obrolan meja.
 *
 * SIFATNYA RAHASIA — jangan pernah ditampilkan di UI:
 *   - Tidak ada hint di placeholder/komposer, tidak ada daftar perintah,
 *     tidak ada tombol. Pemain hanya tahu kalau memang sudah diberi tahu.
 *   - Ketikan berawalan "/" TIDAK PERNAH dikirim sebagai pesan obrolan
 *     (tidak masuk RTDB/BroadcastChannel), jadi lawan tidak melihat apa pun.
 *   - Perintah tak dikenal ditelan diam-diam: tidak dikirim, tidak dibalas.
 *     Kalau UI menjawab "perintah tidak dikenal", orang jadi tahu bahwa
 *     sistem perintah itu ada — itu sudah membocorkan rahasianya.
 *
 * KENAPA DAFTARNYA DI UTILS: dipakai dua sisi — UI (mem-parse ketikan) dan
 * engine (memvalidasi kode & jatah). Digandakan = cepat atau lambat beda.
 * Semua fungsi di sini MURNI: engine memanggilnya di dalam transaksi.
 */

export const COMMAND_PREFIX = '/';

/**
 * Registry perintah.
 *
 * `usesPerRound` — jatah per pemain per ronde. Hitungannya hidup di
 *   `game.players[i].cmdUsed`, yang dibangun ulang setiap `startRound`,
 *   jadi otomatis penuh lagi di ronde baru.
 * `when: 'draw'` — hanya boleh di giliran sendiri, sebelum minum.
 * `when: 'anytime'` — boleh kapan saja selama ronde berjalan.
 * `label` sengaja pendek dan netral supaya balasan di layar pemakai tidak
 *   terbaca mencolok kalau ada yang mengintip.
 */
export const COMMANDS = {
  pleeer: {
    id: 'pleeer',
    command: '/pleeer',
    label: '🃏',
    desc: 'Minum berikutnya dijamin Joker.',
    usesPerRound: 1,
    when: 'draw',
  },
  nyocot: {
    id: 'nyocot',
    command: '/nyocot',
    label: '🃏',
    desc: 'Intip kartu tangan satu lawan. Tanpa nama = lawan dengan kartu paling sedikit.',
    usesPerRound: 3,
    when: 'anytime',
  },
};

const normalizeCode = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Baca satu ketikan obrolan: perintah atau pesan biasa.
 *
 * @param {string} raw
 * @returns {{isCommand: boolean, code: string, args: string[], unknown: boolean}}
 *   `isCommand` false = kirim sebagai obrolan seperti biasa.
 *   `unknown` true = telan diam-diam (jangan kirim, jangan balas).
 */
export function parseSlashCommand(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text.startsWith(COMMAND_PREFIX)) return { isCommand: false, code: '', args: [], unknown: false };
  const body = text.slice(COMMAND_PREFIX.length).trim();
  if (!body) return { isCommand: true, code: '', args: [], unknown: true };
  const [head, ...args] = body.split(/\s+/);
  const code = normalizeCode(head);
  return { isCommand: true, code, args, unknown: !COMMANDS[code] };
}
