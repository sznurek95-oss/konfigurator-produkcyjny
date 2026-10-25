# Konfigurator produkcyjny

Narzędzie do edycji modeli parametrycznych i wysyłania ich do druku na Bambu Lab P1S.

Modele: wkład do szuflady (układanie wielu modułów w szufladzie) i wieszak na grzejnik
(pojedynczy przedmiot drukowany w N sztukach). Przełącza się je zakładkami w nagłówku.

## Aplikacja na PC (Windows)

Instalator buduje się sam po każdej zmianie w gałęzi `main` (GitHub Actions →
zakładka **Releases**, plik `…_x64-setup.exe`). W aplikacji:

- pliki (STL, 3MF, ZIP, PDF) zapisują się w `Dokumenty\Konfigurator produkcyjny\Zlecenia\<data>\`,
  przycisk **Folder zleceń** otwiera ten folder,
- **Otwórz w Bambu Studio** zapisuje projekt w folderze zleceń i od razu otwiera go w slicerze —
  bez pomocnika `Bambu-most.bat`.

Kod części na PC: `src-tauri/` (Tauri 2, Rust). Okno pokazuje `dist/app/index.html`.
Ikonę rysuje `tools/ikona.py`.

## Numer zamówienia w nazwie pliku

Pole **Nr zamówienia** w nagłówku: wpisany numer trafia na początek nazwy każdego pliku do druku
(STL, 3MF, ZIP, PDF i projekt wysyłany do Bambu Studio), np. `4471_organizer_400x480.3mf`.
Puste pole = nazwy jak dotąd. Zapisy układów (.json) i zdjęcia z trybu prezentacji go nie dostają.

## Jak zbudować

Potrzebne: Python 3 i TypeScript (`tsc`).

```
python3 tools/build.py
```

Wynik w `dist/`:

- `konfigurator-offline.html` — jeden plik, działa bez internetu (tego używasz na co dzień),
- `konfigurator.html` — ta sama aplikacja z bibliotekami z internetu,
- `app/index.html` — strona dla aplikacji na PC.

Instalator lokalnie (Windows, Rust + `npm install -g @tauri-apps/cli@2`): `tauri build`.

## Testy

```
node --test tests/*.test.js           # silnik modeli i automatyczne wypełnianie
python3 tools/porownaj_ze_stara.py    # pliki STL/3MF identyczne jak ze starej wersji
python3 tools/test_interfejsu.py      # każda funkcja interfejsu raz, bez błędów
python3 tools/test_aplikacji.py       # tryb aplikacji na PC (atrapa Tauri)
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Trzy skrypty Pythona wymagają Playwright z przeglądarką Chromium.

## Struktura

| Katalog | Co zawiera |
| --- | --- |
| `src/core/` | opis modelu (`defineModel`), rejestr modeli, formatowanie liczb |
| `src/geometry/` | budowa szczelnych brył (`heightMesh`), czcionka do napisów |
| `src/models/` | jeden plik na produkt + lista modeli `index.ts` |
| `src/layout/` | automatyczne wypełnianie obszaru w 100% |
| `src/materials/` | kolory Rosa3D, gęstości materiałów |
| `src/export/` | STL, 3MF (także dwukolorowy), ZIP, PDF |
| `src/editor/` | interfejs: `app.ts` (szuflada, prezentacja) i `single.ts` (edytor pojedynczego modelu) |
| `src/index.html` | wygląd strony (HTML + CSS) |
| `vendor/` | biblioteki Three.js i czcionki do wersji offline |
| `src-tauri/` | aplikacja na PC: folder zleceń, otwieranie Bambu Studio |
| `.github/workflows/` | automatyczne budowanie instalatora |
| `tools/` | budowanie, ikona, testy porównawcze |
| `baseline/` | stara wersja — wzorzec do porównań |

## Jak dodać nowy model

1. Utwórz `src/models/<nazwa>.ts` z `defineModel({...})`. Wzór dla przedmiotu drukowanego
   w sztukach: `wieszak-grzejnik.ts` (`kind: 'single'`).
2. Podaj: `params` (z nich sam buduje się formularz), `presets`, `spec`, `mesh`, `validate`,
   `outline2d` (rysunek profilu) i opcjonalnie `scene3d` (otoczenie w podglądzie 3D).
3. Dopisz jedną linię w `src/models/index.ts`: `import './<nazwa>.js';`.

Edytora nie zmieniasz. Testy w `tests/modele.test.js` same sprawdzą szczelność brył
wszystkich gotowych wariantów nowego modelu.

Do budowania brył:
- `geometry/heightmesh.ts` — pojemniki, ścianki, przegródki (rzut z góry + wysokości),
- `geometry/extrude.ts` — profil 2D (łuki i odcinki o stałej grubości) wyciągnięty na szerokość.
