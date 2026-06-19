const hotkeyInput = document.getElementById('hotkey-input');
const magnifierHotkeyInput = document.getElementById('magnifier-hotkey-input');
const closeToTrayCheckbox = document.getElementById('close-to-tray-checkbox');
const startOnBootCheckbox = document.getElementById('start-on-boot-checkbox');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const openFolderBtn = document.getElementById('open-folder-btn');

// Theme DOM elements
const themeMenuBtn = document.getElementById('theme-menu-btn');
const currentThemePreview = document.getElementById('current-theme-preview');
const currentThemeName = document.getElementById('current-theme-name');
const themeDropdown = document.getElementById('theme-dropdown');
const themeListContainer = document.getElementById('theme-list-container');

let activeHotkey = '';
let activeMagnifierHotkey = '';
let currentThemeId = 'classic-violet';

// 20 Themes definition
const themesList = [
  { id: 'classic-violet', name: 'Classic Violet', color: '#9d4edd' },
  { id: 'deep-emerald', name: 'Deep Emerald', color: '#0ca678' },
  { id: 'sunset-glow', name: 'Sunset Glow', color: '#f76707' },
  { id: 'midnight-blue', name: 'Midnight Blue', color: '#3b5bdb' },
  { id: 'cyberpunk-neon', name: 'Cyberpunk Neon', color: '#ff007f' },
  { id: 'rose-quartz', name: 'Rose Quartz', color: '#da77f2' },
  { id: 'monochrome-slate', name: 'Monochrome Slate', color: '#adb5bd' },
  { id: 'tokyo-sakura', name: 'Tokyo Sakura', color: '#f783ac' },
  { id: 'volcanic-lava', name: 'Volcanic Lava', color: '#fa5252' },
  { id: 'nordic-frost', name: 'Nordic Frost', color: '#228be6' },
  { id: 'golden-amber', name: 'Golden Amber', color: '#fab005' },
  { id: 'cyber-green', name: 'Cyber Green', color: '#37b24d' },
  { id: 'retro-arcade', name: 'Retro Arcade', color: '#ffcc00' },
  { id: 'deep-berry', name: 'Deep Berry', color: '#e64980' },
  { id: 'cappuccino', name: 'Cappuccino', color: '#b08968' },
  { id: 'mystic-lavender', name: 'Mystic Lavender', color: '#845ef7' },
  { id: 'abyssal-dark', name: 'Abyssal Dark', color: '#333333' },
  { id: 'ocean-breeze', name: 'Ocean Breeze', color: '#15aabf' },
  { id: 'royal-gold', name: 'Royal Gold', color: '#d4af37' },
  { id: 'autumn-forest', name: 'Autumn Forest', color: '#d9480f' }
];

// Load settings on startup
async function initSettings() {
  const settings = await window.electronAPI.getSettings();
  if (settings) {
    activeHotkey = settings.hotkey;
    hotkeyInput.value = activeHotkey;
    
    activeMagnifierHotkey = settings.magnifierHotkey || 'Ctrl+Shift+M';
    magnifierHotkeyInput.value = activeMagnifierHotkey;

    closeToTrayCheckbox.checked = settings.closeToTray;
    startOnBootCheckbox.checked = settings.startOnBoot;
    
    // Apply Theme
    if (settings.theme) {
      applyTheme(settings.theme);
    }
  }

  renderThemeList();
  setTimeout(adjustWindowSize, 60);
}

function applyTheme(themeId) {
  currentThemeId = themeId;
  document.documentElement.setAttribute('data-theme', themeId);
  
  const selectedTheme = themesList.find(t => t.id === themeId) || themesList[0];
  currentThemeName.innerText = selectedTheme.name;
  currentThemePreview.style.background = selectedTheme.color;

  // Highlight active item in list
  document.querySelectorAll('.theme-item').forEach(item => {
    if (item.dataset.id === themeId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Render 20 themes into dropdown list
function renderThemeList() {
  themeListContainer.innerHTML = '';
  themesList.forEach(theme => {
    const item = document.createElement('div');
    item.className = 'theme-item';
    item.dataset.id = theme.id;
    if (theme.id === currentThemeId) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <span class="theme-item-color" style="background: ${theme.color}"></span>
      <span class="theme-item-name">${theme.name}</span>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.setSetting('theme', theme.id);
      themeDropdown.classList.remove('active');
      themeMenuBtn.classList.remove('active');
      showToast(`🎨 테마가 '${theme.name}'으로 변경되었습니다.`);
    });

    themeListContainer.appendChild(item);
  });
}

// Toggle dropdown menu visibility
themeMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  themeDropdown.classList.toggle('active');
  themeMenuBtn.classList.toggle('active');
});

