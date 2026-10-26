// Projekt 3MF dla Bambu Studio: obiekty (także dwuczęściowe — dwa kolory) rozłożone na płytach.
import type { Mesh } from '../core/model.js';
import { xesc } from '../core/format.js';
import { zipParts, type ZipEntry } from './zip.js';

export const nf = (v: number): string => { const r = Math.round(v * 1e4) / 1e4; return (Object.is(r, -0) ? 0 : r).toString(); };

export interface Print3mfObject {
  name: string;
  /** Jedna część albo dwie: dół (kolor 1) i góra (kolor 2). */
  parts: { name: string; mesh: Mesh }[];
  size: { w: number; d: number };
  qty: number;
}

export function model3mfXml(objects: Print3mfObject[], bed: number, title: string): string {
  const gap = 5;
  let objs = '', items = '', oid = 0, x = 0, y = 0, row = 0, plate = 0;
  for (const ob of objects) {
    const meshObj = (mesh: Mesh, name: string) => {
      const P = mesh.pos, idx = new Map<string, number>(), verts: string[][] = [], tris: number[] = [];
      for (let i = 0; i < P.length; i += 3) {
        const k = nf(P[i]) + ' ' + nf(P[i + 1]) + ' ' + nf(P[i + 2]);
        let n = idx.get(k); if (n === undefined) { n = verts.length; idx.set(k, n); verts.push(k.split(' ')); }
        tris.push(n);
      }
      oid++;
      objs += `<object id="${oid}" name="${xesc(name)}" type="model"><mesh><vertices>` +
        verts.map(v => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('') + '</vertices><triangles>';
      for (let i = 0; i < tris.length; i += 3) objs += `<triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>`;
      objs += '</triangles></mesh></object>';
      return oid;
    };
    if (ob.parts.length === 1) meshObj(ob.parts[0].mesh, ob.parts[0].name);
    else {
      const ids = ob.parts.map(p => meshObj(p.mesh, p.name));
      oid++; objs += `<object id="${oid}" name="${xesc(ob.name)}" type="model"><components>${ids.map(i => `<component objectid="${i}"/>`).join('')}</components></object>`;
    }
    for (let q = 0; q < ob.qty; q++) {
      if (x > 0 && x + ob.size.w > bed) { x = 0; y += row + gap; row = 0; }
      if (y > 0 && y + ob.size.d > bed) { plate++; x = 0; y = 0; row = 0; }
      const ox = plate * (bed + 40) + x;
      items += `<item objectid="${oid}" transform="1 0 0 0 1 0 0 0 1 ${nf(ox)} ${nf(y)} 0"/>`;
      x += ob.size.w + gap; row = Math.max(row, ob.size.d);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${xesc(title)}</metadata><metadata name="Application">Konfigurator szuflady</metadata>` +
    `<resources>${objs}</resources><build>${items}</build></model>`;
}

export function threemfEntries(modelXml: string): ZipEntry[] {
  const enc = new TextEncoder();
  return [
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', data: enc.encode(modelXml) }
  ];
}

export function make3mfBlob(objects: Print3mfObject[], bed: number, title: string): Blob {
  return new Blob(zipParts(threemfEntries(model3mfXml(objects, bed, title))) as BlobPart[], { type: 'model/3mf' });
}

/** Część ułożona na płycie: obiekt (indeks w `objects`), lewy przedni narożnik na płycie i obrót o 90°. */
export interface Placement3mf { obj: number; x: number; y: number; rot: boolean }

/** Projekt 3MF jednej płyty: obiekty ustawione dokładnie tam, gdzie wskazał plan płyt (bez automatycznego układania). */
export function model3mfPlacedXml(objects: Print3mfObject[], placements: Placement3mf[], title: string): string {
  let objs = '', items = '', oid = 0;
  const top: number[] = [];
  const meshObj = (mesh: Mesh, name: string) => {
    const P = mesh.pos, idx = new Map<string, number>(), verts: string[][] = [], tris: number[] = [];
    for (let i = 0; i < P.length; i += 3) {
      const k = nf(P[i]) + ' ' + nf(P[i + 1]) + ' ' + nf(P[i + 2]);
      let n = idx.get(k); if (n === undefined) { n = verts.length; idx.set(k, n); verts.push(k.split(' ')); }
      tris.push(n);
    }
    oid++;
    objs += `<object id="${oid}" name="${xesc(name)}" type="model"><mesh><vertices>` +
      verts.map(v => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('') + '</vertices><triangles>';
    for (let i = 0; i < tris.length; i += 3) objs += `<triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>`;
    objs += '</triangles></mesh></object>';
    return oid;
  };
  for (const ob of objects) {
    if (ob.parts.length === 1) top.push(meshObj(ob.parts[0].mesh, ob.parts[0].name));
    else {
      const ids = ob.parts.map(p => meshObj(p.mesh, p.name));
      oid++; objs += `<object id="${oid}" name="${xesc(ob.name)}" type="model"><components>${ids.map(i => `<component objectid="${i}"/>`).join('')}</components></object>`;
      top.push(oid);
    }
  }
  for (const p of placements) {
    const ob = objects[p.obj];
    // obrót o +90° wokół z: (x, y) → (−y, x); bryła zajmuje wtedy x ∈ [−d, 0], więc przesunięcie o d
    items += p.rot ? `<item objectid="${top[p.obj]}" transform="0 1 0 -1 0 0 0 0 1 ${nf(p.x + ob.size.d)} ${nf(p.y)} 0"/>`
      : `<item objectid="${top[p.obj]}" transform="1 0 0 0 1 0 0 0 1 ${nf(p.x)} ${nf(p.y)} 0"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${xesc(title)}</metadata><metadata name="Application">Konfigurator szuflady</metadata>` +
    `<resources>${objs}</resources><build>${items}</build></model>`;
}

export function make3mfPlacedBlob(objects: Print3mfObject[], placements: Placement3mf[], title: string): Blob {
  return new Blob(zipParts(threemfEntries(model3mfPlacedXml(objects, placements, title))) as BlobPart[], { type: 'model/3mf' });
}
