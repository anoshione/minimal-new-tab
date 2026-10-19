/*
 * Modal + popover helpers for editing bookmark columns and their items.
 * Used together with bookmarks.js (which re-renders via window.renderBookmarks).
 */

let activeModalOverlay = null;
let activePopover = null;

function closeModal() {
    if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
    }
    activeModalOverlay = null;
}

function closePopover() {
    if (activePopover && activePopover.parentNode) {
        activePopover.parentNode.removeChild(activePopover);
    }
    activePopover = null;

    if (popoverOutsideHandler) {
        document.removeEventListener("click", popoverOutsideHandler, true);
        popoverOutsideHandler = null;
    }
}

let popoverOutsideHandler = null;

function refresh() {
    if (window.renderBookmarks) window.renderBookmarks();
}

function normalizeUrl(value) {
    const raw = (value || "").trim();
    if (!raw) return "";
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : "https://" + raw;
}

function hostnameName(url) {
    try {
        const u = new URL(normalizeUrl(url));
        const host = u.hostname.replace(/^www\./, "");
        return host ? host.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : (url || "Bookmark");
    } catch {
        return url || "Bookmark";
    }
}

/* Image processing -------------------------------------------------------- *
 * Uploaded images are re-encoded on a canvas so localStorage stays small:
 *  - icons: contained square, transparent-friendly PNG.
 *  - backgrounds: center-cropped to the banner ratio, JPEG quality 0.82.
 */

function renderProcessedImage(img, spec, sourceType) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (spec.mode === "icon") {
        const size = spec.size || 128;
        canvas.width = size;
        canvas.height = size;
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        return canvas.toDataURL("image/png");
    }

    // Background: cover-crop to the stored banner ratio, then scale down.
    const w = spec.w || 720;
    const h = spec.h || 240;
    canvas.width = w;
    canvas.height = h;
    const cropScale = Math.max(w / img.width, h / img.height);
    const cw = w / cropScale;
    const ch = h / cropScale;
    ctx.drawImage(img, (img.width - cw) / 2, (img.height - ch) / 2, cw, ch, 0, 0, w, h);
    const mime = sourceType === "image/png" ? "image/png" : "image/jpeg";
    return canvas.toDataURL(mime, 0.82);
}

function processImageFile(file, spec) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith("image/")) {
            reject(new Error("Not an image file"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                try {
                    resolve(renderProcessedImage(img, spec, file.type));
                } catch (err) {
                    reject(err instanceof Error ? err : new Error("Could not process image"));
                }
            };
            img.onerror = () => reject(new Error("Could not decode image"));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (activeModalOverlay) {
            closeModal();
            e.stopPropagation();
        } else if (activePopover) {
            closePopover();
            e.stopPropagation();
        }
    }
});

window.addEventListener("resize", closePopover);

/*
 * openFormModal({
 *   title, fields: [{ key, label, value, placeholder, type }],
 *   submitText, cancelText, dangerText, onSubmit(values, done), onDanger()
 * })
 */
