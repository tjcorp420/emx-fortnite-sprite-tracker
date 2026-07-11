#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{sync::Mutex, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Welcome to EMX, {name}!")
}

struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMetadata {
    version: String,
    current_version: String,
    notes: Option<String>,
}

#[tauri::command]
async fn check_for_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<UpdateMetadata>, String> {
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Could not configure the EMX updater: {error}"))?
        .check()
        .await
        .map_err(|error| format!("Could not reach the EMX update feed: {error}"))?;

    let metadata = update.as_ref().map(|item| UpdateMetadata {
        version: item.version.clone(),
        current_version: item.current_version.clone(),
        notes: item.body.clone(),
    });

    *pending_update
        .0
        .lock()
        .map_err(|_| "Could not prepare the EMX updater state.".to_string())? = update;

    Ok(metadata)
}

#[tauri::command]
async fn install_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = pending_update
        .0
        .lock()
        .map_err(|_| "Could not access the pending EMX update.".to_string())?
        .take()
        .ok_or_else(|| "No pending update. Check for updates first.".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Could not install the EMX update: {error}"))?;

    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            app.manage(PendingUpdate(Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            check_for_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running EMX Fortnite Sprite Tracker");
}
