// Plan płyt druku, odczyt archiwów ZIP/3MF i wyników cięcia z Bambu Studio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPlates, planDays, fmtDur } from '../build/js/layout/plyty.js';
import { zipEntries, zipText } from '../build/js/export/unzip.js';
import { parseSliceInfo, readSliced, plateFromName } from '../build/js/export/bambu.js';
import { zip } from '../build/js/export/zip.js';

const piece = (id, w, d, group = 'biały', mins = 30, grams = 20) => ({ id, w, d, group, mins, grams });

function checkPlan(plan, bed, margin = 3, gap = 4) {
  const solo = pl => pl.pieces.length === 1 && (pl.pieces[0].pw + gap > bed - 2 * margin + gap || pl.pieces[0].pd + gap > bed - 2 * margin + gap);
  for (const pl of plan.plates) {
    const m = solo(pl) ? 1 : margin;
    for (const p of pl.pieces) {
      assert.ok(p.x >= m - 1e-6 && p.y >= m - 1e-6 && p.x + p.pw <= bed - m + 1e-6 && p.y + p.pd <= bed - m + 1e-6, `płyta ${pl.index}: ${p.id} poza polem ${JSON.stringify(p)}`);
      assert.ok(p.rot ? (p.pw === p.d && p.pd === p.w) : (p.pw === p.w && p.pd === p.d));
    }
    for (let i = 0; i < pl.pieces.length; i++) for (let j = i + 1; j < pl.pieces.length; j++) {
      const a = pl.pieces[i], b = pl.pieces[j];
      const sepX = a.x + a.pw + gap <= b.x + 1e-6 || b.x + b.pw + gap <= a.x + 1e-6, sepY = a.y + a.pd + gap <= b.y + 1e-6 || b.y + b.pd + gap <= a.y + 1e-6;
      assert.ok(sepX || sepY, `płyta ${pl.index}: ${a.id} i ${b.id} bliżej niż ${gap} mm`);
    }
    assert.ok(new Set(pl.pieces.map(p => p.group)).size === 1, 'jedna płyta = jedna grupa kolorów');
  }
}

test('plan płyt: każda część dokładnie raz, w polu stołu, z odstępami, kolory osobno', () => {
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 40; n++) {
    const pieces = Array.from({ length: 5 + Math.floor(rnd() * 40) }, (_, i) =>
      piece('p' + i, Math.round(20 + rnd() * 220), Math.round(20 + rnd() * 220), ['biały', 'czarny', 'szary'][Math.floor(rnd() * 3)]));
    const plan = planPlates(pieces, { bed: 256 });
    checkPlan(plan, 256);
    const ids = plan.plates.flatMap(p => p.pieces.map(q => q.id)).concat(plan.tooBig.map(p => p.id)).sort();
    assert.deepEqual(ids, pieces.map(p => p.id).sort());
    assert.deepEqual(plan.plates.map(p => p.index), plan.plates.map((_, i) => i + 1));
  }
});

test('plan płyt: małe moduły mieszczą się gęsto, za duże są wykazane osobno', () => {
  const small = Array.from({ length: 16 }, (_, i) => piece('s' + i, 50, 50));
  assert.equal(planPlates(small, { bed: 256 }).plates.length, 1, '16 modułów 50×50 to jedna płyta 256 mm');
  const many = Array.from({ length: 30 }, (_, i) => piece('m' + i, 100, 100));
  const plan = planPlates(many, { bed: 256 });
  assert.equal(plan.plates.length, 8, '4 moduły 100×100 na płytę (3 nie mieszczą się w rzędzie: 3 × 104 > 254)');
  const big = planPlates([piece('x', 260, 100), piece('y', 100, 100), piece('z', 100, 253)], { bed: 256 });
  assert.deepEqual(big.tooBig.map(p => p.id), ['x'], 'większe niż stół');
  assert.equal(big.plates.length, 2, 'prawie wielkości stołu — osobna płyta');
  checkPlan(big, 256);
  const kit = planPlates([piece('k1', 250, 245), piece('k2', 244.5, 238), piece('k3', 120, 250), piece('k4', 120, 250)], { bed: 256 });
  assert.equal(kit.tooBig.length, 0); checkPlan(kit, 256);
  assert.ok(kit.plates.some(p => p.pieces.length === 2), 'dwa moduły 120×250 na jednej płycie');
  // obrót: 240×60 na stole 256 z marginesem — mieści się tylko w jednej orientacji, ale zawsze
  checkPlan(planPlates([piece('r', 60, 240), piece('q', 60, 240), piece('t', 60, 240)], { bed: 256 }), 256);
});

