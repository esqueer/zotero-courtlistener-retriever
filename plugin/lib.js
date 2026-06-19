// CourtListener Case Fetcher — main logic.
// Loaded as a subscript by bootstrap.js, so `Zotero` and the bootstrap globals
// (PLUGIN_ID, log) are already in scope. courts-data.js (loaded right after
// this file) populates CourtListener._courtsData.

CourtListener = {
  _rootURI: null,
  _notifierID: null,
  _courtsData: [],
  _courtIndex: null,
  _inFlight: new Set(),

  CL_BASE: "https://www.courtlistener.com",

  // -------------------------------------------------------------------------
  // Setup / teardown
  // -------------------------------------------------------------------------

  init({ rootURI }) {
    this._rootURI = rootURI;
  },

  getPref(key) {
    return Zotero.Prefs.get("extensions.courtlistener." + key, true);
  },

  setPref(key, value) {
    return Zotero.Prefs.set("extensions.courtlistener." + key, value, true);
  },

  // -------------------------------------------------------------------------
  // Notifier: react to newly added standalone PDF attachments
  // -------------------------------------------------------------------------

  registerNotifier() {
    const callback = {
      notify: async (event, type, ids) => {
        if (event !== "add" || type !== "item") return;
        if (!this.getPref("autoProcess")) return;
        try {
          await this._onItemsAdded(ids);
        } catch (e) {
          log("notifier error: " + e);
        }
      },
    };
    this._notifierID = Zotero.Notifier.registerObserver(
      callback,
      ["item"],
      "courtlistener"
    );
    log("Notifier registered: " + this._notifierID);
  },

  unregisterNotifier() {
    if (this._notifierID) {
      Zotero.Notifier.unregisterObserver(this._notifierID);
      this._notifierID = null;
    }
  },

  async _onItemsAdded(ids) {
    for (const id of ids) {
      const item = await Zotero.Items.getAsync(id);
      if (!item || !item.isAttachment()) continue;
      if (item.attachmentContentType !== "application/pdf") continue;
      if (item.parentID) continue; // only auto-handle freshly added standalone PDFs
      this.processAttachment(item).catch((e) => log("auto process error: " + e));
    }
  },

  // -------------------------------------------------------------------------
  // Context menu — injected directly (works on Zotero 7/8/9)
  // -------------------------------------------------------------------------

  registerMenu() {
    for (const win of Zotero.getMainWindows()) this._injectMenu(win);
  },

  unregisterMenu() {
    for (const win of Zotero.getMainWindows()) this._removeMenu(win);
  },

  onMainWindowLoad(win) {
    this._injectMenu(win);
  },

  onMainWindowUnload(win) {
    this._removeMenu(win);
  },

  _injectMenu(win) {
    try {
      const doc = win.document;
      if (doc.getElementById("courtlistener-itemmenu")) return;
      const itemmenu = doc.getElementById("zotero-itemmenu");
      if (!itemmenu) return;
      const sep = doc.createXULElement("menuseparator");
      sep.id = "courtlistener-itemmenu-sep";
      const menuitem = doc.createXULElement("menuitem");
      menuitem.id = "courtlistener-itemmenu";
      menuitem.setAttribute("label", "Retrieve case from CourtListener");
      menuitem.addEventListener("command", () => this.processSelected());
      itemmenu.appendChild(sep);
      itemmenu.appendChild(menuitem);
      log("Injected context menu into a main window");
    } catch (e) {
      log("_injectMenu: " + e);
    }
  },

  _removeMenu(win) {
    try {
      for (const id of ["courtlistener-itemmenu", "courtlistener-itemmenu-sep"]) {
        const el = win.document.getElementById(id);
        if (el) el.remove();
      }
    } catch (e) {
      /* window gone */
    }
  },

  _selectedPdfAttachments() {
    const pane = Zotero.getActiveZoteroPane();
    if (!pane) return [];
    const selected = pane.getSelectedItems();
    const pdfs = [];
    for (const item of selected) {
      if (item.isAttachment() && item.attachmentContentType === "application/pdf") {
        pdfs.push(item);
      } else if (item.isRegularItem()) {
        const attID = item
          .getAttachments()
          .find((aid) => {
            const a = Zotero.Items.get(aid);
            return a && a.attachmentContentType === "application/pdf";
          });
        if (attID) pdfs.push(Zotero.Items.get(attID));
      }
    }
    return pdfs;
  },

  async processSelected() {
    const pdfs = this._selectedPdfAttachments();
    if (!pdfs.length) {
      this._toast("Select a PDF (or an item with a PDF attachment) first.");
      return;
    }
    for (const att of pdfs) await this.processAttachment(att);
  },

  // -------------------------------------------------------------------------
  // Core pipeline
  // -------------------------------------------------------------------------

  async processAttachment(attachment) {
    if (this._inFlight.has(attachment.id)) return;
    this._inFlight.add(attachment.id);

    const progress = this._progress("CourtListener", "Reading PDF…");
    try {
      let text = await this._getPdfText(attachment);
      const threshold = Number(this.getPref("textThreshold")) || 200;

      if (text.replace(/\s+/g, "").length < threshold && this.getPref("ocrEnabled")) {
        progress.update("No text layer — running OCR…");
        if (await this._ocrAttachment(attachment)) {
          text = await this._getPdfText(attachment);
        }
      }

      if (text.replace(/\s+/g, "").length < threshold) {
        progress.done("Could not extract usable text from this PDF.", false);
        return;
      }

      progress.update("Identifying case on CourtListener…");
      const result = await this._lookupCase(text);
      if (!result) {
        progress.done(
          "No confident CourtListener match (need a docket number + court, or a reporter citation).",
          false
        );
        return;
      }

      await this._applyMetadata(attachment, result.meta);
      progress.done(
        "Saved: " + (result.meta.caseName || "case") + "  [" + result.via + "]",
        true
      );
    } catch (e) {
      log("processAttachment error: " + e + "\n" + (e.stack || ""));
      progress.done("Error: " + e.message, false);
    } finally {
      this._inFlight.delete(attachment.id);
    }
  },

  async _getPdfText(attachment, maxPages = 5) {
    try {
      const res = await Zotero.PDFWorker.getFullText(attachment.id, maxPages, true);
      if (res && res.text && res.text.trim()) return res.text;
    } catch (e) {
      log("PDFWorker.getFullText failed: " + e);
    }
    try {
      const t = await attachment.attachmentText;
      if (t && t.trim()) return t;
    } catch (e) {
      /* not indexed */
    }
    return "";
  },

  // -------------------------------------------------------------------------
  // OCR via local subprocess (ocrmypdf or tesseract)
  // -------------------------------------------------------------------------

  async _ocrAttachment(attachment) {
    const exe = (this.getPref("ocrPath") || "").trim();
    if (!exe) {
      this._toast("OCR is on but no OCR executable path is set (Settings → CourtListener).");
      return false;
    }
    if (!(await IOUtils.exists(exe))) {
      this._toast("OCR executable not found: " + exe);
      return false;
    }
    const input = await attachment.getFilePathAsync();
    if (!input) {
      this._toast("Could not locate the PDF file on disk.");
      return false;
    }

    const engine = this.getPref("ocrEngine") || "ocrmypdf";
    const lang = this.getPref("ocrLanguage") || "eng";
    const output = input.replace(/\.pdf$/i, "") + ".cl-ocr.pdf";

    let args;
    if (engine === "tesseract") {
      args = [input, output.replace(/\.pdf$/i, ""), "-l", lang, "pdf"];
    } else {
      args = ["--skip-text", "--language", lang, "--output-type", "pdf", input, output];
    }

    try {
      log("OCR exec: " + exe + " " + args.join(" "));
      await Zotero.Utilities.Internal.exec(exe, args);
    } catch (e) {
      log("OCR exec failed: " + e);
      this._toast("OCR failed: " + e.message);
      return false;
    }
    if (!(await IOUtils.exists(output))) {
      this._toast("OCR produced no output file.");
      return false;
    }
    try {
      await IOUtils.copy(output, input);
      await IOUtils.remove(output);
      await Zotero.FullText.indexItems([attachment.id], { complete: true });
    } catch (e) {
      log("Post-OCR file swap/index failed: " + e);
      return false;
    }
    return true;
  },

  // -------------------------------------------------------------------------
  // Matching: docket-number + court first, then reporter citation
  // -------------------------------------------------------------------------

  async _lookupCase(text) {
    const caption = text.slice(0, 1800);

    // 1) Trial-court / appellate filings: docket number + court from caption.
    const docketNums = this._extractDocketNumbers(caption);
    const courtId = this._detectCourt(caption);
    if (docketNums.length) {
      const meta = await this._lookupByDocket(docketNums, courtId, caption);
      if (meta) return { meta, via: "docket" };
    }

    // 2) Published opinions: reporter citation in the text.
    const meta = await this._lookupByCitation(text);
    if (meta) return { meta, via: "citation" };

    return null;
  },

  _extractDocketNumbers(text) {
    const out = [];
    const seen = new Set();
    const push = (n) => {
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    };
    // District: 1:26-mc-00007 (ignore trailing judge initials like -MSM-AEM)
    let m;
    const reDist = /\b(\d{1,2}:\d{2}-[a-z]{1,4}-\d{3,6})\b/gi;
    while ((m = reDist.exec(text))) push(m[1].toLowerCase());
    // Appellate / misc: "No. 26-10431" or "Misc. Action No. 08-33"
    const reApp = /\bNo\.?\s+(\d{2}-\d{2,6})\b/gi;
    while ((m = reApp.exec(text))) push(m[1]);
    return out.slice(0, 4);
  },

  _buildCourtIndex() {
    if (this._courtIndex) return this._courtIndex;
    const byKey = {}; // "<DIV>|<STATE>" -> id
    const appellate = []; // {id, phrase}
    const states = new Set();
    for (const [id, short] of this._courtsData || []) {
      if (/Circuit/.test(short)) {
        appellate.push({ id, phrase: short.toUpperCase() });
        continue;
      }
      if (short === "Supreme Court") {
        appellate.push({ id, phrase: "SUPREME COURT OF THE UNITED STATES" });
        continue;
      }
      if (short === "District of Columbia") {
        byKey["D|DISTRICT OF COLUMBIA"] = id;
        continue;
      }
      let mm = short.match(/^([A-Z])\.D\.\s+(.+)$/); // "N.D. Texas"
      if (mm) {
        const state = mm[2].toUpperCase();
        byKey[mm[1] + "|" + state] = id;
        states.add(state);
        continue;
      }
      mm = short.match(/^D\.\s+(.+)$/); // "D. Rhode Island"
      if (mm) {
        const state = mm[1].toUpperCase();
        byKey["D|" + state] = id;
        states.add(state);
      }
    }
    // Aliases for circuits written long-form in captions.
    appellate.push({ id: "cadc", phrase: "DISTRICT OF COLUMBIA CIRCUIT" });
    this._courtIndex = {
      byKey,
      appellate,
      states: [...states].sort((a, b) => b.length - a.length),
    };
    return this._courtIndex;
  },

  _detectCourt(caption) {
    const C = caption.toUpperCase().replace(/\s+/g, " ");
    const idx = this._buildCourtIndex();

    // Appellate / SCOTUS first (so "D.C. Circuit" isn't read as DC district).
    for (const a of idx.appellate) {
      if (C.includes(a.phrase)) return a.id;
    }

    if (/DISTRICT OF COLUMBIA(?! CIRCUIT)/.test(C)) return idx.byKey["D|DISTRICT OF COLUMBIA"];

    let div = null;
    if (/NORTHERN DISTRICT/.test(C)) div = "N";
    else if (/SOUTHERN DISTRICT/.test(C)) div = "S";
    else if (/EASTERN DISTRICT/.test(C)) div = "E";
    else if (/WESTERN DISTRICT/.test(C)) div = "W";
    else if (/MIDDLE DISTRICT/.test(C)) div = "M";
    else if (/CENTRAL DISTRICT/.test(C)) div = "C";
    else if (/DISTRICT OF/.test(C)) div = "D";
    if (!div) return null;

    for (const state of idx.states) {
      if (C.includes(state)) {
        const id = idx.byKey[div + "|" + state];
        if (id) return id;
      }
    }
    return null;
  },

  async _searchRecap(params) {
    const qs = new URLSearchParams(Object.assign({ type: "r" }, params)).toString();
    const xhr = await Zotero.HTTP.request("GET", this.CL_BASE + "/api/rest/v4/search/?" + qs, {
      headers: this._authHeaders(),
      responseType: "json",
    });
    const data = xhr.response || JSON.parse(xhr.responseText || "{}");
    return data.results || [];
  },

  async _lookupByDocket(docketNums, courtId, caption) {
    for (const num of docketNums) {
      let results = [];
      if (courtId) {
        results = await this._searchRecap({ docket_number: num, court: courtId });
      }
      if (!results.length) {
        // No court (or court filter found nothing): pull all and disambiguate.
        const all = await this._searchRecap({ docket_number: num });
        if (!all.length) continue;
        if (courtId) {
          const byCourt = all.filter((r) => r.court_id === courtId);
          if (byCourt.length) results = byCourt;
        }
        if (!results.length && all.length === 1) results = all;
        if (!results.length) results = this._disambiguateByCaption(all, caption);
        if (!results.length) {
          log("Docket " + num + " ambiguous across " + all.length + " courts; skipping.");
          continue;
        }
      }
      return this._metaFromRecap(results[0]);
    }
    return null;
  },

  _disambiguateByCaption(results, caption) {
    // Keep results whose case name shares a distinctive token with the caption.
    const cap = caption.toLowerCase();
    const scored = results
      .map((r) => {
        const toks = String(r.caseName || "")
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((t) => t.length > 4 && !["motion", "subpoena", "administrative"].includes(t));
        const hits = toks.filter((t) => cap.includes(t)).length;
        return { r, hits };
      })
      .filter((x) => x.hits >= 2)
      .sort((a, b) => b.hits - a.hits);
    return scored.length === 1 || (scored.length && scored[0].hits > (scored[1]?.hits || 0))
      ? [scored[0].r]
      : [];
  },

  _metaFromRecap(r) {
    return {
      caseName: this._normalizeCaseName(r.caseName),
      // Bluebook court abbreviation (e.g. "D.R.I."), not the verbose name.
      court: r.court_citation_string || r.court || "",
      dateDecided: this._normDate(r.dateTerminated || r.dateFiled),
      docketNumber: r.docketNumber || "",
      reporter: "",
      reporterVolume: "",
      firstPage: "",
      url: r.docket_absolute_url ? this.CL_BASE + r.docket_absolute_url : "",
      extra: r.docket_id ? "CourtListener docket: " + r.docket_id : "",
    };
  },

  // -------------------------------------------------------------------------
  // Citation-lookup path (published opinions with a reporter cite)
  // -------------------------------------------------------------------------

  async _lookupByCitation(text) {
    const body = "text=" + encodeURIComponent(text.slice(0, 60000));
    const headers = Object.assign(
      { "Content-Type": "application/x-www-form-urlencoded" },
      this._authHeaders()
    );
    let xhr;
    try {
      xhr = await Zotero.HTTP.request("POST", this.CL_BASE + "/api/rest/v4/citation-lookup/", {
        headers,
        body,
        responseType: "json",
      });
    } catch (e) {
      const st = e.xmlhttp && e.xmlhttp.status;
      if (st === 401) throw new Error("CourtListener rejected the API token (401).");
      if (st === 429) throw new Error("CourtListener rate limit hit (429). Try again shortly.");
      throw e;
    }
    const results = xhr.response || JSON.parse(xhr.responseText || "[]");
    if (!Array.isArray(results)) return null;
    let best = results.find((r) => r.status === 200 && r.clusters && r.clusters.length);
    if (!best) best = results.find((r) => r.clusters && r.clusters.length);
    if (!best) return null;

    let cluster = best.clusters[0];
    if (cluster.id) {
      try {
        cluster = await this._clGet(this.CL_BASE + "/api/rest/v4/clusters/" + cluster.id + "/");
      } catch (e) {
        log("cluster fetch failed: " + e);
      }
    }
    const meta = {
      caseName: this._normalizeCaseName(cluster.case_name || cluster.case_name_full),
      dateDecided: this._normDate(cluster.date_filed),
      url: cluster.absolute_url ? this.CL_BASE + cluster.absolute_url : "",
      reporter: "",
      reporterVolume: "",
      firstPage: "",
      court: "",
      docketNumber: "",
      extra: cluster.id ? "CourtListener cluster: " + cluster.id : "",
    };
    const cites = cluster.citations || [];
    if (cites.length) {
      const official = cites.find((c) => /official/i.test(String(c.type))) || cites[0];
      meta.reporter = official.reporter || "";
      meta.reporterVolume = official.volume ? String(official.volume) : "";
      meta.firstPage = official.page ? String(official.page) : "";
    }
    if (cluster.docket) {
      try {
        const docket = await this._clGet(cluster.docket);
        meta.docketNumber = docket.docket_number || "";
        let courtUrl = docket.court;
        if (!courtUrl && docket.court_id) {
          courtUrl = this.CL_BASE + "/api/rest/v4/courts/" + docket.court_id + "/";
        }
        if (courtUrl) {
          const court = await this._clGet(courtUrl);
          meta.court = court.citation_string || court.short_name || court.full_name || "";
        }
      } catch (e) {
        log("docket/court fetch failed: " + e);
      }
    }
    return meta;
  },

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  _authHeaders() {
    const token = (this.getPref("apiToken") || "").trim();
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = "Token " + token;
    return headers;
  },

  async _clGet(url) {
    const xhr = await Zotero.HTTP.request("GET", url, {
      headers: this._authHeaders(),
      responseType: "json",
    });
    return xhr.response || JSON.parse(xhr.responseText || "{}");
  },

  _normDate(d) {
    return d ? String(d).slice(0, 10) : "";
  },

  // Produce a Bluebook-ready case name: title-case ALL-CAPS names, then fix
  // procedural phrases (Rule 10.2.1) — "In re", "Ex parte", "In the Matter of".
  _normalizeCaseName(name) {
    if (!name) return "";
    let n = String(name).trim();
    const letters = n.replace(/[^A-Za-z]/g, "").length;
    const caps = n.replace(/[^A-Z]/g, "").length;
    if (letters && caps / letters > 0.7) n = this._titleCase(n);
    n = n.replace(/^In\s+the\s+Matter\s+of\s+/i, "In re ");
    n = n.replace(/^In\s+Re\b:?\s*/i, "In re ");
    n = n.replace(/^Ex\s+Parte\b:?\s*/i, "Ex parte ");
    return n.trim();
  },

  _titleCase(s) {
    const small = new Set([
      "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
      "nor", "of", "on", "onto", "or", "over", "the", "to", "v", "v.", "vs",
      "vs.", "via", "with",
    ]);
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w, i) =>
        i !== 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
      )
      .join(" ");
  },

  // -------------------------------------------------------------------------
  // Writing back to Zotero
  // -------------------------------------------------------------------------

  async _applyMetadata(attachment, meta) {
    const caseTypeID = Zotero.ItemTypes.getID("case");
    let parent = attachment.parentID
      ? await Zotero.Items.getAsync(attachment.parentID)
      : null;
    const createdParent = !parent;

    if (!parent) {
      parent = new Zotero.Item("case");
      parent.libraryID = attachment.libraryID;
    } else if (parent.itemTypeID !== caseTypeID) {
      // Convert the placeholder parent (e.g. "Document") into a Case so the
      // legal fields are valid and actually save.
      parent.setType(caseTypeID);
    }

    const setIf = (field, value) => {
      if (!value) return;
      try {
        const fid = Zotero.ItemFields.getID(field);
        if (fid && Zotero.ItemFields.isValidForType(fid, parent.itemTypeID)) {
          parent.setField(field, value);
        }
      } catch (e) {
        log("setField " + field + " skipped: " + e);
      }
    };

    setIf("caseName", meta.caseName);
    setIf("court", meta.court);
    setIf("dateDecided", meta.dateDecided);
    setIf("docketNumber", meta.docketNumber);
    setIf("reporter", meta.reporter);
    setIf("reporterVolume", meta.reporterVolume);
    setIf("firstPage", meta.firstPage);
    setIf("url", meta.url);
    if (meta.extra) {
      const existing = parent.getField("extra");
      if (!existing || !existing.includes(meta.extra)) {
        parent.setField("extra", existing ? existing + "\n" + meta.extra : meta.extra);
      }
    }

    await parent.saveTx();

    if (createdParent) {
      const collections = attachment.getCollections();
      for (const cid of collections) parent.addToCollection(cid);
      if (collections.length) await parent.saveTx();
      attachment.parentID = parent.id;
      for (const cid of attachment.getCollections()) attachment.removeFromCollection(cid);
      await attachment.saveTx();
    }
  },

  // -------------------------------------------------------------------------
  // UI helpers
  // -------------------------------------------------------------------------

  _progress(headline, message) {
    const pw = new Zotero.ProgressWindow({ closeOnClick: true });
    pw.changeHeadline(headline);
    const ip = new pw.ItemProgress("", message);
    pw.show();
    return {
      update: (msg) => {
        try {
          ip.setText(msg);
        } catch (e) {}
      },
      done: (msg, success) => {
        try {
          ip.setText(msg);
          ip.setProgress(100);
          if (!success) ip.setError();
          pw.startCloseTimer(success ? 6000 : 9000);
        } catch (e) {}
      },
    };
  },

  _toast(message) {
    try {
      const pw = new Zotero.ProgressWindow({ closeOnClick: true });
      pw.changeHeadline("CourtListener");
      new pw.ItemProgress("", message);
      pw.show();
      pw.startCloseTimer(7000);
    } catch (e) {
      log("toast: " + message);
    }
  },
};
