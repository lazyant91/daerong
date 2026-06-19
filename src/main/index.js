const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, Tray, Menu, dialog, screen, protocol, net, shell, desktopCapturer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

// Redirect Chromium system logs and temporary files to "system" subdirectory
try {
  const currentUserData = app.getPath('userData');
  if (!currentUserData.endsWith('system') && !currentUserData.endsWith('system\\')) {
    app.setPath('userData', path.join(currentUserData, 'system'));
  }
} catch (e) {
  console.error('Failed to redirect userData path:', e);
}

const store = require('./store');

const fsPromises = require('fs').promises;

let tray = null;
let trayMenuWindow = null; // Custom transparent tray menu window
let settingsWindow = null;
let gridWindow = null; // Grid viewer window for active images
const floatingWindows = new Map(); // windowId -> { win, historyId, filePath }
const magnifierWindows = new Map(); // windowId -> win
let selectionWindow = null;
let isHotkeyPaused = false;
let activeDrags = {}; // windowId -> { offsetX, offsetY }

const themeOverlayColors = {
  'classic-violet': { color: '#0c0817', symbolColor: '#9d4edd' },
  'deep-emerald': { color: '#04140e', symbolColor: '#0ca678' },
  'sunset-glow': { color: '#180905', symbolColor: '#f76707' },
  'midnight-blue': { color: '#050a18', symbolColor: '#3b5bdb' },
  'cyberpunk-neon': { color: '#05050e', symbolColor: '#ff007f' },
  'rose-quartz': { color: '#16080b', symbolColor: '#da77f2' },
  'monochrome-slate': { color: '#111216', symbolColor: '#adb5bd' },
  'tokyo-sakura': { color: '#1a0c11', symbolColor: '#f783ac' },
  'volcanic-lava': { color: '#120303', symbolColor: '#fa5252' },
  'nordic-frost': { color: '#050f16', symbolColor: '#228be6' },
  'golden-amber': { color: '#150f05', symbolColor: '#fab005' },
  'cyber-green': { color: '#030e06', symbolColor: '#37b24d' },
  'retro-arcade': { color: '#060b19', symbolColor: '#ffcc00' },
  'deep-berry': { color: '#13040c', symbolColor: '#e64980' },
  'cappuccino': { color: '#140d0a', symbolColor: '#b08968' },
  'mystic-lavender': { color: '#0f0d1a', symbolColor: '#845ef7' },
  'abyssal-dark': { color: '#050505', symbolColor: '#e0e0e0' },
  'ocean-breeze': { color: '#030f14', symbolColor: '#15aabf' },
  'royal-gold': { color: '#050a14', symbolColor: '#d4af37' },
  'autumn-forest': { color: '#140b05', symbolColor: '#d9480f' }
};

// Register custom protocol to bypass Chrome's local resource security restrictions
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-image', privileges: { bypassCSP: true, stream: true, secure: true, corsEnabled: true } }
]);

function registerCustomProtocol() {
  protocol.handle('local-image', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let filePath = parsedUrl.searchParams.get('path');
      
      if (!filePath) {
        // Fallback: searchParams가 없는 경우 기존 패스 추출 방식 사용
        filePath = decodeURIComponent(request.url.slice('local-image://'.length));
        if (filePath.startsWith('/')) {
          if (filePath.length > 2 && filePath[2] === ':') {
            filePath = filePath.slice(1);
          }
        }
      }
      
      filePath = path.normalize(filePath);
      const data = await fsPromises.readFile(filePath);
      return new Response(data);
    } catch (err) {
      console.error(`Failed to serve local image from request [${request.url}]:`, err);
      return new Response('Error loading image', { status: 500 });
    }
  });
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

// Session Persistence State Helper
function saveActiveWindowsState() {
  if (app.isQuitting) return;
  const state = [];
  for (const [id, info] of floatingWindows.entries()) {
    if (!info.win.isDestroyed()) {
      state.push({
        historyId: info.historyId,
        filePath: info.filePath,
        bounds: info.win.getBounds(),
        isAlwaysOnTop: info.win.isAlwaysOnTop(),
        opacity: info.win.getOpacity()
      });
    }
  }
  store.setSetting('activeWindowsState', state);
}

