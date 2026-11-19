import { describe, expect, it } from 'vitest';
import { isDealPending } from '../utils/dealPhase.js';

describe('isDealPending', () => {
  it('true saat Pengocok masih di fase kocok manual', () => {
    expect(isDealPending({ shuffleState: 'manual' })).toBe(true);
  });

  it('false setelah kartu mulai dibagikan', () => {
    expect(isDealPending({ shuffleState: 'dealing' })).toBe(false);
  });

  it('false saat permainan normal berjalan', () => {
    expect(isDealPending({ shuffleState: undefined, phase: 'draw' })).toBe(false);
  });

  it('aman untuk game kosong', () => {
    expect(isDealPending(null)).toBe(false);
    expect(isDealPending(undefined)).toBe(false);
    expect(isDealPending({})).toBe(false);
  });
});
