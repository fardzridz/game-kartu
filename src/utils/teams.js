/**
 * Tim beregu Jengges (mode 2 lawan 2).
 *
 * Modul MURNI: tidak menyentuh React maupun state room. Dipakai dua sisi —
 * engine (membagi tim, menentukan juara) dan UI (badge, papan peringkat) —
 * supaya aturan main dan tampilan tidak pernah beda hitungan.
 *
 * Aturan yang disepakati:
 *   - dua tim tetap: Merah dan Biru;
 *   - pembagian otomatis & seimbang (selisih anggota maksimal 1);
 *   - skor tim = JUMLAH skor semua anggotanya;
 *   - turnamen tamat saat total tim menembus target DAN unggul (seri = lanjut);
 *   - rekan satu tim boleh saling melihat kartu (aturan UI, bukan di sini).
 */

export const TEAM_IDS = Object.freeze(['merah', 'biru']);

export const TEAMS = Object.freeze({
  merah: Object.freeze({
    id: 'merah',
    name: 'Tim Merah',
    short: 'Merah',
    emoji: '🔴',
    color: '#E0605C',
  }),
  biru: Object.freeze({
    id: 'biru',
    name: 'Tim Biru',
    short: 'Biru',
    emoji: '🔵',
    color: '#5B8CFF',
  }),
});

/**
 * Tim milik satu kursi, atau null bila belum dibagi / nilai rusak.
 * @param {{team?: string}|null|undefined} seat
 * @returns {'merah'|'biru'|null}
 */
export function teamOfSeat(seat) {
  const id = seat?.team;
  return TEAM_IDS.includes(id) ? id : null;
}

/** Metadata tim; null untuk id asing. */
export function teamMeta(teamId) {
  return TEAMS[teamId] || null;
}

/**
 * Lengkapi kursi yang BELUM punya tim ke tim yang lebih sedikit anggotanya.
 *
 * Kursi yang sudah punya tim dibiarkan apa adanya, jadi pembagian tidak
 * berubah dari ronde ke ronde, dan pemain yang bergabung di tengah turnamen
 * otomatis masuk tim yang sedang kekurangan.
 *
 * @param {Array<object>} seats
 * @returns {Array<object>} daftar baru bila ada yang berubah.
 */
export function assignTeams(seats = []) {
  const counts = { merah: 0, biru: 0 };
  for (const seat of seats) {
    const team = teamOfSeat(seat);
    if (team) counts[team] += 1;
  }
  return seats.map(seat => {
    if (teamOfSeat(seat)) return seat;
    const team = counts.merah <= counts.biru ? 'merah' : 'biru';
    counts[team] += 1;
    return { ...seat, team };
  });
}

/** Buang penanda tim dari semua kursi (mode beregu dimatikan). */
export function clearTeams(seats = []) {
  return seats.map(seat => {
    if (!('team' in seat)) return seat;
    const { team: _team, ...rest } = seat;
    return rest;
  });
}

/**
 * Total skor tiap tim = jumlah skor kursi anggotanya.
 * @returns {{merah: number, biru: number}}
 */
export function teamTotals(seats = []) {
  const totals = { merah: 0, biru: 0 };
  for (const seat of seats) {
    const team = teamOfSeat(seat);
    if (!team) continue;
    totals[team] += Number(seat.score) || 0;
  }
  return totals;
}

/**
 * Total poin RONDE TERAKHIR per tim (dari `lastScores`).
 * @param {Array<{playerId: string, total: number}>} roundRows
 * @param {Array<object>} seats
 */
export function teamRoundTotals(roundRows = [], seats = []) {
  const teamByPlayerId = Object.fromEntries(seats.map(seat => [seat.id, teamOfSeat(seat)]));
  const totals = { merah: 0, biru: 0 };
  for (const row of roundRows || []) {
    const team = teamByPlayerId[row?.playerId];
    if (!team) continue;
    totals[team] += Number(row.total) || 0;
  }
  return totals;
}

/** Anggota satu tim, urut kursi. */
export function teamMembers(seats = [], teamId) {
  return seats.filter(seat => teamOfSeat(seat) === teamId);
}

/**
 * Turnamen tamat?
 *
 * Mode solo tetap seperti sebelumnya: ada kursi yang menembus target.
 * Mode beregu memakai TOTAL tim; kalau kedua tim sama-sama menembus target
 * dengan angka sama, turnamen dilanjutkan sampai ada yang unggul — lebih adil
 * daripada memilih pemenang berdasarkan urutan kursi.
 */
export function tournamentOver({ seats = [], teamMode = false, targetScore = 0 } = {}) {
  const target = Number(targetScore) || 0;
  if (target <= 0) return false;
  if (teamMode) {
    const totals = teamTotals(seats);
    const [first, second] = [...TEAM_IDS].sort((a, b) => totals[b] - totals[a]);
    return totals[first] >= target && totals[first] > totals[second];
  }
  return seats.some(seat => (Number(seat.score) || 0) >= target);
}

/**
 * Juara turnamen: tim (mode beregu) atau kursi (mode solo).
 * @returns {{type: 'team'|'player', id: string, name: string, score: number, members?: Array<object>, seat?: object}|null}
 */
export function tournamentChampion({ seats = [], teamMode = false, targetScore = 0 } = {}) {
  if (!tournamentOver({ seats, teamMode, targetScore })) return null;
  if (teamMode) {
    const totals = teamTotals(seats);
    const team = [...TEAM_IDS].sort((a, b) => totals[b] - totals[a])[0];
    return {
      type: 'team',
      id: team,
      name: TEAMS[team].name,
      score: totals[team],
      members: teamMembers(seats, team),
    };
  }
  const champion = [...seats].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))[0];
  if (!champion) return null;
  return {
    type: 'player',
    id: champion.id,
    name: champion.name,
    score: Number(champion.score) || 0,
    seat: champion,
  };
}
