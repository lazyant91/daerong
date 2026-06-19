const canvas = document.getElementById('selection-canvas');
const ctx = canvas.getContext('2d');

// Parse Query Parameters
const params = new URLSearchParams(window.location.search);
const displayId = params.get('displayId');
const displayX = parseInt(params.get('x') || '0', 10);
const displayY = parseInt(params.get('y') || '0', 10);
const displayW = parseInt(params.get('w') || '0', 10);
const displayH = parseInt(params.get('h') || '0', 10);

let isDragging = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

// Setup High-DPI Canvas
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
  draw();
}

window.addEventListener('resize', resizeCanvas);

// Drawing logic
function draw() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  ctx.clearRect(0, 0, width, height);

  // Fill whole screen with dark overlay
  ctx.fillStyle = 'rgba(12, 8, 23, 0.65)';
  ctx.fillRect(0, 0, width, height);

  if (isDragging) {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(startX - currentX);
    const h = Math.abs(startY - currentY);

    // Clear drag area to make it transparent
    ctx.clearRect(x, y, w, h);

    // Draw highlight border
    ctx.strokeStyle = '#9d4edd';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Draw corner markers for a premium look
    ctx.fillStyle = '#f3f0ff';
    const markerSize = 6;
    // Top-Left
    ctx.fillRect(x - 2, y - 2, markerSize, markerSize);
    // Top-Right
    ctx.fillRect(x + w - markerSize + 2, y - 2, markerSize, markerSize);
    // Bottom-Left
    ctx.fillRect(x - 2, y + h - markerSize + 2, markerSize, markerSize);
    // Bottom-Right
    ctx.fillRect(x + w - markerSize + 2, y + h - markerSize + 2, markerSize, markerSize);

    // Show size helper text
    ctx.fillStyle = 'rgba(12, 8, 23, 0.85)';
    ctx.font = '11px sans-serif';
    const text = `${w} x ${h}`;
    const textWidth = ctx.measureText(text).width;
    const textHeight = 14;

    let textX = x;
    let textY = y - 8;
    if (textY < 20) {
      textY = y + h + 20;
    }
    
    ctx.fillRect(textX, textY - 14, textWidth + 8, textHeight + 4);
    ctx.fillStyle = '#f3f0ff';
    ctx.fillText(text, textX + 4, textY - 2);
  }
}

// Mouse events
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Left click only
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  currentX = startX;
  currentY = startY;
  draw();
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  currentX = e.clientX;
  currentY = e.clientY;
  draw();
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;

  const finalX = Math.min(startX, e.clientX);
  const finalY = Math.min(startY, e.clientY);
  const width = Math.abs(startX - e.clientX);
  const height = Math.abs(startY - e.clientY);

  if (width >= 10 && height >= 10) {
    // Send absolute screen coordinates
    const absoluteRect = {
      x: displayX + finalX,
      y: displayY + finalY,
      width: width,
      height: height,
      displayId: displayId
    };
    window.electronAPI.startMagnifierSelection(absoluteRect);
  } else {
    // Too small drag, cancel and close
    window.electronAPI.closeSelectionWindow();
  }
});

// Key events
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.electronAPI.closeSelectionWindow();
  }
});

// Initialize
resizeCanvas();
