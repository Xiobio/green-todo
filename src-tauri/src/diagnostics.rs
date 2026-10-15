use std::{fs, io::Write, path::PathBuf, sync::{Mutex, OnceLock}};
use tauri::Manager;

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static LOG_LOCK: Mutex<()> = Mutex::new(());

pub fn record(message: &str) {
    let Some(path) = LOG_PATH.get() else { return; };
    let Ok(_guard) = LOG_LOCK.lock() else { return; };
    if fs::metadata(path).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
        let _ = fs::rename(path, path.with_extension("previous.log"));
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let message: String = message.chars().take(2000).collect();
        let _ = writeln!(file, "{} {message}", chrono::Local::now().to_rfc3339());
    }
}

pub fn initialize(app: &tauri::AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&dir);
        let _ = LOG_PATH.set(dir.join("green-todo.log"));
    }
    record(&format!("startup version={} os={} arch={}", app.package_info().version, std::env::consts::OS, std::env::consts::ARCH));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record(&format!("native panic: {info}"));
        previous(info);
    }));
}
