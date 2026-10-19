/*
 * Bookmark columns UI for the new tab page.
 * Data lives in localStorage via the shared BMColumns helper (columns.js).
 * Each column is a sidebar-styled panel holding a single-column list of
 * cards: sharp favicon + name, with a large blurred copy of the favicon on
 * the right acting as the card background. A custom background image, when
 * set, replaces the blurred backdrop (and renders sharp).
 */

import { openBookmarkModal, openColumnModal, openPopover } from "./bookmark-editor.js";

let pageSettings = null;

function hashHue(str) {
    let h = 0;
    const s = str || "bookmark";
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) % 3600;
    }
    return h % 360;
}

function setHues(el, seed) {
    const h = hashHue(seed);
    el.style.setProperty("--bm-h1", String(h));
    el.style.setProperty("--bm-h2", String((h + 55) % 360));
}

function hostnameOf(url) {
    try {
        const u = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url || "") ? url : "https://" + (url || ""));
        return u.hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

function hostnameName(url) {
    const host = hostnameOf(url);
    if (!host) return url || "Bookmark";
    return host
        .split(".")[0]
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

/* Cache-busting for favicon refreshes: the page-level stamp (FAVICON_BUST)
   re-fetches every icon once per load when the setting is on; a bookmark can
   also carry its own iconBust stamp ("Refresh icon" in the editor), which
   re-fetches just that bookmark's icon until the next refresh. */
const FAVICON_BUST = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");

function bustUrl(url, bust) {
    /* Local resources (extension assets, inline data) are instant and never
       need cache-busting. */
    if (/^(data:|blob:|chrome-extension:)/.test(url)) return url;
    if (!bust) return url;
    try {
        const u = new URL(url, location.href);
        u.searchParams.set("t", bust);
        return u.toString();
    } catch {
        return url;
    }
}

/* Auto icon sources: custom override first, then public favicon services.
   Two flavors: stamped (re-fetch, for the background refresher) and plain
   (cache-friendly, so the initial paint shows the already-cached icon). */

function iconSources(item, bust) {
    const sources = [];
    const host = hostnameOf(item.url);
    const pageRefresh = pageSettings && pageSettings.refreshFavicons;
    // A per-bookmark stamp ("Refresh icon") wins over the page-level timer.
    const stamp = bust || item.iconBust || (pageRefresh ? FAVICON_BUST : null);
    const src = (url) => bustUrl(url, stamp);
    if (item.iconUrl) sources.push(src(item.iconUrl));
    if (host) {
        sources.push(src(`https://logo.clearbit.com/${host}?size=128`));
        sources.push(src(`https://www.google.com/s2/favicons?domain=${host}&sz=128`));
    }
    return sources;
}

function autoIconSources(item) {
    return iconSources(item);
}

/* Unstamped icon sources: byte-identical URLs on every load, so the browser
   serves them from disk cache and the first paint needs no network at all.
   (The stamped variant is only fetched off-thread by the silent refresher.) */
function plainIconSources(item) {
    const sources = [];
    const host = hostnameOf(item.url);
    if (item.iconUrl) sources.push(item.iconUrl);
    if (host) {
        sources.push(`https://logo.clearbit.com/${host}?size=128`);
        sources.push(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
    }
    return sources;
}

/* Local image cache ------------------------------------------------------ *
 * Favicons and banner backgrounds are snapshotted once (downscaled on a
 * canvas) and stored in localStorage as data URLs. New tabs paint straight
 * from this cache with no network at all — exactly the "load once, then keep
 * it until something changes" lifecycle. Entries re-key naturally when a
 * bookmark's source URL changes (icon upload, banner edit, URL edit), and the
 * silent background refresher overwrites the entry when a site's icon really
 * changes (same key, new bytes — flash-free both ways). */

const ICON_CACHE_KEY = "bm-icon-cache";
const ICON_CACHE_MAX_ENTRY = 200 * 1024; // per-image cap; uploads are already data URLs

let iconCacheData = (() => {
    try { return JSON.parse(localStorage.getItem(ICON_CACHE_KEY)) || {}; }
    catch { return {}; }
})();
let iconCacheDirty = false;
let iconCacheFlushTimer = 0;

function flushIconCacheSoon() {
    if (iconCacheFlushTimer) return;
    iconCacheFlushTimer = setTimeout(() => {
        iconCacheFlushTimer = 0;
        if (!iconCacheDirty) return;
        try {
            localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(iconCacheData));
            iconCacheDirty = false;
        } catch {
            /* Quota exceeded: drop the cache; it rebuilds gradually. */
            iconCacheData = {};
            try { localStorage.removeItem(ICON_CACHE_KEY); } catch {}
            iconCacheDirty = false;
        }
    }, 400);
}

function iconCacheGet(url) {
    return iconCacheData[url] || null;
}

function iconCachePut(url, dataURL) {
    /* Extension assets and uploads are already local — nothing to cache. */
    if (/^(data:|blob:|chrome-extension:)/.test(url || "")) return;
    if (!url || !dataURL || dataURL.length > ICON_CACHE_MAX_ENTRY) return;
    if (iconCacheData[url] === dataURL) return;
    iconCacheData[url] = dataURL;
    iconCacheDirty = true;
    flushIconCacheSoon();
}

function iconCacheSweep() {
    /* Drop entries whose source is no longer part of any bookmark's chain. */
    const referenced = new Set();
    let cols = [];
    try { cols = window.BMColumns.get(); } catch { return; }
    cols.forEach(col => (col.items || []).forEach(item => {
        plainIconSources(item).forEach(url => referenced.add(url));
        if (item.bannerUrl) referenced.add(item.bannerUrl);
    }));
    let changed = false;
    for (const key of Object.keys(iconCacheData)) {
        if (!referenced.has(key)) { delete iconCacheData[key]; changed = true; }
    }
    if (changed) { iconCacheDirty = true; flushIconCacheSoon(); }
}

/* Snapshot a loaded <img> into the data URL it can be re-painted from on
   future tabs: icons contained 128px PNG, banners cover-cropped 720x240
   JPEG. Returns null when the canvas is untouchable (no-CORS image). */
function snapshotImage(img, mode) {
    try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.naturalWidth || !img.naturalHeight) return null;
        if (mode === "banner") {
            const w = 720, h = 240;
            canvas.width = w;
            canvas.height = h;
            const crop = Math.max(w / img.naturalWidth, h / img.naturalHeight);
            const cw = img.naturalWidth / crop;
            const ch = img.naturalHeight / crop;
            ctx.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, 0, 0, w, h);
            return canvas.toDataURL("image/jpeg", 0.82);
        }
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        return canvas.toDataURL("image/png");
    } catch {
        return null;
    }
}