async function getActiveWindowsList() {
  const list = [];
  for (const [id, info] of floatingWindows.entries()) {
    let base64 = '';
    try {
      if (fs.existsSync(info.filePath)) {
        base64 = fs.readFileSync(info.filePath, 'base64');
      }
    } catch (e) {
      console.error('Failed to read active image preview:', e);
    }
    list.push({
      windowId: id,
      historyId: info.historyId,
      filePath: info.filePath,
      timestamp: new Date(parseInt(info.historyId)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imageBase64: base64
    });
  }
  return list;
}

async function notifyActiveWindowsChanged() {
  updateTrayMenu();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const list = await getActiveWindowsList();
    settingsWindow.webContents.send('active-windows-updated', list);
  }
  if (gridWindow && !gridWindow.isDestroyed()) {
    const list = await getActiveWindowsList();
    gridWindow.webContents.send('active-windows-updated', list);
  }
}

function createTrayMenuWindow() {
  if (trayMenuWindow) return;

  trayMenuWindow = new BrowserWindow({
    width: 320,
    height: 350,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    opacity: 0, // 렌더러가 완전히 높이를 조절하기 전까지 보이지 않도록 함
    backgroundColor: '#00000000',
    hasShadow: false, // CSS box-shadow used in renderer for flawless transparency
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const trayHtmlPath = path.join(__dirname, '../renderer/tray/tray.html');
  trayMenuWindow.loadURL(pathToFileURL(trayHtmlPath).toString());

  trayMenuWindow.on('blur', () => {
    if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
      trayMenuWindow.hide();
    }
  });

  trayMenuWindow.on('closed', () => {
    trayMenuWindow = null;
  });
}

function positionTrayMenuWindow() {
  if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;

  const trayBounds = tray.getBounds();
  const windowBounds = trayMenuWindow.getBounds();
  const primaryDisplay = screen.getDisplayMatching(trayBounds);
  const workArea = primaryDisplay.workArea;

  let x = trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2);
  let y = trayBounds.y - windowBounds.height;

  if (trayBounds.y > workArea.y + workArea.height / 2) {
    y = trayBounds.y - windowBounds.height;
  } else if (trayBounds.y < workArea.y + 100) {
    y = trayBounds.y + trayBounds.height;
  } else {
    y = trayBounds.y + trayBounds.height - windowBounds.height;
  }

  if (x < workArea.x) {
    x = workArea.x;
  } else if (x + windowBounds.width > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - windowBounds.width;
  }

  if (y < workArea.y) {
    y = workArea.y;
  } else if (y + windowBounds.height > workArea.y + workArea.height) {
    y = workArea.y + workArea.height - windowBounds.height;
  }

  trayMenuWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: windowBounds.width,
    height: windowBounds.height
  });
}

async function updateTrayMenu() {
  if (!tray) return;

  const settings = store.getSettings();

  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    const activeList = await getActiveWindowsList();
    const historyList = store.getHistory();
    trayMenuWindow.webContents.send('active-windows-updated', activeList);
    trayMenuWindow.webContents.send('history-updated', historyList);
    trayMenuWindow.webContents.send('hotkey-paused-updated', isHotkeyPaused);
  }

  tray.setToolTip(`Daerong - ${settings.hotkey}`);
}

