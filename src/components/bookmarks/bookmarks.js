const BOOKMARK_FOLDER_STATE_KEY = 'bookmark-folders-state';

function getFolderStates() {
    try {
        const stored = localStorage.getItem(BOOKMARK_FOLDER_STATE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function saveFolderState(key, isExpanded) {
    const states = getFolderStates();
    states[key] = isExpanded;
    localStorage.setItem(BOOKMARK_FOLDER_STATE_KEY, JSON.stringify(states));
}

const DOTTED_ARROW_RIGHT = `<svg class="dotted-arrow" viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1.2 1.6"><path d="M4.5 2.5L9 7L4.5 11.5"/></svg>`;
const DOTTED_ARROW_DOWN = `<svg class="dotted-arrow" viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1.2 1.6"><path d="M2.5 4.5L7 9L11.5 4.5"/></svg>`;


function updateFolderState(folderButton, chevron, childrenList, isOpen) {
    if (isOpen) {
        chevron.innerHTML = DOTTED_ARROW_DOWN;
        folderButton.classList.add('open');
        childrenList.classList.remove('collapsed');
    } else {
        chevron.innerHTML = DOTTED_ARROW_RIGHT;
        folderButton.classList.remove('open');
        childrenList.classList.add('collapsed');
    }
}

function processBookmarks(settings, nodes, container, level = 0, path = "") {
    const savedStates = getFolderStates();

    nodes.forEach(node => {
        const currentPath = `${path}/${node.title || "Untitled"}`;
        const folderKey = node.id ? `id_${node.id}` : currentPath;

        if (node.children && node.children.length > 0) {
            const listItem = document.createElement('li');
            listItem.className = 'bookmark-folder-item';

            const folderButton = document.createElement('button');
            folderButton.type = 'button';
            folderButton.className = 'bookmark-folder';
            const chevron = document.createElement('span');
            chevron.className = 'chevron';

            const title = document.createElement('span');
            title.textContent = ` ${node.title || "Untitled folder"}`;

            folderButton.appendChild(chevron);
            folderButton.appendChild(title);

            const childrenList = document.createElement('ul');
            childrenList.className = 'bookmark-children';

            let isOpen;
            if (savedStates.hasOwnProperty(folderKey)) {
                isOpen = Boolean(savedStates[folderKey]);
            } else if (localStorage.getItem(currentPath) !== null) {
                isOpen = localStorage.getItem(currentPath) === "true";
            } else {
                isOpen = Boolean(settings.expandBookmarks);
            }

            updateFolderState(folderButton, chevron, childrenList, isOpen);

            folderButton.addEventListener('click', () => {
                const willOpen = childrenList.classList.contains('collapsed');
                updateFolderState(folderButton, chevron, childrenList, willOpen);
                saveFolderState(folderKey, willOpen);
                distributeColumns();
                requestAnimationFrame(() => distributeColumns());
            });


            listItem.appendChild(folderButton);
            listItem.appendChild(childrenList);
            container.appendChild(listItem);

            processBookmarks(settings, node.children, childrenList, level + 1, currentPath);
        } else if (node.url) {
            const listItem = document.createElement('li');
            listItem.className = 'bookmark-link-item';

            const a = document.createElement('a');
            a.href = node.url;
            a.className = 'shortcut';
            const text = document.createElement('span');
            text.textContent = node.title || node.url;
            a.appendChild(text);

            listItem.appendChild(a);
            container.appendChild(listItem);
        }
    });
}

function distributeColumns() {
    const shortcuts = document.getElementById('shortcuts');
    if (!shortcuts || shortcuts.classList.contains('search-mode')) return;

    const wrapper = shortcuts.querySelector('.bookmark-columns-wrapper');
    if (!wrapper) return;

    const col1 = wrapper.querySelector('.bookmark-list.col-1');
    const col2 = wrapper.querySelector('.bookmark-list.col-2');
    const col3 = wrapper.querySelector('.bookmark-list.col-3');
    if (!col1 || !col2) return;

    // Available height: clientHeight of shortcuts minus any search input height
    const inputElement = shortcuts.querySelector('#quick-command-input');
    const inputHeight = inputElement ? inputElement.offsetHeight + 10 : 0;
    const availableHeight = shortcuts.clientHeight - inputHeight;

    if (availableHeight <= 0) return;

    shortcuts.scrollTop = 0;
    wrapper.scrollTop = 0;

    // Collect all top-level items
    const items = [];
    while (col1.firstChild) {
        items.push(col1.firstChild);
        col1.removeChild(col1.firstChild);
    }
    while (col2.firstChild) {
        items.push(col2.firstChild);
        col2.removeChild(col2.firstChild);
    }
    if (col3) {
        while (col3.firstChild) {
            items.push(col3.firstChild);
            col3.removeChild(col3.firstChild);
        }
    }

    if (items.length === 0) return;

    // Temporarily append all items to col1 to measure in DOM
    items.forEach(item => col1.appendChild(item));

    function updateWrapperClasses(numCols) {
        wrapper.classList.toggle('is-single-column', numCols === 1);
        wrapper.classList.toggle('has-two-columns', numCols === 2);
        wrapper.classList.toggle('has-three-columns', numCols === 3);
    }

    // Measure exact pixel heights of top-level items in DOM
    // using actual inter-item distances in the live layout
    const itemHeights = items.map((item, idx) => {
        if (idx < items.length - 1) {
            const nextItem = items[idx + 1];
            const dist = nextItem.offsetTop - item.offsetTop;
            if (dist > 0) return dist;
        }
        return item.offsetHeight + 6;
    });

    // Measure exact distance from screen top to clock (same padding as clock top)
    const clock = document.getElementById('clock') || document.querySelector('.time');
    const clockTop = clock ? clock.getBoundingClientRect().top : (window.innerHeight * 0.1 + 48);

    // Max height has the same padding from bottom that clock has from top
    const maxBottom = window.innerHeight - clockTop;
    const wrapperTop = wrapper.getBoundingClientRect().top;
    const maxWrapperHeight = Math.max(140, Math.floor(maxBottom - wrapperTop));

    // Dynamically set the wrapper's max-height to reach that exact symmetrical bottom boundary
    wrapper.style.maxHeight = `${maxWrapperHeight}px`;

    // Maximum column content height before scrolling begins (wrapper padding 20px + border 2px + 2px buffer)
    const columnMaxHeight = Math.max(100, maxWrapperHeight - 24);

    // Check how many columns are physically possible based on container max-width (720px) and shortcuts width
    const maxContainerWidth = 720;
    const availableContainerWidth = Math.min(shortcuts.clientWidth || maxContainerWidth, maxContainerWidth);
    const canMake2Cols = availableContainerWidth >= 340 && items.length >= 2;
    const canMake3Cols = availableContainerWidth >= 480 && items.length >= 3;

    // Sequential filling:
    // Fill Column 1 until it exceeds columnMaxHeight.
    // When Column 1 exceeds that, immediately put other bookmarks in the next column (if possible).
    // When Column 2 exceeds that, immediately put other bookmarks in Column 3 (if possible).
    // If not possible, put remaining bookmarks in scroll. Until that, no scroll!
    const col1Items = [];
    const col2Items = [];
    const col3Items = [];

    let currentH1 = 0;
    let i = 0;

    // Fill Column 1
    while (i < items.length) {
        const h = itemHeights[i];
        if (col1Items.length > 0 && canMake2Cols && (currentH1 + h > columnMaxHeight)) {
            break; // Column 1 exceeds max height, immediately put others in next column!
        }
        col1Items.push(items[i]);
        currentH1 += h;
        i++;
    }

    // Fill Column 2
    let currentH2 = 0;
    while (i < items.length) {
        const h = itemHeights[i];
        if (col2Items.length > 0 && canMake3Cols && (currentH2 + h > columnMaxHeight)) {
            break; // Column 2 exceeds max height, immediately put others in Column 3!
        }
        col2Items.push(items[i]);
        currentH2 += h;
        i++;
    }

    // Fill Column 3 (or whatever remains if no further column is possible -> will scroll)
    while (i < items.length) {
        col3Items.push(items[i]);
        i++;
    }

    // Append to DOM
    col1Items.forEach(item => col1.appendChild(item));
    col2Items.forEach(item => col2.appendChild(item));
    if (col3) {
        col3Items.forEach(item => col3.appendChild(item));
    }

    const numCols = col3Items.length > 0 ? 3 : (col2Items.length > 0 ? 2 : 1);
    updateWrapperClasses(numCols);
}

function renderBookmarks(settings) {
    const shortcuts = document.getElementById('shortcuts');
    if (!shortcuts) return;

    if (typeof chrome === "undefined" || !chrome.bookmarks || !chrome.bookmarks.getTree) {
        return;
    }

    chrome.bookmarks.getTree(tree => {
        const existingInput = document.getElementById('quick-command-input');

        let bookmarksBar = settings.bookmarkFolder?.trim()
            ? tree[0].children.find(f => f.title.toLowerCase() === settings.bookmarkFolder.toLowerCase())
            : tree[0].children[0];

        if (settings.bookmarkFolder?.trim() && !bookmarksBar) {
            shortcuts.innerHTML = "Bookmark folder not found.";
            return;
        }

        shortcuts.innerHTML = '';

        if (existingInput) {
            shortcuts.appendChild(existingInput);
        }

        const columnsWrapper = document.createElement('div');
        columnsWrapper.className = 'bookmark-columns-wrapper is-single-column';

        const col1 = document.createElement('ul');
        col1.className = 'bookmark-list col-1';

        const col2 = document.createElement('ul');
        col2.className = 'bookmark-list col-2';

        const col3 = document.createElement('ul');
        col3.className = 'bookmark-list col-3';

        columnsWrapper.appendChild(col1);
        columnsWrapper.appendChild(col2);
        columnsWrapper.appendChild(col3);

        processBookmarks(
            settings,
            settings.bookmarkFolder?.trim() ? bookmarksBar.children : tree[0].children,
            col1
        );

        shortcuts.appendChild(columnsWrapper);

        requestAnimationFrame(() => {
            distributeColumns();
        });
    });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        distributeColumns();
    }, 100);
});

window.distributeColumns = distributeColumns;

const shortcutsContainer = document.getElementById('shortcuts');
if (shortcutsContainer) {
    shortcutsContainer.addEventListener('wheel', (e) => {
        if (shortcutsContainer.classList.contains('search-mode')) return;
        if (e.target.closest('.bookmark-columns-wrapper')) return;
        const wrapper = shortcutsContainer.querySelector('.bookmark-columns-wrapper');
        if (wrapper && wrapper.scrollHeight > wrapper.clientHeight) {
            wrapper.scrollTop += e.deltaY;
        }
    }, { passive: true });
}

export { renderBookmarks, distributeColumns };