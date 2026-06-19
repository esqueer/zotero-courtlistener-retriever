// Default preferences for the CourtListener Case Fetcher plugin.
// Stored on the raw "extensions." branch (read with the global=true flag).

pref("extensions.courtlistener.apiToken", "");
pref("extensions.courtlistener.autoProcess", true);

// OCR (local subprocess). ocrEngine is "ocrmypdf" or "tesseract".
// ocrPath must be the ABSOLUTE path to the executable, e.g.
//   Windows: C:\\Python310\\Scripts\\ocrmypdf.exe
//   macOS:   /opt/homebrew/bin/ocrmypdf
pref("extensions.courtlistener.ocrEnabled", true);
pref("extensions.courtlistener.ocrEngine", "ocrmypdf");
pref("extensions.courtlistener.ocrPath", "");
pref("extensions.courtlistener.ocrLanguage", "eng");

// Min length of extracted text (chars) below which a PDF is treated as
// image-only and sent to OCR.
pref("extensions.courtlistener.textThreshold", 200);