function setupTray() {
  const iconPath = path.join(__dirname, '../renderer/assets/tray_icon.png');
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    const { nativeImage } = require('electron');
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    const { nativeImage } = require('electron');
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  updateTrayMenu();

  tray.on('click', () => {
    if (trayMenuWindow && trayMenuWindow.isVisible()) {
      trayMenuWindow.hide();
    }
  });

  tray.on('right-click', () => {
    if (!trayMenuWindow) {
      createTrayMenuWindow();
      trayMenuWindow.once('ready-to-show', () => {
        trayMenuWindow.setOpacity(0); // 노출 전 투명하게
        positionTrayMenuWindow();
        trayMenuWindow.show();
        trayMenuWindow.focus();
        updateTrayMenu();
        // 렌더러가 열림 이벤트를 받아 즉시 크기 보정을 수행하게 함
        trayMenuWindow.webContents.send('tray-opened');
      });
    } else {
      if (trayMenuWindow.isVisible()) {
        trayMenuWindow.hide();
      } else {
        trayMenuWindow.setOpacity(0); // 노출 전 투명하게
        positionTrayMenuWindow();
        trayMenuWindow.show();
        trayMenuWindow.focus();
        updateTrayMenu();
        // 렌더러가 열림 이벤트를 받아 즉시 크기 보정을 수행하게 함
        trayMenuWindow.webContents.send('tray-opened');
      }
    }
  });

  tray.on('double-click', () => {
    createSettingsWindow();
    if (trayMenuWindow && trayMenuWindow.isVisible()) {
      trayMenuWindow.hide();
    }
  });
}

function registerGlobalHotkey() {
  const settings = store.getSettings();
  globalShortcut.unregisterAll(); // Clear previous shortcuts

  if (isHotkeyPaused) return;

  try {
    const registered = globalShortcut.register(settings.hotkey, () => {
      handleHotkeyPress();
    });

    if (!registered) {
      console.error(`Failed to register hotkey: ${settings.hotkey}`);
      if (settings.hotkey !== 'Ctrl+Shift+F') {
        globalShortcut.register('Ctrl+Shift+F', () => {
          handleHotkeyPress();
        });
      }
    }
  } catch (err) {
    console.error('Error registering global shortcut:', err);
  }

  // Register magnifier hotkey
  const magHotkey = settings.magnifierHotkey || 'Ctrl+Shift+M';
  try {
    const registeredMag = globalShortcut.register(magHotkey, () => {
      handleMagnifierHotkeyPress();
    });

    if (!registeredMag) {
      console.error(`Failed to register magnifier hotkey: ${magHotkey}`);
      if (magHotkey !== 'Ctrl+Shift+M') {
        globalShortcut.register('Ctrl+Shift+M', () => {
          handleMagnifierHotkeyPress();
        });
      }
    }
  } catch (err) {
    console.error('Error registering magnifier global shortcut:', err);
  }
}