/* Card parts -------------------------------------------------------------- */

/* Page start: cards built during the first moments of a load are "initial" —
   they skip the fade-in transitions so nothing flashes into place. */
const PAGE_START_MS = performance.now();

function isInitialLoad() {
    return performance.now() - PAGE_START_MS < 1500;
}

/* Boot reveal: the grid stays invisible while its images decode (cache hits,
   so nearly instant), then the whole page appears as one settled frame —
   no per-card pop-in. */
let columnsBooted = false;

function revealColumnsWhenReady() {
    if (columnsBooted) return;
    columnsBooted = true;
    const finish = () => document.documentElement.classList.remove("bm-boot");
    const imgs = [...document.querySelectorAll("#shortcuts img")];
    const decodes = imgs.map(img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    Promise.race([
        Promise.all(decodes),
        new Promise(resolve => setTimeout(resolve, 700))
    ]).then(finish);
}

// Belt and braces: never leave the grid hidden (e.g. an error mid-render).
setTimeout(() => document.documentElement.classList.remove("bm-boot"), 1500);
document.documentElement.classList.add("bm-boot");

function initialOf(item) {
    const base = item.name || hostnameOf(item.url) || "?";
    return base.trim().charAt(0).toUpperCase();
}

function buildFallbackLetter(card, icon, blob, item) {
    const letter = document.createElement("span");
    letter.className = "bm-letter";
    letter.textContent = initialOf(item);
    if (icon && icon.parentNode) icon.replaceWith(letter);
    if (blob && blob.parentNode) blob.remove();
    card.classList.add("bm-noicon");
    return letter;
}

function buildCard(col, item, index, settings) {
    const li = document.createElement("li");
    li.className = "bm-item" + (isInitialLoad() ? " bm-initial" : "");
    li.dataset.itemId = item.id;
    li.dataset.origIndex = String(index);
    li.dataset.fp = itemFingerprint(item);

    const card = document.createElement("a");
    card.className = "bm-card shortcut";
    card.href = item.url || "#";
    setHues(card, (item.name || "") + item.url);
    if (!item.url) {
        card.addEventListener("click", e => e.preventDefault());
    }

    // Drag & drop support: move items within and across columns.
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ colId: col.id, itemId: item.id }));
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => li.classList.add("bm-dragging"));
    });
    card.addEventListener("dragend", () => {
        li.classList.remove("bm-dragging");
        clearDropMarkers(document);
    });

    const hasCustomBg = Boolean(item.bannerUrl);

    // Manual background image override: renders sharp, appears when ready.
    // Banner URLs use the same local cache as icons.
    if (hasCustomBg) {
        card.classList.add("bm-hasbg");
        const bg = document.createElement("img");
        bg.className = "bm-bg";
        bg.alt = "";
        bg.decoding = "async";
        bg.draggable = false;
        let bannerKey = "";
        try { bannerKey = new URL(item.bannerUrl, location.href).href; } catch { bannerKey = item.bannerUrl; }
        const bannerIsHttp = /^https?:/i.test(bannerKey);
        const cachedBanner = bannerIsHttp ? iconCacheGet(bannerKey) : null;
        bg.addEventListener("load", () => {
            bg.classList.add("loaded");
            if (bannerIsHttp && !iconCacheGet(bannerKey)) {
                const snap = snapshotImage(bg, "banner");
                if (snap) iconCachePut(bannerKey, snap);
            }
        });
        bg.addEventListener("error", () => {
            bg.remove();
            card.classList.remove("bm-hasbg");
        });
        bg.src = cachedBanner || item.bannerUrl;
        card.appendChild(bg);
    }

    // Icon + blurred backdrop share one source chain so they fail together.
    const icon = document.createElement("img");
    icon.className = "bm-icon-img";
    icon.alt = "";
    icon.decoding = "async";
    icon.draggable = false;

    let blob = null;
    if (!hasCustomBg) {
        blob = document.createElement("img");
        blob.className = "bm-blob";
        blob.alt = "";
        blob.decoding = "async";
        blob.draggable = false;
        blob.setAttribute("aria-hidden", "true");
        blob.addEventListener("load", () => blob.classList.add("loaded"));
    }

    const sources = autoIconSources(item); // stamped: background refresh targets
    const plainSources = plainIconSources(item); // stable URLs = cache keys
    let sourceIndex = 0;

    if (blob) card.appendChild(blob);
    card.appendChild(icon);

    const name = document.createElement("span");
    name.className = "bm-name";
    name.textContent = item.name || hostnameName(item.url);
    card.appendChild(name);

    /* First successful paint of an uncached icon writes it into the local
       cache — the next new tab is served from there with no network. */
    let shownKey = "";
    icon.addEventListener("load", () => {
        if (shownKey && !iconCacheGet(shownKey)) {
            const snap = snapshotImage(icon, "icon");
            if (snap) iconCachePut(shownKey, snap);
        }
    });

    const applyLetter = () => buildFallbackLetter(card, icon, blob, item);
    const tryNext = () => {
        if (sourceIndex >= plainSources.length) {
            applyLetter();
            return;
        }
        const url = plainSources[sourceIndex++];
        shownKey = url;
        icon.src = url;
        if (blob) blob.src = url;
    };
    icon.addEventListener("error", tryNext);

    const cachedSrc = plainSources.map(iconCacheGet).find(Boolean);
    if (cachedSrc) {
        shownKey = ""; // cached bytes: nothing further to write
        icon.src = cachedSrc;
        if (blob) blob.src = cachedSrc;
    } else {
        tryNext();
    }

    /* Silent refresher (refresh-on-load or a per-bookmark stamp): fetch the
       stamped source off-thread; when it decodes, swap it in — no blank, no
       fade — and re-cache the new bytes under the plain URL, so the next tab
       paints the updated icon from cache ("cache again once it changed"). */
    const bustFirst = sources[0];
    const plainFirst = plainSources[0];
    if (bustFirst && bustFirst !== plainFirst) {
        const pre = new Image();
        pre.decoding = "async";
        pre.onload = () => {
            const snap = snapshotImage(pre, "icon");
            if (snap) iconCachePut(plainFirst, snap);
            if (!icon.isConnected || !snap) return;
            shownKey = plainFirst;
            icon.src = snap;
            if (blob && blob.isConnected) blob.src = snap;
        };
        pre.onerror = () => {}; // keep the current icon
        pre.src = bustFirst;
    }

    const bookmarkItem = { colId: col.id, item };
    card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openBookmarkModal(bookmarkItem);
    });

    const pencil = document.createElement("button");
    pencil.type = "button";
    pencil.className = "bm-card-edit";
    pencil.title = "Edit / Delete bookmark";
    pencil.textContent = "✎";
    pencil.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openBookmarkModal(bookmarkItem);
    });

    li.appendChild(card);
    li.appendChild(pencil);
    return li;
}

