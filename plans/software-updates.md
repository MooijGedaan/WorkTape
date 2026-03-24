# Software Updates Plan for WorkTape

## Context

WorkTape is a Tauri v2 desktop application with a Rust backend and a React/TypeScript frontend (built with Vite). It currently uses SQLite for local storage and communicates with a Cloudflare Workers proxy for AI features. The app is bundled for all platforms (`"targets": "all"` in `tauri.conf.json`).

This plan describes how to introduce over-the-air (OTA) software updates so that users who have installed WorkTape can receive new versions automatically.

---

## 1. Recommended Technology: `tauri-plugin-updater`

Tauri v2 provides an official updater plugin (`tauri-plugin-updater`, crate version 2.x) that handles the full update lifecycle: checking for updates, downloading, verifying signatures, and installing. This is the natural choice because:

- It is maintained by the Tauri team and designed for Tauri v2.
- It supports all three desktop platforms (macOS, Windows, Linux).
- It integrates with the existing Tauri plugin system already used in WorkTape (e.g. `tauri-plugin-sql`, `tauri-plugin-autostart`).
- It handles code-signing verification out of the box.

### Alternative considered

A fully custom solution using `reqwest` (already a dependency) to poll a server and download binaries was considered but rejected. The Tauri updater handles platform-specific installation mechanics (DMG replacement on macOS, NSIS/MSI on Windows, AppImage replacement on Linux) which would be complex and error-prone to reimplement.

---

## 2. Update Distribution Channel

### Primary: GitHub Releases

GitHub Releases is the simplest and most cost-effective distribution channel for WorkTape:

- The repository is already hosted on GitHub (`MooijGedaan/WorkTape`).
- `tauri-plugin-updater` has first-class support for GitHub Releases as an update source.
- No additional infrastructure is needed.
- GitHub provides reliable CDN-backed downloads with no bandwidth costs for public repos.

### How it works

1. Each release is created as a GitHub Release with a tag matching the version (e.g. `v1.1.0`).
2. The built update artifacts (`.tar.gz` for macOS/Linux, `.zip` for Windows) are uploaded as release assets.
3. A `latest.json` manifest is generated and uploaded alongside the artifacts, containing version info and download URLs.
4. The app checks this manifest to determine whether an update is available.

### Future option: Custom update server

If the repository becomes private or if more control is needed (staged rollouts, analytics), a custom endpoint can be added. The Tauri updater supports any HTTP endpoint that returns the correct JSON format. The existing Cloudflare Workers proxy (`worktape-proxy.daanmooij-385.workers.dev`) could be extended to serve as an update endpoint, providing:

- Rate limiting and analytics on update checks.
- Staged/percentage rollouts.
- Platform-specific update logic.

This is optional and not needed for the initial implementation.

---

## 3. Version Management Strategy

### Semantic Versioning