// Click outside drop menu to hide it
document.addEventListener('click', (e) => {
  if (themeDropdown.classList.contains('active') && !themeDropdown.contains(e.target) && !themeMenuBtn.contains(e.target)) {
    themeDropdown.classList.remove('active');
    themeMenuBtn.classList.remove('active');
  }
});

// Open history cached folder
openFolderBtn.addEventListener('click', () => {
  window.electronAPI.openHistoryFolder();
});

// Intercept Keydown to record Hotkey combinations
hotkeyInput.addEventListener('focus', () => {
  hotkeyInput.value = '키 조합을 입력하세요...';
  hotkeyInput.style.borderColor = 'var(--primary-color)';
});

hotkeyInput.addEventListener('blur', () => {
  hotkeyInput.value = activeHotkey;
  hotkeyInput.style.borderColor = '';
});

hotkeyInput.addEventListener('keydown', (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    hotkeyInput.value = activeHotkey;
    hotkeyInput.blur();
    showToast('⏸️ 단축키 지정이 취소되었습니다.');
    return;
  }

  const modifiers = [];
  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.altKey) modifiers.push('Alt');

  const key = e.key;
  const isModifierKey = ['Control', 'Shift', 'Alt', 'Meta'].includes(key);

  if (isModifierKey) {
    if (modifiers.length > 0) {
      hotkeyInput.value = modifiers.join('+') + ' + ...';
    } else {
      hotkeyInput.value = '키 조합을 입력하세요...';
    }
  } else {
    let finalKey = key;
    
    // Normalise special keys for Electron GlobalShortcut compatibility
    if (key === ' ') {
      finalKey = 'Space';
    } else if (key === 'ArrowUp') {
      finalKey = 'Up';
    } else if (key === 'ArrowDown') {
      finalKey = 'Down';
    } else if (key === 'ArrowLeft') {
      finalKey = 'Left';
    } else if (key === 'ArrowRight') {
      finalKey = 'Right';
    } else if (key.length === 1) {
      finalKey = key.toUpperCase();
    }

    const hotkeyStr = [...modifiers, finalKey].join('+');

    activeHotkey = hotkeyStr;
    hotkeyInput.value = activeHotkey;
    
    // Save settings
    window.electronAPI.setSetting('hotkey', hotkeyStr);
    showToast(`⌨️ 단축키가 '${hotkeyStr}'로 저장되었습니다.`);
    hotkeyInput.blur();
  }
});

// Intercept Keydown to record Magnifier Hotkey combinations
magnifierHotkeyInput.addEventListener('focus', () => {
  magnifierHotkeyInput.value = '키 조합을 입력하세요...';
  magnifierHotkeyInput.style.borderColor = 'var(--primary-color)';
});

magnifierHotkeyInput.addEventListener('blur', () => {
  magnifierHotkeyInput.value = activeMagnifierHotkey;
  magnifierHotkeyInput.style.borderColor = '';
});