export function openFormModal({ title, fields, submitText = "Save", cancelText = "Cancel", dangerText = null, onSubmit = null, onDanger = null }) {
    closeModal();
    closePopover();

    const overlay = document.createElement("div");
    overlay.className = "bookmark-edit-overlay";

    const modal = document.createElement("div");
    modal.className = "bookmark-edit-modal";

    const header = document.createElement("div");
    header.className = "bookmark-edit-header";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "bookmark-edit-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closeModal);
    header.appendChild(heading);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const inputs = {};
    fields.forEach(field => {
        const wrap = document.createElement("div");
        wrap.className = "bookmark-edit-field";
        const label = document.createElement("label");
        label.textContent = field.label;
        const input = document.createElement("input");
        input.type = field.type || "text";
        input.className = "bookmark-edit-input";
        input.id = "bm-field-" + field.key;
        input.value = field.value || "";
        input.placeholder = field.placeholder || "";
        inputs[field.key] = input;
        wrap.appendChild(label);

        if (field.image) {
            // Image field: URL input, upload button with canvas resize, preview.
            wrap.classList.add("bm-field-image");

            const preview = document.createElement("img");
            preview.className = "bm-preview hidden";
            preview.alt = "";
            preview.decoding = "async";
            const refreshPreview = () => {
                const value = input.value.trim();
                if (value) {
                    preview.src = value;
                    preview.classList.remove("hidden");
                } else {
                    preview.removeAttribute("src");
                    preview.classList.add("hidden");
                }
            };
            preview.addEventListener("error", () => preview.classList.add("hidden"));
            preview.addEventListener("load", () => {
                if (preview.getAttribute("src")) preview.classList.remove("hidden");
            });
            input.addEventListener("change", refreshPreview);
            refreshPreview();

            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = "image/*,.ico,image/x-icon";
            fileInput.style.display = "none";

            const status = document.createElement("span");
            status.className = "bm-upload-status";

            const uploadBtn = document.createElement("button");
            uploadBtn.type = "button";
            uploadBtn.className = "bm-upload-btn";
            uploadBtn.textContent = "Upload";
            uploadBtn.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                status.textContent = "Resizing…";
                try {
                    const dataURL = await processImageFile(file, field.image);
                    input.value = dataURL;
                    refreshPreview();
                    const kb = Math.round((dataURL.length * 0.75) / 1024);
                    status.textContent = "Resized to ~" + kb + " KB";
                } catch (err) {
                    status.textContent = (err && err.message) || "Upload failed";
                }
                fileInput.value = "";
            });

            const row = document.createElement("div");
            row.className = "bm-field-row";
            row.appendChild(preview);
            row.appendChild(input);
            row.appendChild(uploadBtn);

            // Optional per-bookmark action (e.g. "Refresh icon"): runs against
            // the saved bookmark without closing or saving the modal.
            if (field.refresh) {
                const refreshBtn = document.createElement("button");
                refreshBtn.type = "button";
                refreshBtn.className = "bm-upload-btn";
                refreshBtn.textContent = "Refresh icon";
                refreshBtn.addEventListener("click", () => {
                    const original = field.refreshLabel || refreshBtn.textContent;
                    refreshBtn.disabled = true;
                    status.textContent = "Refreshing…";
                    try {
                        field.refresh();
                        refreshPreview();
                        status.textContent = "Icon refreshed";
                    } catch (err) {
                        status.textContent = (err && err.message) || "Refresh failed";
                    }
                    refreshBtn.disabled = false;
                });
                row.appendChild(refreshBtn);
            }

            wrap.appendChild(row);
            wrap.appendChild(fileInput);
            wrap.appendChild(status);
        } else {
            wrap.appendChild(input);
        }
        modal.appendChild(wrap);
    });

    const actions = document.createElement("div");
    actions.className = "bookmark-edit-actions";

    if (dangerText) {
        const dangerBtn = document.createElement("button");
        dangerBtn.type = "button";
        dangerBtn.className = "bookmark-edit-btn danger";
        dangerBtn.textContent = dangerText;
        dangerBtn.addEventListener("click", () => {
            closeModal();
            if (onDanger) onDanger();
            refresh();
        });
        actions.appendChild(dangerBtn);
    }

    const spacer = document.createElement("span");
    spacer.className = "bookmark-edit-actions-spacer";
    actions.appendChild(spacer);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "bookmark-edit-btn cancel";
    cancelBtn.textContent = cancelText;
    cancelBtn.addEventListener("click", closeModal);

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "bookmark-edit-btn save";
    submitBtn.textContent = submitText;

    function handleSave() {
        const values = {};
        Object.keys(inputs).forEach(key => {
            values[key] = inputs[key].value.trim();
        });
        if (onSubmit && onSubmit(values) === false) return;
        closeModal();
        refresh();
    }

    submitBtn.addEventListener("click", handleSave);
    modal.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
    activeModalOverlay = overlay;

    const focusField = fields.find(f => f.autofocus) || fields[0];
    if (focusField && inputs[focusField.key]) {
        requestAnimationFrame(() => {
            inputs[focusField.key].focus();
            inputs[focusField.key].select();
        });
    }
}

