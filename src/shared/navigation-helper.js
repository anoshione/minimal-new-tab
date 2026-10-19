import { stopClock, renderClock } from "../components/clock/clock.js";

let isNavigating = false;

/**
 * Get current settings from localStorage
 */
function getSettings() {
    try {
        const stored = localStorage.getItem("settings");
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

/**
 * Navigate to a destination URL with synchronized exit transition
 * @param {string} url - Target URL to open
 * @param {Object} [options]
 * @param {boolean} [options.newTab] - Force open in new tab (defaults to settings.openInNewTab)
 * @param {boolean} [options.immediate] - Skip transition
 */
export function navigateTo(url, options = {}) {
    if (!url || url.trim() === "" || url.startsWith("javascript:")) return;

    const settings = getSettings();
    const shouldOpenInNewTab = options.newTab !== undefined
        ? Boolean(options.newTab)
        : Boolean(settings.openInNewTab);

    // Browser internal pages (chrome://, edge://, about:) require chrome.tabs API
    if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
        if (typeof chrome !== "undefined" && chrome.tabs) {
            if (shouldOpenInNewTab && chrome.tabs.create) {
                chrome.tabs.create({ url: url });
            } else if (chrome.tabs.update) {
                chrome.tabs.update({ url: url });
            } else {
                window.open(url, "_blank");
            }
            return;
        }
    }

    // If opening in a new tab, keep current page completely undisturbed
    if (shouldOpenInNewTab) {
        if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: url });
        } else {
            window.open(url, "_blank");
        }
        return;
    }

    // Opening in the same tab: enforce unified synchronized page exit
    if (isNavigating) return;
    isNavigating = true;

    // Stop main-thread timers to prevent redrawing top half during exit
    stopClock();

    if (options.immediate) {
        window.location.href = url;
        return;
    }

    // Applying 'navigating' to body forces Chromium to composite all DOM elements
    // into a single unified surface with opacity: 0, eliminating layer desync/tearing
    document.body.classList.add("navigating");

    // Allow the 100ms fade transition to complete synchronously before navigation
    setTimeout(() => {
        window.location.href = url;
    }, 90);
}

/**
 * Initialize global navigation delegation and bfcache restoration
 */
export function initNavigationHelper() {
    // Intercept clicks on links throughout the page
    document.addEventListener("click", (e) => {
        // Only handle primary button clicks
        if (e.button !== 0) return;

        // Allow user to use Ctrl/Cmd/Shift modifiers for native new-tab opening
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;

        const anchor = e.target.closest("a[href]");
        if (!anchor) return;

        // Skip non-navigational links
        const href = anchor.getAttribute("href");
        if (!href || href === "#" || href.startsWith("javascript:")) return;

        // If explicitly target="_blank", let browser handle or open via tabs API
        if (anchor.target === "_blank") {
            return;
        }

        e.preventDefault();
        navigateTo(anchor.href);
    }, true);

    // Restore page state if user navigates back via bfcache
    window.addEventListener("pageshow", () => {
        isNavigating = false;
        document.body.classList.remove("navigating");
        const settings = getSettings();
        if (settings.clock !== false) {
            renderClock();
        }
    });

    // Safety cleanup when leaving
    window.addEventListener("pagehide", () => {
        stopClock();
    });
}
