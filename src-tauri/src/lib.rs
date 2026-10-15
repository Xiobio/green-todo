mod commands;
mod tray_icon;
mod hotkey;
mod storage;
mod diagnostics;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter,
    Manager,
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

fn create_tray_image(total: u32, completed: u32) -> Image<'static> {
    let buf = tray_icon::render_pet_icon(total, completed);
    Image::new_owned(buf.data, buf.width, buf.height)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(hotkey::HotkeyState::default())
        .manage(storage::StorageLock::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    toggle_main_window(app);
                }
            }).build())
        .setup(|app| {
            diagnostics::initialize(app.handle());
            let window = app.get_webview_window("main").unwrap();

            // macOS: hide from Dock, shadow, visible on all workspaces
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let _ = window.set_shadow(true);
                let _ = window.set_visible_on_all_workspaces(true);
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
                .icon_as_template(false) // user wants pure white icon always
                .tooltip("Green Todo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show_hide" => {
                            toggle_main_window(app);
                        }
                        "export" => {
                            show_main_window(app);
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.emit("trigger-export", ());
                            }
                        }
                        "import" => {
                            show_main_window(app);
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.emit("trigger-import", ());
                            }
                        }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // --- Global shortcut ---
            hotkey::initialize(app.handle());

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
            commands::report_client_error,
        ])
        .run(tauri::generate_context!())
        .expect("error running Green Todo");
}
