#!/usr/bin/env python3
"""Bramka etapu 1: nowa wersja musi dawać IDENTYCZNE pliki STL i 3MF jak stara.

Otwiera starą i nową wersję offline w przeglądarce (Playwright), ustawia ten sam układ
w kilku wariantach (napis w dnie, drugi kolor, inny luz, wysokość ręczna) i porównuje
zawartość pobranych plików bajt po bajcie (archiwa ZIP porównywane po rozpakowaniu,
bo nagłówki ZIP zawierają godzinę zapisu).

Użycie: python3 tools/porownaj_ze_stara.py
"""
import io, os, sys, zipfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = 'file://' + os.path.join(ROOT, 'baseline', 'stara-wersja-offline.html')
NEW = 'file://' + os.path.join(ROOT, 'dist', 'konfigurator-offline.html')

SCENARIOS = [
    dict(name='podstawowy 400×480×70', dims=(400, 480, 70)),
    dict(name='nieokrągła szuflada 413×487,5×62', dims=(413, 487.5, 62)),
    dict(name='bez napisu, luz 0,3', dims=(400, 480, 70), label=False, tol=0.3),
    dict(name='drugi kolor 6 mm', dims=(400, 480, 70), tone2=6),
    dict(name='wysokość ręczna 45 mm', dims=(400, 480, 70), hall=45),
]


def run(url, sc):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url)
        w, d, h = sc['dims']
        pg.fill('#dW', str(w)); pg.fill('#dD', str(d)); pg.fill('#dH', str(h)); pg.click('text=Zapisz wymiary')
        pg.fill('#setBed', '220'); pg.press('#setBed', 'Tab')  # stara wersja miała domyślnie 220 mm
        # numery pozycji w dnie (nowa funkcja) zmieniają bryły celowo — bramka sprawdza resztę, więc je wyłącza
        if pg.locator('#setPosNo').count(): pg.uncheck('#setPosNo')
        if sc.get('label') is False: pg.uncheck('#setLabel')
        if 'tol' in sc: pg.fill('#setTol', str(sc['tol'])); pg.press('#setTol', 'Tab')
        if 'hall' in sc: pg.fill('#hAll', str(sc['hall'])); pg.click('#hAllApply')
        if 'tone2' in sc:
            pg.click('#tab3d'); pg.wait_for_timeout(300)
            pg.check('#t2On'); pg.fill('#t2Band', str(sc['tone2'])); pg.wait_for_timeout(200)
            pg.click('#tab2d')
        out = {}
        with pg.expect_download() as dl: pg.click('#dlAll')
        z = zipfile.ZipFile(io.BytesIO(open(dl.value.path(), 'rb').read()))
        for n in z.namelist(): out['stl/' + n] = z.read(n)
        with pg.expect_download() as dl: pg.click('#dl3mf')
        z = zipfile.ZipFile(io.BytesIO(open(dl.value.path(), 'rb').read()))
        for n in z.namelist(): out['3mf/' + n] = z.read(n)
        b.close()
        return out, errs


def main():
    ok = True
    for sc in SCENARIOS:
        a, ea = run(OLD, sc)
        n, en = run(NEW, sc)
        same = a.keys() == n.keys() and all(a[k] == n[k] for k in a)
        size = sum(len(v) for v in a.values())
        print(f"{'OK  ' if same and not en else 'BŁĄD'} {sc['name']}: {len(a)} plików, {size // 1024} KB" + ('' if same else f" — różnice: {[k for k in set(a) | set(n) if a.get(k) != n.get(k)][:5]}") + (f' — błędy strony: {en[:2]}' if en else ''))
        ok = ok and same and not en
    print('BRAMKA ZALICZONA: pliki identyczne' if ok else 'BRAMKA NIEZALICZONA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
