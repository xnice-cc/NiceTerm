<p align="center">
  <img src="./public/icons/app/niceterm.svg" alt="NiceTerm" width="128" height="128">
</p>

<h1 align="center">NiceTerm</h1>

<p align="center">
  <strong>A modern remote terminal workspace built with Tauri, React, and Rust.</strong><br/>
  <a href="https://gitee.com/xenchin/NiceTerm"><strong>Gitee Repository</strong></a>
</p>

<p align="center">
  SSH, local shells, Telnet, Serial, RDP, VNC, SFTP, tunnels, OTP, AI assistance, and encrypted sync in one desktop client.
</p>

> **Fork notice** — NiceTerm is a fork of [NyaTerm](https://github.com/nyakang/nyaterm)
> by [NyaKang](https://github.com/nyakang). The original project is MIT-licensed; this fork keeps
> the same license and full attribution to the upstream authors. Visit the
> [upstream repository](https://github.com/nyakang/nyaterm) for the original releases,
> documentation, and community channels (Discord / WeChat).

<p align="center">
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0EA5E9?style=flat-square&logo=linux&labelColor=334155"></a>
  &nbsp;
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-0EA5E9?style=flat-square&logo=readthedocs&labelColor=334155"></a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/product-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/product-light.png">
    <img alt="NiceTerm main workspace" src="./docs-site/static/img/home/product-light.png">
  </picture>
</p>

---

<a name="ai-assistant"></a>
# AI Assistant

NiceTerm includes an AI Assistant panel for command generation, terminal output explanation, error analysis, and multi-step terminal workflows.

## What It Can Do

- **Ask mode** for one-off help such as generating commands, explaining selected output, and analyzing errors
- **Agent mode** for multi-step work using an observe-decide-run loop against the active terminal session
- **Recent-output actions** so you can ask AI to explain the latest terminal output without manually copying it
- **Structured command cards** with risk levels, execution controls, and optional save-to-quick-command support
- **Approved command execution tools** for Agent workflows, with a separate final-answer step after terminal work completes
- **Inline terminal capture** during Agent execution with configurable `Terminal Output Lines`
- **Session mentions** with `@` to bring other terminal sessions into the AI context
- **Provider management** for built-in providers, manual model entries, credential groups, and custom OpenAI-compatible endpoints
- **Risk control** for high-impact commands, including approval gates and safer alternatives

---

<a name="what-is-niceterm"></a>
# What is NiceTerm

**NiceTerm** is a desktop client for SSH-centric operations and mixed terminal workflows. It combines a React + Tauri interface with a Rust backend so you can manage remote hosts, local shells, file transfers, authentication, network tooling, AI-assisted terminal actions, session import/export, diagnostics, and encrypted sync/backup from one workspace.

- **NiceTerm is** an SSH client for developers, sysadmins, and DevOps engineers
- **NiceTerm is** a terminal workspace with tabs, horizontal splits, and vertical splits
- **NiceTerm is** an SFTP browser with a transfer queue and local-edit-then-upload-back workflow
- **NiceTerm supports** SSH, Local Terminal, Telnet, Serial, RDP, and VNC sessions
- **NiceTerm is not** a shell replacement; it connects to remote shells, local shells, Telnet endpoints, and serial devices

---

<a name="why-niceterm"></a>
# Why NiceTerm

NiceTerm is built for people who move between servers, local commands, devices, and configuration files all day.

- **Workspace-first** — keep related terminals together with tabs, split panes, side panels, and child windows
- **Remote operations in context** — browse SFTP files, follow terminal paths, run transfers, and edit remote files without leaving the session
- **Security-aware workflows** — manage credentials, keys, known hosts, OTP, lock screen, and master-password protected storage
- **Portable configuration** — import from existing tools, export encrypted `.nya` backups, and sync encrypted snapshots through WebDAV or S3-compatible storage
- **AI where it is useful** — generate commands, inspect output, and run approved multi-step actions from the active terminal context

---

<a name="features"></a>
# Features

## Sessions and Workspace

- SSH, Local Terminal, Telnet, Serial, RDP, and VNC session support
- Multi-tab workspace with horizontal and vertical pane splits, tab drag docking, and layout restoration
- RDP and VNC remote desktop panes; VNC currently supports direct TCP, None / classic VNC Auth, Raw / ZRLE / Tight / Tight JPEG framebuffer updates, window scaling, bounded reconnects, and text clipboard exchange for Latin-1 text
- Saved connections with folders, icons, metadata, duplication, keyboard copy, reconnect, and import flows
- Command Palette and session quick switcher for finding actions, open sessions, saved connections, and new-session entry points
- Main-window `Background Image` customization with `cover` / `contain` / `stretch` / `tile` sizing and adjustable `Background Content Opacity`
- Left and right activity bars for file explorer, network, Security/Auth, Sync & Backup, AI Assistant, Notes, saved connections, active sessions, command history, asset monitoring, resource monitoring, GPU monitor, process manager, and Docker manager
- Notes panel and editor with tree navigation, context menus, autosave, toolbar controls, and sync/backup-aware persistence
- Asset monitoring workspace with grouped connection views, breadcrumb navigation, table/card layouts, and resource/GPU/NPU status integration
- Remote host monitoring panels for SSH sessions: resource monitor, NVIDIA GPU and Ascend NPU overviews, process manager (signal/renice), and Docker manager (containers, images, volumes, networks, Compose)
- Session input sync groups to broadcast typed input and sent commands to multiple sessions at once
- Temporary SSH links for one-off connections from a pasted `ssh://` URL or `ssh` command without saving a connection
- Child windows for settings, new-session creation, quick-command editing, remote-file editing, and auto-upload prompts
- Tray support with optional minimize-to-tray and hide-main-window behavior

## Terminal Experience

- Terminal search with result navigation, search history, copy/paste, context menus, and selected-text actions
- Command history with fuzzy suggestions, configurable length filters, and suppression in interactive programs
- Unicode grapheme rendering for emoji, combining marks, and ZWJ sequences
- Optional line-number and timestamp gutter
- Optional action links for IPv4 addresses, `host:port`, and archive filenames
- Optional keyword highlighting with expanded built-in presets, custom rules, and JSON import
- Terminal zoom, workspace padding, font weight controls, macOS IME compatibility, image path paste handling, and a clear-terminal action
- AI shortcuts for explaining recent output, plus inline Agent command output with configurable `Terminal Output Lines`
- Large-output protection, configurable scrollback, SSH keep-alive, and session recording
- Online search and translation from selected terminal text
- Zmodem file transfer support directly from the terminal, surfaced in the transfer queue
- Confirmation dialog before closing all sessions
- Customizable keyboard shortcuts for terminal and UI actions, including `Backspace Mode` selection for Telnet and Serial sessions

## SFTP and File Workflows

- Built-in SFTP file explorer for SSH sessions
- Upload, download, rename, move, delete, properties, new file/folder, and OpenSSH-compatible symlink actions
- Folder upload/download, multi-folder upload selection, multi-select, editable path bar, and manual/automatic sync with terminal cwd
- Transfer queue with speed display, pause, resume, cancel, retry, duplicate-target handling, timestamp preservation, and configurable concurrency
- Enhanced SCP and directory-transfer handling with original-property preservation where available
- Open remote files in a local editor and upload saved changes back through the watcher-driven auto-upload flow, with content fingerprinting so only real content changes trigger re-upload
- SFTP channel concurrency limiting and automatic retry on transient channel-open failures
- External drag-and-drop upload support on Windows
- Zmodem transfers track local paths and can reveal completed files in the system file manager

## Security, Authentication, and Networking

- Password authentication, private keys, host-key verification, and encrypted local persistence
- Credential management with regex-based terminal auto-fill
- OTP management with TOTP/HOTP, QR import, and SSH auto-fill support
- Per-connection SSH algorithm preferences with Compatible / Secure / Custom modes and security-risk labels for key exchange, ciphers, MACs, and host keys
- Proxy configurations including SOCKS5, HTTP, and ProxyCommand; SSH jump hosts with cycle prevention; local / remote / dynamic tunnels
- SSH X11 forwarding for environments with a local X server
- Screen lock, idle app lock, master password, diagnostics settings, local log management, and diagnostics bundle export

## Sync, Backup, and Migration

- Encrypted cloud sync and backup through WebDAV, S3-compatible storage, and GitHub Gist
- Master password required before sync, backup, encrypted import/export, or scheduled encrypted backup actions
- Startup sync checks, debounced auto-push after supported local changes, detailed status updates, and scheduled backup retention
- Manual test / push / pull / backup actions, remote backup restore, and snapshot-level conflict resolution
- Session import from Xshell, MobaXterm, WindTerm, and NiceTerm JSON definitions
- Full-app encrypted `.nya` import/export for portable NiceTerm configuration

---

<a name="screenshots"></a>
# Screenshots

## Workspace

Manage SSH, local shell, Telnet, and Serial sessions inside one tabbed and split-pane workspace.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/overview-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/overview-light.png">
    <img alt="NiceTerm workspace overview" src="./docs-site/static/img/home/overview-light.png">
  </picture>
</p>

## Appearance and Background Image

Use a local wallpaper behind the main window, tune `Image Sizing`, `Image Opacity`, and `Background Content Opacity`, and keep child windows readable with solid surfaces.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/cover-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/cover-light.png">
    <img alt="NiceTerm background image customization" src="./docs-site/static/img/home/cover-light.png">
  </picture>
</p>

## Terminal Enhancements

Use command history, search, translation, action links, timestamps, keyword highlighting, and large-output protection in the terminal.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/terminal-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/terminal-light.png">
    <img alt="NiceTerm terminal features" src="./docs-site/static/img/home/terminal-light.png">
  </picture>
</p>

## Remote Files

Browse SFTP files beside the terminal, manage transfers, and send local editor changes back to the remote path.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/files-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/files-light.png">
    <img alt="NiceTerm SFTP file workflow" src="./docs-site/static/img/home/files-light.png">
  </picture>
</p>

## Security and Network Tools

Manage credentials, OTP, known hosts, proxies, jump hosts, and SSH tunnels from dedicated panels.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/security-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/security-light.png">
    <img alt="NiceTerm security and network tools" src="./docs-site/static/img/home/security-light.png">
  </picture>
</p>

## Sync and Backup

Sync encrypted portable configuration snapshots and restore backups through WebDAV or S3-compatible storage.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs-site/static/img/home/sync-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs-site/static/img/home/sync-light.png">
    <img alt="NiceTerm sync and backup" src="./docs-site/static/img/home/sync-light.png">
  </picture>
</p>

---

<a name="supported-platforms"></a>
# Supported Platforms

| OS | Support |
| :--- | :--- |
| **Windows** | Windows 10/11, x64 / arm64 |
| **macOS** | macOS 12+, Intel / Apple Silicon |
| **Linux** | Ubuntu 20.04+, Fedora 36+, Arch Linux, and similar distributions |

Download installers from the [Gitee Releases](https://gitee.com/xenchin/NiceTerm/releases) page. Upstream installers are available at [nyakang/nyaterm releases](https://github.com/nyakang/nyaterm/releases).

---

<a name="supported-session-types"></a>
# Supported Session Types

| Type | Typical use | Notes |
|------|-------------|-------|
| SSH | Linux / Unix remote servers | Supports SFTP, OTP, resource / GPU / process / Docker monitoring, proxy, jump host, tunnels, and per-connection algorithm preferences |
| Local Terminal | Local shell workflows | Uses your local shell path and working directory |
| Telnet | Legacy network devices or lab systems | Lightweight terminal session without SSH-only features, with `Backspace Mode` for `Ctrl+H (BS)` or `DEL (0x7F)` |
| Serial | Routers, boards, embedded devices | Configurable port, baud rate, data bits, parity, stop bits, and `Backspace Mode` |

---

<a name="getting-started"></a>
# Getting Started

## Download

Download the latest build for your platform from [Gitee Releases](https://gitee.com/xenchin/NiceTerm/releases), or use the upstream [nyakang/nyaterm releases](https://github.com/nyakang/nyaterm/releases).

| Platform | Format |
|----------|--------|
| Windows | `.msi` / `.exe` / portable `.zip` |
| macOS | `.dmg` |
| Linux | `.deb` / `.AppImage` |

For the Windows portable edition, extract the zip and run `NiceTerm.exe`. NiceTerm preserves the complete `data/` folder while replacing the program files and restarting.

### macOS / Linux

Download the `.dmg` / `.deb` / `.AppImage` from [Gitee Releases](https://gitee.com/xenchin/NiceTerm/releases), then install as usual. (Upstream also publishes Homebrew and AUR packages — see [the original project](https://github.com/nyakang/nyaterm).)

NiceTerm is currently not signed with an Apple Developer certificate. If macOS reports that the app is damaged or cannot be opened after installation, remove the quarantine attribute and open it again:

```bash
sudo xattr -cr /Applications/NiceTerm.app
```


## Prerequisites for Development

- Node.js 18+
- Rust stable via [rustup](https://rustup.rs/)
- pnpm

## Development

```bash
git clone git@gitee.com:xenchin/NiceTerm.git
cd NiceTerm
pnpm install
pnpm tauri dev
```

## Project Structure

```text
├── src/                    # React frontend
│   ├── components/         # UI, terminal, panels, dialogs, settings
│   ├── hooks/              # Frontend state and workflow hooks
│   ├── lib/                # Terminal, AI, sync, theme, platform helpers
│   ├── pages/              # Child-window pages
│   └── i18n/               # Application translations
├── src-tauri/              # Tauri 2 + Rust backend
│   ├── src/cmd/            # Tauri commands exposed to the frontend
│   ├── src/core/           # SSH, SFTP, PTY, Telnet, Serial, AI, backup logic
│   ├── src/config/         # Persistent config models
│   └── crates/otp/         # Local OTP implementation
├── docs-site/              # Docusaurus documentation site
├── public/                 # Static assets
└── scripts/                # Checks, version sync, and demo helper scripts
```

---

<a name="credits"></a>
# Credits
Thanks to the following projects and libraries that make NiceTerm possible:
- [NyaTerm](https://github.com/nyakang/nyaterm) - The upstream project by [NyaKang](https://github.com/nyakang) that NiceTerm forks; see its repository for the original contributor list, star history and sponsor page
- [WindTerm](https://github.com/kingToolbox/WindTerm) - Inspired the design and features of the terminal workspace
- [tabby](https://github.com/Eugeny/tabby) - An excellent cross-platform terminal that provided many design inspirations
- [xterm.js](https://xtermjs.org/) - A powerful frontend terminal emulator that provides rich terminal functionality and extensibility
- [russh](https://github.com/warp-tech/russh) - An SSH client and server implementation in Rust

---

<a name="license"></a>
# License

This project is licensed under the [MIT License](LICENSE), same as the upstream project.
