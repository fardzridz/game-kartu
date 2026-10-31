/**
 * Ikon SVG barang lemparan untuk panel ejekan dan proyektil terbang.
 * Semua ikon warna penuh dan mengikuti desain frame 11 di
 * design/taunt-ux.figcraft yang sudah disetujui pemilik, sehingga tampilan
 * kode dan storyboard tidak bisa saling melenceng:
 * - Sendal: aset "Thong Sandal Flat" dari Streamline Fluent Emoji
 *   (viewBox 32; atribusi dipertahankan lewat elemen desc).
 * - Kopi: varian Google Noto dari berkas Emoji_u2615.svg (viewBox 128;
 *   permukaan kopi dua warna ditulis sebagai path lensa hasil irisan dua
 *   elips, tanpa clipPath yang rawan id ganda).
 * - Bom dan tomat: gambar sendiri (viewBox 32; gradien bola memakai useId
 *   supaya aman dari id ganda antar instance).
 * ViewBox berbeda-beda tidak masalah karena tiap komponen menerima prop
 * size sendiri.
 */
import { useId } from 'react';

export function SendalIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <desc>Thong Sandal Flat Streamline Emoji: https://streamlinehq.com</desc>
      <path d="M21.5725 7C20.5431 4.08687 17.7656 2 14.5 2 10.3581 2 7 5.35813 7 9.5c0 1.3637 0.36375 2.6419 1 3.7437 0.06188 0.1075 0.12688 0.2132 0.19375 0.3169C8.69563 14.4619 10 17.3469 10 23c0 3.8663 3.1337 7 7 7s7 -3.1337 7 -7c0 0 0.145 -9.57 -2.4275 -16Z" fill="#5092ff" />
      <path d="M11.4276 9.07694c-0.1754 -1.28882 0.3688 -2.49231 1.2918 -2.97809l1.2798 2.7417c1.7798 0.536 5.0556 2.14965 6.5017 5.19215 1.558 3.2782 0.8569 6.1856 0.3116 7.2295 -1.1997 -0.9504 -1.3867 -1.5737 -1.6048 -2.602 -0.0245 -0.1153 -0.0476 -0.2641 -0.0748 -0.4398 -0.216 -1.3918 -0.6944 -4.4751 -4.1944 -6.0106 -1.1715 -0.539 -1.9761 -0.8907 -2.2841 -1.0216 -0.7525 1.1418 -1.5604 2.447 -1.689 2.9692 -0.2493 1.0127 -0.2493 1.2309 0 2.6175 0.1734 0.9643 0.5938 2.5207 0.9764 3.9369 0.1676 0.6205 0.328 1.214 0.4571 1.719 -1.9009 0.4986 -2.3714 -1.6657 -2.65659 -3.5753 -0.27206 -1.8218 -0.52697 -2.6442 -0.77985 -3.4601 -0.01219 -0.0393 -0.02438 -0.0786 -0.03657 -0.1181 -0.21796 -2.3407 1.21851 -4.6995 2.50171 -6.20036Z" fill="#3f5fff" />
      <path d="M20.4262 12.085c-1.2469 -1.7125 -2.9713 -2.96125 -4.9869 -3.61125l-0.3837 -0.11875c-0.2419 -0.075 -0.4382 -0.25437 -0.5332 -0.48875l-0.5225 -1.2825C13.8587 6.23125 13.5174 6 13.1381 6c-0.6569 0 -1.1063 0.66313 -0.8619 1.27313l0.5212 1.28187c0.1257 0.30937 0.0775 0.6625 -0.1268 0.92625l-0.8007 1.03375c-1.6337 1.9806 -2.23684 4.6506 -1.6143 7.1412l1.0031 4.0119c0.1137 0.4544 0.5212 0.7575 0.9694 0.7575 0.08 0 0.1618 -0.01 0.2431 -0.03 0.5356 -0.1337 0.8619 -0.6769 0.7275 -1.2125l-1.0031 -4.0118c-0.4694 -1.8775 -0.0144 -3.8907 1.2168 -5.3838l0.84 -1.0187c0.1013 -0.1138 0.4407 -0.4275 0.9744 -0.2488 3.0706 1.1725 5.105 4.1019 5.105 7.42v2.4569c0 0.5381 0.4138 1.0018 0.9519 1.0268 0.5744 0.0269 1.0481 -0.4306 1.0481 -0.9987v-2.4856c0.0007 -2.1175 -0.6587 -4.1425 -1.9056 -5.8544Z" fill="#ffb02e" />
    </svg>
  );
}

