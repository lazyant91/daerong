const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings APIs
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.send('set-setting', key, value),
  onSettingsChanged: (callback) => {
    const subscription = (event, settings) => callback(settings);
    ipcRenderer.on('settings-changed', subscription);
    return () => ipcRenderer.removeListener('settings-changed', subscription);
  },

  // Floating Window Action APIs
  getWindowInfo: () => ipcRenderer.invoke('get-window-info'),
  closeWindow: (windowId) => ipcRenderer.send('close-window', windowId),
  setAlwaysOnTop: (windowId, isAlwaysOnTop) => ipcRenderer.send('set-always-on-top', windowId, isAlwaysOnTop),
  saveImage: (windowId) => ipcRenderer.invoke('save-image', windowId),
  copyToClipboard: (filePath) => ipcRenderer.invoke('copy-to-clipboard', filePath),
  setOpacity: (windowId, opacity) => ipcRenderer.send('set-opacity', windowId, opacity),
  
  // Window Dragging Implementation
  startDrag: (windowId, startX, startY) => ipcRenderer.send('window-drag-start', windowId, startX, startY),
  performDrag: (windowId, clientX, clientY) => ipcRenderer.send('window-drag-move', windowId, clientX, clientY),
  stopDrag: (windowId) => ipcRenderer.send('window-drag-end', windowId),

  // Window Resizing & Bounds Control APIs
  resizeWindow: (windowId, width, height) => ipcRenderer.send('resize-window', windowId, width, height),
  resizeWindowContent: (windowId, width, height) => ipcRenderer.send('resize-window-content', windowId, width, height),
  getWindowBounds: (windowId) => ipcRenderer.invoke('get-window-bounds', windowId),
  setWindowBounds: (windowId, bounds) => ipcRenderer.send('set-window-bounds', windowId, bounds),
  resizeTrayWindow: (width, height) => ipcRenderer.send('resize-tray-window', width, height),

  // Magnifier APIs
  getCaptureSources: () => ipcRenderer.invoke('get-capture-sources'),
  startMagnifierSelection: (rect) => ipcRenderer.send('start-magnifier-selection', rect),
  closeSelectionWindow: () => ipcRenderer.send('close-selection-window'),

  // History Clean Up API
  clearHistory: () => ipcRenderer.send('clear-history'),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),

  // Native Context Menu Trigger API
  showContextMenu: (windowId) => ipcRenderer.send('show-context-menu', windowId),

  // History folder & Window focusing APIs
  openHistoryFolder: () => ipcRenderer.send('open-history-folder'),
  getActiveWindows: () => ipcRenderer.invoke('get-active-windows'),
  focusWindow: (windowId) => ipcRenderer.send('focus-window', windowId),

  // Custom Tray Menu Window Action APIs
  closeAllFloatingWindows: () => ipcRenderer.send('close-all-windows'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  hideTrayMenu: () => ipcRenderer.send('hide-tray-menu'),
  exitApp: () => ipcRenderer.send('exit-app'),
  getHotkeyPaused: () => ipcRenderer.invoke('get-hotkey-paused'),
  toggleHotkeyPaused: () => ipcRenderer.invoke('toggle-hotkey-paused'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openGridWindow: () => ipcRenderer.send('open-grid-window'),
  createFloatingWindow: (filePath, historyId) => ipcRenderer.send('create-floating-window', filePath, historyId),


  // Main-to-Renderer Event Listener Bridge
  on: (channel, callback) => {
    const validChannels = [
      'reset-to-original-size',
      'always-on-top-changed',
      'toast-message',
      'active-windows-updated',
      'history-updated',
      'hotkey-paused-updated',
      'tray-opened'
    ];
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  }
});
