// Model 2: wieszak na grzejnik łazienkowy (drabinkowy) — własny projekt TwojaSzuflada.pl.
//
// Budowa (widok z boku, rurki grzejnika biegną poziomo, prostopadle do rysunku):
//   • zatrzask obejmuje górną rurkę od przodu, przez górę, do tyłu (205°) — wciska się od góry,
//   • noga schodzi pionowo przed dolną rurką i opiera się o nią, więc wieszak się nie obraca,
//   • na dole łagodne zagięcie i ramię haka skierowane do przodu i w górę, zakończone wywinięciem.
// Drukowany na boku: profil leży na stole, szerokość rośnie w osi Z — warstwy biegną wzdłuż haka,
// dzięki czemu jest mocny.
import { defineModel, type Variant } from '../core/model.js';
import { samplePath, strip, extrude, isSimple, type Pt, type Seg } from '../geometry/extrude.js';
import { ROSA } from '../materials/rosa3d.js';
const rosa = (n: string) => (ROSA.find(r => r[1] === n) as [string, string])[0];

export interface HookSpec {
  poly: Pt[];          // obrys przesunięty tak, że min x = min y = 0 (układ stołu drukarki)
  off: Pt;             // przesunięcie: punkt (0,0) środka górnej rurki w układzie obrysu
  W: number;           // szerokość (wysokość wydruku)
  D: number; G: number; T: number;
  yB: number;          // środek dolnej rurki względem górnej
  size: { w: number; d: number };
}

const CLAMP_DEG = 205;   // kąt objęcia górnej rurki

export const PRESETS: Variant[] = [
  { id: 'h1', model: 'wieszak-grzejnik', name: 'Wieszak 20/20', D: 20, G: 20, color: rosa('White') },
  { id: 'h2', model: 'wieszak-grzejnik', name: 'Wieszak 22/25', D: 22, G: 25, color: rosa('Gray') },
  { id: 'h3', model: 'wieszak-grzejnik', name: 'Wieszak 25/30', D: 25, G: 30, color: rosa('Black') },
  { id: 'h4', model: 'wieszak-grzejnik', name: 'Wieszak mocny 22/25', D: 22, G: 25, T: 6, W: 16, L: 40, color: rosa('Dark Blue') },
];
const DEF = { D: 20, G: 20, T: 5, W: 12, L: 35, alpha: 40, c: 0.3 };

/** Ścieżka środkowa wieszaka w układzie: środek górnej rurki = (0,0), oś y w górę, x do przodu. */
export function centerline(v: Variant): { pts: Pt[]; yB: number } {
  const { D, G, T, L, alpha, c } = v;
  const rIn = D / 2 + c, Rc = rIn + T / 2, yB = -(D + G);
  const yLeg = yB - D * 0.25;
  const Rb = Math.max(T * 1.2, 5), Rt = Math.max(T, 4);
  const a = alpha * Math.PI / 180;
  const bendC: Pt = [Rc + Rb, yLeg];
  const bendEnd: Pt = [bendC[0] + Rb * Math.cos((270 + alpha) * Math.PI / 180), bendC[1] + Rb * Math.sin((270 + alpha) * Math.PI / 180)];
  const armEnd: Pt = [bendEnd[0] + L * Math.cos(a), bendEnd[1] + L * Math.sin(a)];
  const tipC: Pt = [armEnd[0] - Rt * Math.sin(a), armEnd[1] + Rt * Math.cos(a)];
  const start: Pt = [Rc * Math.cos(CLAMP_DEG * Math.PI / 180), Rc * Math.sin(CLAMP_DEG * Math.PI / 180)];
  const segs: Seg[] = [
    { kind: 'arc', c: [0, 0], r: Rc, a0: CLAMP_DEG, a1: 0 },
    { kind: 'line', to: [Rc, yLeg] },
    { kind: 'arc', c: bendC, r: Rb, a0: 180, a1: 270 + alpha },
    { kind: 'line', to: armEnd },
    { kind: 'arc', c: tipC, r: Rt, a0: alpha - 90, a1: alpha - 90 + 70 },
  ];
  return { pts: samplePath(start, segs, 0.6), yB };
}