export function openBookmarkModal({ colId, item = null }) {
    const isEdit = Boolean(item);
    openFormModal({
        title: isEdit ? "Edit Bookmark" : "Add Bookmark",
        fields: [
            { key: "name", label: "Name", value: isEdit ? item.name : "", placeholder: "Site name", autofocus: true },
            { key: "url", label: "URL", value: isEdit ? item.url : "", placeholder: "https://..." },
            {
                key: "bannerUrl",
                label: "Background image (URL or upload, optional)",
                value: isEdit ? item.bannerUrl : "",
                placeholder: "Empty = blurred icon background",
                image: { mode: "banner", w: 720, h: 240 }
            },
            {
                key: "iconUrl",
                label: "Icon image (URL or upload, optional)",
                value: isEdit ? item.iconUrl : "",
                placeholder: "Empty = auto favicon",
                image: { mode: "icon", size: 128 },
                // Edit mode only: re-fetch this bookmark's favicon on demand.
                refresh: isEdit
                    ? () => {
                          window.BMColumns.updateItem(colId, item.id, { iconBust: Date.now() });
                          refresh();
                      }
                    : null
            }
        ],
        submitText: isEdit ? "Save" : "Add",
        dangerText: isEdit ? "Delete" : null,
        onSubmit(values) {
            const url = normalizeUrl(values.url);
            if (!url) {
                const urlInput = document.getElementById("bm-field-url");
                if (urlInput) urlInput.focus();
                return false;
            }
            const name = values.name || hostnameName(url);
            if (isEdit) {
                window.BMColumns.updateItem(colId, item.id, { ...values, url, name });
            } else {
                window.BMColumns.addItem(colId, { ...values, url, name });
            }
        },
        onDanger() {
            if (isEdit) window.BMColumns.removeItem(colId, item.id);
        }
    });
}

export function openColumnModal({ column = null }) {
    const isEdit = Boolean(column);
    openFormModal({
        title: isEdit ? "Edit Column" : "New Column",
        fields: [
            { key: "name", label: "Column name", value: isEdit ? column.name : "New Column", placeholder: "e.g. Social", autofocus: true }
        ],
        submitText: isEdit ? "Save" : "Add",
        dangerText: isEdit ? "Delete" : null,
        onSubmit(values) {
            const name = values.name || (isEdit ? column.name : "New Column");
            if (isEdit) {
                window.BMColumns.updateColumn(column.id, { name });
            } else {
                window.BMColumns.addColumn(name);
            }
        },
        onDanger() {
            if (isEdit) window.BMColumns.removeColumn(column.id);
        }
    });
}

/*
 * Small anchored popover, items: [{ label, danger, fn }]
 */
export function openPopover(anchorEl, items) {
    closePopover();

    const rect = anchorEl.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "bm-pop";

    items.forEach(action => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bm-pop-item" + (action.danger ? " danger" : "");
        btn.textContent = action.label;
        btn.addEventListener("click", () => {
            closePopover();
            if (action.fn) action.fn();
            refresh();
        });
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    activePopover = menu;

    // Defer the outside-click closer so the click that opened this popover
    // (which is still bubbling/done dispatching later) doesn't close it at once.
    popoverOutsideHandler = (e) => {
        if (!menu.contains(e.target)) closePopover();
    };
    setTimeout(() => document.addEventListener("click", popoverOutsideHandler, true), 0);

    const popWidth = 160;
    const popHeight = menu.offsetHeight || items.length * 30;

    let x = rect.right - popWidth;
    if (x < 8) x = 8;
    let y = rect.bottom + 6;
    if (y + popHeight > window.innerHeight - 8) {
        y = Math.max(8, rect.top - popHeight - 6);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}
