import { useEffect, useState } from 'react';
import { isDataSaverActive, subscribeConnectionChange } from '../utils/dataSaver.js';

/**
 * State mode hemat data untuk komponen React.
 *
 * Selain mengembalikan status, hook ini memasang kelas `is-data-saver` pada
 * `<body>` supaya CSS bisa mematikan animasi berat tanpa perlu meneruskan prop
 * ke puluhan komponen. Dipanggil di App (satu tempat) sehingga kedua halaman
 * — ruang tunggu dan meja main — ikut terpengaruh.
 *
 * @returns {boolean} true bila mode hemat data aktif.
 */
export function useDataSaver() {
  const [active, setActive] = useState(() => isDataSaverActive());

  useEffect(() => {
    const sync = () => setActive(isDataSaverActive());
    sync();
    const unsubscribe = subscribeConnectionChange(state => setActive(state.dataSaver));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('is-data-saver', active);
  }, [active]);

  return active;
}

export default useDataSaver;
