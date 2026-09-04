const DEFAULT_GITHUB_GIST_CLIENT_ID: &str = "4827432";
const GITHUB_GIST_CLIENT_ID_ENV: &str = "NYATERM_GITHUB_GIST_CLIENT_ID";

fn main() {
    println!("cargo:rerun-if-env-changed={GITHUB_GIST_CLIENT_ID_ENV}");

    let client_id = std::env::var(GITHUB_GIST_CLIENT_ID_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_GITHUB_GIST_CLIENT_ID.to_string());
    println!("cargo:rustc-env={GITHUB_GIST_CLIENT_ID_ENV}={client_id}");

    tauri_build::build();
}
