/* eslint-disable no-unused-vars */
// CourtListener Case Fetcher — bootstrap entry point.
// Works on Zotero 7, 8, and 9 (bootstrapped plugin model).

var CourtListener; // the namespace object defined in lib.js
var chromeHandle;

const PLUGIN_ID = "courtlistener-case-fetcher@esqueer";

function log(msg) {
  Zotero.debug("[CourtListener] " + msg);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function install() {}

async function startup({ id, version, rootURI }) {
  log("Starting up v" + version);

  // Load the main logic into this scope. We pass our globals through so the
  // subscript can register observers and reach Zotero APIs.
  Services.scriptloader.loadSubScript(rootURI + "lib.js");
  Services.scriptloader.loadSubScript(rootURI + "courts-data.js");

  CourtListener.init({ id, version, rootURI });

  // Preference pane.
  Zotero.PreferencePanes.register({
    pluginID: PLUGIN_ID,
    src: rootURI + "preferences.xhtml",
    label: "CourtListener",
  });

  // Item-tree context menu (Zotero 8+ MenuManager). Older builds fall back to
  // DOM injection in onMainWindowLoad().
  CourtListener.registerMenu();

  // Watch for newly added PDF attachments.
  CourtListener.registerNotifier();
}

function shutdown() {
  log("Shutting down");
  if (CourtListener) {
    CourtListener.unregisterNotifier();
    CourtListener.unregisterMenu();
    CourtListener = undefined;
  }
}

function uninstall() {}

// ---------------------------------------------------------------------------
// Window hooks (used only for the legacy menu fallback)
// ---------------------------------------------------------------------------

function onMainWindowLoad({ window }) {
  if (CourtListener) CourtListener.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  if (CourtListener) CourtListener.onMainWindowUnload(window);
}
