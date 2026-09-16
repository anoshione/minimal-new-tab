import { distributeColumns } from './bookmarks.js';

const STORAGE_KEY = 'bookmark-colors';

// Curated palette of colors chosen for great legibility and vibrant contrast in both dark and light modes
export const COLOR_PALETTE = [
    { label: 'Red', hex: '#ef4444' },
    { label: 'Orange', hex: '#f97316' },
    { label: 'Amber', hex: '#f59e0b' },
    { label: 'Green', hex: '#22c55e' },
    { label: 'Emerald', hex: '#10b981' },
    { label: 'Cyan', hex: '#06b6d4' },
    { label: 'Blue', hex: '#3b82f6' },
    { label: 'Indigo', hex: '#6366f1' },
    { label: 'Purple', hex: '#a855f7' },
    { label: 'Pink', hex: '#ec4899' },
];

export function getBookmarkColors() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

export function getBookmarkColor(id) {
    if (!id) return null;
    const colors = getBookmarkColors();
    return colors[String(id)] || null;
}

export function setBookmarkColor(id, hexColor) {
    if (!id) return;
    const colors = getBookmarkColors();
    if (hexColor && hexColor.trim()) {
        colors[String(id)] = hexColor.trim();
    } else {
        delete colors[String(id)];
    }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
    } catch (e) {
        console.error('Failed to save bookmark color', e);
    }
}

export function applyColorToElement(element, color) {
    if (!element) return;
    if (color) {
        element.style.color = color;
        element.style.textDecorationColor = color;
    } else {
        element.style.color = '';
        element.style.textDecorationColor = '';
    }
}

let activeContextMenu = null;
let activeModalOverlay = null;

function closeContextMenu() {
    if (activeContextMenu && activeContextMenu.parentNode) {
        activeContextMenu.parentNode.removeChild(activeContextMenu);
    }
    activeContextMenu = null;
}

function closeModal() {
    if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
    }
    activeModalOverlay = null;
}

// Global click and escape listener to dismiss context menu
document.addEventListener('click', (e) => {
    if (activeContextMenu && !activeContextMenu.contains(e.target)) {
        closeContextMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeModalOverlay) {
            closeModal();
            e.stopPropagation();
        } else if (activeContextMenu) {
            closeContextMenu();
            e.stopPropagation();
        }
    }
});

window.addEventListener('resize', () => {
    closeContextMenu();
});

export function openContextMenu(e, itemData) {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();

    const { id, title, url, isFolder, element, inheritedColor } = itemData;
    const currentColor = getBookmarkColor(id);

    const menu = document.createElement('div');
    menu.className = 'bookmark-context-menu';

    // Header info
    const header = document.createElement('div');
    header.className = 'bookmark-context-header';
    header.textContent = isFolder ? 'Folder' : 'Bookmark';
    menu.appendChild(header);

    // Edit Item option
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'bookmark-context-item';
    editBtn.innerHTML = `<span class="icon">✎</span><span>Edit ${isFolder ? 'Folder' : 'Bookmark'}</span>`;
    editBtn.addEventListener('click', () => {
        closeContextMenu();
        openEditModal(itemData);
    });
    menu.appendChild(editBtn);

    // Color swatches label
    const colorLabel = document.createElement('div');
    colorLabel.className = 'bookmark-context-subheading';
    colorLabel.textContent = 'Text Color';
    menu.appendChild(colorLabel);

    // Color swatches container
    const colorsRow = document.createElement('div');
    colorsRow.className = 'bookmark-context-colors';

    // Default / Clear dot
    const clearDot = document.createElement('button');
    clearDot.type = 'button';
    clearDot.className = `bookmark-color-dot clear-dot ${!currentColor ? 'selected' : ''}`;
    clearDot.title = 'Default theme color';
    clearDot.innerHTML = '<span>×</span>';
    clearDot.addEventListener('click', () => {
        setBookmarkColor(id, null);
        applyColorToElement(element, inheritedColor || '');
        closeContextMenu();
        if (isFolder) {
            refreshFolderAndChildren(id);
        }
    });
    colorsRow.appendChild(clearDot);

    // Palette dots
    COLOR_PALETTE.forEach(({ label, hex }) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `bookmark-color-dot ${currentColor === hex ? 'selected' : ''}`;
        dot.style.backgroundColor = hex;
        dot.title = label;
        dot.addEventListener('click', () => {
            setBookmarkColor(id, hex);
            applyColorToElement(element, hex);
            closeContextMenu();
            if (isFolder) {
                refreshFolderAndChildren(id);
            }
        });
        colorsRow.appendChild(dot);
    });

    menu.appendChild(colorsRow);

    // If a custom color is already set, provide a direct text button to reset it
    if (currentColor) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'bookmark-context-item danger';
        resetBtn.innerHTML = `<span class="icon">↺</span><span>Reset Color</span>`;
        resetBtn.addEventListener('click', () => {
            setBookmarkColor(id, null);
            applyColorToElement(element, inheritedColor || '');
            closeContextMenu();
            if (isFolder) {
                refreshFolderAndChildren(id);
            }
        });
        menu.appendChild(resetBtn);
    }

    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Position menu safely within viewport
    const menuWidth = 200;
    const menuHeight = 210;
    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuWidth > window.innerWidth - 10) {
        posX = window.innerWidth - menuWidth - 10;
    }
    if (posY + menuHeight > window.innerHeight - 10) {
        posY = window.innerHeight - menuHeight - 10;
    }
    if (posX < 10) posX = 10;
    if (posY < 10) posY = 10;

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
}

