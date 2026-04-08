const dataUrl = './data/portfolio-content.json';
const contentSyncKey = 'zeno-portfolio-content-sync';
const contentSyncChannelName = 'zeno-portfolio-content-sync';
const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel(contentSyncChannelName) : null;
const isEmbedded = window.self !== window.top || new URLSearchParams(window.location.search).get('embedded') === '1';

if (isEmbedded) {
  document.body.classList.add('embedded-gallery');
}

let lastContentSyncStamp = null;

const els = {
  stream: document.getElementById('galleryStream'),
  announcer: document.getElementById('galleryAnnouncer'),
  loader: document.getElementById('loader')
};

function applyTheme(mode) {
  document.body.classList.toggle('theme-night', mode === 'night');
}

applyTheme(localStorage.getItem('zeno-theme-mode') === 'night' ? 'night' : 'day');

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'zeno-theme-mode') return;
  applyTheme(event.data.mode === 'night' ? 'night' : 'day');
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function announce(message) {
  if (!els.announcer) return;
  els.announcer.textContent = '';
  window.setTimeout(() => {
    els.announcer.textContent = message;
  }, 20);
}

function mediaPositionStyle(value) {
  if (!value) return '';
  return ` style="object-position:${escapeHtml(value)}"`;
}

function getEmbeddedPortfolioContent() {
  const source = document.getElementById('portfolioContentFallback');
  if (!source?.textContent) return null;

  try {
    return JSON.parse(source.textContent);
  } catch (error) {
    console.warn('Unable to parse embedded portfolio content fallback.', error);
    return null;
  }
}

function parseViewCount(meta) {
  if (!meta) return 0;
  var m = meta.match(/([\d.]+)\s*K?\s*views/i);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  return meta.toLowerCase().includes('k') ? n * 1000 : n;
}

function getSeriesMaxViews(entry) {
  var items = Array.isArray(entry.items) ? entry.items : [];
  var max = 0;
  for (var i = 0; i < items.length; i++) {
    var v = parseViewCount(items[i].meta);
    if (v > max) max = v;
  }
  return max;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function flattenWorks(payload) {
  const series = Array.isArray(payload?.series) ? payload.series : [];

  const works = series
    .filter((entry) => (entry?.categoryId || 'explore') === 'explore')
    .flatMap((entry) => {
      const items = Array.isArray(entry.items) ? entry.items : [];
      return items.map((item, index) => ({
        id: `${entry.id}-${index + 1}`,
        title: item.title || entry.title || 'Untitled work',
        seriesTitle: entry.title || '',
        image: item.image || entry.cover || '',
        video: item.video || '',
        poster: item.poster || item.image || entry.cover || '',
        position: item.position || entry.coverPosition || '',
        href: `./index.html#series/${entry.id}`
      }));
    })
    .filter((item) => Boolean(item.image || item.video));

  return shuffle(works);
}


function buildCardElement(work) {
  const a = document.createElement('a');
  a.className = 'gallery-card';
  a.href = escapeHtml(work.href);
  a.setAttribute('aria-label', `Open ${work.seriesTitle || 'project'} - ${work.title}`);

  const mediaDiv = document.createElement('div');
  mediaDiv.className = 'gallery-card-media';

  if (work.video) {
    const video = document.createElement('video');
    video.className = 'js-plyr';
    video.dataset.src = work.video;
    video.poster = work.poster || work.image || '';
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-label', work.title);
    if (work.position) video.style.objectPosition = work.position;
    mediaDiv.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.dataset.src = work.image;
    img.alt = work.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (work.position) img.style.objectPosition = work.position;
    mediaDiv.appendChild(img);
  }

  a.appendChild(mediaDiv);

  const overlay = document.createElement('div');
  overlay.className = 'gallery-card-overlay';
  overlay.innerHTML =
    `<div class="gallery-card-meta"><div class="gallery-card-series">${escapeHtml(work.seriesTitle)}</div><h2 class="gallery-card-title">${escapeHtml(work.title)}</h2></div>` +
    `<span class="gallery-card-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg></span>`;
  a.appendChild(overlay);

  return a;
}

function initLazyMedia() {
  const scrollRoot = document.querySelector('.gallery-scroll');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      observer.unobserve(card);

      const img = card.querySelector('img[data-src]');
      if (img) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }

      const video = card.querySelector('video[data-src]');
      if (video) {
        video.src = video.dataset.src;
        video.removeAttribute('data-src');
        video.preload = 'metadata';
        if (typeof Plyr !== 'undefined') {
          new Plyr(video, {
            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
            autoplay: true,
            muted: true,
            loop: { active: true },
            hideControls: true,
            clickToPlay: true
          });
        }
      }
    }
  }, {
    root: scrollRoot,
    rootMargin: '600px 0px'
  });

  return observer;
}

