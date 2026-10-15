fn main() {
    tauri_build::build();
    // tauri-build embeds the Windows application manifest for binaries, but
    // Cargo examples need their own Common Controls v6 activation manifest.
    // Without it the native smoke executable cannot load TaskDialogIndirect.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-arg-examples=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-examples=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
}
