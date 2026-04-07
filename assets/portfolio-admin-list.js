const dataUrl = './data/portfolio-content.json';
const contentSyncKey = 'zeno-portfolio-content-sync';
const contentSyncChannelName = 'zeno-portfolio-content-sync';

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

const els = {
  seriesGrid: document.getElementById('seriesGrid'),
  searchInput: document.getElementById('searchInput'),
  resultMeta: document.getElementById('resultMeta'),
  heroStats: document.getElementById('heroStats'),
  bindFileButton: document.getElementById('bindFileButton'),
  saveButton: document.getElementById('saveButton'),
  reloadButton: document.getElementById('reloadButton'),
  statusNote: document.getElementById('statusNote'),
  fileNote: document.getElementById('fileNote'),
  categoryNameInput: document.getElementById('categoryNameInput'),
  categoryDescriptionInput: document.getElementById('categoryDescriptionInput'),
  addCategoryButton: document.getElementById('addCategoryButton'),
  newSeriesTitleInput: document.getElementById('newSeriesTitleInput'),
  newSeriesCategorySelect: document.getElementById('newSeriesCategorySelect'),
  addSeriesButton: document.getElementById('addSeriesButton')
};

let payload = null;
let fileHandle = null;
let dirty = false;
const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel(contentSyncChannelName) : null;

const ui = {
  categories: '分类',
  sections: '内容区块',
  works: '作品目录',
  visibleSeries: '个作品目录可见',
  bindFile: '绑定内容文件',
  openEditor: '打开编辑器',
  openLiveDetail: '打开前台详情',
  noSeriesMatched: '当前筛选下暂时没有作品目录。',
  noCategoryWorks: '这个分类下还没有作品目录，先新建一个吧。',
  loadFailed: '无法加载作品内容：',
  saveSuccess: '分类与作品目录已保存到内容文件。',
  saveDownloaded: '当前内容已导出为新的 JSON 文件。',
  unsaved: '有未保存的结构调整',
  fileBound: '已绑定本地内容文件。现在可以直接保存分类和作品目录结构。',
  fileUnbound: '尚未绑定本地内容文件。未绑定时保存会下载新的 JSON 文件。',
  categoryCreated: '新分类已创建，可以继续在这个分类里添加作品目录。',
  seriesCreated: '新作品目录已创建，已经准备好进入编辑页补内容。',
  rename: '重命名',
  remove: '删除',
  systemCategoryLocked: '系统分类会直接映射前台 Tab，当前先不支持在 OMS 中删除或重命名。',
  categoryDeleteBlocked: '这个分类下还有作品目录，请先移动或删除这些作品目录。',
  categoryRenamed: '分类名称已更新。',
  categoryRemoved: '分类已删除。',
  seriesRenamed: '作品目录名称已更新。',
  seriesRemoved: '作品目录已删除。'
};

function cloneDefaultCategories() {
  return DEFAULT_CATEGORIES.map((category) => ({
    ...category,
    defaultTags: [...(category.defaultTags || [])]
  }));
}

function seriesList() {
  return Array.isArray(payload?.series) ? payload.series : [];
}

