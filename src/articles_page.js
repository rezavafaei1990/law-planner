const SUPA_URL = 'https://xfmdpeeuzhuvqwoalfea.supabase.co';
const SUPA_KEY = 'sb_publishable_ndrrbpAGh5VfuiVfETIE8g_IS-jfJD4';
const ARTICLES_KEY = 'baraat_articles_v2';
const THEME_KEY = 'baraat_theme_v1';

const CATEGORIES = [
  'حقوق مدنی',
  'حقوق تجارت',
  'آیین دادرسی مدنی',
  'حقوق جزا و جرم‌شناسی',
  'آیین دادرسی کیفری',
  'رویه قضایی و دیوان عالی',
  'حقوق ثبت و املاک',
  'کاربردی و حرفه‌ای وکالت'
];

let sb = null;
let currentUser = null;
let isAdmin = false;
let activeCategory = 'all';
let activeArticleId = null;
let readerFontSize = 16;
let tmpCoverImage = '';

const toFa = n => String(n ?? '').replace(/[0-9]/g, w => '۰۱۲۳۴۵۶۷۸۹'[+w]);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showToast(msg) {
  const el = document.getElementById('edToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function getArticles() {
  try {
    const raw = localStorage.getItem(ARTICLES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function estimateReadMinutes(art) {
  const words = String((art.abstract || '') + ' ' + (art.content || '')).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 170));
}

function applyTheme(mode) {
  const next = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  const btn = document.getElementById('edThemeBtn');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0f141d' : '#faf9f6');
}

function coverFallbackMarkup(art) {
  return `
    <div class="ed-cover-fallback">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true">
        <path d="M12 3v18M5 7h14M7 7l-3 6h6l-3-6zM17 7l-3 6h6l-3-6zM8 21h8"/>
      </svg>
      <div class="ed-cover-fallback-cat">${esc(art.category || 'پژوهش حقوقی')}</div>
      <div class="ed-cover-fallback-title">${esc(art.title)}</div>
    </div>
  `;
}

function coverMediaHtml(art, cls) {
  if (art.coverImage) {
    return `<img class="${cls || ''}" src="${esc(art.coverImage)}" alt="${esc(art.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=window.__edCoverFallback(${JSON.stringify(art.category || 'پژوهش حقوقی')},${JSON.stringify(art.title || '')})">`;
  }
  return coverFallbackMarkup(art);
}

window.__edCoverFallback = function(cat, title) {
  return coverFallbackMarkup({ category: cat, title: title });
};

function setupRevealObserver() {
  const els = document.querySelectorAll('.ed-reveal');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry, idx) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('is-visible'), Math.min(idx * 55, 220));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach(el => obs.observe(el));
}

function updateReadingProgress() {
  const track = document.getElementById('readingProgressTrack');
  const fill = document.getElementById('readingProgressFill');
  if (!track || !fill || !activeArticleId) return;
  const docH = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0;
  fill.style.transform = `scaleX(${pct.toFixed(4)})`;
}

