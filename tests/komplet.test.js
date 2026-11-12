// Wysyłka całości do Bambu Studio: jeden 3MF z filamentami (model_settings.config) i części po przekątnej stołu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planPlates } from '../build/js/layout/plyty.js';
import { make3mfAllBlob, model3mfPlacedXml, modelSettingsXml } from '../build/js/export/threemf.js';
import { zipEntries, zipText } from '../build/js/export/unzip.js';

const piece = (id, w, d, group = 'biały') => ({ id, w, d, group, mins: 30, grams: 20 });
// prostopadłościan w × d × 10 od (0,0,0): 12 trójkątów
function box(w, d, h = 10) {
  const v = [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return { pos: new Float32Array(f.flatMap(t => t.flatMap(i => v[i]))) };
}
const obj = (name, w, d, two = false) => ({ name, qty: 1, size: { w, d },
  parts: two ? [{ name: name + ' - dół', mesh: box(w, d) }, { name: name + ' - góra', mesh: box(w, d) }] : [{ name, mesh: box(w, d) }] });

test('plan płyt: dłuższe niż stół, ale mieszczące się po przekątnej, idą na osobną płytę obrócone o 45°', () => {
  const plan = planPlates([piece('dlugi', 300, 40), piece('wysoki', 40, 300), piece('maly', 50, 50), piece('za-duzy', 330, 60)], { bed: 256 });
  assert.deepEqual(plan.tooBig.map(p => p.id), ['za-duzy'], '(330 + 60) / √2 = 275,8 > 254');
  for (const id of ['dlugi', 'wysoki']) {
    const pl = plan.plates.find(p => p.pieces.some(q => q.id === id)), q = pl.pieces[0];
    assert.equal(pl.pieces.length, 1);
    assert.equal(Math.abs(q.ang), 45);
    // narożniki obróconego prostokąta wewnątrz stołu z marginesem 1 mm i z dala od przedniego lewego narożnika
    const cx = q.x + q.pw / 2, cy = q.y + q.pd / 2, r = q.ang * Math.PI / 180;
    const pts = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx, sy]) => [cx + sx*q.w/2*Math.cos(r) - sy*q.d/2*Math.sin(r), cy + sx*q.w/2*Math.sin(r) + sy*q.d/2*Math.cos(r)]);
    for (const [x, y] of pts) assert.ok(x >= 1 - 1e-6 && y >= 1 - 1e-6 && x <= 255 + 1e-6 && y <= 255 + 1e-6, `${id}: narożnik ${x},${y} poza stołem`);
    assert.ok(!pts.some(([x, y]) => x < 18 + 1 && y < 28 + 1), `${id}: narożnik w strefie wyłączonej z przodu po lewej`);
    const long = q.w >= q.d ? [Math.cos(r), Math.sin(r)] : [-Math.sin(r), Math.cos(r)];
    assert.ok(long[0] * long[1] < 0, `${id}: dłuższy bok wzdłuż przekątnej tył-lewo → przód-prawo`);
  }
});

test('3MF: obrót o kąt wokół środka — bryła trafia dokładnie w zadany środek', () => {
  const xml = model3mfPlacedXml([obj('A', 300, 40)], [{ obj: 0, x: 128, y: 128, rot: false, ang: -45 }], 't');
  const m = xml.match(/transform="([^"]+)"/)[1].split(' ').map(Number);
  const tr = ([x, y]) => [x * m[0] + y * m[3] + m[9], x * m[1] + y * m[4] + m[10]];
  const c = tr([150, 20]);
  assert.ok(Math.abs(c[0] - 128) < 1e-3 && Math.abs(c[1] - 128) < 1e-3, `środek ${c}`);
  const a = tr([0, 0]), b = tr([300, 0]);
  assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 300) < 1e-3, 'bez skalowania');
});

test('3MF komplet: filamenty obiektów i części w model_settings.config', async () => {
  const objs = [obj('A1 Sztućce', 100, 200), obj('A2 Przyprawy', 80, 80, true), obj('B1 Drobiazgi', 60, 60)];
  const blob = make3mfAllBlob(objs, [{ obj: 0, x: 0, y: 0, rot: false }, { obj: 1, x: 110, y: 0, rot: true }, { obj: 2, x: 300, y: 0, rot: false }, { obj: 2, x: 370, y: 0, rot: false }],
    [1, [2, 3], 2], 'test');
  const buf = new Uint8Array(await blob.arrayBuffer());
  const names = (await zipEntries(buf)).map(e => e.name);
  assert.ok(names.includes('3D/3dmodel.model') && names.includes('Metadata/model_settings.config'), names.join(', '));
  const model = await zipText(buf, '3D/3dmodel.model'), cfg = await zipText(buf, 'Metadata/model_settings.config');
  assert.equal((model.match(/<item /g) || []).length, 4);
  // obiekt jednoczęściowy: filament na obiekcie; dwuczęściowy: na częściach, id części = id siatek w <components>
  const top = [...model.matchAll(/<item objectid="(\d+)"/g)].map(m => m[1]);
  assert.match(cfg, new RegExp(`<object id="${top[0]}">[\\s\\S]*?<metadata key="extruder" value="1"/>`));
  const comp = model.match(new RegExp(`<object id="${top[1]}"[^>]*><components>(.*?)</components>`))[1];
  const ids = [...comp.matchAll(/objectid="(\d+)"/g)].map(m => m[1]);
  assert.match(cfg, new RegExp(`<part id="${ids[0]}" subtype="normal_part">[\\s\\S]*?value="2"/>`));
  assert.match(cfg, new RegExp(`<part id="${ids[1]}" subtype="normal_part">[\\s\\S]*?value="3"/>`));
  assert.equal((cfg.match(/<object id=/g) || []).length, 3, 'jeden wpis na obiekt, także gdy ma kilka egzemplarzy');
  assert.equal(modelSettingsXml([objs[2]], [5], [[5]], [4]).includes('<metadata key="extruder" value="4"/>'), true);
});