function initScrollReveal() {
  const scrollRoot = document.querySelector('.gallery-scroll');
  let revealIndex = 0;
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      revealObserver.unobserve(card);
      const delay = (revealIndex % 4) * 80;
      revealIndex++;
      card.style.transitionDelay = delay + 'ms';
      requestAnimationFrame(() => {
        card.classList.add('in-view');
        setTimeout(() => { card.style.transitionDelay = ''; }, delay + 700);
      });
    }
  }, {
    root: scrollRoot,
    threshold: 0.05,
    rootMargin: '0px 0px -40px 0px'
  });
  return revealObserver;
}

function renderWall(works) {
  if (!els.stream) return;

  const observer = initLazyMedia();
  const revealObserver = initScrollReveal();
  const BATCH = 12;
  let idx = 0;

  function renderBatch() {
    const frag = document.createDocumentFragment();
    const end = Math.min(idx + BATCH, works.length);
    while (idx < end) {
      const card = buildCardElement(works[idx++]);
      observer.observe(card);
      revealObserver.observe(card);
      frag.appendChild(card);
    }
    els.stream.appendChild(frag);
    if (idx < works.length) {
      requestAnimationFrame(renderBatch);
    }
  }

  renderBatch();
}

function refreshGalleryFromContentSync(stamp) {
  if (!stamp || stamp === lastContentSyncStamp) return;
  lastContentSyncStamp = stamp;
  window.location.reload();
}

els.stream?.addEventListener('click', (event) => {
  const card = event.target.closest('.gallery-card');
  if (!card || !isEmbedded) return;

  event.preventDefault();
  const media = card.querySelector('.gallery-card-media');
  const image = card.querySelector('img');
  const video = card.querySelector('video');
  const rect = media?.getBoundingClientRect();

  window.parent.postMessage({
    type: 'zeno-gallery-open-series',
    href: card.getAttribute('href'),
    image: image?.currentSrc || image?.src || video?.poster || '',
    rect: rect
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }
      : null
  }, window.location.origin);
});

els.stream?.addEventListener('keydown', (event) => {
  const card = event.target.closest('.gallery-card');
  if (!card || !isEmbedded) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;

  event.preventDefault();
  card.click();
});

async function init() {
  let payload = getEmbeddedPortfolioContent();

  if (!payload) {
    try {
      const response = await fetch(dataUrl, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load content: ${response.status}`);
      }
      payload = await response.json();
    } catch (error) {
      console.warn('Unable to load gallery content.', error);
    }
  }

  const works = flattenWorks(payload);

  if (!works.length) {
    els.loader.hidden = false;
    els.loader.textContent = 'No works yet.';
    announce('No works available.');
    return;
  }

  renderWall(works);
  els.loader.hidden = true;
  announce(`Loaded ${works.length} works.`);
}

init().catch((error) => {
  console.error(error);
  els.loader.hidden = false;
  els.loader.textContent = 'Unable to load gallery.';
  announce('Unable to load gallery.');
});

syncChannel?.addEventListener('message', (event) => {
  if (event.data?.type !== 'content-updated') return;
  refreshGalleryFromContentSync(event.data.updatedAt);
});

window.addEventListener('storage', (event) => {
  if (event.key !== contentSyncKey || !event.newValue) return;

  try {
    const payload = JSON.parse(event.newValue);
    if (payload?.type === 'content-updated') {
      refreshGalleryFromContentSync(payload.updatedAt);
    }
  } catch (error) {
    console.warn('Unable to parse portfolio content sync payload.', error);
  }
});

