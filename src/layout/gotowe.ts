// Gotowe układy szuflad kuchennych.
//
// Każdy układ to drzewo stref (podział na kolumny i rzędy) liczone dla KONKRETNEJ szuflady:
// moduły zawsze wypełniają ją w 100% (poza strefami oznaczonymi jako wolne miejsce), a liczba
// i szerokość przegródek wynika z wymiarów przedmiotów (sztućce, słoiczki, puszki, talerze…).
// Moduły są cięte do rozmiaru stołu drukarki (`cap`), bo większego niż stół nie wydrukujemy.
//
// Układ współrzędnych jak w edytorze: x w prawo, y od tyłu szuflady (0) do frontu (D).
import { MINSZ } from './autofill.js';
import { COLORS } from '../materials/rosa3d.js';

/** Grubość ścianki modułów (zgodna z modułami z biblioteki). */
export const WALL = 1.6;
/** Głębokość rzędu sztućców stołowych: nóż stołowy ma typowo 22–24 cm. */
export const KNIFE = 245;

export type ZoneId = 'cutlery' | 'short' | 'utensils' | 'plates' | 'bowls' | 'pots' | 'lids' | 'spices' | 'pantry' | 'foil' | 'small';
export const ZONES: Record<ZoneId, { name: string; color: string }> = {
  cutlery: { name: 'Sztućce', color: COLORS[0] },
  short: { name: 'Łyżeczki i deserowe', color: COLORS[0] },
  utensils: { name: 'Przybory', color: COLORS[1] },
  plates: { name: 'Talerze', color: COLORS[2] },
  spices: { name: 'Przyprawy', color: COLORS[3] },
  small: { name: 'Drobiazgi', color: COLORS[4] },
  pantry: { name: 'Zapasy', color: COLORS[5] },
  bowls: { name: 'Miski i kubki', color: COLORS[6] },
  foil: { name: 'Folie i torebki', color: COLORS[6] },
  pots: { name: 'Garnki i patelnie', color: COLORS[7] },
  lids: { name: 'Pokrywki', color: COLORS[7] },
};

export interface Dims { W: number; D: number; H: number }

/* ---------- drzewo stref ---------- */
interface BoxOpts {
  /** Docelowy rozmiar przegródki [szerokość, głębokość] w mm (wnętrze). Brak głębokości = jeden rząd. */
  cell?: [number, number?];
  /** Stała liczba przegródek w poziomie (np. 5 przegródek na sztućce). */
  nx?: number;
  /** Maks. wysokość modułu (mm). Brak = wysokość szuflady minus 3 mm. */
  hMax?: number;
  divPct?: number;
}
interface BoxN extends BoxOpts { t: 'box'; zone: ZoneId; label: string }
interface GapN { t: 'gap'; label: string }
interface Part { node: Node; fix?: number; fr?: number; min?: number; max?: number; opt?: boolean }
interface SplitN { t: 'x' | 'y'; parts: Part[] }
type Node = BoxN | GapN | SplitN;

const box = (zone: ZoneId, label: string, o: BoxOpts = {}): BoxN => ({ t: 'box', zone, label, ...o });
const gap = (label: string): GapN => ({ t: 'gap', label });
const X = (...parts: Part[]): SplitN => ({ t: 'x', parts });
const Y = (...parts: Part[]): SplitN => ({ t: 'y', parts });
const fix = (n: number, node: Node, o: Partial<Part> = {}): Part => ({ fix: n, node, ...o });
const fr = (node: Node, o: Partial<Part> = {}): Part => ({ fr: 1, node, ...o });

/** Szerokość modułu z n przegródkami o szerokości wnętrza `pitch`. */
export const lanesW = (n: number, pitch: number) => Math.round((n * pitch + (n + 1) * WALL) * 10) / 10;
const r1 = (v: number) => Math.round(v * 10) / 10;

