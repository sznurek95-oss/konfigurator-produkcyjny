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

**Aktualizacje:** po uruchomieniu aplikacja sprawdza zakładkę Releases. Gdy jest nowsza wersja,
pokazuje pasek „Dostępna wersja …” z przyciskiem **Zainstaluj teraz** — pobiera, instaluje i uruchamia się
ponownie. Numer wersji w nagłówku (np. `v0.3.5`) sprawdza na żądanie. Instalatory są podpisane kluczem
z sekretów repozytorium `TAURI_SIGNING_PRIVATE_KEY` i `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; klucz
publiczny jest w `src-tauri/tauri.conf.json`. Bez sekretów instalator się buduje, ale nie trafia do aktualizacji.

Kod części na PC: `src-tauri/` (Tauri 2, Rust). Okno pokazuje `dist/app/index.html`.
Ikonę rysuje `tools/ikona.py`.

## Numer zamówienia w nazwie pliku

Pole **Nr zamówienia** w nagłówku: wpisany numer trafia na początek nazwy każdego pliku do druku
(STL, 3MF, ZIP, PDF i projekt wysyłany do Bambu Studio), np. `4471_organizer_400x480.3mf`.
Puste pole = nazwy jak dotąd. Zapisy układów (.json) i zdjęcia z trybu prezentacji go nie dostają.

## Gotowe układy szuflad kuchennych

Przycisk **Gotowe układy** liczy układ dla wymiarów aktualnej szuflady i stołu drukarki (Ustawienia → stół):
sztućce, sztućce + przybory, przybory, przyprawy, garnki i pokrywki, talerze i miski, zapasy, folie i torebki,
drobiazgi. Moduły zawsze wypełniają szufladę w 100% (co do 0,1 mm), a liczba i szerokość przegródek wynika z wymiarów
przedmiotów (nóż 24,5 cm, czerpak łyżki 5–6 cm, słoiczek przypraw 5,4 cm, puszka 8 cm, talerz ⌀ 27 cm…).
Moduły są dzielone na kawałki mieszczące się na stole; długie przedmioty leżą w niskich korytkach przechodzących przez styk.
Układ, który się nie mieści (za wąska, płytka albo niska szuflada), jest szary z powodem. Obszar, którego nie da się
wydrukować jako moduł (stos talerzy ⌀ 27 cm przy stole 256 mm), zostaje oznaczony jako „wolne miejsce”.
Silnik: `src/layout/gotowe.ts`, testy: `tests/uklady.test.js` (szczelne pokrycie na siatce wymiarów i na losowych szufladach).

## Produkcja: płyty, czas z Bambu Studio, numery pozycji, PDF dla klienta

- **Plan płyt druku** (karta „Do wydruku”): moduły zamówienia rozkładane na płyty stołu (`settings.bed`, margines 3 mm,
  odstęp 4 mm), osobno dla każdego koloru (albo razem — opcja AMS). Każda płyta to osobny 3MF z modułami ułożonymi
  według planu; otwierasz je w Bambu Studio po kolei albo pobierasz wszystkie w ZIP. Plan dzienny według godzin druku.
  Silnik: `src/layout/plyty.ts`. Bambu Studio tworzy płyty z 3MF tylko razem z pełnymi ustawieniami projektu
  (nakładałoby je na profile użytkownika), dlatego płyty są osobnymi plikami.
- **Czas i filament z Bambu Studio:** po pocięciu płyty „Eksportuj pocięty plik płyty” (.gcode.3mf) i wczytaj go w planie.
  Odczyt `Metadata/slice_info.config` (`src/export/bambu.ts`, rozpakowanie `src/export/unzip.ts`). Szacunek
  kalibruje się na wczytanych płytach (mediana z ostatnich 12), a przy komplecie płyt koszt liczony jest z dokładnych wartości.
- **Numery pozycji** (A1, A2…: litera = rząd od tyłu szuflady, cyfra = kolejny od lewej): na planie, w instrukcji PDF
  i wytłoczone w dnie modułu (czcionka bez styków po skosie — bryła szczelna). Z numerami każdy egzemplarz to osobny plik/obiekt.
- **Projekt do akceptacji (PDF):** zdjęcie z trybu prezentacji (`PresApi.photo`), wymiary, numery pozycji, kolory,
  cena, termin, uwagi; na drugiej stronie plan ułożenia.

## Tryb prezentacji (zdjęcia do sklepu) — moduł wydzielony

Realistyczne zdjęcia produktowe robi osobny moduł `src/prezentacja/` (scena, światło, materiały, panel).
Z resztą konfiguratora łączy go tylko kontrakt `src/editor/prezentacja-kontrakt.ts`: konfigurator podaje
gotowe bryły i wymiary, moduł oddaje plik PNG. Dzięki temu wygląd zdjęć może dopracowywać ktoś inny
(także inny model AI) bez ryzyka dla edytora, modeli i plików do druku.

- Zlecenie i zasady: `docs/prezentacja/ZADANIE.md` (skrót dla agentów AI: `AGENTS.md` / `CLAUDE.md`).
- Podgląd 19 ujęć „przed / po”: `python3 tools/prezentacja/podglad.py` → `build/prezentacja/porownanie.html`.
- Strażnik strefy: `python3 tools/strefa_prezentacji.py` — także automatycznie przy każdym pull requeście
  (GitHub Actions „Kontrola zmian”: strefa, testy, zdjęcia „przed / po” jako artefakt do pobrania).
- Dodatki three.js r128 dla prezentacji: `src/prezentacja/biblioteki.txt` + plik w `vendor/examples/`.

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
| `src/layout/` | automatyczne wypełnianie obszaru w 100% (`autofill.ts`) i gotowe układy szuflad kuchennych (`gotowe.ts`) |
| `src/materials/` | kolory Rosa3D, gęstości materiałów |
| `src/export/` | STL, 3MF (także dwukolorowy), ZIP, PDF |
| `src/editor/` | interfejs: `app.ts` (szuflada) i `single.ts` (edytor pojedynczego modelu), kontrakt trybu prezentacji |
| `src/prezentacja/` | tryb prezentacji: realistyczne zdjęcia produktowe (moduł wydzielony) |
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