function categoriesList() {
  return Array.isArray(payload?.categories) ? payload.categories : [];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base, existingIds) {
  const seed = slugify(base) || 'item';
  let candidate = seed;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${seed}-${index}`;
    index += 1;
  }
  return candidate;
}

function inferCategoryId(series) {
  if (series.categoryId) return series.categoryId;
  const tags = Array.isArray(series.tags) ? series.tags : [];
  if (tags.includes('keyboard')) return 'keyboard';
  if (tags.includes('game')) return 'game';
  if (tags.includes('product')) return 'work';
  return 'explore';
}

function ensurePayloadShape(nextPayload) {
  if (!nextPayload || typeof nextPayload !== 'object') {
    nextPayload = {};
  }

  if (!Array.isArray(nextPayload.series)) {
    nextPayload.series = [];
  }

  const defaults = cloneDefaultCategories();
  const incomingCategories = Array.isArray(nextPayload.categories) ? nextPayload.categories : [];
  const mergedCategories = incomingCategories.map((category) => ({
    id: category.id,
    label: category.label || category.id,
    description: category.description || '',
    defaultTags: Array.isArray(category.defaultTags) ? [...category.defaultTags] : []
  }));

  defaults.forEach((category) => {
    if (!mergedCategories.some((item) => item.id === category.id)) {
      mergedCategories.push(category);
    }
  });

  nextPayload.categories = mergedCategories;

  nextPayload.series = nextPayload.series.map((series) => {
    const categoryId = inferCategoryId(series);
    return {
      ...series,
      categoryId,
      tags: Array.isArray(series.tags) ? series.tags : [],
      items: Array.isArray(series.items) ? series.items : [],
      detail: {
        eyebrow: series.detail?.eyebrow || '',
        title: series.detail?.title || series.title || '',
        summary: series.detail?.summary || series.summary || '',
        hero: series.detail?.hero || {},
        sections: Array.isArray(series.detail?.sections) ? series.detail.sections : []
      }
    };
  });

  return nextPayload;
}

function serializePayload() {
  const nextPayload = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  return `${JSON.stringify(nextPayload, null, 2)}\n`;
}

function setStatus(message, tone = '') {
  els.statusNote.textContent = message || '';
  els.statusNote.dataset.tone = tone;
}

function setDirty(nextDirty = true) {
  dirty = nextDirty;
  document.title = `${dirty ? '* ' : ''}Zeno 作品集内容后台`;
}

function updateFileNote() {
  els.fileNote.textContent = fileHandle ? ui.fileBound : ui.fileUnbound;
}

async function readPayloadFromHandle(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

async function loadPayload() {
  if (fileHandle) {
    payload = ensurePayloadShape(await readPayloadFromHandle(fileHandle));
    render();
    return;
  }

  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${ui.loadFailed}${response.status}`);
  }

  payload = ensurePayloadShape(await response.json());
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

  fileHandle = handle;
  payload = ensurePayloadShape(await readPayloadFromHandle(handle));
  updateFileNote();
  render();
  setStatus('内容文件绑定成功。', 'success');
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
  if (!payload) return;

  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(serializePayload());
    await writable.close();
    publishContentSync();
    setDirty(false);
    setStatus(ui.saveSuccess, 'success');
    return;
  }

  downloadPayload();
  setDirty(false);
  setStatus(ui.saveDownloaded, 'success');
}

function categoryById(categoryId) {
  return categoriesList().find((category) => category.id === categoryId) || null;
}

function isSystemCategory(categoryId) {
  return DEFAULT_CATEGORIES.some((category) => category.id === categoryId);
}

function seriesByCategory(categoryId) {
  return seriesList().filter((series) => series.categoryId === categoryId);
}

function defaultTagsForCategory(categoryId) {
  return [...(categoryById(categoryId)?.defaultTags || [])];
}

