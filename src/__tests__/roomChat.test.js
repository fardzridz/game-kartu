import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import RoomChat from '../components/RoomChat.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const room = { code: 'ABC123', seats: [], hostId: 'host-1' };

// RoomChat memakai openEphemeralChannel, yang di mode test jatuh ke
// BroadcastChannel. Kita tiru supaya bisa menyuntikkan pesan.
let instances = [];
class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.posted = []; this.closed = false; this.onmessage = null; instances.push(this); }
  postMessage(data) { this.posted.push(data); }
  close() { this.closed = true; }
  deliver(data) { if (this.onmessage) this.onmessage({ data }); }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

async function mountChat(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(RoomChat, {
      room, viewerId: 'me', myName: 'Saya', myAvatar: 'jake', isHost: false, ...props,
    }));
  });
  await act(async () => { await flush(); });
  return {
    host,
    open: async () => {
      const toggle = host.querySelector('.room-chat__toggle');
      await act(async () => { toggle.click(); });
      await act(async () => { await flush(); });
    },
    unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

describe('RoomChat', () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tertutup secara default dan menampilkan tombol Obrolan', () => {
    const html = renderToString(React.createElement(RoomChat, { room, viewerId: 'me', myName: 'Saya' }));
    expect(html).toContain('Obrolan');
    expect(html).not.toContain('Belum ada obrolan');
    expect(html).toContain('aria-expanded="false"');
  });

  it('tidak merender apa pun tanpa kode meja', () => {
    const html = renderToString(React.createElement(RoomChat, { room: null, viewerId: 'me', myName: 'Saya' }));
    expect(html).toBe('');
  });

  it('menampilkan empty state saat panel dibuka', async () => {
    const view = await mountChat();
    await view.open();
    expect(view.host.textContent).toContain('Belum ada obrolan. Sapa temanmu!');
    await view.unmount();
  });

  it('menampilkan pesan dari pemain lain apa adanya', async () => {
    const view = await mountChat();
    await view.open();
    await act(async () => {
      instances[0].deliver({
        clientId: 'other', roomCode: 'ABC123', id: 'm1',
        from: 'guest-2', name: 'Budi', text: 'halo semua', ts: Date.now(),
      });
    });
    await act(async () => { await flush(); });
    expect(view.host.textContent).toContain('halo semua');
    expect(view.host.textContent).toContain('Budi');
    await view.unmount();
  });

  it('menampilkan <script> sebagai TEKS, bukan HTML', async () => {
    const view = await mountChat();
    await view.open();
    await act(async () => {
      instances[0].deliver({
        clientId: 'other', roomCode: 'ABC123', id: 'xss',
        from: 'guest-2', name: 'Jahil', text: '<script>alert(1)</script>', ts: Date.now(),
      });
    });
    await act(async () => { await flush(); });

    // Teks terlihat oleh pemain...
    expect(view.host.textContent).toContain('<script>alert(1)</script>');
    // ...tapi tidak ada elemen script yang benar-benar dibuat.
    expect(view.host.querySelector('script')).toBeNull();
    expect(view.host.innerHTML).toContain('&lt;script&gt;');
    await view.unmount();
  });

  it('kata kasar & bahasa daerah terkirim apa adanya (tanpa filter)', async () => {
    // Kebijakan pemilik project: obrolan tongkrongan dibiarkan bebas. Dulu
    // pesan seperti ini ditolak dengan alasan "kata kasar"; sekarang lolos.
    const view = await mountChat();
    await view.open();

    const input = view.host.querySelector('#room-chat-input');
    // React mengendalikan value; set lewat native setter agar onChange terpicu.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, 'dasar bangsat, mangga atuh lur');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await flush(); });

    const send = view.host.querySelector('.room-chat__send');
    await act(async () => { send.click(); });
    await act(async () => { await flush(); });

    expect(view.host.textContent).not.toContain('kata kasar');
    // Terkirim: input dikosongkan & pesan tampil di daftar.
    expect(view.host.querySelector('#room-chat-input').value).toBe('');
    expect(view.host.textContent).toContain('dasar bangsat, mangga atuh lur');
    await view.unmount();
  });

  it('mengirim pesan bersih lalu masuk cooldown 2 detik', async () => {
    const view = await mountChat();
    await view.open();

    const input = view.host.querySelector('#room-chat-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, 'halo teman');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await flush(); });

    await act(async () => { view.host.querySelector('.room-chat__send').click(); });
    await act(async () => { await flush(); });

    // Terkirim lewat channel, dan pesan langsung tampil sebagai milik sendiri.
    expect(instances[0].posted.some(msg => msg.text === 'halo teman')).toBe(true);
    expect(view.host.textContent).toContain('halo teman');
    // Input dikosongkan setelah berhasil.
    expect(view.host.querySelector('#room-chat-input').value).toBe('');
    // Cooldown tampil sebagai hitungan detik di tombol kirim.
    expect(view.host.querySelector('.room-chat__send').textContent).toMatch(/\ds/);

    await view.unmount();
  });

  it('membatasi input maksimal 200 karakter dengan counter', async () => {
    const view = await mountChat();
    await view.open();
    const input = view.host.querySelector('#room-chat-input');
    expect(input.getAttribute('maxLength')).toBe('200');

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, 'a'.repeat(250));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await flush(); });
    expect(input.value.length).toBe(200);
    expect(view.host.textContent).toContain('200/200');
    await view.unmount();
  });

  it('menutup channel saat unmount (tidak ada listener bocor)', async () => {
    const view = await mountChat();
    await view.unmount();
    expect(instances[0].closed).toBe(true);
  });
});

describe('batasan produk: chat tidak boleh ada di meja main', () => {
  const read = file => readFileSync(join(process.cwd(), 'src', 'components', file), 'utf8');

  it('GameBoard tidak mengimpor atau merender RoomChat', () => {
    const source = read('GameBoard.jsx');
    expect(source).not.toContain('RoomChat');
    expect(source).not.toContain('room-chat');
  });

  it('RoomLobby merender RoomChat', () => {
    const source = read('RoomLobby.jsx');
    expect(source).toContain("from './RoomChat.jsx'");
    expect(source).toContain('<RoomChat');
  });

  it('tidak ada dangerouslySetInnerHTML di komponen chat', () => {
    expect(read('RoomChat.jsx')).not.toContain('dangerouslySetInnerHTML');
  });
});
