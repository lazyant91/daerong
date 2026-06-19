const container = document.getElementById('magnifier-container');
const titlebar = document.getElementById('titlebar');
const closeBtn = document.getElementById('close-btn');
const videoWrapper = document.getElementById('video-wrapper');
const video = document.getElementById('webcam-video');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomLevelText = document.getElementById('zoom-level-text');
const playPauseBtn = document.getElementById('play-pause-btn');
const pinBtn = document.getElementById('pin-btn');

// Parse query params
const params = new URLSearchParams(window.location.search);
const windowId = parseInt(params.get('id') || '0', 10);
const displayId = params.get('displayId');
let rectX = parseInt(params.get('rectX') || '0', 10);
let rectY = parseInt(params.get('rectY') || '0', 10);
const rectW = parseInt(params.get('rectW') || '100', 10);
const rectH = parseInt(params.get('rectH') || '100', 10);
const disX = parseInt(params.get('disX') || '0', 10);
const disY = parseInt(params.get('disY') || '0', 10);
const disW = parseInt(params.get('disW') || '1920', 10);
const disH = parseInt(params.get('disH') || '1080', 10);

let stream = null;
let zoomScale = 1.0; // 추가 확대 비율 (1.0 = 드래그 영역 꽉참)
let isPaused = false;
let isAlwaysOnTop = true;

// Panning State Variables
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let initialRectX = 0;
let initialRectY = 0;

// 1. Initialize Theme & Media Stream
async function init() {
  // Theme load
  const settings = await window.electronAPI.getSettings();
  if (settings && settings.theme) {
    document.body.setAttribute('data-theme', settings.theme);
  }

  // Get Window alwaysOnTop info and sync UI
  try {
    const winInfo = await window.electronAPI.getWindowInfo();
    if (winInfo) {
      isAlwaysOnTop = winInfo.isAlwaysOnTop;
      updatePinUI();
    }
  } catch (err) {
    console.error('Failed to sync alwaysOnTop state:', err);
  }

  // Get Media Stream
  try {
    const sources = await window.electronAPI.getCaptureSources();
    // Find matching display
    const matchingSource = sources.find(src => src.display_id === displayId.toString()) || sources[0];

    if (!matchingSource) {
      console.error('No capture sources found.');
      return;
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: matchingSource.id,
          // Request high resolution to prevent blurry magnification
          minWidth: disW,
          minHeight: disH,
          maxWidth: disW * 2,
          maxHeight: disH * 2
        }
      }
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      updateVideoTransform();
    };
  } catch (err) {
    console.error('Failed to initialize screen sharing stream:', err);
  }
}

// 2. Video Crop & Transform Calculations
function updateVideoTransform() {
  if (!video.videoWidth || !video.videoHeight) return;

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  // Calculate resolution scale differences
  const scaleX = video.videoWidth / disW;
  const scaleY = video.videoHeight / disH;

  // Crop coordinates in video pixel space
  const relX = rectX - disX;
  const relY = rectY - disY;
  const cropX = relX * scaleX;
  const cropY = relY * scaleY;
  const cropW = rectW * scaleX;
  const cropH = rectH * scaleY;

  // Fitting scale factor
  const factorX = winW / cropW;
  const factorY = winH / cropH;

  // Apply dimensions & translation
  const finalScaleX = factorX * zoomScale;
  const finalScaleY = factorY * zoomScale;

  video.style.width = (video.videoWidth * finalScaleX) + 'px';
  video.style.height = (video.videoHeight * finalScaleY) + 'px';

  // Translate video offset
  const offsetX = -cropX * finalScaleX;
  const offsetY = -cropY * finalScaleY;
  
  video.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

// 3. Zoom Controls
function setZoom(scale) {
  zoomScale = Math.max(1.0, Math.min(10.0, scale));
  zoomLevelText.innerText = `${(zoomScale * 2).toFixed(1)}x`; // Base is 2x, so we multiply by 2
  updateVideoTransform();
}

zoomInBtn.addEventListener('click', () => setZoom(zoomScale + 0.25));
zoomOutBtn.addEventListener('click', () => setZoom(zoomScale - 0.25));

// Wheel Zoom Handler
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY < 0) {
    setZoom(zoomScale + 0.1);
  } else {
    setZoom(zoomScale - 0.1);
  }
}, { passive: false });

// 4. Play / Pause Control
playPauseBtn.addEventListener('click', () => {
  if (isPaused) {
    video.play();
    playPauseBtn.innerText = '⏸';
    playPauseBtn.title = '일시정지';
  } else {
    video.pause();
    playPauseBtn.innerText = '▶';
    playPauseBtn.title = '재개';
  }
  isPaused = !isPaused;
});

// Always on Top (Pin) Control
pinBtn.addEventListener('click', () => {
  isAlwaysOnTop = !isAlwaysOnTop;
  window.electronAPI.setAlwaysOnTop(windowId, isAlwaysOnTop);
  updatePinUI();
});

function updatePinUI() {
  if (isAlwaysOnTop) {
    pinBtn.title = '항상 위 해제';
    pinBtn.style.opacity = '1';
    pinBtn.style.background = 'var(--primary-color)';
    pinBtn.style.borderColor = 'var(--primary-color)';
  } else {
    pinBtn.title = '항상 위에 고정';
    pinBtn.style.opacity = '0.5';
    pinBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    pinBtn.style.borderColor = 'var(--card-border)';
  }
}

// 5. Window Dragging & Closing
let isDragging = false;
titlebar.addEventListener('mousedown', (e) => {
  if (e.target === closeBtn) return;
  isDragging = true;
  window.electronAPI.startDrag(windowId, e.screenX, e.screenY);
});

window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    window.electronAPI.performDrag(windowId);
  }
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    window.electronAPI.stopDrag(windowId);
  }
});

// 6. Screen Panning (Drag inside video area to move focus)
videoWrapper.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Left click only
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  initialRectX = rectX;
  initialRectY = rectY;
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const diffX = e.clientX - panStartX;
    const diffY = e.clientY - panStartY;

    if (!video.videoWidth || !video.videoHeight) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // Calculate resolution scale factors
    const scaleX = video.videoWidth / disW;
    const scaleY = video.videoHeight / disH;

    const cropW = rectW * scaleX;
    const cropH = rectH * scaleY;

    const factorX = winW / cropW;
    const factorY = winH / cropH;

    const finalScaleX = factorX * zoomScale;
    const finalScaleY = factorY * zoomScale;

    // Convert client drag delta back to screen coordinates
    const deltaX = diffX / finalScaleX;
    const deltaY = diffY / finalScaleY;

    // Update screen coordinates (opposite drag mimics dragging canvas screen)
    rectX = initialRectX - deltaX;
    rectY = initialRectY - deltaY;

    // Constrain selection to display bounds
    rectX = Math.max(disX, Math.min(disX + disW - rectW, rectX));
    rectY = Math.max(disY, Math.min(disY + disH - rectH, rectY));

    updateVideoTransform();
  }
});

window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
  }
});

// Double click to close
container.addEventListener('dblclick', (e) => {
  // Prevent double click on controls
  if (titlebar.contains(e.target) || document.getElementById('control-bar').contains(e.target)) return;
  window.electronAPI.closeWindow(windowId);
});

closeBtn.addEventListener('click', () => {
  window.electronAPI.closeWindow(windowId);
});

// Resize listener
window.addEventListener('resize', updateVideoTransform);

// Cleanup on destroy
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});

// Run Init
init();