magnifierHotkeyInput.addEventListener('keydown', (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    magnifierHotkeyInput.value = activeMagnifierHotkey;
    magnifierHotkeyInput.blur();
    showToast('⏸️ 돋보기 단축키 지정이 취소되었습니다.');
    return;
  }

  const modifiers = [];
  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.altKey) modifiers.push('Alt');

  const key = e.key;
  const isModifierKey = ['Control', 'Shift', 'Alt', 'Meta'].includes(key);

  if (isModifierKey) {
    if (modifiers.length > 0) {
      magnifierHotkeyInput.value = modifiers.join('+') + ' + ...';
    } else {
      magnifierHotkeyInput.value = '키 조합을 입력하세요...';
    }
  } else {
    let finalKey = key;
    
    // Normalise special keys for Electron GlobalShortcut compatibility
    if (key === ' ') {
      finalKey = 'Space';
    } else if (key === 'ArrowUp') {
      finalKey = 'Up';
    } else if (key === 'ArrowDown') {
      finalKey = 'Down';
    } else if (key === 'ArrowLeft') {
      finalKey = 'Left';
    } else if (key === 'ArrowRight') {
      finalKey = 'Right';
    } else if (key.length === 1) {
      finalKey = key.toUpperCase();
    }

    const hotkeyStr = [...modifiers, finalKey].join('+');

    activeMagnifierHotkey = hotkeyStr;
    magnifierHotkeyInput.value = activeMagnifierHotkey;
    
    // Save settings
    window.electronAPI.setSetting('magnifierHotkey', hotkeyStr);
    showToast(`⌨️ 돋보기 단축키가 '${hotkeyStr}'로 저장되었습니다.`);
    magnifierHotkeyInput.blur();
  }
});

// Settings Changes Listeners
closeToTrayCheckbox.addEventListener('change', () => {
  window.electronAPI.setSetting('closeToTray', closeToTrayCheckbox.checked);
  showToast(closeToTrayCheckbox.checked ? '📥 닫기 시 트레이로 가도록 설정되었습니다.' : '🚪 닫기 시 즉시 종료되도록 설정되었습니다.');
});

startOnBootCheckbox.addEventListener('change', () => {
  window.electronAPI.setSetting('startOnBoot', startOnBootCheckbox.checked);
  showToast(startOnBootCheckbox.checked ? '🚀 부팅 시 자동 시작이 설정되었습니다.' : '⏸️ 자동 시작이 해제되었습니다.');
});

// Clear history action
clearHistoryBtn.addEventListener('click', () => {
  if (confirm('정말 클립보드 이미지 히스토리 전체를 지우시겠습니까?\n화면의 플로팅 이미지는 닫히지 않고, 기록만 제거됩니다.')) {
    window.electronAPI.clearHistory();
    showToast('🗑️ 이미지 히스토리가 초기화되었습니다.');
  }
});

// Watch for changes (if settings change externally like from tray clicks/hotkey resets)
window.electronAPI.onSettingsChanged((newSettings) => {
  activeHotkey = newSettings.hotkey;
  hotkeyInput.value = activeHotkey;
  if (newSettings.magnifierHotkey) {
    activeMagnifierHotkey = newSettings.magnifierHotkey;
    magnifierHotkeyInput.value = activeMagnifierHotkey;
  }
  closeToTrayCheckbox.checked = newSettings.closeToTray;
  startOnBootCheckbox.checked = newSettings.startOnBoot;
  if (newSettings.theme && newSettings.theme !== currentThemeId) {
    applyTheme(newSettings.theme);
  }
});

// --- Dynamic Toast Alert UI Helper ---
function showToast(message) {
  const existing = document.querySelector('.toast-alert');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast-alert';
  toast.innerText = message;
  
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '15px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: 'rgba(20, 20, 35, 0.9)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(157, 78, 221, 0.2)',
    color: '#f3f0ff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.35)',
    zIndex: '2000',
    opacity: '0',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap'
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2200);
}

async function adjustWindowSize() {
  try {
    const info = await window.electronAPI.getWindowInfo();
    if (info && info.windowId) {
      const container = document.querySelector('.settings-container');
      const contentHeight = Math.ceil(container.getBoundingClientRect().height) + 2;
      const contentWidth = 500;
      window.electronAPI.resizeWindowContent(info.windowId, contentWidth, contentHeight);
    }
  } catch (err) {
    console.error('Failed to adjust settings window size:', err);
  }
}

// Start
initSettings();

// Safety fallback for load completion
window.addEventListener('load', () => {
  setTimeout(adjustWindowSize, 100);
});
