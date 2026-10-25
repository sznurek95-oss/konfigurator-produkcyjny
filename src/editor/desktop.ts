// Most do aplikacji na PC (Tauri). W przeglądarce `desktop.on` jest false i nic się nie zmienia.
// W aplikacji pliki trafiają do folderu zleceń (Dokumenty\Konfigurator produkcyjny\Zlecenia\<data>),
// a „Otwórz w Bambu Studio” uruchamia slicer bez pomocnika Bambu-most.bat.
const T: any = (window as any).__TAURI__;
const invoke = (cmd: string, args?: any, opts?: any) => T.core.invoke(cmd, args, opts);

export const desktop = {
  on: !!(T && T.core && T.core.invoke),
  slicer: false,
  /** Sprawdza, czy Bambu Studio jest zainstalowane. */
  async status(): Promise<boolean> {
    const s = await invoke('slicer_status');
    desktop.slicer = !!(s && s.found);
    return desktop.slicer;
  },
  /** Zapisuje plik w folderze zleceń, zwraca pełną ścieżkę. */
  async save(name: string, blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return invoke('save_job', bytes, { headers: { 'x-name': encodeURIComponent(name) } });
  },
  /** Otwiera zapisany plik w Bambu Studio (albo w programie przypisanym do pliku). */
  async open(path: string): Promise<void> { await invoke('open_in_slicer', { path }); },
  async openFolder(): Promise<void> { await invoke('open_jobs_folder'); },
};
