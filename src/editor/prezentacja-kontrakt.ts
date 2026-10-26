// Kontrakt między konfiguratorem a trybem prezentacji (src/prezentacja/).
//
// To jedyne połączenie obu części. Konfigurator dostarcza GOTOWE dane sceny (bryły modułów, wymiary,
// kolory) i odbiera zdjęcie; tryb prezentacji sam buduje scenę, światło, materiały, panel ustawień
// i render. Dzięki temu wygląd zdjęć można dopracowywać bez zaglądania do edytora, eksportu czy modeli.
//
// ZMIANA TEGO PLIKU = zmiana po obu stronach. Prace nad wyglądem zdjęć jej nie wymagają.

/** Kolor filamentu użyty na zdjęciu (do opisu pod zdjęciem). */
export interface PresColor {
  hex: string;
  /** Nazwa Rosa3D albo „własny kolor”. */
  name: string;
  /** true = górny pas w drugim kolorze. */
  band?: boolean;
}

/** Jedna część bryły modułu (moduł dwukolorowy ma dwie: dół i górny pas). */
export interface PresPart {
  /** THREE.BufferGeometry w układzie sceny: x w prawo, y w górę, z do frontu szuflady; mm. */
  geometry: any;
  /** Kolor filamentu (#RRGGBB) — już uwzględnia „jeden kolor dla wszystkich” i drugi kolor. */
  color: string;
}

/** Moduł ułożony w szufladzie. */
export interface PresModule {
  /** Położenie lewego tylnego narożnika w szufladzie (mm, od lewej i od tyłu). */
  x: number;
  y: number;
  /** Obrócony o 90°: bryłę obróć wokół osi y o +90° i przesuń o (0, 0, w). */
  rot: boolean;
  /** Wymiary modułu przed obrotem (mm). */
  w: number;
  d: number;
  /** Wysokość modułu (mm). */
  h: number;
  parts: PresPart[];
}

/** Scena „szuflada”: wymiary wnętrza i ułożone moduły. */
export interface PresLayout {
  drawer: { w: number; d: number; h: number };
  modules: PresModule[];
  colors: PresColor[];
}

/** Scena „pojedynczy model” (np. wieszak na grzejnik). */
export interface PresSingle {
  /** Nazwa modelu (do opisu). */
  name: string;
  /** Rdzeń nazwy pliku zdjęcia, np. „wieszak-20-20”. */
  file: string;
  /** Kolor filamentu (#RRGGBB) i jego nazwa. */
  color: PresColor;
  /** Siatka trójkątów: współrzędne x,y,z kolejnych wierzchołków (mm). Model drukowany na boku — warstwy narastają wzdłuż osi z. */
  positions: Float32Array;
  /** Prostopadłościan otaczający bryłę: x 0…w, y 0…d, z 0…h (mm). */
  size: { w: number; d: number; h: number };
  /** Punkt, na który kieruje się ujęcie „detal” (np. zatrzask), w mm [x, y]. */
  focus: [number, number];
  /** Otoczenie: rurki grzejnika (oś równoległa do z), środek x,y i promień r w mm. */
  cylinders: { x: number; y: number; r: number }[];
}

export type PresSubject = 'layout' | 'single';

/** Co konfigurator daje trybowi prezentacji. */
export interface PresEnv {
  /** Aktualny układ szuflady albo null, gdy nie ma wymiarów lub modułów. */
  layout(): PresLayout | null;
  /** Aktualny pojedynczy model albo null, gdy parametry są błędne. */
  single(): PresSingle | null;
  /** Zapisuje gotowe zdjęcie (w aplikacji na PC: folder zleceń; w przeglądarce: pobieranie). */
  savePhoto(filename: string, png: Blob): Promise<void> | void;
  /** Krótki komunikat na dole ekranu. */
  toast(msg: string): void;
  /** Wywoływane po zamknięciu trybu prezentacji — konfigurator odświeża swój widok. */
  closed(subject: PresSubject): void;
}

/** Ustawienia zdjęcia robionego bez otwierania panelu. */
export interface PresPhotoOpts {
  /** Ujęcie: 'hero' (domyślnie), 'top', 'front', 'detail'. */
  shot?: string;
  /** Otoczenie: szuflada ('oak', 'walnut', 'white', 'anthracite', 'none') albo grzejnik ('white', 'anthracite', 'chrome', 'none'). */
  env?: string;
  /** Tło (#RRGGBB albo 'transparent'), domyślnie białe studio #F4F4F2. */
  bg?: string;
  /** Rozmiar w pikselach, domyślnie 1600 × 1600. */
  w?: number;
  h?: number;
}

/** Co tryb prezentacji daje konfiguratorowi. */
export interface PresApi {
  open(subject: PresSubject): void;
  close(): void;
  isOpen(): boolean;
  /** Zdjęcie PNG bez otwierania panelu (konfigurator używa go w PDF do akceptacji dla klienta).
   *  null = brak danych albo panel jest otwarty. Ustawienia panelu po zdjęciu wracają do poprzednich. */
  photo(subject: PresSubject, opts?: PresPhotoOpts): Promise<Blob | null>;
}
