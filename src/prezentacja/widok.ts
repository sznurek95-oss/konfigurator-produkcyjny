// Tryb prezentacji: wygląd panelu (HTML + CSS). Wstawiany do strony przy starcie konfiguratora.
//
// Wolno korzystać z tokenów kolorów i czcionek konfiguratora (var(--bg), var(--panel), var(--ink),
// var(--muted), var(--line), var(--accent), var(--f-disp)…) i z jego ogólnych klas (.btn, .field, .hint,
// .check, .row) — ale nie wolno ich tu zmieniać. Własne klasy zaczynaj od „pres-”.
//
// Elementy oznaczone [TEST] są używane przez testy konfiguratora (tools/test_interfejsu.py)
// i przez podgląd (tools/prezentacja/podglad.py): muszą zostać, z tymi samymi id i wartościami opcji.

export const PRES_CSS = `
.pres{position:fixed;inset:0;z-index:25;background:var(--bg);display:grid;grid-template-columns:minmax(0,1fr) 300px}
.pres[hidden]{display:none!important}
.pres-stage{position:relative;display:grid;place-items:center;padding:16px;min-width:0;min-height:0;background:repeating-conic-gradient(var(--floor) 0 25%, var(--bg) 0 50%) 0 0/24px 24px}
.pres-frame{position:relative;max-width:100%;max-height:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.pres-host,.pres-host canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.pres-wm{position:absolute;right:3%;bottom:3%;font:600 clamp(10px,2.2vmin,22px) var(--f-disp);pointer-events:none;letter-spacing:.01em}
.pres-busy{position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 70%,transparent);font-weight:600}
.pres-busy[hidden]{display:none}
.pres-panel{background:var(--panel);border-left:1px solid var(--line);padding:16px;display:flex;flex-direction:column;gap:12px;overflow:auto;scrollbar-width:thin}
.pres-panel .field label.check{text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);display:flex;flex-direction:row;align-items:center;gap:8px}
.pres-panel input[type=checkbox]{width:auto;flex:none}
.pres-panel input[type=range]{padding:0;border:0;background:none}
.pres-segs{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.pres-segs button{border:1px solid var(--line);background:var(--inset);border-radius:7px;padding:6px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--muted)}
.pres-segs button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
@media (max-width:800px){.pres{grid-template-columns:1fr;grid-template-rows:55vh auto}.pres-panel{border-left:0;border-top:1px solid var(--line)}}
`;

export const PRES_HTML = `
<div class="pres" id="presOv" hidden><!-- [TEST] -->
  <div class="pres-stage" id="presStage"><div class="pres-frame" id="presFrame"><div class="pres-host" id="presHost"></div><div class="pres-wm" id="presWm"></div></div>
    <div class="pres-busy" id="presBusy" hidden>Renderuję zdjęcie…</div></div>
  <aside class="pres-panel">
    <div class="row" style="justify-content:space-between"><h3 style="margin:0;font:700 18px var(--f-disp)">Tryb prezentacji</h3><button class="btn" id="presClose" type="button">Zamknij</button><!-- [TEST] --></div>
    <p class="hint" style="margin:0">Realistyczny podgląd do zdjęć produktowych. Obracaj myszą, kółkiem przybliżaj, prawym przyciskiem przesuwaj.</p>
    <div class="field"><label>Ujęcie</label><div class="pres-segs" id="pShot"><!-- [TEST] data-v: hero, top, front, detail -->
      <button type="button" data-v="hero">Pod kątem</button><button type="button" data-v="top">Z góry</button><button type="button" data-v="front">Z przodu</button><button type="button" data-v="detail">Detal</button></div></div>
    <div class="field"><label for="pDrawer" id="pEnvLbl">Szuflada</label><!-- [TEST] napis „Grzejnik” dla wieszaka; wartości opcji: patrz PRES_UI w prezentacja.ts -->
      <select id="pDrawer" style="font-family:var(--f-body)"></select></div>
    <div class="field"><label for="pBg">Tło</label><select id="pBg" style="font-family:var(--f-body)"><!-- [TEST] wartości #F4F4F2 i #2A2C2E -->
      <option value="#F4F4F2">Białe studio</option><option value="#DADCDA">Jasnoszare</option><option value="#E9E1D5">Ciepły beż</option><option value="#2A2C2E">Ciemne</option><option value="transparent">Przezroczyste (PNG bez tła)</option></select></div>
    <div class="field"><label for="pLightA">Kierunek światła</label><input id="pLightA" type="range" min="0" max="360" step="1"></div>
    <div class="field"><label for="pLightE">Wysokość światła</label><input id="pLightE" type="range" min="15" max="85" step="1"></div>
    <div class="field"><label>Realizm</label>
      <label class="check"><input type="checkbox" id="pLayers"> Ścieżki warstw druku 3D</label><!-- [TEST] -->
      <label class="check"><input type="checkbox" id="pAO"> Cieniowanie w narożnikach (AO)</label></div><!-- [TEST] -->
    <div class="field"><label for="pSize">Rozmiar zdjęcia</label><select id="pSize" style="font-family:var(--f-body)"><!-- [TEST] musi mieć 1080x1080 -->
      <option value="1080x1080">1080 × 1080 (kwadrat, social media)</option><option value="2000x2000">2000 × 2000 (kwadrat, sklep)</option><option value="1600x1200">1600 × 1200 (4:3)</option><option value="1920x1080">1920 × 1080 (16:9)</option><option value="3000x2000">3000 × 2000 (3:2, druk)</option></select></div>
    <div class="field"><label for="pWm">Napis na zdjęciu (opcjonalnie)</label><input id="pWm" type="text" maxlength="40" placeholder="np. TwojaSzuflada.pl" style="font-family:var(--f-body)"></div>
    <button class="btn pri" id="pShoot" type="button" style="padding:9px 12px">Zrób zdjęcie</button><!-- [TEST] zapisuje PNG „zdjecie_…png” -->
    <p class="hint" style="margin:0" id="pInfo"></p>
  </aside>
</div>
`;
