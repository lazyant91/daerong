// Function to calculate and update window size dynamically
function updateWindowSize() {
  const container = document.querySelector('.menu-container');
  if (container) {
    const rect = container.getBoundingClientRect();
    const height = Math.ceil(rect.height) + 10; // margin 상하 5px 씩 총 10px 마진 포함
    const width = 320; // 가로폭 고정
    window.electronAPI.resizeTrayWindow(width, height);
  }
}

// Perform smooth window resize matching CSS transition duration
function animateWindowResize() {
  const duration = 220; // Matches CSS transition duration (0.2s + extra margin)
  const start = performance.now();
  
  function step(now) {
    updateWindowSize();
    if (now - start < duration) {
      requestAnimationFrame(step);
    } else {
      updateWindowSize(); // Final measurement for precision
    }
  }
  requestAnimationFrame(step);
}

// Render active floating images list
function renderActiveWindows(activeList) {
  const container = document.getElementById('active-list');
  const divider = document.getElementById('active-divider');
  
  if (!activeList || activeList.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px 16px; font-size: 12px; color: #888; text-align: center;">
        표시 중인 플로팅 이미지가 없습니다.
      </div>
    `;
    return;
  }

  const displayList = activeList.slice(0, 5);

  container.innerHTML = '';
  displayList.forEach(item => {
    const activeItem = document.createElement('div');
    activeItem.className = 'active-item';
    
    // Using local-image protocol which is high performance and doesn't load whole base64 string
    const imgUrl = `local-image://load?path=${encodeURIComponent(item.filePath)}`;
    
    activeItem.innerHTML = `
      <img class="active-thumbnail" src="${imgUrl}" alt="Thumbnail">
      <span class="item-time-badge">${item.timestamp}</span>
      <button class="item-delete-btn" title="닫기">✕</button>
    `;
    
    activeItem.addEventListener('click', (e) => {
      if (e.target.classList.contains('item-delete-btn')) {
        return;
      }
      window.electronAPI.focusWindow(item.windowId);
      window.electronAPI.hideTrayMenu();
    });
    
    const deleteBtn = activeItem.querySelector('.item-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.closeWindow(item.windowId);
    });
    
    container.appendChild(activeItem);
  });

  if (activeList.length > 5) {
    const moreBtn = document.createElement('div');
    moreBtn.className = 'active-more-btn';
    moreBtn.innerHTML = `
      <span class="more-text">더 보기 (${activeList.length - 5}개 더 있음)</span>
    `;
    moreBtn.addEventListener('click', () => {
      window.electronAPI.openGridWindow();
      window.electronAPI.hideTrayMenu();
    });
    container.appendChild(moreBtn);
  }
}

// Render clipboard history items
function renderHistory(historyList) {
  const container = document.getElementById('history-list');
  
  if (!historyList || historyList.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px 16px; font-size: 12px; color: #888; text-align: center;">
        히스토리가 비어 있습니다.
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'history-items-container';

  historyList.forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const imgUrl = `local-image://load?path=${encodeURIComponent(item.filePath)}`;
    
    historyItem.innerHTML = `
      <div class="history-content">
        <img class="history-thumb" src="${imgUrl}" alt="Hist">
        <span class="history-text">[이미지] ${timeStr}</span>
      </div>
      <button class="history-delete-btn" title="삭제">
        <svg viewBox="0 0 24 24" width="12" height="12">
          <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    `;
    
    historyItem.addEventListener('click', (e) => {
      if (e.target.closest('.history-delete-btn')) return;
      window.electronAPI.createFloatingWindow(item.filePath, item.id);
    });
    
    const deleteBtn = historyItem.querySelector('.history-delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.electronAPI.deleteHistoryItem(item.id);
    });
    
    itemsContainer.appendChild(historyItem);
  });
  container.appendChild(itemsContainer);

  const clearContainer = document.createElement('div');
  clearContainer.className = 'history-clear-container';
  clearContainer.innerHTML = `
    <button id="tray-clear-history-btn" class="tray-action-btn danger">히스토리 전체 삭제</button>
  `;
  
  clearContainer.querySelector('#tray-clear-history-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('정말 이미지 히스토리 전체를 삭제하시겠습니까?')) {
      window.electronAPI.clearHistory();
    }
  });
  
  container.appendChild(clearContainer);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Get initial hotkey status
  try {
    const isPaused = await window.electronAPI.getHotkeyPaused();
    document.getElementById('hotkey-checkbox').checked = isPaused;
  } catch (err) {
    console.error(err);
  }

  // Initial load
  try {
    const activeWindows = await window.electronAPI.getActiveWindows();
    renderActiveWindows(activeWindows);
    
    const history = await window.electronAPI.getHistory();
    renderHistory(history);
    
    setTimeout(updateWindowSize, 50);
  } catch (err) {
    console.error(err);
  }

  // Listen for main process updates
  window.electronAPI.on('active-windows-updated', (list) => {
    renderActiveWindows(list);
    setTimeout(updateWindowSize, 50);
  });

  window.electronAPI.on('history-updated', (list) => {
    renderHistory(list);
    setTimeout(updateWindowSize, 50);
  });

  window.electronAPI.on('hotkey-paused-updated', (isPaused) => {
    document.getElementById('hotkey-checkbox').checked = isPaused;
  });

  window.electronAPI.on('tray-opened', async () => {
    const activeList = await window.electronAPI.getActiveWindows();
    renderActiveWindows(activeList);
    const history = await window.electronAPI.getHistory();
    renderHistory(history);
    const isPaused = await window.electronAPI.getHotkeyPaused();
    document.getElementById('hotkey-checkbox').checked = isPaused;
    setTimeout(updateWindowSize, 50);
  });

  // Action Handlers
  const btnToggleHotkey = document.getElementById('btn-toggle-hotkey');
  const hotkeyCheckbox = document.getElementById('hotkey-checkbox');
  
  btnToggleHotkey.addEventListener('click', async (e) => {
    if (e.target !== hotkeyCheckbox) {
      hotkeyCheckbox.checked = !hotkeyCheckbox.checked;
    }
    await window.electronAPI.toggleHotkeyPaused();
  });

  hotkeyCheckbox.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.getElementById('btn-close-all').addEventListener('click', () => {
    window.electronAPI.closeAllFloatingWindows();
    window.electronAPI.hideTrayMenu();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    window.electronAPI.openSettings();
  });

  document.getElementById('btn-exit').addEventListener('click', () => {
    window.electronAPI.exitApp();
  });

  // Accordion Expand/Collapse Trigger
  const historyTrigger = document.getElementById('history-submenu-trigger');
  historyTrigger.addEventListener('click', (e) => {
    if (e.target.closest('.submenu-content')) return;
    
    historyTrigger.classList.toggle('expanded');
    animateWindowResize();
  });

  // --- Theme Syncing ---
  async function initThemeSync() {
    const settings = await window.electronAPI.getSettings();
    if (settings && settings.theme) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
    window.electronAPI.onSettingsChanged((newSettings) => {
      if (newSettings && newSettings.theme) {
        document.documentElement.setAttribute('data-theme', newSettings.theme);
      }
    });
  }
  initThemeSync();
});

