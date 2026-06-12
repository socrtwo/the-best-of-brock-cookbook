# The Best of Brock — Interactive Cookbook

<!--PAGES_LINK_BANNER-->
> 🌐 **Live page:** [https://socrtwo.github.io/the-best-of-brock-cookbook/](https://socrtwo.github.io/the-best-of-brock-cookbook/)  
> 📦 **Releases:** [github.com/socrtwo/the-best-of-brock-cookbook/releases](https://github.com/socrtwo/the-best-of-brock-cookbook/releases)
<!--/PAGES_LINK_BANNER-->

An interactive cookbook with **211 recipes**, available as an installable
progressive web app and as native-style desktop and mobile builds. It began
as an ePub and is growing JavaScript applets attached to each recipe:

- ⏲️ Kitchen timer
- ✖️ Recipe multiplier / scaler
- ⚖️ Units conversion tool
- 🛒 Shopping list

## Use it

Open the [live page](https://socrtwo.github.io/the-best-of-brock-cookbook/)
in any browser — or install it as an app from the browser menu (it works
offline thanks to the service worker). Prefer an ebook? Grab
`TheBestofBrock.epub` from the repo or a release.

## Repo layout

| Path | Purpose |
|---|---|
| `index.html`, `sw.js`, `manifest.webmanifest`, `assets/` | The PWA (recipes live in `assets/recipes.json`) |
| `TheBestofBrock.epub` | The ePub edition |
| `epub_work/` | Source material used to build the ePub and recipe data |
| `desktop/` | Electron wrapper (macOS `.dmg`, Windows `.exe`, Linux) |
| `mobile/` | Capacitor wrapper (Android `.apk`, iOS `.ipa`) |
| `*.py` | Recipe processing / modernization scripts |
| `BUILD.md` | How to build every platform artifact |
| `SIGNING.md` | Optional code-signing setup |

## Building

See [BUILD.md](BUILD.md) — one codebase ships five ways (Web/PWA, iOS,
Android, macOS, Windows). Releases are produced by
`.github/workflows/release.yml`.

## License

[MIT](LICENSE) (code). Recipe content © its respective contributors.
