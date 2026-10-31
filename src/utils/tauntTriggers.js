/**
 * Mesin saran ejekan kontekstual (gelombang 1 & 2):
 * - Gelombang 1: lawan makan Joker, lawan makan buangan kita, lawan sisa 1-2 kartu.
 * - Gelombang 2: kartu kita tinggal 1-2 (sombong), lawan AFK, lawan gali
 *   3 giliran berturut tanpa pernah turun.
 * Murni pembanding snapshot game (tanpa React/Firebase) supaya murah
 * dipanggil tiap rev dan mudah dites.
 *
 * Kartu yang diambil dari deck tidak terlihat klien, jadi deteksi Joker
 * hanya lewat tumpukan buangan (informasi publik). Saran hanya MENAWARKAN
 * line lewat banner; pengiriman tetap manual dan tetap kena cooldown.
 */

const isJokerCard = card => card?.kind === 'joker' || card?.value === 'JOKER';

// Berapa giliran penuh tanpa turun sebelum saran "gudang kartu" terbit.
const GUDANG_STREAK = 3;

export function createTauntTriggerEngine() {
  let active = false;
  let roundId = null;
  let pile = [];           // snapshot buangan: [{ uid, joker }]
  let hands = [];          // panjang tangan per indeks pemain
  let melds = [];          // jumlah kartu yang sudah diturunkan per pemain
  let turn = null;         // indeks pemain yang sedang jalan
  let ledger = new Map();  // uid buangan -> indeks pemain pembuangnya
  let fired = new Set();   // kunci dedup per ronde: ronde:jenis:target
  let meldBase = new Map();// indeks -> jumlah meld saat giliran pemain mulai
  let streaks = new Map(); // indeks -> rentetan giliran tanpa turun

  const activate = (nextRoundId, nextPile, nextHands, nextMelds, nextTurn) => {
    active = true;
    roundId = nextRoundId;
    pile = nextPile;
    hands = nextHands;
    melds = nextMelds;
    turn = nextTurn;
    ledger = new Map();
    fired = new Set();
    meldBase = new Map();
    streaks = new Map();
  };

  const offer = (out, kind, tauntId, players, index, viewerId) => {
    const target = players[index];
    // Saran selalu tentang lawan; aksi sendiri tidak pernah menawarkan ejekan.
    if (!target || target.id === viewerId) return;
    const key = `${roundId}:${kind}:${target.id}`;
    if (fired.has(key)) return;
    fired.add(key);
    out.push({ id: key, kind, tauntId, targetId: target.id, targetName: target.name });
  };

  // Pengecualian gelombang 2: sombong "tangan tipis" justru tentang diri sendiri.
  const offerSelf = (out, kind, tauntId, players, viewerIndex) => {
    const target = players[viewerIndex];
    if (!target) return;
    const key = `${roundId}:${kind}:${target.id}`;
    if (fired.has(key)) return;
    fired.add(key);
    out.push({ id: key, kind, tauntId, targetId: target.id, targetName: target.name });
  };

  return {
    ingest(game, status, viewerId, presence = {}) {
      if (status !== 'playing' || !game?.players?.length) {
        active = false;
        return [];
      }
      const players = game.players;
      const nextRoundId = game.dealStartedAt ?? 0;
      const nextPile = (game.discardPile || []).map(c => ({ uid: c?.uid, joker: isJokerCard(c) }));
      const nextHands = players.map(p => (p.hand || []).length);
      const nextMelds = players.map(p => (p.melds || []).reduce((sum, group) => sum + group.length, 0));
      const nextTurn = typeof game.turn === 'number' ? game.turn : null;

      // Ronde baru atau bangun dari round-end: simpan snapshot tanpa saran,
      // supaya aksi yang sudah lewat tidak dibahas ulang.
      if (!active || nextRoundId !== roundId) {
        activate(nextRoundId, nextPile, nextHands, nextMelds, nextTurn);
        return [];
      }

      const viewerIndex = players.findIndex(p => p.id === viewerId);
      const out = [];
      const pileDelta = nextPile.length - pile.length;

      if (pileDelta > 0) {
        // Buangan baru: pembuang = satu-satunya pemain yang tangannya menyusut.
        const discarder = nextHands.findIndex((n, i) => n - hands[i] < 0);
        if (discarder >= 0) {
          for (let i = pile.length; i < nextPile.length; i++) ledger.set(nextPile[i].uid, discarder);
        }
      } else if (pileDelta < 0) {
        // Gali buangan: pengambil = satu-satunya pemain yang tangannya bertambah.
        // Kartu teratas selalu ikut terangkut, sebagaimana gali borongan.
        const taken = pile.slice(nextPile.length);
        const taker = nextHands.findIndex((n, i) => n - hands[i] > 0);
        if (taker >= 0 && taken.length) {
          const tookJoker = taken.some(c => c.joker);
          const tookMine = viewerIndex >= 0 && taken.some(c => ledger.get(c.uid) === viewerIndex);
          // Satu momen satu saran: Joker menang atas umpan.
          if (tookJoker) offer(out, 'joker', 'joker', players, taker, viewerId);
          else if (tookMine) offer(out, 'bait', 'umpan', players, taker, viewerId);
        }
      }

      if (viewerIndex >= 0 && nextHands[viewerIndex] > 0 && nextHands[viewerIndex] <= 2) {
        offerSelf(out, 'tipis', 'tipis', players, viewerIndex);
      }

      players.forEach((player, i) => {
        const count = nextHands[i];
        if (player.id !== viewerId && count > 0 && count <= 2) {
          offer(out, 'low', 'jangan-tutup', players, i, viewerId);
        }
        // AFK/offline: sumber data yang sama dengan badge tidur di kursi.
        if (player.id !== viewerId && presence?.[player.id]?.online === false) {
          offer(out, 'lamun', 'lamun', players, i, viewerId);
        }
      });

      // Rentetan giliran tanpa turun: saat giliran pindah, bandingkan meld
      // pemain yang selesai dengan baseline saat gilirannya dimulai.
      // Delta apa pun selain nol (meld masuk atau anomali) mereset rentetan.
      if (nextTurn !== null && turn !== null && nextTurn !== turn) {
        const delta = nextMelds[turn] - (meldBase.get(turn) ?? melds[turn]);
        const streak = delta === 0 ? (streaks.get(turn) || 0) + 1 : 0;
        streaks.set(turn, streak);
        if (streak >= GUDANG_STREAK) offer(out, 'gudang', 'gudang', players, turn, viewerId);
      }
      if (nextTurn !== null) meldBase.set(nextTurn, nextMelds[nextTurn]);

      pile = nextPile;
      hands = nextHands;
      melds = nextMelds;
      turn = nextTurn;
      return out;
    },
  };
}
