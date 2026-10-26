// Planowanie płyt druku: rozkłada moduły zamówienia na płyty drukarki (np. P1S 256 × 256 mm),
// osobno dla każdej grupy kolorów, i liczy czas oraz plan dzienny.
//
// Pakowanie: MaxRects (najlepsze dopasowanie krótszego boku) z obrotem o 90°, każda część
// powiększona o odstęp między częściami; płyta pomniejszona o margines od krawędzi stołu.

export interface PlatePiece {
  /** Identyfikator części (np. id modułu w szufladzie albo id szablonu + numer sztuki). */
  id: string;
  /** Wymiar podstawy na stole (mm). */
  w: number;
  d: number;
  /** Grupa kolorów: części z różnych grup nie trafiają na tę samą płytę. */
  group: string;
  /** Szacowany czas druku części (min) i masa (g). */
  mins: number;
  grams: number;
}
export interface PlacedPiece extends PlatePiece {
  /** Lewy przedni narożnik na płycie (mm) i obrót o 90°; pw × pd = wymiar po obrocie. */
  x: number;
  y: number;
  rot: boolean;
  pw: number;
  pd: number;
}
export interface Plate {
  /** Numer płyty od 1. */
  index: number;
  group: string;
  pieces: PlacedPiece[];
  /** Szacowany czas płyty (min) z narzutem na grzanie i poziomowanie oraz masa (g). */
  mins: number;
  grams: number;
  /** Zajęcie płyty (0–1, pole części / pole użytkowe). */
  fill: number;
}
export interface PlateOpts {
  bed: number;
  /** Margines od krawędzi stołu (mm). Część, która się z nim nie mieści, dostaje osobną płytę z marginesem 1 mm. */
  margin?: number;
  /** Odstęp między częściami (mm). */
  gap?: number;
  /** Narzut czasu na płytę: grzanie, poziomowanie, linia czyszcząca (min). */
  overheadMin?: number;
}
export interface PlatePlan { plates: Plate[]; tooBig: PlatePiece[] }

interface Free { x: number; y: number; w: number; h: number }

/** Jedna płyta jako pojemnik MaxRects. */
class Bin {
  free: Free[];
  constructor(public W: number, public H: number) { this.free = [{ x: 0, y: 0, w: W, h: H }]; }
  /** Najlepsze miejsce dla prostokąta w × h (także obróconego) albo null. */
  find(w: number, h: number): { x: number; y: number; rot: boolean; score: number } | null {
    let best: { x: number; y: number; rot: boolean; score: number; long: number } | null = null;
    for (const f of this.free) for (const rot of [false, true]) {
      const a = rot ? h : w, b = rot ? w : h;
      if (a > f.w + 1e-6 || b > f.h + 1e-6) continue;
      const short = Math.min(f.w - a, f.h - b), long = Math.max(f.w - a, f.h - b);
      // remis: niżej i bardziej w lewo (płyty zapełniają się od przodu, czytelny układ)
      if (!best || short < best.score - 1e-6 || (Math.abs(short - best.score) <= 1e-6 && (long < best.long - 1e-6 ||
          (Math.abs(long - best.long) <= 1e-6 && (f.y < best.y - 1e-6 || (Math.abs(f.y - best.y) <= 1e-6 && f.x < best.x))))))
        best = { x: f.x, y: f.y, rot, score: short, long };
    }
    return best;
  }
  place(x: number, y: number, w: number, h: number) {
    const out: Free[] = [];
    for (const f of this.free) {
      if (x >= f.x + f.w - 1e-9 || x + w <= f.x + 1e-9 || y >= f.y + f.h - 1e-9 || y + h <= f.y + 1e-9) { out.push(f); continue; }
      if (x > f.x + 1e-9) out.push({ x: f.x, y: f.y, w: x - f.x, h: f.h });
      if (x + w < f.x + f.w - 1e-9) out.push({ x: x + w, y: f.y, w: f.x + f.w - x - w, h: f.h });
      if (y > f.y + 1e-9) out.push({ x: f.x, y: f.y, w: f.w, h: y - f.y });
      if (y + h < f.y + f.h - 1e-9) out.push({ x: f.x, y: y + h, w: f.w, h: f.y + f.h - y - h });
    }
    // usuń prostokąty zawarte w innych
    this.free = out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 &&
      a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9 && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  }
}

