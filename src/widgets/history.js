export function renderHistory() {
    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'history-widget';

    const title = document.createElement('h3');
    title.textContent = 'History';
    widgetWrapper.appendChild(title);

    const historyList = document.createElement('ul');
    historyList.className = 'history-list';
    widgetWrapper.appendChild(historyList);

    function createHistoryItem(item) {
        const li = document.createElement('li');
        li.className = 'history-item';

        const a = document.createElement('a');
        a.className = 'shortcut';
        a.href = item.url;
        a.title = item.title || item.url;

        const span = document.createElement('span');
        span.textContent = item.title || item.url;

        a.appendChild(span);

        a.addEventListener('click', (e) => {
            e.preventDefault();
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            if (settings.openInNewTab) {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                    chrome.tabs.create({ url: item.url });
                } else {
                    window.open(item.url, '_blank');
                }
            } else {
                window.location.href = item.url;
            }
        });

        li.appendChild(a);
        return li;
    }

    if (typeof chrome !== 'undefined' && chrome.history && chrome.history.search) {
        chrome.history.search({ text: '', maxResults: 1000, startTime: 0 }, (results) => {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                console.warn("History error:", chrome.runtime.lastError);
                return;
            }
            historyList.innerHTML = '';
            const seenUrls = new Set();
            const validItems = [];

            for (const item of (results || [])) {
                if (!item.url || seenUrls.has(item.url)) continue;
                if (item.url.startsWith('chrome-extension://') || item.url.startsWith('chrome://newtab')) continue;
                seenUrls.add(item.url);
                validItems.push(item);
            }

            if (validItems.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'history-empty';
                empty.style.opacity = '0.6';
                empty.style.padding = '8px 4px';
                empty.style.fontSize = '0.9em';
                empty.textContent = 'No recent history';
                historyList.appendChild(empty);
                return;
            }

            validItems.forEach(item => {
                historyList.appendChild(createHistoryItem(item));
            });
        });
    } else {
        const empty = document.createElement('li');
        empty.className = 'history-empty';
        empty.style.opacity = '0.7';
        empty.style.padding = '10px 4px';
        empty.style.fontSize = '0.85em';
        empty.style.lineHeight = '1.4';
        empty.innerHTML = 'History unavailable.<br><span style="text-decoration:underline dotted; cursor:pointer;" title="Click to open extensions page">Reload extension in chrome://extensions</span>';
        empty.querySelector('span')?.addEventListener('click', () => {
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url: 'chrome://extensions' });
            } else {
                window.open('chrome://extensions', '_blank');
            }
        });
        historyList.appendChild(empty);
    }

    return widgetWrapper;
}
