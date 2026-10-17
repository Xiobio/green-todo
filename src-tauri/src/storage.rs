use std::{fs, io::Write, path::Path, sync::Mutex};

#[derive(Default)]
pub struct StorageLock(pub Mutex<()>);

// A unique temporary file plus replace-on-persist also works when the destination
// already exists on Windows. Never truncate the last good copy before a save.
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("数据目录无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(data).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_directories_and_replaces_existing_backup_on_windows() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new/profile/todos-backup.json");
        atomic_write(&path, b"[1]").unwrap();
        atomic_write(&path, b"[2,3]").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "[2,3]");
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn failed_save_does_not_truncate_existing_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("backup.json");
        atomic_write(&path, b"original").unwrap();
        assert!(atomic_write(&path.join("invalid"), b"new").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    }
}
