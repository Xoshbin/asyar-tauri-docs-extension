# Tauri Docs

> Search and browse Tauri v2 documentation

`org.asyar.tauri-docs` is a Tier 2 Asyar extension (developer-tools · macOS, Windows, Linux).

## What it does

The extension provides **1 command**:

| Command | Mode | What it does |
| --- | --- | --- |
| **Tauri Docs** | `view` | Browse Tauri v2 documentation |

## Permissions

```json
"permissions": [
  "network",
  "shell:open-url"
]
```

## Install

Install from the [Asyar Store](https://asyar.org/extensions).

## Develop

```bash
# from this directory
pnpm install
pnpm dev          # vite dev server
pnpm test:run     # vitest
pnpm build        # emits dist/{worker,view}.js + assets
pnpm link         # registers the dev path with the launcher
asyar publish     # builds, packages, GitHub release, store submission
```

## License

[MIT](./LICENSE) © Khoshbin
