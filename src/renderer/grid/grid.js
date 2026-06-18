const closeWindowBtn = document.getElementById('close-window-btn');
const gridHeader = document.getElementById('grid-header');
const imageGrid = document.getElementById('image-grid');
const paginationControls = document.getElementById('pagination-controls');

// Window ID for dragging (this window's ID is retrieved from getWindowInfo later or we can drag by querying main.
// However, since we don't have windowId in URL query, we can query it from main using getWindowInfo.
let currentWindowId = null;
let activeImagesList = [];

// Pagination states
let currentPage = 1;
const itemsPerPage = 8; // 2x4 layout

// Get this window info to enable dragging
async function initWindow() {
  const info = await window.electronAPI.getWindowInfo();
  if (info) {
    currentWindowId = info.windowId;
  }
}

// Window Drag Handling
let isDragging = false;
gridHeader.addEventListener('mousedown', (e) => {
  if (e.button === 0 && currentWindowId) { // Left click
    isDragging = true;
    window.electronAPI.startDrag(currentWindowId);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }
});

function onMouseMove() {
  if (isDragging && currentWindowId) {
    window.electronAPI.performDrag(currentWindowId);
  }
}

function onMouseUp() {
  if (isDragging && currentWindowId) {
    isDragging = false;
    window.electronAPI.stopDrag(currentWindowId);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }
}

// Close Button
closeWindowBtn.addEventListener('click', () => {
  window.close();
});

// Fetch and Render list
async function loadImages() {
  activeImagesList = await window.electronAPI.getActiveWindows();
  renderGrid();
}

function renderGrid() {
  imageGrid.innerHTML = '';

  if (!activeImagesList || activeImagesList.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-grid-message';
    emptyMsg.innerText = '화면에 표시 중인 이미지가 없습니다.';
    imageGrid.appendChild(emptyMsg);
    paginationControls.innerHTML = '';
    return;
  }

  // Calculate pages
  const totalPages = Math.ceil(activeImagesList.length / itemsPerPage);
  if (currentPage > totalPages) {
    currentPage = totalPages || 1;
  }

  // Get current page items
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, activeImagesList.length);
  const pageItems = activeImagesList.slice(startIndex, endIndex);

  // Render items
  pageItems.forEach((item) => {
    const gridItem = document.createElement('div');
    gridItem.className = 'grid-item';
    gridItem.title = '클릭하면 화면 맨 앞으로 가져옵니다.';

    const img = document.createElement('img');
    img.src = `data:image/png;base64,${item.imageBase64}`;
    img.alt = 'Thumbnail';

    gridItem.appendChild(img);

    gridItem.addEventListener('click', () => {
      window.electronAPI.focusWindow(item.windowId);
      // Close list window on selection
      window.close();
    });

    imageGrid.appendChild(gridItem);
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  paginationControls.innerHTML = '';

  if (totalPages <= 1) return;

  // Previous Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.innerText = '이전';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderGrid();
    }
  });
  paginationControls.appendChild(prevBtn);

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-btn ${currentPage === i ? 'active' : ''}`;
    pageBtn.innerText = i;
    pageBtn.addEventListener('click', () => {
      currentPage = i;
      renderGrid();
    });
    paginationControls.appendChild(pageBtn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.innerText = '다음';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderGrid();
    }
  });
  paginationControls.appendChild(nextBtn);
}

// Listen for updates from Main process
window.electronAPI.on('active-windows-updated', (list) => {
  activeImagesList = list;
  renderGrid();
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

// Start
initWindow();
loadImages();