export function KopiIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <desc>Kopi: varian Google Noto dari berkas Emoji_u2615.svg</desc>
      {/* Badan cangkir */}
      <path d="M52.54,42.53c-23.82,0-47.64,9.02-47.64,27.04c0,20.08,9.42,55.63,47.64,55.63 s47.64-35.55,47.64-55.63C100.18,51.55,76.36,42.53,52.54,42.53z" fill="#E0E0E0" />
      {/* Uap tiga helai */}
      <path d="M33.87,49.53c-4.38-1.82-8.09-6.63-8.4-10.72c-0.68-8.81,4.28-11.96,4.28-19.64c0-6.44-1.09-9.82-3.23-11.58c-0.62-0.51-0.72-0.68-0.66-0.82c0.09-0.18,0.09-0.29,1.04-0.06c3.89,0.95,10.21,4.59,10.4,12.26c0.2,8.16-4.27,10.05-4.94,18.91c-0.25,3.3-0.26,7.95,1.91,10.97c0.27,0.37,0.31,0.52,0.3,0.62C34.55,49.61,34.31,49.69,33.87,49.53z" fill="#E0E0E0" />
      <path d="M55.82,45.44c-4.38-1.82-8.09-6.63-8.4-10.72c-0.68-8.81,4.28-11.96,4.28-19.64c0-6.44-1.09-9.82-3.23-11.58C47.85,3,47.75,2.83,47.81,2.69c0.09-0.18,0.09-0.29,1.04-0.06c3.89,0.95,10.21,4.59,10.4,12.26c0.2,8.16-4.27,10.05-4.94,18.91c-0.25,3.3-0.26,7.95,1.91,10.97c0.27,0.37,0.31,0.52,0.3,0.62C56.5,45.52,56.26,45.61,55.82,45.44z" fill="#E0E0E0" />
      <path d="M76.23,50.36c-4.38-1.82-8.09-6.63-8.4-10.72c-0.68-8.81,4.28-11.96,4.28-19.64c0-6.44-1.09-9.82-3.23-11.58c-0.62-0.51-0.72-0.68-0.66-0.82c0.09-0.18,0.09-0.29,1.04-0.06c3.89,0.95,10.21,4.59,10.4,12.26c0.2,8.16-4.27,10.05-4.94,18.91c-0.25,3.3-0.26,7.95,1.91,10.97c0.27,0.37,0.31,0.52,0.3,0.62C76.91,50.44,76.67,50.53,76.23,50.36z" fill="#E0E0E0" />
      {/* Permukaan kopi dua warna: lensa hasil irisan dua elips */}
      <ellipse cx="52.54" cy="69.81" rx="40.17" ry="21.1" fill="#90A4AE" />
      <path d="M13.61,75.02A40.17,21.1 0 0 1 91.47,75.02A40.17,21.1 0 0 1 13.61,75.02z" fill="#855C52" />
      {/* Pegangan */}
      <path d="M81.36,109.7c-0.66,0-1.04-0.01-1.07-0.02c-3.03-0.19-5.33-2.81-5.13-5.84 c0.19-3.03,2.79-5.34,5.84-5.14c0.26,0,26.31,0.25,30.43-13.86c0.98-3.35,0.88-5.86-0.29-7.46c-1.03-1.41-4.1-3.79-13.05-3.99 c-3.04-0.07-5.45-2.58-5.38-5.62c0.07-3.04,2.61-5.43,5.62-5.38c10.43,0.22,17.72,3.08,21.69,8.48 c3.3,4.5,3.96,10.23,1.97,17.04C115.94,108.58,87.29,109.7,81.36,109.7z" fill="#E0E0E0" />
      {/* Kilau permukaan */}
      <path d="M45.31,70.47c1.24-0.15,2.46-1.33,2.03-2.34c-0.35-0.84-1.57-1.04-2.6-1.08 c-4.1-0.17-11.1,1.9-17.02,4.73c-0.81,0.38-2.22,1.4-2.43,2.21c-0.23,0.87,0.55,1.57,1.43,1.65c0.88,0.08,1.81-0.28,2.69-0.64 C36.74,72.06,39.09,71.29,45.31,70.47z" fill="#BCAAA4" />
    </svg>
  );
}

