# Building The Best of Brock for every platform

One codebase ships five ways:

| Platform | Artifact              | How                                   |
|----------|-----------------------|---------------------------------------|
| Web      | Static site (PWA)     | GitHub Pages                          |
| iOS      | `.ipa` via Xcode      | Capacitor wrapper                     |
| Android  | `.apk` / `.aab`       | Capacitor wrapper                     |
| macOS    | `.dmg` / `.zip`       | Electron (`electron-builder`)         |
| Windows  | `.exe` (NSIS) / portable | Electron (`electron-builder`)       |

All artifacts are **unsigned by default**. Signing is opt-in and described at
the end.

---

## 1. Web / PWA (everyone gets this free)

The `index.html`, `manifest.webmanifest`, `sw.js`, and `assets/` at the repo
root form a complete Progressive Web App that loads the existing
`epub_work/OEBPS/` content.

Enable GitHub Pages:

1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**, Branch: **master** (or your default),
   Folder: **/ (root)**
3. Wait ~1 minute; the site is at
   `https://socrtwo.github.io/the-best-of-brock-cookbook/`

The install banner appears automatically on Android Chrome / desktop Chrome /
Edge. On iOS Safari, the user taps **Share → Add to Home Screen**. The PWA
works offline after first load (service worker caches recipes + tools).

To test locally:

```bash
cd the-best-of-brock-cookbook
python3 -m http.server 8000
# open http://localhost:8000/
```

---

## 2. Desktop — Windows + macOS (Electron)

```bash
cd desktop
npm install
npm run start                 # run the app locally
npm run build:win             # -> dist-desktop/*.exe   (Windows only)
npm run build:mac             # -> dist-desktop/*.dmg   (macOS only)
npm run build:all             # both (only works on macOS)
```

Outputs land in `desktop/dist-desktop/`:

- `Best-of-Brock-Setup-1.0.0.exe` — NSIS installer (x64 + arm64)
- `Best-of-Brock-1.0.0-portable.exe` — portable, no install
- `Best-of-Brock-1.0.0.dmg` — macOS disk image (x64 + arm64)
- `Best-of-Brock-1.0.0-mac.zip` — macOS zip

Both the `.exe` and `.dmg` are **unsigned**. Windows SmartScreen will warn the
first few downloads; macOS Gatekeeper will refuse unless the user
right-clicks → Open. See §5 to sign them.

---

## 3. Mobile — iOS + Android (Capacitor)

### First-time setup

```bash
cd mobile
npm install
npm run prepare-web           # stages web assets into mobile/www/
npm run android:init          # generates the Android project (first time)
npm run ios:init              # generates the iOS project (first time, macOS)
```

### Android APK

Prereqs: Android Studio + an Android SDK, Java 17+.

```bash
cd mobile
npm run sync
npm run android:build-debug   # -> mobile/android/app/build/outputs/apk/debug/*.apk
# or open the project in Android Studio:
npm run android:open
```

The **debug APK is unsigned** by Google Play standards but *is* signed with
Android's default debug key — enough to sideload onto any device. For Play
Store distribution you need a release keystore; `capacitor` docs cover it.

### iOS IPA

Prereqs: macOS, Xcode, an Apple Developer account (free account works for
local devices; $99/yr for TestFlight + App Store).

