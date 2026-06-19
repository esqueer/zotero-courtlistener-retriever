# Forum announcement (draft)

Post to the Zotero Forums under **Plugins** (https://forums.zotero.org/), or
share on r/zotero. Replace esqueer with your handle before posting.

---

**Subject:** New plugin: CourtListener Case Fetcher (auto-fill case metadata + local OCR)

Hi all —

I've released a plugin that fills in Zotero **Case** items from a court PDF by
looking the case up on [CourtListener](https://www.courtlistener.com). Works on
Zotero 7, 8, and 9.

**What it does**
- Add a case PDF (or right-click → *Retrieve case from CourtListener*) and it
  fills in case name, court, docket number, decision date, and the CourtListener
  URL.
- Matches trial-court filings by **docket number + court** (read from the
  caption), which is what actually disambiguates reused docket numbers; falls
  back to reporter-citation lookup for published opinions.
- **OCRs scanned PDFs locally** first (via `ocrmypdf`/`tesseract`) when there's
  no text layer — nothing is uploaded.

I've also included a companion CSL style, **Bluebook Law Review (Slip Opinions &
Dockets)**, that cites unreported cases with their docket number and exact date
(Rule 10.8.1) and appends the CourtListener link for accessibility.

**Get it:** https://github.com/esqueer/zotero-courtlistener
(download the `.xpi` from Releases; the `.csl` is in `styles/`).

**Notes / limitations**
- A free CourtListener API token is recommended (Profile → API).
- Court detection currently covers federal courts (district, circuit, SCOTUS);
  state-court captions fall back to citation lookup.
- OCR needs a local OCRmyPDF/Tesseract install.

Feedback and issues welcome on the GitHub tracker. Not affiliated with the Free
Law Project or *The Bluebook*.