function handleMagnifierHotkeyPress() {
  if (selectionWindow) {
    selectionWindow.focus();
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.bounds;

  selectionWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    resizable: false,
    movable: false,
    focusable: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  selectionWindow.setBounds({ x, y, width, height });

  const selectionHtmlPath = path.join(__dirname, '../renderer/magnifier/selection.html');
  const queryUrl = `${pathToFileURL(selectionHtmlPath).toString()}?displayId=${display.id}&x=${x}&y=${y}&w=${width}&h=${height}`;
  selectionWindow.loadURL(queryUrl);

  selectionWindow.on('closed', () => {
    selectionWindow = null;
  });
}

function createMagnifierWindow(x, y, width, height, displayId) {
  const magWidth = Math.max(200, width * 2);
  const magHeight = Math.max(120, height * 2);

  const cursor = screen.getCursorScreenPoint();
  const displays = screen.getAllDisplays();
  const display = displays.find(d => d.id.toString() === displayId.toString()) || screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  const db = display.bounds;

  let winX = Math.round(workArea.x + (workArea.width - magWidth) / 2);
  let winY = Math.round(workArea.y + (workArea.height - magHeight) / 2);

  const win = new BrowserWindow({
    x: winX,
    y: winY,
    width: magWidth,
    height: magHeight,
    minWidth: 200,
    minHeight: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: true,
    title: 'Daerong 돋보기',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setContentProtection(true);
  win.setMenuBarVisibility(false);
  
  const winId = win.id;
  magnifierWindows.set(winId, win);

  const magnifierHtmlPath = path.join(__dirname, '../renderer/magnifier/magnifier.html');
  const queryUrl = `${pathToFileURL(magnifierHtmlPath).toString()}?id=${winId}&displayId=${displayId}&rectX=${x}&rectY=${y}&rectW=${width}&rectH=${height}&disX=${db.x}&disY=${db.y}&disW=${db.width}&disH=${db.height}`;
  win.loadURL(queryUrl);

  win.on('closed', () => {
    magnifierWindows.delete(winId);
    delete activeDrags[winId];
  });
}

function handleHotkeyPress() {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    console.log('Clipboard does not contain an image.');
    return;
  }

  const newItem = store.addHistoryItem(image);
  if (newItem) {
    updateTrayMenu();
    createFloatingWindow(newItem.filePath, newItem.id);
  }
}

function createFloatingWindow(filePath, historyId, restoreOptions = null) {
  const { nativeImage } = require('electron');
  
  let bounds = null;
  let alwaysOnTop = true;
  let opacity = 1.0;

  if (restoreOptions) {
    bounds = restoreOptions.bounds;
    alwaysOnTop = restoreOptions.isAlwaysOnTop;
    opacity = restoreOptions.opacity;
  }

  if (!bounds) {
    const img = nativeImage.createFromPath(filePath);
    const size = img.getSize();

    if (size.width === 0 || size.height === 0) {
      console.error('Invalid image size or unable to load image:', filePath);
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const maxW = Math.round(workArea.width * 0.5);
    const maxH = Math.round(workArea.height * 0.5);

    let width = size.width;
    let height = size.height;
    const aspectRatio = size.width / size.height;

    if (width > maxW) {
      width = maxW;
      height = Math.round(width / aspectRatio);
    }
    if (height > maxH) {
      height = maxH;
      width = Math.round(height * aspectRatio);
    }
    
    bounds = {
      x: Math.round(workArea.width / 2 - width / 2),
      y: Math.round(workArea.height / 2 - height / 2),
      width,
      height
    };
  }

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 200,
    minHeight: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: alwaysOnTop,
    skipTaskbar: true,
    hasShadow: true,
    opacity: opacity,
    title: 'Floating Image',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.setOpacity(opacity);
  
  const winId = win.id;
  floatingWindows.set(winId, { win, historyId, filePath });

  // Load renderer view with query params
  const floatingHtmlPath = path.join(__dirname, '../renderer/floating/floating.html');
  const safeImagePath = filePath.replace(/\\/g, '/');
  // Pass actual dimensions to renderer
  const queryUrl = `${pathToFileURL(floatingHtmlPath).toString()}?id=${winId}&historyId=${historyId}&origWidth=${bounds.width}&origHeight=${bounds.height}&imagePath=${encodeURIComponent(safeImagePath)}`;
  win.loadURL(queryUrl);

  if (!restoreOptions) {
    win.center();
  }

  notifyActiveWindowsChanged();
  saveActiveWindowsState();

  win.on('closed', () => {
    floatingWindows.delete(winId);
    delete activeDrags[winId];
    notifyActiveWindowsChanged();
    saveActiveWindowsState();
  });
}

function closeAllFloatingWindows() {
  for (const [id, { win }] of floatingWindows.entries()) {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
  floatingWindows.clear();

  for (const [id, win] of magnifierWindows.entries()) {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
  magnifierWindows.clear();

  notifyActiveWindowsChanged();
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const currentSettings = store.getSettings();
  const themeId = currentSettings.theme || 'classic-violet';
  const overlayTheme = themeOverlayColors[themeId] || themeOverlayColors['classic-violet'];

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 860,
    resizable: false,
    maximizable: false,
    title: 'Daerong 설정',
    show: false,
    backgroundColor: overlayTheme.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: overlayTheme.color,
      symbolColor: overlayTheme.symbolColor,
      height: 54
    },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);

  const settingsHtmlPath = path.join(__dirname, '../renderer/settings/settings.html');
  settingsWindow.loadURL(pathToFileURL(settingsHtmlPath).toString());

  settingsWindow.once('ready-to-show', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
    }
  });

  settingsWindow.on('close', (e) => {
    const settings = store.getSettings();
    if (!app.isQuitting) {
      if (settings.closeToTray) {
        // Just close the window, settings will keep app in tray
      } else {
        // Option is disabled, so close the whole app immediately
        app.isQuitting = true;
        app.quit();
      }
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createGridWindow() {
  if (gridWindow && !gridWindow.isDestroyed()) {
    gridWindow.focus();
    return;
  }

  gridWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    show: false,
    resizable: false,
    alwaysOnTop: true,
    title: '표시 중인 이미지 목록',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  gridWindow.setMenuBarVisibility(false);

  const gridHtmlPath = path.join(__dirname, '../renderer/grid/grid.html');
  gridWindow.loadURL(pathToFileURL(gridHtmlPath).toString());

  gridWindow.once('ready-to-show', () => {
    if (gridWindow && !gridWindow.isDestroyed()) {
      gridWindow.show();
    }
  });

  gridWindow.on('closed', () => {
    gridWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return store.getSettings();
});

ipcMain.on('set-setting', (event, key, value) => {
  store.setSetting(key, value);
  const currentSettings = store.getSettings();
  
  // Broadcast settings change to all active windows
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings-changed', currentSettings);
  }
  if (gridWindow && !gridWindow.isDestroyed()) {
    gridWindow.webContents.send('settings-changed', currentSettings);
  }
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send('settings-changed', currentSettings);
  }
  for (const [id, { win }] of floatingWindows.entries()) {
    if (!win.isDestroyed()) {
      win.webContents.send('settings-changed', currentSettings);
    }
  }
  
  if (key === 'hotkey' || key === 'magnifierHotkey') {
    registerGlobalHotkey();
    updateTrayMenu();
  }

  if (key === 'theme') {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      const overlayTheme = themeOverlayColors[value] || themeOverlayColors['classic-violet'];
      settingsWindow.setTitleBarOverlay({
        color: overlayTheme.color,
        symbolColor: overlayTheme.symbolColor,
        height: 54
      });
    }
  }
});

ipcMain.handle('get-window-info', (event) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) {
    if (floatingWindows.has(win.id)) {
      const info = floatingWindows.get(win.id);
      let base64Data = '';
      try {
        base64Data = fs.readFileSync(info.filePath, 'base64');
      } catch (err) {
        console.error('Failed to read image as base64:', err);
      }
      return {
        windowId: win.id,
        historyId: info.historyId,
        filePath: info.filePath,
        isAlwaysOnTop: win.isAlwaysOnTop(),
        opacity: win.getOpacity(),
        imageBase64: base64Data
      };
    } else if (gridWindow && win.id === gridWindow.id) {
      return {
        windowId: win.id,
        isGridWindow: true
      };
    } else if (settingsWindow && win.id === settingsWindow.id) {
      return {
        windowId: win.id,
        isSettingsWindow: true
      };
    } else if (magnifierWindows.has(win.id)) {
      return {
        windowId: win.id,
        isMagnifierWindow: true,
        isAlwaysOnTop: win.isAlwaysOnTop()
      };
    }
  }
  return null;
});

ipcMain.on('close-window', (event, windowId) => {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

ipcMain.on('set-always-on-top', (event, windowId, isAlwaysOnTop) => {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(isAlwaysOnTop);
    saveActiveWindowsState();
  }
});

async function saveImageAction(windowId) {
  const info = floatingWindows.get(windowId);
  if (!info) return false;

  const win = info.win;
  const sourcePath = info.filePath;

  const { filePath } = await dialog.showSaveDialog(win, {
    title: '플로팅 이미지 저장',
    defaultPath: path.join(app.getPath('pictures'), `floating_${Date.now()}.png`),
    filters: [{ name: 'Images', extensions: ['png'] }]
  });

  if (filePath) {
    try {
      fs.copyFileSync(sourcePath, filePath);
      return true;
    } catch (err) {
      console.error('Failed to save image:', err);
      return false;
    }
  }
  return false;
}

async function copyToClipboardAction(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(filePath);
      clipboard.writeImage(img);
      return true;
    } catch (err) {
      console.error('Failed to copy back to clipboard:', err);
      return false;
    }
  }
  return false;
}

