// Model 1: modułowy wkład do szuflady — pojemnik ze ściankami i siatką przegródek.
import { defineModel, type BuildCtx, type HRect, type Plan2D, type Rect, type Variant } from '../core/model.js';
import { fmt } from '../core/format.js';
import { heightMesh } from '../geometry/heightmesh.js';
import { textRuns } from '../geometry/text.js';
import { COLORS } from '../materials/rosa3d.js';

export interface DrawerSpec {
  W: number; D: number; H: number; wall: number; floor: number; divH: number; nx: number; ny: number;
  engrave?: HRect[];
}

export const PRESETS: Variant[] = [
  { id: 'p1', name: 'Pojemnik S', w: 50, d: 50, nx: 1, ny: 1, color: COLORS[0] },
  { id: 'p2', name: 'Pojemnik podłużny', w: 50, d: 150, nx: 1, ny: 1, color: COLORS[1] },
  { id: 'p3', name: 'Kwadrat 4-dzielny', w: 100, d: 100, nx: 2, ny: 2, color: COLORS[2] },
  { id: 'p4', name: 'Na sztućce', w: 100, d: 250, nx: 3, ny: 1, color: COLORS[3] },
  { id: 'p5', name: 'Na drobiazgi', w: 150, d: 100, nx: 3, ny: 2, color: COLORS[4] },
];
export const presetFull = (p: Variant): Variant =>
  Object.assign({ h: 40, hAuto: true, wall: 1.6, floor: 1.2, divPct: 100, preset: true }, JSON.parse(JSON.stringify(p)));

/** Wysokość modułu: „auto” = wysokość szuflady minus 3 mm (min. 15 mm). */
export const heightOf = (t: Variant, drawerH: number | null): number =>
  t.hAuto && drawerH ? Math.max(15, Math.round(drawerH - 3)) : t.h;

export function specOf(t: Variant, drawerH: number | null, tol = 0): DrawerSpec {
  const H = heightOf(t, drawerH);
  return { W: t.w - tol, D: t.d - tol, H, wall: t.wall, floor: t.floor, divH: Math.max(t.floor + 1, H * t.divPct / 100), nx: t.nx, ny: t.ny };
}

export function moduleRects(g: DrawerSpec): HRect[] {
  const { W, D, H, wall, divH, nx, ny } = g, r: HRect[] = [];
  r.push([0, 0, wall, D, H], [W - wall, 0, W, D, H], [wall, 0, W - wall, wall, H], [wall, D - wall, W - wall, D, H]);
  const iw = W - 2 * wall, id = D - 2 * wall;
  if (nx > 1) { const c = (iw - (nx - 1) * wall) / nx; for (let k = 1; k < nx; k++) { const x0 = wall + k * c + (k - 1) * wall; r.push([x0, wall, x0 + wall, D - wall, divH]); } }
  if (ny > 1) { const c = (id - (ny - 1) * wall) / ny; for (let k = 1; k < ny; k++) { const y0 = wall + k * c + (k - 1) * wall; r.push([wall, y0, W - wall, y0 + wall, divH]); } }
  return r;
}

export function compartments(g: DrawerSpec): Plan2D {
  const { W, D, wall, nx, ny } = g, out: Rect[] = [];
  const cw = (W - 2 * wall - (nx - 1) * wall) / nx, cd = (D - 2 * wall - (ny - 1) * wall) / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x0 = wall + i * (cw + wall), y0 = wall + j * (cd + wall);
    out.push([x0, y0, x0 + cw, y0 + cd]);
  }
  return { cells: out, cw, cd };
}

export function labelText(t: Variant, drawerH: number | null, full: boolean): string {
  const n = (v: number) => (Math.round(v * 10) / 10).toString();
  return full ? `${n(t.w)}x${n(t.d)}x${n(heightOf(t, drawerH))}` : `${n(t.w)}x${n(t.d)}`;
}

/** Napis wklęsły (wygrawerowany) w dnie, czytelny od góry: przy przedniej krawędzi największej przegródki. */
export function labelRects(g: DrawerSpec, t: Variant, drawerH: number | null): HRect[] {
  const { cells } = compartments(g);
  const cell = cells.reduce((best, c) => {
    const ar = (c[2] - c[0]) * (c[3] - c[1]), br = (best[2] - best[0]) * (best[3] - best[1]);
    return ar > br + 0.01 || (Math.abs(ar - br) <= 0.01 && c[3] > best[3]) ? c : best;
  }, cells[0]);
  const cw = cell[2] - cell[0] - 3, cd = cell[3] - cell[1] - 3, top = g.floor - (g.floor >= 1.2 ? 0.6 : g.floor / 2);
  for (const full of [true, false]) {
    const tr = textRuns(labelText(t, drawerH, full));
    for (const rot of [false, true]) {
      const availW = rot ? cd : cw, availH = rot ? cw : cd;
      const p = Math.min(0.8, availW / tr.w, availH * 0.5 / tr.h);
      if (p < 0.5) continue;
      const TW = tr.w * p, TH = tr.h * p;
      if (!rot) {
        const x0 = (cell[0] + cell[2]) / 2 - TW / 2, y0 = cell[3] - 1.5 - TH;
        return tr.runs.map(([a, b, c, d]) => [x0 + a * p, y0 + b * p, x0 + c * p, y0 + d * p, top] as HRect);
      }
      const x0 = cell[0] + 1.5, y1 = (cell[1] + cell[3]) / 2 + TW / 2;
      return tr.runs.map(([a, b, c, d]) => [x0 + b * p, y1 - c * p, x0 + d * p, y1 - a * p, top] as HRect);
    }
  }
  return [];
}

