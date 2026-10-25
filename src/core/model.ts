// Silnik modeli: wspólny opis każdego produktu, który da się edytować i wydrukować.
// Edytor nie zna szczegółów geometrii — rozmawia z modelem tylko przez ten interfejs.

export type Rect = [number, number, number, number];           // x0, y0, x1, y1 (mm)
export type HRect = [number, number, number, number, number];  // + wysokość (mm)

export interface Mesh { pos: Float32Array; vol: number }

export interface ParamDef {
  label: string;
  type: 'mm' | 'int' | 'pct' | 'deg' | 'bool';
  min?: number;
  max?: number;
  step?: number;
}

/** Kontekst budowania: to, czego model nie wie sam (szuflada, ustawienia wydruku). */
export interface BuildCtx {
  drawerH: number | null;  // wysokość wnętrza szuflady (dla wysokości „auto”)
  tol: number;             // luz odejmowany od wymiaru zewnętrznego
  label: boolean;          // napis z wymiarem w dnie
}

/** Parametry jednego wariantu modelu (szablonu w bibliotece). */
export interface Variant {
  id: string;
  model?: string;          // brak = model domyślny (wkład do szuflady) — zgodność ze starymi zapisami
  name: string;
  color: string;
  [key: string]: any;
}

export interface Plan2D { cells: Rect[]; cw: number; cd: number }

/** Rysunek 2D modelu (widok z boku / profil) dla edytora pojedynczego modelu. */
export interface Outline2D {
  polys: [number, number][][];                         // obrys bryły (mm)
  guides?: { kind: 'circle'; cx: number; cy: number; r: number; label?: string }[];   // elementy otoczenia, np. rurki grzejnika
  dims?: { x1: number; y1: number; x2: number; y2: number; text: string }[];         // wymiary do opisania
}

export interface ModelDef<S = any> {
  id: string;
  name: string;
  version: number;
  /** 'layout' = wiele elementów układanych w kontenerze (szuflada); 'single' = jeden przedmiot drukowany w N sztukach. */
  kind: 'layout' | 'single';
  /** Krótki opis dla listy modeli. */
  description?: string;
  /** Jak położyć na stole drukarki (podpowiedź w interfejsie). */
  printNote?: string;
  /** Rysunek profilu (tylko modele 'single'). */
  outline2d?(spec: S): Outline2D;
  /** Elementy otoczenia do podglądu 3D, np. rurki grzejnika (tylko modele 'single'). */
  scene3d?(spec: S): { cylinders: { x: number; y: number; r: number; len: number }[] };
  params: Record<string, ParamDef>;
  /** Gotowe warianty dostępne od razu w bibliotece. */
  presets: Variant[];
  /** Uzupełnia brakujące pola wariantu wartościami domyślnymi. */
  withDefaults(v: Partial<Variant>): Variant;
  /** Rozmiar w rzucie z góry (mm), bez obrotu. */
  footprint(v: Variant): { w: number; d: number };
  /** Wysokość wydruku (mm). */
  height(v: Variant, ctx: Pick<BuildCtx, 'drawerH'>): number;
  /** Opis geometrii (wejście dla mesh i plan2d). */
  spec(v: Variant, ctx: BuildCtx): S;
  /** Rzut z góry: komórki / przegródki do rysunku 2D. */
  plan2d(spec: S): Plan2D;
  /** Bryła do eksportu i podglądu; opcjonalnie tylko część poniżej / powyżej z (dwa kolory). */
  mesh(spec: S, clip?: { at: number; part: 'lo' | 'hi' } | null): Mesh;
  /** '' gdy parametry są poprawne, inaczej komunikat po polsku. */
  validate(v: Variant): string;
  /** Poprawia parametry po zmianie rozmiaru (np. zmniejsza liczbę przegródek). */
  normalize(v: Variant): Variant;
  /** Napis z wymiarem (do instrukcji i nazwy pliku). */
  labelText(v: Variant, ctx: Pick<BuildCtx, 'drawerH'>, full: boolean): string;
  /** Wysokość z, od której zaczyna się drugi kolor przy pasie `band` mm od góry; null = nie da się. */
  splitHeight(v: Variant, ctx: Pick<BuildCtx, 'drawerH'>, band: number): number | null;
}

const registry = new Map<string, ModelDef>();
export const DEFAULT_MODEL = 'wklad-szuflada';

export function defineModel<S>(m: ModelDef<S>): ModelDef<S> {
  registry.set(m.id, m);
  return m;
}
export function getModel(id?: string | null): ModelDef {
  const m = registry.get(id || DEFAULT_MODEL);
  if (!m) throw new Error('Nieznany model: ' + id);
  return m;
}
export function listModels(): ModelDef[] {
  return [...registry.values()];
}
