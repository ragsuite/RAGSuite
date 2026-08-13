# RAGSuite Platform Manager (`ragsuite`)

Self-hosted install helper. Community needs **no** offline key.

**Website:** [www.ragsuite.de](https://www.ragsuite.de)  
**Source:** [github.com/ragsuite/RAGSuite](https://github.com/ragsuite/RAGSuite)

```bash
npm install -g @ragsuite/ragsuite@latest
ragsuite init
ragsuite start
```

| Mode | Web UI | How it runs |
|------|--------|-------------|
| **native** (default) | http://localhost:**9191** | Host processes |
| **docker** (`init --docker`) | http://localhost:**9191** | Docker Compose |

API: http://localhost:**9090** · docs: http://localhost:**9090/docs**

---

## Contents

1. [Quick start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Everyday commands](#everyday-commands)
4. [Upgrade Community](#upgrade-community)
5. [Enterprise](#enterprise)
6. [Ports](#ports)
7. [Email (SMTP)](#email-invites-forgot-password-2fa)
8. [Troubleshooting](#troubleshooting)
9. [Version](#version)

---

## Quick start

```bash
npm install -g @ragsuite/ragsuite@latest
ragsuite version

ragsuite init              # prompts for mode; default = native
# ragsuite init --yes      # native, non-interactive
# ragsuite init --docker   # Docker mode

ragsuite doctor
ragsuite start

# native → http://localhost:9191
# docker → http://localhost:9191
# API    → http://localhost:9090

ragsuite logs              # all
ragsuite logs api
ragsuite logs frontend

ragsuite stop              # keeps database
```

Default install folder: `~/ragsuite`  
Saved config: `~/.ragsuite/config.json`

---

## Prerequisites

### Shared
| Tool | Version |
|------|---------|
| Node.js | **18+** (20/22 LTS recommended) |
| npm | ships with Node |
| Git | 2.30+ |
| OS | macOS, Linux, or Windows **WSL2 / Git Bash** |

### Native mode
| Tool | Note |
|------|------|
| Python | **3.14** (`python3.14`) |
| Yarn | **1.22+** (`corepack enable`) |
| Postgres | **15+** on **:5436**, database `ragsuite_v3` |
| Redis | **7+** on **:6382** |
| Docker | optional — can start Postgres/Redis only |

### Docker mode
| Tool | Note |
|------|------|
| Docker Desktop / Engine | daemon running |
| Compose v2 | `docker compose version` |

---

## Everyday commands

| Command | What it does |
|---------|----------------|
| `init` | First install; choose native or docker |
| `start` / `stop` / `restart` | Run the stack (`stop` keeps data) |
| `logs [api\|frontend]` | Follow logs |
| `doctor` | Check prerequisites |
| `update` | Upgrade Community (+ optional Enterprise steps below) |
| `version` | Print CLI version |
| `status` | Install path, key, active Enterprise bundle |
| `extensions` / `plugins` | List modules on disk |
| `license status` | Check offline key |
| `bundle list` | List installed Enterprise bundles |
| `activate` | **First-time** Enterprise only |

```bash
ragsuite status
ragsuite extensions
ragsuite license status
ragsuite bundle list
```

---

## Upgrade Community

```bash
ragsuite update --restart
```

What this does:

1. Upgrades the global CLI
2. Pulls Community in your install folder
3. Keeps database, `.env`, and any existing offline key
4. Does **not** wipe volumes

Do **not** use `docker compose down -v` or `init --force` for normal upgrades.

---

## Enterprise

Community needs no key. Your vendor emails three files — paste them into your install root (default: `~/ragsuite`). Do **not** unpack the `.encbundle`. Do not hand-edit the key.

| File (paste here) | Path | Command |
|-------------------|------|---------|
| `offline.key` | `<install>/.ragsuite/license/offline.key` | First time: use with `activate` below. Renew: `update --key` |
| `ragsuite-ee-<version>.encbundle` | `<install>/ragsuite-ee-<version>.encbundle` | First time: use with `activate` below. Later code: `update --bundle` |
| `manifest.enc.json` | `<install>/manifest.enc.json` | Keep next to the `.encbundle` (same folder) |

The CLI validates the key/bundle and installs Enterprise modules for you. Database and `.env` are never wiped.

### 1. First-time Enterprise — always `activate`

```bash
ragsuite activate --key "<install>/.ragsuite/license/offline.key" --bundle "<install>/ragsuite-ee-<ver>.encbundle" --restart
```

(Same as `ragsuite ee-activate "<install>/.ragsuite/license/offline.key" --bundle "<install>/ragsuite-ee-<ver>.encbundle" --restart`.)

Works for **native and Docker** (`--restart` rebuilds/restarts so the API sees the key + bundle).  
`update` **cannot** install Enterprise for the first time. If you run `update --key` or `update --bundle` with no key yet, the CLI refuses and tells you to use `activate`.

### 2. Later Enterprise code — `update --bundle` (same key)

Vendor emails a **new encbundle** (+ matching `manifest.enc.json`). Keep your current key; place the new files at `<install>/`, then:

```bash
ragsuite update --bundle "<install>/ragsuite-ee-<ver>.encbundle" --restart
```

The installed key is checked first. If it is **expired**, Enterprise is not updated (Community update still runs). Renew the key first (next section).

### 3. Renew expired key — `update --key`

Vendor emails a **new offline.key**. Paste it over `<install>/.ragsuite/license/offline.key` (your previous key must already exist from `activate`):

```bash
ragsuite update --key "<install>/.ragsuite/license/offline.key" --restart
```

- If the installed key is **expired** or **invalid**, the new key replaces it automatically.
- If the installed key is still **valid**, replacement needs `--force` (vendor/support only).
- Optional: renew and install a new pack together:
  `ragsuite update --key "<install>/.ragsuite/license/offline.key" --bundle "<install>/ragsuite-ee-<ver>.encbundle" --restart`

Database and `.env` are never wiped by these commands.

---

## Ports

| Service | native | docker |
|---------|--------|--------|
| API | **9090** | **9090** |
| Web | **9191** Expo | **9191** nginx |
| Postgres | **5436** | **5436** |
| Redis | **6382** | **6382** |
| Chroma | **8004** | internal |

---

## Email (invites, forgot-password, 2FA)

`init` may write **smoke** SMTP so the API can start. Smoke values do **not** deliver real mail.

Set real SMTP in `~/ragsuite/.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_USE_TLS=true
EMAIL_FROM=you@gmail.com
```

Then: `ragsuite restart`

Never commit `.env`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `command not found` | `npm install -g @ragsuite/ragsuite@latest` |
| Wrong UI port | native / docker → **9191** |
| Port 9090 busy | `ragsuite stop` |
| `/docs` missing | `ragsuite restart` after update |
| Postgres/Redis down (native) | Start services, or install Docker and `start` again |
| Docker daemon down | Start Docker Desktop, then `doctor` |
| Mail / invites fail | Set real `SMTP_*` + `EMAIL_FROM`, then `restart` |
| `update` refuses first Enterprise | Use `activate --key … --bundle …` |
| `Bundle not found` | Put the emailed `.encbundle` (+ `manifest.enc.json`) at `<install>/`, or pass that absolute path. Do not unpack by hand. |
| Key expired / EE refused | `update --key "<install>/.ragsuite/license/offline.key" --restart` |
| Refuses to overwrite a valid key | Intended — add `--force` only if vendor says so |

---

## Version

npm package version, GitHub tag (`v…`), and `ragsuite version` stay aligned.

```bash
ragsuite version
npm install -g @ragsuite/ragsuite@latest
```

---

## License

Copyright 2026 [NITSAN](https://nitsan.ai/)

Licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/cli/LICENSE).
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/cli/NOTICE) for attribution and Community Edition scope.
