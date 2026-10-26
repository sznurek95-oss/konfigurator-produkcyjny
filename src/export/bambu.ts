// Wyniki cięcia z Bambu Studio: Metadata/slice_info.config w pliku .gcode.3mf (Eksportuj pocięty plik płyty)
// albo w projekcie .3mf zapisanym po pocięciu. Format jak w BambuStudio src/libslic3r/Format/bbs_3mf.cpp:
//   <plate><metadata key="index" value="1"/> … <metadata key="prediction" value="5025"/>   (s)
//          <metadata key="weight" value="45.67"/>                                           (g)
//          <filament id="1" type="PLA" color="#FFFFFF" used_m="15.04" used_g="44.85" …/></plate>
import { zipText } from './unzip.js';

export interface SliceFilament { id: number; type: string; color: string; usedM: number; usedG: number }
export interface SlicePlate {
  /** Numer płyty w projekcie Bambu Studio (od 1). */
  index: number;
  /** Czas druku (s) i masa filamentu (g) według Bambu Studio. */
  seconds: number;
  grams: number;
  filaments: SliceFilament[];
  /** Nazwy obiektów na płycie. */
  objects: string[];
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null;
};
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Czyta slice_info.config (tekst XML). Bez zależności od DOM — działa też w testach Node. */
export function parseSliceInfo(xml: string): SlicePlate[] {
  const plates: SlicePlate[] = [];
  for (const m of xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const body = m[1], meta = new Map<string, string>();
    for (const t of body.matchAll(/<metadata\b[^>]*>/g)) { const k = attr(t[0], 'key'), v = attr(t[0], 'value'); if (k != null && v != null) meta.set(k, v); }
    const filaments = [...body.matchAll(/<filament\b[^>]*>/g)].map(t => ({
      id: +(attr(t[0], 'id') || 0), type: attr(t[0], 'type') || '', color: (attr(t[0], 'color') || '').toUpperCase(),
      usedM: +(attr(t[0], 'used_m') || 0), usedG: +(attr(t[0], 'used_g') || 0),
    }));
    const objects = [...body.matchAll(/<object\b[^>]*>/g)].map(t => unesc(attr(t[0], 'name') || ''));
    const seconds = +(meta.get('prediction') || 0), w = meta.get('weight');
    const grams = w != null && w !== '' ? +w : filaments.reduce((s, f) => s + f.usedG, 0);
    plates.push({ index: +(meta.get('index') || plates.length + 1), seconds, grams, filaments, objects });
  }
  return plates.filter(p => p.seconds > 0 || p.grams > 0);
}

/** Wyniki cięcia z pliku .3mf / .gcode.3mf albo null, gdy plik nie był pocięty. */
export async function readSliced(buf: Uint8Array): Promise<SlicePlate[] | null> {
  const xml = await zipText(buf, 'Metadata/slice_info.config');
  if (!xml) return null;
  const p = parseSliceInfo(xml);
  return p.length ? p : null;
}

/** Numer płyty z nazwy pliku zapisanej przez konfigurator, np. „…_plyta-2-z-5_…”. */
export function plateFromName(name: string): number | null {
  const m = name.match(/plyta-(\d+)-z-\d+/i); return m ? +m[1] : null;
}