```bash
cd mobile
npm run sync
npm run ios:open              # opens Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities**
2. Team: your personal team (for local device) or paid team (for distribution)
3. **Product → Archive** to produce an `.ipa`

There is no way to produce a distributable iOS `.ipa` without *some* Apple
signing — Apple does not allow unsigned apps on real devices. A free personal
team can sign for your own devices only.

---

## 4. CI: one tag, everything builds

Push a tag beginning with `v`:

```bash
git tag v1.0.0
git push --tags
```

GitHub Actions runs `.github/workflows/release.yml`:

1. Builds Windows `.exe` on `windows-latest`
2. Builds macOS `.dmg` on `macos-latest`
3. Builds Android debug `.apk` on `ubuntu-latest`
4. Publishes a GitHub Release with all artifacts

Manual runs are supported via **Actions → Release → Run workflow**.

---

## 5. Signing (optional)

### 5a. Windows — Azure Trusted Signing, OIDC-based (no secrets in git)

This is the *recommended* modern path. The cert never leaves Azure; GitHub
Actions authenticates via an OIDC federated credential and Azure signs the
`.exe` after electron-builder produces it.

**One-time Azure setup (you do this in the Azure portal):**

1. Create a **Trusted Signing Account** and a **Certificate Profile** (Public
   Trust or Private Trust as appropriate).
2. Create an **App Registration** in Entra ID (Azure AD).
3. On that App Registration → **Certificates & secrets → Federated
   credentials → Add**:
   - Scenario: **GitHub Actions deploying Azure resources**
   - Organization: `socrtwo`
   - Repository: `the-best-of-brock-cookbook`
   - Entity: **Environment** (create one called `production`) **or** Branch /
     Tag — whichever matches how you trigger releases. For tag-based
     releases use entity = **Tag** with pattern `v*`.
   - Name: `gh-release-signing`
4. On your **Trusted Signing Account → Access control (IAM)** → add role
   **Trusted Signing Certificate Profile Signer** to the App Registration you
   just created.

**GitHub setup (Repo → Settings → Secrets and variables → Actions → Variables):**

| Variable | Value |
|---|---|
| `AZURE_TENANT_ID` | your Entra tenant ID |
| `AZURE_CLIENT_ID` | the App Registration's Application (client) ID |
| `AZURE_SUBSCRIPTION_ID` | subscription containing the signing account |
| `TS_ENDPOINT` | e.g. `https://eus.codesigning.azure.net/` |
| `TS_ACCOUNT_NAME` | your Trusted Signing Account name |
| `TS_CERT_PROFILE` | your Certificate Profile name |

No `AZURE_CLIENT_SECRET` required — that's the point of OIDC.

With all six variables set, pushing a `v*` tag will sign the Windows
binaries. If any variable is missing, the signing step is skipped and you
still get an unsigned `.exe`.

### 5b. macOS — Apple Developer ID signing + notarization

The Electron scaffold leaves `identity: null` which skips signing. To enable:

1. Install your Developer ID certificate into the build machine's Keychain.
2. Remove `"identity": null` from `desktop/package.json`.
3. Set env vars for notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
   `APPLE_TEAM_ID`, and add `"notarize": { "teamId": "..." }` under `build.mac`.

macOS signing requires running on macOS and currently cannot be done purely
in the cloud without installing your Apple certificate on the runner.

### 5c. Android — release keystore

Create a keystore once:

```bash
keytool -genkey -v -keystore brock.keystore -alias brock \
  -keyalg RSA -keysize 2048 -validity 10000
```

Stash it as base64 in a secret (`ANDROID_KEYSTORE_BASE64`) plus passwords,
and sign via `gradle assembleRelease`. This is only needed for Play Store
distribution; sideloaded debug APKs work fine for personal use.

---

## 6. Rebuilding the EPUB

The `epub_work/` directory is the unpacked source for `TheBestofBrock.epub`.
To repack after edits:

```bash
cd epub_work
rm -f ../TheBestofBrock.epub
zip -X0 ../TheBestofBrock.epub mimetype
zip -Xur9D ../TheBestofBrock.epub META-INF OEBPS
```

---

## 7. Directory map

```
the-best-of-brock-cookbook/
├── index.html               ← web PWA entry
├── manifest.webmanifest     ← PWA manifest
├── sw.js                    ← service worker (offline cache)
├── assets/                  ← icons + recipes.json catalog
├── TheBestofBrock.epub      ← the classic EPUB
├── epub_work/OEBPS/         ← unpacked EPUB source (recipes + tools)
│   ├── Text/                ← recipe pages (Section0002.xhtml, …)
│   ├── Misc/                ← Scaler.js, Timer.js, Shopping.js
│   ├── Styles/              ← tools-modern.css, book-modern.css
│   ├── Images/, Fonts/, Audio/
├── desktop/                 ← Electron (Windows + macOS)
├── mobile/                  ← Capacitor (iOS + Android)
└── .github/workflows/
    └── release.yml          ← CI: one tag → five artifacts
```
