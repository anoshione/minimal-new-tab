import { renderClock } from "../../components/clock/clock.js";
import { renderWeather } from "../../components/weather/weather.js";
import { renderBookmarks } from "../../components/bookmarks/bookmarks.js";
import { renderSidebar } from "../../components/sidebar/sidebar.js";
import { initNavigationHelper } from "../../shared/navigation-helper.js";

initNavigationHelper();

if (localStorage.getItem("settings") === null) {
  localStorage.setItem("settings", JSON.stringify(defaultSettings));
}

// Initialize theme
let theme = localStorage.getItem("theme") || "system";

function initTheme() {
  document.body.style.backgroundColor = null;
  applyTheme(theme);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTheme);
} else {
  initTheme();
}

let storedSettings = {};
try {
  storedSettings = JSON.parse(localStorage.getItem("settings")) || {};
} catch (e) {
  storedSettings = {};
}
// Stored keys win, but missing keys fall back to the current defaults so
// older settings stores pick up newly added options automatically.
const settings = { ...defaultSettings, ...storedSettings };

// settings_keys that the app no longer knows (old top-right links, pixel
// art, Unsplash, keyboard nav, bangs/search, custom CSS): strip them from
// the store once so user data stays tidy.
const KNOWN_KEYS = new Set(Object.keys(defaultSettings));
const removedKeys = Object.keys(settings).filter((k) => !KNOWN_KEYS.has(k));
if (removedKeys.length) {
  removedKeys.forEach((k) => delete settings[k]);
  localStorage.setItem("settings", JSON.stringify(settings));
}

// Widget defaults: calendar + history are checked by default. Apply once
// per store (flag lives outside "settings" so options saves can't drop it)
// so users who untoggle them later are not re-opted-in on every load.
if (!localStorage.getItem("widgetsV2Applied")) {
  const w = Array.isArray(settings.sidebarWidgets) ? settings.sidebarWidgets : [];
  settings.sidebarWidgets = Array.from(new Set([...w, "calendar", "history"]));
  localStorage.setItem("settings", JSON.stringify(settings));
  localStorage.setItem("widgetsV2Applied", "1");
}

// Bundled default icons: apply once per store so seeded/existing bookmarks
// show their shipped icons without waiting for favicon services. Only empty
// iconUrls are filled — anything the user set themselves always wins, and
// one-time means later clearing a bookmark's icon stays cleared.
if (!localStorage.getItem("defaultIconsApplied") && window.BMColumns) {
  try {
    const HOST_ICONS = {
      "messenger.com": "../../assets/icons/messenger.png",
      "web.telegram.org": "../../assets/icons/telegram.png",
      "web.whatsapp.com": "../../assets/icons/whatsapp.png",
      "miyomi.app": "../../assets/icons/miyomi.webp",
      "psarips.com": "../../assets/icons/psa.png",
      "github.com": "../../assets/icons/github.png",
      "vercel.com": "../../assets/icons/vercel.png",
      "mail.google.com": "../../assets/icons/gmail.png",
      "docs.google.com": "../../assets/icons/google-docs.png",
      "keep.google.com": "../../assets/icons/google-keep.png",
      "drive.google.com": "../../assets/icons/google-drive.png",
      "photos.google.com": "../../assets/icons/google-photos.png"
    };
    const normalizeHost = (h) => (h || "").toLowerCase().replace(/^www\./, "");
    const cols = window.BMColumns.get();
    let changed = false;
    cols.forEach((col) => (col.items || []).forEach((it) => {
      if (it.iconUrl) return;
      let host = "";
      try { host = normalizeHost(new URL(it.url).hostname); } catch {}
      const icon = HOST_ICONS[host];
      if (icon) {
        it.iconUrl = icon;
        changed = true;
      }
    }));
    if (changed) window.BMColumns.save(cols);
    localStorage.setItem("defaultIconsApplied", "1");
  } catch (e) {}
}

/* Icon follow-up: the play-button asset belongs to FMHY, not YouTube.
   One-time: clear the mis-mapped bundled icon so YouTube falls back to its
   normal favicon again, and stamp the play button onto FMHY (only when the
   slot is empty — user-set icons always win). */
if (!localStorage.getItem("defaultIconsV2Applied") && window.BMColumns) {
  try {
    const normalizeHost = (h) => (h || "").toLowerCase().replace(/^www\./, "");
    const cols = window.BMColumns.get();
    let changed = false;
    cols.forEach((col) => (col.items || []).forEach((it) => {
      if (it.iconUrl && it.iconUrl.indexOf("/assets/icons/youtube.png") !== -1) {
        it.iconUrl = "";
        changed = true;
      }
      let host = "";
      try { host = normalizeHost(new URL(it.url).hostname); } catch {}
      if (host.indexOf("fmhy") === 0 && !it.iconUrl) {
        it.iconUrl = "../../assets/icons/fmhy.png";
        changed = true;
      }
    }));
    if (changed) window.BMColumns.save(cols);
    localStorage.setItem("defaultIconsV2Applied", "1");
  } catch (e) {}
}

const isSidebarLeft = settings.sidebarPosition === "left";
document.body.classList.toggle("sidebar-left", isSidebarLeft);
document.body.classList.toggle("sidebar-right", !isSidebarLeft);

// Custom background image (Unsplash support was removed). Applied with the
// transition suppressed so the wallpaper is there from the first paint —
// no 1s fade on every new tab.
if (settings.backgroundImage) {
  document.body.style.transition = "none";
  document.body.style.backgroundImage = `url(${settings.backgroundImage})`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  requestAnimationFrame(() => {
    document.body.style.transition = "";
  });
  analyzeAndSetTextColor(settings.backgroundImage);
}

// Clock and weather live in the sidebar and are always on.
renderClock();
renderWeather(settings);

// Bookmark columns are always on.
window.renderBookmarks = () => renderBookmarks(settings);
renderBookmarks(settings);

// The sidebar is a permanent fixture: clock, weather, widgets and the
// Customize entry live there.
renderSidebar(settings);

// React to system theme change if in system mode
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (theme === "system") {
      applyTheme("system");
    }
  });
