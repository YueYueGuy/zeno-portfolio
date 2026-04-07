const dataUrl = './data/portfolio-content.json';
const contentSyncKey = 'zeno-portfolio-content-sync';
const contentSyncChannelName = 'zeno-portfolio-content-sync';
const TAG_OPTIONS = ['product', 'web', 'mobile', 'brand', 'keyboard', 'game', 'podcast'];
const SECTION_TYPES = ['text', 'image', 'video', 'gallery', 'quote'];
const DEFAULT_CATEGORIES = [
  {
    id: 'explore',
    label: 'Explore',
    description: '用于管理首页 Explore 下的案例与作品目录。',
    defaultTags: []
  },
  {
    id: 'work',
    label: 'Work',
    description: '用于管理公司工作经历与正式案例。',
    defaultTags: ['product']
  },
  {
    id: 'keyboard',
    label: 'My Keyboard',
    description: '用于管理键盘产品与相关图集。',
    defaultTags: ['keyboard']
  },
  {
    id: 'game',
    label: 'Game',
    description: '用于管理喜欢的游戏封面与展示内容。',
    defaultTags: ['game']
  },
  {
    id: 'podcast',
    label: 'Podcast',
    description: '用于管理常听播客的封面与展示内容。',
    defaultTags: ['podcast']
  }
];

const TAG_LABELS = {
  product: '工作项目',
  web: '网页',
  mobile: '移动端',
  brand: '品牌',
  keyboard: '键盘',
  game: '游戏',
  podcast: '播客'
};

const SECTION_TYPE_LABELS = {
  text: '文字',
  image: '图片',
  video: '视频',
  gallery: '图集',
  quote: '引用'
};

const state = {
  payload: null,
  selectedSeriesId: new URLSearchParams(window.location.search).get('id') || null,
  fileHandle: null,
  assetDirectoryHandle: null,
  uploads: {},
  studioUploads: [],
  draggingStudioUploadId: null,
  coverEditor: {
    open: false,
    uploadId: null,
    image: '',
    title: '',
    x: 50,
    y: 50
  },
  dirty: false
};
const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel(contentSyncChannelName) : null;

const els = {
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  seriesSelect: document.getElementById('seriesSelect'),
  statusNote: document.getElementById('statusNote'),
  fileNote: document.getElementById('fileNote'),
  assetNote: document.getElementById('assetNote'),
  editorRoot: document.getElementById('editorRoot'),
  previewRoot: document.getElementById('previewRoot'),
  bindFileButton: document.getElementById('bindFileButton'),
  bindAssetButton: document.getElementById('bindAssetButton'),
  saveButton: document.getElementById('saveButton'),
  reloadButton: document.getElementById('reloadButton'),
  downloadButton: document.getElementById('downloadButton'),
  openPublicLink: document.getElementById('openPublicLink'),
  coverEditorBackdrop: document.getElementById('coverEditorBackdrop'),
  coverEditorStage: document.getElementById('coverEditorStage'),
  coverEditorImage: document.getElementById('coverEditorImage'),
  coverEditorFocus: document.getElementById('coverEditorFocus'),
  coverEditorTitle: document.getElementById('coverEditorTitle'),
  coverEditorX: document.getElementById('coverEditorX'),
  coverEditorY: document.getElementById('coverEditorY'),
  coverEditorValue: document.getElementById('coverEditorValue'),
  coverEditorCancel: document.getElementById('coverEditorCancel'),
  coverEditorApply: document.getElementById('coverEditorApply')
};

function seriesList() {
  return Array.isArray(state.payload?.series) ? state.payload.series : [];
}

function categoriesList() {
  return Array.isArray(state.payload?.categories) ? state.payload.categories : [];
}

function currentSeries() {
  return seriesList().find((series) => series.id === state.selectedSeriesId) || null;
}

function inferCategoryId(series) {
  if (series.categoryId) return series.categoryId;
  const tags = Array.isArray(series.tags) ? series.tags : [];
  if (tags.includes('keyboard')) return 'keyboard';
  if (tags.includes('game')) return 'game';
  if (tags.includes('podcast')) return 'podcast';
  if (tags.includes('product')) return 'work';
  return 'explore';
}

function ensurePayloadShape(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (!Array.isArray(payload.series)) payload.series = [];
  if (!Array.isArray(payload.categories)) {
    payload.categories = DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      defaultTags: [...category.defaultTags]
    }));
  } else {
    const existingIds = new Set(payload.categories.map((category) => category.id));
    DEFAULT_CATEGORIES.forEach((category) => {
      if (!existingIds.has(category.id)) {
        payload.categories.push({
          ...category,
          defaultTags: [...category.defaultTags]
        });
      }
    });
  }

  payload.series.forEach((series) => {
    if (!series.categoryId) {
      series.categoryId = inferCategoryId(series);
    }
  });
}

