# Zadanie: dopracować wygląd zdjęć w trybie prezentacji

Konfigurator produkcyjny ma **tryb prezentacji**: realistyczny render 3D, z którego powstają zdjęcia
produktowe do sklepu internetowego. Fotografowane są dwa produkty:

- **wkład do szuflady**, czyli moduły z PLA ułożone w drewnianej szufladzie;
- **wieszak na grzejnik**, czyli zatrzask z PLA na rurce grzejnika drabinkowego.

Twoje zadanie to sprawić, żeby te zdjęcia wyglądały jak dobre zdjęcia produktowe, a nie jak podgląd z programu 3D.
Nie zmieniasz niczego innego w konfiguratorze.

## 1. Gdzie wolno pracować (strefa)

| Ścieżka | Co tam jest | Zasada |
| --- | --- | --- |
| `src/prezentacja/prezentacja.ts` | scena, światło, materiały, kamera, render, zapis zdjęcia | zmieniaj dowolnie |
| `src/prezentacja/widok.ts` | HTML i CSS panelu trybu prezentacji | zmieniaj dowolnie, poza elementami `[TEST]` |
| `src/prezentacja/biblioteki.txt` | dodatkowe moduły three.js r128 | dopisuj |
| `src/prezentacja/*.ts` | nowe pliki modułu (np. `materialy.ts`, `oswietlenie.ts`) | dodawaj |
| `vendor/examples/**` | pliki dodatków three.js r128 | **tylko nowe pliki** |
| `tools/prezentacja/**` | narzędzie podglądu `podglad.py` | zmieniaj, np. dodaj ujęcia |
| `docs/prezentacja/**` | ta instrukcja, notatki, zdjęcia „po” | zmieniaj; **`przed/` zostaje bez zmian** |

**Wszystko inne jest zamrożone.** Dotyczy to zwłaszcza:

- `src/editor/prezentacja-kontrakt.ts` (kontrakt danych);
- `src/editor/**`, `src/index.html`;
- modeli, eksportu STL/3MF, testów, `tools/*.py`, `src-tauri/**`, `.github/**`.

Sprawdza to automat: `python3 tools/strefa_prezentacji.py`. Ten sam strażnik uruchamia się
w GitHubie przy pull requeście, w wersji pobranej z `main`.

Jeśli uznasz, że bez zmiany poza strefą się nie da, na przykład potrzebujesz więcej danych w kontrakcie,
**nie zmieniaj tego**. Opisz potrzebę w `docs/prezentacja/UWAGI.md`, a właściciel projektu zdecyduje.

## 2. Kontrakt: co dostajesz i co oddajesz

Pełny opis typów jest w `src/editor/prezentacja-kontrakt.ts`. W skrócie:

- `env.layout()` zwraca szufladę: `drawer {w,d,h}` (wnętrze, mm) i `modules[]`. Każdy moduł ma:
  - położenie `x`, `y` i obrót `rot`;
  - wymiary `w`, `d`, `h`;
  - `parts[]`, czyli `THREE.BufferGeometry` z kolorem filamentu. Moduł dwukolorowy ma dwie części: dół i górny pas.
- Układ współrzędnych sceny: x w prawo, y w górę, z do frontu szuflady; jednostka to 1 mm.
- Bryły modułów są gotowe i dokładne, bo z nich powstają pliki do druku. **Nie zmieniaj ich kształtu.**
  Możesz je inaczej oświetlać, cieniować i dodawać efekty w shaderze, np. zaokrąglone krawędzie przez normalne.
- `env.single()` zwraca pojedynczy model:
  - `positions` (trójkąty);
  - `size` i `focus` (punkt do ujęcia „detal”);
  - `cylinders[]`, czyli rurki grzejnika (oś równoległa do z);
  - `color` z nazwą.

  Wieszak drukuje się na boku, więc warstwy narastają wzdłuż osi z.
- `env.savePhoto(nazwa, pngBlob)` zapisuje zdjęcie. Nazwa pliku musi zaczynać się od `zdjecie_` i kończyć na `.png`.
- `env.toast(tekst)` pokazuje komunikat, a `env.closed(subject)` informuje konfigurator, że tryb został zamknięty.
- Moduł eksportuje `mountPresentation(env)`, która zwraca `{open, close, isOpen, photo}`. Konfigurator wywołuje ją raz przy starcie.
- **`photo(subject, opts)` musi dalej działać.** Robi zdjęcie PNG bez otwierania panelu (ujęcie, otoczenie, tło, rozmiar).
  Konfigurator wstawia je do PDF „Projekt do akceptacji” dla klienta, a test interfejsu to sprawdza.
  Twoje ulepszenia wyglądu mają się pojawić także tam.

### Elementy panelu, które muszą zostać (`[TEST]` w `widok.ts`)