/* ---------- podział długości na części ---------- */
/** Dzieli `total` według `parts`. Części `fix` dostają wskazaną wartość, `fr` dzielą resztę
 *  (z ograniczeniami min/max). Gdy brakuje miejsca, najpierw znikają części `opt` od końca.
 *  Wynik zawsze sumuje się do `total`. Część wyrzucona dostaje 0. */
export function alloc(total: number, parts: Part[]): number[] {
  const n = parts.length, keep = parts.map(() => true), minOf = (p: Part) => p.min ?? MINSZ;
  for (;;) {
    let s = 0; parts.forEach((p, i) => { if (keep[i]) s += p.fix != null ? p.fix : minOf(p); });
    if (s <= total + 1e-9) break;
    let k = -1; parts.forEach((p, i) => { if (keep[i] && p.opt) k = i; });
    if (k < 0) break;
    keep[k] = false;
  }
  const act = parts.map((_, i) => i).filter(i => keep[i]), size = new Array<number>(n).fill(0);
  const fixIdx = act.filter(i => parts[i].fix != null), frIdx = act.filter(i => parts[i].fix == null);
  let fixSum = fixIdx.reduce((a, i) => a + parts[i].fix!, 0);
  const frMin = frIdx.reduce((a, i) => a + minOf(parts[i]), 0);
  const scale = fixSum + frMin > total && fixSum > 0 ? Math.max(0.01, (total - frMin) / fixSum) : 1;
  fixIdx.forEach(i => { size[i] = parts[i].fix! * scale; });
  fixSum *= scale;
  let R = total - fixSum, free = frIdx.slice();
  while (free.length) {
    const wsum = free.reduce((a, i) => a + (parts[i].fr ?? 1), 0);
    let hit = -1, val = 0;
    for (const i of free) {
      const p = parts[i], v = R * (p.fr ?? 1) / wsum;
      if (v < minOf(p) - 1e-9) { hit = i; val = minOf(p); break; }
      if (p.max != null && v > p.max + 1e-9) { hit = i; val = p.max; break; }
    }
    if (hit < 0) { free.forEach(i => { size[i] = R * (parts[i].fr ?? 1) / wsum; }); R = 0; free = []; break; }
    size[hit] = val; R -= val; free = free.filter(i => i !== hit);
  }
  // reszta po przekroczeniu limitów max (albo brak części elastycznych): rozdziel proporcjonalnie
  const sum = size.reduce((a, b) => a + b, 0), diff = total - sum;
  if (Math.abs(diff) > 1e-9 && sum > 0) {
    const tg = (frIdx.length ? frIdx : act).filter(i => size[i] > 0), base = tg.reduce((a, i) => a + size[i], 0);
    tg.forEach(i => { size[i] += diff * size[i] / base; });
  }
  return size;
}

/** Krawędzie kolejnych części: sumują się do `total` co do 0,1 mm, bez szczelin i nakładek. */
function edges(total: number, sizes: number[]): number[] {
  const last = sizes.reduce((a, s, i) => (s > 0 ? i : a), -1), out: number[] = [];
  let cum = 0;
  sizes.forEach((s, i) => { cum += s; out.push(i === last ? total : r1(cum)); });
  return out;
}

/* ---------- liczba przegródek i cięcie do rozmiaru stołu ---------- */
interface Piece { pos: number; size: number; n: number }
/** Dzieli odcinek `len` na moduły ≤ cap z przegródkami: albo `nExplicit` przegródek łącznie,
 *  albo tyle, ile mieści się przy docelowym wymiarze `cell` (nigdy mniej niż cell). */
