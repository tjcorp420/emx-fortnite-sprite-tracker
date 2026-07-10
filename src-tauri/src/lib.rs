#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri::AppHandle;

#[tauri::command]
fn greet(name: &str) -> String { format!("Welcome to EMX, {name}!") }

fn powershell_quote(value: &str) -> String { format!("'{}'", value.replace('\'', "''")) }

#[tauri::command]
fn check_for_update() -> Result<String, String> {
    const RELEASE_API: &str = "https://api.github.com/repos/tjcorp420/emx-fortnite-sprite-tracker/releases/latest";
    let script = format!(
        "$ErrorActionPreference='Stop';$headers=@{{Accept='application/vnd.github+json';'User-Agent'='EMX-Fortnite-Sprite-Tracker'}};Invoke-RestMethod -UseBasicParsing -Uri {} -Headers $headers | ConvertTo-Json -Compress -Depth 10",
        powershell_quote(RELEASE_API),
    );
    let output = Command::new("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .output()
        .map_err(|error| format!("Could not start the GitHub release check: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "GitHub release check failed.".to_string() } else { detail });
    }
    let body = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if body.is_empty() { Err("GitHub returned an empty release response.".to_string()) } else { Ok(body) }
}

#[tauri::command]
fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    const UPDATE_PREFIX: &str = "https://github.com/tjcorp420/emx-fortnite-sprite-tracker/releases/download/";
    if !url.starts_with(UPDATE_PREFIX) || !url.ends_with(".exe") {
        return Err("The update URL is not an approved EMX update package.".to_string());
    }
    let process_id = std::process::id();
    let output_path = std::env::temp_dir().join(format!("emx-sprite-tracker-update-{process_id}.exe"));
    let app_path = std::env::current_exe().map_err(|error| format!("Could not locate the EMX app: {error}"))?;
    let script = format!(
        "$ErrorActionPreference='Stop';$processId={process_id};$url={};$output={};$appPath={};Wait-Process -Id $processId -ErrorAction SilentlyContinue;Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $output;$installer=Start-Process -FilePath $output -ArgumentList '/S' -Verb RunAs -Wait -PassThru;if($installer.ExitCode -ne 0){{throw \"EMX installer exited with code $($installer.ExitCode).\"}};Remove-Item -LiteralPath $output -Force -ErrorAction SilentlyContinue;Start-Process -FilePath $appPath;",
        powershell_quote(&url),
        powershell_quote(&output_path.to_string_lossy()),
        powershell_quote(&app_path.to_string_lossy()),
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
        .invoke_handler(tauri::generate_handler![greet, check_for_update, install_update])
        .run(tauri::generate_context!())
        .expect("error while running EMX Fortnite Sprite Tracker");
}