/** Zmniejsza liczbę przegródek, gdy wychodzą węższe niż 8 mm. */
export function fixCells(t: Variant): Variant {
  for (let k = 0; k < 20; k++) {
    const c = compartments(specOf(t, null));
    if (c.cw < 8 && t.nx > 1) { t.nx--; continue; }
    if (c.cd < 8 && t.ny > 1) { t.ny--; continue; }
    break;
  }
  return t;
}

export function validate(t: Variant): string {
  if ([t.w, t.d, t.nx, t.ny, t.wall, t.floor, t.divPct].some(v => !isFinite(v)) || (!t.hAuto && !isFinite(t.h))) return 'Uzupełnij wszystkie pola liczbami.';
  if (t.w < 20 || t.d < 20 || t.w > 600 || t.d > 600) return 'Szerokość i głębokość: 20–600 mm.';
  if (!t.hAuto && (t.h < 10 || t.h > 400)) return 'Wysokość: 10–400 mm.';
  if (t.wall < 0.8 || t.wall > 5) return 'Ścianka: 0,8–5 mm (najlepiej wielokrotność szerokości ścieżki dyszy, np. 1,6 mm).';
  if (t.floor < 0.6 || t.floor > 5) return 'Dno: 0,6–5 mm.';
  if (t.nx < 1 || t.ny < 1 || t.nx > 10 || t.ny > 10) return 'Liczba kolumn i rzędów: 1–10.';
  if (t.divPct < 20 || t.divPct > 100) return 'Wysokość przegródek: 20–100% wysokości modułu.';
  const c = compartments(specOf(Object.assign({}, t, { h: t.hAuto ? 40 : t.h, hAuto: false }), null));
  if (c.cw < 8 || c.cd < 8) return `Przegródki wychodzą za wąskie (${fmt(c.cw)} × ${fmt(c.cd)} mm). Zmniejsz ich liczbę albo powiększ moduł.`;
  return '';
}

export default defineModel<DrawerSpec>({
  id: 'wklad-szuflada',
  name: 'Wkład do szuflady',
  version: 1,
  kind: 'layout',
  description: 'Modułowe pojemniki z przegródkami, układane w szufladzie',
  printNote: 'Dnem do stołu, bez podpór.',
  params: {
    w: { label: 'Szerokość', type: 'mm', min: 20, max: 600, step: 0.5 },
    d: { label: 'Głębokość', type: 'mm', min: 20, max: 600, step: 0.5 },
    h: { label: 'Wysokość', type: 'mm', min: 10, max: 400, step: 0.5 },
    hAuto: { label: 'Do wysokości szuflady', type: 'bool' },
    nx: { label: 'Przegródki — kolumny', type: 'int', min: 1, max: 10 },
    ny: { label: 'Przegródki — rzędy', type: 'int', min: 1, max: 10 },
    wall: { label: 'Ścianka', type: 'mm', min: 0.8, max: 5, step: 0.1 },
    floor: { label: 'Dno', type: 'mm', min: 0.6, max: 5, step: 0.1 },
    divPct: { label: 'Przegródki (% wysokości)', type: 'pct', min: 20, max: 100, step: 5 },
  },
  presets: PRESETS,
  withDefaults: v => presetFull(v as Variant),
  footprint: v => ({ w: v.w, d: v.d }),
  height: (v, ctx) => heightOf(v, ctx.drawerH),
  spec(v, ctx: BuildCtx) {
    const g = specOf(v, ctx.drawerH, ctx.tol);
    if (ctx.label && g.floor >= 0.8) g.engrave = labelRects(g, v, ctx.drawerH);
    return g;
  },
  plan2d: g => compartments(g),
  mesh: (g, clip) => heightMesh({ W: g.W, D: g.D, floor: g.floor, rects: moduleRects(g), engrave: g.engrave, clip: clip || null }),
  validate,
  normalize: fixCells,
  labelText: (v, ctx, full) => labelText(v, ctx.drawerH, full),
  splitHeight(v, ctx, band) {
    const H = heightOf(v, ctx.drawerH), zc = Math.round((H - band) * 100) / 100;
    return zc >= v.floor + 1 && band > 0 ? zc : null;
  },
});
