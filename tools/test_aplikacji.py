#!/usr/bin/env python3
"""Test trybu aplikacji na PC bez Windows: podstawia atrapę Tauri (window.__TAURI__)
i sprawdza, że przyciski zapisują pliki do folderu zleceń i otwierają Bambu Studio.

Użycie: python3 tools/test_aplikacji.py   (po python3 tools/build.py)
"""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'dist', 'app', 'index.html')
MOCK = r"""
window.__calls = [];
window.__TAURI__ = {core: {invoke: async (cmd, args, opts) => {
  const rec = {cmd, opts: opts || null};
  if (args instanceof Uint8Array) rec.bytes = args.length; else rec.args = args || null;
  window.__calls.push(rec);
  if (cmd === 'app_version') return '0.3.4';
  if (cmd === 'update_check') return {version: '0.3.9', current: '0.3.4', notes: 'Nowa funkcja\ndruga linia'};
  if (cmd === 'slicer_status') return {found: true, path: 'C:\\Bambu Studio\\bambu-studio.exe'};
  if (cmd === 'save_job') return 'C:\\Dokumenty\\Konfigurator produkcyjny\\Zlecenia\\2026-01-01\\' + decodeURIComponent(opts.headers['x-name']);
  return null;
}}};
"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1400, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(MOCK)
        pg.goto(URL)
        pg.fill('#dW', '400'); pg.fill('#dD', '480'); pg.fill('#dH', '70'); pg.click('text=Zapisz wymiary')
        pg.wait_for_timeout(300)
        assert pg.is_visible('#jobsBtn'), 'brak przycisku Folder zleceń'
        assert 'folderze zleceń' in pg.inner_text('#slicerBox'), pg.inner_text('#slicerBox')
        pg.click('[data-act=add] >> nth=0'); pg.click('[data-act=add] >> nth=1'); pg.wait_for_timeout(300)
        pg.click('#toSlicer'); pg.wait_for_timeout(400)   # kilka płyt → plan płyt; płytę otwiera się z planu
        assert pg.is_visible('#ovPlan'), 'brak planu płyt po kliknięciu Otwórz w Bambu Studio'
        pg.click('#plGrid [data-pl=open] >> nth=0'); pg.wait_for_timeout(1200); pg.click('#plClose')
        pg.click('#dlAll'); pg.wait_for_timeout(800)
        pg.click('#jobsBtn'); pg.wait_for_timeout(200)
        pg.fill('#orderNo', ' ZAM 1234/A ')  # numer zamówienia: dopisany z przodu, znaki zabronione zamienione
        pg.click('#modelTabs >> text=Wieszak'); pg.wait_for_timeout(400)
        pg.click('#sgBambu'); pg.wait_for_timeout(800)
        pg.wait_for_timeout(2000)  # sprawdzenie aktualizacji 2,5 s po starcie
        assert pg.is_visible('#updBar'), 'brak paska aktualizacji'
        assert 'v0.3.4 → v0.3.9' in pg.inner_text('#appVer'), pg.inner_text('#appVer')
        assert 'Nowa funkcja' in pg.inner_text('#updBar') and 'druga' not in pg.inner_text('#updBar')
        pg.click('#updGo'); pg.wait_for_timeout(200)
        calls = pg.evaluate('window.__calls')
        b.close()
    upd = [c['cmd'] for c in calls if c['cmd'] in ('app_version', 'update_check', 'update_install')]
    calls = [c for c in calls if c['cmd'] not in ('app_version', 'update_check', 'update_install')]
    seq = [c['cmd'] for c in calls]
    want = ['slicer_status', 'save_job', 'open_in_slicer', 'save_job', 'open_jobs_folder', 'save_job', 'open_in_slicer']
    names = [c['opts']['headers']['x-name'] for c in calls if c['cmd'] == 'save_job']
    import re
    ok_names = len(names) == 3 and re.fullmatch(r'plyta-1-z-\d+_[0-9a-z+-]+_organizer_400x480\.3mf', names[0]) is not None \
        and names[1:] == ['organizer_szuflada_400x480.zip', 'ZAM_1234-A_wieszak-na-grzejnik_wieszak-20-20_x4.3mf']
    if not ok_names: print('nazwy:', names)
    if upd != ['app_version', 'update_check', 'update_install']: print('aktualizacje:', upd)
    ok = upd == ['app_version', 'update_check', 'update_install'] and ok_names and seq == want and all(c.get('bytes', 1) > 1000 for c in calls if c['cmd'] == 'save_job') and not errs
    for c in calls: print(' ', c['cmd'], c.get('opts') or '', c.get('bytes', ''))
    print('OK: tryb aplikacji' if ok else f'BŁĄD: {seq} {errs}')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
