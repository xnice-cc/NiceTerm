// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Windows subsystem configuration and entry.
//! Delegates to `niceterm_lib::run()` for the actual app.

fn main() {
    if niceterm_lib::run_portable_update_helper_if_requested() {
        return;
    }
    if niceterm_lib::run_cloud_snapshot_decode_helper_if_requested() {
        return;
    }

    niceterm_lib::run();
}
