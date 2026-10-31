/**
 * Ikon SVG barang lemparan untuk panel ejekan dan proyektil terbang.
 * Gaya garis mengikuti SvgPrimitives: viewBox 24, stroke currentColor,
 * ujung membulat. Warna diatur lewat CSS (amber di chip, terang di proyektil).
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function SendalIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* Alas sendal jepit memanjang */}
      <path d="M8 2.5C5.4 2.5 4 5 4 8.6L4 14.8C4 18.8 5.5 21.5 8 21.5C10.5 21.5 12 18.8 12 14.8L12 8.6C12 5 10.6 2.5 8 2.5Z" {...stroke} />
      {/* Tali V + jempolan */}
      <path d="M4.8 8.2L8 12L11.2 8.2" {...stroke} />
      <circle cx="8" cy="12.6" r="1.15" fill="currentColor" />
    </svg>
  );
}

export function KopiIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* Bodi cangkir + pegangan */}
      <path d="M4 9.5H15V14.5A5.5 5.5 0 0 1 9.5 20H9.5A5.5 5.5 0 0 1 4 14.5V9.5Z" {...stroke} />
      <path d="M15 10.5H16.8A2.6 2.6 0 0 1 16.8 15.7H15" {...stroke} />
      {/* Uap dua helai */}
      <path d="M7.4 3.5V5.8M11.6 3.5V5.8" {...stroke} strokeWidth={1.8} />
    </svg>
  );
}

export function BomIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* Bodi bom */}
      <circle cx="10" cy="14" r="6.6" {...stroke} />
      {/* Sumbu + percsik api */}
      <path d="M14.4 9.2L16.6 6.6" {...stroke} />
      <path d="M19.2 2.6L19.9 4.2L21.5 4.9L19.9 5.6L19.2 7.2L18.5 5.6L16.9 4.9L18.5 4.2Z" fill="currentColor" />
    </svg>
  );
}

export function TomatIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* Bodi tomat */}
      <path d="M12 8.2C7.4 8.2 4.2 11 4.2 14.4C4.2 18.2 7.6 21 12 21C16.4 21 19.8 18.2 19.8 14.4C19.8 11 16.6 8.2 12 8.2Z" {...stroke} />
      {/* Tangkai + daun */}
      <path d="M12 3.4V8" {...stroke} strokeWidth={1.8} />
      <path d="M12 6.4L9.4 5.4M12 6.4L14.6 5.4M12 7.4L9.8 7.8M12 7.4L14.2 7.8" {...stroke} strokeWidth={1.6} />
    </svg>
  );
}

export const THROWABLE_ICONS = {
  sendal: SendalIcon,
  kopi: KopiIcon,
  bom: BomIcon,
  tomat: TomatIcon,
};