function matchesQuery(series, query) {
  if (!query) return true;
  const category = categoryById(series.categoryId);
  const haystack = [
    series.title,
    series.eyebrow,
    series.summary,
    category?.label,
    category?.description,
    ...(series.tags || [])
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function renderStats(series) {
  const sectionCount = series.reduce((sum, item) => sum + (item.detail?.sections?.length || 0), 0);
  els.heroStats.innerHTML = `
    <div class="stat"><strong>${categoriesList().length}</strong><span>${ui.categories}</span></div>
    <div class="stat"><strong>${series.length}</strong><span>${ui.works}</span></div>
    <div class="stat"><strong>${sectionCount}</strong><span>${ui.sections}</span></div>`;
}

function renderCategoryOptions(selectedId = '') {
  els.newSeriesCategorySelect.innerHTML = categoriesList().map((category) => `
    <option value="${escapeHtml(category.id)}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(category.label)}</option>
  `).join('');
}

function renderSeriesCard(series) {
  const cover = series.detail?.hero || series.items?.[0] || {};
  const category = categoryById(series.categoryId);
  return `
    <article class="series-card">
      <div class="series-cover">
        ${cover.image ? `<img src="${escapeHtml(cover.image)}" alt="${escapeHtml(cover.alt || cover.title || series.title)}">` : ''}
      </div>
      <div>
        <div class="series-kicker">${escapeHtml(category?.label || series.detail?.eyebrow || series.eyebrow || ui.works)}</div>
        <div class="series-title">${escapeHtml(series.detail?.title || series.title)}</div>
      </div>
      <div class="series-summary">${escapeHtml(series.detail?.summary || series.summary || '这是一个待补充内容的作品目录。')}</div>
      <div class="series-meta">
        <span class="meta-chip">${series.items?.length || 0} 项素材</span>
        <span class="meta-chip">${series.detail?.sections?.length || 0} ${ui.sections}</span>
      </div>
      <div class="series-tags">
        ${(series.tags || []).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="series-actions">
        <a class="button primary" href="./admin-edit.html?id=${encodeURIComponent(series.id)}">${ui.openEditor}</a>
        <a class="button" href="./index.html#series/${encodeURIComponent(series.id)}" target="_blank" rel="noopener">${ui.openLiveDetail}</a>
        <button class="button" type="button" data-action="rename-series" data-series-id="${escapeHtml(series.id)}">${ui.rename}</button>
        <button class="button danger" type="button" data-action="delete-series" data-series-id="${escapeHtml(series.id)}">${ui.remove}</button>
      </div>
    </article>`;
}

function renderCategories() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = seriesList().filter((series) => matchesQuery(series, query));
  els.resultMeta.textContent = `${filtered.length} ${ui.visibleSeries}`;

  const grouped = new Map(categoriesList().map((category) => [category.id, []]));
  filtered.forEach((series) => {
    const bucket = grouped.get(series.categoryId) || [];
    bucket.push(series);
    grouped.set(series.categoryId, bucket);
  });

  els.seriesGrid.innerHTML = categoriesList().map((category) => {
    const works = grouped.get(category.id) || [];
    return `
      <section class="category-section">
        <div class="category-head">
          <div>
            <div class="category-kicker">分类目录</div>
            <h2>${escapeHtml(category.label)}</h2>
            <p>${escapeHtml(category.description || '这个分类下的作品目录会统一管理在这里。')}</p>
          </div>
          <div class="category-actions">
            <span class="meta-chip">${works.length} 个目录</span>
            <button class="button" type="button" data-action="prefill-category" data-category-id="${escapeHtml(category.id)}">在此分类新建作品</button>
            <button class="button" type="button" data-action="rename-category" data-category-id="${escapeHtml(category.id)}">${ui.rename}</button>
            <button class="button danger" type="button" data-action="delete-category" data-category-id="${escapeHtml(category.id)}">${ui.remove}</button>
          </div>
        </div>
        <div class="series-grid">
          ${works.length ? works.map(renderSeriesCard).join('') : `<div class="empty">${ui.noCategoryWorks}</div>`}
        </div>
      </section>`;
  }).join('');
}

function render() {
  if (!payload) return;
  renderStats(seriesList());
  renderCategoryOptions(els.newSeriesCategorySelect.value || categoriesList()[0]?.id || '');
  renderCategories();
  updateFileNote();
}

function createCategory() {
  const label = els.categoryNameInput.value.trim();
  const description = els.categoryDescriptionInput.value.trim();
  if (!label) {
    setStatus('请先输入分类名称。', 'error');
    return;
  }

  const existingIds = new Set(categoriesList().map((category) => category.id));
  const nextId = uniqueId(label, existingIds);
  payload.categories.push({
    id: nextId,
    label,
    description,
    defaultTags: []
  });

  els.categoryNameInput.value = '';
  els.categoryDescriptionInput.value = '';
  setDirty(true);
  setStatus(ui.categoryCreated, 'success');
  render();
  els.newSeriesCategorySelect.value = nextId;
}

function createSeriesTemplate(title, categoryId) {
  const category = categoryById(categoryId);
  const existingIds = new Set(seriesList().map((series) => series.id));
  const nextId = uniqueId(title, existingIds);
  const defaultTags = defaultTagsForCategory(categoryId);
  const eyebrow = category?.label ? `${category.label} Archive` : 'Project Archive';
  const summary = `${title} 的作品目录已经创建，可以继续上传封面、图集和案例内容。`;

  return {
    id: nextId,
    categoryId,
    title,
    eyebrow,
    summary,
    tags: defaultTags,
    items: [],
    detail: {
      eyebrow,
      title,
      summary,
      hero: {
        title,
        subtitle: '',
        image: '',
        alt: '',
        href: ''
      },
      sections: [
        {
          id: `${nextId}-overview`,
          type: 'text',
          label: 'Overview',
          heading: `${title} overview`,
          summary: 'A lightweight shell prepared for future uploads.',
          body: 'This project directory is ready for cover images, detailed sections, and supporting media. Continue editing it in the CMS editor.'
        }
      ]
    }
  };
}

function createSeries() {
  const title = els.newSeriesTitleInput.value.trim();
  const categoryId = els.newSeriesCategorySelect.value;
  if (!title) {
    setStatus('请先输入作品目录名称。', 'error');
    return;
  }
  if (!categoryById(categoryId)) {
    setStatus('请先选择一个有效分类。', 'error');
    return;
  }

  const nextSeries = createSeriesTemplate(title, categoryId);
  payload.series.unshift(nextSeries);
  els.newSeriesTitleInput.value = '';
  setDirty(true);
  setStatus(ui.seriesCreated, 'success');
  render();
}

function renameCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return;
  if (isSystemCategory(categoryId)) {
    setStatus(ui.systemCategoryLocked, 'error');
    return;
  }

  const nextLabel = window.prompt('输入新的分类名称', category.label || '');
  if (nextLabel === null) return;
  const trimmed = nextLabel.trim();
  if (!trimmed) {
    setStatus('分类名称不能为空。', 'error');
    return;
  }

  const nextDescription = window.prompt('输入新的分类说明（可选）', category.description || '');
  if (nextDescription === null) return;

  category.label = trimmed;
  category.description = nextDescription.trim();
  setDirty(true);
  setStatus(ui.categoryRenamed, 'success');
  render();
}

function deleteCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return;
  if (isSystemCategory(categoryId)) {
    setStatus(ui.systemCategoryLocked, 'error');
    return;
  }
  if (seriesByCategory(categoryId).length) {
    setStatus(ui.categoryDeleteBlocked, 'error');
    return;
  }
  if (!window.confirm(`确定删除分类“${category.label}”吗？`)) return;

  payload.categories = categoriesList().filter((item) => item.id !== categoryId);
  setDirty(true);
  setStatus(ui.categoryRemoved, 'success');
  render();
}

function renameSeries(seriesId) {
  const series = seriesList().find((item) => item.id === seriesId);
  if (!series) return;

  const nextTitle = window.prompt('输入新的作品目录名称', series.title || '');
  if (nextTitle === null) return;
  const trimmed = nextTitle.trim();
  if (!trimmed) {
    setStatus('作品目录名称不能为空。', 'error');
    return;
  }

  series.title = trimmed;
  if (series.detail?.title) {
    series.detail.title = trimmed;
  }
  if (series.detail?.hero?.title) {
    series.detail.hero.title = trimmed;
  }
  setDirty(true);
  setStatus(ui.seriesRenamed, 'success');
  render();
}

function deleteSeries(seriesId) {
  const series = seriesList().find((item) => item.id === seriesId);
  if (!series) return;
  if (!window.confirm(`确定删除作品目录“${series.title}”吗？`)) return;

  payload.series = seriesList().filter((item) => item.id !== seriesId);
  setDirty(true);
  setStatus(ui.seriesRemoved, 'success');
  render();
}

function handleGridClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  if (button.dataset.action === 'prefill-category') {
    els.newSeriesCategorySelect.value = button.dataset.categoryId || '';
    els.newSeriesTitleInput.focus();
    setStatus('已切换到对应分类，现在可以直接输入作品目录名称。', '');
    return;
  }

  if (button.dataset.action === 'rename-category') {
    renameCategory(button.dataset.categoryId || '');
    return;
  }

  if (button.dataset.action === 'delete-category') {
    deleteCategory(button.dataset.categoryId || '');
    return;
  }

  if (button.dataset.action === 'rename-series') {
    renameSeries(button.dataset.seriesId || '');
    return;
  }

  if (button.dataset.action === 'delete-series') {
    deleteSeries(button.dataset.seriesId || '');
  }
}

async function init() {
  try {
    await loadPayload();
    setStatus('作品内容已加载。', 'success');
  } catch (error) {
    els.seriesGrid.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, 'error');
    return;
  }

  els.searchInput.addEventListener('input', renderCategories);
  els.bindFileButton.addEventListener('click', () => bindFileHandle().catch((error) => setStatus(error.message, 'error')));
  els.saveButton.addEventListener('click', () => savePayload().catch((error) => setStatus(error.message, 'error')));
  els.reloadButton.addEventListener('click', () => loadPayload().then(() => setStatus('内容文件已重新加载。', 'success')).catch((error) => setStatus(error.message, 'error')));
  els.addCategoryButton.addEventListener('click', createCategory);
  els.addSeriesButton.addEventListener('click', createSeries);
  els.seriesGrid.addEventListener('click', handleGridClick);

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

init();