export function specOf(v: Variant): HookSpec {
  const { pts, yB } = centerline(v);
  const raw = strip(pts, v.T, 12);
  const minX = Math.min(...raw.map(p => p[0])), minY = Math.min(...raw.map(p => p[1]));
  const poly = raw.map(p => [Math.round((p[0] - minX) * 1e4) / 1e4, Math.round((p[1] - minY) * 1e4) / 1e4] as Pt);
  const w = Math.max(...poly.map(p => p[0])), d = Math.max(...poly.map(p => p[1]));
  return { poly, off: [-minX, -minY], W: v.W, D: v.D, G: v.G, T: v.T, yB, size: { w, d } };
}

function validate(v: Variant): string {
  for (const k of ['D', 'G', 'T', 'W', 'L', 'alpha', 'c']) if (!isFinite(v[k])) return 'Uzupełnij wszystkie pola liczbami.';
  if (v.D < 12 || v.D > 40) return 'Średnica rurki: 12–40 mm.';
  if (v.G < 8 || v.G > 80) return 'Prześwit między rurkami: 8–80 mm.';
  if (v.T < 3 || v.T > 8) return 'Grubość: 3–8 mm.';
  if (v.W < 8 || v.W > 30) return 'Szerokość: 8–30 mm.';
  if (v.L < 15 || v.L > 80) return 'Długość ramienia: 15–80 mm.';
  if (v.alpha < 10 || v.alpha > 75) return 'Kąt ramienia: 10–75°.';
  if (v.c < 0 || v.c > 1) return 'Luz na rurce: 0–1 mm.';
  if (!isSimple(specOf(v).poly)) return 'Ramię haka nachodzi na nogę — zmniejsz kąt albo wydłuż ramię.';
  return '';
}

export default defineModel<HookSpec>({
  id: 'wieszak-grzejnik',
  name: 'Wieszak na grzejnik',
  version: 1,
  kind: 'single',
  description: 'Zatrzask na rurkę grzejnika łazienkowego z hakiem na ręcznik',
  printNote: 'Drukuj na boku — profil płasko na stole, warstwy wzdłuż haka. Zalecane 3 ścianki, PETG albo PLA.',
  params: {
    D: { label: 'Średnica rurki', type: 'mm', min: 12, max: 40, step: 0.5 },
    G: { label: 'Prześwit między rurkami', type: 'mm', min: 8, max: 80, step: 0.5 },
    T: { label: 'Grubość', type: 'mm', min: 3, max: 8, step: 0.2 },
    W: { label: 'Szerokość', type: 'mm', min: 8, max: 30, step: 1 },
    L: { label: 'Długość ramienia', type: 'mm', min: 15, max: 80, step: 1 },
    alpha: { label: 'Kąt ramienia', type: 'deg', min: 10, max: 75, step: 1 },
    c: { label: 'Luz na rurce', type: 'mm', min: 0, max: 1, step: 0.1 },
  },
  presets: PRESETS,
  withDefaults: v => Object.assign({ model: 'wieszak-grzejnik' }, DEF, JSON.parse(JSON.stringify(v))),
  footprint: v => specOf(v).size,
  height: v => v.W,
  spec: v => specOf(v),
  plan2d: () => ({ cells: [], cw: 0, cd: 0 }),
  mesh: g => extrude(g.poly, g.W),
  validate,
  normalize: v => v,
  labelText: v => `${v.D}/${v.G}`,
  splitHeight: () => null,
  outline2d: g => ({
    polys: [g.poly],
    guides: [
      { kind: 'circle', cx: g.off[0], cy: g.off[1], r: g.D / 2, label: 'rurka' },
      { kind: 'circle', cx: g.off[0], cy: g.off[1] + g.yB, r: g.D / 2, label: 'rurka' },
    ],
    dims: [{ x1: g.off[0] - g.D / 2 - 6, y1: g.off[1] + g.yB + g.D / 2, x2: g.off[0] - g.D / 2 - 6, y2: g.off[1] - g.D / 2, text: `prześwit ${g.G} mm` }],
  }),
  scene3d: g => ({ cylinders: [
    { x: g.off[0], y: g.off[1], r: g.D / 2, len: g.W + 60 },
    { x: g.off[0], y: g.off[1] + g.yB, r: g.D / 2, len: g.W + 60 },
  ] }),
});