/** Rozkłada części na płyty. Wynik deterministyczny: ta sama lista = ten sam plan. */
export function planPlates(pieces: PlatePiece[], o: PlateOpts): PlatePlan {
  const margin = o.margin ?? 3, gap = o.gap ?? 4, over = o.overheadMin ?? 6, MIN_MARGIN = 1;
  const S = o.bed - 2 * margin + gap;   // pole użytkowe powiększone o odstęp (każda część ma odstęp z prawej i z tyłu)
  const usable = (o.bed - 2 * margin) ** 2;
  const tooBig: PlatePiece[] = [], solo: PlatePiece[] = [], groups = new Map<string, PlatePiece[]>();
  for (const p of pieces) {
    const a = Math.min(p.w, p.d), b = Math.max(p.w, p.d);
    if (a + gap > S + 1e-6 || b + gap > S + 1e-6) { (b <= o.bed - 2 * MIN_MARGIN + 1e-6 ? solo : tooBig).push(p); continue; }
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group)!.push(p);
  }
  // grupy: najpierw te z największym polem do wydruku
  const area = (ps: PlatePiece[]) => ps.reduce((s, p) => s + p.w * p.d, 0);
  const order = [...groups.entries()].sort((a, b) => area(b[1]) - area(a[1]) || (a[0] < b[0] ? -1 : 1));
  const plates: Plate[] = [];
  for (const [group, ps] of order) {
    const sorted = [...ps].sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d) || b.w * b.d - a.w * a.d || (a.id < b.id ? -1 : 1));
    const bins: { bin: Bin; pieces: PlacedPiece[] }[] = [];
    for (const p of sorted) {
      const w = p.w + gap, h = p.d + gap;
      let target: { bin: Bin; pieces: PlacedPiece[] } | null = null, spot = null;
      for (const b of bins) { const s = b.bin.find(w, h); if (s) { target = b; spot = s; break; } }
      if (!target) { target = { bin: new Bin(S, S), pieces: [] }; bins.push(target); spot = target.bin.find(w, h); }
      const pw = spot!.rot ? p.d : p.w, pd = spot!.rot ? p.w : p.d;
      target.bin.place(spot!.x, spot!.y, pw + gap, pd + gap);
      target.pieces.push({ ...p, x: margin + spot!.x, y: margin + spot!.y, rot: spot!.rot, pw, pd });
    }
    for (const b of bins) {
      const mins = b.pieces.reduce((s, p) => s + p.mins, 0) + over, grams = b.pieces.reduce((s, p) => s + p.grams, 0);
      plates.push({ index: 0, group, pieces: b.pieces, mins, grams, fill: b.pieces.reduce((s, p) => s + p.w * p.d, 0) / usable });
    }
  }
  // części prawie wielkości stołu: każda na osobnej płycie, na środku (dłuższy bok wzdłuż osi y)
  for (const p of solo) {
    const rot = p.w > p.d, pw = rot ? p.d : p.w, pd = rot ? p.w : p.d;
    plates.push({ index: 0, group: p.group, pieces: [{ ...p, x: (o.bed - pw) / 2, y: (o.bed - pd) / 2, rot, pw, pd }],
      mins: p.mins + over, grams: p.grams, fill: (p.w * p.d) / (o.bed - 2 * MIN_MARGIN) ** 2 });
  }
  plates.forEach((p, i) => p.index = i + 1);
  return { plates, tooBig };
}

/** Plan dzienny: kolejne płyty, dopóki mieszczą się w godzinach druku danego dnia (płyta dłuższa niż dzień — osobny dzień). */
export function planDays(mins: number[], hoursPerDay: number): number[][] {
  const cap = Math.max(1, hoursPerDay) * 60, days: number[][] = [];
  let cur: number[] = [], used = 0;
  mins.forEach((m, i) => {
    if (cur.length && used + m > cap + 1e-6) { days.push(cur); cur = []; used = 0; }
    cur.push(i); used += m;
  });
  if (cur.length) days.push(cur);
  return days;
}

/** „2 h 05 min”, „45 min”. */
export function fmtDur(mins: number): string {
  const m = Math.max(0, Math.round(mins)), h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h ${String(r).padStart(2, '0')} min` : `${r} min`;
}
