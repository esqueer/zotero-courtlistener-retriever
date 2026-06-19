# Zotero CourtListener Tools

Two companion tools for citing U.S. court documents in Zotero:

1. **CourtListener Case Fetcher** — a Zotero 7/8/9 plugin that, when you add a
   case PDF, identifies the case on [CourtListener](https://www.courtlistener.com)
   and fills in a proper **Case** item (case name, court, docket number, date,
   reporter, URL). Scanned PDFs with no text layer are OCR'd locally first.
2. **Bluebook Law Review (Slip Opinions & Dockets)** — a CSL citation style that
   extends the standard Bluebook law-review style to cite **unreported slip
   opinions and docket entries** with their docket number and exact decision
   date, and appends the CourtListener URL for accessibility.

They work well together but are independent — use either on its own.

---

## Plugin: CourtListener Case Fetcher

### What it does

When a standalone PDF is added (or via right-click → **Retrieve case from
CourtListener**):

1. Extracts the first pages of text with Zotero's PDF worker.
2. If there's no text layer, runs a **local OCR subprocess** (`ocrmypdf` or
   `tesseract`), replaces the file with the searchable version, and re-indexes.
3. Identifies the case in two tiers:
   - **Docket number + court (primary).** Reads the docket number *and the
     court* from the caption block at the top of page 1, resolves the court name
     to a CourtListener `court_id` using a bundled federal-court table, and
     queries the RECAP search API. (A bare docket number like `1:26-mc-00007` is
     reused across ~15 districts, so the court is what makes the match unique —
     and it's read from the caption, not the body, so a case that *discusses*
     other courts doesn't get mismatched.)
   - **Reporter citation (fallback).** If there's no docket number, the text is
     sent to the `citation-lookup` API to resolve a published opinion.
4. Writes the result onto a Zotero **Case** item. A standalone PDF gets a new
   Case parent; a PDF under a placeholder item (e.g. a "Document") has that
   parent converted to a Case. Collections are preserved.

### Install (end users)

1. Download `courtlistener.xpi` from the [Releases](../../releases) page.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…** and
   select the `.xpi`.
3. Open **Settings → CourtListener** and paste a free CourtListener API token
   (courtlistener.com → Profile → API). Optional but recommended — anonymous
   requests rate-limit quickly.
4. For OCR, install OCRmyPDF (see below) and set the executable path.

### OCR setup (optional, for scanned PDFs)

OCR shells out to a local program — nothing is uploaded. Install **OCRmyPDF**
(recommended) or **Tesseract**:

```bash
# Windows (needs Tesseract + Ghostscript binaries on the system too)
py -3.10 -m pip install ocrmypdf
# macOS
brew install ocrmypdf
```

Then set **Settings → CourtListener → Executable path** to the absolute path,
e.g. `C:\Python310\Scripts\ocrmypdf.exe` or `/opt/homebrew/bin/ocrmypdf`.

### Configuration

| Setting | Default | Notes |
|---|---|---|
| API token | empty | Higher rate limits when set. |
| Auto-process on add | on | Off → use only the right-click action. |
| OCR enabled | on | Runs only when no text layer is found. |
| OCR engine | ocrmypdf | `ocrmypdf` keeps a real PDF; `tesseract` is a fallback. |
| Executable path | empty | **Required** for OCR — absolute path. |
| OCR language | eng | Tesseract language code(s). |
| Text threshold | 200 | Below this many non-space chars → treat as image-only. |

### Limitations

- The docket path needs the case to exist in CourtListener/RECAP; brand-new or
  never-uploaded dockets may be absent.
- Court detection currently covers **federal** courts (district, circuit,
  SCOTUS). State-court captions fall back to the citation path.
- Ambiguous docket numbers with no resolvable court are **declined** rather than
  guessed.
- `Date Decided` for a docket comes from its termination/filing date, which can
  differ from the date printed on a specific order.

### Build the `.xpi` from source

The plugin loads files relative to the archive root, so `manifest.json` must be
at the **top level** of the zip.

```powershell
# Windows
./build.ps1
```
```bash
# macOS / Linux
./build.sh
```

Both produce `dist/courtlistener.xpi`. Or manually: zip the **contents** of
`plugin/` (not the folder) and rename to `.xpi`.

---

## Citation style: Bluebook Law Review (Slip Opinions & Dockets)

A derivative of the official *Bluebook Law Review* CSL style, modified so that
unreported cases cite correctly. For a slip opinion it produces, e.g.:

> In re Motion to Quash Administrative Subpoena to Rhode Island Hospital, No.
> 1:26-mc-00007 (D.R.I. May 13, 2026),
> https://www.courtlistener.com/docket/73290254/in-re-motion-to-quash-administrative-subpoena-to-rhode-island-hospital/.

Changes vs. the upstream style:

- Cases **with no reporter** print `No. <docket number>` and the **exact
  decision date** (Bluebook Rule 10.8.1) instead of just the year.
- Cases **with** a reporter are unchanged (reporter cite, year only).
- Bluebook Table T12 month abbreviations (June, July, Sept., …).
- The case name is rendered verbatim (so a normalized "In re" stays lowercase).
- The item's URL (e.g. the CourtListener link) is appended — **not** strict
  Bluebook, but useful for accessibility.

### Install the style

1. Download `styles/bluebook-law-review-slip-opinions.csl`.
2. Either double-click it (Zotero offers to install), or **Settings → Cite →
   Styles → ＋** and select the file.
3. **Restart Zotero** — styles load at startup, so a freshly added/edited style
   won't appear until you restart.
4. Select **Bluebook Law Review (Slip Opinions & Dockets)** wherever you
   generate citations.

> If you'd rather the URL only appear for unreported cases, see the comment in
> the `access` macro — gate it on `<if variable="container-title" match="none">`.

---

## Repository layout

```
plugin/        Zotero plugin source (zip its contents → courtlistener.xpi)
styles/        the CSL citation style
dist/          build output (git-ignored)
build.ps1      Windows build script
build.sh       macOS/Linux build script
```

## Publishing your own build

Before pushing, replace **`YOUR-GITHUB-USERNAME`** in `plugin/manifest.json` and
`updates.json` with your GitHub handle (and the repo name if you renamed it):

```powershell
# Windows — from the repo root
(Get-ChildItem plugin/manifest.json, updates.json) | ForEach-Object {
  (Get-Content $_ -Raw) -replace 'YOUR-GITHUB-USERNAME','your-handle' |
    Set-Content $_ -NoNewline
}
./build.ps1
```

If you also change the plugin **id**/**author**, update them in
`plugin/manifest.json` and the key in `updates.json` to match.

### Auto-updates

`plugin/manifest.json` declares `update_url` → `updates.json` (served from the
repo's `main` branch via raw.githubusercontent.com). On each release:

1. Bump `version` in `plugin/manifest.json`.
2. Update `updates.json` — add a new entry with the new `version` and an
   `update_link` pointing at that release's `courtlistener.xpi`.
3. Build, then attach the `.xpi` to a GitHub Release tagged `vX.Y.Z`.

Zotero checks `update_url` periodically and offers the update automatically.

## License

- **Plugin code** (`plugin/`): MIT — see [LICENSE](LICENSE).
- **Citation style** (`styles/*.csl`): CC BY-SA 3.0, inherited from the upstream
  Bluebook Law Review style. Modifications remain under the same license.

## Acknowledgements

- [CourtListener](https://www.courtlistener.com) / Free Law Project for the API.
- The upstream *Bluebook Law Review* CSL style by Bruce D'Arcus, Nancy Sims, and
  contributors.

> Not affiliated with or endorsed by the Free Law Project or *The Bluebook*.
