# OpenWord plugins

This directory is intentionally empty in the baseline app.

OpenWord's core (`src/`, `src-tauri/`) ships with **zero network code** —
that's a structural guarantee, not a feature flag (see
[ARCHITECTURE.md](../ARCHITECTURE.md#the-coreoptional-boundary-this-is-the-part-that-must-never-erode)).
Anything that needs the network, or is simply heavier than a baseline word
processor should ever require, lives here instead, as an opt-in module a
user explicitly installs.

Planned candidates (none implemented yet):

- `llm-assist/` — AI writing assistance
- `cloud-sync/` — Google Drive / OneDrive integration
- `collab/` — real-time multiplayer editing (would pull in a CRDT like Yjs)

## Ground rules for anything added here

1. A plugin is a separate crate (Rust) and/or a separate frontend chunk —
   never a new dependency added to `src-tauri/Cargo.toml`'s core
   dependencies or bundled into the main frontend entry point.
2. A plugin ships its own Tauri capability file, granting only the
   permissions it needs. The base app's capability file
   (`src-tauri/capabilities/default.json`) never grows a permission for a
   plugin's sake.
3. Uninstalling a plugin must leave the core app exactly as lightweight and
   functional as it was before the plugin existed.
