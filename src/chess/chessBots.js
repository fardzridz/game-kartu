/**
 * Bot AI & evaluator posisi Catur BAWASLU.
 *
 * Menggunakan `chess.js` dengan evaluasi material + Piece-Square Tables (PST)
 * serta pencarian Minimax dengan Alpha-Beta pruning (1–3 ply tergantung level).
 * Pemilihan langkah bersifat deterministik dari state meja (tanpa Math.random)
 * agar aman bila dieksekusi di dalam transaksi realtime.
 */
import { Chess } from 'chess.js';

const BASE_VALUE = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Tabel posisi dari sudut pandang Putih (baris 0 = rank 8, baris 7 = rank 1).
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [12, 12, 22, 32, 32, 22, 12, 12],
  [6, 6, 12, 26, 26, 12, 6, 6],
  [0, 0, 4, 22, 22, 4, 0, 0],
  [4, -4, -8, 0, 0, -8, -4, 4],
  [4, 10, 10, -20, -20, 10, 10, 4],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 12, 16, 16, 12, 0, -30],
  [-30, 6, 16, 22, 22, 16, 6, -30],
  [-30, 0, 16, 22, 22, 16, 0, -30],
  [-30, 6, 12, 16, 16, 12, 6, -30],
  [-40, -20, 0, 6, 6, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 8, 12, 12, 8, 0, -10],
  [-10, 6, 6, 12, 12, 6, 6, -10],
  [-10, 0, 12, 12, 12, 12, 0, -10],
  [-10, 12, 12, 12, 12, 12, 12, -10],
  [-10, 6, 0, 0, 0, 0, 6, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [8, 14, 14, 14, 14, 14, 14, 8],
  [-4, 0, 0, 0, 0, 0, 0, -4],
  [-4, 0, 0, 0, 0, 0, 0, -4],
  [-4, 0, 0, 0, 0, 0, 0, -4],
  [-4, 0, 0, 0, 0, 0, 0, -4],
  [-4, 0, 0, 0, 0, 0, 0, -4],
  [0, 0, 0, 8, 8, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 6, 6, 6, 6, 0, -10],
  [-5, 0, 6, 6, 6, 6, 0, -5],
  [0, 0, 6, 6, 6, 6, 0, -5],
  [-10, 6, 6, 6, 6, 6, 0, -10],
  [-10, 0, 6, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [18, 20, 0, 0, 0, 0, 20, 18],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

const PST_BY_TYPE = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_PST,
};

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hitung selisih poin material dari FEN (positif = Putih unggul, negatif = Hitam unggul).
 * @param {string} fen
 * @returns {{ whitePoints: number, blackPoints: number, diff: number }}
 */
export function evaluateMaterial(fen) {
  const weights = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let whitePoints = 0;
  let blackPoints = 0;
  const placement = String(fen || '').split(' ')[0] || '';
  for (let i = 0; i < placement.length; i += 1) {
    const ch = placement[i];
    const lower = ch.toLowerCase();
    if (weights[lower] !== undefined) {
      if (ch === lower) blackPoints += weights[lower];
      else whitePoints += weights[lower];
    }
  }
  return {
    whitePoints,
    blackPoints,
    diff: whitePoints - blackPoints,
  };
}

/**
 * Evaluasi statis papan dari sudut pandang `perspectiveColor` ('w' | 'b').
 */
export function evaluateBoard(chess, perspectiveColor = 'w') {
  if (chess.isCheckmate()) {
    return chess.turn() === perspectiveColor ? -99999 : 99999;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return 0;
  }

  const board = chess.board();
  let whiteScore = 0;
  let blackScore = 0;

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const cell = board[row][col];
      if (!cell) continue;
      const base = BASE_VALUE[cell.type] || 0;
      const table = PST_BY_TYPE[cell.type];
      const pstRow = cell.color === 'w' ? row : 7 - row;
      const bonus = table ? table[pstRow][col] : 0;
      if (cell.color === 'w') whiteScore += base + bonus;
      else blackScore += base + bonus;
    }
  }

  const raw = whiteScore - blackScore;
  return perspectiveColor === 'w' ? raw : -raw;
}