Używają ich testy konfiguratora (`tools/test_interfejsu.py`) i podgląd (`tools/prezentacja/podglad.py`).
Wygląd możesz zmienić, ale te id i wartości muszą zostać:

| id | wymaganie |
| --- | --- |
| `#presOv` | panel trybu prezentacji |
| `#presClose` | zamyka panel |
| `#pShoot` | robi zdjęcie i zapisuje PNG `zdjecie_…png` |
| `#pShot` | zawiera przyciski z `data-v` = `hero`, `top`, `front`, `detail` |
| `#pDrawer` | dla szuflady opcje `oak`, `walnut`, `white`, `anthracite`, `none`; dla wieszaka `white`, `anthracite`, `chrome`, `none` |
| `#pEnvLbl` | dla wieszaka napis „Grzejnik” |
| `#pBg` | zawiera wartości `#F4F4F2` (białe studio) i `#2A2C2E` (ciemne) |
| `#pLayers`, `#pAO` | pola wyboru |
| `#pSize` | zawiera opcję `1080x1080` |

Możesz dodawać nowe ustawienia, ujęcia, otoczenia i tła.

## 3. Ograniczenia techniczne

- **three.js r128**, globalnie jako `THREE` (nie przez `import`). Dostępne są:
  - OrbitControls, RoomEnvironment;
  - EffectComposer, RenderPass, ShaderPass, CopyShader;
  - SSAOPass + SSAOShader, SimplexNoise, GammaCorrectionShader.

  Kolejne dodatki z `examples/js` (r128) dodasz tak: skopiuj plik do `vendor/examples/<ścieżka>` i dopisz ścieżkę
  w `src/prezentacja/biblioteki.txt`. Pakiet: `npm pack three@0.128.0`. Uwaga na zależności między dodatkami,
  np. SAOPass potrzebuje SAOShader, DepthLimitedBlurShader i UnpackDepthRGBAShader.
- **Wszystko offline.** Aplikacja to jeden plik HTML w WebView2 (Windows). Nie wolno pobierać niczego
  z internetu w czasie działania: żadnych tekstur, HDRI ani fontów z sieci. Tekstury generuj proceduralnie
  (canvas, szum) albo osadź jako dane w kodzie, w rozsądnym rozmiarze.
- **Rozmiar:** wersja offline (`dist/konfigurator-offline.html`) ma dziś ok. 1,26 MB. Twoje zmiany mogą ją powiększyć
  najwyżej o ok. 1,5 MB.
- **Komputer docelowy:** zwykły PC biurowy, często ze zintegrowaną grafiką.
  - Podgląd ma działać płynnie: render tylko po zmianie, co jest już zrobione.
  - Zdjęcie 2000 × 2000 ma powstać w kilka sekund, maksymalnie ok. 15 s.
  - Wolno renderować w kilku przejściach i akumulować (np. miękkie cienie z wielu próbek światła),
    ale tylko przy robieniu zdjęcia, nie w podglądzie na żywo.
- **Determinizm:** bez `Math.random()`. Losowość tylko z ziarna (`mulberry` z `src/layout/autofill.ts`
  albo własny generator), żeby zdjęcia „przed / po” dało się porównać. Dziś dwa przebiegi `podglad.py`
  dają identyczne piksele. Uwaga: dodatki three.js losują przez `Math.random()` (np. `SSAOPass` przy tworzeniu),
  dlatego `presInit()` podstawia na ten czas generator z ziarnem. Rób tak samo z nowymi dodatkami.
- **Kolory filamentów** to kolory Rosa3D z `src/materials/rosa3d.ts` (`findFil(hex).matte` = seria matowa).
  Kolor na zdjęciu ma odpowiadać szpuli: nie przesycaj i nie przyciemniaj.
- **Panel** używa tokenów kolorów konfiguratora (`var(--panel)`, `var(--ink)`, `var(--accent)`…).
  Konfigurator ma motyw ciemny (domyślny) i jasny, więc panel ma dobrze wyglądać w obu.
  Własne klasy CSS zaczynaj od `pres-`.

## 4. Stan obecny i co jest słabe

Zdjęcia „przed” leżą w `docs/prezentacja/przed/`, 19 ujęć, opisy są w `tools/prezentacja/podglad.py`.
Najsłabsze miejsca, od najważniejszych:

1. **Plastikowy wygląd „z programu 3D”.**
   - Moduły mają idealnie ostre krawędzie i płaskie, równe światło.
   - PLA wygląda jak gładki plastik z lekkimi prążkami.
   - Prawdziwy wydruk ma delikatnie zaokrąglone krawędzie, miękki połysk na bokach (warstwy) i matową górę.
