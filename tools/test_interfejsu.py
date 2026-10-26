#!/usr/bin/env python3
"""Szybki test całego interfejsu nowej wersji: każda funkcja raz, bez błędów strony."""
import os, sys
from playwright.sync_api import sync_playwright
URL = 'file://' + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'konfigurator-offline.html')
steps = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1400, 'height': 950}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    def step(name, fn):
        n = len(errs)
        try: fn(); steps.append((name, len(errs) == n, errs[n:][:1]))
        except Exception as e: steps.append((name, False, [str(e)[:200]]))
    pg.goto(URL)
    step('wymiary szuflady + przykładowy układ', lambda: (pg.fill('#dW', '400'), pg.fill('#dD', '480'), pg.fill('#dH', '70'), pg.click('text=Zapisz wymiary')))
    step('dodanie modułu', lambda: pg.click('[data-act=add] >> nth=0'))
    def edit():
        pg.click('[data-act=edit] >> nth=2'); pg.fill('#tNx', '3'); pg.fill('#tName', 'Kwadrat test'); pg.click('#formTpl button[type=submit]')
    step('edycja modułu', edit)
    def resize():
        g = pg.locator('.it >> nth=3').bounding_box(); pg.mouse.click(g['x'] + g['width'] / 2, g['y'] + g['height'] / 2)
        pg.click('.sp-r'); pg.click('#iFit')
    step('zmiana rozmiaru z boku', resize)
    step('widok 3D', lambda: (pg.click('#tab3d'), pg.wait_for_timeout(800)))
    step('jeden kolor + drugi kolor', lambda: (pg.click('#uniQuick button >> nth=1'), pg.check('#t2On'), pg.wait_for_timeout(400), pg.click('#tab2d')))
    def fill():
        pg.click('#fillBtn'); pg.check('input[name=fArea][value=all]'); pg.fill('[data-q=p4]', '2'); pg.wait_for_timeout(500)
        assert '100%' in pg.inner_text('#fStats'); pg.click('#fApply')
    step('automatyczne wypełnienie 100%', fill)
    def kits():
        pg.click('#kitBtn'); pg.wait_for_timeout(200)
        assert pg.locator('#kitList .kititem').count() == 9
        assert pg.locator('#kitPrev svg').count() == 1
        pg.click('#kitList [data-k=sztucce]'); pg.click('#kitApply'); pg.wait_for_timeout(300)
        assert pg.locator('.it').count() >= 3
        assert 'nachodzi' not in pg.inner_text('body') and 'wystaje' not in pg.inner_text('body')
        pg.click('#kitBtn'); pg.click('#kitList [data-k=przyprawy]'); pg.click('#kitApply'); pg.wait_for_timeout(200)
    step('gotowe układy szuflad', kits)
    def plates():
        import shutil, tempfile, zipfile
        assert pg.locator('#svg .it text').filter(has_text='A1').count() >= 1, 'brak numerów pozycji na planie'
        pg.click('#planBtn'); pg.wait_for_timeout(400)
        n = pg.locator('.plcard').count(); assert n >= 1
        with pg.expect_download() as d: pg.click('#plZip')
        z = zipfile.ZipFile(d.value.path()); assert len(z.namelist()) == n, z.namelist()
        fx = os.path.join(os.path.dirname(URL[7:]), '..', 'tests', 'fixtures', 'zamowienie_plyta-2-z-3_bialy.gcode.3mf')
        tmp = os.path.join(tempfile.mkdtemp(), f'zamowienie_plyta-1-z-{n}_bialy.gcode.3mf'); shutil.copy(fx, tmp)
        pg.set_input_files('#plFile', tmp); pg.wait_for_timeout(500)
        assert pg.locator('.plcard .chip.ok').count() == 1, pg.inner_text('#toast')
        pg.click('#plClose')
    step('plan płyt druku + wczytanie pociętego pliku', plates)
    def accept():
        pg.click('#accBtn'); pg.fill('#acPrice', '199')
        with pg.expect_download(timeout=300000) as d: pg.click('#acGo')
        assert d.value.suggested_filename.endswith('.pdf') and 'akceptacji' in d.value.suggested_filename
        assert open(d.value.path(), 'rb').read(5) == b'%PDF-'
    step('projekt do akceptacji (PDF ze zdjęciem)', accept)
    def lay():
        pg.click('#layoutsBtn'); pg.fill('#lName', 'Test'); pg.click('#formLay button[type=submit]'); pg.click('#lClose')
    step('zapis układu', lay)
    def pdf():
        with pg.expect_download(timeout=60000): pg.click('#pdfBtn')
    step('instrukcja PDF', pdf)
    def stlone():
        with pg.expect_download(): pg.click('[data-act=stl] >> nth=0')
    step('STL jednego modułu', stlone)
    def pres():
        pg.click('#tab3d'); pg.wait_for_timeout(400); pg.click('#presBtn'); pg.wait_for_timeout(3000)
        pg.select_option('#pSize', '1080x1080')
        with pg.expect_download(timeout=300000): pg.click('#pShoot')
        pg.click('#presClose')
    step('tryb prezentacji + zdjęcie', pres)
    step('koszt', lambda: (pg.fill('#cPrice', '90'), pg.wait_for_timeout(100)))
    def hook():
        pg.click('#modelTabs [data-m=wieszak-grzejnik]'); pg.wait_for_timeout(300)
        pg.fill('#sg_D', '22'); pg.fill('#sgQty', '6')
        with pg.expect_download(): pg.click('#sg3mf')
        with pg.expect_download(): pg.click('#sgStl')
        pg.click("#sgTabs [data-v='3d']"); pg.wait_for_timeout(600)
        pg.click('#sgShoot'); pg.wait_for_timeout(2500)  # tryb prezentacji wieszaka
        assert pg.inner_text('#pEnvLbl').lower() == 'grzejnik', pg.inner_text('#pEnvLbl')
        for env, shot in (('chrome', 'top'), ('none', 'detail')):
            pg.select_option('#pDrawer', env); pg.click(f'#pShot [data-v={shot}]'); pg.wait_for_timeout(500)
        pg.select_option('#pSize', '1080x1080')
        with pg.expect_download(timeout=300000) as d: pg.click('#pShoot')
        assert d.value.suggested_filename.startswith('zdjecie_wieszak'), d.value.suggested_filename
        pg.click('#presClose')
        pg.click('#modelTabs [data-m=wklad-szuflada]'); pg.wait_for_timeout(300)
        assert pg.eval_on_selector_all('#svg .it', 'e=>e.length') > 3
    step('wieszak: parametry, 3MF, STL, 3D, zdjęcie, powrót do szuflady', hook)
    pg.reload(); pg.wait_for_timeout(500)
    step('odczyt po odświeżeniu', lambda: None if pg.eval_on_selector_all('#svg .it', 'e=>e.length') > 3 else (_ for _ in ()).throw(Exception('układ nie wczytany')))
    b.close()
ok = True
for name, good, e in steps:
    print(('OK   ' if good else 'BŁĄD ') + name + ('' if good else f' — {e}')); ok = ok and good
sys.exit(0 if ok else 1)
