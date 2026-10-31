import { describe, expect, it } from 'vitest';
import { createTauntTriggerEngine } from '../utils/tauntTriggers.js';

// Mesin saran kontekstual gelombang 1 & 2: murni pembanding snapshot.
// Snapshot game dibuat manual; yang dibaca hanya players/hand/melds,
// discardPile, turn, status, dan dealStartedAt sebagai penanda ronde.

const card = (uid, kind = 'standard') => ({ uid, value: kind === 'joker' ? 'JOKER' : '3', suit: '♥', kind });

const seat = (id, name, n) => ({ id, name, hand: Array.from({ length: n }, (_, i) => card(`${id}${i}`)), melds: [] });

const build = ({ hands = [5, 5, 5], pile = [], round = 1, turn = 0 } = {}) => ({
  dealStartedAt: round,
  turn,
  players: [seat('lo', 'Andi', hands[0]), seat('raka', 'Raka', hands[1]), seat('sari', 'Sari', hands[2])],
  discardPile: pile,
  drawPile: [],
});

const run = (engine, game, presence) => engine.ingest(game, 'playing', 'lo', presence);

describe('tauntTriggers gelombang 1', () => {
  it('baseline ronde baru tidak menghasilkan saran', () => {
    const engine = createTauntTriggerEngine();
    expect(run(engine, build({ pile: [card('a')] }))).toEqual([]);
  });

  it('lawan makan Joker dari buangan menawarkan ejekan joker, sekali per ronde', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build({ pile: [card('a')] }));
    // Sari membuang Joker (tangan Sari menyusut): belum ada saran.
    const afterDiscard = run(engine, build({ hands: [5, 5, 4], pile: [card('a'), card('j1', 'joker')] }));
    expect(afterDiscard).toEqual([]);
    // Raka makan buangan berisi Joker (tangan Raka bertambah).
    const taken = run(engine, build({ hands: [5, 6, 4], pile: [card('a')] }));
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ kind: 'joker', tauntId: 'joker', targetId: 'raka' });
    // Snapshot tanpa perubahan tidak mengulang saran.
    expect(run(engine, build({ hands: [5, 6, 4], pile: [card('a')] }))).toEqual([]);
  });

  it('lawan makan buangan kita menawarkan ejekan umpan', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build({ pile: [card('a')] }));
    // Lo membuang m1 lalu Sari mengambilnya dari buangan.
    run(engine, build({ hands: [4, 5, 5], pile: [card('a'), card('m1')] }));
    const taken = run(engine, build({ hands: [4, 5, 6], pile: [card('a')] }));
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ kind: 'bait', tauntId: 'umpan', targetId: 'sari' });
  });

  it('Joker menang atas umpan saat sekali gali borongan', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build({ pile: [card('a')] }));
    run(engine, build({ hands: [4, 5, 5], pile: [card('a'), card('m1')] }));
    run(engine, build({ hands: [4, 5, 4], pile: [card('a'), card('m1'), card('j2', 'joker')] }));
    // Raka mengangkut m1 + Joker sekaligus (tangan +2).
    const taken = run(engine, build({ hands: [4, 7, 4], pile: [card('a')] }));
    expect(taken).toHaveLength(1);
    expect(taken[0].kind).toBe('joker');
  });

  it('lawan sisa 1-2 kartu menawarkan jangan-tutup; diri sendiri masuk gelombang 2', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build());
    // Lo sendiri tinggal 2 kartu: saran sombong tipis, bukan jangan-tutup.
    const self = run(engine, build({ hands: [2, 5, 5] }));
    expect(self).toHaveLength(1);
    expect(self[0]).toMatchObject({ kind: 'tipis', tauntId: 'tipis', targetId: 'lo' });
    // Sari tinggal 2 kartu: saran muncul sekali.
    const low = run(engine, build({ hands: [2, 5, 2] }));
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ kind: 'low', tauntId: 'jangan-tutup', targetId: 'sari' });
    expect(run(engine, build({ hands: [2, 5, 2] }))).toEqual([]);
  });

  it('ronde baru menghapus dedup dan status non-playing mereset snapshot', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build());
    run(engine, build({ hands: [2, 5, 2] }));
    expect(engine.ingest(build({ round: 2 }), 'round-end', 'lo')).toEqual([]);
    run(engine, build({ round: 2 }));
    const again = run(engine, build({ round: 2, hands: [5, 5, 2] }));
    expect(again).toHaveLength(1);
    expect(again[0].targetId).toBe('sari');
  });

  it('aksi sendiri mengambil buangan tidak memicu saran', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build({ pile: [card('a'), card('j1', 'joker')] }));
    // Lo sendiri makan buangan berisi Joker.
    const self = run(engine, build({ hands: [7, 5, 5], pile: [] }));
    expect(self).toEqual([]);
  });
});

describe('tauntTriggers gelombang 2', () => {
  it('tangan lo tinggal 1-2 kartu menawarkan sombong tipis, sekali per ronde', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build());
    const tipis = run(engine, build({ hands: [2, 5, 5] }));
    expect(tipis).toHaveLength(1);
    expect(tipis[0]).toMatchObject({ kind: 'tipis', tauntId: 'tipis', targetId: 'lo' });
    expect(run(engine, build({ hands: [2, 5, 5] }))).toEqual([]);
  });

  it('lawan offline menawarkan ejekan lamun, berhenti saat online lagi', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build());
    const offline = run(engine, build(), { raka: { online: false } });
    expect(offline).toHaveLength(1);
    expect(offline[0]).toMatchObject({ kind: 'lamun', tauntId: 'lamun', targetId: 'raka' });
    // Status balik online: dedup tetap menahan di ronde yang sama.
    expect(run(engine, build(), { raka: { online: true } })).toEqual([]);
    // Ronde baru: boleh dipicu lagi.
    engine.ingest(build({ round: 2 }), 'round-end', 'lo');
    run(engine, build({ round: 2 }));
    const again = run(engine, build({ round: 2 }), { raka: { online: false } });
    expect(again).toHaveLength(1);
    expect(again[0].targetId).toBe('raka');
  });

  it('lawan gali 3 giliran tanpa turun menawarkan gudang; meld mereset rentetan', () => {
    const engine = createTauntTriggerEngine();
    run(engine, build({ pile: [card('a')] }));
    // Giliran berputar tanpa ada yang turun: lo (viewer) dilewati saran.
    const fired = [];
    for (let k = 1; k <= 8; k++) {
      const game = build({ pile: [card('a')], turn: k % 3 });
      fired.push(...run(engine, game));
    }
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ kind: 'gudang', tauntId: 'gudang', targetId: 'raka' });

    // Mesin baru: Raka turun kombinasi DI TENGAH gilirannya (k=4), rentetan
    // ter-reset sehingga gudang tidak pernah terbit.
    const engine2 = createTauntTriggerEngine();
    run(engine2, build({ pile: [card('a')] }));
    const fired2 = [];
    for (let k = 1; k <= 8; k++) {
      const raka = seat('raka', 'Raka', 5);
      if (k === 4) raka.melds = [card('x'), card('y'), card('z')];
      const game = {
        ...build({ pile: [card('a')], turn: k % 3 }),
        players: [seat('lo', 'Andi', 5), raka, seat('sari', 'Sari', 5)],
      };
      fired2.push(...run(engine2, game));
    }
    expect(fired2).toEqual([]);
  });
});
