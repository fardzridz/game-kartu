import React from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';

export default function ChessBracketView({ cup, viewerId, activeMatchId, onSelectMatch }) {
  if (!cup || !cup.rounds) return null;

  return (
    <div className="chess-bracket-shell">
      <div className="chess-bracket-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 900, color: '#f5a623', fontSize: 13 }}>
          <Icon.Trophy size={16} /> Bagan Turnamen Cup #{cup.no} ({cup.bracketSize} Besar)
        </div>
        <div style={{ fontSize: 11, color: '#9a9284' }}>
          Babak {cup.currentRound} dari {cup.totalRounds} · Ketuk partai untuk menonton atau bermain
        </div>
      </div>

      <div className="chess-bracket-grid">
        {cup.rounds.map(round => (
          <div key={round.roundNo} className={`chess-bracket-col ${cup.currentRound === round.roundNo ? 'is-active-round' : ''}`}>
            <div className="chess-bracket-col__head">
              <span>{round.title}</span>
              {cup.currentRound === round.roundNo && <span className="chess-live-dot" title="Babak sedang bertanding" />}
            </div>

            <div className="chess-bracket-col__matches">
              {round.matches.map(m => {
                const isSelected = activeMatchId === m.id;
                const isMyMatch = m.whiteId === viewerId || m.blackId === viewerId;
                const isPlaying = m.status === 'playing';
                const isBye = m.status === 'bye';
                const isDone = m.status === 'done';

                return (
                  <button
                    key={m.id}
                    type="button"
                    className={[
                      'chess-bracket-card',
                      isSelected ? 'is-selected' : '',
                      isMyMatch ? 'is-my-match' : '',
                      isPlaying ? 'is-playing' : '',
                      isBye ? 'is-bye' : '',
                      isDone ? 'is-done' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onSelectMatch(m.id)}
                  >
                    <div className="chess-bracket-card__header">
                      <span className="chess-bracket-card__table">Meja #{m.tableNo}</span>
                      {isPlaying && <span className="chess-status-chip is-live">LIVE</span>}
                      {isDone && <span className="chess-status-chip">SELESAI</span>}
                      {isBye && <span className="chess-status-chip is-bye">BYE</span>}
                    </div>

                    <div className="chess-bracket-team">
                      <span className={`chess-bracket-team__dot ${m.winnerId && m.winnerId === m.whiteId ? 'is-win' : ''}`} />
                      <span className="chess-bracket-team__name">
                        {m.whiteName || 'Menunggu…'}
                        {m.whiteId === viewerId ? ' (Kamu)' : ''}
                      </span>
                      {m.winnerId && m.winnerId === m.whiteId && <span className="chess-win-check">✓</span>}
                    </div>

                    <div className="chess-bracket-team">
                      <span className={`chess-bracket-team__dot ${m.winnerId && m.winnerId === m.blackId ? 'is-win' : ''}`} />
                      <span className="chess-bracket-team__name">
                        {m.blackName || (isBye ? 'BYE' : 'Menunggu…')}
                        {m.blackId === viewerId ? ' (Kamu)' : ''}
                      </span>
                      {m.winnerId && m.winnerId === m.blackId && <span className="chess-win-check">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {cup.champion && (
        <div className="chess-podium-card">
          <div className="chess-podium-card__trophy">🏆</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#fde68a' }}>
              JUARA TURNAMEN CUP #{cup.no}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AvatarArt avatar={cup.champion.avatar || 'finn'} size={24} />
              <span>{cup.champion.name}</span>
            </div>
            {cup.runnerUp && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>
                Runner-Up: {cup.runnerUp.name}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
