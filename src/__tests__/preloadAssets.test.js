import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_GROUPS,
  STATIC_ASSET_PATHS,
  SUIT_SYMBOL_GLYPHS,
} from '../utils/preloadAssets.js';
import { TAUNTS, THROWABLES } from '../utils/tauntAssets.js';

const publicFile = path => join(process.cwd(), 'public', path.replace(/^\//, ''));

describe('PWA asset catalog', () => {
  it('mencakup seluruh avatar dan muka kartu tanpa duplikat', () => {
    expect(ASSET_GROUPS.avatars).toHaveLength(16);
    expect(ASSET_GROUPS.cards).toHaveLength(55);
    expect(new Set(STATIC_ASSET_PATHS).size).toBe(STATIC_ASSET_PATHS.length);
    expect(STATIC_ASSET_PATHS).toEqual(expect.arrayContaining([...ASSET_GROUPS.avatars, ...ASSET_GROUPS.cards]));
  });

  it('semua file avatar, kartu, dan simbol kembang tersedia di public', () => {
    for (const path of [...ASSET_GROUPS.avatars, ...ASSET_GROUPS.cards]) {
      expect(existsSync(publicFile(path)), `${path} tidak ada`).toBe(true);
    }
    expect(SUIT_SYMBOL_GLYPHS).toEqual(['♠', '♥', '♦', '♣']);
  });

  it('katalog ejekan bebas emoji: ikon barang digambar SVG di TauntGlyphs', () => {
    for (const item of [...TAUNTS, ...THROWABLES]) {
      expect(item.emoji).toBeUndefined();
    }
    expect(THROWABLES.map(item => item.id)).toEqual(['sendal', 'kopi', 'bom', 'tomat']);
  });

  it('manifest memakai identitas dan warna PWA yang disepakati', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public', 'manifest.webmanifest'), 'utf8'));
    expect(manifest.name).toBe('Remi Tongkrongan');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('any');
    expect(manifest.theme_color).toBe('#0f172a');
    expect(manifest.background_color).toBe('#0f172a');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of manifest.icons) {
      if (icon.type === 'image/png') expect(existsSync(publicFile(icon.src))).toBe(true);
    }
  });

  it('service worker membiarkan Firebase lewat tanpa cache', () => {
    const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    expect(sw).toContain('firebaseio.com');
    expect(sw).toContain('googleapis.com');
    expect(sw).toContain('staleWhileRevalidate');
    expect(sw).toContain('woff2?');
  });
});