export function BomIcon({ size = 19 }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        {/* Gradien bola: titik terang kiri atas ke gelap bawah kanan, persis frame 11 */}
        <radialGradient id={`tkfx-bom-${gid}`} cx="0.32" cy="0.26" r="0.79">
          <stop offset="0" stopColor="#6A6A76" />
          <stop offset="0.55" stopColor="#37373F" />
          <stop offset="1" stopColor="#1A1A22" />
        </radialGradient>
      </defs>
      {/* Bola bom + tutup + sumbu + percik api */}
      <ellipse cx="16" cy="20.67" rx="10.33" ry="10.33" fill={`url(#tkfx-bom-${gid})`} stroke="#12121A" strokeWidth="0.83" />
      <ellipse cx="11.83" cy="14.67" rx="2.5" ry="1.67" fill="#FFFFFF" opacity="0.4" transform="rotate(-28 11.83 14.67)" />
      <rect x="13" y="6.33" width="6" height="4" rx="1" fill="#8E8E9A" stroke="#12121A" strokeWidth="0.67" />
      <path d="M16 6.33 C16.33 4.67 19 5 20.33 2.33" fill="none" stroke="#C98A3B" strokeWidth="1.33" strokeLinecap="round" />
      <path d="M21.33 0 L22.07 1.93 L24 2.67 L22.07 3.4 L21.33 5.33 L20.6 3.4 L18.67 2.67 L20.6 1.93 Z" fill="#FFC93C" stroke="#B36A0E" strokeWidth="0.5" strokeLinejoin="round" />
      <ellipse cx="24.17" cy="5.83" rx="0.83" ry="0.83" fill="#FFC93C" />
    </svg>
  );
}

export function TomatIcon({ size = 19 }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        {/* Gradien badan: semu terang kiri atas ke merah tua bawah kanan */}
        <radialGradient id={`tkfx-tomat-${gid}`} cx="0.35" cy="0.28" r="0.71">
          <stop offset="0" stopColor="#FF8A66" />
          <stop offset="0.5" stopColor="#E8402A" />
          <stop offset="1" stopColor="#9E1414" />
        </radialGradient>
      </defs>
      {/* Badan tomat + daun bintang + tangkai + kilau */}
      <ellipse cx="16" cy="19.33" rx="12" ry="10" fill={`url(#tkfx-tomat-${gid})`} stroke="#6E0D0D" strokeWidth="0.83" />
      <path d="M16 7.67 L17.49 9.75 L22.34 9.74 L18.41 11.02 L19.92 13.1 L16 11.81 L12.08 13.1 L13.59 11.02 L9.66 9.74 L14.51 9.75 Z" fill="#3E9142" stroke="#1F5A26" strokeWidth="0.5" strokeLinejoin="round" />
      <rect x="15" y="3.33" width="2" height="5.33" rx="0.67" fill="#2F7A33" stroke="#1F5A26" strokeWidth="0.4" />
      <ellipse cx="10.83" cy="14.17" rx="2.5" ry="1.5" fill="#FFFFFF" opacity="0.42" transform="rotate(-22 10.83 14.17)" />
    </svg>
  );
}

export const THROWABLE_ICONS = {
  sendal: SendalIcon,
  kopi: KopiIcon,
  bom: BomIcon,
  tomat: TomatIcon,
};