function buildAddTile(col) {
    const li = document.createElement("li");
    li.className = "bm-item";
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "bm-add";
    tile.innerHTML = "<span class='bm-add-sign'>＋</span><span>Add</span>";
    tile.addEventListener("click", () => openBookmarkModal({ colId: col.id, item: null }));
    li.appendChild(tile);
    return li;
}

/* Column ---------------------------------------------------------------- */

function buildColumn(col, settings) {
    const section = document.createElement("section");
    section.className = "bm-col";
    section.dataset.colId = col.id;
    section.dataset.fp = columnFingerprint(col);

    const head = document.createElement("div");
    head.className = "bm-col-head";

    const title = document.createElement("span");
    title.className = "bm-col-title";
    title.textContent = col.name || "Untitled";

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "bm-head-btn";
    moreBtn.title = "Column options";
    moreBtn.textContent = "⋯";
    moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPopover(moreBtn, [
            { label: "Add bookmark", fn: () => openBookmarkModal({ colId: col.id, item: null }) },
            { label: "Edit column", fn: () => openColumnModal({ column: col }) },
            { label: "Delete column", danger: true, fn: () => window.BMColumns.removeColumn(col.id) }
        ]);
    });

    head.appendChild(title);
    head.appendChild(moreBtn);
    section.appendChild(head);

    /* Column reorder drag: the header acts as the handle. Buttons inside keep
       their normal click behavior and never start a column drag. */
    head.draggable = true;
    head.addEventListener("dragstart", (e) => {
        if (e.target.closest("button")) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData(COL_DRAG_TYPE, col.id);
        e.dataTransfer.setData("text/plain", col.id);
        e.dataTransfer.effectAllowed = "move";
        section.classList.add("bm-col-dragging");
    });
    head.addEventListener("dragend", () => {
        section.classList.remove("bm-col-dragging");
        clearColMarkers(document);
    });

    const list = document.createElement("ul");
    list.className = "bm-col-list";
    (col.items || []).forEach((item, index) => {
        if (!item.url && !item.name) return;
        list.appendChild(buildCard(col, item, index, settings));
    });
    list.appendChild(buildAddTile(col));

    wireListDnD(list, col.id);
    section.appendChild(list);

    return section;
}