function ensureSeriesShape(series) {
  if (!series.detail) series.detail = {};
  if (!series.detail.hero) series.detail.hero = {};
  if (!Array.isArray(series.detail.sections)) series.detail.sections = [];
  if (!Array.isArray(series.items)) series.items = [];
  if (!Array.isArray(series.tags)) series.tags = [];
  if (!series.categoryId) series.categoryId = inferCategoryId(series);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(message, tone = '') {
  els.statusNote.textContent = message || '';
  els.statusNote.dataset.tone = tone;
}

function sectionTypeLabel(type) {
  return SECTION_TYPE_LABELS[type] || type;
}

function tagLabel(tag) {
  return TAG_LABELS[tag] || tag;
}

function setDirty(nextDirty = true) {
  state.dirty = nextDirty;
  document.title = `${nextDirty ? '* ' : ''}作品集编辑器`;
}

function updateFileNote() {
  els.fileNote.textContent = state.fileHandle
    ? '已绑定本地文件句柄。保存时会直接写入 portfolio-content.json。'
    : '尚未绑定文件句柄。若不绑定源文件，保存时将下载一份新的 JSON 文件。';
  els.assetNote.textContent = state.assetDirectoryHandle
    ? `已绑定媒体目录：${state.assetDirectoryHandle.name}。上传图片或视频后会自动写入该目录并回填地址。`
    : '尚未绑定媒体目录。若要使用上传功能，请先绑定网站内可公开访问的目录，例如 assets/uploads。';
}

function slugifyFileName(name) {
  const lastDot = name.lastIndexOf('.');
  const base = (lastDot >= 0 ? name.slice(0, lastDot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
  const ext = lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '.png';
  return `${base}${ext}`;
}

function assetPublicBasePath() {
  if (!state.assetDirectoryHandle) {
    return 'assets/uploads';
  }
  return state.assetDirectoryHandle.name === 'assets'
    ? 'assets'
    : `assets/${state.assetDirectoryHandle.name}`;
}

function getUploadState(path) {
  return state.uploads[path] || null;
}

function setUploadState(path, nextState) {
  state.uploads[path] = {
    ...(state.uploads[path] || {}),
    ...nextState
  };
}

function clearUploadState(path) {
  delete state.uploads[path];
}

function generateStudioUploadId() {
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function studioUploadLabel(status, kind) {
  if (status === 'uploading') return '上传中';
  if (status === 'processing') return '处理中';
  if (status === 'success') return kind === 'video' ? '视频已入库' : '图片已入库';
  if (status === 'error') return '上传失败';
  return '待处理';
}

function inferMediaKind(path) {
  return path.includes('.video') ? 'video' : 'image';
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseMediaPosition(position) {
  const fallback = { x: 50, y: 50 };
  if (typeof position !== 'string') return fallback;
  const match = position.trim().match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
  if (!match) return fallback;
  return {
    x: clamp(Number(match[1]), 0, 100),
    y: clamp(Number(match[2]), 0, 100)
  };
}

function formatMediaPosition(x, y) {
  return `${clamp(x, 0, 100).toFixed(1)}% ${clamp(y, 0, 100).toFixed(1)}%`;
}

function mediaStyleAttr(position) {
  if (!position) return '';
  return ` style="object-position:${escapeHtml(position)}"`;
}

function isAcceptedFile(file, kind) {
  if (!(file instanceof File)) return false;
  if (kind === 'video') {
    return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|ogg)$/i.test(file.name);
  }
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
}

function uploadAcceptConfig(kind) {
  return kind === 'video'
    ? { description: '视频文件', accept: { 'video/*': ['.mp4', '.mov', '.webm', '.m4v', '.ogg'] } }
    : { description: '图片文件', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'] } };
}

async function writeFileWithProgress(targetHandle, file, onProgress) {
  const writable = await targetHandle.createWritable();
  const chunkSize = 512 * 1024;
  let offset = 0;
  onProgress(0);
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    await writable.write(chunk);
    offset += chunk.size;
    onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
  }
  await writable.close();
}

async function loadPayload() {
  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`无法加载内容文件：${response.status}`);
  }

  state.payload = await response.json();
  ensurePayloadShape(state.payload);
  const list = seriesList();
  if (!list.length) {
    state.selectedSeriesId = null;
  } else if (!list.some((series) => series.id === state.selectedSeriesId)) {
    state.selectedSeriesId = list[0].id;
  }
  setDirty(false);
  render();
}

async function bindFileHandle() {
  if (!window.showOpenFilePicker) {
    throw new Error('当前浏览器不支持 File System Access API。');
  }

  const [handle] = await window.showOpenFilePicker({
    types: [{ description: '作品集内容 JSON', accept: { 'application/json': ['.json'] } }],
    multiple: false,
    excludeAcceptAllOption: true
  });

  state.fileHandle = handle;
  updateFileNote();
  setStatus('内容文件绑定成功。', 'success');
}

async function bindAssetDirectory() {
  if (!window.showDirectoryPicker) {
    throw new Error('当前浏览器不支持目录绑定功能。');
  }

  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  state.assetDirectoryHandle = handle;
  updateFileNote();
  setStatus(`媒体目录绑定成功：${handle.name}`, 'success');
}

async function uploadMediaFile(path, file, kind = inferMediaKind(path)) {
  if (!state.assetDirectoryHandle) {
    await bindAssetDirectory();
  }
  const series = currentSeries();
  if (!series) {
    throw new Error('当前没有可编辑的项目系列。');
  }
  if (!isAcceptedFile(file, kind)) {
    throw new Error(kind === 'video' ? '请上传常见视频格式文件。' : '请上传常见图片格式文件。');
  }

  const filename = `${series.id}-${Date.now()}-${slugifyFileName(file.name)}`;
  const targetHandle = await state.assetDirectoryHandle.getFileHandle(filename, { create: true });
  const previewUrl = URL.createObjectURL(file);
  setUploadState(path, {
    status: 'uploading',
    progress: 0,
    previewUrl,
    kind,
    fileName: file.name,
    fileSize: file.size
  });
  render();

  await writeFileWithProgress(targetHandle, file, (progress) => {
    setUploadState(path, { progress, status: progress >= 100 ? 'processing' : 'uploading' });
    render();
  });

  const publicPath = `${assetPublicBasePath()}/${filename}`;
  updateCurrentSeries(path, publicPath);
  setUploadState(path, {
    status: 'success',
    progress: 100,
    previewUrl: publicPath,
    publicPath,
    kind,
    fileName: file.name,
    fileSize: file.size
  });
  render();
  setStatus(kind === 'video' ? '视频上传成功，已自动回填地址。' : '图片上传成功，已自动回填地址。', 'success');
}

async function uploadAssetToLibrary(file, kind, onProgress = () => {}) {
  if (!state.assetDirectoryHandle) {
    await bindAssetDirectory();
  }
  const series = currentSeries();
  if (!series) {
    throw new Error('当前没有可编辑的项目系列。');
  }
  if (!isAcceptedFile(file, kind)) {
    throw new Error(kind === 'video' ? '请上传常见视频格式文件。' : '请上传常见图片格式文件。');
  }

  const filename = `${series.id}-${Date.now()}-${slugifyFileName(file.name)}`;
  const targetHandle = await state.assetDirectoryHandle.getFileHandle(filename, { create: true });
  const previewUrl = URL.createObjectURL(file);

  await writeFileWithProgress(targetHandle, file, onProgress);

  return {
    id: generateStudioUploadId(),
    kind,
    status: 'success',
    progress: 100,
    fileName: file.name,
    fileSize: file.size,
    previewUrl,
    publicPath: `${assetPublicBasePath()}/${filename}`,
    displayTitle: file.name.replace(/\.[^.]+$/, ''),
    alt: file.name.replace(/\.[^.]+$/, '')
  };
}

async function pickAndUploadMedia(path, kind = inferMediaKind(path)) {
  if (!window.showOpenFilePicker) {
    throw new Error(kind === 'video' ? '当前浏览器不支持视频上传功能。' : '当前浏览器不支持图片上传功能。');
  }

  const [fileHandle] = await window.showOpenFilePicker({
    types: [uploadAcceptConfig(kind)],
    multiple: false,
    excludeAcceptAllOption: true
  });

  const file = await fileHandle.getFile();
  await uploadMediaFile(path, file, kind);
}

function serializePayload() {
  return `${JSON.stringify(state.payload, null, 2)}\n`;
}

function downloadPayload() {
  const blob = new Blob([serializePayload()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'portfolio-content.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function publishContentSync() {
  const payload = {
    type: 'content-updated',
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(contentSyncKey, JSON.stringify(payload));
  syncChannel?.postMessage(payload);
}

async function savePayload() {
  if (!state.payload) return;
  state.payload.updatedAt = new Date().toISOString();

  if (state.fileHandle) {
    const writable = await state.fileHandle.createWritable();
    await writable.write(serializePayload());
    await writable.close();
    publishContentSync();
    setDirty(false);
    setStatus('更改已保存到 portfolio-content.json。', 'success');
    renderHeader();
    return;
  }

  downloadPayload();
  setDirty(false);
  setStatus('已下载更新后的 JSON。绑定源文件后可一键直接保存。', 'success');
}

function parsePath(path) {
  return path.split('.').map((part) => (String(Number(part)) === part ? Number(part) : part));
}

function setValueByPath(target, path, value) {
  const keys = parsePath(path);
  let cursor = target;
  keys.forEach((key, index) => {
    const isLast = index === keys.length - 1;
    if (isLast) {
      cursor[key] = value;
      return;
    }
    const nextKey = keys[index + 1];
    if (cursor[key] === undefined) {
      cursor[key] = typeof nextKey === 'number' ? [] : {};
    }
    cursor = cursor[key];
  });
}

function moveItem(items, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= items.length) return;
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
}

function createSectionTemplate(type) {
  const base = {
    id: `section-${Math.random().toString(36).slice(2, 8)}`,
    type,
    label: '',
    heading: '',
    summary: ''
  };

  if (type === 'image') {
    return { ...base, title: '', body: '', image: '', alt: '', href: '' };
  }

  if (type === 'video') {
    return { ...base, title: '', body: '', video: '', poster: '', alt: '', href: '' };
  }

  if (type === 'gallery') {
    return { ...base, items: [] };
  }

  if (type === 'quote') {
    return { ...base, quote: '', source: '' };
  }

  return { ...base, body: '' };
}

function createGalleryItemTemplate() {
  return { title: '', meta: '', image: '', alt: '', href: '' };
}

function renderHeader() {
  const series = currentSeries();
  if (!series) {
    els.pageTitle.textContent = '未选择项目系列';
    els.pageSubtitle.textContent = '请返回 CMS 列表并选择一个项目系列。';
    els.openPublicLink.href = './index.html#gallery';
    return;
  }

  ensureSeriesShape(series);
  els.pageTitle.textContent = series.detail?.title || series.title || '未命名项目系列';
  els.pageSubtitle.textContent = '在左侧编辑内容，并在右侧实时查看详情页预览。';
  els.openPublicLink.href = `./index.html#series/${encodeURIComponent(series.id)}`;
}

function renderSeriesSelect() {
  const list = seriesList();
  els.seriesSelect.innerHTML = list.map((series) => `
    <option value="${series.id}" ${series.id === state.selectedSeriesId ? 'selected' : ''}>${series.title}</option>`).join('');
}

function renderTagEditor(series) {
  return TAG_OPTIONS.map((tag) => `
    <label class="tag-chip">
      <input type="checkbox" data-tag="${tag}" ${series.tags.includes(tag) ? 'checked' : ''}>
      <span>${tagLabel(tag)}</span>
    </label>`).join('');
}

function renderCategorySelect(series) {
  return categoriesList().map((category) => `
    <option value="${escapeHtml(category.id)}" ${series.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.label)}</option>
  `).join('');
}

function renderUploadInput(label, value, path, buttonLabel = '上传图片', kind = inferMediaKind(path)) {
  const uploadState = getUploadState(path);
  const isUploading = uploadState?.status === 'uploading' || uploadState?.status === 'processing';
  const isSuccess = uploadState?.status === 'success';
  const progressLabel = uploadState?.status === 'processing'
    ? '正在整理文件…'
    : `正在上传 ${uploadState?.progress || 0}%`;
  const previewMedia = isSuccess
    ? (uploadState.kind === 'video'
        ? `<video src="${escapeHtml(uploadState.previewUrl || '')}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(uploadState.previewUrl || '')}" alt="${escapeHtml(uploadState.fileName || '上传成功预览')}">`)
    : '';

  return `
    <div class="field">
      <span class="field-label">${label}</span>
      <div class="field-upload-stack">
        <div class="field-upload-drop" data-upload-path="${path}" data-upload-kind="${kind}">
          <div class="field-upload-row">
            <input value="${escapeHtml(value || '')}" data-path="${path}">
            <button class="button field-upload-button" type="button" data-action="upload-media" data-path="${path}" data-kind="${kind}">${buttonLabel}</button>
          </div>
          <div class="field-upload-hint">
            <strong>支持拖拽上传</strong>，也可以点击右侧按钮选择${kind === 'video' ? '视频' : '图片'}文件。
          </div>
        </div>
        <div class="field-upload-feedback" ${uploadState ? '' : 'hidden'}>
          ${isUploading ? `
            <div class="upload-progress"><span style="width:${Math.max(4, uploadState.progress || 0)}%"></span></div>
            <div class="upload-progress-copy">${progressLabel}</div>
          ` : ''}
          ${isSuccess ? `
            <div class="upload-success">
              <div class="upload-success-media">${previewMedia}</div>
              <div class="upload-success-copy">
                <div class="upload-success-title">${kind === 'video' ? '视频上传成功' : '图片上传成功'}</div>
                <div class="upload-success-meta">${escapeHtml(uploadState.fileName || '')} · ${escapeHtml(formatFileSize(uploadState.fileSize || 0))}</div>
                <div class="upload-success-meta">${escapeHtml(uploadState.publicPath || value || '')}</div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>`;
}

function renderGalleryItemCard(item, sectionIndex, itemIndex) {
  return `
    <div class="gallery-item-card">
      <div class="card-head">
        <div>
          <h3>图集项 ${itemIndex + 1}</h3>
          <div class="card-meta">当前图集区块中的图片项</div>
        </div>
        <div class="gallery-item-toolbar">
          <button class="small ghost" type="button" data-action="move-gallery-item-up" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">上移</button>
          <button class="small ghost" type="button" data-action="move-gallery-item-down" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">下移</button>
          <button class="small danger" type="button" data-action="remove-gallery-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">删除</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">标题</span>
          <input value="${escapeHtml(item.title || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.title">
        </label>
        <label class="field">
          <span class="field-label">说明</span>
          <input value="${escapeHtml(item.meta || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.meta">
        </label>
      </div>
      <div class="field-grid single">
        ${renderUploadInput('图片地址', item.image || '', `detail.sections.${sectionIndex}.items.${itemIndex}.image`)}
        <label class="field">
          <span class="field-label">替代文本</span>
          <input value="${escapeHtml(item.alt || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.alt">
        </label>
        <label class="field">
          <span class="field-label">链接</span>
          <input value="${escapeHtml(item.href || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.href">
        </label>
      </div>
    </div>`;
}

function renderStudioUploadCard(asset) {
  const isVideo = asset.kind === 'video';
  const previewMedia = isVideo
    ? `<video src="${escapeHtml(asset.previewUrl || asset.publicPath || '')}" muted playsinline preload="metadata"></video>`
    : `<img src="${escapeHtml(asset.previewUrl || asset.publicPath || '')}" alt="${escapeHtml(asset.alt || asset.displayTitle || asset.fileName || '上传预览')}">`;
  const progressMarkup = asset.status === 'uploading' || asset.status === 'processing'
    ? `
      <div class="upload-progress"><span style="width:${Math.max(4, asset.progress || 0)}%"></span></div>
      <div class="upload-progress-copy">${asset.status === 'processing' ? '正在整理文件…' : `正在上传 ${asset.progress || 0}%`}</div>
    `
    : '';
  const actionButtons = asset.status === 'success'
    ? `
      <div class="upload-asset-actions">
        ${isVideo
          ? `<button class="button small" type="button" data-action="studio-create-video-section" data-upload-id="${asset.id}">创建视频区块</button>`
          : `<button class="button small" type="button" data-action="studio-set-hero" data-upload-id="${asset.id}">设为封面</button>
             <button class="button small ghost" type="button" data-action="studio-open-cover-editor" data-upload-id="${asset.id}">裁切封面</button>
             <button class="button small" type="button" data-action="studio-add-gallery" data-upload-id="${asset.id}">加入图集</button>
             <button class="button small" type="button" data-action="studio-create-image-section" data-upload-id="${asset.id}">创建图片区块</button>`
        }
        <button class="button small" type="button" data-action="studio-remove-upload" data-upload-id="${asset.id}">移出队列</button>
      </div>
    `
    : `
      <div class="upload-asset-actions">
        <button class="button small" type="button" data-action="studio-remove-upload" data-upload-id="${asset.id}">移出队列</button>
      </div>
    `;

  return `
    <article class="upload-asset-card" data-upload-id="${asset.id}" draggable="true">
      <div class="upload-asset-handle" aria-hidden="true">拖拽排序</div>
      <div class="upload-asset-top">
        <div class="upload-asset-media">${previewMedia}</div>
        <div class="upload-asset-copy">
          <div class="upload-asset-status ${asset.status === 'success' ? 'success' : ''}">${studioUploadLabel(asset.status, asset.kind)}</div>
          <div class="upload-asset-title">${escapeHtml(asset.displayTitle || asset.fileName || '未命名素材')}</div>
          <div class="upload-asset-subtitle">${isVideo ? '视频素材' : '图片素材'} · ${escapeHtml(formatFileSize(asset.fileSize || 0))}</div>
          ${asset.publicPath ? `<div class="upload-asset-path">${escapeHtml(asset.publicPath)}</div>` : ''}
        </div>
      </div>
      ${progressMarkup}
      ${actionButtons}
    </article>`;
}

function renderUploadStudio(series) {
  const uploadCount = state.studioUploads.length;
  return `
    <div class="card upload-studio">
      <div class="card-head">
        <div>
          <h2>作品上传工作台</h2>
          <p>像发布 Dribbble 作品一样，先集中上传素材，再决定把它们落到封面、图集还是内容区块。整个过程会更连贯，也更适合连续整理案例。</p>
        </div>
      </div>
      <div class="upload-studio-shell">
        <div class="upload-studio-dropzone" data-studio-dropzone="true">
          <div class="upload-studio-copy">
            <div class="upload-studio-kicker">发布流程</div>
            <h3 class="upload-studio-title">把图片和视频先放进当前项目目录</h3>
            <div>拖拽文件到这里，或者用下面的按钮批量导入。素材入库后，你可以一键设为封面、加入图集，或生成新的详情区块。</div>
          </div>
          <div class="upload-studio-actions">
            <button class="button accent" type="button" data-action="studio-pick-files" data-kind="image">上传图片</button>
            <button class="button" type="button" data-action="studio-pick-files" data-kind="video">上传视频</button>
          </div>
          <div class="upload-studio-meta">
            <span class="upload-studio-chip">当前项目：${escapeHtml(series.title || '未命名项目')}</span>
            <span class="upload-studio-chip">${uploadCount} 个素材在队列中</span>
            <span class="upload-studio-chip">支持拖拽上传与批量整理</span>
          </div>
        </div>
        <div class="upload-studio-rail">
          <div class="upload-studio-rail-head">
            <div>
              <h3>上传队列</h3>
              <p>成功入库后，可以先拖拽排序，再按当前顺序批量加入图集或生成详情区块。</p>
            </div>
            <div class="upload-studio-rail-actions">
              <button class="button small ghost" type="button" data-action="studio-batch-gallery">按当前顺序加入图集</button>
              <button class="button small ghost" type="button" data-action="studio-batch-sections">按当前顺序生成内容区块</button>
              <button class="button small ghost" type="button" data-action="open-cover-editor">调整当前封面</button>
            </div>
          </div>
          <div class="upload-studio-list">
            ${state.studioUploads.length
              ? state.studioUploads.map(renderStudioUploadCard).join('')
              : '<div class="upload-studio-empty">还没有上传素材。先拖拽图片或视频进来，队列里会显示进度与缩略图。</div>'}
          </div>
        </div>
      </div>
    </div>`;
}

function upsertStudioUpload(uploadId, nextState) {
  const existingIndex = state.studioUploads.findIndex((item) => item.id === uploadId);
  if (existingIndex >= 0) {
    state.studioUploads[existingIndex] = {
      ...state.studioUploads[existingIndex],
      ...nextState
    };
    return state.studioUploads[existingIndex];
  }
  const created = { id: uploadId, ...nextState };
  state.studioUploads.unshift(created);
  return created;
}

function releaseStudioUploadPreview(upload) {
  if (upload?.previewUrl?.startsWith?.('blob:')) {
    URL.revokeObjectURL(upload.previewUrl);
  }
}

function removeStudioUpload(uploadId) {
  const index = state.studioUploads.findIndex((item) => item.id === uploadId);
  if (index >= 0) {
    releaseStudioUploadPreview(state.studioUploads[index]);
    state.studioUploads.splice(index, 1);
  }
}

function reorderStudioUploads(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const fromIndex = state.studioUploads.findIndex((item) => item.id === fromId);
  const toIndex = state.studioUploads.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0) return;
  moveItem(state.studioUploads, fromIndex, toIndex);
}

function ensureGallerySection(series) {
  let gallerySection = series.detail.sections.find((section) => section.type === 'gallery');
  if (!gallerySection) {
    gallerySection = createSectionTemplate('gallery');
    gallerySection.id = `gallery-${Math.random().toString(36).slice(2, 8)}`;
    gallerySection.label = 'Gallery';
    gallerySection.heading = 'Selected Works';
    gallerySection.summary = 'Uploaded works from the studio queue.';
    gallerySection.items = [];
    series.detail.sections.push(gallerySection);
  }
  if (!Array.isArray(gallerySection.items)) {
    gallerySection.items = [];
  }
  return gallerySection;
}

function addStudioAssetToGallery(uploadId) {
  const series = currentSeries();
  const asset = state.studioUploads.find((item) => item.id === uploadId);
  if (!series || !asset || asset.kind !== 'image') return;
  ensureSeriesShape(series);
  const gallerySection = ensureGallerySection(series);
  gallerySection.items.unshift({
    title: asset.displayTitle || series.title || 'Gallery item',
    meta: '',
    image: asset.publicPath,
    alt: asset.alt || asset.displayTitle || '',
    href: '',
    position: asset.position || ''
  });
  setDirty(true);
  setStatus('素材已加入图集。', 'success');
  render();
}

function syncCoverEntry(series, assetOrHero = {}) {
  if (!Array.isArray(series.items)) {
    series.items = [];
  }
  const coverTitle = assetOrHero.displayTitle || assetOrHero.title || series.title || 'Cover';
  const coverAlt = assetOrHero.alt || assetOrHero.displayTitle || assetOrHero.title || '';
  const coverImage = assetOrHero.publicPath || assetOrHero.image || '';
  const coverPosition = assetOrHero.position || series.detail?.hero?.position || '50.0% 50.0%';
  if (series.items.length) {
    series.items[0] = {
      ...series.items[0],
      title: series.items[0].title || coverTitle,
      meta: series.items[0].meta || 'Cover image',
      image: coverImage,
      alt: coverAlt || series.items[0].alt || '',
      href: series.items[0].href || '',
      position: coverPosition
    };
  } else {
    series.items.push({
      title: coverTitle,
      meta: 'Cover image',
      image: coverImage,
      alt: coverAlt,
      href: '',
      position: coverPosition
    });
  }
}

function setStudioAssetAsHero(uploadId) {
  const series = currentSeries();
  const asset = state.studioUploads.find((item) => item.id === uploadId);
  if (!series || !asset || asset.kind !== 'image') return;
  ensureSeriesShape(series);
  series.detail.hero.image = asset.publicPath;
  if (!series.detail.hero.alt) series.detail.hero.alt = asset.alt || asset.displayTitle || '';
  if (!series.detail.hero.title) series.detail.hero.title = asset.displayTitle || series.title || '';
  if (!series.detail.hero.position) {
    series.detail.hero.position = '50.0% 50.0%';
  }
  syncCoverEntry(series, {
    ...asset,
    image: asset.publicPath,
    position: series.detail.hero.position
  });
  setDirty(true);
  setStatus('素材已设为封面。', 'success');
  render();
}

function createSectionFromStudioAsset(uploadId, type) {
  const series = currentSeries();
  const asset = state.studioUploads.find((item) => item.id === uploadId);
  if (!series || !asset) return;
  ensureSeriesShape(series);
  const section = createSectionTemplate(type);
  section.id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
  section.label = type === 'video' ? 'Video' : 'Visual';
  section.heading = asset.displayTitle || series.title || '';
  section.title = asset.displayTitle || series.title || '';
  section.alt = asset.alt || asset.displayTitle || '';
  section.body = '';
  if (type === 'video') {
    section.video = asset.publicPath;
    section.poster = '';
  } else {
    section.image = asset.publicPath;
    section.position = asset.position || '';
  }
  series.detail.sections.push(section);
  setDirty(true);
  setStatus(type === 'video' ? '已创建视频区块。' : '已创建图片区块。', 'success');
  render();
}

function addStudioQueueToGallery() {
  const series = currentSeries();
  if (!series) return;
  ensureSeriesShape(series);
  const queue = state.studioUploads.filter((item) => item.status === 'success' && item.kind === 'image');
  if (!queue.length) {
    setStatus('队列里还没有可加入图集的图片素材。', 'error');
    return;
  }
  const gallerySection = ensureGallerySection(series);
  gallerySection.items.push(...queue.map((asset) => ({
    title: asset.displayTitle || series.title || 'Gallery item',
    meta: '',
    image: asset.publicPath,
    alt: asset.alt || asset.displayTitle || '',
    href: '',
    position: asset.position || ''
  })));
  setDirty(true);
  setStatus(`已按当前顺序把 ${queue.length} 张图片加入图集。`, 'success');
  render();
}

function createSectionsFromQueue() {
  const series = currentSeries();
  if (!series) return;
  ensureSeriesShape(series);
  const queue = state.studioUploads.filter((item) => item.status === 'success');
  if (!queue.length) {
    setStatus('队列里还没有可生成内容区块的素材。', 'error');
    return;
  }
  queue.forEach((asset) => {
    const section = createSectionTemplate(asset.kind === 'video' ? 'video' : 'image');
    section.id = `${asset.kind === 'video' ? 'video' : 'image'}-${Math.random().toString(36).slice(2, 8)}`;
    section.label = asset.kind === 'video' ? 'Video' : 'Visual';
    section.heading = asset.displayTitle || series.title || '';
    section.title = asset.displayTitle || series.title || '';
    section.alt = asset.alt || asset.displayTitle || '';
    if (asset.kind === 'video') {
      section.video = asset.publicPath;
      section.poster = '';
    } else {
      section.image = asset.publicPath;
      section.position = asset.position || '';
    }
    series.detail.sections.push(section);
  });
  setDirty(true);
  setStatus(`已按当前顺序生成 ${queue.length} 个详情区块。`, 'success');
  render();
}

function syncCoverEditorUI() {
  const { open, image, title, x, y } = state.coverEditor;
  if (!els.coverEditorBackdrop) return;
  els.coverEditorBackdrop.hidden = !open;
  if (!open) return;
  els.coverEditorTitle.textContent = title || '调整封面裁切';
  els.coverEditorImage.src = image || '';
  els.coverEditorImage.alt = title || 'Cover image';
  const position = formatMediaPosition(x, y);
  els.coverEditorImage.style.objectPosition = position;
  els.coverEditorFocus.style.left = `${x}%`;
  els.coverEditorFocus.style.top = `${y}%`;
  els.coverEditorX.value = String(Math.round(x));
  els.coverEditorY.value = String(Math.round(y));
  els.coverEditorValue.textContent = position;
}

function openCoverEditor(uploadId = null) {
  const series = currentSeries();
  if (!series) return;
  ensureSeriesShape(series);
  const asset = uploadId ? state.studioUploads.find((item) => item.id === uploadId && item.kind === 'image') : null;
  const image = asset?.publicPath || asset?.previewUrl || series.detail.hero.image || series.items?.[0]?.image || '';
  if (!image) {
    setStatus('当前还没有可调整的封面图片。', 'error');
    return;
  }
  const position = parseMediaPosition(
    asset?.position
    || series.detail.hero.position
    || series.items?.[0]?.position
    || '50% 50%'
  );
  state.coverEditor = {
    open: true,
    uploadId,
    image,
    title: asset?.displayTitle || series.title || '调整封面裁切',
    x: position.x,
    y: position.y
  };
  syncCoverEditorUI();
}

function closeCoverEditor() {
  state.coverEditor.open = false;
  state.coverEditor.uploadId = null;
  syncCoverEditorUI();
}

function updateCoverEditorPosition(x, y) {
  state.coverEditor.x = clamp(x, 0, 100);
  state.coverEditor.y = clamp(y, 0, 100);
  syncCoverEditorUI();
}

function applyCoverEditor() {
  const series = currentSeries();
  if (!series) return;
  ensureSeriesShape(series);
  const uploadAsset = state.coverEditor.uploadId
    ? state.studioUploads.find((item) => item.id === state.coverEditor.uploadId && item.kind === 'image')
    : null;
  const position = formatMediaPosition(state.coverEditor.x, state.coverEditor.y);
  if (uploadAsset) {
    series.detail.hero.image = uploadAsset.publicPath;
    if (!series.detail.hero.title) series.detail.hero.title = uploadAsset.displayTitle || series.title || '';
    if (!series.detail.hero.alt) series.detail.hero.alt = uploadAsset.alt || uploadAsset.displayTitle || '';
    uploadAsset.position = position;
  }
  series.detail.hero.position = position;
  syncCoverEntry(series, {
    ...(uploadAsset || {}),
    image: series.detail.hero.image || uploadAsset?.publicPath || '',
    title: series.detail.hero.title || uploadAsset?.displayTitle || series.title || '',
    alt: series.detail.hero.alt || uploadAsset?.alt || '',
    position
  });
  setDirty(true);
  setStatus('封面裁切焦点已更新。', 'success');
  closeCoverEditor();
  render();
}

async function queueStudioFiles(files, kind) {
  if (!files?.length) return;
  for (const file of files) {
    const uploadId = generateStudioUploadId();
    upsertStudioUpload(uploadId, {
      id: uploadId,
      kind,
      status: 'uploading',
      progress: 0,
      fileName: file.name,
      fileSize: file.size,
      previewUrl: URL.createObjectURL(file),
      displayTitle: file.name.replace(/\.[^.]+$/, ''),
      alt: file.name.replace(/\.[^.]+$/, '')
    });
    render();

    try {
      const uploaded = await uploadAssetToLibrary(file, kind, (progress) => {
        upsertStudioUpload(uploadId, {
          status: progress >= 100 ? 'processing' : 'uploading',
          progress
        });
        render();
      });
      upsertStudioUpload(uploadId, uploaded);
      setStatus(kind === 'video' ? '视频已加入上传队列。' : '图片已加入上传队列。', 'success');
      render();
    } catch (error) {
      upsertStudioUpload(uploadId, {
        status: 'error',
        progress: 0
      });
      render();
      setStatus(error.message, 'error');
    }
  }
}

async function pickStudioFiles(kind) {
  if (!window.showOpenFilePicker) {
    throw new Error(kind === 'video' ? '当前浏览器不支持视频上传功能。' : '当前浏览器不支持图片上传功能。');
  }

  const handles = await window.showOpenFilePicker({
    types: [uploadAcceptConfig(kind)],
    multiple: true,
    excludeAcceptAllOption: true
  });
  const files = await Promise.all(handles.map((handle) => handle.getFile()));
  await queueStudioFiles(files, kind);
}

function renderSectionFields(section, sectionIndex) {
  const base = `
    <div class="field-grid">
      <label class="field">
        <span class="field-label">区块 ID</span>
        <input value="${escapeHtml(section.id || '')}" data-path="detail.sections.${sectionIndex}.id">
      </label>
      <label class="field">
        <span class="field-label">类型</span>
        <select data-path="detail.sections.${sectionIndex}.type">
          ${SECTION_TYPES.map((type) => `<option value="${type}" ${section.type === type ? 'selected' : ''}>${sectionTypeLabel(type)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="field-grid">
      <label class="field">
        <span class="field-label">标签</span>
        <input value="${escapeHtml(section.label || '')}" data-path="detail.sections.${sectionIndex}.label">
      </label>
      <label class="field">
        <span class="field-label">标题</span>
        <input value="${escapeHtml(section.heading || '')}" data-path="detail.sections.${sectionIndex}.heading">
      </label>
    </div>
    <div class="field-grid single">
      <label class="field">
        <span class="field-label">摘要</span>
        <textarea data-path="detail.sections.${sectionIndex}.summary">${escapeHtml(section.summary || '')}</textarea>
      </label>
    </div>`;

  if (section.type === 'image') {
    return `${base}
      <div class="field-grid">
        <label class="field">
          <span class="field-label">图片标题</span>
          <input value="${escapeHtml(section.title || '')}" data-path="detail.sections.${sectionIndex}.title">
        </label>
        <label class="field">
          <span class="field-label">图片替代文本</span>
          <input value="${escapeHtml(section.alt || '')}" data-path="detail.sections.${sectionIndex}.alt">
        </label>
      </div>
      <div class="field-grid single">
        ${renderUploadInput('图片地址', section.image || '', `detail.sections.${sectionIndex}.image`)}
        <label class="field">
          <span class="field-label">链接</span>
          <input value="${escapeHtml(section.href || '')}" data-path="detail.sections.${sectionIndex}.href">
        </label>
        <label class="field">
          <span class="field-label">说明 / 正文</span>
          <textarea data-path="detail.sections.${sectionIndex}.body">${escapeHtml(section.body || '')}</textarea>
        </label>
      </div>`;
  }

  if (section.type === 'video') {
    return `${base}
      <div class="field-grid">
        <label class="field">
          <span class="field-label">视频标题</span>
          <input value="${escapeHtml(section.title || '')}" data-path="detail.sections.${sectionIndex}.title">
        </label>
        <label class="field">
          <span class="field-label">视频替代文本</span>
          <input value="${escapeHtml(section.alt || '')}" data-path="detail.sections.${sectionIndex}.alt">
        </label>
      </div>
      <div class="field-grid single">
        ${renderUploadInput('视频地址', section.video || '', `detail.sections.${sectionIndex}.video`, '上传视频', 'video')}
        ${renderUploadInput('封面图地址', section.poster || '', `detail.sections.${sectionIndex}.poster`, '上传封面')}
        <label class="field">
          <span class="field-label">链接</span>
          <input value="${escapeHtml(section.href || '')}" data-path="detail.sections.${sectionIndex}.href">
        </label>
        <label class="field">
          <span class="field-label">说明 / 正文</span>
          <textarea data-path="detail.sections.${sectionIndex}.body">${escapeHtml(section.body || '')}</textarea>
        </label>
      </div>`;
  }

  if (section.type === 'quote') {
    return `${base}
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">引用内容</span>
          <textarea data-path="detail.sections.${sectionIndex}.quote">${escapeHtml(section.quote || '')}</textarea>
        </label>
        <label class="field">
          <span class="field-label">来源</span>
          <input value="${escapeHtml(section.source || '')}" data-path="detail.sections.${sectionIndex}.source">
        </label>
      </div>`;
  }

  if (section.type === 'gallery') {
    const items = Array.isArray(section.items) ? section.items : [];
    return `${base}
      <div class="section-toolbar">
        <button class="small" type="button" data-action="add-gallery-item" data-section-index="${sectionIndex}">添加图集项</button>
      </div>
      <div class="gallery-item-list">
        ${items.length ? items.map((item, itemIndex) => renderGalleryItemCard(item, sectionIndex, itemIndex)).join('') : '<div class="empty-state">暂时还没有图集项。</div>'}
      </div>`;
  }

  return `${base}
    <div class="field-grid single">
      <label class="field">
        <span class="field-label">正文</span>
        <textarea data-path="detail.sections.${sectionIndex}.body">${escapeHtml(section.body || '')}</textarea>
      </label>
    </div>`;
}

function renderEditor() {
  const series = currentSeries();
  if (!series) {
    els.editorRoot.innerHTML = '<div class="empty-state">尚未选择项目系列。</div>';
    return;
  }

  ensureSeriesShape(series);
  const hero = series.detail.hero || {};
  const sections = series.detail.sections || [];

  els.editorRoot.innerHTML = `
    ${renderUploadStudio(series)}
    <div class="card">
      <div class="card-head">
        <div>
          <h2>系列基础信息</h2>
          <p>用于控制列表卡片和顶层基础信息。</p>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">系列 ID</span>
          <input value="${escapeHtml(series.id || '')}" data-path="id">
        </label>
        <label class="field">
          <span class="field-label">所属分类</span>
          <select data-path="categoryId">
            ${renderCategorySelect(series)}
          </select>
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">列表眉题</span>
          <input value="${escapeHtml(series.eyebrow || '')}" data-path="eyebrow">
        </label>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">列表标题</span>
          <input value="${escapeHtml(series.title || '')}" data-path="title">
        </label>
        <div class="field">
          <span class="field-label">标签</span>
          <div class="tag-list">${renderTagEditor(series)}</div>
        </div>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">列表摘要</span>
          <textarea data-path="summary">${escapeHtml(series.summary || '')}</textarea>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>详情页头部</h2>
          <p>用于控制详情页顶部介绍区域。</p>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">详情眉题</span>
          <input value="${escapeHtml(series.detail.eyebrow || '')}" data-path="detail.eyebrow">
        </label>
        <label class="field">
          <span class="field-label">详情标题</span>
          <input value="${escapeHtml(series.detail.title || '')}" data-path="detail.title">
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">详情摘要</span>
          <textarea data-path="detail.summary">${escapeHtml(series.detail.summary || '')}</textarea>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>Hero 区块</h2>
          <p>用于配置案例详情页顶部主图和首屏文案。</p>
        </div>
        <div class="section-toolbar">
          <button class="small ghost" type="button" data-action="open-cover-editor">调整封面裁切</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Hero 标题</span>
          <input value="${escapeHtml(hero.title || '')}" data-path="detail.hero.title">
        </label>
        <label class="field">
          <span class="field-label">Hero 副标题</span>
          <input value="${escapeHtml(hero.subtitle || '')}" data-path="detail.hero.subtitle">
        </label>
      </div>
      <div class="field-grid single">
        ${renderUploadInput('Hero 图片地址', hero.image || '', 'detail.hero.image')}
        <label class="field">
          <span class="field-label">Hero 替代文本</span>
          <input value="${escapeHtml(hero.alt || '')}" data-path="detail.hero.alt">
        </label>
        <label class="field">
          <span class="field-label">Hero 链接</span>
          <input value="${escapeHtml(hero.href || '')}" data-path="detail.hero.href">
        </label>
        <div class="field-upload-hint"><strong>当前封面焦点：</strong>${escapeHtml(hero.position || series.items?.[0]?.position || '50.0% 50.0%')}。点击“调整封面裁切”后，可像 Dribbble 一样指定封面视觉中心。</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>详情内容区块</h2>
          <p>逐个区块搭建这个案例的长页叙事结构。</p>
        </div>
        <div class="section-toolbar">
          ${SECTION_TYPES.map((type) => `<button class="small" type="button" data-action="add-section" data-section-type="${type}">添加${sectionTypeLabel(type)}</button>`).join('')}
        </div>
      </div>
      <div class="section-list">
        ${sections.length ? sections.map((section, sectionIndex) => `
          <div class="section-item">
            <div class="card-head">
              <div>
                <div class="section-badge">${sectionTypeLabel(section.type)}</div>
                <div class="card-meta">区块 ${sectionIndex + 1}</div>
              </div>
              <div class="section-toolbar">
                <button class="small ghost" type="button" data-action="move-section-up" data-section-index="${sectionIndex}">上移</button>
                <button class="small ghost" type="button" data-action="move-section-down" data-section-index="${sectionIndex}">下移</button>
                <button class="small danger" type="button" data-action="remove-section" data-section-index="${sectionIndex}">删除</button>
              </div>
            </div>
            ${renderSectionFields(section, sectionIndex)}
          </div>`).join('') : '<div class="empty-state">暂时还没有内容区块，先添加一个开始搭建案例结构。</div>'}
      </div>
    </div>`;
}

function renderParagraphs(text) {
  const content = String(text || '').trim();
  if (!content) return '';
  return content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderPreviewSection(section) {
  const label = section.label ? `<div class="preview-section-label">${escapeHtml(section.label)}</div>` : '';
  const heading = section.heading ? `<div class="preview-section-heading">${escapeHtml(section.heading)}</div>` : '';
  const summary = section.summary ? `<div class="preview-section-summary">${escapeHtml(section.summary)}</div>` : '';
  const head = label || heading || summary ? `<div>${label}${heading}${summary}</div>` : '';

  if (section.type === 'image') {
    return `
      <section class="preview-section">
        ${head}
        <div class="preview-image-media">${section.image ? `<img src="${section.image}" alt="${escapeHtml(section.alt || section.title || section.heading || '项目图片')}"${mediaStyleAttr(section.position)}>` : ''}</div>
        <div class="preview-image-copy">
          ${section.title ? `<strong>${escapeHtml(section.title)}</strong>` : ''}
          ${renderParagraphs(section.body)}
        </div>
      </section>`;
  }

  if (section.type === 'gallery') {
    const items = Array.isArray(section.items) ? section.items : [];
    return `
      <section class="preview-section">
        ${head}
        <div class="preview-gallery">
          ${items.map((item) => `
            <article class="preview-gallery-card">
              <div class="preview-gallery-media">${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.alt || item.title || '图集图片')}"${mediaStyleAttr(item.position)}>` : ''}</div>
              <div class="preview-gallery-title">${escapeHtml(item.title || '未命名')}</div>
              <div class="preview-gallery-caption">${escapeHtml(item.meta || '')}</div>
            </article>`).join('')}
        </div>
      </section>`;
  }

  if (section.type === 'video') {
    return `
      <section class="preview-section">
        ${head}
        <div class="preview-image-media">${section.video ? `<video src="${section.video}" poster="${section.poster || ''}" controls muted loop playsinline preload="metadata"></video>` : ''}</div>
        <div class="preview-image-copy">
          ${section.title ? `<strong>${escapeHtml(section.title)}</strong>` : ''}
          ${renderParagraphs(section.body)}
        </div>
      </section>`;
  }

  if (section.type === 'quote') {
    return `
      <section class="preview-section">
        ${head}
        <blockquote class="preview-quote">${escapeHtml(section.quote || '')}</blockquote>
        ${section.source ? `<div class="preview-quote-source">${escapeHtml(section.source)}</div>` : ''}
      </section>`;
  }

  return `
    <section class="preview-section">
      ${head}
      <div class="preview-text">${renderParagraphs(section.body)}</div>
    </section>`;
}

function renderPreview() {
  const series = currentSeries();
  if (!series) {
    els.previewRoot.innerHTML = '<div class="empty-state">尚未选择用于预览的项目系列。</div>';
    return;
  }

  ensureSeriesShape(series);
  const detail = series.detail || {};
  const hero = detail.hero || {};
  const sections = detail.sections || [];

  els.previewRoot.innerHTML = `
    <div class="preview-topbar">
      <div class="preview-back">返回系列列表</div>
      <div class="preview-meta">
        <span class="preview-tag">${series.items?.length || 0} 个作品</span>
      </div>
    </div>
    <div>
      <div class="preview-kicker">${escapeHtml(detail.eyebrow || series.eyebrow || '')}</div>
      <h2 class="preview-title">${escapeHtml(detail.title || series.title || '未命名')}</h2>
      <p class="preview-summary">${escapeHtml(detail.summary || series.summary || '')}</p>
      <div class="preview-tags">${(series.tags || []).map((tag) => `<span class="preview-tag">${escapeHtml(tagLabel(tag))}</span>`).join('')}</div>
    </div>
    <article class="preview-hero">
      <div class="preview-hero-media">${hero.image ? `<img src="${hero.image}" alt="${escapeHtml(hero.alt || hero.title || series.title || 'Hero 图片')}"${mediaStyleAttr(hero.position || series.items?.[0]?.position || '')}>` : ''}</div>
      <div class="preview-hero-title">${escapeHtml(hero.title || detail.title || series.title || '')}</div>
      <div class="preview-subtitle">${escapeHtml(hero.subtitle || '')}</div>
    </article>
    <div class="preview-sections">${sections.map(renderPreviewSection).join('')}</div>`;
}

function render() {
  renderHeader();
  renderSeriesSelect();
  renderEditor();
  renderPreview();
  updateFileNote();
  syncCoverEditorUI();
}

function handleSeriesSelectChange() {
  state.selectedSeriesId = els.seriesSelect.value;
  state.studioUploads.forEach(releaseStudioUploadPreview);
  state.studioUploads = [];
  closeCoverEditor();
  clearStudioDragState();
  history.replaceState({}, '', `?id=${encodeURIComponent(state.selectedSeriesId)}`);
  render();
}

function updateCurrentSeries(path, value) {
  const series = currentSeries();
  if (!series) return;
  ensureSeriesShape(series);
  const previousId = series.id;
  setValueByPath(series, path, value);
  if (path === 'id' && previousId !== value) {
    state.selectedSeriesId = value;
    history.replaceState({}, '', `?id=${encodeURIComponent(value)}`);
  }
  setDirty(true);
  setStatus('有未保存的更改', '');
}

function handleEditorInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  const path = target.dataset.path;
  if (!path) return;

  updateCurrentSeries(path, target.value);

  if (path.endsWith('.type')) {
    const series = currentSeries();
    const sectionIndex = Number(path.split('.')[2]);
    const previous = series.detail.sections[sectionIndex];
    series.detail.sections[sectionIndex] = {
      ...createSectionTemplate(target.value),
      id: previous.id || `section-${sectionIndex + 1}`,
      label: previous.label || '',
      heading: previous.heading || '',
      summary: previous.summary || ''
    };
  }

  render();
}

function handleTagChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.tag) return;
  const series = currentSeries();
  if (!series) return;
  const nextTags = new Set(series.tags || []);
  if (target.checked) nextTags.add(target.dataset.tag);
  else nextTags.delete(target.dataset.tag);
  series.tags = [...nextTags];
  setDirty(true);
  setStatus('有未保存的更改', '');
  render();
}

function handleActionClick(event) {
  const button = event.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  if (!action) return;

  const series = currentSeries();
  if (!series) return;
  ensureSeriesShape(series);
  const sectionIndex = Number(button.dataset.sectionIndex);
  const itemIndex = Number(button.dataset.itemIndex);

  if (action === 'upload-media') {
    pickAndUploadMedia(button.dataset.path, button.dataset.kind).catch((error) => setStatus(error.message, 'error'));
    return;
  }
  if (action === 'studio-pick-files') {
    pickStudioFiles(button.dataset.kind || 'image').catch((error) => setStatus(error.message, 'error'));
    return;
  }
  if (action === 'studio-set-hero') {
    setStudioAssetAsHero(button.dataset.uploadId);
    return;
  }
  if (action === 'studio-open-cover-editor') {
    openCoverEditor(button.dataset.uploadId);
    return;
  }
  if (action === 'studio-add-gallery') {
    addStudioAssetToGallery(button.dataset.uploadId);
    return;
  }
  if (action === 'studio-batch-gallery') {
    addStudioQueueToGallery();
    return;
  }
  if (action === 'studio-batch-sections') {
    createSectionsFromQueue();
    return;
  }
  if (action === 'open-cover-editor') {
    openCoverEditor();
    return;
  }
  if (action === 'studio-create-image-section') {
    createSectionFromStudioAsset(button.dataset.uploadId, 'image');
    return;
  }
  if (action === 'studio-create-video-section') {
    createSectionFromStudioAsset(button.dataset.uploadId, 'video');
    return;
  }
  if (action === 'studio-remove-upload') {
    removeStudioUpload(button.dataset.uploadId);
    render();
    return;
  }
  if (action === 'add-section') {
    series.detail.sections.push(createSectionTemplate(button.dataset.sectionType));
  }
  if (action === 'remove-section') {
    series.detail.sections.splice(sectionIndex, 1);
  }
  if (action === 'move-section-up') {
    moveItem(series.detail.sections, sectionIndex, sectionIndex - 1);
  }
  if (action === 'move-section-down') {
    moveItem(series.detail.sections, sectionIndex, sectionIndex + 1);
  }
  if (action === 'add-gallery-item') {
    const section = series.detail.sections[sectionIndex];
    if (!Array.isArray(section.items)) section.items = [];
    section.items.push(createGalleryItemTemplate());
  }
  if (action === 'remove-gallery-item') {
    series.detail.sections[sectionIndex].items.splice(itemIndex, 1);
  }
  if (action === 'move-gallery-item-up') {
    moveItem(series.detail.sections[sectionIndex].items, itemIndex, itemIndex - 1);
  }
  if (action === 'move-gallery-item-down') {
    moveItem(series.detail.sections[sectionIndex].items, itemIndex, itemIndex + 1);
  }

  setDirty(true);
  setStatus('有未保存的更改', '');
  render();
}

function getUploadDropTarget(target) {
  return target instanceof Element ? target.closest('.field-upload-drop') : null;
}

function getStudioDropzone(target) {
  return target instanceof Element ? target.closest('[data-studio-dropzone="true"]') : null;
}

function clearDragState(dropTarget) {
  if (dropTarget) {
    dropTarget.classList.remove('is-dragover');
  }
}

function handleUploadDragEnter(event) {
  const studioDropzone = getStudioDropzone(event.target);
  if (studioDropzone) {
    event.preventDefault();
    studioDropzone.classList.add('is-dragover');
  }
  const dropTarget = getUploadDropTarget(event.target);
  if (!dropTarget) return;
  event.preventDefault();
  dropTarget.classList.add('is-dragover');
}

function handleUploadDragOver(event) {
  const studioDropzone = getStudioDropzone(event.target);
  if (studioDropzone) {
    event.preventDefault();
    studioDropzone.classList.add('is-dragover');
  }
  const dropTarget = getUploadDropTarget(event.target);
  if (!dropTarget) return;
  event.preventDefault();
  dropTarget.classList.add('is-dragover');
}

function handleUploadDragLeave(event) {
  const studioDropzone = getStudioDropzone(event.target);
  if (studioDropzone) {
    const related = event.relatedTarget;
    if (!(related instanceof Node) || !studioDropzone.contains(related)) {
      clearDragState(studioDropzone);
    }
  }
  const dropTarget = getUploadDropTarget(event.target);
  if (!dropTarget) return;
  const related = event.relatedTarget;
  if (related instanceof Node && dropTarget.contains(related)) return;
  clearDragState(dropTarget);
}

function handleUploadDrop(event) {
  const studioDropzone = getStudioDropzone(event.target);
  if (studioDropzone) {
    event.preventDefault();
    clearDragState(studioDropzone);
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    const imageFiles = files.filter((file) => isAcceptedFile(file, 'image'));
    const videoFiles = files.filter((file) => isAcceptedFile(file, 'video'));
    queueStudioFiles(imageFiles, 'image')
      .then(() => queueStudioFiles(videoFiles, 'video'))
      .catch((error) => setStatus(error.message, 'error'));
    return;
  }
  const dropTarget = getUploadDropTarget(event.target);
  if (!dropTarget) return;
  event.preventDefault();
  clearDragState(dropTarget);
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  uploadMediaFile(dropTarget.dataset.uploadPath, file, dropTarget.dataset.uploadKind)
    .catch((error) => setStatus(error.message, 'error'));
}

function getStudioUploadCard(target) {
  return target instanceof Element ? target.closest('.upload-asset-card[data-upload-id]') : null;
}

function handleStudioCardDragStart(event) {
  const card = getStudioUploadCard(event.target);
  if (!card) return;
  state.draggingStudioUploadId = card.dataset.uploadId;
  card.classList.add('is-sorting');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.draggingStudioUploadId);
  }
}

function handleStudioCardDragOver(event) {
  const card = getStudioUploadCard(event.target);
  if (!card || !state.draggingStudioUploadId || card.dataset.uploadId === state.draggingStudioUploadId) return;
  event.preventDefault();
  card.classList.add('is-drop-target');
}

function handleStudioCardDragLeave(event) {
  const card = getStudioUploadCard(event.target);
  if (!card) return;
  const related = event.relatedTarget;
  if (related instanceof Node && card.contains(related)) return;
  card.classList.remove('is-drop-target');
}

function handleStudioCardDrop(event) {
  const card = getStudioUploadCard(event.target);
  if (!card || !state.draggingStudioUploadId) return;
  event.preventDefault();
  card.classList.remove('is-drop-target');
  reorderStudioUploads(state.draggingStudioUploadId, card.dataset.uploadId);
  state.draggingStudioUploadId = null;
  setStatus('上传队列顺序已更新。', 'success');
  render();
}

function clearStudioDragState() {
  state.draggingStudioUploadId = null;
  els.editorRoot.querySelectorAll('.upload-asset-card').forEach((card) => {
    card.classList.remove('is-sorting', 'is-drop-target');
  });
}

function handleCoverStagePointer(event) {
  if (!state.coverEditor.open || !els.coverEditorStage) return;
  const rect = els.coverEditorStage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  updateCoverEditorPosition(x, y);
}

function handleCoverRangeInput() {
  updateCoverEditorPosition(Number(els.coverEditorX.value), Number(els.coverEditorY.value));
}

async function init() {
  try {
    await loadPayload();
    setStatus('作品内容已加载。', 'success');
  } catch (error) {
    els.editorRoot.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    els.previewRoot.innerHTML = '<div class="empty-state">预览暂时不可用。</div>';
    setStatus(error.message, 'error');
    return;
  }

  els.seriesSelect.addEventListener('change', handleSeriesSelectChange);
  els.bindFileButton.addEventListener('click', () => bindFileHandle().catch((error) => setStatus(error.message, 'error')));
  els.bindAssetButton.addEventListener('click', () => bindAssetDirectory().catch((error) => setStatus(error.message, 'error')));
  els.saveButton.addEventListener('click', () => savePayload().catch((error) => setStatus(error.message, 'error')));
  els.reloadButton.addEventListener('click', () => loadPayload().then(() => setStatus('内容文件已重新加载。', 'success')).catch((error) => setStatus(error.message, 'error')));
  els.downloadButton.addEventListener('click', () => {
    downloadPayload();
    setStatus('当前 JSON 快照已下载。', 'success');
  });
  els.editorRoot.addEventListener('input', handleEditorInput);
  els.editorRoot.addEventListener('change', handleTagChange);
  els.editorRoot.addEventListener('click', handleActionClick);
  els.editorRoot.addEventListener('dragenter', handleUploadDragEnter);
  els.editorRoot.addEventListener('dragover', handleUploadDragOver);
  els.editorRoot.addEventListener('dragleave', handleUploadDragLeave);
  els.editorRoot.addEventListener('drop', handleUploadDrop);
  els.editorRoot.addEventListener('dragstart', handleStudioCardDragStart);
  els.editorRoot.addEventListener('dragover', handleStudioCardDragOver);
  els.editorRoot.addEventListener('dragleave', handleStudioCardDragLeave);
  els.editorRoot.addEventListener('drop', handleStudioCardDrop);
  els.editorRoot.addEventListener('dragend', clearStudioDragState);

  els.coverEditorStage?.addEventListener('click', handleCoverStagePointer);
  els.coverEditorX?.addEventListener('input', handleCoverRangeInput);
  els.coverEditorY?.addEventListener('input', handleCoverRangeInput);
  els.coverEditorCancel?.addEventListener('click', closeCoverEditor);
  els.coverEditorApply?.addEventListener('click', applyCoverEditor);
  els.coverEditorBackdrop?.addEventListener('click', (event) => {
    if (event.target === els.coverEditorBackdrop) {
      closeCoverEditor();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.coverEditor.open) {
      closeCoverEditor();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

init();
