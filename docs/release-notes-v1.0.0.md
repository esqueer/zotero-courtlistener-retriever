# v1.0.0

Pass this file to `gh release create` with `--notes-file`:

```bash
./build.ps1   # or ./build.sh
gh release create v1.0.0 dist/courtlistener.xpi \
  --title "v1.0.0" \
  --notes-file docs/release-notes-v1.0.0.md
```

---

**CourtListener Case Fetcher + Bluebook slip-opinion style — first release.**

A Zotero 7/8/9 plugin that turns a case PDF into a properly populated **Case**
item by looking it up on CourtListener, plus a companion Bluebook citation style
that handles unreported slip opinions and docket entries.

### Plugin highlights
- Add a case PDF → get case name, court, docket number, date, and the
  CourtListener URL filled in automatically (or right-click → **Retrieve case
  from CourtListener**).
- Matches by **docket number + court read from the caption** (the reliable key
  for trial-court filings), with a reporter-citation fallback for published
  opinions.
- **Local OCR** for scanned PDFs via `ocrmypdf`/`tesseract` — nothing leaves
  your machine.

### Citation style
- **Bluebook Law Review (Slip Opinions & Dockets)** prints `No. <docket>` and
  the exact decision date for unreported cases, and appends the source URL.

### Install
- **Plugin:** download `courtlistener.xpi` below → Zotero → Tools → Plugins →
  Install From File. Then set a free CourtListener API token in
  Settings → CourtListener.
- **Style:** download `bluebook-law-review-slip-opinions.csl` from the repo's
  `styles/` folder → Settings → Cite → Styles → ＋ → restart Zotero.

### Requirements
- Zotero 7, 8, or 9.
- A free CourtListener API token (recommended).
- For OCR: a local OCRmyPDF or Tesseract install.

See the [README](../README.md) for full configuration and limitations.