/* Drag & drop targeting -------------------------------------------------- */

/* Compute the insertion index for a drop at clientY within a column list.
   Returns an index in the pre-move item sequence (see BMColumns.moveItem),
   based on the original array position stored on each list item. */
function insertionIndex(list, clientY) {
    const items = [...list.querySelectorAll('.bm-item[data-item-id]:not(.bm-dragging)')];
    let appendIndex = Infinity; // fall back to end of list
    if (items.length > 0) {
        const last = items[items.length - 1];
        appendIndex = Number(last.dataset.origIndex) + 1;
        for (const li of items) {
            const rect = li.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                return { index: Number(li.dataset.origIndex), li, before: true };
            }
        }
    }
    return { index: appendIndex, li: null, before: false };
}

function clearDropMarkers(root) {
    root.querySelectorAll('.bm-drop-before, .bm-drop-after')
        .forEach(el => el.classList.remove('bm-drop-before', 'bm-drop-after'));
}

/* Whole-column drag & drop: columns are re-ordered by dragging their header.
   The sidebar is not a drop target — dropping is only valid over the row. */
const COL_DRAG_TYPE = "application/x-bm-col";

function isColDrag(e) {
    return [...e.dataTransfer.types].includes(COL_DRAG_TYPE);
}

function clearColMarkers(root) {
    root.querySelectorAll(".bm-col-drop-left, .bm-col-drop-right")
        .forEach(c => c.classList.remove("bm-col-drop-left", "bm-col-drop-right"));
}