function scoreMoveOrder(move) {
  let score = 0;
  if (move.captured) {
    score += 10 * (BASE_VALUE[move.captured] || 100) - ((BASE_VALUE[move.piece] || 100) / 10);
  }
  if (move.promotion) {
    score += BASE_VALUE[move.promotion] || 900;
  }
  if (move.san && move.san.includes('+')) {
    score += 65;
  }
  return score;
}

function minimax(chess, depth, alpha, beta, maximizing, perspectiveColor) {
  if (depth <= 0 || chess.isGameOver()) {
    return evaluateBoard(chess, perspectiveColor);
  }
  const moves = chess.moves({ verbose: true }).sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));
  if (!moves.length) return evaluateBoard(chess, perspectiveColor);

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const val = minimax(chess, depth - 1, alpha, beta, false, perspectiveColor);
      chess.undo();
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    chess.move(move);
    const val = minimax(chess, depth - 1, alpha, beta, true, perspectiveColor);
    chess.undo();
    if (val < best) best = val;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * Pilih langkah bot terbaik untuk state meja saat ini.
 * @param {object} room
 * @param {string} [overrideLevel] - 'mudah' | 'sedang' | 'sulit'
 * @returns {{ type: 'move', from: string, to: string, promotion?: string } | null}
 */
export function chooseChessBotMove(room, overrideLevel) {
  const match = room?.match;
  if (!match || match.phase !== 'play' || !match.fen) return null;

  let chess;
  try {
    chess = new Chess(match.fen);
  } catch {
    return null;
  }

  const legal = chess.moves({ verbose: true });
  if (!legal.length) return null;

  const level = overrideLevel || room?.settings?.botLevel || 'sedang';
  const myColor = chess.turn();
  const seed = hashSeed(`${room.code || ''}:${room.matchNo || 0}:${room.rev || 0}:${match.moves?.length || 0}`);
  const rng = mulberry32(seed);

  // Urutkan langkah dengan tangkapan/promosi/skak lebih dulu
  const ordered = [...legal].sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));

  // Jika ada langkah skakmat langsung, ambil seketika di level mana pun
  for (const candidate of ordered) {
    chess.move(candidate);
    const isMate = chess.isCheckmate();
    chess.undo();
    if (isMate) {
      return {
        type: 'move',
        from: candidate.from,
        to: candidate.to,
        promotion: candidate.promotion || 'q',
      };
    }
  }

  const depth = level === 'sulit' ? 2 : 1;
  const jitterAmplitude = level === 'mudah' ? 95 : level === 'sedang' ? 22 : 4;

  let bestMove = ordered[0];
  let bestScore = -Infinity;

  for (const candidate of ordered) {
    chess.move(candidate);
    const evalScore = minimax(chess, depth - 1, -Infinity, Infinity, false, myColor);
    chess.undo();
    const jitter = (rng() - 0.5) * jitterAmplitude;
    const total = evalScore + jitter;
    if (total > bestScore) {
      bestScore = total;
      bestMove = candidate;
    }
  }

  return {
    type: 'move',
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion || 'q',
  };
}

/**
 * Putuskan apakah bot menerima tawaran remis dari lawan.
 * Bot menerima bila posisinya tertinggal atau seimbang setelah langkah ke-16.
 */
export function shouldBotAcceptDraw(room) {
  const match = room?.match;
  if (!match?.fen) return false;
  try {
    const chess = new Chess(match.fen);
    const botColor = match.drawOfferBy === match.whiteId ? 'b' : 'w';
    const score = evaluateBoard(chess, botColor);
    if (score <= -150) return true;
    if ((match.moves?.length || 0) >= 30 && score <= 40) return true;
    return false;
  } catch {
    return false;
  }
}