test('plan płyt: deterministyczny, czas = suma części + narzut na płytę', () => {
  const ps = Array.from({ length: 12 }, (_, i) => piece('p' + i, 40 + i * 7, 60 + (i % 3) * 30, i % 2 ? 'a' : 'b', 10 + i, 5 + i));
  const a = planPlates(ps, { bed: 256, overheadMin: 6 }), b = planPlates(ps, { bed: 256, overheadMin: 6 });
  assert.deepEqual(a, b);
  for (const pl of a.plates) {
    assert.equal(pl.mins, pl.pieces.reduce((s, p) => s + p.mins, 0) + 6);
    assert.ok(pl.fill > 0 && pl.fill <= 1);
  }
});

test('plan dzienny i zapis czasu', () => {
  assert.deepEqual(planDays([300, 300, 300, 200], 16), [[0, 1, 2], [3]]);
  assert.deepEqual(planDays([1200, 60], 16), [[0], [1]]);
  assert.deepEqual(planDays([], 16), []);
  assert.equal(fmtDur(125), '2 h 05 min'); assert.equal(fmtDur(45), '45 min');
});

test('odczyt ZIP: pliki zapisane konfiguratorem i skompresowane (deflate) z Bambu Studio', async () => {
  const blob = zip([{ name: 'a.txt', data: new TextEncoder().encode('zażółć') }, { name: 'b/c.stl', data: new Uint8Array([1, 2, 3]) }]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(zipEntries(buf).map(e => e.name), ['a.txt', 'b/c.stl']);
  assert.equal(await zipText(buf, 'A.TXT'), 'zażółć');
  const fx = new Uint8Array(readFileSync(new URL('./fixtures/zamowienie_plyta-2-z-3_bialy.gcode.3mf', import.meta.url)));
  assert.ok(zipEntries(fx).some(e => e.method === 8));
  assert.match(await zipText(fx, 'Metadata/plate_1.gcode'), /^;gcode/);
  assert.throws(() => zipEntries(new Uint8Array(100)), /ZIP/);
});

test('wyniki cięcia Bambu Studio: czas, masa, filamenty, obiekty, numer płyty z nazwy', async () => {
  const fx = new Uint8Array(readFileSync(new URL('./fixtures/zamowienie_plyta-2-z-3_bialy.gcode.3mf', import.meta.url)));
  const p = await readSliced(fx);
  assert.equal(p.length, 1);
  assert.equal(p[0].index, 1); assert.equal(p[0].seconds, 9015); assert.equal(p[0].grams, 112.48);
  assert.deepEqual(p[0].filaments, [{ id: 1, type: 'PLA', color: '#F4F4F2', usedM: 37.71, usedG: 112.48 }]);
  assert.deepEqual(p[0].objects, ['A1 Pojemnik S', 'A2 Kwadrat 4-dzielny & co']);
  assert.equal(plateFromName('zamowienie_plyta-2-z-3_bialy.gcode.3mf'), 2);
  assert.equal(plateFromName('cokolwiek.3mf'), null);
  // projekt wielopłytowy; płyta bez cięcia (prediction 0) pomijana; brak „weight” = suma filamentów
  const xml = '<config><plate><metadata key="index" value="1"/><metadata key="prediction" value="60"/><metadata key="weight" value="2.5"/></plate>' +
    '<plate><metadata key="index" value="2"/><metadata key="prediction" value="0"/></plate>' +
    '<plate><metadata key="index" value="3"/><metadata key="prediction" value="120"/><filament id="1" type="PLA" color="#000000" used_m="1" used_g="3"/><filament id="2" type="PLA" color="#ffffff" used_m="1" used_g="4"/></plate></config>';
  const pp = parseSliceInfo(xml);
  assert.deepEqual(pp.map(x => [x.index, x.seconds, x.grams]), [[1, 60, 2.5], [3, 120, 7]]);
  // plik bez wyników cięcia
  const plain = new Uint8Array(await zip([{ name: '3D/3dmodel.model', data: new TextEncoder().encode('<model/>') }]).arrayBuffer());
  assert.equal(await readSliced(plain), null);
});
