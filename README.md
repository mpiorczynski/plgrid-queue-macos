# PLGrid Queue — macOS Menu Bar App

A native **macOS menu bar app** that displays running and queued Slurm jobs across **PLGrid** clusters (such as **Athena** and **Helios**) right from your menu bar.

This is a rewrite of the original **GNOME Shell extension** as a SwiftUI `MenuBarExtra` app for macOS 13+.

![Platform](https://img.shields.io/badge/macOS-13%2B-blue)
![Language](https://img.shields.io/badge/Swift-5.9-orange)
![License](https://img.shields.io/badge/license-GPL--3.0-green)

---

## Features

- **Menu Bar Indicator**: Displays active jobs in the compact format `R: {running}; Q: {queued}` (e.g. `R: 0; Q: 2`). Shows `R: ?  Q: ?` when every cluster is unreachable.
- **Dropdown Menu**:
  - Breakdown by cluster (e.g. **Athena**, **Helios**).
  - Detailed job rows showing State Badge (`[R]`, `[PD]`, etc.), Job ID, Job Name, Partition, Elapsed Time, and Reason / Allocated Nodes.
  - Clear empty states ("No active jobs") and connection error indicators.
  - **Refresh Now** button with animated spin while loading (menu stays open).
  - Click a job row to **copy its numeric ID** to the clipboard (menu stays open).
  - **Settings** button for quick access to preferences.
- **Lightweight SSH Execution**:
  - Works with your existing `~/.ssh/config`.
  - Runs one-off `ssh -o BatchMode=yes <host> "squeue --me"` calls asynchronously every 1 minute (default).
  - **No persistent background connections** — only single short-lived commands.
  - Non-blocking: never freezes the menu bar.
- **Customizable Preferences** (⌘,):
  - Cluster host aliases (comma-separated, e.g. `athena, helios`).
  - Polling interval (in seconds, default: 60s = 1 minute).
  - SSH connection timeout (in seconds, default: 5s).
  - Toggle menu bar icon visibility.
  - Launch at login.

---

## Requirements

- **macOS 13** or later.
- **Swift 5.9+** toolchain (Xcode Command Line Tools are sufficient; no Xcode app required).
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

## Build & Run

### From source (Swift Package Manager)

```bash
# Build the app into an .app bundle
make build-app          # outputs build/PLGridQueue.app

# Install to /Applications
make install

# Or just run during development (menu bar only, no bundle)
make run

# Run the test suite
make test
```

| Make Target      | Description |
|------------------|-------------|
| `make build`     | Compiles the app (release) via SwiftPM |
| `make run`       | Runs the app (debug, no bundle) |
| `make build-app` | Assembles a runnable `.app` bundle (ad-hoc signed) |
| `make install`   | Builds the bundle and copies it to `/Applications` |
| `make uninstall` | Removes the app from `/Applications` |
| `make pack`      | Creates a distributable `build/PLGridQueue.zip` |
| `make test`      | Runs the standalone test runner (`swift run PLGridQueueTestRunner`) |
| `make clean`     | Cleans SwiftPM build artifacts and `build/` |

---

## Notes

- **Menu bar only**: the app runs as a menu-bar accessory with **no dock icon** (`LSUIElement`), matching the original "top bar" monitor behavior.
- **Launch at login** uses `SMAppService`. To enable it, the app should be installed in `/Applications` (the opens-settings preference toggle will otherwise report "Operation not permitted").
- The SSH/squeue parsing logic is ported directly from the original GNOME `slurmService.js` and lives in the `PLGridQueueCore` library so it can be unit-tested without a GUI.

---

## Project Layout

```
Sources/PLGridQueueCore/     Pure logic: Job model, squeue parser, SlurmService, aggregation
Sources/PLGridQueue/         AppKit/SwiftUI app: MenuBarExtra, menu view, settings, model, polling
Tests/PLGridQueueTestRunner/ Standalone assertion-based test runner (no XCTest dependency)
Scripts/build-app.sh         Builds SwiftPM product and assembles the .app bundle
Resources/Info.plist         Bundle metadata (LSUIElement accessory app)
```

---

## License

GPL-3.0-or-later
