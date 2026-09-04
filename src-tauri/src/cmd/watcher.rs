use crate::error::AppResult;
use tauri::AppHandle;

#[tauri::command]
pub async fn start_file_watch(
    app: AppHandle,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> AppResult<()> {
    crate::core::watcher::start_file_watch(app, session_id, local_path, remote_path).await
}

#[tauri::command]
pub async fn stop_file_watch(session_id: String, local_path: String) -> AppResult<()> {
    crate::core::watcher::stop_file_watch(session_id, local_path).await
}
