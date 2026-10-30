/**
 * Canonical avatar portrait catalog.
 * Dipakai oleh UI (SvgPrimitives) dan preloader aset supaya daftar file hanya
 * hidup di satu tempat dan tidak pernah berbeda antara picker dan cache.
 */
export const AVATAR_META = {
  finn: { file: 'A_Finn.png', name: 'Finn' },
  jake: { file: 'A_Jake.png', name: 'Jake' },
  bmo: { file: 'A_BMO.png', name: 'BMO' },
  marceline: { file: 'A_Marceline.png', name: 'Marceline' },
  'princess-bubblegum': { file: 'A_Princess_Bubblegum.png', name: 'Princess Bubblegum' },
  'ice-king': { file: 'A_Ice_King.png', name: 'Ice King' },
  gunter: { file: 'A_Gunter.png', name: 'Gunter' },
  fiona: { file: 'A_Fiona.png', name: 'Fiona' },
  'flame-princess': { file: 'A_Flame_Princess.png', name: 'Flame Princess' },
  'lady-rainicorn': { file: 'A_Lady_Rainicorn.png', name: 'Lady Rainicorn' },
  lemongrab: { file: 'A_Lemongrab.png', name: 'Lemongrab' },
  'lumpy-space-princess': { file: 'A_Lumpy_Space_Princess.png', name: 'Lumpy Space Princess' },
  'slime-princess': { file: 'A_Slime_Princess.png', name: 'Slime Princess' },
  'tree-trunks': { file: 'A_Tree_Trunks.png', name: 'Tree Trunks' },
  cake: { file: 'A_Cake.png', name: 'Cake' },
  'peppermint-butler': { file: 'A_Peppermint_Butler.png', name: 'Peppermint Butler' },
};

export function avatarName(avatar) {
  return AVATAR_META[avatar]?.name || 'Avatar';
}

export function avatarSrc(avatar) {
  const file = AVATAR_META[avatar]?.file;
  return file ? `/avatars/${file}` : null;
}

export const AVATAR_ASSET_PATHS = Object.freeze(
  Object.values(AVATAR_META).map(meta => `/avatars/${meta.file}`),
);