ipcMain.handle('save-image', async (event, windowId) => {
  return await saveImageAction(windowId);
});

ipcMain.handle('copy-to-clipboard', async (event, filePath) => {
  return await copyToClipboardAction(filePath);
});

ipcMain.on('set-opacity', (event, windowId, opacity) => {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.setOpacity(opacity);
    saveActiveWindowsState();
  }
});

// Window Drag IPC handlers
ipcMain.on('window-drag-start', (event, windowId) => {
  const win = BrowserWindow.fromId(windowId);
  if (win) {
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    activeDrags[windowId] = {
      offsetX: cursor.x - bounds.x,
      offsetY: cursor.y - bounds.y
    };
  }
});

ipcMain.on('window-drag-move', (event, windowId) => {
  const drag = activeDrags[windowId];
  if (drag) {
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) {
      const cursor = screen.getCursorScreenPoint();
      win.setBounds({
        x: cursor.x - drag.offsetX,
        y: cursor.y - drag.offsetY,
        width: win.getBounds().width,
        height: win.getBounds().height
      });
    }
  }
});

ipcMain.on('window-drag-end', (event, windowId) => {
  delete activeDrags[windowId];
  saveActiveWindowsState();
});

// Window resizing and bounds setting handlers
ipcMain.on('resize-window', (event, windowId, width, height) => {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    win.setBounds({
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + (bounds.height - height) / 2),
      width,
      height
    });
    saveActiveWindowsState();
  }
});

