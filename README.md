# Minimal New Tab

A clean, minimal, customizable New Tab page for Chrome.

---

## How to Install and Use in Chrome

### Option 1: Quick Install (Direct from `dist/prod`)

1. Open Google Chrome.
2. Navigate to `chrome://extensions` in the address bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left corner.
5. In the file dialog, select the `dist/prod` folder inside this repository.
6. Open a new tab (`Ctrl + T`) to start using the extension.

---

### Option 2: Building from Source

If you download fresh source files or make any changes in `src/`:

1. Open a terminal / command prompt in this directory.
2. Run the build command (requires Python):
   ```bash
   python build.py prod --zip
   ```
   This compiles and copies all files into `dist/prod` and creates `minimal_newtab_v1.5.1.zip`.
3. In `chrome://extensions`, click **Load unpacked** and select `dist/prod`.

---

## Updating After Making Changes

Whenever you pull updates or edit files:
1. Run:
   ```bash
   python build.py prod --zip
   ```
2. Go to `chrome://extensions` and click the **Reload** (🔄) icon on the **Minimal New Tab** card.
