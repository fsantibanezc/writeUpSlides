# writeUpSlides — Slides Free Draw

A Chrome extension for drawing by hand on top of Google Slides: circle things, underline them, or sketch a diagram while you present or edit. It works with a mouse, a touchscreen, or a pen tablet such as a Wacom, including its side button.

Your ink sits on a transparent layer above the page. It never changes the presentation itself, and you can clear it at any time.

## Installation

The extension isn't on the Chrome Web Store, so you load it yourself in Chrome's developer mode. This takes about a minute and works in Chrome, Edge, Brave and other Chromium browsers.

1. **Get the files:**
   - **Packaged version:** download [`dist/slides-free-draw-v1.7.zip`](dist/slides-free-draw-v1.7.zip) and unzip it into a folder you'll keep, such as `Documents/SlidesFreeDraw`. Chrome loads the extension from that folder every time it starts, so don't delete it.
   - **From source:** `git clone https://github.com/fsantibanezc/writeUpSlides.git`
2. Open `chrome://extensions` in the address bar.
3. Turn on **Developer mode** (the switch at the top right).
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
5. Optional: click the puzzle-piece icon in the toolbar and pin **Slides Free Draw** so its button is always visible.
6. **Reload any Google Slides tabs that were already open.**

### Updating

Replace the folder's contents with the new version, click the reload icon on the extension's card in `chrome://extensions`, then reload your Slides tabs.

## Using it

Open a presentation at `docs.google.com/presentation/...`. You can be editing it or presenting it.

### Popup controls

Click the extension's toolbar button to open the popup:

| Control | What it does |
|---|---|
| **Turn Pen ON / OFF** | Starts or stops drawing. While the pen is on, clicks draw instead of reaching the slide. Turn it off to click, select or advance slides again. |
| **Toggle Eraser** | Switches the pen into an eraser. Picking a color switches back to the pen. |
| **Clear Screen** | Erases all ink. |
| **Pen Color** | Five preset colors (red, blue, green, yellow, black) plus a custom color picker. |

### Keyboard shortcuts

| Windows / Linux | Mac | Action |
|---|---|---|
| `Alt + D` | `Option + D` | Turn the pen on or off |
| `Alt + E` | `Option + E` | Turn the eraser on or off |
| `Alt + C` | `Option + C` | Clear all ink |

The shortcuts work while editing and while presenting. Click on the presentation first so the tab has keyboard focus.

### Pen tablets (Wacom and similar)

- Draw with the pen tip.
- Hold the **side (barrel) button** while drawing to erase, or flip the pen and use its **eraser end**, if it has one.
- Without a tablet, holding the right mouse button while dragging also erases.

### Typical presenting workflow

1. Start presenting (**Slideshow**).
2. Press `Alt + D` and draw.
3. Press `Alt + C` to clear, then `Alt + D` to turn the pen off.
4. Advance to the next slide with the keyboard or a click.

## Things to know

- **Ink belongs to the screen, not the slide.** It stays in place when you change slides, so clear it before moving on.
- **Ink is temporary.** It isn't saved with the presentation and disappears when you reload the tab.
- **Resizing the window or entering fullscreen keeps your ink,** but it stays at the same spot on the screen. If the slide moves or changes size, the ink won't line up with it anymore.
- There is no undo. Use the eraser or **Clear Screen**.

## Troubleshooting

| Problem | Fix |
|---|---|
| The popup says it *couldn't reach the page*. | Reload the Slides tab. This happens after the extension is installed, updated or reloaded. |
| The popup says *Open a Google Slides presentation*. | The extension only works on `docs.google.com/presentation/` pages. |
| Clicks don't reach the slide even with the pen off. | Reload the tab. If it keeps happening, check `chrome://extensions` for a second copy of Slides Free Draw and remove it. |
| The shortcuts do nothing. | Click on the presentation first so the page has keyboard focus. Check that no other extension uses the same keys. |
| A pen tablet scrolls or selects text instead of drawing. | Make sure the pen is turned on. In the tablet driver settings, turn off "Windows Ink" gestures or flicks if they're on. |

## Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Lets the popup talk to the Slides tab you're looking at. |
| `scripting` | Lets the popup add the drawing layer to a tab that was open before the extension was installed or updated. |

The extension only runs on `docs.google.com/presentation/*`. It collects no data and makes no network requests.

## For developers

| File | Role |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3). |
| `content.js` | Drawing layer: canvas, strokes, eraser, shortcuts and fullscreen handling. |
| `popup.html`, `popup.js` | Toolbar popup. |
| `package.sh` | Builds `dist/slides-free-draw-v<version>.zip` from the files above. |

To make a release, bump `"version"` in `manifest.json`, run `./package.sh` and commit the new zip in `dist/`. The same zip can be uploaded to the Chrome Web Store.

## License

MIT. See [LICENSE](LICENSE).