ipcMain.on('resize-window-content', (event, windowId, width, height) => {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    const contentBounds = win.getContentBounds();
    
    const frameW = bounds.width - contentBounds.width;
    const frameH = bounds.height - contentBounds.height;
    
    const targetWidth = width + frameW;
    const targetHeight = height + frameH;
    
    win.setBounds({
      x: Math.round(bounds.x + (bounds.width - targetWidth) / 2),
      y: Math.round(bounds.y + (bounds.height - targetHeight) / 2),
      width: targetWidth,
      height: targetHeight
    });
    saveActiveWindowsState();
  }
});

ipcMain.handle('get-window-bounds', (event, windowId) => {
  const win = BrowserWindow.fromId(windowId);
  return win ? win.getBounds() : null;
});

ipcMain.on('set-window-bounds', (event, windowId, bounds) => {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.setBounds(bounds);
  }
});

ipcMain.handle('delete-history-item', (event, id) => {
  const success = store.deleteHistoryItem(id);
  updateTrayMenu();
  return success;
});

ipcMain.handle('get-capture-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id
    }));
  } catch (err) {
    console.error('Failed to get capture sources:', err);
    return [];
  }
});

ipcMain.on('start-magnifier-selection', (event, rect) => {
  if (selectionWindow && !selectionWindow.isDestroyed()) {
    selectionWindow.close();
  }
  const { x, y, width, height, displayId } = rect;
  createMagnifierWindow(x, y, width, height, displayId);
});

ipcMain.on('close-selection-window', () => {
  if (selectionWindow && !selectionWindow.isDestroyed()) {
    selectionWindow.close();
  }
});

ipcMain.on('clear-history', () => {
  store.clearHistory();
  updateTrayMenu();
});

ipcMain.on('open-history-folder', () => {
  shell.openPath(store.historyImagesDir);
});

ipcMain.handle('get-active-windows', async () => {
  return await getActiveWindowsList();
});

ipcMain.on('focus-window', (event, windowId) => {
  const info = floatingWindows.get(windowId);
  if (info && !info.win.isDestroyed()) {
    info.win.focus();
    info.win.show();
  }
});