function lanes1D(len: number, cell: number | undefined, nExplicit: number | undefined, cap: number): Piece[] {
  const kmin = Math.max(1, Math.ceil(len / cap - 1e-9));
  const make = (k: number, N: number): Piece[] | null => {
    const ns = Array.from({ length: k }, (_, i) => Math.floor(N / k) + (i < N % k ? 1 : 0));
    if (ns.some(v => v < 1)) return null;
    const sizes = ns.map(v => len * v / N);
    if (sizes.some(s => s > cap + 1e-6)) return null;
    const e = edges(len, sizes); let prev = 0;
    return e.map((x, i) => { const p = { pos: prev, size: r1(x - prev), n: ns[i] }; prev = x; return p; });
  };
  const equal = (): Piece[] => {
    const e = edges(len, Array.from({ length: kmin }, () => len / kmin)); let prev = 0;
    return e.map(x => { const p = { pos: prev, size: r1(x - prev), n: 1 }; prev = x; return p; });
  };
  if (nExplicit == null && cell == null) return equal();
  if (nExplicit != null) {
    for (let k = kmin; k <= nExplicit; k++) { const r = make(k, nExplicit); if (r) return r; }
    return equal();   // za mało przegródek na tyle modułów: po jednej w każdym
  }
  const ub = Math.max(1, Math.floor((len - WALL) / (cell! + WALL)));
  for (let k = kmin; k <= ub; k++) for (let N = ub; N >= k; N--) {
    const r = make(k, N); if (!r) continue;
    const nmin = Math.min(...r.map(p => p.n)), wmin = Math.min(...r.map(p => p.size / p.n - WALL - WALL / p.n));
    if (wmin >= cell! - 1e-6 && nmin >= 1) return r;
  }
  return equal();   // przedmioty większe niż moduł: pojedyncza przegródka w każdym module
}

/** Nie zostawiaj przegródek węższych niż 8 mm (granica poprawności modułu). */
const sane = (len: number, n: number) => { while (n > 1 && (len - (n + 1) * WALL) / n < 8) n--; return Math.min(10, n); };

/* ---------- wynik ---------- */
export interface KitCell {
  x: number; y: number; w: number; d: number;
  zone: ZoneId; label: string; nx: number; ny: number; divPct: number;
  /** Maks. wysokość modułu; brak = auto (wysokość szuflady − 3 mm). */
  hMax: number | null;
}
export interface KitGap { x: number; y: number; w: number; d: number; label: string }
export interface KitResult {
  id: string; ok: boolean; reason?: string;
  cells: KitCell[]; gaps: KitGap[]; notes: string[];
  stats: { modules: number; kinds: number; gapArea: number };
}

interface Placed { node: BoxN | GapN; x: number; y: number; w: number; d: number }
function place(node: Node, x: number, y: number, w: number, d: number, out: Placed[]) {
  if (node.t === 'box' || node.t === 'gap') { out.push({ node, x, y, w, d }); return; }
  const horiz = node.t === 'x', total = horiz ? w : d, sz = alloc(total, node.parts), e = edges(total, sz);
  let prev = 0;
  node.parts.forEach((p, i) => {
    if (sz[i] <= 0) return;
    const a = prev, b = e[i], len = r1(b - a); prev = b;
    if (horiz) place(p.node, r1(x + a), y, len, d, out); else place(p.node, x, r1(y + a), w, len, out);
  });
}

function cellsOf(b: Placed & { node: BoxN }, cap: number): KitCell[] {
  const n = b.node, xs = lanes1D(b.w, n.cell?.[0], n.nx, cap), ys = lanes1D(b.d, n.cell?.[1], undefined, cap);
  // gdy podano wysokość przegródki, a moduł jest jednym rzędem — liczymy rzędy z docelowej głębokości
  const out: KitCell[] = [];
  for (const py of ys) for (const px of xs) {
    const nx = sane(px.size, px.n), ny = sane(py.size, py.n);
    // „{d}” w nazwie = największa średnica (cm), jaka naprawdę mieści się w przegródce
    const inner = Math.min((px.size - (nx + 1) * WALL) / nx, (py.size - (ny + 1) * WALL) / ny);
    out.push({
      x: r1(b.x + px.pos), y: r1(b.y + py.pos), w: px.size, d: py.size, zone: n.zone, label: n.label.replace('{d}', String(Math.floor(inner / 10))),
      nx, ny, divPct: n.divPct ?? 100, hMax: n.hMax ?? null,
    });
  }
  return out;
}

