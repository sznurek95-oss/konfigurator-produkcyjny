//! Aplikacja na PC: okno z konfiguratorem (dist/app/index.html) plus trzy rzeczy, których
//! strona w przeglądarce nie potrafi sama:
//!   • zapis plików do folderu zleceń: Dokumenty\Konfigurator produkcyjny\Zlecenia\RRRR-MM-DD\,
//!   • otwarcie projektu w Bambu Studio (bez pomocnika Bambu-most.bat),
//!   • otwarcie folderu zleceń w Eksploratorze.
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

fn jobs_root(app: &AppHandle) -> Result<PathBuf, String> {
    let docs = app.path().document_dir().map_err(|e| format!("brak folderu Dokumenty: {e}"))?;
    Ok(docs.join("Konfigurator produkcyjny").join("Zlecenia"))
}

/// Nazwa pliku bez znaków zabronionych w Windows.
fn clean_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let s = s.trim().trim_matches('.').to_string();
    if s.is_empty() { "plik".into() } else { s }
}

/// Nie nadpisuje: organizer.3mf, organizer_2.3mf, organizer_3.3mf…
fn unique(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let mut n = 2;
    loop {
        let q = dir.join(format!("{stem}_{n}{ext}"));
        if !q.exists() {
            return q;
        }
        n += 1;
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok();
            if let Some(v) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Zapisuje plik w dzisiejszym folderze zleceń. Treść przychodzi jako surowe bajty,
/// nazwa w nagłówku `x-name`. Zwraca pełną ścieżkę zapisanego pliku.
#[tauri::command]
fn save_job(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("brak danych pliku".into());
    };
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| "plik".into());
    let dir = jobs_root(&app)?.join(chrono::Local::now().format("%Y-%m-%d").to_string());
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = unique(&dir, &clean_name(&name));
    std::fs::write(&path, data).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

fn find_bambu() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Ok(v) = std::env::var(var) {
            candidates.push(PathBuf::from(v).join("Bambu Studio").join("bambu-studio.exe"));
        }
    }
    if let Ok(v) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(v).join("Programs").join("Bambu Studio").join("bambu-studio.exe"));
    }
    candidates.into_iter().find(|p| p.is_file()).or_else(from_registry)
}

/// Bambu Studio zainstalowane w innym miejscu — szukamy w liście zainstalowanych programów.
#[cfg(windows)]
fn from_registry() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let roots = [
        (HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];
    for (hive, path) in roots {
        let Ok(key) = RegKey::predef(hive).open_subkey(path) else { continue };
        for sub in key.enum_keys().flatten() {
            let Ok(k) = key.open_subkey(&sub) else { continue };
            let name: String = k.get_value("DisplayName").unwrap_or_default();
            if !name.to_lowercase().contains("bambu studio") {
                continue;
            }
            let loc: String = k.get_value("InstallLocation").unwrap_or_default();
            if !loc.is_empty() {
                let p = PathBuf::from(loc.trim_matches('"')).join("bambu-studio.exe");
                if p.is_file() {
                    return Some(p);
                }
            }
            let icon: String = k.get_value("DisplayIcon").unwrap_or_default();
            let icon = icon.split(',').next().unwrap_or("").trim_matches('"').to_string();
            if icon.to_lowercase().ends_with("bambu-studio.exe") && Path::new(&icon).is_file() {
                return Some(PathBuf::from(icon));
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn from_registry() -> Option<PathBuf> {
    None
}

#[derive(serde::Serialize)]
struct SlicerStatus {
    found: bool,
    path: Option<String>,
}

#[tauri::command]
fn slicer_status() -> SlicerStatus {
    let p = find_bambu();
    SlicerStatus { found: p.is_some(), path: p.map(|p| p.to_string_lossy().into_owned()) }
}

/// Otwiera plik w programie przypisanym w systemie.
fn open_default(p: &Path) -> Result<(), String> {
    #[cfg(windows)]
    let cmd = Command::new("explorer").arg(p).spawn();
    #[cfg(target_os = "macos")]
    let cmd = Command::new("open").arg(p).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = Command::new("xdg-open").arg(p).spawn();
    cmd.map(|_| ()).map_err(|e| e.to_string())
}

/// Otwiera zapisany projekt w Bambu Studio. Tylko pliki z folderu zleceń.
#[tauri::command]
fn open_in_slicer(app: AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.starts_with(jobs_root(&app)?) || !p.is_file() {
        return Err("plik spoza folderu zleceń".into());
    }
    match find_bambu() {
        Some(exe) => Command::new(exe).arg(&p).spawn().map(|_| ()).map_err(|e| e.to_string()),
        None => open_default(&p),
    }
}

#[tauri::command]
fn open_jobs_folder(app: AppHandle) -> Result<(), String> {
    let root = jobs_root(&app)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    open_default(&root)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_job, slicer_status, open_in_slicer, open_jobs_folder])
        .run(tauri::generate_context!())
        .expect("nie udało się uruchomić aplikacji");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nazwy() {
        assert_eq!(clean_name("a/b:c?.3mf"), "a_b_c_.3mf");
        assert_eq!(clean_name("  ..  "), "plik");
        assert_eq!(percent_decode("wieszak%2020%2F20.3mf"), "wieszak 20/20.3mf");
        assert_eq!(percent_decode("organizer_%C5%BC%C3%B3%C5%82ty"), "organizer_żółty");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn bez_nadpisywania() {
        let d = std::env::temp_dir().join(format!("konf-test-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("x.3mf"), b"1").unwrap();
        assert_eq!(unique(&d, "x.3mf"), d.join("x_2.3mf"));
        assert_eq!(unique(&d, "y.3mf"), d.join("y.3mf"));
        std::fs::remove_dir_all(&d).ok();
    }
}
