# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the plugin follows
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-19

First public release.

### Plugin — CourtListener Case Fetcher
- Auto-populates a Zotero **Case** item when a standalone PDF is added, and adds
  a right-click **"Retrieve case from CourtListener"** action (Zotero 7/8/9).
- **Docket-number + court matching** as the primary strategy: reads the docket
  number and court from the caption block, resolves the court via a bundled
  federal-court table, and queries the RECAP search API. Declines to guess when
  a docket number is ambiguous and the court can't be resolved.
- **Reporter-citation fallback** via the CourtListener `citation-lookup` API for
  published opinions.
- **Local OCR** for scanned PDFs with no text layer, shelling out to a local
  `ocrmypdf` (or `tesseract`) subprocess; nothing is uploaded.
- Maps fields onto the Zotero Case schema (case name, court, date decided,
  docket number, reporter/volume/first page, URL). Converts a placeholder parent
  item into a Case and preserves collections.
- Bluebook-friendly normalization: court stored as its Bluebook abbreviation
  (e.g. `D.R.I.`), and case names normalized ("In re", title-casing ALL-CAPS).
- Preferences pane: API token, auto-process toggle, OCR engine/path/language,
  text threshold.

### Citation style — Bluebook Law Review (Slip Opinions & Dockets)
- Cites **unreported** cases with `No. <docket number>` and the **exact decision
  date** (Bluebook Rule 10.8.1); reported cases keep reporter + year.
- Bluebook Table T12 month abbreviations.
- Appends the item URL (e.g. the CourtListener link) for accessibility.
- Verbatim case-name rendering so normalized "In re" survives.

[1.0.0]: https://github.com/esqueer/zotero-courtlistener/releases/tag/v1.0.0