WorkTape should follow Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`.

- **MAJOR**: Breaking changes (e.g. database schema changes that require migration, removal of features).
- **MINOR**: New features, non-breaking enhancements.
- **PATCH**: Bug fixes, small improvements.

### Version sources

There are currently two version declarations that must be kept in sync:

| File | Field | Current value |
|---|---|---|
| `package.json` | `version` | `1.0.0` |
| `tauri.conf.json` | `version` | `1.0.0` |
| `src-tauri/Cargo.toml` | `version` | `0.1.0` |

The Tauri updater uses the version from `tauri.conf.json` to determine whether an update is available. All three should be kept in sync. A simple bump script or CI step can handle this (see Section 7).

### Git tags

Each release should be tagged with `v{version}` (e.g. `v1.1.0`). The CI pipeline should create the GitHub Release from this tag.

---

## 4. User Experience

### Update check flow

1. **On app launch**: The app silently checks for updates in the background.
2. **If an update is available**: A non-intrusive notification is shown to the user (e.g. a banner or toast within the app UI, or a system notification via `tauri-plugin-notification` which is already installed).
3. **User action**: The user can choose to:
   - **Update now**: The update downloads and installs. The app restarts automatically.
   - **Remind me later**: The notification is dismissed. The check happens again on the next launch.
4. **During download**: A progress indicator shows download progress.
5. **After install**: The app restarts with the new version.

### Design principles

- **Non-disruptive**: Never force an update or interrupt active work. The user is in control.
- **Transparent**: Show what version is available and a brief summary of changes (pulled from the release notes).
- **Reliable**: If the download fails or the network is unavailable, fail silently and retry on the next launch.

### Settings

Add an option in the app settings to:
- Enable/disable automatic update checks.
- Manually trigger a check for updates ("Check for updates" button).
- Show the current app version.

---

## 5. Security Considerations

### Code signing (required)

Tauri's updater requires update artifacts to be signed. Without a valid signature, the updater will reject the download. This is a critical security measure that prevents tampered binaries from being installed.

#### Key generation

Generate a key pair using the Tauri CLI:

```
npx tauri signer generate -w ~/.tauri/worktape.key
```

This produces:
- A **private key** (used to sign artifacts during CI builds). Must be kept secret.
- A **public key** (embedded in the app to verify signatures).

#### Key storage

- The **private key** and its **password** must be stored as GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
- The **public key** is added to `tauri.conf.json` in the updater configuration (it is not sensitive).

### Platform code signing

In addition to the Tauri update signature, platform-specific code signing is strongly recommended:

| Platform | Requirement | Notes |
|---|---|---|
| macOS | Apple Developer ID certificate | Required to avoid Gatekeeper warnings. Costs ~$99/year via Apple Developer Program. |
| Windows | Code signing certificate (EV or OV) | Required to avoid SmartScreen warnings. Can be obtained from certificate authorities. |
| Linux | Not required | AppImage does not require signing, though GPG signing is possible. |

Platform signing is separate from the Tauri update signature and is handled during the build/bundle step. It is not strictly required for the updater to function, but it is highly recommended for user trust.

### HTTPS

All update checks and downloads must occur over HTTPS. GitHub Releases uses HTTPS by default.

### CSP update

The Content Security Policy in `tauri.conf.json` may need to be updated to allow connections to `api.github.com` and `github.com` (or the custom update endpoint) for update checks and downloads. The Tauri updater plugin handles this via its own permissions, but the CSP `connect-src` directive should be reviewed.

---

## 6. CI/CD Pipeline (GitHub Actions)

A GitHub Actions workflow should automate the build and release process.

### Workflow overview

**Trigger**: Push of a version tag (`v*`).

**Steps**:

1. **Checkout** the repository at the tagged commit.
2. **Set up** Node.js, Rust toolchain, and platform-specific dependencies.
3. **Install** frontend dependencies (`npm ci`).
4. **Build** the Tauri app with the updater enabled (`npx tauri build`).
5. **Sign** the update artifacts using the Tauri signing key.
6. **Create** a GitHub Release with:
   - The platform-specific installers (`.dmg`, `.msi`, `.AppImage`).
   - The update artifacts (`.tar.gz`, `.zip` with `.sig` files).
   - A `latest.json` manifest.
7. **Upload** all artifacts to the release.

### Matrix build

The workflow should use a build matrix to compile for all three platforms:

| Runner | Target |
|---|---|
| `macos-latest` | macOS (`.dmg`, `.app.tar.gz`) |
| `windows-latest` | Windows (`.msi`, `.nsis`, `.zip`) |
| `ubuntu-latest` | Linux (`.AppImage`, `.AppImage.tar.gz`) |

### Existing tooling

The `@tauri-apps/cli` package (already in `devDependencies`) provides the `tauri build` command. The Tauri GitHub Action (`tauri-apps/tauri-action`) simplifies the CI setup significantly and handles artifact uploading and release creation.

---

## 7. Implementation Steps

The following steps should be executed in order. Each step is a discrete piece of work that can be reviewed independently.

### Step 1: Generate signing keys

- Run `npx tauri signer generate -w ~/.tauri/worktape.key`.
- Store the private key and password as GitHub repository secrets.
- Note down the public key for Step 2.

### Step 2: Configure the Tauri updater plugin

- Add `tauri-plugin-updater` to `src-tauri/Cargo.toml` dependencies.
- Add the updater plugin registration in `src-tauri/src/lib.rs`.
- Add updater configuration to `tauri.conf.json`:
  - Set the update endpoint(s) (GitHub Releases URL).
  - Embed the public signing key.
- Add the updater permission to the capability files in `src-tauri/capabilities/`.

### Step 3: Implement frontend update UI

- Add a React component/hook that uses `@tauri-apps/plugin-updater` (the JS bindings for the plugin) to:
  - Check for updates on app launch.
  - Show a notification/banner when an update is available.
  - Allow the user to download and install the update.
  - Show download progress.
- Add a "Check for updates" option in the settings/menu.
- Add a version display in the settings.

### Step 4: Sync version numbers

- Align `src-tauri/Cargo.toml` version with `package.json` and `tauri.conf.json` (all should be the same, e.g. `1.0.0`).
- Optionally, add a version bump script that updates all three files at once.

### Step 5: Set up GitHub Actions workflow

- Create `.github/workflows/release.yml` with:
  - Tag-based trigger.
  - Multi-platform build matrix.
  - Tauri build with signing.
  - GitHub Release creation and artifact upload.
- Test with a pre-release tag (e.g. `v1.0.1-beta.1`).

### Step 6: Test the full update cycle

- Build and release a version (e.g. `v1.0.1-beta.1`).
- Install it on a test machine.
- Build and release a newer version (e.g. `v1.0.1-beta.2`).
- Verify the installed app detects the update, downloads it, and installs it correctly.
- Test on all target platforms.

### Step 7: Document the release process

- Document how to create a new release (tag, push, wait for CI).
- Document how to write release notes.
- Document the signing key backup/recovery process.

---

## 8. Configuration Preview

Below is a preview of the key configuration changes needed in `tauri.conf.json` (not exhaustive):

```jsonc
{
  // ... existing config ...
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/MooijGedaan/WorkTape/releases/latest/download/latest.json"
      ],
      "pubkey": "<YOUR_PUBLIC_KEY_HERE>"
    }
  }
}
```

And the Cargo.toml addition:

```toml
tauri-plugin-updater = "2"
```

---

## 9. Estimated Effort

| Step | Effort |
|---|---|
| Step 1: Generate signing keys | 30 minutes |
| Step 2: Configure updater plugin | 1-2 hours |
| Step 3: Frontend update UI | 3-4 hours |
| Step 4: Sync version numbers | 30 minutes |
| Step 5: GitHub Actions workflow | 3-4 hours |
| Step 6: Testing | 2-3 hours |
| Step 7: Documentation | 1 hour |
| **Total** | **~11-15 hours** |

---

## 10. Open Questions

- **Apple Developer Program**: Is there an active Apple Developer account for code signing on macOS? If not, this needs to be set up ($99/year).
- **Windows code signing**: Is a Windows code signing certificate available? Without it, users will see SmartScreen warnings.
- **Private repo considerations**: If the repository becomes private, GitHub Releases URLs will require authentication. In that case, the Cloudflare Workers proxy should be used as a public update endpoint.
- **Update frequency**: Should the app check for updates only on launch, or also periodically while running?
