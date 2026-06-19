const { app } = require('electron');
const fs = require('fs');
const path = require('path');

class Store {
  constructor() {
    // userData path is initialized after app is ready, but store constructor might run early.
    // So we resolve it lazily when needed, or initialize in constructor if app is ready.
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.userDataPath = app.getPath('userData'); // This is AppData/Roaming/image-floating/system
    
    // Resolve user-facing files to AppData/Roaming/image-floating (root)
    const rootPath = path.join(this.userDataPath, '..');
    this.settingsPath = path.join(rootPath, 'settings.json');
    this.historyPath = path.join(rootPath, 'history.json');
    this.historyImagesDir = path.join(rootPath, 'history_images');

    if (!fs.existsSync(this.historyImagesDir)) {
      fs.mkdirSync(this.historyImagesDir, { recursive: true });
    }

    this.defaultSettings = {
      hotkey: 'Ctrl+Shift+F',
      magnifierHotkey: 'Ctrl+Shift+M',
      closeToTray: true,
      startOnBoot: false,
      theme: 'classic-violet'
    };

    this.settings = this.loadJSON(this.settingsPath, this.defaultSettings);
    this.history = this.loadJSON(this.historyPath, []);
    this.initialized = true;
  }

  loadJSON(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error(`Error loading JSON from ${filePath}:`, err);
    }
    return defaultValue;
  }

  saveJSON(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Error saving JSON to ${filePath}:`, err);
    }
  }

  getSettings() {
    this.init();
    return this.settings;
  }

  setSetting(key, value) {
    this.init();
    this.settings[key] = value;
    this.saveJSON(this.settingsPath, this.settings);

    if (key === 'startOnBoot') {
      try {
        app.setLoginItemSettings({
          openAtLogin: value,
          path: app.getPath('exe')
        });
      } catch (err) {
        console.error('Failed to set login item settings:', err);
      }
    }
  }

  getHistory() {
    this.init();
    return this.history;
  }

  addHistoryItem(nativeImageInstance) {
    this.init();
    try {
      const id = Date.now().toString();
      const pngBuffer = nativeImageInstance.toPNG();
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');

      const dateStr = `${year}-${month}-${day} ${hours}-${minutes}-${seconds}`;
      const fileName = `[${dateStr}] Image_${id}.png`;
      const filePath = path.join(this.historyImagesDir, fileName);

      fs.writeFileSync(filePath, pngBuffer);

      const newItem = {
        id,
        timestamp: new Date().toISOString(),
        filePath
      };

      this.history.unshift(newItem);

      if (this.history.length > 10) {
        const removedItems = this.history.splice(10);
        removedItems.forEach(item => {
          if (fs.existsSync(item.filePath)) {
            try {
              fs.unlinkSync(item.filePath);
            } catch (err) {
              console.error(`Error deleting old history image ${item.filePath}:`, err);
            }
          }
        });
      }

      this.saveJSON(this.historyPath, this.history);
      return newItem;
    } catch (err) {
      console.error('Error adding history item:', err);
      return null;
    }
  }

  clearHistory() {
    this.init();
    this.history.forEach(item => {
      if (fs.existsSync(item.filePath)) {
        try {
          fs.unlinkSync(item.filePath);
        } catch (err) {
          console.error(`Error deleting history image ${item.filePath}:`, err);
        }
      }
    });
    this.history = [];
    this.saveJSON(this.historyPath, this.history);
  }

  deleteHistoryItem(id) {
    this.init();
    try {
      const index = this.history.findIndex(item => item.id === id);
      if (index !== -1) {
        const item = this.history[index];
        if (fs.existsSync(item.filePath)) {
          try {
            fs.unlinkSync(item.filePath);
          } catch (err) {
            console.error(`Error deleting history file ${item.filePath}:`, err);
          }
        }
        this.history.splice(index, 1);
        this.saveJSON(this.historyPath, this.history);
        return true;
      }
    } catch (err) {
      console.error(`Error in deleteHistoryItem for id ${id}:`, err);
    }
    return false;
  }
}

module.exports = new Store();