ipcMain.on('resize-tray-window', (event, width, height) => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    const trayBounds = tray.getBounds();
    const primaryDisplay = screen.getDisplayMatching(trayBounds);
    const workArea = primaryDisplay.workArea;

    let x = trayBounds.x + (trayBounds.width / 2) - (width / 2);
    let y = trayBounds.y - height;

    if (trayBounds.y > workArea.y + workArea.height / 2) {
      y = trayBounds.y - height;
    } else {
      y = trayBounds.y + trayBounds.height;
    }

    if (x < workArea.x) x = workArea.x;
    if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
    if (y < workArea.y) y = workArea.y;
    if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;

    trayMenuWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    });

    if (trayMenuWindow.getOpacity() === 0) {
      trayMenuWindow.setOpacity(1.0);
    }
  }
});

ipcMain.on('close-all-windows', () => {
  closeAllFloatingWindows();
});

ipcMain.handle('get-history', () => {
  return store.getHistory();
});

ipcMain.on('hide-tray-menu', () => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.hide();
  }
});

ipcMain.on('exit-app', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.handle('get-hotkey-paused', () => {
  return isHotkeyPaused;
});

ipcMain.handle('toggle-hotkey-paused', () => {
  isHotkeyPaused = !isHotkeyPaused;
  const settings = store.getSettings();
  if (isHotkeyPaused) {
    globalShortcut.unregister(settings.hotkey);
  } else {
    registerGlobalHotkey();
  }
  updateTrayMenu();
  return isHotkeyPaused;
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.hide();
  }
});

ipcMain.on('open-grid-window', () => {
  createGridWindow();
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.hide();
  }
});

ipcMain.on('create-floating-window', (event, filePath, historyId) => {
  createFloatingWindow(filePath, historyId);
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.hide();
  }
});

// Show native context menu for floating images
ipcMain.on('show-context-menu', (event, windowId) => {
  const info = floatingWindows.get(windowId);
  if (!info) return;

  const win = info.win;
  const filePath = info.filePath;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '다른 이름으로 저장...',
      click: async () => {
        const success = await saveImageAction(windowId);
        if (success && !win.isDestroyed()) {
          win.webContents.send('toast-message', '💾 이미지가 성공적으로 저장되었습니다.');
        }
      }
    },
    {
      label: '이미지 복사',
      click: async () => {
        const success = await copyToClipboardAction(filePath);
        if (success && !win.isDestroyed()) {
          win.webContents.send('toast-message', '📋 이미지가 복사되었습니다.');
        }
      }
    },
    {
      label: '원본 크기로 초기화',
      click: () => {
        if (!win.isDestroyed()) {
          win.webContents.send('reset-to-original-size');
        }
      }
    },
    { type: 'separator' },
    {
      label: win.isAlwaysOnTop() ? '항상 위 고정 해제' : '항상 위에 고정',
      click: () => {
        if (!win.isDestroyed()) {
          const nextState = !win.isAlwaysOnTop();
          win.setAlwaysOnTop(nextState);
          win.webContents.send('always-on-top-changed', nextState);
          saveActiveWindowsState();
        }
      }
    },
    { type: 'separator' },
    {
      label: '닫기',
      click: () => {
        if (!win.isDestroyed()) {
          win.close();
        }
      }
    }
  ]);

  contextMenu.popup({ window: win });
});

// App Lifecycle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.focus();
      settingsWindow.show();
    } else {
      createSettingsWindow();
    }
  });

  app.whenReady().then(() => {
    setupTray();
    registerCustomProtocol();
    store.init();
    createTrayMenuWindow();
    registerGlobalHotkey();

    // Restore previous persisted floating images session
    const savedState = store.getSettings().activeWindowsState || [];
    savedState.forEach((item) => {
      if (fs.existsSync(item.filePath)) {
        createFloatingWindow(item.filePath, item.historyId, item);
      }
    });

    // Always open settings window on startup by default
    createSettingsWindow();
  });
}

app.on('window-all-closed', () => {
  const settings = store.getSettings();
  if (!settings.closeToTray || app.isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
