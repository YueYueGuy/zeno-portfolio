const dataUrl = './data/portfolio-content.json';

const state = {
  payload: null,
  selectedSeriesId: null,
  fileHandle: null,
  dirty: false
};

const els = {
  seriesList: document.getElementById('seriesList'),
  editorRoot: document.getElementById('editorRoot'),
  editorTitle: document.getElementById('editorTitle'),
  editorSubtitle: document.getElementById('editorSubtitle'),
  statusBar: document.getElementById('statusBar'),
  bindFileButton: document.getElementById('bindFileButton'),
  reloadButton: document.getElementById('reloadButton'),
  saveButton: document.getElementById('saveButton'),
  downloadButton: document.getElementById('downloadButton'),
  seriesCount: document.getElementById('seriesCount'),
  fileBoundNote: document.getElementById('fileBoundNote')
};

const TAG_OPTIONS = ['product', 'web', 'mobile', 'brand'];
const SECTION_TYPES = ['text', 'image', 'gallery', 'quote'];

function setStatus(message, tone = '') {
  els.statusBar.textContent = message || '';
  els.statusBar.dataset.tone = tone;
}

function markDirty(nextDirty = true) {
  state.dirty = nextDirty;
  document.title = `${nextDirty ? '* ' : ''}Zeno Portfolio Content Admin`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getSeriesList() {
  return Array.isArray(state.payload?.series) ? state.payload.series : [];
}

function getSelectedSeries() {
  return getSeriesList().find((entry) => entry.id === state.selectedSeriesId) || null;
}

async function loadPayload() {
  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load content file: ${response.status}`);
  }

  state.payload = await response.json();
  const series = getSeriesList();
  if (!series.length) {
    state.selectedSeriesId = null;
  } else if (!series.some((entry) => entry.id === state.selectedSeriesId)) {
    state.selectedSeriesId = series[0].id;
  }

  els.seriesCount.textContent = String(series.length);
  markDirty(false);
  render();
}

function updateFileBoundNote() {
  els.fileBoundNote.textContent = state.fileHandle
    ? 'Bound to a local file handle. Save changes will write directly to portfolio-content.json.'
    : 'No file handle bound yet. Save uses download fallback until you bind the JSON file.';
}

async function bindFileHandle() {
  if (!window.showOpenFilePicker) {
    throw new Error('File System Access API is not available in this browser.');
  }

  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'Portfolio content JSON',
        accept: { 'application/json': ['.json'] }
      }
    ],
    multiple: false,
    excludeAcceptAllOption: true
  });

  state.fileHandle = handle;
  updateFileBoundNote();
  setStatus('Content file bound successfully.', 'success');
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

async function savePayload() {
  if (!state.payload) return;

  state.payload.updatedAt = new Date().toISOString();

  if (state.fileHandle) {
    const writable = await state.fileHandle.createWritable();
    await writable.write(serializePayload());
    await writable.close();
    markDirty(false);
    renderSidebar();
    setStatus('Changes saved to portfolio-content.json.', 'success');
    return;
  }

  downloadPayload();
  markDirty(false);
  renderSidebar();
  setStatus('Downloaded updated JSON. Bind the file if you want one-click save next time.', 'success');
}

function ensureDetail(series) {
  if (!series.detail) series.detail = {};
  if (!Array.isArray(series.detail.sections)) series.detail.sections = [];
  if (!series.detail.hero) series.detail.hero = {};
  if (!Array.isArray(series.items)) series.items = [];
}

function inputField({ label, value = '', path, textarea = false, placeholder = '' }) {
  const tag = textarea ? 'textarea' : 'input';
  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <${tag} data-path="${path}" placeholder="${placeholder}">${textarea ? escapeHtml(value) : ''}</${tag}>${textarea ? '' : ''}
    </label>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSidebar() {
  const series = getSeriesList();
  els.seriesList.innerHTML = series.length
    ? series.map((entry) => `
        <button class="series-card ${entry.id === state.selectedSeriesId ? 'active' : ''}" type="button" data-select-series="${entry.id}">
          <div class="series-card-title">${entry.title}</div>
          <div class="series-meta">${entry.eyebrow || 'No eyebrow'} · ${Array.isArray(entry.tags) ? entry.tags.join(', ') : 'No tags'}</div>
        </button>`).join('')
    : '<div class="empty-note">No series loaded.</div>';
}

function renderTagEditor(series) {
  return `
    <div class="tag-list">
      ${TAG_OPTIONS.map((tag) => `
        <label class="tag-chip">
          <input type="checkbox" data-tag="${tag}" ${Array.isArray(series.tags) && series.tags.includes(tag) ? 'checked' : ''}>
          <span>${tag}</span>
        </label>`).join('')}
    </div>`;
}

function renderGalleryItemCard(item, sectionIndex, itemIndex) {
  return `
    <div class="gallery-item-card" data-gallery-item-index="${itemIndex}">
      <div class="gallery-item-head">
        <strong>Gallery item ${itemIndex + 1}</strong>
        <div class="item-toolbar">
          <button class="small ghost" type="button" data-action="move-gallery-item-up" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">Up</button>
          <button class="small ghost" type="button" data-action="move-gallery-item-down" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">Down</button>
          <button class="small danger" type="button" data-action="remove-gallery-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">Delete</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Title</span>
          <input value="${escapeHtml(item.title || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.title">
        </label>
        <label class="field">
          <span class="field-label">Meta</span>
          <input value="${escapeHtml(item.meta || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.meta">
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">Image URL</span>
          <input value="${escapeHtml(item.image || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.image">
        </label>
        <label class="field">
          <span class="field-label">Alt</span>
          <input value="${escapeHtml(item.alt || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.alt">
        </label>
        <label class="field">
          <span class="field-label">Link</span>
          <input value="${escapeHtml(item.href || '')}" data-path="detail.sections.${sectionIndex}.items.${itemIndex}.href">
        </label>
      </div>
    </div>`;
}

function renderSectionFields(section, sectionIndex) {
  const baseFields = `
    <div class="field-grid">
      <label class="field">
        <span class="field-label">Section ID</span>
        <input value="${escapeHtml(section.id || '')}" data-path="detail.sections.${sectionIndex}.id">
      </label>
      <label class="field">
        <span class="field-label">Type</span>
        <select data-path="detail.sections.${sectionIndex}.type">
          ${SECTION_TYPES.map((type) => `<option value="${type}" ${section.type === type ? 'selected' : ''}>${type}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="field-grid">
      <label class="field">
        <span class="field-label">Label</span>
        <input value="${escapeHtml(section.label || '')}" data-path="detail.sections.${sectionIndex}.label">
      </label>
      <label class="field">
        <span class="field-label">Heading</span>
        <input value="${escapeHtml(section.heading || '')}" data-path="detail.sections.${sectionIndex}.heading">
      </label>
    </div>
    <div class="field-grid single">
      <label class="field">
        <span class="field-label">Summary</span>
        <textarea data-path="detail.sections.${sectionIndex}.summary">${escapeHtml(section.summary || '')}</textarea>
      </label>
    </div>`;

  if (section.type === 'image') {
    return `${baseFields}
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Image title</span>
          <input value="${escapeHtml(section.title || '')}" data-path="detail.sections.${sectionIndex}.title">
        </label>
        <label class="field">
          <span class="field-label">Image alt</span>
          <input value="${escapeHtml(section.alt || '')}" data-path="detail.sections.${sectionIndex}.alt">
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">Image URL</span>
          <input value="${escapeHtml(section.image || '')}" data-path="detail.sections.${sectionIndex}.image">
        </label>
        <label class="field">
          <span class="field-label">Link</span>
          <input value="${escapeHtml(section.href || '')}" data-path="detail.sections.${sectionIndex}.href">
        </label>
        <label class="field">
          <span class="field-label">Caption / body</span>
          <textarea data-path="detail.sections.${sectionIndex}.body">${escapeHtml(section.body || '')}</textarea>
        </label>
      </div>`;
  }

  if (section.type === 'quote') {
    return `${baseFields}
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">Quote</span>
          <textarea data-path="detail.sections.${sectionIndex}.quote">${escapeHtml(section.quote || '')}</textarea>
        </label>
        <label class="field">
          <span class="field-label">Source</span>
          <input value="${escapeHtml(section.source || '')}" data-path="detail.sections.${sectionIndex}.source">
        </label>
      </div>`;
  }

  if (section.type === 'gallery') {
    const items = Array.isArray(section.items) ? section.items : [];
    return `${baseFields}
      <div class="section-toolbar">
        <button class="small" type="button" data-action="add-gallery-item" data-section-index="${sectionIndex}">Add gallery item</button>
      </div>
      <div class="gallery-item-list">
        ${items.length ? items.map((item, itemIndex) => renderGalleryItemCard(item, sectionIndex, itemIndex)).join('') : '<div class="section-empty">No gallery items yet.</div>'}
      </div>`;
  }

  return `${baseFields}
    <div class="field-grid single">
      <label class="field">
        <span class="field-label">Body</span>
        <textarea data-path="detail.sections.${sectionIndex}.body">${escapeHtml(section.body || '')}</textarea>
      </label>
    </div>`;
}

function renderSections(series) {
  const sections = Array.isArray(series.detail?.sections) ? series.detail.sections : [];
  return `
    <div class="editor-card">
      <div class="section-head">
        <div>
          <h3>Detail sections</h3>
          <div class="section-meta">Build a Behance-style story using text, highlight images, gallery blocks, and quotes.</div>
        </div>
        <div class="section-toolbar">
          ${SECTION_TYPES.map((type) => `<button class="small" type="button" data-action="add-section" data-section-type="${type}">Add ${type}</button>`).join('')}
        </div>
      </div>
      <div class="section-list">
        ${sections.length ? sections.map((section, sectionIndex) => `
          <div class="section-card" data-section-index="${sectionIndex}">
            <div class="section-head">
              <div>
                <div class="section-badge">${section.type}</div>
                <div class="section-meta">Section ${sectionIndex + 1}</div>
              </div>
              <div class="section-toolbar">
                <button class="small ghost" type="button" data-action="move-section-up" data-section-index="${sectionIndex}">Up</button>
                <button class="small ghost" type="button" data-action="move-section-down" data-section-index="${sectionIndex}">Down</button>
                <button class="small danger" type="button" data-action="remove-section" data-section-index="${sectionIndex}">Delete</button>
              </div>
            </div>
            ${renderSectionFields(section, sectionIndex)}
          </div>`).join('') : '<div class="section-empty">No sections yet. Add one to start building the case study.</div>'}
      </div>
    </div>`;
}

function renderEditor() {
  const series = getSelectedSeries();

  if (!series) {
    els.editorTitle.textContent = 'No content loaded';
    els.editorSubtitle.textContent = 'Load or bind the portfolio content file to start editing.';
    els.editorRoot.innerHTML = '<div class="empty-state">No series available.</div>';
    return;
  }

  ensureDetail(series);

  els.editorTitle.textContent = series.title || 'Untitled series';
  els.editorSubtitle.textContent = 'Edit the content model that powers your public project detail page.';

  const hero = series.detail.hero || {};

  els.editorRoot.innerHTML = `
    <div class="editor-card">
      <h3>Series basics</h3>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Series ID</span>
          <input value="${escapeHtml(series.id || '')}" data-path="id">
        </label>
        <label class="field">
          <span class="field-label">List eyebrow</span>
          <input value="${escapeHtml(series.eyebrow || '')}" data-path="eyebrow">
        </label>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">List title</span>
          <input value="${escapeHtml(series.title || '')}" data-path="title">
        </label>
        <label class="field">
          <span class="field-label">Tags</span>
          <div class="tag-list">${renderTagEditor(series)}</div>
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">List summary</span>
          <textarea data-path="summary">${escapeHtml(series.summary || '')}</textarea>
        </label>
      </div>
    </div>

    <div class="editor-card">
      <h3>Detail header</h3>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Detail eyebrow</span>
          <input value="${escapeHtml(series.detail.eyebrow || '')}" data-path="detail.eyebrow">
        </label>
        <label class="field">
          <span class="field-label">Detail title</span>
          <input value="${escapeHtml(series.detail.title || '')}" data-path="detail.title">
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">Detail summary</span>
          <textarea data-path="detail.summary">${escapeHtml(series.detail.summary || '')}</textarea>
        </label>
      </div>
    </div>

    <div class="editor-card">
      <h3>Hero block</h3>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Hero title</span>
          <input value="${escapeHtml(hero.title || '')}" data-path="detail.hero.title">
        </label>
        <label class="field">
          <span class="field-label">Hero subtitle</span>
          <input value="${escapeHtml(hero.subtitle || '')}" data-path="detail.hero.subtitle">
        </label>
      </div>
      <div class="field-grid single">
        <label class="field">
          <span class="field-label">Hero image URL</span>
          <input value="${escapeHtml(hero.image || '')}" data-path="detail.hero.image">
        </label>
        <label class="field">
          <span class="field-label">Hero alt</span>
          <input value="${escapeHtml(hero.alt || '')}" data-path="detail.hero.alt">
        </label>
        <label class="field">
          <span class="field-label">Hero link</span>
          <input value="${escapeHtml(hero.href || '')}" data-path="detail.hero.href">
        </label>
      </div>
    </div>

    ${renderSections(series)}

    <div class="sticky-actions">
      <button id="saveFooterButton" class="accent" type="button">Save changes</button>
      <button id="downloadFooterButton" type="button">Download JSON</button>
    </div>`;
}

function render() {
  renderSidebar();
  renderEditor();
  updateFileBoundNote();
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

function getSeriesMutable() {
  const series = getSelectedSeries();
  if (!series) throw new Error('No series selected');
  ensureDetail(series);
  return series;
}

function makeSectionTemplate(type) {
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

  if (type === 'gallery') {
    return { ...base, items: [] };
  }

  if (type === 'quote') {
    return { ...base, quote: '', source: '' };
  }

  return { ...base, body: '' };
}

function makeGalleryItemTemplate() {
  return {
    title: '',
    meta: '',
    image: '',
    alt: '',
    href: ''
  };
}

function moveItem(array, from, to) {
  if (to < 0 || to >= array.length) return;
  const [item] = array.splice(from, 1);
  array.splice(to, 0, item);
}

function onEditorInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  const path = target.dataset.path;
  if (!path) return;

  const series = getSeriesMutable();
  const value = target.value;
  const previousId = series.id;

  setValueByPath(series, path, value);

  if (path === 'id' && previousId !== value) {
    state.selectedSeriesId = value;
  }

  if (path.endsWith('.type')) {
    const sectionIndex = Number(path.split('.')[2]);
    const currentSection = series.detail.sections[sectionIndex];
    series.detail.sections[sectionIndex] = {
      ...makeSectionTemplate(value),
      id: currentSection.id || `section-${sectionIndex + 1}`,
      label: currentSection.label || '',
      heading: currentSection.heading || '',
      summary: currentSection.summary || ''
    };
    render();
  } else {
    renderSidebar();
  }

  markDirty(true);
  setStatus('Unsaved changes', '');
}

function onTagChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.tag) return;

  const series = getSeriesMutable();
  const tags = new Set(Array.isArray(series.tags) ? series.tags : []);
  if (target.checked) tags.add(target.dataset.tag);
  else tags.delete(target.dataset.tag);
  series.tags = [...tags];

  markDirty(true);
  renderSidebar();
  setStatus('Unsaved changes', '');
}

function onClickAction(event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.selectSeries) {
    state.selectedSeriesId = button.dataset.selectSeries;
    render();
    return;
  }

  const action = button.dataset.action;
  if (!action) {
    if (button.id === 'saveFooterButton') {
      savePayload().catch((error) => setStatus(error.message, 'error'));
    }
    if (button.id === 'downloadFooterButton') {
      downloadPayload();
      setStatus('Downloaded current JSON snapshot.', 'success');
    }
    return;
  }

  const series = getSeriesMutable();
  const sectionIndex = Number(button.dataset.sectionIndex);
  const itemIndex = Number(button.dataset.itemIndex);

  if (action === 'add-section') {
    series.detail.sections.push(makeSectionTemplate(button.dataset.sectionType));
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
    section.items.push(makeGalleryItemTemplate());
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

  markDirty(true);
  render();
  setStatus('Unsaved changes', '');
}

async function init() {
  els.bindFileButton.addEventListener('click', () => {
    bindFileHandle().catch((error) => setStatus(error.message, 'error'));
  });

  els.reloadButton.addEventListener('click', () => {
    loadPayload().then(() => setStatus('Reloaded content file.', 'success')).catch((error) => setStatus(error.message, 'error'));
  });

  els.saveButton.addEventListener('click', () => {
    savePayload().catch((error) => setStatus(error.message, 'error'));
  });

  els.downloadButton.addEventListener('click', () => {
    downloadPayload();
    setStatus('Downloaded current JSON snapshot.', 'success');
  });

  els.seriesList.addEventListener('click', onClickAction);
  els.editorRoot.addEventListener('click', onClickAction);
  els.editorRoot.addEventListener('input', onEditorInput);
  els.editorRoot.addEventListener('change', onTagChange);

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  try {
    await loadPayload();
    setStatus('Portfolio content loaded.', 'success');
  } catch (error) {
    els.editorRoot.innerHTML = `<div class="empty-state">${error.message}</div>`;
    setStatus(error.message, 'error');
  }
}

init();
