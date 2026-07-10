#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri::AppHandle;

#[tauri::command]
fn greet(name: &str) -> String { format!("Welcome to EMX, {name}!") }

fn powershell_quote(value: &str) -> String { format!("'{}'", value.replace('\'', "''")) }

#[tauri::command]
fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    const UPDATE_PREFIX: &str = "https://github.com/tjcorp420/emx-fortnite-sprite-tracker/releases/download/";
    if !url.starts_with(UPDATE_PREFIX) || !url.ends_with(".exe") {
        return Err("The update URL is not an approved EMX update package.".to_string());
    }
    let process_id = std::process::id();
    let output_path = std::env::temp_dir().join(format!("emx-sprite-tracker-update-{process_id}.exe"));
    let script = format!(
        "$ErrorActionPreference='Stop';$processId={process_id};$url={};$output={};Wait-Process -Id $processId -ErrorAction SilentlyContinue;Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $output;Start-Process -FilePath $output -ArgumentList '/S' -Verb RunAs;",
        powershell_quote(&url),
        powershell_quote(&output_path.to_string_lossy()),
    );
    Command::new("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn()
        .map_err(|error| format!("Could not start the EMX updater: {error}"))?;
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, install_update])
        .run(tauri::generate_context!())
        .expect("error while running EMX Fortnite Sprite Tracker");
}