export function openEditModal(itemData) {
    closeContextMenu();
    closeModal();

    const { id, isFolder, element, inheritedColor } = itemData;
    let currentTitle = itemData.title || '';
    let currentUrl = itemData.url || '';
    if (element) {
        if (isFolder) {
            const titleSpan = element.querySelector('span:last-child');
            if (titleSpan) currentTitle = titleSpan.textContent.trim();
        } else {
            const textSpan = element.querySelector('span:not(.number-hint)');
            if (textSpan) currentTitle = textSpan.textContent.trim();
            if (element.href) currentUrl = element.href;
        }
    }
    let selectedColor = getBookmarkColor(id) || '';

    const overlay = document.createElement('div');
    overlay.className = 'bookmark-edit-overlay';

    const modal = document.createElement('div');
    modal.className = 'bookmark-edit-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'bookmark-edit-header';
    const heading = document.createElement('h3');
    heading.textContent = isFolder ? 'Edit Folder' : 'Edit Bookmark';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'bookmark-edit-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(heading);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Live preview
    const previewContainer = document.createElement('div');
    previewContainer.className = 'bookmark-preview-container';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'bookmark-edit-label';
    previewLabel.textContent = 'Preview';
    const previewItem = document.createElement('div');
    previewItem.className = 'bookmark-preview-item';
    const previewText = document.createElement('span');
    previewText.className = 'preview-text';
    previewText.textContent = currentTitle || (isFolder ? 'Folder' : 'Bookmark');
    previewItem.appendChild(previewText);

    function updatePreview() {
        previewText.textContent = titleInput.value.trim() || (isFolder ? 'Folder' : 'Bookmark');
        const effective = selectedColor || inheritedColor || '';
        if (effective) {
            previewItem.style.color = effective;
            previewItem.style.textDecorationColor = effective;
        } else {
            previewItem.style.color = '';
            previewItem.style.textDecorationColor = '';
        }
    }

    previewContainer.appendChild(previewLabel);
    previewContainer.appendChild(previewItem);
    modal.appendChild(previewContainer);

    // Title field
    const titleField = document.createElement('div');
    titleField.className = 'bookmark-edit-field';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'bookmark-edit-input';
    titleInput.value = currentTitle;
    titleInput.placeholder = 'Title...';
    titleInput.addEventListener('input', updatePreview);
    titleField.appendChild(titleLabel);
    titleField.appendChild(titleInput);
    modal.appendChild(titleField);

    // URL field (only for links)
    let urlInput = null;
    if (!isFolder) {
        const urlField = document.createElement('div');
        urlField.className = 'bookmark-edit-field';
        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'URL';
        urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'bookmark-edit-input';
        urlInput.value = currentUrl;
        urlInput.placeholder = 'https://...';
        urlField.appendChild(urlLabel);
        urlField.appendChild(urlInput);
        modal.appendChild(urlField);
    }

    // Text Color field
    const colorField = document.createElement('div');
    colorField.className = 'bookmark-edit-field';
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Text Color';
    colorField.appendChild(colorLabel);

    const swatchesWrapper = document.createElement('div');
    swatchesWrapper.className = 'bookmark-color-swatches';

    // Default swatch
    const defaultSwatch = document.createElement('button');
    defaultSwatch.type = 'button';
    defaultSwatch.className = `bookmark-color-swatch default-swatch ${!selectedColor ? 'active' : ''}`;
    defaultSwatch.title = 'Default theme color';
    defaultSwatch.innerHTML = '<span>Default</span>';
    defaultSwatch.addEventListener('click', () => {
        selectedColor = '';
        modal.querySelectorAll('.bookmark-color-swatch').forEach(s => s.classList.remove('active'));
        defaultSwatch.classList.add('active');
        updatePreview();
    });
    swatchesWrapper.appendChild(defaultSwatch);

    // Palette swatches
    COLOR_PALETTE.forEach(({ label, hex }) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `bookmark-color-swatch ${selectedColor.toLowerCase() === hex.toLowerCase() ? 'active' : ''}`;
        swatch.style.backgroundColor = hex;
        swatch.title = label;
        swatch.addEventListener('click', () => {
            selectedColor = hex;
            modal.querySelectorAll('.bookmark-color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            updatePreview();
        });
        swatchesWrapper.appendChild(swatch);
    });

    // Custom color picker input
    const customColorContainer = document.createElement('label');
    customColorContainer.className = 'bookmark-color-picker-label';
    customColorContainer.title = 'Custom color';

    const customColorInput = document.createElement('input');
    customColorInput.type = 'color';
    customColorInput.className = 'bookmark-custom-color-input';
    customColorInput.value = selectedColor || '#ffffff';

    const customIcon = document.createElement('span');
    customIcon.className = 'custom-color-icon';
    customIcon.innerHTML = '+';

    customColorInput.addEventListener('input', (e) => {
        selectedColor = e.target.value;
        modal.querySelectorAll('.bookmark-color-swatch').forEach(s => s.classList.remove('active'));
        customColorContainer.classList.add('active');
        customColorContainer.style.borderColor = selectedColor;
        updatePreview();
    });

    customColorContainer.appendChild(customColorInput);
    customColorContainer.appendChild(customIcon);
    swatchesWrapper.appendChild(customColorContainer);

    colorField.appendChild(swatchesWrapper);
    modal.appendChild(colorField);

    // Actions (Cancel, Save)
    const actions = document.createElement('div');
    actions.className = 'bookmark-edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bookmark-edit-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'bookmark-edit-btn save';
    saveBtn.textContent = 'Save';

    function handleSave() {
        const newTitle = titleInput.value.trim();
        const newUrl = urlInput ? urlInput.value.trim() : null;

        if (!newTitle) {
            titleInput.focus();
            return;
        }

        // 1. Update color in storage
        setBookmarkColor(id, selectedColor);

        // 2. Update Chrome bookmark via API
        if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.update) {
            const updateDetails = { title: newTitle };
            if (!isFolder && newUrl) {
                updateDetails.url = newUrl;
            }
            chrome.bookmarks.update(id, updateDetails, () => {
                // Bookmark updated in Chrome
            });
        }

        // 3. Update DOM representation immediately
        if (isFolder) {
            const titleSpan = element.querySelector('span:last-child');
            if (titleSpan) {
                titleSpan.textContent = ` ${newTitle}`;
            }
            applyColorToElement(element, selectedColor || inheritedColor || '');
            refreshFolderAndChildren(id);
        } else {
            const textSpan = element.querySelector('span:not(.number-hint)');
            if (textSpan) {
                textSpan.textContent = newTitle;
            }
            if (newUrl) {
                element.href = newUrl;
            }
            applyColorToElement(element, selectedColor || inheritedColor || '');
        }

        closeModal();

        // Re-balance columns in case title length altered wrapping/height
        distributeColumns();
        requestAnimationFrame(() => distributeColumns());
    }

    saveBtn.addEventListener('click', handleSave);

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    // Keyboard support inside modal
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
    });

    document.body.appendChild(overlay);
    activeModalOverlay = overlay;

    updatePreview();

    requestAnimationFrame(() => {
        titleInput.focus();
        titleInput.select();
    });
}