/* ---------- definicje układów ---------- */
export interface KitDef {
  id: string; name: string;
  /** Jedno zdanie do listy. */
  short: string;
  /** Gdzie w kuchni taka szuflada ma sens. */
  where: string;
  /** Uzasadnienie: wymiary przedmiotów, ergonomia, rynek. */
  why: string[];
  /** Minimalne wnętrze szuflady. */
  need: Dims;
  /** Minimalny użyteczny rozmiar stołu drukarki (mm), gdy układ ma rząd, którego nie wolno ciąć (np. sztućce). */
  minCap?: number;
  tree(d: Dims, cap: number): Node;
}

/** Blok sztućców o `L` przegródkach: z przodu rząd stołowy, za nim łyżeczki/deserowe, na końcu drobiazgi. */
function cutleryBlock(D: number, L: number, cap: number): Node {
  const long = box('cutlery', 'Sztućce stołowe', { nx: L, hMax: 45 });
  const shortRow = (d: number) => box('short', d >= 200 ? 'Łyżeczki i deserowe' : 'Łyżeczki', { nx: L, hMax: 45 });
  const small = box('small', 'Drobiazgi', { cell: [58, 40], hMax: 45 });
  const R = r1(D - KNIFE);
  if (R >= 150) {
    // rząd łyżeczek: 200 mm mieści deserowe (17–19 cm); nadmiar idzie na drobiazgi, chyba że to wąski pasek
    const s = R - 200 >= 40 ? 200 : R;
    return s < R ? Y(fr(small), fix(s, shortRow(s)), fix(KNIFE, long)) : Y(fr(shortRow(s)), fix(KNIFE, long));
  }
  if (R >= 40) return Y(fr(small), fix(KNIFE, long));
  // wąski pasek z tyłu: rząd sztućców bierze tyle, ile się da wydrukować, reszta zostaje wolna
  const L1 = Math.min(cap, r1(D));
  return L1 >= D ? long : Y(fr(gap('Wąski pasek z tyłu')), fix(L1, long));
}
/** Liczba przegródek na sztućce: pełna szerokość do 6 przegródek, szerzej — blok 6 przegródek + kolumna obok. */
function cutleryLanes(W: number) { return Math.round((W - WALL) / (60 + WALL)); }

/** Prostokątna siatka dużych, otwartych stref (po jednej przegródce) o rozmiarach ≤ cap. */
function bins(W: number, D: number, cap: number, zone: ZoneId, labels: string[], hMax?: number): Node {
  const kc = Math.max(1, Math.ceil(W / cap - 1e-9)), kr = Math.max(1, Math.ceil(D / cap - 1e-9));
  let i = 0;
  return Y(...Array.from({ length: kr }, () => fr(X(...Array.from({ length: kc }, () => fr(box(zone, labels[i++ % labels.length], { nx: 1, hMax })))))));
}