function formatProseParagraphs(text) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return '<p>متن کامل این پژوهش به زودی منتشر می‌شود.</p>';
  const paras = clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 1) {
    return clean.split('\n').map(l => l.trim()).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('');
  }
  return paras.map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function renderCatalog() {
  const catView = document.getElementById('edCatalogView');
  const readView = document.getElementById('edReaderView');
  const track = document.getElementById('readingProgressTrack');
  if (catView) catView.classList.remove('hidden');
  if (readView) readView.classList.add('hidden');
  if (track) track.classList.add('hidden');

  document.querySelectorAll('#edCatNav .ed-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === activeCategory);
  });

  const q = (document.getElementById('edSearchInput')?.value || '').trim().toLowerCase();
  const list = getArticles();
  const filtered = list.filter(a => {
    if (activeCategory !== 'all' && a.category !== activeCategory) return false;
    if (!q) return true;
    return (
      (a.title || '').toLowerCase().includes(q) ||
      (a.abstract || '').toLowerCase().includes(q) ||
      (a.author || '').toLowerCase().includes(q) ||
      (a.tags || []).some(t => String(t).toLowerCase().includes(q))
    );
  });

  const leadSlot = document.getElementById('edLeadSlot');
  const gridSlot = document.getElementById('edGridSlot');
  if (!leadSlot || !gridSlot) return;

  if (!filtered.length) {
    leadSlot.innerHTML = '';
    gridSlot.className = '';
    gridSlot.innerHTML = `
      <div class="ed-empty">
        <div style="font-size:36px; margin-bottom:8px;">📚</div>
        <h3 style="margin:0 0 8px; color:var(--ed-text);">هنوز مقاله‌ای در این بخش منتشر نشده است</h3>
        <p style="margin:0 0 16px; font-size:13.5px;">پژوهش‌ها و تحلیل‌های تخصصی گروه حقوقی برائت به زودی در این نشریه قرار می‌گیرند.</p>
        ${isAdmin ? '<button type="button" class="ed-btn primary" onclick="window.__openEdArticleModal()">✍️ نگارش اولین مقاله</button>' : ''}
      </div>
    `;
    return;
  }

  let lead = filtered.find(a => a.featured) || filtered[0];
  const rest = filtered.filter(a => a.id !== lead.id);
  const minsLead = estimateReadMinutes(lead);

  leadSlot.innerHTML = `
    <article class="ed-lead-story ed-reveal" data-art-id="${esc(lead.id)}">
      <div class="ed-lead-media">
        ${coverMediaHtml(lead)}
      </div>
      <div class="ed-lead-body">
        <div>
          <div class="ed-meta-line">
            <span class="ed-meta-accent">${lead.featured ? 'پژوهش برگزیده' : 'تازه‌ترین پژوهش'}</span>
            <span aria-hidden="true">·</span>
            <span>${esc(lead.category || 'پژوهش حقوقی')}</span>
            <span aria-hidden="true">·</span>
            <span>${toFa(lead.date || 'امروز')}</span>
            <span aria-hidden="true">·</span>
            <span>${toFa(minsLead)} دقیقه مطالعه</span>
          </div>
          <h2 class="ed-lead-title" style="margin-top:12px;">${esc(lead.title)}</h2>
          <p class="ed-lead-abstract" style="margin-top:12px;">${esc(lead.abstract || (lead.content || '').slice(0, 220) + '…')}</p>
        </div>
        <div class="ed-lead-foot">
          <div class="ed-meta-line">
            ${lead.author ? `<span>نویسنده: <b style="color:var(--ed-text);">${esc(lead.author)}</b></span>` : '<span>تحریریه گروه حقوقی برائت</span>'}
          </div>
          <div style="display:flex; gap:6px; align-items:center;" onclick="event.stopPropagation()">
            ${isAdmin ? `
              <button type="button" class="ed-btn" onclick="window.__openEdArticleModal('${esc(lead.id)}')">ویرایش</button>
              <button type="button" class="ed-btn danger" onclick="window.__deleteEdArticle('${esc(lead.id)}')">حذف</button>
            ` : ''}
            <button type="button" class="ed-btn primary" onclick="window.__openEdReader('${esc(lead.id)}')">مطالعه مقاله ←</button>
          </div>
        </div>
      </div>
    </article>
  `;

  gridSlot.className = 'ed-grid';
  gridSlot.innerHTML = rest.map(a => {
    const mins = estimateReadMinutes(a);
    return `
      <article class="ed-card ed-reveal" data-art-id="${esc(a.id)}">
        <div class="ed-card-media">
          ${coverMediaHtml(a)}
        </div>
        <div class="ed-card-body">
          <div class="ed-meta-line">
            <span class="ed-meta-accent">${esc(a.category || 'پژوهش حقوقی')}</span>
            <span aria-hidden="true">·</span>
            <span>${toFa(a.date || 'امروز')}</span>
            <span aria-hidden="true">·</span>
            <span>${toFa(mins)} دقیقه</span>
          </div>
          <h3 class="ed-card-title">${esc(a.title)}</h3>
          <p class="ed-card-desc">${esc(a.abstract || (a.content ? a.content.slice(0, 145) + '…' : ''))}</p>
          <div class="ed-card-foot" onclick="event.stopPropagation()">
            <span>${a.author ? esc(a.author) : 'گروه حقوقی برائت'}</span>
            <div style="display:flex; gap:6px; align-items:center;">
              ${isAdmin ? `
                <button type="button" class="ed-btn" style="padding:4px 9px;" onclick="window.__openEdArticleModal('${esc(a.id)}')" title="ویرایش">✎</button>
                <button type="button" class="ed-btn danger" style="padding:4px 9px;" onclick="window.__deleteEdArticle('${esc(a.id)}')" title="حذف">✕</button>
              ` : ''}
              <button type="button" class="ed-btn" style="padding:5px 11px;" onclick="window.__openEdReader('${esc(a.id)}')">خواندن ←</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-art-id]').forEach(card => {
    card.addEventListener('click', () => openReader(card.dataset.artId));
  });

  setupRevealObserver();
}

function renderReader(id) {
  const list = getArticles();
  const art = list.find(a => a.id === id);
  if (!art) {
    activeArticleId = null;
    renderCatalog();
    return;
  }
  const catView = document.getElementById('edCatalogView');
  const readView = document.getElementById('edReaderView');
  const track = document.getElementById('readingProgressTrack');
  if (catView) catView.classList.add('hidden');
  if (readView) readView.classList.remove('hidden');
  if (track) track.classList.remove('hidden');

  const mins = estimateReadMinutes(art);
  const related = list.filter(x => x.id !== art.id && x.category === art.category).slice(0, 3);
  const fallbackRel = related.length ? related : list.filter(x => x.id !== art.id).slice(0, 3);

  readView.innerHTML = `
    <div class="ed-reader-bar">
      <button type="button" class="ed-btn" id="edBackToListBtn">→ بازگشت به فهرست مقالات</button>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="ed-btn" id="edFontDecBtn" title="کوچک‌تر کردن قلم">آ-</button>
        <button type="button" class="ed-btn" id="edFontIncBtn" title="بزرگ‌تر کردن قلم">آ+</button>
        <button type="button" class="ed-btn" id="edCopyLinkBtn">🔗 کپی لینک مقاله</button>
        ${isAdmin ? `
          <button type="button" class="ed-btn" onclick="window.__openEdArticleModal('${esc(art.id)}')">✎ ویرایش</button>
          <button type="button" class="ed-btn danger" onclick="window.__deleteEdArticle('${esc(art.id)}')">حذف</button>
        ` : ''}
      </div>
    </div>

    <article class="ed-reveal is-visible">
      <header class="ed-reader-header">
        <div class="ed-meta-line">
          <span class="ed-meta-accent">${esc(art.category || 'پژوهش حقوقی')}</span>
          <span aria-hidden="true">·</span>
          <span>${toFa(art.date || 'امروز')}</span>
          <span aria-hidden="true">·</span>
          <span>${toFa(mins)} دقیقه مطالعه</span>
          ${art.author ? `<span aria-hidden="true">·</span><span>نویسنده: <b style="color:var(--ed-text);">${esc(art.author)}</b></span>` : ''}
        </div>
        <h1 class="ed-reader-title">${esc(art.title)}</h1>
      </header>

      ${art.coverImage ? `
        <figure class="ed-reader-figure">
          <img class="ed-reader-cover" src="${esc(art.coverImage)}" alt="${esc(art.title)}" referrerpolicy="no-referrer">
          ${art.coverCaption ? `<figcaption class="ed-reader-caption">${esc(art.coverCaption)}</figcaption>` : ''}
        </figure>
      ` : ''}

      ${art.abstract ? `
        <div class="ed-reader-abstract">
          <b style="color:var(--ed-accent);">چکیده پژوهش:</b> ${esc(art.abstract)}
        </div>
      ` : ''}

      <div class="ed-reader-prose" style="--ed-reader-fs:${readerFontSize}px;">
        ${formatProseParagraphs(art.content)}
      </div>

      ${(art.tags && art.tags.length) ? `
        <div class="ed-reader-tags">
          <span>کلیدواژه‌ها:</span>
          ${art.tags.map(t => `<span>#${esc(t)}</span>`).join('<span aria-hidden="true">·</span>')}
        </div>
      ` : ''}
    </article>

    ${fallbackRel.length ? `
      <section class="ed-related-wrap">
        <h3>پژوهش‌های مرتبط</h3>
        <div class="ed-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));">
          ${fallbackRel.map(r => `
            <article class="ed-card" onclick="window.__openEdReader('${esc(r.id)}')">
              <div class="ed-card-media" style="aspect-ratio:16/9;">
                ${coverMediaHtml(r)}
              </div>
              <div class="ed-card-body" style="padding:14px 16px;">
                <div class="ed-meta-line">
                  <span class="ed-meta-accent">${esc(r.category || '')}</span>
                  <span aria-hidden="true">·</span>
                  <span>${toFa(r.date || '')}</span>
                </div>
                <h4 class="ed-card-title" style="font-size:14.5px;">${esc(r.title)}</h4>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}
  `;

  document.getElementById('edBackToListBtn')?.addEventListener('click', closeReader);
  document.getElementById('edFontDecBtn')?.addEventListener('click', () => {
    readerFontSize = Math.max(13, readerFontSize - 1);
    const p = readView.querySelector('.ed-reader-prose');
    if (p) p.style.setProperty('--ed-reader-fs', readerFontSize + 'px');
  });
  document.getElementById('edFontIncBtn')?.addEventListener('click', () => {
    readerFontSize = Math.min(22, readerFontSize + 1);
    const p = readView.querySelector('.ed-reader-prose');
    if (p) p.style.setProperty('--ed-reader-fs', readerFontSize + 'px');
  });
  document.getElementById('edCopyLinkBtn')?.addEventListener('click', async () => {
    const shareUrl = location.origin + location.pathname + '?id=' + encodeURIComponent(art.id);
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('لینک مستقیم مقاله کپی شد');
    } catch (e) {
      showToast('آدرس مقاله در نوار مرورگر قرار دارد');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateReadingProgress();
}

function openReader(id, skipHistory) {
  activeArticleId = id;
  if (!skipHistory) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('id', id);
      history.pushState({ id }, '', url.toString());
    } catch (e) {}
  }
  renderReader(id);
}

function closeReader(skipHistory) {
  activeArticleId = null;
  if (!skipHistory) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('id');
      history.pushState({}, '', url.toString());
    } catch (e) {}
  }
  renderCatalog();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function compressCoverFile(file, maxSide = 1100, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن تصویر'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر معتبر نیست'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w >= h) { h = Math.round(h * maxSide / w); w = maxSide; }
          else { w = Math.round(w * maxSide / h); h = maxSide; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openArticleModal(id) {
  if (!isAdmin) return showToast('نگارش و ویرایش فقط برای مدیر مجاز است');
  const existing = id ? getArticles().find(a => a.id === id) : null;
  const art = existing
    ? Object.assign({}, existing)
    : { id: 'art_' + Date.now(), title: '', category: 'حقوق مدنی', author: '', abstract: '', content: '', tags: [], coverImage: '', coverCaption: '', featured: false };

  tmpCoverImage = art.coverImage || '';
  const modal = document.getElementById('edModal');
  const back = document.getElementById('edModalBack');
  if (!modal || !back) return;

  modal.innerHTML = `
    <h2 style="margin:0 0 16px; font-size:18px;">${existing ? 'ویرایش مقاله نشریه' : 'نگارش و انتشار مقاله جدید'}</h2>
    <div class="ed-form-grid">
      <div class="ed-field" style="grid-column:1/-1;">
        <label>عنوان مقاله *</label>
        <input id="mArtTitle" class="ed-input" value="${esc(art.title)}" placeholder="مثلاً: تحلیل ماهیت حقوقی شرط وجه التزام در قراردادها">
      </div>
      <div class="ed-field">
        <label>دپارتمان / گرایش</label>
        <select id="mArtCat" class="ed-select">
          ${CATEGORIES.map(c => `<option ${art.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="ed-field">
        <label>نام نویسنده / پژوهشگر</label>
        <input id="mArtAuthor" class="ed-input" value="${esc(art.author || '')}" placeholder="نام نویسنده">
      </div>
      <div class="ed-field" style="grid-column:1/-1;">
        <label>تصویر شاخص / کاور مقاله (آپلود از دستگاه یا لینک)</label>
        <div class="ed-photo-box">
          <img id="mArtCoverPrev" class="ed-photo-preview" src="${esc(tmpCoverImage)}" style="${tmpCoverImage ? '' : 'display:none;'}">
          <div style="flex:1; display:grid; gap:8px; min-width:200px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <input type="file" id="mArtCoverFile" accept="image/*" style="font-size:12px; flex:1;">
              <button type="button" class="ed-btn danger" id="mArtCoverClearBtn">حذف تصویر</button>
            </div>
            <input id="mArtCoverUrl" class="ed-input" dir="ltr" value="${esc(tmpCoverImage)}" placeholder="یا آدرس اینترنتی تصویر کاور (اختیاری)">
          </div>
        </div>
      </div>
      <div class="ed-field">
        <label>زیرنویس تصویر (اختیاری)</label>
        <input id="mArtCaption" class="ed-input" value="${esc(art.coverCaption || '')}" placeholder="توضیح کوتاه زیر تصویر شاخص">
      </div>
      <div class="ed-field" style="justify-content:flex-end;">
        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; color:var(--ed-text); padding-bottom:8px;">
          <input type="checkbox" id="mArtFeatured" ${art.featured ? 'checked' : ''} style="width:16px; height:16px;">
          <span>نمایش به عنوان پژوهش برگزیده بالای نشریه</span>
        </label>
      </div>
      <div class="ed-field" style="grid-column:1/-1;">
        <label>چکیده و خلاصه پژوهش</label>
        <textarea id="mArtAbs" class="ed-textarea" rows="3" placeholder="خلاصه مسأله حقوقی و نتیجه‌گیری...">${esc(art.abstract || '')}</textarea>
      </div>
      <div class="ed-field" style="grid-column:1/-1;">
        <label>متن کامل مقاله</label>
        <textarea id="mArtContent" class="ed-textarea" rows="8" placeholder="متن کامل مقاله...">${esc(art.content || '')}</textarea>
      </div>
      <div class="ed-field" style="grid-column:1/-1;">
        <label>کلیدواژه‌ها (با خط تیره یا کاما جدا کنید)</label>
        <input id="mArtTags" class="ed-input" value="${esc((art.tags || []).join('، '))}" placeholder="وجه التزام، ماده ۲۳۰، قرارداد">
      </div>
    </div>
    <div class="ed-modal-actions">
      <button type="button" class="ed-btn" id="mArtCancelBtn">انصراف</button>
      <button type="button" class="ed-btn primary" id="mArtSaveBtn">انتشار در نشریه</button>
    </div>
  `;

  back.classList.add('show');

  const fileEl = document.getElementById('mArtCoverFile');
  const urlEl = document.getElementById('mArtCoverUrl');
  const prevEl = document.getElementById('mArtCoverPrev');

  if (fileEl) {
    fileEl.onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const dataUrl = await compressCoverFile(f, 1100, 0.8);
        tmpCoverImage = dataUrl;
        if (urlEl) urlEl.value = dataUrl;
        if (prevEl) { prevEl.src = dataUrl; prevEl.style.display = 'block'; }
        showToast('تصویر کاور آماده انتشار شد');
      } catch (err) {
        showToast('خواندن تصویر ناموفق بود');
      }
    };
  }
  if (urlEl) {
    urlEl.oninput = () => {
      tmpCoverImage = urlEl.value.trim();
      if (prevEl) {
        if (tmpCoverImage) { prevEl.src = tmpCoverImage; prevEl.style.display = 'block'; }
        else { prevEl.style.display = 'none'; }
      }
    };
  }
  document.getElementById('mArtCoverClearBtn')?.addEventListener('click', () => {
    tmpCoverImage = '';
    if (urlEl) urlEl.value = '';
    if (fileEl) fileEl.value = '';
    if (prevEl) prevEl.style.display = 'none';
  });
  document.getElementById('mArtCancelBtn')?.addEventListener('click', () => back.classList.remove('show'));
  document.getElementById('edModalBack').onclick = (e) => { if (e.target === back) back.classList.remove('show'); };
  document.getElementById('mArtSaveBtn')?.addEventListener('click', async () => {
    const title = (document.getElementById('mArtTitle')?.value || '').trim();
    if (!title) return showToast('عنوان مقاله الزامی است');
    const featured = !!document.getElementById('mArtFeatured')?.checked;
    const nextArt = {
      id: art.id,
      title,
      category: document.getElementById('mArtCat')?.value || 'حقوق مدنی',
      author: (document.getElementById('mArtAuthor')?.value || '').trim(),
      abstract: (document.getElementById('mArtAbs')?.value || '').trim(),
      content: (document.getElementById('mArtContent')?.value || '').trim(),
      tags: (document.getElementById('mArtTags')?.value || '').split(/[,،؛;]/).map(t => t.trim()).filter(Boolean),
      coverImage: (document.getElementById('mArtCoverUrl')?.value || tmpCoverImage || '').trim(),
      coverCaption: (document.getElementById('mArtCaption')?.value || '').trim(),
      featured,
      date: existing && existing.date ? existing.date : new Date().toLocaleDateString('fa-IR')
    };
    let list = getArticles();
    if (featured) list = list.map(x => Object.assign({}, x, { featured: x.id === nextArt.id }));
    const idx = list.findIndex(x => x.id === nextArt.id);
    if (idx >= 0) list[idx] = nextArt;
    else list.unshift(nextArt);

    localStorage.setItem(ARTICLES_KEY, JSON.stringify(list));
    back.classList.remove('show');
    if (activeArticleId === nextArt.id) renderReader(nextArt.id);
    else renderCatalog();

    if (sb) {
      const res = await sb.from('meta').upsert({ key: ARTICLES_KEY, value: JSON.stringify(list) }, { onConflict: 'key' });
      if (res.error) showToast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error.message);
      else showToast('مقاله با موفقیت روی سرور منتشر شد');
    } else {
      showToast('مقاله ذخیره شد');
    }
  });
}

async function deleteArticleById(id) {
  if (!isAdmin) return;
  if (!confirm('این مقاله حذف شود؟')) return;
  const list = getArticles().filter(a => a.id !== id);
  localStorage.setItem(ARTICLES_KEY, JSON.stringify(list));
  if (activeArticleId === id) closeReader();
  else renderCatalog();
  if (sb) {
    const res = await sb.from('meta').upsert({ key: ARTICLES_KEY, value: JSON.stringify(list) }, { onConflict: 'key' });
    if (res.error) showToast('حذف محلی انجام شد اما خطای سرور رخ داد');
    else showToast('مقاله حذف شد');
  }
}

window.__openEdReader = id => openReader(id);
window.__openEdArticleModal = id => openArticleModal(id);
window.__deleteEdArticle = id => deleteArticleById(id);

async function syncArticles() {
  if (!sb || !navigator.onLine) return;
  try {
    const res = await sb.from('meta').select('value').eq('key', ARTICLES_KEY).maybeSingle();
    if (!res.error && res.data && res.data.value) {
      const parsed = typeof res.data.value === 'string' ? JSON.parse(res.data.value) : res.data.value;
      if (Array.isArray(parsed)) {
        localStorage.setItem(ARTICLES_KEY, JSON.stringify(parsed));
        if (activeArticleId) renderReader(activeArticleId);
        else renderCatalog();
      }
    }
  } catch (e) {}
}

async function checkAdminSession() {
  if (!sb) return;
  try {
    const sess = await sb.auth.getSession();
    const user = sess?.data?.session?.user || null;
    currentUser = user;
    if (user) {
      const adm = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      isAdmin = !!(adm.data && adm.data.user_id);
    }
  } catch (e) {
    isAdmin = false;
  }
  const newBtn = document.getElementById('edAdminNewBtn');
  if (newBtn) newBtn.classList.toggle('hidden', !isAdmin);
  if (activeArticleId) renderReader(activeArticleId);
  else renderCatalog();
}

function init() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
  applyTheme(savedTheme);

  if (window.supabase) {
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  }

  document.getElementById('edThemeBtn')?.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('edBrandHomeBtn')?.addEventListener('click', () => {
    activeCategory = 'all';
    closeReader();
  });

  document.getElementById('edAdminNewBtn')?.addEventListener('click', () => openArticleModal());

  document.querySelectorAll('#edCatNav .ed-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat || 'all';
      if (activeArticleId) closeReader();
      else renderCatalog();
    });
  });

  document.getElementById('edSearchInput')?.addEventListener('input', () => {
    if (!activeArticleId) renderCatalog();
  });

  window.addEventListener('scroll', updateReadingProgress, { passive: true });
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('id');
    if (id) openReader(id, true);
    else closeReader(true);
  });

  const initialId = new URLSearchParams(location.search).get('id');
  if (initialId) openReader(initialId, true);
  else renderCatalog();

  checkAdminSession();
  syncArticles();
}

init();
