// Parse query parameters
const urlParams = new URLSearchParams(window.location.search);
const windowId = parseInt(urlParams.get('id'), 10);
const historyId = urlParams.get('historyId');
const imagePath = decodeURIComponent(urlParams.get('imagePath'));

const imgElement = document.getElementById('floating-image');
const dragOverlay = document.getElementById('drag-overlay');
const pinBtn = document.getElementById('pin-btn');
const deleteBtn = document.getElementById('delete-btn');
const opacitySlider = document.getElementById('opacity-slider');

// Parse original dimensions from query parameters for absolute reliability
let originalWidth = parseInt(urlParams.get('origWidth'), 10) || 0;
let originalHeight = parseInt(urlParams.get('origHeight'), 10) || 0;
let isPinned = true; // Floating window starts as pinned (always on top) by default

// Set initial pin button state
pinBtn.classList.add('active');

// Safe fallback in case dimensions weren't passed
function updateOriginalSize() {
  if (originalWidth === 0 || originalHeight === 0) {
    originalWidth = imgElement.naturalWidth;
    originalHeight = imgElement.naturalHeight;
  }
}

// Load image dynamically via IPC Base64 data to avoid local protocol rendering issues
async function loadImageData() {
  const winInfo = await window.electronAPI.getWindowInfo();
  if (winInfo && winInfo.imageBase64) {
    imgElement.src = `data:image/png;base64,${winInfo.imageBase64}`;
    togglePin(winInfo.isAlwaysOnTop);
    if (winInfo.opacity !== undefined) {
      opacitySlider.value = winInfo.opacity;
    }
  }
  
  if (imgElement.complete) {
    updateOriginalSize();
  } else {
    imgElement.onload = updateOriginalSize;
  }
}

loadImageData();

// --- Window Drag Handling ---
let isDragging = false;

dragOverlay.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // Left click
    isDragging = true;
    window.electronAPI.startDrag(windowId);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    e.preventDefault();
  }
});

function onMouseMove(e) {
  if (isDragging) {
    window.electronAPI.performDrag(windowId);
  }
}

function onMouseUp() {
  if (isDragging) {
    isDragging = false;
    window.electronAPI.stopDrag(windowId);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }
}

// --- Resizing via Mouse Wheel ---
window.addEventListener('wheel', async (e) => {
  e.preventDefault();

  if (originalWidth === 0 || originalHeight === 0) {
    updateOriginalSize();
  }
  if (originalWidth === 0 || originalHeight === 0) return;

  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
  const bounds = await window.electronAPI.getWindowBounds(windowId);
  if (!bounds) return;

  let newWidth = Math.round(bounds.width * zoomFactor);
  const minWidth = 200;
  const maxWidth = 3000;

  if (newWidth < minWidth || newWidth > maxWidth) return;

  const aspectRatio = originalWidth / originalHeight;
  const newHeight = Math.round(newWidth / aspectRatio);

  window.electronAPI.resizeWindow(windowId, newWidth, newHeight);
}, { passive: false });

// --- Controls UI: Pin & Delete & Opacity Slider ---
pinBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePin(!isPinned);
});

deleteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI.closeWindow(windowId);
});

opacitySlider.addEventListener('input', (e) => {
  e.stopPropagation();
  const opacityVal = parseFloat(opacitySlider.value);
  window.electronAPI.setOpacity(windowId, opacityVal);
});

function togglePin(targetState) {
  isPinned = targetState;
  window.electronAPI.setAlwaysOnTop(windowId, isPinned);
  if (isPinned) {
    pinBtn.classList.add('active');
  } else {
    pinBtn.classList.remove('active');
  }
}

// --- Right-Click triggers Native Context Menu ---
dragOverlay.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.electronAPI.showContextMenu(windowId);
});

// --- Handle events from Main process ---
window.electronAPI.on('reset-to-original-size', () => {
  if (originalWidth === 0 || originalHeight === 0) {
    updateOriginalSize();
  }

  if (originalWidth > 0 && originalHeight > 0) {
    // Determine screen size restrictions just like startup
    const maxW = Math.round(window.screen.width * 0.5);
    const maxH = Math.round(window.screen.height * 0.5);
    let targetW = originalWidth;
    let targetH = originalHeight;
    const ratio = originalWidth / originalHeight;

    if (targetW > maxW) {
      targetW = maxW;
      targetH = Math.round(targetW / ratio);
    }
    if (targetH > maxH) {
      targetH = maxH;
      targetW = Math.round(targetH * ratio);
    }

    window.electronAPI.resizeWindow(windowId, targetW, targetH);
    showToast('🔄 이미지 크기가 원본 비율로 초기화되었습니다.');
  }
});

window.electronAPI.on('always-on-top-changed', (isAlwaysOnTop) => {
  togglePin(isAlwaysOnTop);
});

window.electronAPI.on('toast-message', (message) => {
  showToast(message);
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
    background: 'rgba(30, 30, 30, 0.85)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '12.5px',
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

// --- Hotkey handling inside floating window ---
window.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    const success = await window.electronAPI.copyToClipboard(imagePath);
    if (success) {
      showToast('📋 이미지가 복사되었습니다.');
    }
  }
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

