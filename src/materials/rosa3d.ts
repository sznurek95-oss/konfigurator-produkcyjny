// Materiały i kolory filamentów. Odcienie Rosa3D dobrane wizualnie (producent nie podaje kodów).

/** Kolory robocze modułów w edytorze (rozróżnianie typów na planie). */
export const COLORS = ['#5B8DB8', '#D98E3A', '#6FA86A', '#B5699E', '#C9B44A', '#7C7FC4', '#4FA3A0', '#C76B5A'];

/** Gęstość materiału (g/cm³). */
export const MATS: Record<string, number> = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, 'TPU': 1.21 };
/** Średnia objętość wytłaczania z ruchami jałowymi (mm³/s) — do szacowania czasu druku. */
export const FLOW = 6;

export type Swatch = [string, string];
export const ROSA: Swatch[] = [
  ['#151617', 'Black'], ['#F1F0EC', 'White'], ['#7F8488', 'Gray'], ['#D6CCB2', '8bit Retro Beige'], ['#A3172C', 'Karmin Red'],
  ['#1F5BB5', 'Blue'], ['#1B2753', 'Dark Blue'], ['#2F8F45', 'Green'], ['#F2C418', 'Yellow'], ['#EC6A1F', 'Orange']
];
// Rosa3D PLA-CF Matt Home Decor — matowe, z delikatnym efektem włókna węglowego.
// Pełna seria (12 kolorów) wg rosa3d.pl; 'Green Grass' w wersji angielskiej sklepu nazywa się 'Matcha Green', 'Black' — 'Carbon Black'.
export const ROSA_CF: Swatch[] = [
  ['#2B2C2E', 'Black'], ['#9C4A36', 'Fired Brick'], ['#5E3B6D', 'Grape Violet'], ['#C65679', 'Hibiscus Pink'],
  ['#6A6D3B', 'Olive Green'], ['#889848', 'Avocado Guacamole'], ['#A2B47B', 'Green Grass'], ['#6D5A3B', 'Olive Brown'],
  ['#4C6A8B', 'Blue Jeans'], ['#A49C90', 'Stone Warm Gray'], ['#5A5856', 'Lava Gray'], ['#99A0A5', 'Stone Cold Gray']
];
export const SERIES: Record<string, { name: string; list: Swatch[]; matte: boolean }> = {
  starter: { name: 'PLA Starter', list: ROSA, matte: false },
  cf: { name: 'PLA-CF Matt Home Decor', list: ROSA_CF, matte: true }
};

export interface FilamentInfo { series: string; sname: string; name: string; matte: boolean }
export const findFil = (hex: string): FilamentInfo | null => {
  const h = String(hex).toLowerCase();
  for (const [k, sr] of Object.entries(SERIES)) { const r = sr.list.find(([c]) => c.toLowerCase() === h); if (r) return { series: k, sname: sr.name, name: r[1], matte: sr.matte }; }
  return null;
};
export const rosaName = (hex: string): string | null => { const f = findFil(hex); return f ? `Rosa3D ${f.sname} ${f.name}` : null; };
export const seriesOf = (hex: string): string => (findFil(hex) || { series: 'starter' }).series;