function wireColumnDnD(row) {
    row.addEventListener("dragover", (e) => {
        if (!isColDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const dragging = row.querySelector(".bm-col-dragging");
        const cols = [...row.querySelectorAll(".bm-col")].filter(c => c !== dragging);
        clearColMarkers(row);
        // Drop-line before the first column whose center is right of the pointer,
        // otherwise after the last one.
        for (const col of cols) {
            const r = col.getBoundingClientRect();
            if (e.clientX < r.left + r.width / 2) {
                col.classList.add("bm-col-drop-left");
                return;
            }
        }
        if (cols.length) cols[cols.length - 1].classList.add("bm-col-drop-right");
    });
    row.addEventListener("dragleave", (e) => {
        if (e.target === row) clearColMarkers(row);
    });
    row.addEventListener("drop", (e) => {
        if (!isColDrag(e)) return;
        e.preventDefault();
        const colId = e.dataTransfer.getData(COL_DRAG_TYPE);
        const all = [...row.querySelectorAll(".bm-col")];
        const markLeft = all.find(c => c.classList.contains("bm-col-drop-left"));
        const markRight = all.find(c => c.classList.contains("bm-col-drop-right"));
        clearColMarkers(row);
        row.querySelectorAll(".bm-col-dragging")
            .forEach(c => c.classList.remove("bm-col-dragging"));
        if (!colId) return;
        let slot = markLeft
            ? all.indexOf(markLeft)
            : markRight
                ? all.indexOf(markRight) + 1
                : all.length;
        const from = all.findIndex(c => c.dataset.colId === colId);
        if (from === -1) return;
        if (from < slot) slot -= 1; // removing the dragged column shifts later indexes
        if (window.BMColumns && typeof window.BMColumns.moveColumn === "function") {
            window.BMColumns.moveColumn(colId, slot);
            if (window.renderBookmarks) window.renderBookmarks();
        }
    });
}

function wireListDnD(list, colId) {
    list.addEventListener("dragover", (e) => {
        // Item drags only: ignore whole-column drags (handled by the row).
        const types = [...e.dataTransfer.types];
        if (!types.includes("text/plain") || types.includes(COL_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        clearDropMarkers(list);
        const target = insertionIndex(list, e.clientY);
        if (target.li) {
            target.li.classList.add(target.before ? "bm-drop-before" : "bm-drop-after");
        }
    });
    list.addEventListener("dragleave", (e) => {
        if (e.target === list) clearDropMarkers(list);
    });
    list.addEventListener("drop", (e) => {
        e.preventDefault();
        let payload = null;
        try {
            payload = JSON.parse(e.dataTransfer.getData("text/plain"));
        } catch {}
        clearDropMarkers(list);
        if (!payload || !payload.itemId) return;
        const target = insertionIndex(list, e.clientY);
        if (typeof window.BMColumns !== "undefined") {
            window.BMColumns.moveItem(payload.colId, payload.itemId, colId, target.index);
            if (window.renderBookmarks) window.renderBookmarks();
        }
    });
}

/* Fingerprints ------------------------------------------------------------- */

/* Cheap per-element fingerprints let re-renders diff against the live DOM:
   columns/cards whose data did not change are left untouched, so editing a
   single bookmark no longer tears down the whole page (the old full
   re-render flashed and re-fetched every favicon). */

function itemFingerprint(item) {
    return JSON.stringify([
        item.id,
        item.name || "",
        item.url || "",
        item.iconUrl || "",
        item.iconBust || "",
        item.bannerUrl || "",
    ]);
}

function columnFingerprint(col) {
    const items = (col.items || []).filter(i => i.url || i.name);
    return JSON.stringify({
        id: col.id,
        name: col.name || "",
        items: items.map(item => itemFingerprint(item)),
    });
}

/* In-place sync ------------------------------------------------------------- */

/* Update one column's DOM in place: title text, card additions/changes/
   removals, and data order (list nodes are moved, not recreated). */
function syncColumnContent(section, col, settings) {
    const title = section.querySelector(".bm-col-title");
    const wantTitle = col.name || "Untitled";
    if (title && title.textContent !== wantTitle) {
        title.textContent = wantTitle;
    }

    const list = section.querySelector(".bm-col-list");
    if (!list) return;
    const addBtn = list.querySelector(".bm-add");
    const addTile = addBtn ? addBtn.closest("li") : null;

    const liBy = new Map();
    [...list.querySelectorAll(".bm-item[data-item-id]")].forEach(li =>
        liBy.set(li.dataset.itemId, li),
    );

    // Add new cards; replace cards whose content actually changed.
    (col.items || []).forEach((item, trueIdx) => {
        if (!item.url && !item.name) return;
        let li = liBy.get(item.id);
        const fp = itemFingerprint(item);
        if (!li) {
            liBy.set(item.id, buildCard(col, item, trueIdx, settings));
        } else if (li.dataset.fp !== fp) {
            const fresh = buildCard(col, item, trueIdx, settings);
            li.replaceWith(fresh);
            liBy.set(item.id, fresh);
        }
    });

    // Remove deleted cards.
    const ids = new Set((col.items || []).map(i => i.id));
    [...liBy.values()].forEach(li => {
        if (!ids.has(li.dataset.itemId)) li.remove();
    });

    // Re-apply data order (insertion before the Add tile keeps it last) and
    // refresh the pre-removal indexes used by the drop math.
    let trueIdx = 0;
    (col.items || []).forEach(item => {
        const li = liBy.get(item.id);
        if (li) {
            li.dataset.origIndex = String(trueIdx);
            if (addTile) list.insertBefore(li, addTile);
            else list.appendChild(li);
        }
        trueIdx++;
    });
}

/* Sync the row against the column data. Returns false when no column page
   exists yet (first paint / overlay teardown), in which case the caller
   should do a full build. */
function syncColumns(columns, settings) {
    const scroll = document.querySelector(".bm-scroll");
    const row = document.querySelector(".bm-row");
    if (!scroll || !row) return false;

    const stale = new Map();
    [...row.children].forEach(el => {
        if (el.classList && el.classList.contains("bm-col")) {
            stale.set(el.dataset.colId, el);
        }
    });

    columns.forEach((col, idx) => {
        let section = stale.get(col.id);
        if (section) stale.delete(col.id);
        const fp = columnFingerprint(col);
        if (!section) {
            section = buildColumn(col, settings);
        } else if (section.dataset.fp !== fp) {
            syncColumnContent(section, col, settings);
            section.dataset.fp = fp;
        }
        const at = row.children[idx];
        if (at !== section) row.insertBefore(section, at || null);
    });

    // Columns that no longer exist in the data.
    [...stale.values()].forEach(el => el.remove());
    scheduleFitColumns();
    return true;
}

/* Row flex: the columns container fills the space opposite the sidebar; its
   flex-grow is the VISIBLE column count, so each visible column ends up the
   same width as the sidebar (whose flex-grow is 1). */
function updateColFlex() {
    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) return;
    const visible = [...document.querySelectorAll(".bm-col")].filter(
        (col) => !col.classList.contains("bm-col-hidden")
    ).length;
    if (visible) shortcuts.style.flexGrow = String(visible);
}

/* Adaptive column visibility: when the viewport cannot fit every column at
   its minimum width (sidebar minimum included), trailing columns are hidden
   one by one from the right — the sidebar always stays. Hidden columns come
   back automatically when the window grows again. */
const COL_MIN_WIDTH = 240;
const PANEL_GAP = 12;
const SIDEBAR_MIN_WIDTH = 280;

let fitColsScheduled = false;

function scheduleFitColumns() {
    if (fitColsScheduled) return;
    fitColsScheduled = true;
    requestAnimationFrame(() => {
        fitColsScheduled = false;
        fitColumnsToViewport();
    });
}

function fitColumnsToViewport() {
    const cols = [...document.querySelectorAll(".bm-col")];
    if (!cols.length) return;

    // Usable width for the column row: viewport minus body edge padding
    // (2 x 12px), the sidebar gap (12px) and the sidebar's own minimum
    // (the sidebar itself is never hidden).
    const avail =
        document.documentElement.clientWidth -
        3 * PANEL_GAP -
        SIDEBAR_MIN_WIDTH;

    let fit = 0;
    for (let k = cols.length; k > 0; k--) {
        if (k * COL_MIN_WIDTH + (k - 1) * PANEL_GAP <= avail) {
            fit = k;
            break;
        }
    }
    fit = Math.max(fit, 1); // always keep at least one column

    cols.forEach((col, i) => col.classList.toggle("bm-col-hidden", i >= fit));
    updateColFlex();
}

window.addEventListener("resize", scheduleFitColumns);

/* Page ------------------------------------------------------------------ */

function renderColumns(settings) {
    window.BMColumns.ensureSeeded();
    const columns = window.BMColumns.get();

    // Preserve column scroll positions across re-renders (e.g. after a drop).
    const prevRow = document.querySelector(".bm-row");
    const prevScrolls = new Map();
    if (prevRow) {
        const prevScroll = document.querySelector(".bm-scroll");
        if (prevScroll) prevScrolls.set("__row__", prevScroll.scrollLeft);
        prevRow.querySelectorAll(":scope > .bm-col").forEach(col => {
            const listEl = col.querySelector(".bm-col-list");
            if (listEl && col.dataset.colId) {
                prevScrolls.set(col.dataset.colId, listEl.scrollTop);
            }
        });
    }

    const scroll = document.createElement("div");
    scroll.className = "bm-scroll";
    const row = document.createElement("div");
    row.className = "bm-row";
    columns.forEach(col => row.appendChild(buildColumn(col, settings)));
    scroll.appendChild(row);
    wireColumnDnD(row);

    // Re-apply saved scroll positions.
    columns.forEach(col => {
        const saved = prevScrolls.get(col.id);
        const colEl = row.querySelector(`.bm-col[data-col-id="${col.id}"] .bm-col-list`);
        if (saved && colEl) colEl.scrollTop = saved;
    });
    if (prevScrolls.has("__row__")) scroll.scrollLeft = prevScrolls.get("__row__");

    return scroll;
}

function renderBookmarks(settings, opts) {
    pageSettings = settings || pageSettings;
    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts || typeof window.BMColumns === "undefined") return;

    // Prefer an incremental sync: cards that did not change keep their DOM
    // (and their already-loaded favicons), so single edits happen silently.
    if (!(opts && opts.full) && syncColumns(window.BMColumns.get(), pageSettings)) {
        if (typeof window.BMColumns.ensureSeeded === "function") {
            window.BMColumns.ensureSeeded();
        }
        iconCacheSweep();
        return;
    }

    // No usable page yet (first paint, or teardown after an overlay): build.
    if (typeof window.BMColumns.ensureSeeded === "function") {
        window.BMColumns.ensureSeeded();
    }
    const existingInput = document.getElementById("quick-command-input");

    shortcuts.innerHTML = "";
    if (existingInput) {
        shortcuts.appendChild(existingInput);
    }
    shortcuts.appendChild(renderColumns(pageSettings));
    scheduleFitColumns();
    iconCacheSweep();
    revealColumnsWhenReady();
}

// Wheel: vertical scrolling over the row gutter pans columns horizontally;
// scrolling over a column list scrolls that list vertically.
const shortcutsContainer = document.getElementById("shortcuts");
if (shortcutsContainer) {
    shortcutsContainer.addEventListener("wheel", (e) => {
        if (e.target.closest(".bm-col-list")) return;
        const scroll = e.target.closest(".bm-scroll");
        if (!scroll || scroll.scrollWidth <= scroll.clientWidth) return;
        e.preventDefault();
        scroll.scrollLeft += e.deltaY;
    }, { passive: false });
}

export { renderBookmarks };