export const KITS: KitDef[] = [
  {
    id: 'sztucce', name: 'Sztućce', need: { W: 170, D: 270, H: 35 }, minCap: KNIFE,
    short: 'Przegródki na sztućce stołowe, łyżeczki i deserowe, drobiazgi z boku.',
    where: 'Górna, płytka szuflada pod blatem — najlepiej blisko zmywarki i stołu.',
    why: [
      'Nóż stołowy ma typowo 22–24 cm, więc rząd sztućców stołowych ma 245 mm głębokości (wnętrze ok. 241 mm) i mieści się na stole P1S. Tego rzędu nie wolno ciąć — nóż nie przeleży nad ścianką.',
      'Przegródki ok. 55–66 mm: czerpak łyżki stołowej ma ok. 4–4,5 cm, więc łyżki układają się jedna w drugiej. Liczba przegródek (3–6) zależy od szerokości szuflady; gotowe kasetki (np. IKEA UPPDATERA 32 × 50 i 52 × 50 cm) mają stały rozmiar i zostawiają luz.',
      'Najczęściej używane sztućce stołowe leżą z przodu, łyżeczki (13–14 cm) i deserowe (17–19 cm) za nimi — rząd ma 200 mm, a gdy szuflada jest płytsza, zostają same łyżeczki.',
      'Moduły mają 45 mm wysokości: mieszczą stos kilku sztućców, a resztę wysokości szuflady zostawiają wolną.',
    ],
    tree({ W, D }, cap) {
      const L = cutleryLanes(W);
      if (L <= 6) return cutleryBlock(D, Math.max(3, L), cap);
      const Bw = lanesW(6, 58);
      return X(fix(Bw, cutleryBlock(D, 6, cap)), fr(box('small', 'Drobiazgi', { cell: [60, 85], hMax: 45 })));
    },
  },
  {
    id: 'sztucce-przybory', name: 'Sztućce i przybory', need: { W: 440, D: 290, H: 40 }, minCap: KNIFE,
    short: 'Szeroka szuflada: sztućce z jednej strony, niskie korytka na przybory z drugiej.',
    where: 'Górna szuflada w szafce 60 cm i szerszej (wnętrze ok. 490 mm i więcej).',
    why: [
      'Jedna szuflada zamiast dwóch: sztućce (5 przegródek po 58 mm) i przybory kuchenne mieszczą się obok siebie od szerokości wnętrza ok. 440 mm.',
      'Przybory kuchenne (chochle, szpatułki, łyżki do gotowania) mają często 30–38 cm, więcej niż maks. moduł z drukarki. Dlatego leżą w niskich (25 mm) korytkach, które przechodzą przez styk modułów.',
      'Przegródki na przybory mają ok. 100 mm: czerpak chochli ma około 9–10 cm.',
    ],
    tree({ W, D }, cap) {
      return X(fix(lanesW(5, 58), cutleryBlock(D, 5, cap)), fr(box('utensils', 'Przybory kuchenne', { cell: [100], hMax: 25 })));
    },
  },
  {
    id: 'przybory', name: 'Przybory kuchenne', need: { W: 190, D: 300, H: 30 },
    short: 'Niskie korytka na chochle i szpatułki przez całą głębokość, z boku przegródki na drobne przybory.',
    where: 'Szuflada przy płycie grzewczej, blisko blatu roboczego.',
    why: [
      'Chochle, łopatki i wałki mają 30–38 cm, więcej niż moduł z drukarki. Korytka biegną przez całą głębokość szuflady (kilka modułów w jednej linii) i mają 25 mm wysokości, więc przybór leży swobodnie ponad stykiem modułów.',
      'Korytka ok. 95 mm na przybory z dużymi końcówkami (chochle, łopatki), z boku węższe przegródki na krótkie: obieraczka, otwieracz, korkociąg (do 18 cm).',
      'Przybory używane w trakcie gotowania muszą być pod ręką — stąd szuflada przy płycie, nie w dalszej części kuchni.',
    ],
    tree({ W, D }) {
      return X(fr(box('utensils', 'Przybory długie', { cell: [95], hMax: 25 }), { min: 98.5 }),
        fix(lanesW(2, 62), box('utensils', 'Drobne przybory', { cell: [62, 185], hMax: 25 }), { opt: true }));
    },
  },
  {
    id: 'przyprawy', name: 'Przyprawy', need: { W: 110, D: 110, H: 55 },
    short: 'Siatka przegródek na słoiczki stojące albo leżące, w zależności od wysokości szuflady.',
    where: 'Płytka szuflada tuż przy płycie grzewczej lub pod blatem roboczym.',
    why: [
      'Słoiczki i młynki do przypraw mają ok. 4,5–5 cm średnicy i 10–11,5 cm wysokości. Przegródki 54 mm trzymają je pionowo, a szuflada musi mieć co najmniej 120 mm wysokości.',
      'W niższej szufladzie słoiczki leżą: przegródki 54 × 120 mm, etykietą do góry, wieczkiem do przodu.',
      'Z przodu rząd większych przegródek (72 mm) na młynki, sól i cukier w pojemnikach.',
      'Niskie ścianki (28 mm) wystarczą, żeby słoiczki się nie przewracały, i oszczędzają filament.',
    ],
    tree({ D, H }) {
      if (H >= 120) {
        const grid = box('spices', 'Przyprawy stojące', { cell: [54, 54], hMax: 28 });
        return D >= 190 ? Y(fr(grid), fix(80, box('spices', 'Młynki i pojemniki', { cell: [72, 72], hMax: 28 }), { opt: true })) : grid;
      }
      return box('spices', 'Przyprawy leżące', { cell: [54, 120], hMax: 28 });
    },
  },
  {
    id: 'garnki', name: 'Garnki i pokrywki', need: { W: 380, D: 380, H: 110 },
    short: 'Głęboka szuflada: strefy na stosy garnków, a przy wysokiej szufladzie stojaki na pokrywki i patelnie.',
    where: 'Dolna, głęboka szuflada pod płytą grzewczą.',
    why: [
      'Ciężkie, rzadziej przesuwane przedmioty idą na dół szafki: nic nie trzeba dźwigać wyżej niż do pasa.',
      'Moduł z drukarki ma najwyżej ok. 25 cm, więc strefa na stos garnków mieści garnek do ok. 23–24 cm średnicy — nazwa każdej strefy podaje, jaka średnica naprawdę się zmieści. Ścianki mają tylko 40 mm: trzymają stos w miejscu, a uchwyty i rączki rondli przechodzą nad nimi.',
      'Gdy szuflada ma co najmniej 250 mm wysokości (i 450 mm głębokości), pokrywki i patelnie stoją pionowo z przodu, jak w organizerach Joseph Joseph DrawerStore (7 przegródek na 30–56 cm): przegródki 45 mm na pokrywki i 60 mm na patelnie, 245 mm długości i 60 mm wysokości — pokrywka do 28 cm stoi na dnie, a nie na ściankach.',
    ],
    tree({ W, D, H }, cap) {
      if (H >= 250 && W >= 430 && D >= 450 && cap >= KNIFE) {
        const dmax = Math.min(28, Math.floor((H - 5) / 10));
        const racks = X(
          fix(lanesW(5, 45), box('lids', `Pokrywki ⌀ do ${dmax} cm`, { nx: 5, hMax: 60 })),
          fix(lanesW(3, 60), box('pots', `Patelnie ⌀ do ${dmax} cm`, { nx: 3, hMax: 60 })),
          fr(box('small', 'Akcesoria', { cell: [60, 60], hMax: 40 }), { opt: true, min: 60 }),
        );
        return Y(fr(bins(W, D - KNIFE, cap, 'pots', ['Garnki ⌀ do {d} cm', 'Rondle ⌀ do {d} cm', 'Durszlaki i miski ⌀ do {d} cm'], 40)), fix(KNIFE, racks));
      }
      return bins(W, D, cap, 'pots', ['Garnki ⌀ do {d} cm', 'Rondle ⌀ do {d} cm', 'Patelnie ⌀ do {d} cm', 'Pokrywki (stos) ⌀ do {d} cm'], 40);
    },
  },
  {
    id: 'talerze', name: 'Talerze i miski', need: { W: 400, D: 400, H: 70 },
    short: 'Talerze na stojaku (przy wysokiej szufladzie) albo w strefie na stos, do tego miski i kubki.',
    where: 'Środkowa lub dolna szuflada, blisko zmywarki.',
    why: [
      'Talerz obiadowy ma 25–28 cm średnicy, deserowy ok. 19–21 cm. Stos talerzy 27 cm potrzebuje strefy ok. 29 × 29 cm, a moduł na stół 256 mm ma najwyżej ok. 25 cm — dlatego przy P1S ta strefa zostaje wolna (podłóż matę antypoślizgową), a przy większym stole jest niskim modułem.',
      'Talerz stojący na krawędzi potrzebuje szuflady wyższej niż jego średnica: stojak pojawia się dopiero od 275 mm wysokości. Przegródki 30 mm (deserowe 26 mm) mieszczą profil talerza, mają 245 mm długości i 60 mm wysokości, więc talerz 27 cm stoi na dnie, a nie na ściankach.',
      'Miski i kubki dostają osobne strefy, żeby nie stać na talerzach. Przegródka na kubek ma 95 × 125 mm — mieści kubek z uchem. Nazwa strefy na miski podaje, jaka średnica naprawdę się zmieści.',
      'Talerze z przodu — najczęściej wyjmowane i najcięższe, więc nie trzeba ich przenosić nad innymi rzeczami.',
    ],
    tree({ W, D, H }, cap) {
      const mugs = (o: Partial<Part> = {}) => fr(box('bowls', 'Kubki i szklanki', { cell: [95, 125], hMax: 70 }), o);
      if (H >= 275 && cap >= KNIFE) {
        const racks = X(
          fix(lanesW(7, 30), box('plates', 'Talerze obiadowe', { nx: 7, hMax: 60 })),
          fix(lanesW(6, 26), box('plates', 'Talerze deserowe', { nx: 6, hMax: 60 }), { opt: true }),
          mugs({ opt: true, min: 98.5 }),   // 95 mm wnętrza + 2 ścianki
          fix(lanesW(4, 34), box('plates', 'Talerze głębokie', { nx: 4, hMax: 60 }), { opt: true }),
        );
        return Y(fr(X(fr(box('bowls', 'Miski ⌀ do {d} cm', { cell: [150, 150], hMax: 70 })), mugs())), fix(KNIFE, racks));
      }
      const plateZone: Node = cap >= 290 ? box('plates', 'Talerze obiadowe (stos)', { nx: 1, hMax: 35 }) : gap('Talerze obiadowe — stos ⌀ 27 cm, bez modułu');
      return X(
        fix(290, Y(fr(box('bowls', 'Miski ⌀ do {d} cm', { cell: [170, 170], hMax: 80 })), fix(290, plateZone))),
        mugs(),
      );
    },
  },
  {
    id: 'zapasy', name: 'Zapasy: puszki i słoiki', need: { W: 250, D: 250, H: 115 },
    short: 'Komórki na puszki i słoiki, każda sztuka w osobnej przegródce.',
    where: 'Szuflada w strefie zapasów, blisko lodówki i blatu.',
    why: [
      'Puszka 400 g ma ok. 7,3 cm średnicy i 11 cm wysokości, słoik 0,4–0,72 l ok. 8–9 cm średnicy. Komórki 80 i 95 mm trzymają je pionowo bez luzu.',
      'W szufladzie widać wszystko z góry, więc nic nie ginie w głębi szafki. Przegródki zapobiegają przewracaniu się puszek przy otwieraniu.',
      'Puszki (cięższe, częściej używane) z przodu, słoiki za nimi.',
    ],
    tree() {
      return Y(fr(box('pantry', 'Słoiki ⌀ do 9 cm', { cell: [95, 95], hMax: 60 })), fr(box('pantry', 'Puszki i konserwy', { cell: [80, 80], hMax: 60 })));
    },
  },
  {
    id: 'folie', name: 'Folie, papier i torebki', need: { W: 400, D: 400, H: 40 },
    short: 'Długie korytka na rolki folii i papieru do pieczenia, obok przegródki na torebki.',
    where: 'Płytka szuflada przy blacie roboczym.',
    why: [
      'Pudełko folii aluminiowej, spożywczej albo papieru do pieczenia ma ok. 30–45 cm długości i 5–6 cm przekroju. Dlatego cztery korytka 64 mm biegną przez całą głębokość szuflady (kilka niskich modułów w rzędzie).',
      'Niskie (22 mm) ścianki: pudełka leżą swobodnie ponad stykiem modułów, a ostrze obcinarki nie zahacza.',
      'Obok miejsce na rolki worków, torebki strunowe i drobiazgi.',
    ],
    tree({ W }) {
      return X(
        fix(lanesW(4, 64), box('foil', 'Folie i papier do pieczenia', { nx: 4, hMax: 22 })),
        fr(Y(fr(box('foil', 'Torebki i worki', { cell: [150, 190], hMax: 30 })), fix(110, box('small', 'Drobiazgi', { cell: [60, 100], hMax: 30 }), { opt: true }))),
      );
    },
  },
  {
    id: 'drobiazgi', name: 'Drobiazgi uniwersalne', need: { W: 200, D: 200, H: 35 },
    short: 'Szuflada na wszystko: baterie, zapałki, taśmy, nożyczki, długopisy.',
    where: 'Dowolna płytka szuflada — w każdej kuchni jest taka jedna.',
    why: [
      'Trzy rozmiary przegródek: małe (60 mm) na baterie, zapałki i świeczki, średnie (100 mm) na taśmy, klej i notes, długie korytka na nożyczki, długopisy i szczypce.',
      'Małe rzeczy z tyłu (rzadziej potrzebne), długie z przodu.',
    ],
    tree() {
      // w płytkiej szufladzie najpierw znikają średnie, potem małe przegródki — korytko na nożyczki (20 cm) zostaje
      return Y(
        fix(70, box('small', 'Baterie, zapałki, świeczki', { cell: [60, 62], hMax: 35 }), { opt: true }),
        fix(110, box('small', 'Taśmy, klej, notes', { cell: [100, 100], hMax: 35 }), { opt: true }),
        fr(box('small', 'Nożyczki, długopisy, szczypce', { cell: [48], hMax: 30 }), { min: 205 }),
      );
    },
  },
];