2. **Światło i cienie.**
   - Jedno twarde światło kierunkowe plus słaby fill, bez mapowania tonów (`NoToneMapping`).
   - Cienie są ostre i „schodkowe”, a wnętrze szuflady jest płaskie.
   - W ujęciu z góry (`uklad-dab-gora`) cień całej szuflady wygląda jak przesunięta szara kartka.
   - Brakuje miękkiego światła studyjnego (softbox) i odbić od białego tła.
3. **Drewno szuflady.**
   - Usłojenie na dnie jest rozciągnięte i rozmyte (`uklad-dab-detal`), a deski nie mają obrzeży ani fazek.
   - Uchwyt to prostopadłościan.
   - Szuflada nie wygląda jak mebel: brak prowadnic i grubości frontu z wyraźną krawędzią.
4. **Kadrowanie.**
   - Ujęcie „z przodu” jest płaskie, a „detal” obcina przypadkowo.
   - Brakuje stałych marginesów, które dobrze wyglądają w kwadratowych miniaturach sklepu.
5. **Wieszak.**
   - Biały wieszak na białym grzejniku słabo się odcina.
   - Rurki to gładkie walce bez kolektorów; ściana za grzejnikiem to płaska biel z jasnymi pasami.
   - Brakuje cienia kontaktowego wieszaka na rurce.
6. **Ciemne tło i przezroczyste PNG** muszą dalej działać. Przy przezroczystym tle cień ma zostać jako półprzezroczysty.

To są kierunki, nie lista do odhaczenia. Ty decydujesz, co daje największą poprawę.

## 5. Jak pracować

```bash
python3 tools/build.py                       # buduje dist/ (wymaga TypeScript: npm i -g typescript@5)
python3 tools/prezentacja/podglad.py         # 19 zdjęć 1080×1080 do build/prezentacja/po/ + porównanie
python3 tools/prezentacja/podglad.py --tylko wieszak   # szybciej: tylko wybrane ujęcia
# otwórz build/prezentacja/porownanie.html — „przed” obok „po”
```

Podgląd robi zdjęcia tak samo jak użytkownik, przyciskiem „Zrób zdjęcie”. W kontenerze bez karty graficznej
(SwiftShader) jedno zdjęcie trwa 20–60 s; na zwykłym PC to kilka sekund.
Wymagania: Python 3, `pip install playwright pillow numpy`, `python -m playwright install chromium`.

Przed oddaniem pracy wszystko musi przejść:

```bash
python3 tools/strefa_prezentacji.py          # zmiany tylko w strefie
node --test tests/*.test.js                  # silnik konfiguratora
python3 tools/test_interfejsu.py             # każda funkcja interfejsu raz, w tym zdjęcie w trybie prezentacji
python3 tools/porownaj_ze_stara.py           # pliki do druku bajt w bajt jak wcześniej
```

## 6. Kryteria odbioru

- [ ] Wszystkie 19 ujęć z `podglad.py` renderuje się bez błędów strony.
- [ ] Na każdym ujęciu „po” wygląda wyraźnie lepiej niż „przed”, i żadne nie jest gorsze.
- [ ] Kolory modułów i wieszaka odpowiadają filamentom, a warstwy druku są widoczne, ale subtelne.
- [ ] Białe studio daje czyste białe tło, które nadaje się na miniaturę w sklepie.
- [ ] Ciemne tło i PNG z przezroczystym tłem działają.
- [ ] Podgląd na żywo reaguje płynnie: obracanie, zmiana ujęcia, otoczenia i tła.
- [ ] Zdjęcie 2000 × 2000 powstaje w rozsądnym czasie. W notatce podaj czasy z `podglad.py`.
- [ ] Panel czytelny w motywie ciemnym i jasnym, z zachowanymi elementami `[TEST]`.
- [ ] Wszystkie testy z punktu 5 przechodzą, a strażnik strefy pokazuje OK.

## 7. Jak oddać pracę

1. Pracuj na osobnej gałęzi, np. `prezentacja-wyglad`, nigdy bezpośrednio na `main`.
2. Zapisz zdjęcia „po” do `docs/prezentacja/po/`: `python3 tools/prezentacja/podglad.py --po`
   (JPG 900 × 900, te same nazwy co w `przed/`).
   W `docs/prezentacja/UWAGI.md` opisz krótko:
   - co zmieniłeś;
   - czasy renderu;
   - czego nie udało się zrobić i co wymagałoby zmiany kontraktu.
3. Otwórz pull request do `main`. Automat „Kontrola zmian” sprawdzi strefę, uruchomi testy i dołączy
   zdjęcia „przed / po” jako artefakt `zdjecia-prezentacji` do pobrania.
4. Scalenie do `main` robi właściciel projektu. Z `main` automatycznie powstaje nowy instalator,
   a aplikacja zaproponuje aktualizację.
