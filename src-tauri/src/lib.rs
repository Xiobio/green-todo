mod commands;
mod tray_icon;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter,
    Manager,
};

fn create_tray_image(total: u32, completed: u32) -> Image<'static> {
    let buf = tray_icon::render_pet_icon(total, completed);
    Image::new_owned(buf.data, buf.width, buf.height)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window on second instance
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // macOS: hide from Dock, enable shadow for rounded corners
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let _ = window.set_shadow(true);
            }

            // --- Tray icon ---
            let show_hide = MenuItemBuilder::with_id("show_hide", "显示/隐藏").build(app)?;
            let export = MenuItemBuilder::with_id("export", "导出数据...").build(app)?;
            let import = MenuItemBuilder::with_id("import", "导入数据...").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_hide)
                .separator()
                .item(&export)
                .item(&import)
                .separator()
                .item(&quit)
                .build()?;

            let tray_image = create_tray_image(0, 0);
            let _tray = TrayIconBuilder::with_id("main")
                .icon(tray_image)
                .icon_as_template(true)
                .tooltip("Green Todo - ⌥Space")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show_hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.center();
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                        "export" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.emit("trigger-export", ());
                            }
                        }
                        "import" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.emit("trigger-import", ());
                            }
                        }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.center();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // --- Global shortcut ---
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let hotkey = commands::get_hotkey(app.handle().clone());
            let w2 = window.clone();
            use tauri_plugin_global_shortcut::Shortcut;
            let shortcut: Shortcut = hotkey.parse().unwrap_or("Alt+Space".parse().unwrap());
            let result = app.global_shortcut().on_shortcut(
                shortcut,
                move |_app, _shortcut, event| {
                    // Only respond to key DOWN, not release
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if w2.is_visible().unwrap_or(false) {
                            let _ = w2.hide();
                        } else {
                            let _ = w2.center();
                            let _ = w2.show();
                            let _ = w2.set_focus();
                        }
                    }
                },
            );
            if result.is_err() {
                let w3 = window.clone();
                let _ = app.global_shortcut().on_shortcut(
                    "CommandOrControl+Alt+T".parse::<Shortcut>().unwrap(),
                    move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            if w3.is_visible().unwrap_or(false) { let _ = w3.hide(); }
                            else { let _ = w3.center(); let _ = w3.show(); let _ = w3.set_focus(); }
                        }
                    },
                );
            }

            // --- Window events: close = hide ---
            let w4 = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = w4.hide();
                }
            });

            // Show on first launch
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::backup_todos,
            commands::load_todos_backup,
            commands::update_tray_progress,
            commands::preview_pet_state,
            commands::hide_window,
            commands::quit_app,
            commands::toggle_always_on_top,
            commands::get_hotkey,
            commands::set_hotkey,
            commands::export_data,
            commands::import_data,
        ])
        .run(tauri::generate_context!())
        .expect("error running Green Todo");
}
