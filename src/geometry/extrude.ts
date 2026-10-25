// Bryły z profilu 2D: pasek o stałej grubości wzdłuż ścieżki (łuki + odcinki),
// triangulacja wielokąta i wyciągnięcie na zadaną szerokość. Wynik zawsze szczelny.
import type { Mesh } from '../core/model.js';

export type Pt = [number, number];

/** Ścieżka środkowa: kolejne segmenty — odcinek albo łuk. */
export type Seg =
  | { kind: 'line'; to: Pt }
  | { kind: 'arc'; c: Pt; r: number; a0: number; a1: number };   // kąty w stopniach, a0 → a1 (kierunek wg znaku różnicy)

/** Próbkuje ścieżkę: punkty środkowe co ok. `step` mm (łuki gęściej). */
export function samplePath(start: Pt, segs: Seg[], step = 1): Pt[] {
  const pts: Pt[] = [start];
  let cur: Pt = start;
  for (const s of segs) {
    if (s.kind === 'line') {
      const L = Math.hypot(s.to[0] - cur[0], s.to[1] - cur[1]), n = Math.max(1, Math.ceil(L / (step * 4)));
      for (let i = 1; i <= n; i++) pts.push([cur[0] + (s.to[0] - cur[0]) * i / n, cur[1] + (s.to[1] - cur[1]) * i / n]);
      cur = s.to;
    } else {
      const da = s.a1 - s.a0, len = Math.abs(da) * Math.PI / 180 * s.r, n = Math.max(4, Math.ceil(len / step), Math.ceil(Math.abs(da) / 6));
      for (let i = 1; i <= n; i++) { const a = (s.a0 + da * i / n) * Math.PI / 180; pts.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }
      cur = pts[pts.length - 1];
    }
  }
  // usuń punkty zdublowane
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
}

/** Pasek o grubości t wokół ścieżki, z zaokrąglonymi końcami. Zwraca wielokąt przeciwnie do ruchu wskazówek zegara. */
export function strip(center: Pt[], t: number, capSteps = 10): Pt[] {
  const h = t / 2, n = center.length, left: Pt[] = [], right: Pt[] = [];
  const dir = (i: number): Pt => {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  for (let i = 0; i < n; i++) {
    const d = dir(i), nl: Pt = [-d[1], d[0]];
    left.push([center[i][0] + nl[0] * h, center[i][1] + nl[1] * h]);
    right.push([center[i][0] - nl[0] * h, center[i][1] - nl[1] * h]);
  }
  const cap = (p: Pt, d: Pt, end: boolean): Pt[] => {
    // półokrąg od prawej do lewej strony (koniec) albo od lewej do prawej (początek)
    const base = Math.atan2(d[1], d[0]), out: Pt[] = [];
    for (let k = 1; k < capSteps; k++) {
      const a = end ? base - Math.PI / 2 + Math.PI * k / capSteps : base + Math.PI / 2 + Math.PI * k / capSteps;
      out.push([p[0] + h * Math.cos(a), p[1] + h * Math.sin(a)]);
    }
    return out;
  };
  const poly = [...right, ...cap(center[n - 1], dir(n - 1), true), ...left.reverse(), ...cap(center[0], dir(0), false)];
  return area(poly) < 0 ? poly.reverse() : poly;
}

export function area(p: Pt[]): number {
  let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2;
}

/** Czy wielokąt jest prosty (krawędzie się nie przecinają). */
export function isSimple(p: Pt[]): boolean {
  const n = p.length;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return false;
  }
  return true;
}

/** Triangulacja metodą obcinania uszu (wielokąt prosty, CCW). Zwraca trójki indeksów. */
export function triangulate(p: Pt[]): number[] {
  const idx = p.map((_, i) => i), out: number[] = [];
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inside = (q: Pt, a: Pt, b: Pt, c: Pt) => cross(a, b, q) > 1e-12 && cross(b, c, q) > 1e-12 && cross(c, a, q) > 1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = p[i0], b = p[i1], c = p[i2];
      if (cross(a, b, c) <= 1e-12) continue;            // wierzchołek wklęsły albo współliniowy
      let ear = true;
      for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (inside(p[j], a, b, c)) { ear = false; break; } }
      if (!ear) continue;
      out.push(i0, i1, i2); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) {  // zostały same współliniowe — usuń jeden
      const k = idx.findIndex((_, k2) => { const a = p[idx[(k2 + idx.length - 1) % idx.length]], b = p[idx[k2]], c = p[idx[(k2 + 1) % idx.length]]; return Math.abs(cross(a, b, c)) <= 1e-12; });
      if (k < 0) throw new Error('Nie da się podzielić profilu na trójkąty');
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      out.push(i0, i1, i2); idx.splice(k, 1);
    }
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/** Wyciąga wielokąt (CCW, płaszczyzna XY) na wysokość h w osi Z. */
export function extrude(poly: Pt[], h: number): Mesh {
  const tris = triangulate(poly), P: number[] = [], n = poly.length;
  for (let i = 0; i < tris.length; i += 3) {
    const a = poly[tris[i]], b = poly[tris[i + 1]], c = poly[tris[i + 2]];
    P.push(a[0], a[1], h, b[0], b[1], h, c[0], c[1], h);    // góra (normalna +Z)
    P.push(a[0], a[1], 0, c[0], c[1], 0, b[0], b[1], 0);    // dół (normalna −Z)
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    P.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], h, a[0], a[1], 0, b[0], b[1], h, a[0], a[1], h);
  }
  return { pos: new Float32Array(P), vol: Math.abs(area(poly)) * h };
}
