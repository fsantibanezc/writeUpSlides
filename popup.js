const SLIDES_URL = /^https?:\/\/docs\.google\.com\/presentation\//;

const toggleBtn = document.getElementById('toggleBtn');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const colorPicker = document.getElementById('colorPicker');
const swatches = document.querySelectorAll('.color-swatch');

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

function sendToTopFrame(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve({ response });
      }
    });
  });
}

async function sendMessageToContentScript(command, data = {}, callback) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (tab.url && !SLIDES_URL.test(tab.url)) {
    showStatus('Open a Google Slides presentation to draw.');
    return;
  }

  const message = { command, ...data };
  let result = await sendToTopFrame(tab.id, message);

  // Tabs opened before the extension was installed/reloaded have no content script yet.
  if (result.error) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      result = await sendToTopFrame(tab.id, message);
    } catch (err) {
      result = { error: err.message };
    }
  }

  if (result.error) {
    console.warn('Communication status:', result.error);
    showStatus("Couldn't reach the page. Reload the Slides tab and try again.");
    return;
  }

  showStatus('');
  if (callback && result.response) callback(result.response);
}

function updateUI(state) {
  if (!state) return;
  if (state.drawingModeActive !== undefined) {
    toggleBtn.innerText = state.drawingModeActive ? 'Turn Pen OFF' : 'Turn Pen ON';
    toggleBtn.classList.toggle('active', state.drawingModeActive);
  }
  if (state.manualEraserMode !== undefined) {
    eraserBtn.innerText = state.manualEraserMode ? 'Eraser Active' : 'Toggle Eraser';
    eraserBtn.classList.toggle('active', state.manualEraserMode);
  }
  if (state.currentColor) {
    setColorUI(state.currentColor);
  }
}

function setColorUI(colorHex) {
  swatches.forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.color.toUpperCase() === colorHex.toUpperCase());
  });
  colorPicker.value = colorHex;
}

function setColor(colorHex) {
  setColorUI(colorHex);
  // Picking a color turns the eraser off in the page; refresh the buttons from the reply.
  sendMessageToContentScript('set_color', { color: colorHex }, updateUI);
}

// Request initial state when popup opens.
sendMessageToContentScript('get_state', {}, updateUI);

toggleBtn.addEventListener('click', () => {
  sendMessageToContentScript('toggle_drawing', {}, updateUI);
});

eraserBtn.addEventListener('click', () => {
  sendMessageToContentScript('toggle_eraser', {}, updateUI);
});

clearBtn.addEventListener('click', () => {
  sendMessageToContentScript('clear_canvas', {}, () => {
    clearBtn.innerText = 'Cleared!';
    setTimeout(() => {
      clearBtn.innerText = 'Clear Screen';
    }, 1000);
  });
});

swatches.forEach((swatch) => {
  swatch.addEventListener('click', () => setColor(swatch.dataset.color));
});

colorPicker.addEventListener('change', (e) => setColor(e.target.value));