function refreshFolderAndChildren(folderId) {
    const folderColor = getBookmarkColor(folderId);
    const folderItem = document.querySelector(`.bookmark-folder-item[data-bookmark-id="${folderId}"]`);
    if (!folderItem) return;

    const childrenContainer = folderItem.querySelector('.bookmark-children');
    if (!childrenContainer) return;

    const childLinks = childrenContainer.querySelectorAll('.bookmark-link-item');
    childLinks.forEach(linkItem => {
        const childId = linkItem.dataset.bookmarkId;
        const ownColor = getBookmarkColor(childId);
        const a = linkItem.querySelector('a.shortcut');
        if (a && !ownColor) {
            applyColorToElement(a, folderColor || '');
        }
    });
}

export function initBookmarkItem(element, node, isFolder, inheritedColor = null) {
    if (!element || !node) return;

    const id = node.id;
    element.dataset.bookmarkId = id;

    // Apply color: individual color takes precedence over inherited folder color
    const ownColor = getBookmarkColor(id);
    const effectiveColor = ownColor || inheritedColor || null;
    if (effectiveColor) {
        applyColorToElement(element, effectiveColor);
    }

    const itemData = {
        id,
        title: node.title || (isFolder ? 'Untitled folder' : (node.url || '')),
        url: node.url || '',
        isFolder: Boolean(isFolder),
        element,
        inheritedColor,
    };

    // Right-click context menu
    element.addEventListener('contextmenu', (e) => {
        openContextMenu(e, itemData);
    });
}
