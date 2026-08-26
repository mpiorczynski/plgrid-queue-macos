# PLGrid Queue GNOME Shell Extension

A modern GNOME Shell extension that displays running and queued Slurm jobs across **PLGrid** clusters (such as **Athena** and **Helios**) directly in your top bar.

![Top Bar Status](https://img.shields.io/badge/GNOME%20Shell-45%20--%2049-blue)
![License](https://img.shields.io/badge/license-GPL--3.0-green)

---

## Features

- **Top Bar Indicator**: Displays active jobs in the compact format `R: {running}; Q: {queued}` (e.g. `R: 0; Q: 2`).
- **Interactive Popup Menu**:
  - Breakdown by cluster (e.g. **Athena**, **Helios**).
  - Detailed job rows showing State Badge (`[R]`, `[PD]`, etc.), Job ID, Job Name, Partition, Elapsed Time, and Reason / Allocated Nodes.
  - Clear empty states ("No active jobs") and connection error indicators.
  - "Refresh Now" button with animated spin indicator without closing the menu.
  - "Preferences" button for quick access to extension settings.
- **Lightweight SSH Execution**:
  - Works with your existing `~/.ssh/config`.
  - Runs one-off `ssh -o BatchMode=yes <host> "squeue --me"` calls asynchronously every 5 minutes (default).
  - **No persistent background connections** — only executes single short-lived commands.
  - Non-blocking: will never freeze or slow down your GNOME Shell UI.
- **Customizable via Preferences (Libadwaita)**:
  - Cluster host aliases (comma-separated, e.g. `athena, helios`).
  - Polling interval (in seconds, default: 300s = 5 minutes).
  - SSH connection timeout (in seconds, default: 5s).
  - Toggle top-bar icon visibility.
  - Panel box position (Left, Center, Right).

---

## Requirements

- **GNOME Shell**: 45, 46, 47, 48, or 49.
- **SSH Config**: Configured SSH keys for passwordless authentication in `~/.ssh/config` for the cluster hosts.

Example `~/.ssh/config`:
```ssh
Host athena
    HostName athena.cyfronet.pl
    User plgusername
    IdentityFile ~/.ssh/id_ed25519

Host helios
    HostName login01.helios.cyfronet.pl
    User plgusername
    IdentityFile ~/.ssh/id_ed25519
```

---

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/xweinp/plgrid-queue.git
   cd plgrid-queue
   ```

2. Compile schemas and install the extension:
   ```bash
   make install
   ```

3. Enable the extension:
   ```bash
   make enable
   ```
   *(Note: On Wayland, if the extension was just installed for the first time, log out and log back in for GNOME Shell to register the new extension directory).*

---

## Usage & Commands

| Make Target | Description |
|---|---|
| `make install` | Compiles schemas and copies files to `~/.local/share/gnome-shell/extensions/plgrid-queue@jpniewski` |
| `make enable` | Enables the extension |
| `make disable` | Disables the extension |
| `make reload` | Reloads (disables & re-enables) the extension |
| `make prefs` | Opens the extension settings window |
| `make test` | Runs the test suite with GJS |
| `make pack` | Creates a distributable `.zip` bundle |
| `make uninstall` | Removes the extension from the local user directory |

---

## License

GPL-3.0-or-later