export const getKit = (id: string): KitDef | undefined => KITS.find(k => k.id === id);

/** Buduje układ dla szuflady `dim` i stołu drukarki `bed` (mm). */
export function buildKit(def: KitDef, dim: Dims, bed: number): KitResult {
  const fail = (reason: string): KitResult => ({ id: def.id, ok: false, reason, cells: [], gaps: [], notes: [], stats: { modules: 0, kinds: 0, gapArea: 0 } });
  const W = r1(dim.W), D = r1(dim.D), H = dim.H, n = def.need;
  if (W < n.W) return fail(`Za wąska szuflada: potrzeba co najmniej ${n.W} mm szerokości (jest ${W}).`);
  if (D < n.D) return fail(`Za płytka szuflada: potrzeba co najmniej ${n.D} mm głębokości (jest ${D}).`);
  if (H < n.H) return fail(`Za niska szuflada: potrzeba co najmniej ${n.H} mm wysokości (jest ${H}).`);
  const cap = Math.max(60, Math.floor(bed - 6));
  if (def.minCap && cap < def.minCap) return fail(`Za mały stół drukarki: ten układ ma rząd ${def.minCap} mm, którego nie można podzielić (potrzeba stołu co najmniej ${def.minCap + 6} mm).`);
  const placed: Placed[] = []; place(def.tree({ W, D, H }, cap), 0, 0, W, D, placed);
  const cells: KitCell[] = [], gaps: KitGap[] = [];
  for (const p of placed) {
    if (p.node.t === 'gap') gaps.push({ x: p.x, y: p.y, w: p.w, d: p.d, label: p.node.label });
    else cells.push(...cellsOf(p as Placed & { node: BoxN }, cap));
  }
  // rodzaje liczone co do 1 mm: kafelkowanie co do 0,1 mm daje moduły różniące się o ułamki
  const kinds = new Set(cells.map(c => [c.zone, c.label, Math.round(c.w), Math.round(c.d), c.nx, c.ny, c.divPct, c.hMax].join('|'))).size;
  const gapArea = gaps.reduce((a, g) => a + g.w * g.d, 0), notes: string[] = [];
  if (gaps.length) notes.push(`Wolne miejsce bez modułu: ${gaps.map(g => `${g.label} (${g.w} × ${g.d} mm)`).join('; ')}.`);
  if (cells.some(c => c.hMax != null && c.hMax < H - 3)) notes.push('Część modułów jest niższa niż szuflada — to celowe: oszczędza filament i nie przeszkadza długim przedmiotom.');
  return { id: def.id, ok: true, cells, gaps, notes, stats: { modules: cells.length, kinds, gapArea } };
}
