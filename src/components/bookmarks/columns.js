/*
 * Bookmark columns storage.
 * Shared by the new tab page and the options page (plain, non-module script).
 * Data lives in localStorage["bookmark-columns"] as:
 *   [{ id, name, items: [{ id, name, url, bannerUrl, iconUrl }] }]
 */
(function () {
    "use strict";

    const KEY = "bookmark-columns";

    /* iconUrl can be a bundled asset path (relative to the new tab page).
       Bundled defaults live in assets/icons/ so they never depend on the
       network and are always available offline. */
    const DEFAULT_COLUMNS = [
        {
            name: "Social",
            items: [
                { name: "Messenger", url: "https://messenger.com", iconUrl: "../../assets/icons/messenger.png" },
                { name: "Facebook", url: "https://facebook.com" },
                { name: "WhatsApp", url: "https://web.whatsapp.com", iconUrl: "../../assets/icons/whatsapp.png" },
                { name: "Discord", url: "https://discord.com/app" },
                { name: "Reddit", url: "https://reddit.com" },
                { name: "X", url: "https://x.com" },
                { name: "Telegram", url: "https://web.telegram.org", iconUrl: "../../assets/icons/telegram.png" },
                { name: "LinkedIn", url: "https://linkedin.com" },
                { name: "Pinterest", url: "https://pinterest.com" }
            ]
        },
        {
            name: "Media",
            items: [
                { name: "YouTube", url: "https://youtube.com" },
                { name: "Twitch", url: "https://twitch.tv" },
                { name: "FMHY", url: "https://fmhy.net", iconUrl: "../../assets/icons/fmhy.png" },
                { name: "Miyomi", url: "https://miyomi.app", iconUrl: "../../assets/icons/miyomi.webp" },
                { name: "Aniwave", url: "https://aniwaves.ru/" },
                { name: "PSA", url: "https://psarips.com", iconUrl: "../../assets/icons/psa.png" },
                { name: "Pirate Bay", url: "https://pirateproxy.live" },
                { name: "Pawchive", url: "https://pawchive.pw" },
                { name: "Cineby", url: "https://cineby.app" }
            ]
        },
        {
            name: "D & D",
            items: [
                { name: "ThemeForest", url: "https://themeforest.net" },
                { name: "Awwwards", url: "https://awwwards.com" },
                { name: "Dribbble", url: "https://dribbble.com" },
                { name: "Behance", url: "https://behance.net" },
                { name: "Mobbin", url: "https://mobbin.com" },
                { name: "Figma", url: "https://figma.com" },
                { name: "Framer", url: "https://framer.com" },
                { name: "Miro", url: "https://miro.com" },
                { name: "Trello", url: "https://trello.com" },
                { name: "Aceternity UI", url: "https://ui.aceternity.com" },
                { name: "shadcn/ui", url: "https://ui.shadcn.com" },
                { name: "GitHub", url: "https://github.com", iconUrl: "../../assets/icons/github.png" },
                { name: "Vercel", url: "https://vercel.com/dashboard", iconUrl: "../../assets/icons/vercel.png" },
                { name: "Cloudflare Workers & Pages", url: "https://dash.cloudflare.com/?to=/:account/workers-and-pages" }
            ]
        },
        {
            name: "Google",
            items: [
                { name: "Gmail", url: "https://mail.google.com", iconUrl: "../../assets/icons/gmail.png" },
                { name: "Google Docs", url: "https://docs.google.com", iconUrl: "../../assets/icons/google-docs.png" },
                { name: "Google Keep", url: "https://keep.google.com", iconUrl: "../../assets/icons/google-keep.png" },
                { name: "Google Drive", url: "https://drive.google.com", iconUrl: "../../assets/icons/google-drive.png" },
                { name: "Google Images", url: "https://images.google.com" },
                { name: "Google Photos", url: "https://photos.google.com", iconUrl: "../../assets/icons/google-photos.png" },
                { name: "Google Maps", url: "https://maps.google.com" },
                { name: "NotebookLM", url: "https://notebooklm.google.com" },
                { name: "Stitch", url: "https://stitch.withgoogle.com" },
                { name: "Gemini", url: "https://gemini.google.com" },
                { name: "AI Studio", url: "https://aistudio.google.com" },
                { name: "Flow", url: "https://labs.google/flow" },
                { name: "ChatGPT", url: "https://chatgpt.com" },
                { name: "Claude", url: "https://claude.ai" },
                { name: "DeepSeek", url: "https://chat.deepseek.com" }
            ]
        }
    ];

    function uid() {
        return "bm" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function normalize(cols) {
        return (cols || []).map(col => ({
            id: col.id || uid(),
            name: col.name || "Untitled",
            items: (col.items || []).map(item => ({
                id: item.id || uid(),
                name: item.name || "",
                url: item.url || "",
                bannerUrl: item.bannerUrl || "",
                iconUrl: item.iconUrl || "",
                // Per-bookmark icon refresh stamp (bookmark "Refresh icon").
                iconBust: item.iconBust || ""
            }))
        }));
    }

    // Returns columns with guaranteed ids; seeds the starter set on first run.
    function get() {
        let raw = null;
        try {
            raw = JSON.parse(localStorage.getItem(KEY));
        } catch {}
        if (!Array.isArray(raw)) return normalize(migrate(DEFAULT_COLUMNS));
        const cols = normalize(migrate(raw));
        const rawIds = (raw.every(c => c.id) && raw.every(c => (c.items || []).every(i => i.id)));
        if (!rawIds || JSON.stringify(cols) !== JSON.stringify(raw)) save(cols); // self-heal ids + applied migrations
        return cols;
    }

    /* One-time tidy-up of seeded columns: keeps only the Cloudflare Workers
       & Pages dashboard (drops the dashboard home, Workers docs and the
       Developers portal). Runs on every load. */
    const CF_REMOVED_URLS = [
        "https://dash.cloudflare.com",
        "https://developers.cloudflare.com",
        "https://developers.cloudflare.com/workers"
    ];

    function migrate(cols) {
        return cols.map(col => {
            if (!col || !Array.isArray(col.items)) return col;
            col.items = col.items.filter(item => {
                if (!item) return false;
                const url = (item.url || "").replace(/\/$/, "");
                return !CF_REMOVED_URLS.includes(url);
            });
            // Aniwave moved to its new domain; rewrite the old seed link.
            col.items.forEach(item => {
                if (item && (item.url || "").replace(/\/$/, "") === "https://aniwave.ru") {
                    item.url = "https://aniwaves.ru/";
                }
            });
            return col;
        });
    }

    function save(cols) {
        localStorage.setItem(KEY, JSON.stringify(normalize(cols)));
    }

    function ensureSeeded() {
        if (!localStorage.getItem(KEY)) save(DEFAULT_COLUMNS);
    }

    function addColumn(name) {
        const cols = get();
        const col = { id: uid(), name: name || ("Column " + (cols.length + 1)), items: [] };
        cols.push(col);
        save(cols);
        return col;
    }

    function updateColumn(colId, patch) {
        const cols = get();
        const col = cols.find(c => c.id === colId);
        if (col && patch) Object.assign(col, patch);
        save(cols);
        return col;
    }

    function removeColumn(colId) {
        const cols = get().filter(c => c.id !== colId);
        save(cols);
    }

    /* Moves a column to an absolute index (drag & drop). */
    function moveColumn(colId, toIndex) {
        const cols = get();
        const index = cols.findIndex(c => c.id === colId);
        if (index === -1 || !Number.isInteger(toIndex) || toIndex < 0 ||
            toIndex >= cols.length || toIndex === index) return;
        const [col] = cols.splice(index, 1);
        cols.splice(toIndex, 0, col);
        save(cols);
    }

    function addItem(colId, item) {
        const cols = get();
        const col = cols.find(c => c.id === colId);
        if (!col || !item.url) return null;
        col.items.push({
            id: uid(),
            name: (item.name || "").trim(),
            url: item.url.trim(),
            bannerUrl: (item.bannerUrl || "").trim(),
            iconUrl: (item.iconUrl || "").trim()
        });
        save(cols);
        return col.items[col.items.length - 1];
    }

    function updateItem(colId, itemId, patch) {
        const cols = get();
        const col = cols.find(c => c.id === colId);
        if (!col) return;
        const item = col.items.find(i => i.id === itemId);
        if (item && patch) {
            ["name", "url", "bannerUrl", "iconUrl"].forEach(k => {
                if (patch[k] !== undefined) item[k] = String(patch[k]).trim();
            });
            // Per-bookmark icon refresh stamp (bookmark-editor "Refresh icon"):
            // changes that item's favicon URLs so the browser re-fetches them.
            if (patch.iconBust !== undefined) item.iconBust = patch.iconBust;
            save(cols);
        }
    }

    function removeItem(colId, itemId) {
        const cols = get();
        const col = cols.find(c => c.id === colId);
        if (!col) return;
        col.items = col.items.filter(i => i.id !== itemId);
        save(cols);
    }

    /* Moves a bookmark item between/within columns for drag & drop.
       `index` is the insertion position measured against the item sequence
       BEFORE the dragged item is removed (the DOM computes it from the
       original array position of the neighbour it is dropped on). */
    function moveItem(fromColId, itemId, toColId, index) {
        const cols = get();
        const from = cols.find(c => c.id === fromColId);
        if (!from) return;
        const to = cols.find(c => c.id === toColId) || from;
        const fromIdx = from.items.findIndex(i => i.id === itemId);
        if (fromIdx === -1) return;
        let insertAt = (typeof index === "number") ? index : to.items.length;
        const [item] = from.items.splice(fromIdx, 1);
        if (from === to && fromIdx < insertAt) insertAt -= 1;
        if (insertAt < 0) insertAt = 0;
        if (insertAt > to.items.length) insertAt = to.items.length;
        to.items.splice(insertAt, 0, item);
        save(cols);
    }

    window.BMColumns = {
        KEY,
        DEFAULT_COLUMNS,
        uid,
        get,
        save,
        ensureSeeded,
        addColumn,
        updateColumn,
        removeColumn,
        moveColumn,
        addItem,
        updateItem,
        removeItem,
        moveItem
    };
})();
