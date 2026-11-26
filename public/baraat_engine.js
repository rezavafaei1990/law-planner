// =====================================================================
// سامانه گروه حقوقی برائت: موتور محاسبات، مقالات، مواعد و مدیریت
// =====================================================================

(function() {
  const toFa = n => String(n).replace(/[0-9]/g, w => ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'][+w]);
  const toEn = s => String(s).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // -------------------------------------------------------------------
  // هماهنگ‌سازی ابری دوطرفه با پایگاه داده Supabase و ذخیره‌سازی آفلاین
  // -------------------------------------------------------------------
  const serverStatus = {
    checked: false,
    articlesCount: 0,
    lastError: ''
  };
  let _syncPromise = null;
  let _lastSyncAt = 0;
  let _hasSyncedOnce = false;
  let _syncedAsAdmin = false;
  let _lastEmptyExamsSyncAt = 0;

  // ذخیره پایدار آزمون‌ها در RAM و IndexedDB تا محدودیت ۵ مگابایتی localStorage در PWA هرگز باعث ناپدید شدن آزمون‌ها نشود
  let _memPubExams = null;
  let _memPrivExams = null;
  let _examsIdbPromise = null;
  function openExamsIdb() {
    if (_examsIdbPromise) return _examsIdbPromise;
    _examsIdbPromise = new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open('baraat_exams_idb', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { _examsIdbPromise = null; resolve(null); };
      } catch (e) {
        _examsIdbPromise = null;
        resolve(null);
      }
    });
    return _examsIdbPromise;
  }
  async function idbExamsGet(key) {
    try {
      const db = await openExamsIdb();
      if (!db) return null;
      return await new Promise(resolve => {
        const tx = db.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }
  async function idbExamsSet(key, val) {
    try {
      const db = await openExamsIdb();
      if (!db) return;
      await new Promise(resolve => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {}
  }
  async function idbExamsDel(key) {
    try {
      const db = await openExamsIdb();
      if (!db) return;
      await new Promise(resolve => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {}
  }
  async function hydrateExamsFromIdb() {
    try {
      const [pubData, privData] = await Promise.all([
        idbExamsGet(EXAMS_KEY),
        idbExamsGet(EXAMS_PRIVATE_KEY)
      ]);
      let hydrated = false;
      if (Array.isArray(pubData) && pubData.length && !_memPubExams) {
        _memPubExams = pubData;
        hydrated = true;
      }
      if (Array.isArray(privData) && privData.length && !_memPrivExams) {
        _memPrivExams = privData;
        hydrated = true;
      }
      if (hydrated) {
        invalidateExamsCache();
        const examsVisible = document.getElementById('hub-students') && !document.getElementById('hub-students').classList.contains('hidden')
          && document.getElementById('tab-exams') && !document.getElementById('tab-exams').classList.contains('hidden');
        const runnerOpen = !!(document.getElementById('examRunnerOverlay') && !document.getElementById('examRunnerOverlay').classList.contains('hidden'));
        if (examsVisible && !runnerOpen && window.renderExamsHub) window.renderExamsHub();
      }
    } catch (e) {}
  }

  async function syncToSupabase(key, data) {
    try {
      if (!window.sb) {
        return { ok: false, error: 'اتصال به پایگاه داده Supabase برقرار نیست.' };
      }
      const res = await window.sb
        .from('meta')
        .upsert({ key: key, value: JSON.stringify(data) }, { onConflict: 'key' })
        .select('key');
      if (res && res.error) {
        console.warn('Supabase sync error for ' + key + ':', res.error.message);
        serverStatus.lastError = res.error.message || 'خطای ثبت در پایگاه داده';
        return { ok: false, error: serverStatus.lastError };
      }
      if (key === ARTICLES_KEY && Array.isArray(data)) {
        serverStatus.checked = true;
        serverStatus.articlesCount = data.length;
        serverStatus.lastError = '';
      }
      return { ok: true };
    } catch(err) {
      const msg = (err && err.message) ? err.message : 'خطای شبکه در ارتباط با سرور';
      console.warn('Supabase sync error:', err);
      serverStatus.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  async function syncFromSupabase(key, onDataLoaded) {
    try {
      if (!window.sb) return { exists: false, data: null };
      const r = await window.sb.from('meta').select('value').eq('key', key).maybeSingle();
      if (r && r.error) {
        console.warn('Supabase fetch error for ' + key + ':', r.error.message);
        return { exists: false, data: null, error: r.error.message };
      }
      if (r && r.data && r.data.value !== null && r.data.value !== undefined) {
        const raw = r.data.value;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed !== null && parsed !== undefined) {
          if (onDataLoaded) onDataLoaded(parsed);
          return { exists: true, data: parsed };
        }
      }
      return { exists: false, data: null };
    } catch(err) {
      console.warn('Supabase fetch deferred, using cached local data:', err);
      return { exists: false, data: null, error: err && err.message };
    }
  }

  window.syncAllFromSupabase = async function(force) {
    if (!window.sb || !navigator.onLine) return;
    const adminBypassThrottle = !!(window.isAdmin && !_syncedAsAdmin);
    if (!force && !adminBypassThrottle && _hasSyncedOnce && (Date.now() - _lastSyncAt < 45000)) return;
    if (_syncPromise) {
      if (force || adminBypassThrottle) {
        try { await _syncPromise; } catch (e) {}
        if (!force && !(window.isAdmin && !_syncedAsAdmin)) return;
      } else {
        return _syncPromise;
      }
    }
    _syncPromise = (async () => {
      try {
        const keysToFetch = [
          ARTICLES_KEY,
          DEADLINES_KEY,
          CALC_CUSTOM_KEY,
          ABOUT_KEY,
          CONTACT_KEY,
          QUESTION_REPLIES_KEY,
          EXAMS_KEY,
          EXAM_DELETED_ATTEMPTS_KEY,
          EXAM_SUBJECTS_KEY,
          VIP_SETTINGS_KEY
        ];
        if (window.isAdmin) {
          keysToFetch.push(EXAMS_PRIVATE_KEY, CASES_KEY, ASSIGNED_PLANS_KEY, EXAM_ATTEMPTS_KEY);
        } else if (window._authResolved) {
          try { localStorage.removeItem(EXAMS_PRIVATE_KEY); } catch (e) {}
        }
        const res = await window.sb.from('meta').select('key, value').in('key', keysToFetch);
        if (res && res.error) {
          console.warn('Supabase batch sync error:', res.error.message);
          serverStatus.lastError = res.error.message || 'خطای همگام‌سازی';
          return;
        }
        const map = {};
        (res && Array.isArray(res.data) ? res.data : []).forEach(row => {
          if (row && row.key && row.value !== null && row.value !== undefined) {
            try {
              map[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            } catch (e) {}
          }
        });

        const writeIfChanged = (k, val) => {
          try {
            const s = JSON.stringify(val);
            if (localStorage.getItem(k) === s) return false;
            localStorage.setItem(k, s);
            return true;
          } catch (e) {
            console.warn('localStorage write skipped (quota/private mode) for ' + k + ':', e && e.name);
            return true;
          }
        };
        const isSectionVisible = (id) => {
          const el = document.getElementById(id);
          return !!(el && !el.classList.contains('hidden'));
        };

        serverStatus.checked = true;
        serverStatus.lastError = '';
        if (Array.isArray(map[ARTICLES_KEY])) {
          const data = map[ARTICLES_KEY];
          serverStatus.articlesCount = data.length;
          const localArts = window.getArticles();
          if (data.length > 0 || !window.isAdmin || localArts.length === 0) {
            if (writeIfChanged(ARTICLES_KEY, data) && isSectionVisible('tab-articles')) {
              window.renderArticles();
            }
          }
        } else {
          serverStatus.articlesCount = 0;
        }

        if (Array.isArray(map[DEADLINES_KEY]) && map[DEADLINES_KEY].length > 0) {
          if (writeIfChanged(DEADLINES_KEY, map[DEADLINES_KEY]) && isSectionVisible('hub-lawyers') && isSectionVisible('tab-deadlines')) {
            window.renderDeadlines();
          }
        }
        if (Array.isArray(map[CALC_CUSTOM_KEY]) && map[CALC_CUSTOM_KEY].length > 0) {
          if (writeIfChanged(CALC_CUSTOM_KEY, map[CALC_CUSTOM_KEY]) && isSectionVisible('hub-lawyers') && isSectionVisible('tab-calculator')) {
            window.renderCalculators();
          }
        }
        if (map[ABOUT_KEY] && typeof map[ABOUT_KEY] === 'object') {
          if (writeIfChanged(ABOUT_KEY, map[ABOUT_KEY]) && isSectionVisible('tab-about') && window.renderAbout) {
            window.renderAbout();
          }
        }
        if (map[CONTACT_KEY] && typeof map[CONTACT_KEY] === 'object') {
          if (writeIfChanged(CONTACT_KEY, map[CONTACT_KEY]) && isSectionVisible('tab-contact') && window.renderContact) {
            window.renderContact();
          }
        }
        if (map[QUESTION_REPLIES_KEY] && typeof map[QUESTION_REPLIES_KEY] === 'object') {
          if (writeIfChanged(QUESTION_REPLIES_KEY, map[QUESTION_REPLIES_KEY]) && isSectionVisible('hub-students') && window.renderStudentProgressView) {
            window.renderStudentProgressView();
          }
        }
        if (Array.isArray(map[EXAM_DELETED_ATTEMPTS_KEY])) {
          writeIfChanged(EXAM_DELETED_ATTEMPTS_KEY, map[EXAM_DELETED_ATTEMPTS_KEY]);
        }
        if (Array.isArray(map[EXAM_SUBJECTS_KEY]) && map[EXAM_SUBJECTS_KEY].length > 0) {
          writeIfChanged(EXAM_SUBJECTS_KEY, map[EXAM_SUBJECTS_KEY]);
        }
        if (map[VIP_SETTINGS_KEY] && typeof map[VIP_SETTINGS_KEY] === 'object') {
          writeIfChanged(VIP_SETTINGS_KEY, map[VIP_SETTINGS_KEY]);
        }
        if (window.isAdmin && Array.isArray(map[EXAM_ATTEMPTS_KEY])) {
          writeIfChanged(EXAM_ATTEMPTS_KEY, map[EXAM_ATTEMPTS_KEY]);
        }
        if (Array.isArray(map[EXAMS_KEY]) || (window.isAdmin && Array.isArray(map[EXAMS_PRIVATE_KEY]))) {
          let examsChanged = false;
          const pubListRaw = Array.isArray(map[EXAMS_KEY]) ? map[EXAMS_KEY] : [];
          if (window.isAdmin) {
            const hasServerPriv = Array.isArray(map[EXAMS_PRIVATE_KEY]);
            let privListRaw = hasServerPriv ? map[EXAMS_PRIVATE_KEY] : [];
            if (!hasServerPriv) {
              if (Array.isArray(_memPrivExams)) {
                privListRaw = _memPrivExams;
              } else {
                try {
                  const cachedPriv = JSON.parse(localStorage.getItem(EXAMS_PRIVATE_KEY) || '[]');
                  if (Array.isArray(cachedPriv)) privListRaw = cachedPriv;
                } catch (e) {}
              }
            }
            const legacyHiddenInPub = pubListRaw.filter(x => x && x.isPublished === false);
            const cleanPub = pubListRaw.filter(x => !x || x.isPublished !== false);
            const mergedPrivMap = new Map();
            privListRaw.forEach(x => { if (x && x.id) mergedPrivMap.set(x.id, Object.assign({}, x, { isPublished: false })); });
            legacyHiddenInPub.forEach(x => { if (x && x.id && !mergedPrivMap.has(x.id)) mergedPrivMap.set(x.id, Object.assign({}, x, { isPublished: false })); });
            const cleanPriv = [...mergedPrivMap.values()];
            if (Array.isArray(map[EXAMS_KEY])) {
              _memPubExams = cleanPub;
              idbExamsSet(EXAMS_KEY, cleanPub);
              if (writeIfChanged(EXAMS_KEY, cleanPub)) examsChanged = true;
            }
            if (hasServerPriv || legacyHiddenInPub.length > 0) {
              _memPrivExams = cleanPriv;
              idbExamsSet(EXAMS_PRIVATE_KEY, cleanPriv);
              if (writeIfChanged(EXAMS_PRIVATE_KEY, cleanPriv)) examsChanged = true;
            }
            // پاکسازی خودکار آزمون‌های مخفی قدیمی از کلید عمومی
            if (legacyHiddenInPub.length > 0) {
              await syncToSupabase(EXAMS_PRIVATE_KEY, cleanPriv.map(normalizeExamRecord));
              await syncToSupabase(EXAMS_KEY, cleanPub.map(normalizeExamRecord));
            }
          } else {
            const pubOnly = pubListRaw.filter(x => !x || x.isPublished !== false);
            _memPubExams = pubOnly;
            idbExamsSet(EXAMS_KEY, pubOnly);
            if (writeIfChanged(EXAMS_KEY, pubOnly)) examsChanged = true;
            if (window._authResolved) {
              _memPrivExams = null;
              idbExamsDel(EXAMS_PRIVATE_KEY);
              try {
                if (localStorage.getItem(EXAMS_PRIVATE_KEY) !== null) {
                  localStorage.removeItem(EXAMS_PRIVATE_KEY);
                  examsChanged = true;
                }
              } catch (e) {}
            }
          }
          invalidateExamsCache();
          const runnerOpen = !!(document.getElementById('examRunnerOverlay') && !document.getElementById('examRunnerOverlay').classList.contains('hidden'));
          if ((examsChanged || !_hasSyncedOnce || (window.isAdmin && !_syncedAsAdmin)) && !runnerOpen && isSectionVisible('hub-students') && isSectionVisible('tab-exams') && window.renderExamsHub) {
            window.renderExamsHub();
          }
        }
        if (window.isAdmin && Array.isArray(map[CASES_KEY])) {
          if (writeIfChanged(CASES_KEY, map[CASES_KEY]) && isSectionVisible('hub-lawyers') && isSectionVisible('tab-cases') && window.renderCases) {
            window.renderCases();
          }
        }
        if (window.isAdmin && map[ASSIGNED_PLANS_KEY] && typeof map[ASSIGNED_PLANS_KEY] === 'object') {
          writeIfChanged(ASSIGNED_PLANS_KEY, map[ASSIGNED_PLANS_KEY]);
        }
        if (window.isAdmin && isSectionVisible('tab-admin')) {
          if (window.refreshAdminMonitor) window.refreshAdminMonitor();
          if (typeof renderAdminPanels === 'function') renderAdminPanels();
        }

        _lastSyncAt = Date.now();
        _hasSyncedOnce = true;
        _syncedAsAdmin = !!window.isAdmin;
      } catch (err) {
        console.warn('Supabase batch sync failed:', err);
      } finally {
        _syncPromise = null;
      }
    })();
    return _syncPromise;
  };

  window.autoSyncAdminArticlesOnLogin = async function() {
    if (!window.isAdmin || !window.sb) return;
    const localArts = window.getArticles();
    const res = await syncFromSupabase(ARTICLES_KEY);
    const serverArts = (res && res.exists && Array.isArray(res.data)) ? res.data : [];
    serverStatus.checked = true;
    serverStatus.articlesCount = serverArts.length;

    if (localArts.length > 0 && serverArts.length === 0) {
      const pushRes = await syncToSupabase(ARTICLES_KEY, localArts);
      if (pushRes.ok) {
        if (typeof toast === 'function') toast('مقالات ذخیره‌شده روی دستگاه در سرور منتشر شدند.');
      } else {
        if (typeof toast === 'function') toast('خطا در انتشار خودکار مقالات: ' + pushRes.error);
      }
    } else if (serverArts.length > 0) {
      localStorage.setItem(ARTICLES_KEY, JSON.stringify(serverArts));
      window.renderArticles();
    }
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
  };

  window.pushAllAdminDataToSupabase = async function() {
    if (!window.isAdmin) {
      if (typeof toast === 'function') toast('فقط مدیر سامانه می‌تواند داده‌ها را در سرور منتشر کند.');
      return;
    }
    const arts = window.getArticles();
    const dls = window.getDeadlines();
    const calcs = window.getCustomCalculators();
    const aboutData = window.getAboutData ? window.getAboutData() : null;
    const contactData = window.getContactData ? window.getContactData() : null;
    const repliesData = window.getQuestionRepliesMap ? window.getQuestionRepliesMap() : null;
    const casesData = window.getCases ? window.getCases() : null;
    const examsData = window.getExams ? window.getExams() : null;
    const examsPublic = Array.isArray(examsData) ? examsData.filter(x => x && x.isPublished !== false) : null;
    const examsPrivate = Array.isArray(examsData) ? examsData.filter(x => x && x.isPublished === false) : null;
    const subjectsList = typeof getExamSubjectsList === 'function' ? getExamSubjectsList() : null;
    const vipCfg = typeof getVipSettings === 'function' ? getVipSettings() : null;

    const r1 = await syncToSupabase(ARTICLES_KEY, arts);
    const r2 = await syncToSupabase(DEADLINES_KEY, dls);
    const r3 = await syncToSupabase(CALC_CUSTOM_KEY, calcs);
    const r4 = aboutData ? await syncToSupabase(ABOUT_KEY, aboutData) : { ok: true };
    const r5 = contactData ? await syncToSupabase(CONTACT_KEY, contactData) : { ok: true };
    const r6 = repliesData ? await syncToSupabase(QUESTION_REPLIES_KEY, repliesData) : { ok: true };
    const r7 = (window.isAdmin && casesData) ? await syncToSupabase(CASES_KEY, casesData) : { ok: true };
    const r8 = examsPublic ? await syncToSupabase(EXAMS_KEY, examsPublic) : { ok: true };
    const r9 = examsPrivate ? await syncToSupabase(EXAMS_PRIVATE_KEY, examsPrivate) : { ok: true };
    const r10 = subjectsList ? await syncToSupabase(EXAM_SUBJECTS_KEY, subjectsList) : { ok: true };
    const r11 = vipCfg ? await syncToSupabase(VIP_SETTINGS_KEY, vipCfg) : { ok: true };

    if (typeof renderAdminPanels === 'function') renderAdminPanels();

    const errors = [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11].filter(r => !r.ok).map(r => r.error);
    if (errors.length === 0) {
      if (typeof toast === 'function') toast('همه مقالات، آزمون‌ها و تنظیمات با موفقیت روی سرور منتشر شدند.');
    } else {
      const msg = errors[0];
      if (window.showModal) {
        window.showModal(`
          <h2>خطا در انتشار روی سرور Supabase</h2>
          <p style="line-height:2; font-size:13.5px; color:var(--danger, #dc2626);">سرور اجازه ذخیره در جدول meta را نداد:</p>
          <pre dir="ltr" class="surface-box" style="overflow:auto; font-size:12px;">${esc(msg)}</pre>
          <p style="line-height:2; font-size:13px; color:var(--text);">مطمئن شوید با ایمیل مدیر (ثبت‌شده در جدول admins) وارد شده‌اید و جدول meta مجوز نوشتن برای مدیر دارد.</p>
          <div class="modal-actions"><button class="btn primary" onclick="closeModal()">متوجه شدم</button></div>
        `);
      } else if (typeof toast === 'function') {
        toast('خطای سرور: ' + msg);
      }
    }
  };


  // -------------------------------------------------------------------
  // ۱. ماژول مقالات و پژوهش‌ها (عمومی)
  // -------------------------------------------------------------------
  const ARTICLES_KEY = 'baraat_articles_v2';

  window.getArticles = function() {
    try {
      const data = localStorage.getItem(ARTICLES_KEY);
      return data ? JSON.parse(data) : [];
    } catch(e) {
      return [];
    }
  };

  window.saveArticle = async function(art) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: نگارش مقاله فقط برای مدیر سامانه مجاز است."); return; }
    let list = window.getArticles();
    if (art.featured) {
      list = list.map(a => Object.assign({}, a, { featured: a.id === art.id }));
    }
    const idx = list.findIndex(a => a.id === art.id);
    if (idx >= 0) list[idx] = art;
    else list.unshift(art);
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(list));
    window.renderArticles();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(ARTICLES_KEY, list);
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (res.ok) {
      if (typeof toast === 'function') toast('مقاله با موفقیت روی سرور منتشر شد.');
    } else {
      if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما ثبت در سرور خطا داد: ' + res.error);
    }
  };

  window.deleteArticle = async function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف مقاله فقط برای مدیر سامانه مجاز است."); return; }
    if (!confirm('آیا از حذف این مقاله اطمینان دارید؟')) return;
    const list = window.getArticles().filter(a => a.id !== id);
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(list));
    window.renderArticles();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(ARTICLES_KEY, list);
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (res.ok) {
      if (typeof toast === 'function') toast('مقاله از سرور و برنامه حذف شد.');
    } else {
      if (typeof toast === 'function') toast('حذف محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  };

  window.renderArticles = function() {
    const box = document.getElementById('articlesList');
    if (!box) return;

    const list = window.getArticles();
    const q = (document.getElementById('artSearch')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('artCatFilter')?.value || 'all';

    const filtered = list.filter(a => {
      if (cat !== 'all' && a.category !== cat) return false;
      if (!q) return true;
      return (
        (a.title || '').toLowerCase().includes(q) ||
        (a.abstract || '').toLowerCase().includes(q) ||
        (a.author || '').toLowerCase().includes(q) ||
        (a.tags || []).some(t => t.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      box.innerHTML = `
        <div class="empty-glass-card">
          <div class="empty-icon">📚</div>
          <h3>هنوز مقاله‌ای منتشر نشده است</h3>
          <p>پژوهش‌ها، تحلیل‌های رویه قضایی و مقالات تخصصی گروه حقوقی برائت پس از نگارش و انتشار در این بخش قرار می‌گیرند.</p>
          ${window.isAdmin ? `
            <div style="margin-top: 18px;">
              <button class="btn primary" onclick="openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>
            </div>
          ` : ''}
        </div>
      `;
      return;
    }

    box.innerHTML = `
      <div class="articles-grid">
        ${filtered.map(a => `
          <div class="article-card">
            <div class="art-head">
              <span class="art-tag">${esc(a.category || 'پژوهش حقوقی')}</span>
              <span class="art-date">${toFa(a.date || 'امروز')}</span>
            </div>
            <h3 class="art-title">${esc(a.title)}</h3>
            ${a.author ? `<div class="art-author">✍️ نویسنده: ${esc(a.author)}</div>` : ''}
            <p class="art-desc">${esc(a.abstract || (a.content ? a.content.slice(0, 140) + '…' : ''))}</p>
            ${(a.tags && a.tags.length) ? `
              <div class="art-tags">
                ${a.tags.map(t => `<span class="tag-chip">#${esc(t)}</span>`).join('')}
              </div>
            ` : ''}
            <div class="art-actions">
              <button class="btn small primary" onclick="readArticle('${a.id}')">📖 مطالعه کامل</button>
              ${window.isAdmin ? `
                <div class="row" style="gap:4px">
                  <button class="btn small" onclick="openArticleEditor('${a.id}')" title="ویرایش">✎</button>
                  <button class="btn small danger" onclick="deleteArticle('${a.id}')" title="حذف">✕</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  window.openArticleEditor = function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: نگارش مقاله فقط برای مدیر سامانه مجاز است."); return; }
    let art = { id: 'art_' + Date.now(), title: '', category: 'حقوق مدنی', author: '', abstract: '', content: '', tags: [], coverImage: '', coverCaption: '', featured: false };
    if (id) {
      const found = window.getArticles().find(a => a.id === id);
      if (found) art = Object.assign({}, art, found);
    }

    const m = document.getElementById('modal');
    if (!m) return;

    window.__tmpArticleCover = art.coverImage || '';
    m.innerHTML = `
      <h2>${id ? 'ویرایش مقاله حقوقی' : 'نگارش و انتشار مقاله جدید'}</h2>
      <div class="form-grid">
        <div class="field" style="grid-column: 1 / -1;">
          <label>عنوان مقاله</label>
          <input id="edArtTitle" value="${esc(art.title)}" placeholder="مثلاً: تحلیل ماهیت حقوقی شرط وجه التزام در قراردادها">
        </div>
        <div class="field">
          <label>گرایش و دپارتمان حقوقی</label>
          <select id="edArtCat">
            <option ${art.category==='حقوق مدنی'?'selected':''}>حقوق مدنی</option>
            <option ${art.category==='حقوق تجارت'?'selected':''}>حقوق تجارت</option>
            <option ${art.category==='آیین دادرسی مدنی'?'selected':''}>آیین دادرسی مدنی</option>
            <option ${art.category==='حقوق جزا و جرم‌شناسی'?'selected':''}>حقوق جزا و جرم‌شناسی</option>
            <option ${art.category==='آیین دادرسی کیفری'?'selected':''}>آیین دادرسی کیفری</option>
            <option ${art.category==='رویه قضایی و دیوان عالی'?'selected':''}>رویه قضایی و دیوان عالی</option>
            <option ${art.category==='حقوق ثبت و املاک'?'selected':''}>حقوق ثبت و املاک</option>
            <option ${art.category==='کاربردی و حرفه‌ای وکالت'?'selected':''}>کاربردی و حرفه‌ای وکالت</option>
          </select>
        </div>
        <div class="field">
          <label>نام نویسنده / پژوهشگر</label>
          <input id="edArtAuthor" value="${esc(art.author || '')}" placeholder="دکتر ... / وکیل دادگستری">
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <label>تصویر شاخص / کاور مقاله در صفحه مجله (آپلود یا لینک)</label>
          <div class="baraat-photo-upload-box">
            <img id="edArtCoverPreview" class="baraat-photo-preview" src="${esc(window.__tmpArticleCover)}" style="${window.__tmpArticleCover ? '' : 'display:none;'}">
            <div style="flex:1; display:grid; gap:6px;">
              <div class="row" style="gap:6px; flex-wrap:wrap;">
                <input type="file" id="edArtCoverFile" accept="image/*" style="font-size:12px; flex:1;">
                <button type="button" class="btn small danger" id="edArtCoverClearBtn">حذف تصویر</button>
              </div>
              <input id="edArtCoverUrl" dir="ltr" value="${esc(window.__tmpArticleCover)}" placeholder="یا آدرس اینترنتی تصویر کاور را وارد کنید (اختیاری)">
            </div>
          </div>
        </div>
        <div class="field">
          <label>زیرنویس تصویر کاور (اختیاری)</label>
          <input id="edArtCoverCap" value="${esc(art.coverCaption || '')}" placeholder="توضیح کوتاه زیر تصویر">
        </div>
        <div class="field" style="justify-content:flex-end;">
          <label class="check" style="cursor:pointer; width:auto; border:0; padding:4px 0; background:transparent;">
            <input type="checkbox" id="edArtFeatured" ${art.featured ? 'checked' : ''}>
            <span>نمایش به عنوان پژوهش برگزیده صفحه مقالات</span>
          </label>
        </div>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>چکیده و مقدمه مقاله</label>
        <textarea id="edArtAbstract" rows="3" placeholder="خلاصه مسأله حقوقی و نتایج پژوهش...">${esc(art.abstract || '')}</textarea>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>متن کامل مقاله و استدلال‌های حقوقی</label>
        <textarea id="edArtContent" rows="8" placeholder="متن کامل، استناد به مواد قانونی، نقد آرا و نتیجه‌گیری...">${esc(art.content || '')}</textarea>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>کلمات کلیدی و برچسب‌ها (با ویرگول جدا کنید)</label>
        <input id="edArtTags" value="${esc((art.tags||[]).join(', '))}" placeholder="وجه التزام، ماده ۲۳۰، قوه قاهره">
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitArticle('${art.id}')">ذخیره و انتشار مقاله</button>
      </div>
    `;
    const fileEl = document.getElementById('edArtCoverFile');
    const urlEl = document.getElementById('edArtCoverUrl');
    const prevEl = document.getElementById('edArtCoverPreview');
    const clearBtn = document.getElementById('edArtCoverClearBtn');
    if (fileEl) {
      fileEl.onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const dataUrl = await compressImageFileToDataUrl(f, 1100, 0.8);
          window.__tmpArticleCover = dataUrl;
          if (urlEl) urlEl.value = dataUrl;
          if (prevEl) { prevEl.src = dataUrl; prevEl.style.display = 'block'; }
          if (typeof toast === 'function') toast('تصویر کاور آماده انتشار شد.');
        } catch (err) {
          if (typeof toast === 'function') toast('خواندن تصویر ناموفق بود');
        }
      };
    }
    if (urlEl) {
      urlEl.oninput = () => {
        window.__tmpArticleCover = urlEl.value.trim();
        if (prevEl) {
          if (window.__tmpArticleCover) { prevEl.src = window.__tmpArticleCover; prevEl.style.display = 'block'; }
          else prevEl.style.display = 'none';
        }
      };
    }
    if (clearBtn) {
      clearBtn.onclick = () => {
        window.__tmpArticleCover = '';
        if (urlEl) urlEl.value = '';
        if (fileEl) fileEl.value = '';
        if (prevEl) prevEl.style.display = 'none';
      };
    }
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitArticle = function(id) {
    const title = (document.getElementById('edArtTitle')?.value || '').trim();
    if (!title) return alert('لطفاً عنوان مقاله را وارد کنید.');

    const existing = window.getArticles().find(a => a.id === id);
    const category = document.getElementById('edArtCat')?.value || 'حقوق مدنی';
    const author = (document.getElementById('edArtAuthor')?.value || '').trim();
    const abstract = (document.getElementById('edArtAbstract')?.value || '').trim();
    const content = (document.getElementById('edArtContent')?.value || '').trim();
    const coverImage = (document.getElementById('edArtCoverUrl')?.value || window.__tmpArticleCover || '').trim();
    const coverCaption = (document.getElementById('edArtCoverCap')?.value || '').trim();
    const featured = !!document.getElementById('edArtFeatured')?.checked;
    const rawTags = (document.getElementById('edArtTags')?.value || '').split(/[,،؛-]/).map(t => t.trim()).filter(Boolean);

    window.saveArticle({
      id,
      title,
      category,
      author,
      abstract,
      content,
      coverImage,
      coverCaption,
      featured,
      tags: rawTags,
      date: existing && existing.date ? existing.date : new Date().toLocaleDateString('fa-IR')
    });
    closeModal();
  };

  window.readArticle = function(id) {
    const art = window.getArticles().find(a => a.id === id);
    if (!art) return;

    const m = document.getElementById('modal');
    if (!m) return;

    m.innerHTML = `
      <div class="read-article-container">
        <div class="art-head" style="margin-bottom:8px">
          <span class="art-tag">${esc(art.category)}</span>
          <span class="art-date">${toFa(art.date || '')}</span>
        </div>
        <h2 style="font-size:1.45rem; line-height:1.6; margin-bottom:6px">${esc(art.title)}</h2>
        ${art.author ? `<div style="color:var(--muted); font-size:13px; margin-bottom:14px">پژوهشگر: <b>${esc(art.author)}</b></div>` : ''}
        ${art.abstract ? `
          <div style="background:var(--soft); border-right:4px solid var(--main); padding:12px 16px; border-radius:10px; margin-bottom:18px; font-size:13.5px; line-height:2">
            <b>چکیده:</b> ${esc(art.abstract)}
          </div>
        ` : ''}
        <div style="font-size:14.5px; line-height:2.2; white-space:pre-wrap; color:var(--text);">${esc(art.content || 'متنی برای این مقاله ثبت نشده است.')}</div>
        ${(art.tags && art.tags.length) ? `
          <div class="art-tags" style="margin-top:20px; padding-top:14px; border-top:1px dashed var(--line);">
            ${art.tags.map(t => `<span class="tag-chip">#${esc(t)}</span>`).join('')}
          </div>
        ` : ''}
        <div class="modal-actions" style="margin-top:24px">
          <button class="btn" onclick="closeModal()">بستن</button>
        </div>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  // -------------------------------------------------------------------
  // ۲. ماژول مواعد قانونی (۱۵ موعد جامع حقوق ایران + قابل ادیت و اضافه کردن)
  // -------------------------------------------------------------------
  const DEADLINES_KEY = 'baraat_deadlines_v2';
  const DEFAULT_DEADLINES = [
    { id: 'dl_1', title: 'واخواهی از احکام غیابی دادگاه عمومی و انقلاب', law: 'ماده ۳۰۶ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'محکوم‌علیه غایب حق دارد ظرف ۲۰ روز (برای مقیمین داخل) یا ۲ ماه (برای مقیمین خارج) به حکم غیابی اعتراض و واخواهی کند.' },
    { id: 'dl_2', title: 'تجدیدنظرخواهی از احکام و قرارهای مدنی', law: 'ماده ۳۳۶ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'مهلت تجدیدنظرخواهی از آرای قابل تجدیدنظر دادگاه عمومی و انقلاب در دادگاه تجدیدنظر استان ۲۰ روز از تاریخ ابلاغ است.' },
    { id: 'dl_3', title: 'فرجام‌خواهی در دیوان عالی کشور', law: 'ماده ۳۹۷ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'مهلت فرجام‌خواهی نسبت به آرای قابل فرجام شعب تجدیدنظر استان در دیوان عالی کشور ۲۰ روز برای مقیمین داخل و ۲ ماه برای مقیمین خارج است.' },
    { id: 'dl_4', title: 'اعاده دادرسی در امور مدنی', law: 'ماده ۴۲۷ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'مهلت درخواست اعاده دادرسی ۲۰ روز از تاریخ ابلاغ حکم یا حادث شدن جهت اعاده (مثل کشف سند مکتوم یا اثبات جعل) است.' },
    { id: 'dl_5', title: 'رفع نقص دادخواست توسط خواهان', law: 'ماده ۵۴ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'مدیر دفتر دادگاه مراتب نقص دادخواست را به خواهان ابلاغ و از تاریخ ابلاغ ۱۰ روز مهلت برای رفع نقص و تکمیل هزینه می‌دهد.' },
    { id: 'dl_6', title: 'تبادل لوایح در مرحله تجدیدنظر', law: 'ماده ۳۴۶ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'تجدیدنظرخوانده می‌تواند ظرف ۱۰ روز از تاریخ ابلاغ دادخواست تجدیدنظر، پاسخ خود را به دفتر دادگاه تسلیم نماید.' },
    { id: 'dl_7', title: 'تبادل لوایح در مرحله فرجام‌خواهی', law: 'ماده ۳۸۵ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 20, cat: 'مدنی', desc: 'فرجام‌خوانده می‌تواند ظرف ۲۰ روز از ابلاغ دادخواست فرجامی، پاسخ کتبی خود را ارسال نماید.' },
    { id: 'dl_8', title: 'اعتراض به قرار رد دادخواست', law: 'ماده ۳۳۲ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'قرار رد دادخواست صادره توسط مدیر دفتر ظرف ۱۰ روز از تاریخ ابلاغ قابل شکایت در دادگاه است.' },
    { id: 'dl_9', title: 'تجدیدنظرخواهی و فرجام‌خواهی کیفری', law: 'ماده ۴۳۱ قانون آیین دادرسی کیفری', daysIran: 20, daysAbroad: 60, cat: 'کیفری', desc: 'مهلت تجدیدنظرخواهی یا فرجام‌خواهی از احکام و قرارهای کیفری دادگاه‌ها ۲۰ روز برای مقیمین ایران و ۲ ماه برای مقیمین خارج است.' },
    { id: 'dl_10', title: 'اعتراض به قرار منع یا موقوفی تعقیب دادسرا', law: 'ماده ۲۷۰ قانون آیین دادرسی کیفری', daysIran: 10, daysAbroad: 30, cat: 'کیفری', desc: 'شاکی حق دارد ظرف ۱۰ روز از ابلاغ قرار منع یا موقوفی تعقیب بازپرس/دادیار در دادگاه کیفری ذی‌صلاح اعتراض نماید.' },
    { id: 'dl_11', title: 'اعتراض به قرار تأمین خواسته یا دستور موقت', law: 'ماده ۱۱۶ و ۳۲۵ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'خوانده حق دارد ظرف ۱۰ روز پس از ابلاغ قرار تأمین خواسته به آن اعتراض کند.' },
    { id: 'dl_12', title: 'اعتراض به نظریه کارشناس رسمی دادگستری', law: 'ماده ۲۶۰ قانون آیین دادرسی مدنی', daysIran: 7, daysAbroad: 7, cat: 'مدنی', desc: 'طرفین دعوا می‌توانند ظرف ۷ روز از تاریخ ابلاغ نظریه کارشناسی، اعتراض کتبی و مستدل خود را تسلیم دادگاه نمایند.' },
    { id: 'dl_13', title: 'دادخواهی در شعب دیوان عدالت اداری', law: 'ماده ۱۶ قانون دیوان عدالت اداری', daysIran: 90, daysAbroad: 180, cat: 'اداری', desc: 'مهلت طرح دادخواست نسبت به آرای قطعی هیأت‌ها و کمیسیون‌های شبه‌قضایی ۳ ماه برای مقیمین داخل و ۶ ماه برای مقیمین خارج است.' },
    { id: 'dl_14', title: 'اعتراض به تصمیم ثبتی افراز ملک مشاع', law: 'ماده ۲ قانون فروش و افراز املاک مشاع', daysIran: 10, daysAbroad: 10, cat: 'ثبتی', desc: 'تصمیم واحد ثبتی مبنی بر عدم قابلیت افراز ظرف ۱۰ روز از ابلاغ در دادگاه عمومی حقوقی محل ملک قابل اعتراض است.' },
    { id: 'dl_15', title: 'شکایت از آرای هیأت‌های حل اختلاف کار', law: 'ماده ۱۵۹ قانون کار', daysIran: 15, daysAbroad: 15, cat: 'کارگری', desc: 'آرای قطعی هیأت حل اختلاف کار پس از ابلاغ، ظرف مهلت قانونی در دیوان عدالت اداری قابل اعتراض است.' }
  ];

  window.getDeadlines = function() {
    try {
      const data = localStorage.getItem(DEADLINES_KEY);
      return data ? JSON.parse(data) : DEFAULT_DEADLINES;
    } catch(e) {
      return DEFAULT_DEADLINES;
    }
  };

  window.saveDeadline = async function(dl) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: تغییر مواعد فقط برای مدیر مجاز است."); return; }
    const list = window.getDeadlines();
    const idx = list.findIndex(d => d.id === dl.id);
    if (idx >= 0) list[idx] = dl;
    else list.push(dl);
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(list));
    window.renderDeadlines();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(DEADLINES_KEY, list);
    if (res.ok) {
      if (typeof toast === 'function') toast('موعد قانونی روی سرور ذخیره شد.');
    } else {
      if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  };

  window.deleteDeadline = async function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف مواعد فقط برای مدیر مجاز است."); return; }
    if (!confirm('آیا از حذف این موعد قانونی اطمینان دارید؟')) return;
    const list = window.getDeadlines().filter(d => d.id !== id);
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(list));
    window.renderDeadlines();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(DEADLINES_KEY, list);
    if (res.ok) {
      if (typeof toast === 'function') toast('موعد از سرور حذف شد.');
    } else {
      if (typeof toast === 'function') toast('حذف محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  };

  window.resetDefaultDeadlines = async function() {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: بازنشانی مواعد فقط برای مدیر مجاز است."); return; }
    if (!confirm('آیا مایلید تمام مواعد قانونی به لیست استاندارد ۱۵ گانه بازنشانی شوند؟')) return;
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(DEFAULT_DEADLINES));
    window.renderDeadlines();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(DEADLINES_KEY, DEFAULT_DEADLINES);
    if (res.ok) {
      if (typeof toast === 'function') toast('مواعد پیش‌فرض روی سرور بازنشانی شد.');
    } else {
      if (typeof toast === 'function') toast('خطای سرور: ' + res.error);
    }
  };

  // -------------------------------------------------------------------
  // ابزار تقویم شمسی (جلالی) دقیق و ثبت آلارم در تقویم گوشی (.ics / Google Calendar)
  // -------------------------------------------------------------------
  const JALALI_MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];
  const PERSIAN_WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
  const pad2 = n => String(n).padStart(2, '0');
  const divInt = (a, b) => ~~(a / b);
  const modInt = (a, b) => a - ~~(a / b) * b;

  function jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    const bl = breaks.length, gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jm, jump, leap, leapG, march, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + divInt(jump, 33) * 8 + divInt(modInt(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + divInt(n, 33) * 8 + divInt(modInt(n, 33) + 3, 4);
    if (modInt(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = divInt(gy, 4) - divInt((divInt(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + divInt(jump + 4, 33) * 33;
    leap = modInt(modInt(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  function g2d(gy, gm, gd) {
    let d = divInt((gy + divInt(gm - 8, 6) + 100100) * 1461, 4) + divInt(153 * modInt(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - divInt(divInt(gy + 100100 + divInt(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + divInt(divInt(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = divInt(modInt(j, 1461), 4) * 5 + 308;
    const gd = divInt(modInt(i, 153), 5) + 1;
    const gm = modInt(divInt(i, 153), 12) + 1;
    const gy = divInt(j, 1461) - 100100 + divInt(8 - gm, 6);
    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - divInt(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + divInt(k, 31);
        jd = modInt(k, 31) + 1;
        return { jy, jm, jd };
      } else {
        k -= 186;
      }
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + divInt(k, 30);
    jd = modInt(k, 30) + 1;
    return { jy, jm, jd };
  }

  function g2j(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function j2g(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
  function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return jalCal(jy).leap === 0 ? 30 : 29;
  }

  function parseLocalGregorian(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    }
    const [y, m, d] = isoStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  function toLocalIsoDate(dt) {
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  function formatJalaliFull(dt) {
    const j = g2j(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    const wd = PERSIAN_WEEKDAYS[dt.getDay()];
    const numeric = `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
    const named = `${wd} ${toFa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFa(j.jy)}`;
    return { jy: j.jy, jm: j.jm, jd: j.jd, numeric, numericFa: toFa(numeric), named, wd };
  }

  function populateJalaliDayOptions(daySel, jy, jm, selectedDay) {
    if (!daySel) return;
    const maxDays = jalaliMonthLength(jy, jm);
    const targetDay = Math.min(Number(selectedDay) || 1, maxDays);
    let html = '';
    for (let d = 1; d <= maxDays; d++) {
      html += `<option value="${d}" ${d === targetDay ? 'selected' : ''}>${toFa(d)}</option>`;
    }
    daySel.innerHTML = html;
  }

  function syncHiddenDateFromJalaliPicker() {
    const ySel = document.getElementById('calcDlJYear');
    const mSel = document.getElementById('calcDlJMonth');
    const dSel = document.getElementById('calcDlJDay');
    const hidden = document.getElementById('calcDlDate');
    if (!ySel || !mSel || !dSel || !hidden) return;
    const jy = Number(ySel.value);
    const jm = Number(mSel.value);
    const jd = Number(dSel.value);
    const g = j2g(jy, jm, jd);
    hidden.value = `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
  }

  window.initJalaliPicker = function() {
    const ySel = document.getElementById('calcDlJYear');
    const mSel = document.getElementById('calcDlJMonth');
    const dSel = document.getElementById('calcDlJDay');
    const hidden = document.getElementById('calcDlDate');
    if (!ySel || !mSel || !dSel || !hidden) return;
    if (ySel.options.length > 0 && hidden.value) return;

    const now = new Date();
    const curJ = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const minY = curJ.jy - 4;
    const maxY = curJ.jy + 3;

    let yHtml = '';
    for (let y = minY; y <= maxY; y++) {
      yHtml += `<option value="${y}" ${y === curJ.jy ? 'selected' : ''}>${toFa(y)}</option>`;
    }
    ySel.innerHTML = yHtml;

    let mHtml = '';
    for (let m = 1; m <= 12; m++) {
      mHtml += `<option value="${m}" ${m === curJ.jm ? 'selected' : ''}>${JALALI_MONTHS[m - 1]}</option>`;
    }
    mSel.innerHTML = mHtml;

    populateJalaliDayOptions(dSel, curJ.jy, curJ.jm, curJ.jd);
    syncHiddenDateFromJalaliPicker();
  };

  window.setJalaliToday = function(skipCompute) {
    const ySel = document.getElementById('calcDlJYear');
    const mSel = document.getElementById('calcDlJMonth');
    const dSel = document.getElementById('calcDlJDay');
    if (!ySel || !mSel || !dSel) return;
    if (!ySel.options.length) window.initJalaliPicker();

    const now = new Date();
    const curJ = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
    ySel.value = String(curJ.jy);
    mSel.value = String(curJ.jm);
    populateJalaliDayOptions(dSel, curJ.jy, curJ.jm, curJ.jd);
    syncHiddenDateFromJalaliPicker();
    if (!skipCompute) window.computeDeadlineResult();
  };

  window.onJalaliMonthOrYearChange = function() {
    const ySel = document.getElementById('calcDlJYear');
    const mSel = document.getElementById('calcDlJMonth');
    const dSel = document.getElementById('calcDlJDay');
    if (!ySel || !mSel || !dSel) return;
    populateJalaliDayOptions(dSel, Number(ySel.value), Number(mSel.value), Number(dSel.value));
    syncHiddenDateFromJalaliPicker();
    window.computeDeadlineResult();
  };

  window.onJalaliDateChange = function() {
    syncHiddenDateFromJalaliPicker();
    window.computeDeadlineResult();
  };

  window.computeDeadlineResult = function() {
    window.initJalaliPicker();
    const list = window.getDeadlines();
    const selId = document.getElementById('calcDlSelect')?.value;
    const cur = list.find(d => d.id === selId) || list[0];
    if (!cur) return;

    const notifStr = document.getElementById('calcDlDate')?.value || toLocalIsoDate(new Date());
    const isAbroad = document.getElementById('calcDlAbroad')?.checked || false;

    const days = isAbroad ? Number(cur.daysAbroad) : Number(cur.daysIran);
    const date = parseLocalGregorian(notifStr);

    // ماده ۴۴۳-۴۴۵ ق.آ.د.م: روز ابلاغ و اقدام جزو مدت نیست
    date.setDate(date.getDate() + days + 1);

    // اگر جمعه بود به روز شنبه موکول می‌شود
    if (date.getDay() === 5) {
      date.setDate(date.getDate() + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const jInfo = formatJalaliFull(date);
    const isoTarget = toLocalIsoDate(date);

    window.__lastDeadlineCalc = {
      id: cur.id,
      title: cur.title,
      law: cur.law,
      days,
      isoTarget,
      gy: date.getFullYear(),
      gm: date.getMonth() + 1,
      gd: date.getDate(),
      jalali: jInfo
    };

    const out = document.getElementById('calcDlOutput');
    if (out) {
      out.innerHTML = `
        <div class="dl-result-card">
          <div class="row between" style="gap:8px; flex-wrap:wrap;">
            <span style="font-size:12px; color:var(--muted)">آخرین مهلت قانونی تقدیم دادخواست / لایحه:</span>
            <span class="pill ${diffDays >= 0 ? 'done' : 'danger'} font-mono">${diffDays >= 0 ? toFa(diffDays) + ' روز باقیمانده' : 'مهلت منقضی شده'}</span>
          </div>
          <div class="row between" style="margin:10px 0 6px; gap:10px; flex-wrap:wrap; align-items:center;">
            <div>
              <div style="font-size:21px; font-weight:800; color:var(--main); line-height:1.5;">
                ${jInfo.named}
              </div>
              <div style="font-size:13px; color:var(--muted); margin-top:2px;">
                تاریخ شمسی: <b style="color:var(--text);">${jInfo.numericFa}</b> <span style="margin:0 6px;">·</span> <span dir="ltr" style="font-size:12px;">(${isoTarget})</span>
              </div>
            </div>
            <button type="button" class="btn primary" onclick="openDeadlineAlarmModal()" title="تنظیم آلارم در تقویم گوشی" style="display:inline-flex; align-items:center; gap:7px; padding:9px 14px; border-radius:12px;">
              <span style="font-size:16px;">🔔</span>
              <span>آلارم در تقویم گوشی</span>
            </button>
          </div>
          <p style="font-size:12.5px; color:var(--text); line-height:1.8; margin:8px 0 0;">
            بر مبنای <b>${toFa(days)} روز قانونی</b> (${esc(cur.law)}) با اعمال قاعده عدم احتساب روز ابلاغ و اقدام و انتقال روز آخر تعطیل به اولین روز کاری پس از تعطیل (مواد ۴۴۳ الی ۴۴۵ ق.آ.د.م).
          </p>
        </div>
      `;
    }
  };

  window.openDeadlineAlarmModal = function(dlId) {
    if (dlId) {
      const sel = document.getElementById('calcDlSelect');
      if (sel) sel.value = dlId;
      window.computeDeadlineResult();
    } else if (!window.__lastDeadlineCalc) {
      window.computeDeadlineResult();
    }
    const info = window.__lastDeadlineCalc;
    const m = document.getElementById('modal');
    if (!m || !info) return;

    const now = new Date();
    const curJ = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const minY = curJ.jy - 2;
    const maxY = curJ.jy + 4;
    let yOpts = '';
    for (let y = minY; y <= maxY; y++) {
      yOpts += `<option value="${y}" ${y === info.jalali.jy ? 'selected' : ''}>${toFa(y)}</option>`;
    }
    let mOpts = '';
    for (let mo = 1; mo <= 12; mo++) {
      mOpts += `<option value="${mo}" ${mo === info.jalali.jm ? 'selected' : ''}>${JALALI_MONTHS[mo - 1]}</option>`;
    }

    m.innerHTML = `
      <h2>🔔 تنظیم آلارم موعد قانونی در تقویم گوشی</h2>
      <p class="muted small" style="margin-bottom:14px; line-height:1.8;">
        روز و ساعت دلخواه را انتخاب کنید تا آلارم مستقیماً روی تقویم گوشی شما (آیفون یا اندروید) ثبت شود.
      </p>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1;">
          <label>عنوان یادآور / نام پرونده</label>
          <input id="alarmTitleInput" value="${esc('موعد قانونی: ' + info.title)}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>تاریخ آلارم (شمسی)</label>
          <div class="row" style="gap:6px; flex-wrap:nowrap;">
            <select id="alarmJDay" onchange="updateAlarmCalendarLinks()" style="flex:1;"></select>
            <select id="alarmJMonth" onchange="onAlarmMonthOrYearChange()" style="flex:1.4;">${mOpts}</select>
            <select id="alarmJYear" onchange="onAlarmMonthOrYearChange()" style="flex:1.1;">${yOpts}</select>
          </div>
          <div id="alarmDatePreview" class="muted small" style="margin-top:5px;"></div>
        </div>
        <div class="field">
          <label>ساعت آلارم (دلخواه)</label>
          <input id="alarmTimeInput" type="time" value="09:00" dir="ltr" onchange="updateAlarmCalendarLinks()" oninput="updateAlarmCalendarLinks()">
        </div>
        <div class="field">
          <label>زنگ هشدار یادآور</label>
          <select id="alarmNotifyOffset" onchange="updateAlarmCalendarLinks()">
            <option value="0">درست در همین ساعت انتخابی</option>
            <option value="15">۱۵ دقیقه قبل + همین ساعت</option>
            <option value="60">۱ ساعت قبل + همین ساعت</option>
            <option value="1440">۱ روز قبل + همین ساعت</option>
          </select>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label style="font-size:11.5px; color:var(--muted);">انتخاب سریع ساعت:</label>
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn small" onclick="setAlarmQuickTime('08:00')">۰۸:۰۰ صبح</button>
            <button type="button" class="btn small" onclick="setAlarmQuickTime('10:00')">۱۰:۰۰ صبح</button>
            <button type="button" class="btn small" onclick="setAlarmQuickTime('12:00')">۱۲:۰۰ ظهر</button>
            <button type="button" class="btn small" onclick="setAlarmQuickTime('15:00')">۱۵:۰۰ عصر</button>
            <button type="button" class="btn small" onclick="setAlarmQuickTime('18:00')">۱۸:۰۰ عصر</button>
            <button type="button" class="btn small" onclick="setAlarmQuickTime('20:00')">۲۰:۰۰ شب</button>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>توضیحات / مستند قانونی</label>
          <textarea id="alarmDescInput" rows="2" oninput="updateAlarmCalendarLinks()">${esc('مستند: ' + info.law + ' — ثبت‌شده از سامانه گروه حقوقی برائت')}</textarea>
        </div>
      </div>
      <div class="modal-actions" style="flex-wrap:wrap; gap:8px; justify-content:space-between; margin-top:18px;">
        <button type="button" class="btn" onclick="closeModal()">بستن</button>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <a id="alarmGCalLink" href="#" target="_blank" rel="noopener noreferrer" class="btn" style="text-decoration:none;">📅 تقویم گوگل</a>
          <button type="button" class="btn primary" onclick="downloadDeadlineICS()">🔔 ذخیره در تقویم گوشی (آلارم)</button>
        </div>
      </div>
    `;

    const dSel = document.getElementById('alarmJDay');
    populateJalaliDayOptions(dSel, info.jalali.jy, info.jalali.jm, info.jalali.jd);
    window.updateAlarmCalendarLinks();
    document.getElementById('modalBack').classList.add('show');
  };

  window.onAlarmMonthOrYearChange = function() {
    const jy = Number(document.getElementById('alarmJYear')?.value);
    const jm = Number(document.getElementById('alarmJMonth')?.value);
    const dSel = document.getElementById('alarmJDay');
    populateJalaliDayOptions(dSel, jy, jm, Number(dSel?.value));
    window.updateAlarmCalendarLinks();
  };

  window.setAlarmQuickTime = function(val) {
    const t = document.getElementById('alarmTimeInput');
    if (t) {
      t.value = val;
      window.updateAlarmCalendarLinks();
    }
  };

  function getAlarmFormData() {
    const jy = Number(document.getElementById('alarmJYear')?.value) || 1405;
    const jm = Number(document.getElementById('alarmJMonth')?.value) || 1;
    const jd = Number(document.getElementById('alarmJDay')?.value) || 1;
    const g = j2g(jy, jm, jd);
    const dt = new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
    const jFull = formatJalaliFull(dt);
    const timeStr = (document.getElementById('alarmTimeInput')?.value || '09:00').trim();
    const [hh, mm] = (timeStr.match(/^\d{2}:\d{2}$/) ? timeStr : '09:00').split(':').map(Number);
    const endDt = new Date(g.gy, g.gm - 1, g.gd, hh, mm + 30, 0);
    const title = (document.getElementById('alarmTitleInput')?.value || 'موعد قانونی برائت').trim();
    const desc = (document.getElementById('alarmDescInput')?.value || '').trim();
    const extraOffset = Number(document.getElementById('alarmNotifyOffset')?.value || 0);
    return { g, jFull, hh, mm, endDt, title, desc, extraOffset };
  }

  window.updateAlarmCalendarLinks = function() {
    const data = getAlarmFormData();
    const prev = document.getElementById('alarmDatePreview');
    if (prev) {
      prev.innerHTML = `${data.jFull.named} (${data.jFull.numericFa}) ساعت ${toFa(pad2(data.hh))}:${toFa(pad2(data.mm))}`;
    }
    const gLink = document.getElementById('alarmGCalLink');
    if (gLink) {
      const startStamp = `${data.g.gy}${pad2(data.g.gm)}${pad2(data.g.gd)}T${pad2(data.hh)}${pad2(data.mm)}00`;
      const endStamp = `${data.endDt.getFullYear()}${pad2(data.endDt.getMonth() + 1)}${pad2(data.endDt.getDate())}T${pad2(data.endDt.getHours())}${pad2(data.endDt.getMinutes())}00`;
      const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + '&text=' + encodeURIComponent(data.title)
        + '&dates=' + encodeURIComponent(startStamp + '/' + endStamp)
        + '&ctz=Asia/Tehran'
        + '&details=' + encodeURIComponent(data.desc + '\nتاریخ شمسی: ' + data.jFull.numericFa);
      gLink.href = url;
    }
  };

  window.downloadDeadlineICS = function() {
    const data = getAlarmFormData();
    const startDt = new Date(data.g.gy, data.g.gm - 1, data.g.gd, data.hh, data.mm, 0);
    if (window.BaraatAndroid && typeof window.BaraatAndroid.addCalendarEvent === 'function') {
      window.BaraatAndroid.addCalendarEvent(
        data.title,
        data.desc + ' | تاریخ شمسی: ' + data.jFull.numericFa,
        startDt.getTime(),
        data.endDt.getTime()
      );
      return;
    }
    const startStamp = `${data.g.gy}${pad2(data.g.gm)}${pad2(data.g.gd)}T${pad2(data.hh)}${pad2(data.mm)}00`;
    const endStamp = `${data.endDt.getFullYear()}${pad2(data.endDt.getMonth() + 1)}${pad2(data.endDt.getDate())}T${pad2(data.endDt.getHours())}${pad2(data.endDt.getMinutes())}00`;
    const now = new Date();
    const utcStamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    const escIcs = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

    const alarms = [
      'BEGIN:VALARM',
      'TRIGGER:PT0M',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + escIcs(data.title),
      'END:VALARM'
    ];
    if (data.extraOffset > 0) {
      alarms.push(
        'BEGIN:VALARM',
        `TRIGGER:-PT${data.extraOffset}M`,
        'ACTION:DISPLAY',
        'DESCRIPTION:' + escIcs('یادآور زودهنگام: ' + data.title),
        'END:VALARM'
      );
    }

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Baraat Legal Group//Deadlines//FA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:baraat-${Date.now()}@baraat.ir`,
      `DTSTAMP:${utcStamp}`,
      `DTSTART:${startStamp}`,
      `DTEND:${endStamp}`,
      `SUMMARY:${escIcs(data.title)}`,
      `DESCRIPTION:${escIcs(data.desc + ' | تاریخ شمسی: ' + data.jFull.numericFa)}`,
      ...alarms,
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baraat-deadline-${data.jFull.jy}-${pad2(data.jFull.jm)}-${pad2(data.jFull.jd)}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    if (typeof toast === 'function') toast('فایل تقویم آماده شد؛ آن را باز کنید تا آلارم در تقویم گوشی ثبت شود.');
  };

  window.renderDeadlines = function() {
    window.initJalaliPicker();
    const list = window.getDeadlines();
    
    // پر کردن دراپ‌داون محاسبه‌گر ثنا
    const sel = document.getElementById('calcDlSelect');
    if (sel) {
      const prevVal = sel.value;
      sel.innerHTML = list.map(d => `<option value="${d.id}">${esc(d.title)} (${toFa(d.daysIran)} روز)</option>`).join('');
      if (prevVal && list.some(d => d.id === prevVal)) sel.value = prevVal;
      window.computeDeadlineResult();
    }

    // رندر کارت‌های مواعد در تب اصلی
    const grid = document.getElementById('deadlinesGrid');
    if (grid) {
      grid.innerHTML = list.map(d => `
        <div class="deadline-item-card">
          <div class="row between">
            <span class="pill">${esc(d.cat || 'عمومی')}</span>
            <span style="font-size:12px; font-weight:bold; color:var(--main);">${toFa(d.daysIran)} روز داخل / ${toFa(d.daysAbroad)} روز خارج</span>
          </div>
          <h4 style="margin:8px 0 4px; font-size:14.5px;">${esc(d.title)}</h4>
          <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">مستند: <b>${esc(d.law)}</b></div>
          <p style="font-size:12.5px; color:var(--text); line-height:1.7; margin:0 0 10px;">${esc(d.desc || '')}</p>
          <div class="row between" style="gap:6px; align-items:center;">
            <button class="btn small" onclick="openDeadlineAlarmModal('${d.id}')" title="تنظیم آلارم در تقویم گوشی" style="display:inline-flex; align-items:center; gap:4px;">
              <span>🔔</span>
              <span>آلارم تقویم</span>
            </button>
            ${window.isAdmin ? `
              <div class="row" style="gap:6px;">
                <button class="btn small" onclick="openDeadlineEditor('${d.id}')">✎ ویرایش</button>
                <button class="btn small danger" onclick="deleteDeadline('${d.id}')">✕ حذف</button>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('');
    }
  };

  window.openDeadlineEditor = function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ویرایش مواعد فقط برای مدیر مجاز است."); return; }
    let dl = { id: 'dl_' + Date.now(), title: '', law: '', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: '' };
    if (id) {
      const found = window.getDeadlines().find(d => d.id === id);
      if (found) dl = found;
    }

    const m = document.getElementById('modal');
    if (!m) return;

    m.innerHTML = `
      <h2>${id ? 'ویرایش موعد قانونی' : 'افزودن موعد قانونی جدید'}</h2>
      <div class="form-grid">
        <div class="field" style="grid-column: 1 / -1;">
          <label>عنوان اقدام یا موعد قانونی</label>
          <input id="edDlTitle" value="${esc(dl.title)}" placeholder="مثلاً: اعتراض به قرار اناطه">
        </div>
        <div class="field">
          <label>مستند قانونی (ماده و قانون)</label>
          <input id="edDlLaw" value="${esc(dl.law)}" placeholder="مثلاً: ماده ۱۹ قانون آیین دادرسی مدنی">
        </div>
        <div class="field">
          <label>حوزه / دسته‌بندی</label>
          <select id="edDlCat">
            <option ${dl.cat==='مدنی'?'selected':''}>مدنی</option>
            <option ${dl.cat==='کیفری'?'selected':''}>کیفری</option>
            <option ${dl.cat==='ثبتی'?'selected':''}>ثبتی</option>
            <option ${dl.cat==='اداری'?'selected':''}>اداری</option>
            <option ${dl.cat==='کارگری'?'selected':''}>کارگری</option>
            <option ${dl.cat==='خانواده'?'selected':''}>خانواده</option>
          </select>
        </div>
        <div class="field">
          <label>مهلت برای اشخاص مقیم ایران (به روز)</label>
          <input type="number" id="edDlIran" value="${dl.daysIran}">
        </div>
        <div class="field">
          <label>مهلت برای اشخاص مقیم خارج از کشور (به روز)</label>
          <input type="number" id="edDlAbroad" value="${dl.daysAbroad}">
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <label>توضیحات و ضمانت‌اجرای انقضای مهلت</label>
          <textarea id="edDlDesc" rows="3">${esc(dl.desc || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitDeadline('${dl.id}')">ذخیره موعد</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitDeadline = function(id) {
    const title = (document.getElementById('edDlTitle')?.value || '').trim();
    if (!title) return alert('لطفاً عنوان موعد را وارد کنید.');

    const law = (document.getElementById('edDlLaw')?.value || '').trim();
    const cat = document.getElementById('edDlCat')?.value || 'مدنی';
    const daysIran = Number(document.getElementById('edDlIran')?.value) || 20;
    const daysAbroad = Number(document.getElementById('edDlAbroad')?.value) || 60;
    const desc = (document.getElementById('edDlDesc')?.value || '').trim();

    window.saveDeadline({ id, title, law, cat, daysIran, daysAbroad, desc });
    closeModal();
  };

  // -------------------------------------------------------------------
  // ۳. ماژول محاسبه‌گر حقوقی (هزینه دادرسی، خسارت، حق‌الوکاله + فرمول‌های سفارشی)
  // -------------------------------------------------------------------
  const CALC_CUSTOM_KEY = 'baraat_custom_calcs_v2';
  const DEFAULT_CUSTOM_CALCS = [
    { id: 'c_arb', title: 'حق‌الزحمه داوری', type: 'percent', rate: 1.5, desc: 'محاسبه بر مبنای ۱.۵ درصد از مبلغ خواسته ارجاعی به داوری طبق آیین‌نامه تعرفه داوری' },
    { id: 'c_reg', title: 'حق‌الثبت اسناد مالی دفاتر اسناد', type: 'percent', rate: 0.5, desc: 'نیم درصد ارزش معاملاتی طبق قانون ثبت اسناد و املاک' },
    { id: 'c_exp', title: 'حق‌الزحمه ارزیابی کارشناس رسمی', type: 'percent', rate: 0.25, desc: 'تعرفه ارزیابی دارایی‌ها بر مبنای درصدی از ارزش روز طبق جدول کانون کارشناسان' },
    { id: 'c_delay', title: 'خسارت روزشمار تأخیر در تحویل مبیع / ملک', type: 'daily', rate: 0.1, desc: 'یک در هزار ارزش قرارداد به ازای هر روز تأخیر' }
  ];

  window.getCustomCalculators = function() {
    try {
      const data = localStorage.getItem(CALC_CUSTOM_KEY);
      return data ? JSON.parse(data) : DEFAULT_CUSTOM_CALCS;
    } catch(e) {
      return DEFAULT_CUSTOM_CALCS;
    }
  };

  window.saveCustomCalculator = async function(c) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ثبت فرمول فقط برای مدیر مجاز است."); return; }
    const list = window.getCustomCalculators();
    const idx = list.findIndex(item => item.id === c.id);
    if (idx >= 0) list[idx] = c;
    else list.push(c);
    localStorage.setItem(CALC_CUSTOM_KEY, JSON.stringify(list));
    window.renderCalculators();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(CALC_CUSTOM_KEY, list);
    if (res.ok) {
      if (typeof toast === 'function') toast('محاسبه‌گر روی سرور ذخیره شد.');
    } else {
      if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  };

  window.deleteCustomCalculator = async function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف فرمول فقط برای مدیر مجاز است."); return; }
    if (!confirm('آیا از حذف این محاسبه‌گر اطمینان دارید؟')) return;
    const list = window.getCustomCalculators().filter(item => item.id !== id);
    localStorage.setItem(CALC_CUSTOM_KEY, JSON.stringify(list));
    window.renderCalculators();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const res = await syncToSupabase(CALC_CUSTOM_KEY, list);
    if (res.ok) {
      if (typeof toast === 'function') toast('محاسبه‌گر از سرور حذف شد.');
    } else {
      if (typeof toast === 'function') toast('حذف محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  };

  // -------------------------------------------------------------------
  // ۳. ماژول محاسبه‌گر یکپارچه و منظم (مهریه، ارث، دیه، هزینه دادرسی، حق‌الوکاله، خسارت تأخیر)
  // -------------------------------------------------------------------
  const CPI_INDICES = {
    1350: 0.014, 1351: 0.015, 1352: 0.017, 1353: 0.020, 1354: 0.022,
    1355: 0.025, 1356: 0.032, 1357: 0.035, 1358: 0.039, 1359: 0.048,
    1360: 0.059, 1361: 0.070, 1362: 0.081, 1363: 0.089, 1364: 0.095,
    1365: 0.118, 1366: 0.150, 1367: 0.193, 1368: 0.227, 1369: 0.248,
    1370: 0.299, 1371: 0.372, 1372: 0.457, 1373: 0.618, 1374: 0.923,
    1375: 1.137, 1376: 1.334, 1377: 1.576, 1378: 1.892, 1379: 2.131,
    1380: 2.374, 1381: 2.748, 1382: 3.178, 1383: 3.662, 1384: 4.041,
    1385: 4.521, 1386: 5.354, 1387: 6.712, 1388: 7.437, 1389: 8.356,
    1390: 10.15, 1391: 13.25, 1392: 17.85, 1393: 20.64, 1394: 23.10,
    1395: 25.17, 1396: 27.59, 1397: 36.19, 1398: 51.12, 1399: 69.72,
    1400: 102.0, 1401: 149.4, 1402: 210.2, 1403: 280.1, 1404: 372.5, 1405: 465.0
  };

  const CALC_TYPES = [
    { id: 'mehrieh', icon: '💍', title: 'مهریه به نرخ روز', sub: 'تبصره ماده ۱۰۸۲ ق.م' },
    { id: 'inheritance', icon: '📜', title: 'تقسیم ارث', sub: 'سهام قانونی ورثه' },
    { id: 'diyah', icon: '⚖️', title: 'دیه کامل و اعضا', sub: 'دیات نفس و جراحات' },
    { id: 'court', icon: '🏛️', title: 'هزینه دادرسی', sub: 'بدوی، تجدیدنظر، فرجام' },
    { id: 'attorney', icon: '💼', title: 'تعرفه حق‌الوکاله', sub: 'مراحل و سهم تمبر' },
    { id: 'late', icon: '⏱️', title: 'خسارت تأخیر تأدیه', sub: 'فرمول ماده ۵۲۲ ق.آ.د.م' },
    { id: 'custom', icon: '⚙️', title: 'فرمول‌های سفارشی', sub: 'محاسبه‌گرهای مدیر' }
  ];

  let activeCalcType = 'mehrieh';

  const DIYAH_PRESETS = [
    { id: 'full', label: 'دیه کامل انسان / قتل نفس (۱۰۰٪)', frac: 1, headBonusNote: false },
    { id: 'organ_pair', label: 'نقص یک عضو زوج مثل چشم یا دست یا پا (۵۰٪)', frac: 0.5, headBonusNote: false },
    { id: 'hariseh', label: 'جراحت حارصه — خراش پوست بدون خونریزی (۱٪)', frac: 0.01, headBonusNote: true },
    { id: 'damiyeh', label: 'جراحت دامیه — ورود به گوشت با خونریزی اندک (۲٪)', frac: 0.02, headBonusNote: true },
    { id: 'motelahimeh', label: 'جراحت متلاحمه — بریدگی عمیق گوشت بدون رسیدن به پوست استخوان (۳٪)', frac: 0.03, headBonusNote: true },
    { id: 'semhagh', label: 'جراحت سمحاق — رسیدن به پوست روی استخوان (۴٪)', frac: 0.04, headBonusNote: true },
    { id: 'mowzeheh', label: 'جراحت موضحه — آشکار شدن سفیدی استخوان (۵٪)', frac: 0.05, headBonusNote: true },
    { id: 'hashemeh', label: 'جراحت هاشمه — شکستن استخوان بدون جابجایی (۱۰٪)', frac: 0.10, headBonusNote: true },
    { id: 'monaghaleh', label: 'جراحت منقله — شکستگی نیازمند جااندازی استخوان (۱۵٪)', frac: 0.15, headBonusNote: true },
    { id: 'mamumeh', label: 'جراحت مأمومه — رسیدن شکستگی به پرده مغز (یک‌سوم / ۳۳.۳۳٪)', frac: 1 / 3, headBonusNote: true },
    { id: 'damegheh', label: 'جراحت دامغه — پاره شدن پرده مغز (۵۰٪)', frac: 0.5, headBonusNote: true },
    { id: 'custom', label: 'درصد دلخواه از دیه کامل (%)', frac: null, headBonusNote: false }
  ];

  function buildYearOptions(minY, maxY, defY) {
    let html = '';
    for (let y = maxY; y >= minY; y--) {
      html += `<option value="${y}" ${y === defY ? 'selected' : ''}>${toFa(y)}</option>`;
    }
    return html;
  }

  let calcDropdownOpen = false;

  window.toggleCalcDropdown = function(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    calcDropdownOpen = !calcDropdownOpen;
    const trig = document.getElementById('calcDdTrigger');
    const menu = document.getElementById('calcDdMenu');
    if (trig) trig.classList.toggle('open', calcDropdownOpen);
    if (menu) menu.classList.toggle('show', calcDropdownOpen);
  };

  document.addEventListener('click', function(ev) {
    if (!calcDropdownOpen) return;
    const wrap = document.getElementById('calcDropdownWrap');
    if (wrap && !wrap.contains(ev.target)) {
      calcDropdownOpen = false;
      const trig = document.getElementById('calcDdTrigger');
      const menu = document.getElementById('calcDdMenu');
      if (trig) trig.classList.remove('open');
      if (menu) menu.classList.remove('show');
    }
  });

  window.selectCalcType = function(typeId) {
    activeCalcType = typeId || 'mehrieh';
    calcDropdownOpen = false;
    window.renderCalculators();
  };

  // ۱. مهریه به نرخ روز
  window.onMehriehYearChange = function() {
    const ym = Number(document.getElementById('mhYearMarriage')?.value || 1385);
    const yc = Number(document.getElementById('mhYearClaim')?.value || 1404);
    const im = document.getElementById('mhIdxMarriage');
    const ic = document.getElementById('mhIdxClaim');
    if (im) im.value = CPI_INDICES[ym] ?? 4.521;
    if (ic) ic.value = CPI_INDICES[yc] ?? 372.5;
    window.calcMehrieh();
  };

  window.calcMehrieh = function() {
    const raw = Number(toEn(document.getElementById('mhAmount')?.value || '0').replace(/,/g, '')) || 0;
    const unit = document.getElementById('mhUnit')?.value || 'toman';
    const ym = Number(document.getElementById('mhYearMarriage')?.value || 1385);
    const yc = Number(document.getElementById('mhYearClaim')?.value || 1404);
    const idxM = Number(toEn(document.getElementById('mhIdxMarriage')?.value || '')) || CPI_INDICES[ym] || 1;
    const idxC = Number(toEn(document.getElementById('mhIdxClaim')?.value || '')) || CPI_INDICES[yc] || 1;
    const status = document.getElementById('mhStatus')?.value || 'alive';

    const amountToman = unit === 'rial' ? raw / 10 : raw;
    const updatedToman = idxM > 0 ? (amountToman * idxC) / idxM : 0;
    const ratio = idxM > 0 ? (idxC / idxM) : 1;

    const out = document.getElementById('mhResult');
    if (!out) return;
    out.innerHTML = `
      <div class="calc-res-strip">
        <div class="row between" style="gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <span style="font-size:12px; color:var(--muted);">ارزش به‌روزشده کل مهریه (تبصره ماده ۱۰۸۲ قانون مدنی):</span>
            <div style="font-size:24px; font-weight:800; color:var(--main); margin:4px 0;">
              ${toFa(Math.round(updatedToman).toLocaleString())} تومان
            </div>
            <div style="font-size:12.5px; color:var(--muted);">
              معادل ${toFa(Math.round(updatedToman * 10).toLocaleString())} ریال · ضریب افزایش: ${toFa(ratio.toFixed(2))} برابر
            </div>
          </div>
          <div style="text-align:left;">
            <div style="font-size:12px; color:var(--muted);">مبلغ نصف مهریه (طلاق قبل از نزدیکی):</div>
            <div style="font-size:16px; font-weight:700; color:var(--text);">${toFa(Math.round(updatedToman / 2).toLocaleString())} تومان</div>
          </div>
        </div>
        <p style="font-size:12px; color:var(--muted); margin:10px 0 0; line-height:1.8;">
          فرمول قانونی: مبلغ مندرج در عقدنامه × (شاخص سال ${status === 'death' ? 'فوت' : 'مطالبه'} ${toFa(yc)} برابر ${toFa(idxC)} ÷ شاخص سال عقد ${toFa(ym)} برابر ${toFa(idxM)}).
          ${status === 'death' ? 'طبق رأی وحدت رویه ۸۲۲ دیوان عالی کشور مبنای محاسبه در صورت فوت زوج تاریخ فوت یا تأدیه بر اساس زمان مطالبه ورثه محاسبه می‌شود.' : 'شاخص‌ها به صورت خودکار پر شده‌اند و در صورت انتشار رقم جدید بانک مرکزی می‌توانید عدد شاخص را دستی ویرایش کنید.'}
        </p>
      </div>
    `;
  };

  // ۲. تقسیم ارث (طبق قانون مدنی ایران - مواد ۸۶۱ تا ۹۴۹)
  window.toggleInheritanceTier2 = function() {
    const f = document.getElementById('inhFather')?.checked;
    const m = document.getElementById('inhMother')?.checked;
    const s = Number(document.getElementById('inhSons')?.value || 0);
    const d = Number(document.getElementById('inhDaughters')?.value || 0);
    const hasT1 = !!(f || m || s > 0 || d > 0);
    const t2Box = document.getElementById('inhTier2Box');
    if (t2Box) t2Box.classList.toggle('hidden', hasT1);
  };

  window.calcInheritance = function() {
    window.toggleInheritanceTier2();
    const totalRaw = Number(toEn(document.getElementById('inhTotal')?.value || '0').replace(/,/g, '')) || 0;
    const debtRaw = Number(toEn(document.getElementById('inhDebt')?.value || '0').replace(/,/g, '')) || 0;
    const unit = document.getElementById('inhUnit')?.value || 'toman';
    const spouse = document.getElementById('inhSpouse')?.value || 'none';
    const wifeCount = Math.max(1, Math.min(4, Number(document.getElementById('inhWifeCount')?.value || 1)));
    const hasFather = !!document.getElementById('inhFather')?.checked;
    const hasMother = !!document.getElementById('inhMother')?.checked;
    const motherBlocked = !!document.getElementById('inhMotherBlocked')?.checked;
    const sons = Math.max(0, Number(document.getElementById('inhSons')?.value || 0));
    const daughters = Math.max(0, Number(document.getElementById('inhDaughters')?.value || 0));

    const wfEl = document.getElementById('inhWifeCountWrap');
    if (wfEl) wfEl.classList.toggle('hidden', spouse !== 'wife');

    const totalToman = unit === 'rial' ? totalRaw / 10 : totalRaw;
    const debtToman = unit === 'rial' ? debtRaw / 10 : debtRaw;
    const netToman = Math.max(0, totalToman - debtToman);

    const hasChildren = sons > 0 || daughters > 0;
    const hasTier1 = hasFather || hasMother || hasChildren;

    // طبقه اول
    const rows = [];
    let spouseShare = 0;
    if (spouse === 'husband') {
      spouseShare = (hasChildren || hasTier1 && hasChildren) ? 0.25 : (hasChildren ? 0.25 : 0.5);
    } else if (spouse === 'wife') {
      spouseShare = hasChildren ? 0.125 : 0.25;
    }

    if (spouse === 'husband') {
      rows.push({ title: 'شوهر', share: spouseShare, basis: hasChildren ? 'یک‌چهارم با وجود اولاد (م ۹۰۰ ق.م)' : 'یک‌دوم بدون اولاد (م ۹۰۰ ق.م)' });
    } else if (spouse === 'wife') {
      const each = spouseShare / wifeCount;
      for (let i = 1; i <= wifeCount; i++) {
        rows.push({
          title: wifeCount > 1 ? `همسر (زوجه ${toFa(i)})` : 'همسر (زوجه)',
          share: each,
          basis: hasChildren
            ? (wifeCount > 1 ? `تساوی از یک‌هشتم (م ۹۰۱ و ۹۴۲ ق.م)` : `یک‌هشتم با وجود اولاد (م ۹۰۱ ق.م)`)
            : (wifeCount > 1 ? `تساوی از یک‌چهارم (م ۹۰۱ و ۹۴۲ ق.م)` : `یک‌چهارم بدون اولاد (م ۹۰۱ ق.م)`)
        });
      }
    }

    const remAfterSpouse = Math.max(0, 1 - spouseShare);

    if (hasTier1) {
      if (!hasChildren) {
        // فقط پدر و یا مادر (با یا بدون همسر)
        if (hasFather && hasMother) {
          const motherBase = motherBlocked ? (1 / 6) : (1 / 3);
          const motherCap = Math.min(motherBase, remAfterSpouse);
          const fatherRest = Math.max(0, remAfterSpouse - motherCap);
          rows.push({ title: 'مادر', share: motherCap, basis: motherBlocked ? 'یک‌ششم با وجود حاجب اخوه (م ۸۹۲ ق.م)' : 'یک‌سوم فرض مادر (م ۹۰۶ ق.م)' });
          rows.push({ title: 'پدر', share: fatherRest, basis: 'باقیمانده به قرابت و رد (م ۹۰۶ ق.م)' });
        } else if (hasMother) {
          rows.push({ title: 'مادر', share: remAfterSpouse, basis: 'تمام باقیمانده پس از سهم همسر به فرض و رد (م ۹۰۵ ق.م)' });
        } else if (hasFather) {
          rows.push({ title: 'پدر', share: remAfterSpouse, basis: 'تمام باقیمانده پس از سهم همسر (م ۹۰۵ ق.م)' });
        }
      } else {
        // وجود اولاد (همراه یا بدون ابوین)
        const fatherFixed = hasFather ? (1 / 6) : 0;
        const motherFixed = hasMother ? (1 / 6) : 0;
        const parentsSum = fatherFixed + motherFixed;

        if (sons > 0) {
          // با وجود پسر فرض دختر ساقط نیست اما کل باقیمانده به نسبت ذکور دو برابر اناث تقسیم می‌شود
          const childrenPool = Math.max(0, remAfterSpouse - parentsSum);
          if (hasFather) rows.push({ title: 'پدر', share: fatherFixed, basis: 'یک‌ششم فرض پدر با وجود اولاد (م ۹۰۴ ق.م)' });
          if (hasMother) rows.push({ title: 'مادر', share: motherFixed, basis: 'یک‌ششم فرض مادر با وجود اولاد (م ۹۰۴ ق.م)' });
          const units = (sons * 2) + daughters;
          const unitShare = units > 0 ? childrenPool / units : 0;
          if (sons > 0) rows.push({ title: `پسر (${toFa(sons)} نفر — سهم هر پسر)`, count: sons, share: unitShare * 2, totalGroup: unitShare * 2 * sons, basis: 'دو برابر سهم دختر (م ۹۰۷ ق.م)' });
          if (daughters > 0) rows.push({ title: `دختر (${toFa(daughters)} نفر — سهم هر دختر)`, count: daughters, share: unitShare, totalGroup: unitShare * daughters, basis: 'یک‌پسرسهم / نصف پسر (م ۹۰۷ ق.م)' });
        } else {
          // فقط دختران (۱ یا ۲+) و احتمالاً پدر/مادر/همسر
          const daughtersFixed = daughters === 1 ? 0.5 : (2 / 3);
          const totalNonSpouseFixed = parentsSum + daughtersFixed;

          if (totalNonSpouseFixed > remAfterSpouse + 1e-9) {
            // نقص طبق مذهب امامیه بر دختران وارد می‌شود (م ۹۰۸/۹۱۴ ق.م)
            const daughtersShare = Math.max(0, remAfterSpouse - parentsSum);
            if (hasFather) rows.push({ title: 'پدر', share: fatherFixed, basis: 'یک‌ششم فرض کامل (نقص بر دختر وارد می‌شود · م ۹۰۸)' });
            if (hasMother) rows.push({ title: 'مادر', share: motherFixed, basis: 'یک‌ششم فرض کامل (نقص بر دختر وارد می‌شود · م ۹۰۸)' });
            const eachD = daughtersShare / daughters;
            rows.push({ title: `دختر (${toFa(daughters)} نفر — سهم هر دختر)`, count: daughters, share: eachD, totalGroup: daughtersShare, basis: 'باقیمانده بین دختران پس از نقص (م ۹۰۸ ق.م)' });
          } else {
            // زیادی بر ابوین و دختران به نسبت فرض (با شرط نبود حاجب مادر برای رد) تقسیم می‌شود
            const surplus = Math.max(0, remAfterSpouse - totalNonSpouseFixed);
            const motherRedEligible = hasMother && !motherBlocked;
            const redDenom = daughtersFixed + (hasFather ? fatherFixed : 0) + (motherRedEligible ? motherFixed : 0);
            const fShare = hasFather ? fatherFixed + (redDenom > 0 ? surplus * (fatherFixed / redDenom) : 0) : 0;
            const mShare = hasMother ? motherFixed + (motherRedEligible && redDenom > 0 ? surplus * (motherFixed / redDenom) : 0) : 0;
            const dTotal = Math.max(0, remAfterSpouse - fShare - mShare);
            const eachD = dTotal / daughters;
            if (hasFather) rows.push({ title: 'پدر', share: fShare, basis: surplus > 1e-9 ? 'یک‌ششم + سهم رد به نسبت (م ۹۰۸ ق.م)' : 'یک‌ششم فرض (م ۹۰۸ ق.م)' });
            if (hasMother) rows.push({ title: 'مادر', share: mShare, basis: motherBlocked ? 'یک‌ششم بدون رد به علت حاجب (م ۸۹۲ و ۹۰۸)' : (surplus > 1e-9 ? 'یک‌ششم + سهم رد (م ۹۰۸ ق.م)' : 'یک‌ششم فرض') });
            rows.push({ title: `دختر (${toFa(daughters)} نفر — سهم هر دختر)`, count: daughters, share: eachD, totalGroup: dTotal, basis: 'فرض + رد به تساوی میان دختران (م ۹۰۷ و ۹۰۸ ق.م)' });
          }
        }
      }
    } else {
      // طبقه دوم: اجداد و کلاله (خواهر و برادر)
      const abB = Math.max(0, Number(document.getElementById('inhBroFull')?.value || 0));
      const abS = Math.max(0, Number(document.getElementById('inhSisFull')?.value || 0));
      const pB = Math.max(0, Number(document.getElementById('inhBroPat')?.value || 0));
      const pS = Math.max(0, Number(document.getElementById('inhSisPat')?.value || 0));
      const mB = Math.max(0, Number(document.getElementById('inhBroMom')?.value || 0));
      const mS = Math.max(0, Number(document.getElementById('inhSisMom')?.value || 0));

      const hasFullSibs = (abB + abS) > 0;
      const actPatB = hasFullSibs ? 0 : pB;
      const actPatS = hasFullSibs ? 0 : pS;
      const momSibTotal = mB + mS;
      const patSideTotal = abB + abS + actPatB + actPatS;

      if (momSibTotal === 0 && patSideTotal === 0) {
        if (spouse === 'husband') {
          // رد بر شوهر در صورت نبود هیچ وارث نسبی (م ۹۴۹ ق.م)
          rows[0] = { title: 'شوهر (در نبود هیچ وارث نسبی)', share: 1, basis: 'تمام ترکه پس از فرض و رد (م ۹۴۹ ق.م)' };
        } else if (spouse === 'wife') {
          rows.push({ title: 'دولت (ترکه بدون وارث نسبی)', share: remAfterSpouse, basis: 'سهم زوجه از فرض تجاوز نمی‌کند و باقی متعلق به بیت‌المال است (م ۸۶۶ و ۹۴۹ ق.م)' });
        } else {
          rows.push({ title: 'وارثی در طبقه اول یا دوم ثبت نشده است', share: 0, basis: 'لطفاً اقوام طبقه اول یا خواهر و برادر را مشخص کنید' });
        }
      } else {
        // کلاله امی: یک‌نفر ۱/۶ و دو نفر و بیشتر ۱/۳ به تساوی ذکور و اناث (م ۹۱۹ ق.م)
        const momPool = momSibTotal === 0 ? 0 : (momSibTotal === 1 ? (1 / 6) : (1 / 3));
        const actualMomPool = Math.min(momPool, remAfterSpouse);
        const patPool = Math.max(0, remAfterSpouse - actualMomPool);

        if (momSibTotal > 0) {
          const shareTarget = patSideTotal > 0 ? actualMomPool : remAfterSpouse;
          const eachMom = shareTarget / momSibTotal;
          rows.push({ title: `کلاله امی (${toFa(momSibTotal)} خواهر/برادر مادری — سهم هر نفر)`, count: momSibTotal, share: eachMom, totalGroup: shareTarget, basis: 'تقسیم بالسویه میان خواهر و برادر مادری (م ۹۲۰ ق.م)' });
        }
        if (patSideTotal > 0) {
          const bCnt = hasFullSibs ? abB : actPatB;
          const sCnt = hasFullSibs ? abS : actPatS;
          const units = (bCnt * 2) + sCnt;
          const uShare = units > 0 ? patPool / units : 0;
          const labelType = hasFullSibs ? 'ابوینی (تنی)' : 'ابی (پدری)';
          if (bCnt > 0) rows.push({ title: `برادر ${labelType} (${toFa(bCnt)} نفر — سهم هر نفر)`, count: bCnt, share: uShare * 2, totalGroup: uShare * 2 * bCnt, basis: `دو برابر خواهر ${labelType} (م ۹۲۰ ق.م)` });
          if (sCnt > 0) rows.push({ title: `خواهر ${labelType} (${toFa(sCnt)} نفر — سهم هر نفر)`, count: sCnt, share: uShare, totalGroup: uShare * sCnt, basis: `سهم خواهر ${labelType} (م ۹۲۰ ق.م)` });
        }
      }
    }

    const out = document.getElementById('inhResult');
    if (!out) return;
    out.innerHTML = `
      <div class="calc-res-strip">
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <div>
            <span style="font-size:12px; color:var(--muted);">ماترک خالص قابل تقسیم (پس از کسر دیون و واجبات):</span>
            <div style="font-size:21px; font-weight:800; color:var(--main); margin-top:2px;">
              ${toFa(Math.round(netToman).toLocaleString())} تومان
              <span style="font-size:13px; font-weight:500; color:var(--muted);">(${toFa(Math.round(netToman * 10).toLocaleString())} ریال)</span>
            </div>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="calc-table">
            <thead>
              <tr>
                <th>وارث / نسبت</th>
                <th>سهم (%)</th>
                <th>مبلغ (تومان)</th>
                <th>مبلغ (ریال)</th>
                <th>مستند قانونی</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const toman = Math.round(netToman * r.share);
                const rial = Math.round(toman * 10);
                const grpSuffix = (r.count && r.count > 1) ? `<br><small style="color:var(--muted);">جمع ${toFa(r.count)} نفر: ${toFa(Math.round(netToman * r.totalGroup).toLocaleString())}</small>` : '';
                return `
                  <tr>
                    <td><b>${esc(r.title)}</b></td>
                    <td dir="ltr">${toFa((r.share * 100).toFixed(2))}٪</td>
                    <td><b>${toFa(toman.toLocaleString())}</b>${grpSuffix}</td>
                    <td>${toFa(rial.toLocaleString())}</td>
                    <td style="font-size:12px; color:var(--muted);">${esc(r.basis)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // ۳. دیه کامل، اعضا و جراحات
  window.setBaseDiyah = function(valToman) {
    const inp = document.getElementById('dyBase');
    if (inp) {
      inp.value = String(valToman);
      window.calcDiyah();
    }
  };

  window.calcDiyah = function() {
    const baseToman = Number(toEn(document.getElementById('dyBase')?.value || '1600000000').replace(/,/g, '')) || 1600000000;
    const presetId = document.getElementById('dyPreset')?.value || 'full';
    const isHaram = !!document.getElementById('dyHaram')?.checked;
    const customWrap = document.getElementById('dyCustomWrap');
    if (customWrap) customWrap.classList.toggle('hidden', presetId !== 'custom');

    const preset = DIYAH_PRESETS.find(p => p.id === presetId) || DIYAH_PRESETS[0];
    let frac = preset.frac;
    if (presetId === 'custom') {
      const pct = Number(toEn(document.getElementById('dyCustomPct')?.value || '10').replace(/,/g, '')) || 0;
      frac = pct / 100;
    }

    const haramFactor = (isHaram && presetId === 'full') ? (4 / 3) : 1;
    const totalToman = baseToman * frac * haramFactor;
    const pctDisplay = frac * 100 * haramFactor;

    const out = document.getElementById('dyResult');
    if (!out) return;
    out.innerHTML = `
      <div class="calc-res-strip">
        <div class="row between" style="gap:10px; flex-wrap:wrap;">
          <div>
            <span style="font-size:12px; color:var(--muted);">مبلغ دیه محاسبه‌شده (${esc(preset.label)}):</span>
            <div style="font-size:23px; font-weight:800; color:var(--main); margin:4px 0;">
              ${toFa(Math.round(totalToman).toLocaleString())} تومان
            </div>
            <div style="font-size:12.5px; color:var(--muted);">
              معادل ${toFa(Math.round(totalToman * 10).toLocaleString())} ریال · درصد دیه کامل: ${toFa(pctDisplay.toFixed(2))}٪
            </div>
          </div>
        </div>
        <p style="font-size:12px; color:var(--muted); margin:10px 0 0; line-height:1.8;">
          نرخ مبنا: ${toFa(baseToman.toLocaleString())} تومان.
          ${isHaram && presetId !== 'full' ? 'نکته: طبق ماده ۵۵۵ قانون مجازات اسلامی تغلیظ یک‌سوم در ماه‌های حرام فقط مخصوص سلب حیات (دیه کامل نفس) است و شامل دیه اعضا و جراحات نمی‌شود.' : ''}
          ${preset.headBonusNote ? 'درصدهای درج‌شده مربوط به شجاج (جراحات سر و صورت) بوده و دیه جراحت مشابه در سایر اندام‌های بدن به نسبت متعارف یا نصف دیه جراحات سر محاسبه می‌گردد.' : ''}
        </p>
      </div>
    `;
  };

  // ۴. هزینه دادرسی
  window.calcCourtFees = function() {
    const rawVal = toEn(document.getElementById('cfAmount')?.value || '0').replace(/,/g, '');
    const amount = Number(rawVal) || 0;
    const stage = document.getElementById('cfStage')?.value || 'first';

    let fee = 0;
    let label = '';
    if (stage === 'first') {
      label = 'مرحله نخستین / بدوی (۲.۵٪ تا ۲۰ میلیون تومان، مازاد ۳.۵٪)';
      fee = amount <= 20000000 ? amount * 0.025 : (20000000 * 0.025) + ((amount - 20000000) * 0.035);
    } else if (stage === 'appeal') {
      label = 'مرحله تجدیدنظر و واخواهی (۴.۵٪ مبلغ خواسته)';
      fee = amount * 0.045;
    } else if (stage === 'supreme') {
      label = 'مرحله فرجام‌خواهی و اعاده دادرسی (۵.۵٪ مبلغ خواسته)';
      fee = amount * 0.055;
    } else if (stage === 'exec') {
      label = 'اجرای احکام مدنی (۵٪ نیم‌عشر دولتی)';
      fee = amount * 0.05;
    }

    const out = document.getElementById('cfResult');
    if (out) {
      out.innerHTML = `
        <div class="calc-res-strip">
          <span style="font-size:12px; color:var(--muted)">مبلغ برآورد هزینه دادرسی (${label}):</span>
          <div style="font-size:22px; font-weight:800; color:var(--main); margin-top:4px;">
            ${toFa(Math.round(fee).toLocaleString())} تومان
          </div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">
            معادل ${toFa(Math.round(fee * 10).toLocaleString())} ریال
          </div>
        </div>
      `;
    }
  };

  // ۵. تعرفه حق‌الوکاله
  window.calcAttorneyFees = function() {
    const rawVal = toEn(document.getElementById('atAmount')?.value || '0').replace(/,/g, '');
    const claim = Number(rawVal) || 0;

    let fee = 0;
    if (claim <= 100000000) {
      fee = claim * 0.08;
    } else if (claim <= 500000000) {
      fee = (100000000 * 0.08) + ((claim - 100000000) * 0.07);
    } else if (claim <= 2000000000) {
      fee = (100000000 * 0.08) + (400000000 * 0.07) + ((claim - 500000000) * 0.05);
    } else {
      fee = (100000000 * 0.08) + (400000000 * 0.07) + (1500000000 * 0.05) + ((claim - 2000000000) * 0.04);
    }

    const firstStage = fee * 0.6;
    const appealStage = fee * 0.4;
    const tax = fee * 0.05;
    const fund = fee * 0.04;

    const out = document.getElementById('atResult');
    if (out) {
      out.innerHTML = `
        <div class="calc-res-strip">
          <span style="font-size:12px; color:var(--muted)">کل تعرفه قانونی حق‌الوکاله دعاوی مالی:</span>
          <div style="font-size:22px; font-weight:800; color:var(--main); margin:4px 0;">
            ${toFa(Math.round(fee).toLocaleString())} تومان
          </div>
          <div style="font-size:12.5px; color:var(--text); line-height:1.9">
            · سهم مرحله نخستین (۶۰٪): <b>${toFa(Math.round(firstStage).toLocaleString())} تومان</b><br>
            · سهم مرحله تجدیدنظر (۴۰٪): <b>${toFa(Math.round(appealStage).toLocaleString())} تومان</b><br>
            · سهم تمبر مالیاتی علی‌الحساب (۵٪): <b>${toFa(Math.round(tax).toLocaleString())} تومان</b><br>
            · سهم صندوق حمایت وکلای دادگستری (۴٪): <b>${toFa(Math.round(fund).toLocaleString())} تومان</b>
          </div>
        </div>
      `;
    }
  };

  // ۶. خسارت تأخیر تأدیه ماده ۵۲۲
  window.onLateYearChange = function() {
    const yd = Number(document.getElementById('lpYearDue')?.value || 1399);
    const yp = Number(document.getElementById('lpYearPay')?.value || 1404);
    const idEl = document.getElementById('lpIdxDue');
    const ipEl = document.getElementById('lpIdxPay');
    if (idEl) idEl.value = CPI_INDICES[yd] ?? 69.72;
    if (ipEl) ipEl.value = CPI_INDICES[yp] ?? 372.5;
    window.calcLatePayment();
  };

  window.calcLatePayment = function() {
    const rawVal = toEn(document.getElementById('lpAmount')?.value || '0').replace(/,/g, '');
    const amount = Number(rawVal) || 0;
    const yDue = Number(document.getElementById('lpYearDue')?.value || 1399);
    const yPay = Number(document.getElementById('lpYearPay')?.value || 1404);
    const idxDue = Number(toEn(document.getElementById('lpIdxDue')?.value || '')) || CPI_INDICES[yDue] || 69.72;
    const idxPay = Number(toEn(document.getElementById('lpIdxPay')?.value || '')) || CPI_INDICES[yPay] || 372.5;

    const totalUpdated = idxDue > 0 ? (amount * idxPay) / idxDue : amount;
    const delayDamage = Math.max(0, totalUpdated - amount);

    const out = document.getElementById('lpResult');
    if (out) {
      out.innerHTML = `
        <div class="calc-res-strip">
          <div class="row between" style="gap:8px; flex-wrap:wrap;">
            <span style="font-size:12px; color:var(--muted)">مبلغ به‌روزشده کل بدهی:</span>
            <span style="font-weight:800; color:var(--ok); font-size:15px;">${toFa(Math.round(totalUpdated).toLocaleString())} تومان</span>
          </div>
          <div style="font-size:21px; font-weight:800; color:var(--main); margin:8px 0;">
            خسارت تأخیر تأدیه: ${toFa(Math.round(delayDamage).toLocaleString())} تومان
          </div>
          <p style="font-size:12px; color:var(--muted); margin:0; line-height:1.8">
            اصل طلب: <b>${toFa(amount.toLocaleString())} تومان</b> · شاخص سررسید (${toFa(yDue)}: ${toFa(idxDue)}) به شاخص زمان پرداخت (${toFa(yPay)}: ${toFa(idxPay)}) طبق ماده ۵۲۲ ق.آ.د.م.
          </p>
        </div>
      `;
    }
  };

  // ۷. محاسبه‌گر سفارشی
  window.runCustomCalc = function(id) {
    const list = window.getCustomCalculators();
    const c = list.find(item => item.id === id);
    if (!c) return;
    const inVal = Number(toEn(document.getElementById('input_' + id)?.value || '0').replace(/,/g, '')) || 0;
    let res = 0;
    if (c.type === 'percent') res = (inVal * Number(c.rate)) / 100;
    else if (c.type === 'daily') {
      const days = Number(toEn(document.getElementById('days_' + id)?.value || '1')) || 1;
      res = inVal * (Number(c.rate) / 100) * days;
    }
    const out = document.getElementById('out_' + id);
    if (out) out.innerHTML = `مبلغ محاسبه‌شده: <b>${toFa(Math.round(res).toLocaleString())} تومان</b>`;
  };

  window.renderCalculators = function() {
    const ddWrap = document.getElementById('calcDropdownWrap');
    const stage = document.getElementById('calcActiveStage');
    if (!ddWrap || !stage) return;

    const current = CALC_TYPES.find(t => t.id === activeCalcType) || CALC_TYPES[0];
    ddWrap.innerHTML = `
      <button type="button" id="calcDdTrigger" class="calc-dd-trigger ${calcDropdownOpen ? 'open' : ''}" onclick="toggleCalcDropdown(event)" aria-expanded="${calcDropdownOpen ? 'true' : 'false'}">
        <div class="calc-dd-current">
          <div class="calc-dd-ico">${current.icon}</div>
          <div>
            <div class="calc-dd-title">${esc(current.title)}</div>
            <div class="calc-dd-sub">${esc(current.sub)}</div>
          </div>
        </div>
        <span class="calc-dd-chevron">▾</span>
      </button>
      <div id="calcDdMenu" class="calc-dd-menu ${calcDropdownOpen ? 'show' : ''}">
        ${CALC_TYPES.map(t => `
          <button type="button" class="calc-dd-item ${activeCalcType === t.id ? 'active' : ''}" onclick="selectCalcType('${t.id}')">
            <div class="calc-dd-current">
              <span style="font-size:19px;">${t.icon}</span>
              <div>
                <div class="calc-dd-title" style="${activeCalcType === t.id ? 'color:#fff;' : ''}">${esc(t.title)}</div>
                <div class="calc-dd-sub">${esc(t.sub)}</div>
              </div>
            </div>
            <span style="font-size:12px; font-weight:700;">${activeCalcType === t.id ? '✓ فعال' : 'انتخاب'}</span>
          </button>
        `).join('')}
      </div>
    `;

    if (activeCalcType === 'mehrieh') {
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>💍 محاسبه مهریه به نرخ روز</h3>
              <p>به‌روزرسانی وجه رایج مهریه بر اساس شاخص کل بهای کالاها و خدمات مصرفی بانک مرکزی (تبصره ماده ۱۰۸۲ قانون مدنی)</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>مبلغ مندرج در سند نکاحیه</label>
              <input id="mhAmount" type="text" value="5000000" dir="ltr" oninput="calcMehrieh()">
            </div>
            <div class="field">
              <label>واحد مبلغ عقدنامه</label>
              <select id="mhUnit" onchange="calcMehrieh()">
                <option value="toman" selected>تومان</option>
                <option value="rial">ریال</option>
              </select>
            </div>
            <div class="field">
              <label>سال وقوع عقد نکاح</label>
              <select id="mhYearMarriage" onchange="onMehriehYearChange()">${buildYearOptions(1350, 1405, 1385)}</select>
            </div>
            <div class="field">
              <label>سال مطالبه یا فوت زوج</label>
              <select id="mhYearClaim" onchange="onMehriehYearChange()">${buildYearOptions(1350, 1405, 1404)}</select>
            </div>
            <div class="field">
              <label>شاخص سال عقد (قابل ویرایش)</label>
              <input id="mhIdxMarriage" type="text" dir="ltr" value="${CPI_INDICES[1385]}" oninput="calcMehrieh()">
            </div>
            <div class="field">
              <label>شاخص سال مطالبه/فوت (قابل ویرایش)</label>
              <input id="mhIdxClaim" type="text" dir="ltr" value="${CPI_INDICES[1404]}" oninput="calcMehrieh()">
            </div>
            <div class="field" style="grid-column:1/-1;">
              <label>وضعیت مطالبه</label>
              <select id="mhStatus" onchange="calcMehrieh()">
                <option value="alive">مطالبه در زمان حیات زوج</option>
                <option value="death">مطالبه از ترکه پس از فوت زوج</option>
              </select>
            </div>
          </div>
          <div id="mhResult"></div>
        </div>
      `;
      window.calcMehrieh();
    } else if (activeCalcType === 'inheritance') {
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>📜 محاسبه‌گر قانونی تقسیم ارث</h3>
              <p>تعیین سهم‌الارث دقیق ورثه بر اساس قانون مدنی ایران (فرض، قرابت، حجب، رد و نقص)</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>ارزش کل ماترک متوفی</label>
              <input id="inhTotal" type="text" value="1000000000" dir="ltr" oninput="calcInheritance()">
            </div>
            <div class="field">
              <label>دیون، مهریه و هزینه کفن و دفن</label>
              <input id="inhDebt" type="text" value="0" dir="ltr" oninput="calcInheritance()">
            </div>
            <div class="field">
              <label>واحد پول</label>
              <select id="inhUnit" onchange="calcInheritance()">
                <option value="toman" selected>تومان</option>
                <option value="rial">ریال</option>
              </select>
            </div>
            <div class="field">
              <label>همسر متوفی در زمان فوت</label>
              <select id="inhSpouse" onchange="calcInheritance()">
                <option value="none">فاقد همسر</option>
                <option value="wife" selected>زن (زوجه)</option>
                <option value="husband">شوهر (زوج)</option>
              </select>
            </div>
            <div class="field" id="inhWifeCountWrap">
              <label>تعداد همسران (برای تساوی میان زوجات)</label>
              <select id="inhWifeCount" onchange="calcInheritance()">
                <option value="1" selected>۱ همسر</option>
                <option value="2">۲ همسر</option>
                <option value="3">۳ همسر</option>
                <option value="4">۴ همسر</option>
              </select>
            </div>
            <div class="field">
              <label>تعداد پسر</label>
              <input id="inhSons" type="number" min="0" value="1" oninput="calcInheritance()">
            </div>
            <div class="field">
              <label>تعداد دختر</label>
              <input id="inhDaughters" type="number" min="0" value="1" oninput="calcInheritance()">
            </div>
            <div class="field" style="grid-column:1/-1;">
              <div class="row" style="gap:14px; flex-wrap:wrap;">
                <label class="check" style="margin:0;"><input type="checkbox" id="inhFather" onchange="calcInheritance()"> پدر در قید حیات است</label>
                <label class="check" style="margin:0;"><input type="checkbox" id="inhMother" onchange="calcInheritance()"> مادر در قید حیات است</label>
                <label class="check" style="margin:0;"><input type="checkbox" id="inhMotherBlocked" onchange="calcInheritance()"> وجود حاجب مادر (دو برادر یا یک برادر و دو خواهر یا چهار خواهر)</label>
              </div>
            </div>
          </div>
          <div id="inhTier2Box" class="hidden surface-box" style="margin-top:14px; border-style:dashed; border-radius:14px;">
            <div style="font-size:12.5px; font-weight:700; margin-bottom:10px;">ورثه طبقه دوم (فقط در صورت نبود هیچ وارثی در طبقه اول):</div>
            <div class="form-grid">
              <div class="field"><label>برادر ابوینی (تنی)</label><input id="inhBroFull" type="number" min="0" value="0" oninput="calcInheritance()"></div>
              <div class="field"><label>خواهر ابوینی (تنی)</label><input id="inhSisFull" type="number" min="0" value="0" oninput="calcInheritance()"></div>
              <div class="field"><label>برادر ابی (پدری)</label><input id="inhBroPat" type="number" min="0" value="0" oninput="calcInheritance()"></div>
              <div class="field"><label>خواهر ابی (پدری)</label><input id="inhSisPat" type="number" min="0" value="0" oninput="calcInheritance()"></div>
              <div class="field"><label>برادر امی (مادری)</label><input id="inhBroMom" type="number" min="0" value="0" oninput="calcInheritance()"></div>
              <div class="field"><label>خواهر امی (مادری)</label><input id="inhSisMom" type="number" min="0" value="0" oninput="calcInheritance()"></div>
            </div>
          </div>
          <div id="inhResult"></div>
        </div>
      `;
      window.calcInheritance();
    } else if (activeCalcType === 'diyah') {
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>⚖️ محاسبه دیه کامل، نقص عضو و جراحات</h3>
              <p>برآورد دقیق دیه نفس، اعضاء و شجاج بر مبنای نرخ مصوب قوه قضاییه و احکام تغلیظ</p>
            </div>
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" class="btn small" onclick="setBaseDiyah(1200000000)">نرخ سال ۱۴۰۳ (۱.۲ میلیارد تومان)</button>
            <button type="button" class="btn small" onclick="setBaseDiyah(1600000000)">نرخ سال ۱۴۰۴ (۱.۶ میلیارد تومان)</button>
            <button type="button" class="btn small" onclick="setBaseDiyah(2100000000)">برآورد ۱۴۰۵ (۲.۱ میلیارد تومان)</button>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>مبلغ دیه کامل سال (تومان · قابل ویرایش)</label>
              <input id="dyBase" type="text" value="1600000000" dir="ltr" oninput="calcDiyah()">
            </div>
            <div class="field">
              <label>انتخاب نوع آسیب، جنایت یا دیه کامل</label>
              <select id="dyPreset" onchange="calcDiyah()">
                ${DIYAH_PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}
              </select>
            </div>
            <div class="field hidden" id="dyCustomWrap">
              <label>درصد دلخواه از دیه کامل (مثلاً ۲۵ یا ۳۳.۳۳)</label>
              <input id="dyCustomPct" type="text" value="15" dir="ltr" oninput="calcDiyah()">
            </div>
            <div class="field" style="grid-column:1/-1;">
              <label class="check" style="margin:0;"><input type="checkbox" id="dyHaram" onchange="calcDiyah()"> وقوع قتل در ماه‌های حرام (ذی‌القعده، ذی‌الحجه، محرم، رجب) — اعمال یک‌سوم تغلیظ</label>
            </div>
          </div>
          <div id="dyResult"></div>
        </div>
      `;
      window.calcDiyah();
    } else if (activeCalcType === 'court') {
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>🏛️ محاسبه هزینه دادرسی دعاوی مالی</h3>
              <p>محاسبه تعرفه تمبر و هزینه دادرسی در مراحل نخستین، تجدیدنظر، فرجام و نیم‌عشر اجرا</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>مبلغ خواسته یا محکوم‌به (تومان)</label>
              <input id="cfAmount" type="text" value="100000000" dir="ltr" oninput="calcCourtFees()">
            </div>
            <div class="field">
              <label>مرحله رسیدگی</label>
              <select id="cfStage" onchange="calcCourtFees()">
                <option value="first">مرحله بدوی / نخستین</option>
                <option value="appeal">مرحله تجدیدنظر / واخواهی (۴.۵٪)</option>
                <option value="supreme">مرحله فرجام / اعاده دادرسی (۵.۵٪)</option>
                <option value="exec">نیم‌عشر اجرای احکام (۵٪)</option>
              </select>
            </div>
          </div>
          <div id="cfResult"></div>
        </div>
      `;
      window.calcCourtFees();
    } else if (activeCalcType === 'attorney') {
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>💼 محاسبه تعرفه حق‌الوکاله وکیل دادگستری</h3>
              <p>محاسبه پلکانی حق‌الوکاله دعاوی مالی، سهم بدوی و تجدیدنظر، تمبر مالیاتی و صندوق حمایت</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field" style="grid-column:1/-1;">
              <label>ارزش خواسته دعوای مالی (تومان)</label>
              <input id="atAmount" type="text" value="500000000" dir="ltr" oninput="calcAttorneyFees()">
            </div>
          </div>
          <div id="atResult"></div>
        </div>
      `;
      window.calcAttorneyFees();
    } else if (activeCalcType === 'late') {
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>⏱️ محاسبه خسارت تأخیر تأدیه (ماده ۵۲۲)</h3>
              <p>تعدیل اصل طلب به نرخ شاخص بهای کالاها و خدمات مصرفی بانک مرکزی از سررسید تا پرداخت</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>اصل مبلغ طلب (تومان)</label>
              <input id="lpAmount" type="text" value="50000000" dir="ltr" oninput="calcLatePayment()">
            </div>
            <div class="field">
              <label>سال سررسید و مطالبه</label>
              <select id="lpYearDue" onchange="onLateYearChange()">${buildYearOptions(1350, 1405, 1399)}</select>
            </div>
            <div class="field">
              <label>سال پرداخت یا اجراء</label>
              <select id="lpYearPay" onchange="onLateYearChange()">${buildYearOptions(1350, 1405, 1404)}</select>
            </div>
            <div class="field">
              <label>شاخص سال سررسید (قابل ویرایش)</label>
              <input id="lpIdxDue" type="text" dir="ltr" value="${CPI_INDICES[1399]}" oninput="calcLatePayment()">
            </div>
            <div class="field">
              <label>شاخص سال پرداخت (قابل ویرایش)</label>
              <input id="lpIdxPay" type="text" dir="ltr" value="${CPI_INDICES[1404]}" oninput="calcLatePayment()">
            </div>
          </div>
          <div id="lpResult"></div>
        </div>
      `;
      window.calcLatePayment();
    } else if (activeCalcType === 'custom') {
      const list = window.getCustomCalculators();
      stage.innerHTML = `
        <div class="calc-single-stage">
          <div class="calc-stage-head">
            <div>
              <h3>⚙️ فرمول‌ها و محاسبه‌گرهای سفارشی</h3>
              <p>تعرفه‌های اختصاصی داوری، ثبت اسناد، کارشناسی و خسارات روزشمار تعریف‌شده توسط مدیر</p>
            </div>
            ${window.isAdmin ? `<button class="btn primary" onclick="openCustomCalcEditor()">＋ افزودن فرمول جدید</button>` : ''}
          </div>
          ${!list.length
            ? '<div class="empty-glass-card"><p>هنوز فرمول سفارشی ثبت نشده است.</p></div>'
            : `<div style="display:grid; gap:14px;">${list.map(c => `
                <div class="surface-box" style="padding:14px; border-radius:14px;">
                  <div class="row between" style="gap:8px; margin-bottom:6px;">
                    <h4 style="margin:0; font-size:15px;">${esc(c.title)}</h4>
                    ${window.isAdmin ? `
                      <div class="row" style="gap:4px;">
                        <button class="btn small" onclick="openCustomCalcEditor('${c.id}')">✎ ویرایش</button>
                        <button class="btn small danger" onclick="deleteCustomCalculator('${c.id}')">✕ حذف</button>
                      </div>
                    ` : ''}
                  </div>
                  <p style="font-size:12px; color:var(--muted); margin:0 0 10px;">${esc(c.desc || '')}</p>
                  <div class="form-grid" style="gap:8px;">
                    <div class="field">
                      <label>مبلغ پایه (تومان)</label>
                      <input id="input_${c.id}" type="text" dir="ltr" placeholder="50,000,000" oninput="runCustomCalc('${c.id}')">
                    </div>
                    ${c.type === 'daily' ? `
                      <div class="field">
                        <label>تعداد روز تأخیر</label>
                        <input id="days_${c.id}" type="number" value="10" oninput="runCustomCalc('${c.id}')">
                      </div>
                    ` : ''}
                  </div>
                  <div id="out_${c.id}" style="margin-top:10px; font-size:13.5px; color:var(--main); font-weight:700;">
                    برای محاسبه، مبلغ را وارد کنید.
                  </div>
                </div>
              `).join('')}</div>`}
        </div>
      `;
    }
  };

  window.openCustomCalcEditor = function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ویرایش فرمول‌ها فقط برای مدیر مجاز است."); return; }
    let c = { id: 'c_' + Date.now(), title: '', type: 'percent', rate: 1.0, desc: '' };
    if (id) {
      const found = window.getCustomCalculators().find(item => item.id === id);
      if (found) c = found;
    }

    const m = document.getElementById('modal');
    if (!m) return;

    m.innerHTML = `
      <h2>${id ? 'ویرایش محاسبه‌گر حقوقی' : 'افزودن فرمول / محاسبه‌گر جدید'}</h2>
      <div class="form-grid">
        <div class="field" style="grid-column: 1 / -1;">
          <label>عنوان محاسبه‌گر</label>
          <input id="edCTitle" value="${esc(c.title)}" placeholder="مثلاً: حق‌التحریر تنظیم قرارداد یا خسارت روزانه">
        </div>
        <div class="field">
          <label>نوع فرمول محاسباتی</label>
          <select id="edCType">
            <option value="percent" ${c.type==='percent'?'selected':''}>درصدی از مبلغ پایه</option>
            <option value="daily" ${c.type==='daily'?'selected':''}>روزشمار (درصد روزانه × تعداد روز)</option>
          </select>
        </div>
        <div class="field">
          <label>نرخ درصد (%)</label>
          <input type="number" step="0.01" id="edCRate" value="${c.rate}">
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <label>توضیحات و راهنمای فرمول</label>
          <textarea id="edCDesc" rows="2">${esc(c.desc || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitCustomCalc('${c.id}')">ذخیره محاسبه‌گر</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitCustomCalc = function(id) {
    const title = (document.getElementById('edCTitle')?.value || '').trim();
    if (!title) return alert('لطفاً عنوان را وارد کنید.');

    const type = document.getElementById('edCType')?.value || 'percent';
    const rate = Number(document.getElementById('edCRate')?.value) || 1.0;
    const desc = (document.getElementById('edCDesc')?.value || '').trim();

    activeCalcType = 'custom';
    window.saveCustomCalculator({ id, title, type, rate, desc });
    closeModal();
  };

  // -------------------------------------------------------------------
  // ۴. رندر پنل‌های اختصاصی مدیریت در تب tab-admin
  // -------------------------------------------------------------------
  window.renderAdminPanels = function() {
    const arts = window.getArticles();
    const syncBox = document.getElementById('admSyncStatusCard');
    if (syncBox) {
      const localCount = arts.length;
      const srvCount = serverStatus.articlesCount;
      const mismatch = localCount !== srvCount || !!serverStatus.lastError;
      syncBox.innerHTML = `
        <div class="row between" style="gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700; font-size:14px; color:var(--text);">وضعیت انتشار عمومی مقالات و تنظیمات در سرور Supabase</div>
            <div class="muted small" style="margin-top:4px;">
              تعداد مقالات روی این دستگاه: <b>${toFa(localCount)}</b> | تعداد مقالات منتشرشده برای همه کاربران در سرور: <b>${serverStatus.checked ? toFa(srvCount) : 'در حال بررسی'}</b>
            </div>
            ${serverStatus.lastError ? `<div style="margin-top:6px; font-size:12.5px; color:var(--danger, #dc2626);">آخرین خطای سرور: ${esc(serverStatus.lastError)}</div>` : ''}
            ${(!serverStatus.lastError && localCount > 0 && srvCount === 0 && serverStatus.checked) ? `<div style="margin-top:6px; font-size:12.5px; color:var(--warn, #d97706);">مقالات این دستگاه هنوز روی سرور منتشر نشده‌اند و دیگران آن را نمی‌بینند. دکمه همگام‌سازی را بزنید.</div>` : ''}
          </div>
          <div class="row" style="gap:8px;">
            <button class="btn ${mismatch ? 'primary' : ''}" onclick="pushAllAdminDataToSupabase()">☁️ انتشار و همگام‌سازی در سرور</button>
          </div>
        </div>
      `;
    }

    // رندر مقالات در ادمین
    const admArtBox = document.getElementById('admArticlesList');
    if (admArtBox) {
      if (!arts.length) {
        admArtBox.innerHTML = '<div class="muted small surface-box">هنوز مقاله‌ای ثبت نشده است. برای انتشار اولین مقاله روی دکمه «نگارش مقاله جدید» کلیک کنید.</div>';
      } else {
        admArtBox.innerHTML = `
          <div style="display:grid; gap:8px;">
            ${arts.map(a => `
              <div class="row between admin-list-row">
                <div>
                  <b>${esc(a.title)}</b>
                  <span class="muted small" style="margin-right:8px;">(${esc(a.category)} · ${toFa(a.date || '')})</span>
                </div>
                <div class="row" style="gap:6px;">
                  <button class="btn small" onclick="openArticleEditor('${a.id}')">✎ ویرایش</button>
                  <button class="btn small danger" onclick="deleteArticle('${a.id}')">✕ حذف</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    // رندر مواعد در ادمین
    const admDlBox = document.getElementById('admDeadlinesList');
    if (admDlBox) {
      const dls = window.getDeadlines();
      admDlBox.innerHTML = `
        <div style="display:grid; gap:8px;">
          ${dls.map(d => `
            <div class="row between admin-list-row">
              <div>
                <b>${esc(d.title)}</b>
                <span class="pill" style="margin-right:6px;">${esc(d.cat || 'عمومی')}</span>
                <span class="muted small" style="margin-right:8px;">(${toFa(d.daysIran)} روز داخل / ${toFa(d.daysAbroad)} روز خارج · ${esc(d.law)})</span>
              </div>
              <div class="row" style="gap:6px;">
                <button class="btn small" onclick="openDeadlineEditor('${d.id}')">✎ ویرایش</button>
                <button class="btn small danger" onclick="deleteDeadline('${d.id}')">✕ حذف</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // رندر محاسبه‌گرها در ادمین
    const admCalcBox = document.getElementById('admCalculatorsList');
    if (admCalcBox) {
      const calcs = window.getCustomCalculators();
      admCalcBox.innerHTML = `
        <div style="display:grid; gap:8px;">
          ${calcs.map(c => `
            <div class="row between admin-list-row">
              <div>
                <b>${esc(c.title)}</b>
                <span class="pill done" style="margin-right:6px;">${c.type==='percent'?'درصدی ('+toFa(c.rate)+'٪)':'روزشمار ('+toFa(c.rate)+'٪)'}</span>
                <span class="muted small" style="margin-right:8px;">${esc(c.desc || '')}</span>
              </div>
              <div class="row" style="gap:6px;">
                <button class="btn small" onclick="openCustomCalcEditor('${c.id}')">✎ ویرایش</button>
                <button class="btn small danger" onclick="deleteCustomCalculator('${c.id}')">✕ حذف</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // رندر لیست اعضا در پنل ادمین
    const admMemBox = document.getElementById('admAboutMembersList');
    if (admMemBox && window.getAboutData) {
      const about = window.getAboutData();
      const members = about.members || [];
      admMemBox.innerHTML = !members.length
        ? '<div class="muted small surface-box">هنوز عضوی ثبت نشده است. با دکمه «افزودن عضو جدید» می‌توانید اسم و عکس و مشخصات وکلا و اعضای گروه را اضافه کنید.</div>'
        : `<div style="display:grid; gap:8px;">${members.map((m, idx) => `
            <div class="row between admin-list-row">
              <div class="row" style="gap:10px; align-items:center;">
                ${m.photo ? `<img src="${esc(m.photo)}" referrerpolicy="no-referrer" style="width:36px;height:36px;border-radius:10px;object-fit:cover;border:1px solid var(--line);">` : `<div style="width:36px;height:36px;border-radius:10px;background:var(--soft);color:var(--main);border:1px solid var(--line);display:grid;place-items:center;font-weight:800;">${esc((m.name||'ب').slice(0,2))}</div>`}
                <div>
                  <b>${esc(m.name)}</b>
                  <span class="muted small" style="margin-right:8px;">${esc(m.role || '')}${m.credentials ? ' · ' + esc(m.credentials) : ''}</span>
                </div>
              </div>
              <div class="row" style="gap:6px;">
                ${idx > 0 ? `<button class="btn small" onclick="moveMember('${m.id}', -1)" title="بالا">↑</button>` : ''}
                ${idx < members.length - 1 ? `<button class="btn small" onclick="moveMember('${m.id}', 1)" title="پایین">↓</button>` : ''}
                <button class="btn small" onclick="openMemberEditor('${m.id}')">✎ ویرایش</button>
                <button class="btn small danger" onclick="deleteMember('${m.id}')">✕ حذف</button>
              </div>
            </div>
          `).join('')}</div>`;
    }

    // رندر شبکه‌های اجتماعی در پنل ادمین
    const admSocBox = document.getElementById('admContactSocialsList');
    if (admSocBox && window.getContactData) {
      const contact = window.getContactData();
      const socials = contact.socials || [];
      admSocBox.innerHTML = !socials.length
        ? '<div class="muted small surface-box">هنوز شبکه اجتماعی ثبت نشده است.</div>'
        : `<div style="display:grid; gap:8px;">${socials.map(s => `
            <div class="row between admin-list-row">
              <div>
                <b>${esc(s.title)}</b>
                <span class="muted small" dir="ltr" style="margin-right:8px;">${esc(s.handle || s.url || '')}</span>
              </div>
              <div class="row" style="gap:6px;">
                <button class="btn small" onclick="openSocialEditor('${s.id}')">✎ ویرایش</button>
                <button class="btn small danger" onclick="deleteSocial('${s.id}')">✕ حذف</button>
              </div>
            </div>
          `).join('')}</div>`;
    }

    // رندر برنامه‌های آپلودشده برای کاربران توسط مدیر
    const admPlanBox = document.getElementById('admAssignedPlansList');
    if (admPlanBox && window.getAssignedPlansMap) {
      const map = window.getAssignedPlansMap();
      const entries = Object.entries(map || {});
      admPlanBox.innerHTML = !entries.length
        ? '<div class="muted small surface-box">هنوز برنامه‌ای برای کاربر دیگری آپلود نشده است.</div>'
        : `<div style="display:grid; gap:8px;">${entries.map(([email, entry]) => `
            <div class="row between admin-list-row" style="flex-wrap:wrap; gap:8px;">
              <div>
                <b dir="ltr">${esc(email)}</b>
                <span class="muted small" style="margin-right:8px;">${esc(entry.summary || entry.note || 'برنامه مطالعاتی')} · ${esc(entry.dateLabel || '')}</span>
              </div>
              <div class="row" style="gap:6px;">
                <button class="btn small" onclick="openPlanAssignerModal('${esc(email)}')">✎ ارسال مجدد</button>
                <button class="btn small danger" onclick="deleteAssignedPlan('${esc(email)}')">✕ حذف</button>
              </div>
            </div>
          `).join('')}</div>`;
    }
    if (window.renderAdminExamsList) window.renderAdminExamsList();
    if (window.renderExamsHub) window.renderExamsHub();
    if (window.isAdmin && window.renderAdminMonitor) window.renderAdminMonitor();
    if (window.setupLegacyAdminSectionTabs) window.setupLegacyAdminSectionTabs();
  };

  let legacyAdminActiveSection = 'exams';
  window.setLegacyAdminSection = function(sec) {
    legacyAdminActiveSection = sec || 'exams';
    window.setupLegacyAdminSectionTabs();
  };

  window.setupLegacyAdminSectionTabs = function() {
    const adminTab = document.getElementById('tab-admin');
    if (!adminTab) return;
    const directChildren = Array.from(adminTab.children).filter(el => el.id !== 'admSectionNavBar' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE');
    if (directChildren.length < 3) return;

    const classifyPanel = (el) => {
      const id = (el.id || '').toLowerCase();
      const html = el.innerHTML || '';
      if (el.querySelector('#admExamsList') || id.includes('exam') || html.includes('admExamsList')) return 'exams';
      if (el.querySelector('#admArticlesList') || html.includes('admArticlesList') || html.includes('openArticleEditor')) return 'articles';
      if (el.querySelector('#admDeadlinesList') || el.querySelector('#admCalculatorsList') || html.includes('admDeadlinesList') || html.includes('admCalculatorsList')) return 'tools';
      if (el.querySelector('#admAboutMembersList') || el.querySelector('#admContactSocialsList') || html.includes('admAboutMembersList') || html.includes('admContactSocialsList')) return 'settings';
      if (el.querySelector('#admAssignedPlansList') || el.querySelector('#adminMonitorRoot') || id.includes('monitor') || id.includes('qa') || html.includes('admAssignedPlansList') || html.includes('پرسش')) return 'students';
      return 'laws';
    };

    const sectionOrder = [
      { id: 'exams', label: 'آزمون‌های آنلاین' },
      { id: 'laws', label: 'قوانین و آرا' },
      { id: 'articles', label: 'مقالات نشریه' },
      { id: 'tools', label: 'مواعد و ابزارها' },
      { id: 'students', label: 'دانشجویان و پرسش‌ها' },
      { id: 'settings', label: 'معرفی و تماس' }
    ];

    const presentSecs = new Set();
    directChildren.forEach(el => {
      const sec = el.dataset.admSec || classifyPanel(el);
      el.dataset.admSec = sec;
      presentSecs.add(sec);
    });

    if (!presentSecs.has(legacyAdminActiveSection)) {
      legacyAdminActiveSection = sectionOrder.find(s => presentSecs.has(s.id))?.id || 'exams';
    }

    let nav = document.getElementById('admSectionNavBar');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'admSectionNavBar';
      nav.className = 'adm-section-nav';
      adminTab.insertBefore(nav, adminTab.firstChild);
    }

    nav.innerHTML = sectionOrder
      .filter(s => presentSecs.has(s.id))
      .map(s => `<button type="button" class="adm-subtab-btn ${legacyAdminActiveSection === s.id ? 'active' : ''}" onclick="setLegacyAdminSection('${s.id}')">${s.label}</button>`)
      .join('');

    directChildren.forEach(el => {
      el.style.display = el.dataset.admSec === legacyAdminActiveSection ? '' : 'none';
    });
  };

  // -------------------------------------------------------------------
  // ۴-الف. ماژول معرفی گروه حقوقی و اعضای تیم (قابل ویرایش و عکس‌گذاری توسط مدیر)
  // -------------------------------------------------------------------
  const ABOUT_KEY = 'baraat_about_v1';
  const DEFAULT_ABOUT = {
    kicker: 'مؤسسه و گروه حقوقی برائت',
    title: 'دفاع تخصصی، پژوهش حقوقی و برنامه‌ریزی حرفه‌ای وکالت',
    description: 'گروه حقوقی برائت با تمرکز بر پرونده‌های تخصصی حقوقی، کیفری، ثبتی و قراردادها، هم‌زمان در دو حوزه خدمات وکالت و آموزش نظام‌مند داوطلبان آزمون‌های حقوقی فعالیت می‌کند. ساختار ما بر دقت مستند به نص قانون، تحلیل رویه قضایی و همراهی شفاف با موکلین و پژوهشگران استوار است.',
    motto: 'عدالت بر پایه مستند قانونی، دقت در مواعد و پیگیری مستمر تا حصول نتیجه',
    heroCaption: 'گروه حقوقی برائت · دفتر پژوهش، مشاوره و پیگیری دعاوی',
    heroImage: './images/baraat-law-hero.jpg',
    pillars: [
      { title: 'دعاوی مدنی و ملکی', desc: 'تنظیم و دفاع تخصصی در پرونده‌های املاک، عقود، الزام به تنظیم سند و خسارات قراردادی.' },
      { title: 'دفاع کیفری و اقتصادی', desc: 'مشاوره و وکالت دقیق از مرحله تحقیقات مقدماتی دادسرا تا دیوان عالی کشور.' },
      { title: 'قراردادها و امور شرکت‌ها', desc: 'نگارش، بازبینی و داوری قراردادهای تجاری، مشارکت در ساخت و دعاوی شرکت‌های بازرگانی.' },
      { title: 'پژوهش و آموزش وکالت', desc: 'تنقیح قوانین، تحلیل آرای وحدت رویه و تدوین برنامه‌های مطالعاتی داوطلبان حقوقی.' }
    ],
    members: []
  };

  window.getAboutData = function() {
    try {
      const raw = localStorage.getItem(ABOUT_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_ABOUT));
      const parsed = JSON.parse(raw);
      return Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_ABOUT)), parsed, {
        pillars: Array.isArray(parsed.pillars) ? parsed.pillars : DEFAULT_ABOUT.pillars,
        members: Array.isArray(parsed.members) ? parsed.members : []
      });
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_ABOUT));
    }
  };

  async function saveAboutData(data, msg) {
    if (!window.isAdmin) { if (typeof toast === 'function') toast('فقط مدیر مجاز به ویرایش معرفی گروه است'); return; }
    localStorage.setItem(ABOUT_KEY, JSON.stringify(data));
    window.renderAbout();
    if (typeof window.renderAdminPanels === 'function') window.renderAdminPanels();
    const res = await syncToSupabase(ABOUT_KEY, data);
    if (res.ok) {
      if (typeof toast === 'function') toast(msg || 'اطلاعات معرفی گروه در سرور ذخیره شد.');
    } else {
      if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  }

  function compressImageFileToDataUrl(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
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
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          try {
            const url = canvas.toDataURL('image/jpeg', quality || 0.82);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function socialSmallLinkHtml(label, url) {
    if (!url) return '';
    const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    return `<a class="member-social-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  }

  window.renderAbout = function() {
    const root = document.getElementById('aboutPageRoot');
    if (!root) return;
    const d = window.getAboutData();
    const members = d.members || [];
    const heroImg = d.heroImage || './images/baraat-law-hero.jpg';

    root.innerHTML = `
      <div class="baraat-editorial-shell">
        <div class="baraat-about-hero">
          <div class="baraat-about-copy">
            <div>
              <div class="baraat-kicker">${esc(d.kicker || 'گروه حقوقی برائت')}</div>
              <h2 class="baraat-editorial-title" style="margin-top:10px;">${esc(d.title)}</h2>
              <p class="baraat-editorial-sub" style="margin-top:14px;">${esc(d.description)}</p>
            </div>
            <div>
              ${d.motto ? `<div class="baraat-motto-bar">${esc(d.motto)}</div>` : ''}
              <div class="row" style="gap:10px; margin-top:16px; flex-wrap:wrap;">
                <button class="btn primary" onclick="go('contact')">📞 ارتباط مستقیم و شبکه‌های اجتماعی</button>
                <button class="btn" onclick="go('articles')">📚 مقالات و پژوهش‌های گروه</button>
                ${window.isAdmin ? `<button class="btn" onclick="openAboutInfoEditor()">✏️ ویرایش معرفی گروه</button>` : ''}
              </div>
            </div>
          </div>
          <div class="baraat-about-visual">
            <img src="${esc(heroImg)}" alt="${esc(d.title)}" referrerpolicy="no-referrer" onerror="this.style.display='none';">
            <div class="baraat-about-visual-caption">
              <span>${esc(d.heroCaption || 'گروه حقوقی برائت')}</span>
              <span>⚖️</span>
            </div>
          </div>
        </div>

        ${(d.pillars && d.pillars.length) ? `
          <div>
            <div class="baraat-section-bar" style="margin-bottom:16px;">
              <div>
                <h3>محورهای تخصصی و حوزه‌های فعالیت</h3>
                <p>ساختار خدمات حقوقی، پژوهش دکترین و هدایت پرونده‌ها</p>
              </div>
            </div>
            <div class="baraat-pillars-grid">
              ${d.pillars.map((p, i) => `
                <div class="baraat-pillar-card">
                  <div class="baraat-pillar-num">۰${toFa(i + 1)}</div>
                  <h4>${esc(p.title)}</h4>
                  <p>${esc(p.desc)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div>
          <div class="baraat-section-bar" style="margin-bottom:18px;">
            <div>
              <h3>اعضای گروه حقوقی، وکلا و پژوهشگران</h3>
              <p>${members.length ? toFa(members.length) + ' عضو فعال در ساختار گروه حقوقی برائت' : 'فهرست وکلا، مشاوران و اعضای گروه حقوقی'}</p>
            </div>
            ${window.isAdmin ? `<button class="btn primary" onclick="openMemberEditor()">＋ افزودن عضو جدید</button>` : ''}
          </div>

          ${members.length === 0 ? `
            <div class="empty-glass-card" style="margin-top:8px;">
              <div class="empty-icon">🏛</div>
              <h3>هنوز مشخصات اعضا ثبت نشده است</h3>
              <p>مدیر سامانه می‌تواند از این بخش نام، عکس، سمت، شماره پروانه، سوابق و لینک شبکه‌های اجتماعی اعضای گروه را اضافه کند تا برای همه کاربران نمایش داده شود.</p>
              ${window.isAdmin ? `<div style="margin-top:16px;"><button class="btn primary" onclick="openMemberEditor()">＋ افزودن اولین عضو گروه</button></div>` : ''}
            </div>
          ` : `
            <div class="baraat-team-grid">
              ${members.map((m, idx) => {
                const initials = (m.name || 'ب').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('‌');
                const metaParts = [m.role, m.credentials].filter(Boolean).map(esc);
                return `
                  <article class="member-card">
                    <div class="member-photo-wrap">
                      ${m.photo
                        ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'member-monogram\\'><div class=\\'member-monogram-circle\\'>${esc(initials)}</div></div>'">`
                        : `<div class="member-monogram"><div class="member-monogram-circle">${esc(initials)}</div></div>`
                      }
                    </div>
                    <div class="member-card-body">
                      <h4 class="member-name">${esc(m.name)}</h4>
                      ${metaParts.length ? `<div class="member-meta-line">${metaParts.join(' · ')}</div>` : ''}
                      ${m.bio ? `<p class="member-bio">${esc(m.bio)}</p>` : '<div style="flex:1"></div>'}
                      ${(m.instagram || m.xUrl || m.telegram || m.phone || window.isAdmin) ? `
                        <div class="member-links-row">
                          <div class="member-social-btns">
                            ${socialSmallLinkHtml('اینستاگرام', m.instagram)}
                            ${socialSmallLinkHtml('ایکس (X)', m.xUrl)}
                            ${socialSmallLinkHtml('تلگرام', m.telegram)}
                            ${m.phone ? `<a class="member-social-link" href="tel:${esc(m.phone)}">تماس ↗</a>` : ''}
                          </div>
                          ${window.isAdmin ? `
                            <div class="row" style="gap:4px;">
                              ${idx > 0 ? `<button class="btn small" onclick="moveMember('${m.id}', -1)" title="جابه جایی">↑</button>` : ''}
                              ${idx < members.length - 1 ? `<button class="btn small" onclick="moveMember('${m.id}', 1)" title="جابه جایی">↓</button>` : ''}
                              <button class="btn small" onclick="openMemberEditor('${m.id}')" title="ویرایش">✎</button>
                              <button class="btn small danger" onclick="deleteMember('${m.id}')" title="حذف">✕</button>
                            </div>
                          ` : ''}
                        </div>
                      ` : ''}
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  };

  window.openAboutInfoEditor = function() {
    if (!window.isAdmin) return typeof toast === 'function' && toast('فقط مدیر مجاز است');
    const d = window.getAboutData();
    const m = document.getElementById('modal');
    if (!m) return;
    window.__tmpAboutHeroImg = d.heroImage || './images/baraat-law-hero.jpg';
    const pillarsText = (d.pillars || []).map(p => `${p.title} | ${p.desc}`).join('\n');

    m.innerHTML = `
      <h2>✏️ ویرایش معرفی و مشخصات گروه حقوقی</h2>
      <div class="form-grid">
        <div class="field">
          <label>برچسب بالای عنوان</label>
          <input id="edAbKicker" value="${esc(d.kicker || '')}">
        </div>
        <div class="field">
          <label>زیرنویس روی تصویر</label>
          <input id="edAbHeroCap" value="${esc(d.heroCaption || '')}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>تیتر اصلی معرفی گروه</label>
          <input id="edAbTitle" value="${esc(d.title || '')}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>توضیحات کامل معرفی گروه</label>
          <textarea id="edAbDesc" rows="4">${esc(d.description || '')}</textarea>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>شعار یا خط‌مشی گروه</label>
          <input id="edAbMotto" value="${esc(d.motto || '')}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>تصویر شاخص صفحه معرفی (آپلود عکس یا لینک)</label>
          <div class="baraat-photo-upload-box">
            <img id="edAbHeroPreview" class="baraat-photo-preview" src="${esc(window.__tmpAboutHeroImg)}" onerror="this.style.opacity='0.3'">
            <div style="flex:1; display:grid; gap:6px;">
              <input type="file" id="edAbHeroFile" accept="image/*" style="font-size:12px;">
              <input id="edAbHeroUrl" dir="ltr" value="${esc(window.__tmpAboutHeroImg)}" placeholder="./images/baraat-law-hero.jpg">
            </div>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>محورهای تخصصی (هر سطر به قالب: عنوان | توضیح)</label>
          <textarea id="edAbPillars" rows="4">${esc(pillarsText)}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitAboutInfo()">ذخیره و انتشار</button>
      </div>
    `;
    const fileInput = document.getElementById('edAbHeroFile');
    const urlInput = document.getElementById('edAbHeroUrl');
    const preview = document.getElementById('edAbHeroPreview');
    if (fileInput) {
      fileInput.onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const dataUrl = await compressImageFileToDataUrl(f, 960, 0.8);
          window.__tmpAboutHeroImg = dataUrl;
          if (urlInput) urlInput.value = dataUrl;
          if (preview) { preview.src = dataUrl; preview.style.opacity = '1'; }
          if (typeof toast === 'function') toast('تصویر آماده ذخیره شد.');
        } catch (err) {
          alert('خواندن تصویر ناموفق بود');
        }
      };
    }
    if (urlInput) {
      urlInput.oninput = () => {
        window.__tmpAboutHeroImg = urlInput.value.trim();
        if (preview) preview.src = window.__tmpAboutHeroImg;
      };
    }
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitAboutInfo = function() {
    const cur = window.getAboutData();
    const pillars = (document.getElementById('edAbPillars')?.value || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const idx = l.indexOf('|');
      return idx >= 0 ? { title: l.slice(0, idx).trim(), desc: l.slice(idx + 1).trim() } : { title: l, desc: '' };
    });
    const next = Object.assign({}, cur, {
      kicker: (document.getElementById('edAbKicker')?.value || '').trim(),
      heroCaption: (document.getElementById('edAbHeroCap')?.value || '').trim(),
      title: (document.getElementById('edAbTitle')?.value || '').trim() || cur.title,
      description: (document.getElementById('edAbDesc')?.value || '').trim(),
      motto: (document.getElementById('edAbMotto')?.value || '').trim(),
      heroImage: (document.getElementById('edAbHeroUrl')?.value || '').trim() || './images/baraat-law-hero.jpg',
      pillars
    });
    closeModal();
    saveAboutData(next, 'مشخصات معرفی گروه با موفقیت ذخیره و منتشر شد.');
  };

  window.openMemberEditor = function(id) {
    if (!window.isAdmin) return typeof toast === 'function' && toast('فقط مدیر مجاز به افزودن یا ویرایش اعضاست');
    const cur = window.getAboutData();
    let mem = { id: 'mem_' + Date.now(), name: '', role: '', credentials: '', bio: '', photo: '', instagram: '', xUrl: '', telegram: '', phone: '' };
    if (id) {
      const f = (cur.members || []).find(x => x.id === id);
      if (f) mem = Object.assign({}, mem, f);
    }
    window.__tmpMemberPhoto = mem.photo || '';
    const m = document.getElementById('modal');
    if (!m) return;

    m.innerHTML = `
      <h2>${id ? 'ویرایش مشخصات عضو گروه' : 'افزودن عضو جدید به گروه حقوقی'}</h2>
      <div class="form-grid">
        <div class="field">
          <label>نام و نام خانوادگی *</label>
          <input id="edMemName" value="${esc(mem.name)}" placeholder="مثلاً: دکتر رضا وفایی">
        </div>
        <div class="field">
          <label>سمت / جایگاه در گروه</label>
          <input id="edMemRole" value="${esc(mem.role)}" placeholder="مثلاً: وکیل پایه یک دادگستری و مدیر گروه">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>تحصیلات / شماره پروانه / تخصص کلیدی</label>
          <input id="edMemCred" value="${esc(mem.credentials)}" placeholder="مثلاً: کانون وکلای مرکز · پروانه ۱۲۳۴۵ · متخصص دعاوی ملکی و قراردادها">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>عکس عضو (آپلود مستقیم از گوشی/کامپیوتر یا لینک عکس)</label>
          <div class="baraat-photo-upload-box">
            <img id="edMemPhotoPreview" class="baraat-photo-preview" src="${esc(mem.photo || '')}" style="${mem.photo ? '' : 'display:none;'}">
            <div style="flex:1; display:grid; gap:6px;">
              <div class="row" style="gap:6px; flex-wrap:wrap;">
                <input type="file" id="edMemPhotoFile" accept="image/*" style="font-size:12px; flex:1;">
                <button type="button" class="btn small danger" onclick="clearMemberPhotoModal()">حذف عکس</button>
              </div>
              <input id="edMemPhotoUrl" dir="ltr" value="${esc(mem.photo || '')}" placeholder="یا آدرس اینترنتی عکس را وارد کنید (اختیاری)">
            </div>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>معرفی، سوابق و مشخصات کامل</label>
          <textarea id="edMemBio" rows="4" placeholder="سوابق وکالت، تالیفات، دپارتمان تخصصی و افتخارات علمی و حرفه‌ای...">${esc(mem.bio || '')}</textarea>
        </div>
        <div class="field">
          <label>لینک اینستاگرام (اختیاری)</label>
          <input id="edMemIg" dir="ltr" value="${esc(mem.instagram || '')}" placeholder="https://instagram.com/...">
        </div>
        <div class="field">
          <label>لینک ایکس / X (اختیاری)</label>
          <input id="edMemX" dir="ltr" value="${esc(mem.xUrl || '')}" placeholder="https://x.com/...">
        </div>
        <div class="field">
          <label>لینک تلگرام (اختیاری)</label>
          <input id="edMemTg" dir="ltr" value="${esc(mem.telegram || '')}" placeholder="https://t.me/...">
        </div>
        <div class="field">
          <label>شماره تماس مستقیم (اختیاری)</label>
          <input id="edMemPhone" dir="ltr" value="${esc(mem.phone || '')}" placeholder="0912...">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitMember('${mem.id}')">ذخیره و انتشار عضو</button>
      </div>
    `;

    const fileIn = document.getElementById('edMemPhotoFile');
    const urlIn = document.getElementById('edMemPhotoUrl');
    const prev = document.getElementById('edMemPhotoPreview');
    if (fileIn) {
      fileIn.onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const dataUrl = await compressImageFileToDataUrl(f, 440, 0.82);
          window.__tmpMemberPhoto = dataUrl;
          if (urlIn) urlIn.value = dataUrl;
          if (prev) { prev.src = dataUrl; prev.style.display = 'block'; }
          if (typeof toast === 'function') toast('عکس عضو فشرده‌سازی و آماده ذخیره شد.');
        } catch (err) {
          alert('خطا در بارگذاری تصویر');
        }
      };
    }
    if (urlIn) {
      urlIn.oninput = () => {
        window.__tmpMemberPhoto = urlIn.value.trim();
        if (prev) {
          prev.src = window.__tmpMemberPhoto;
          prev.style.display = window.__tmpMemberPhoto ? 'block' : 'none';
        }
      };
    }
    document.getElementById('modalBack').classList.add('show');
  };

  window.clearMemberPhotoModal = function() {
    window.__tmpMemberPhoto = '';
    const u = document.getElementById('edMemPhotoUrl');
    const f = document.getElementById('edMemPhotoFile');
    const p = document.getElementById('edMemPhotoPreview');
    if (u) u.value = '';
    if (f) f.value = '';
    if (p) { p.src = ''; p.style.display = 'none'; }
  };

  window.submitMember = function(id) {
    const name = (document.getElementById('edMemName')?.value || '').trim();
    if (!name) return alert('لطفاً نام عضو را وارد کنید.');
    const cur = window.getAboutData();
    const members = cur.members || [];
    const item = {
      id,
      name,
      role: (document.getElementById('edMemRole')?.value || '').trim(),
      credentials: (document.getElementById('edMemCred')?.value || '').trim(),
      bio: (document.getElementById('edMemBio')?.value || '').trim(),
      photo: (document.getElementById('edMemPhotoUrl')?.value || window.__tmpMemberPhoto || '').trim(),
      instagram: (document.getElementById('edMemIg')?.value || '').trim(),
      xUrl: (document.getElementById('edMemX')?.value || '').trim(),
      telegram: (document.getElementById('edMemTg')?.value || '').trim(),
      phone: (document.getElementById('edMemPhone')?.value || '').trim()
    };
    const idx = members.findIndex(x => x.id === id);
    if (idx >= 0) members[idx] = item;
    else members.push(item);
    cur.members = members;
    closeModal();
    saveAboutData(cur, 'اطلاعات عضو با موفقیت ذخیره و منتشر شد.');
  };

  window.deleteMember = function(id) {
    if (!window.isAdmin) return;
    if (!confirm('این عضو از لیست معرفی گروه حذف شود؟')) return;
    const cur = window.getAboutData();
    cur.members = (cur.members || []).filter(m => m.id !== id);
    saveAboutData(cur, 'عضو از لیست گروه حذف شد.');
  };

  window.moveMember = function(id, dir) {
    if (!window.isAdmin) return;
    const cur = window.getAboutData();
    const list = cur.members || [];
    const i = list.findIndex(m => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    cur.members = list;
    saveAboutData(cur, 'ترتیب نمایش اعضا به‌روزرسانی شد.');
  };

  // -------------------------------------------------------------------
  // ۴-ب. ماژول تماس با ما و شبکه‌های اجتماعی (اینستاگرام، ایکس، تلگرام، واتساپ...)
  // -------------------------------------------------------------------
  const CONTACT_KEY = 'baraat_contact_v1';
  const DEFAULT_CONTACT = {
    headline: 'ارتباط مستقیم با گروه حقوقی برائت',
    subheadline: 'برای دریافت وقت مشاوره تخصصی، پیگیری پرونده‌ها یا همراهی با تحلیل‌های حقوقی روز از راه‌های ارتباطی زیر و شبکه‌های اجتماعی رسمی ما استفاده کنید.',
    phone: '',
    whatsappPhone: '',
    email: '',
    address: 'دفتر مرکزی: اطلاعات دقیق نشانی توسط مدیر سامانه تکمیل می‌شود',
    hours: 'شنبه تا چهارشنبه · ساعت ۹ الی ۱۸ (پنج‌شنبه‌ها با هماهنگی قبلی)',
    mapUrl: '',
    socials: [
      { id: 'soc_ig', platform: 'instagram', title: 'اینستاگرام رسمی برائت', handle: '@baraat_law', url: 'https://instagram.com/', desc: 'ویدیوهای آموزشی، نکات کاربردی دعاوی و تحلیل آرای روز' },
      { id: 'soc_x', platform: 'x', title: 'ایکس (توییتر سابق)', handle: '@baraat_law', url: 'https://x.com/', desc: 'یادداشت‌های سریع حقوقی، نقد قوانین جدید و رویه قضایی' },
      { id: 'soc_tg', platform: 'telegram', title: 'کانال تلگرام برائت', handle: '@baraat_law', url: 'https://t.me/', desc: 'فایل قوانین تنقیح‌شده، آرای وحدت رویه و اطلاعیه‌های آزمون' }
    ]
  };

  window.getContactData = function() {
    try {
      const raw = localStorage.getItem(CONTACT_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONTACT));
      const parsed = JSON.parse(raw);
      return Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_CONTACT)), parsed, {
        socials: Array.isArray(parsed.socials) ? parsed.socials : DEFAULT_CONTACT.socials
      });
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_CONTACT));
    }
  };

  async function saveContactData(data, msg) {
    if (!window.isAdmin) { if (typeof toast === 'function') toast('فقط مدیر مجاز به ویرایش تماس با ما است'); return; }
    localStorage.setItem(CONTACT_KEY, JSON.stringify(data));
    window.renderContact();
    if (typeof window.renderAdminPanels === 'function') window.renderAdminPanels();
    const res = await syncToSupabase(CONTACT_KEY, data);
    if (res.ok) {
      if (typeof toast === 'function') toast(msg || 'اطلاعات تماس و شبکه‌های اجتماعی روی سرور ذخیره شد.');
    } else {
      if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
    }
  }

  window.copyTextSafe = function(txt, label) {
    if (!txt) return;
    try {
      navigator.clipboard.writeText(txt);
      if (typeof toast === 'function') toast((label || 'متن') + ' کپی شد.');
    } catch (e) {
      if (typeof toast === 'function') toast(txt);
    }
  };

  function getSocialSvgIcon(platform) {
    switch (platform) {
      case 'instagram':
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
      case 'x':
        return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
      case 'telegram':
        return '<svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 3.6c-.4-.3-1-.4-1.6-.1L2.6 10.6c-.7.3-1.1.8-1 1.4.1.6.5 1.1 1.2 1.3l4.3 1.4 1.7 5.3c.2.6.7 1 1.3 1 .5 0 1-.2 1.3-.6l2.5-2.7 4.4 3.2c.4.3.8.4 1.2.4.7 0 1.3-.5 1.5-1.3l3.1-14.9c.2-.6 0-1.2-.2-1.5zM9.8 14.3l8.1-6.9-6.3 7.9-.3 3.1-1.5-4.1z"/></svg>';
      case 'whatsapp':
        return '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
      case 'linkedin':
        return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>';
      case 'youtube':
        return '<svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>';
      default:
        return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    }
  }

  window.renderContact = function() {
    const root = document.getElementById('contactPageRoot');
    if (!root) return;
    const c = window.getContactData();
    const socials = c.socials || [];

    root.innerHTML = `
      <div class="baraat-editorial-shell">
        <div class="baraat-contact-hero">
          <div>
            <div style="font-size:12px; font-weight:700; color:#99f6e4;">تماس با گروه حقوقی برائت</div>
            <h2>${esc(c.headline)}</h2>
            <p>${esc(c.subheadline)}</p>
          </div>
          ${window.isAdmin ? `
            <div class="row" style="gap:8px;">
              <button class="btn" onclick="openContactEditor()" style="background:rgba(255,255,255,0.14); color:#ffffff; border-color:rgba(255,255,255,0.28);">✏️ ویرایش اطلاعات تماس</button>
              <button class="btn primary" onclick="openSocialEditor()">＋ افزودن شبکه اجتماعی</button>
            </div>
          ` : ''}
        </div>

        <div class="contact-info-grid">
          <div class="contact-info-tile">
            <div>
              <div class="contact-tile-top">
                <div class="contact-tile-icon">📞</div>
                <div class="contact-tile-label">تلفن تماس و هماهنگی مشاوره</div>
              </div>
              <div class="contact-tile-val" dir="ltr" style="margin-top:12px; text-align:right;">${esc(c.phone || 'در انتظار ثبت توسط مدیر')}</div>
            </div>
            ${c.phone ? `
              <div class="contact-tile-actions">
                <a class="btn small primary" href="tel:${esc(c.phone)}">تماس مستقیم</a>
                <button class="btn small" onclick="copyTextSafe('${esc(c.phone)}', 'شماره تماس')">کپی شماره</button>
              </div>
            ` : ''}
          </div>

          <div class="contact-info-tile">
            <div>
              <div class="contact-tile-top">
                <div class="contact-tile-icon">✉️</div>
                <div class="contact-tile-label">ایمیل رسمی گروه</div>
              </div>
              <div class="contact-tile-val" dir="ltr" style="margin-top:12px; text-align:right;">${esc(c.email || 'در انتظار ثبت توسط مدیر')}</div>
            </div>
            ${c.email ? `
              <div class="contact-tile-actions">
                <a class="btn small primary" href="mailto:${esc(c.email)}">ارسال ایمیل</a>
                <button class="btn small" onclick="copyTextSafe('${esc(c.email)}', 'ایمیل')">کپی ایمیل</button>
              </div>
            ` : ''}
          </div>

          <div class="contact-info-tile">
            <div>
              <div class="contact-tile-top">
                <div class="contact-tile-icon">📍</div>
                <div class="contact-tile-label">نشانی دفتر گروه حقوقی</div>
              </div>
              <div class="contact-tile-val" style="margin-top:12px; font-size:14px;">${esc(c.address || 'ثبت نشده')}</div>
            </div>
            ${(c.address || c.mapUrl) ? `
              <div class="contact-tile-actions">
                ${c.mapUrl ? `<a class="btn small primary" href="${esc(c.mapUrl)}" target="_blank" rel="noopener noreferrer">مشاهده روی نقشه ↗</a>` : ''}
                ${c.address ? `<button class="btn small" onclick="copyTextSafe('${esc(c.address)}', 'نشانی')">کپی نشانی</button>` : ''}
              </div>
            ` : ''}
          </div>

          <div class="contact-info-tile">
            <div>
              <div class="contact-tile-top">
                <div class="contact-tile-icon">🕒</div>
                <div class="contact-tile-label">ساعات پاسخگویی و مشاوره</div>
              </div>
              <div class="contact-tile-val" style="margin-top:12px; font-size:14px;">${esc(c.hours || 'هماهنگی با وقت قبلی')}</div>
            </div>
            ${c.whatsappPhone ? `
              <div class="contact-tile-actions">
                <a class="btn small primary" href="https://wa.me/${esc(c.whatsappPhone.replace(/\D/g,''))}" target="_blank" rel="noopener noreferrer">پیام در واتساپ ↗</a>
              </div>
            ` : ''}
          </div>
        </div>

        <div>
          <div class="baraat-section-bar" style="margin-bottom:18px;">
            <div>
              <h3>شبکه‌های اجتماعی رسمی گروه حقوقی برائت</h3>
              <p>اینستاگرام، ایکس (X)، تلگرام و سایر بسترهای ارتباطی برای دنبال کردن مطالب و تحلیل‌های حقوقی</p>
            </div>
            ${window.isAdmin ? `<button class="btn primary" onclick="openSocialEditor()">＋ افزودن شبکه اجتماعی</button>` : ''}
          </div>

          ${socials.length === 0 ? `
            <div class="empty-glass-card">
              <div class="empty-icon">🌐</div>
              <h3>هنوز لینک شبکه اجتماعی ثبت نشده است</h3>
              <p>مدیر سامانه می‌تواند لینک صفحه اینستاگرام، ایکس و تلگرام را از اینجا اضافه کند.</p>
            </div>
          ` : `
            <div class="baraat-social-grid">
              ${socials.map(s => {
                const safeHref = s.url && /^https?:\/\//i.test(s.url) ? s.url : ('https://' + (s.url || ''));
                return `
                  <div class="social-card">
                    <div>
                      <div class="social-card-head">
                        <div class="social-brand-icon ${esc(s.platform || 'other')}">${getSocialSvgIcon(s.platform)}</div>
                        <div>
                          <h4 class="social-title">${esc(s.title)}</h4>
                          ${s.handle ? `<div class="social-handle" dir="ltr">${esc(s.handle)}</div>` : ''}
                        </div>
                      </div>
                      ${s.desc ? `<p class="social-desc" style="margin-top:12px;">${esc(s.desc)}</p>` : ''}
                    </div>
                    <div class="social-card-foot">
                      <a class="btn small primary" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">مشاهده صفحه ↗</a>
                      <div class="row" style="gap:6px;">
                        ${s.handle ? `<button class="btn small" onclick="copyTextSafe('${esc(s.handle)}', 'شناسه')">کپی آیدی</button>` : ''}
                        ${window.isAdmin ? `
                          <button class="btn small" onclick="openSocialEditor('${s.id}')" title="ویرایش">✎</button>
                          <button class="btn small danger" onclick="deleteSocial('${s.id}')" title="حذف">✕</button>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  };

  window.openContactEditor = function() {
    if (!window.isAdmin) return typeof toast === 'function' && toast('فقط مدیر مجاز است');
    const c = window.getContactData();
    const m = document.getElementById('modal');
    if (!m) return;
    m.innerHTML = `
      <h2>✏️ ویرایش اطلاعات تماس با ما</h2>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1;">
          <label>تیتر صفحه تماس با ما</label>
          <input id="edCtHeadline" value="${esc(c.headline || '')}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>توضیح کوتاه بالای صفحه</label>
          <textarea id="edCtSub" rows="2">${esc(c.subheadline || '')}</textarea>
        </div>
        <div class="field">
          <label>شماره تماس مستقیم</label>
          <input id="edCtPhone" dir="ltr" value="${esc(c.phone || '')}" placeholder="02188000000 یا 0912...">
        </div>
        <div class="field">
          <label>شماره واتساپ (با کد کشور مثل 98912...)</label>
          <input id="edCtWa" dir="ltr" value="${esc(c.whatsappPhone || '')}" placeholder="989120000000">
        </div>
        <div class="field">
          <label>ایمیل رسمی</label>
          <input id="edCtEmail" dir="ltr" value="${esc(c.email || '')}" placeholder="info@baraat.ir">
        </div>
        <div class="field">
          <label>ساعات کاری و مشاوره</label>
          <input id="edCtHours" value="${esc(c.hours || '')}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>نشانی دفتر</label>
          <textarea id="edCtAddr" rows="2">${esc(c.address || '')}</textarea>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>لینک نقشه (Google Maps / نشان - اختیاری)</label>
          <input id="edCtMap" dir="ltr" value="${esc(c.mapUrl || '')}" placeholder="https://maps.google.com/...">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitContactInfo()">ذخیره و انتشار</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitContactInfo = function() {
    const cur = window.getContactData();
    const next = Object.assign({}, cur, {
      headline: (document.getElementById('edCtHeadline')?.value || '').trim() || cur.headline,
      subheadline: (document.getElementById('edCtSub')?.value || '').trim(),
      phone: (document.getElementById('edCtPhone')?.value || '').trim(),
      whatsappPhone: (document.getElementById('edCtWa')?.value || '').trim(),
      email: (document.getElementById('edCtEmail')?.value || '').trim(),
      hours: (document.getElementById('edCtHours')?.value || '').trim(),
      address: (document.getElementById('edCtAddr')?.value || '').trim(),
      mapUrl: (document.getElementById('edCtMap')?.value || '').trim()
    });
    closeModal();
    saveContactData(next, 'اطلاعات تماس گروه با موفقیت منتشر شد.');
  };

  window.openSocialEditor = function(id) {
    if (!window.isAdmin) return typeof toast === 'function' && toast('فقط مدیر مجاز است');
    const cur = window.getContactData();
    let s = { id: 'soc_' + Date.now(), platform: 'instagram', title: 'اینستاگرام', handle: '@', url: 'https://', desc: '' };
    if (id) {
      const f = (cur.socials || []).find(x => x.id === id);
      if (f) s = Object.assign({}, f);
    }
    const m = document.getElementById('modal');
    if (!m) return;
    m.innerHTML = `
      <h2>${id ? 'ویرایش شبکه اجتماعی' : 'افزودن شبکه اجتماعی جدید'}</h2>
      <div class="form-grid">
        <div class="field">
          <label>پلتفرم</label>
          <select id="edSocPlat">
            <option value="instagram" ${s.platform==='instagram'?'selected':''}>اینستاگرام (Instagram)</option>
            <option value="x" ${s.platform==='x'?'selected':''}>ایکس (X / Twitter)</option>
            <option value="telegram" ${s.platform==='telegram'?'selected':''}>تلگرام (Telegram)</option>
            <option value="whatsapp" ${s.platform==='whatsapp'?'selected':''}>واتساپ (WhatsApp)</option>
            <option value="linkedin" ${s.platform==='linkedin'?'selected':''}>لینکدین (LinkedIn)</option>
            <option value="youtube" ${s.platform==='youtube'?'selected':''}>یوتیوب (YouTube)</option>
            <option value="aparat" ${s.platform==='aparat'?'selected':''}>آپارات</option>
            <option value="eitaa" ${s.platform==='eitaa'?'selected':''}>ایتا</option>
            <option value="bale" ${s.platform==='bale'?'selected':''}>بله</option>
            <option value="website" ${s.platform==='website'?'selected':''}>وب‌سایت</option>
            <option value="other" ${s.platform==='other'?'selected':''}>سایر</option>
          </select>
        </div>
        <div class="field">
          <label>عنوان نمایشی کارت</label>
          <input id="edSocTitle" value="${esc(s.title)}" placeholder="مثلاً: صفحه رسمی اینستاگرام">
        </div>
        <div class="field">
          <label>شناسه کاربری (آیدی)</label>
          <input id="edSocHandle" dir="ltr" value="${esc(s.handle || '')}" placeholder="@baraat_law">
        </div>
        <div class="field">
          <label>آدرس لینک صفحه *</label>
          <input id="edSocUrl" dir="ltr" value="${esc(s.url || '')}" placeholder="https://instagram.com/baraat_law">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>توضیح کوتاه محتوا</label>
          <textarea id="edSocDesc" rows="2" placeholder="چه مطالبی در این شبکه منتشر می‌شود...">${esc(s.desc || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitSocial('${s.id}')">ذخیره و انتشار</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitSocial = function(id) {
    const title = (document.getElementById('edSocTitle')?.value || '').trim();
    const url = (document.getElementById('edSocUrl')?.value || '').trim();
    if (!title || !url) return alert('عنوان و لینک صفحه را وارد کنید.');
    const cur = window.getContactData();
    const item = {
      id,
      platform: document.getElementById('edSocPlat')?.value || 'other',
      title,
      handle: (document.getElementById('edSocHandle')?.value || '').trim(),
      url: /^https?:\/\//i.test(url) ? url : 'https://' + url,
      desc: (document.getElementById('edSocDesc')?.value || '').trim()
    };
    const list = cur.socials || [];
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
    cur.socials = list;
    closeModal();
    saveContactData(cur, 'شبکه اجتماعی با موفقیت ذخیره شد.');
  };

  window.deleteSocial = function(id) {
    if (!window.isAdmin) return;
    if (!confirm('این شبکه اجتماعی حذف شود؟')) return;
    const cur = window.getContactData();
    cur.socials = (cur.socials || []).filter(x => x.id !== id);
    saveContactData(cur, 'شبکه اجتماعی حذف شد.');
  };

  // -------------------------------------------------------------------
  // ۴-ج. آپلود و ارسال برنامه مطالعاتی برای کاربران (اختصاصی مدیر)
  // -------------------------------------------------------------------
  const ASSIGNED_PLANS_KEY = 'baraat_assigned_plans_v1';

  window.getAssignedPlansMap = function() {
    try {
      const raw = localStorage.getItem(ASSIGNED_PLANS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  };

  window.openPlanAssignerModal = async function(prefillEmail) {
    if (!window.isAdmin) {
      if (typeof toast === 'function') toast('فقط مدیر سامانه می‌تواند برای کاربران برنامه آپلود کند.');
      return;
    }
    const helpers = window.BARAAT_PLANNER_HELPERS || { LIB: [] };
    const names = window.LAWDB && window.LAWDB.names ? window.LAWDB.names() : [];
    const m = document.getElementById('modal');
    if (!m) return;
    window.__tmpAssignedJson = null;

    m.innerHTML = `
      <h2>📤 آپلود و ارسال برنامه مطالعاتی برای کاربر</h2>
      <p class="muted small" style="line-height:1.8;">
        ایمیل کاربر دریافت‌کننده را وارد کنید و برنامه را انتخاب یا فایل پشتیبان را آپلود کنید. به محض ورود کاربر به بخش برنامه مطالعاتی، برنامه خودکار برای او بارگذاری می‌شود.
      </p>
      <div class="form-grid" style="margin-top:10px;">
        <div class="field" style="grid-column:1/-1;">
          <label>ایمیل کاربر دریافت‌کننده *</label>
          <input id="paEmail" type="email" dir="ltr" value="${esc(prefillEmail || '')}" placeholder="user@example.com">
        </div>
        <div class="field">
          <label>منبع برنامه</label>
          <select id="paKind" onchange="togglePlanAssignKind()">
            <option value="lib">انتخاب از کتابخانه برنامه‌های استاندارد</option>
            <option value="subjectSplit">برنامه بر اساس درس (بخش‌بندی خودکار ماده تا ماده)</option>
            <option value="json">آپلود فایل یا متن پشتیبان (JSON)</option>
            <option value="text">ورود برنامه متنی اختصاصی (روز ۱ ـ ...)</option>
          </select>
        </div>
        <div class="field">
          <label>نحوه اعمال در حساب کاربر</label>
          <select id="paMode">
            <option value="merge">ادغام با برنامه فعلی کاربر (حفظ پیشرفت قبلی)</option>
            <option value="replace">جایگزینی کامل برنامه کاربر</option>
          </select>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>یادداشت یا عنوان پیام برای کاربر (اختیاری)</label>
          <input id="paNote" placeholder="مثلاً: برنامه مطالعاتی هفته اول تا سوم · گروه برائت">
        </div>
      </div>

      <div id="paBoxLib" class="surface-box" style="margin-top:14px;">
        <label style="font-size:12.5px; font-weight:700; display:block; margin-bottom:8px;">انتخاب دروس کتابخانه استاندارد:</label>
        <div style="display:grid; gap:6px;">
          ${(helpers.LIB || []).map(p => `
            <label class="check" style="margin:0; cursor:pointer;">
              <input type="checkbox" name="paLibId" value="${esc(p.id)}">
              <span>${esc(p.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div id="paBoxSubjectSplit" class="hidden surface-box" style="margin-top:14px;">
        <div class="form-grid">
          <div class="field">
            <label>عنوان درس *</label>
            <input id="paSubName" value="حقوق مدنی" placeholder="مثلاً: حقوق مدنی">
          </div>
          <div class="field">
            <label>قانون مرتبط در پایگاه</label>
            <select id="paSubDb">
              <option value="">— انتخاب یا نوشتن دستی —</option>
              ${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>نام منبع نمایشی</label>
            <input id="paSubLaw" placeholder="مثلاً: قانون مدنی">
          </div>
          <div class="field">
            <label>عنوان پیش‌فرض بخش‌ها</label>
            <input id="paSubPrefix" placeholder="مثلاً: مبحث حقوق مدنی">
          </div>
          <div class="field">
            <label>از ماده شماره</label>
            <input id="paSubFrom" type="number" min="1" value="1">
          </div>
          <div class="field">
            <label>تا ماده شماره</label>
            <input id="paSubTo" type="number" min="1" value="200">
          </div>
          <div class="field">
            <label>تعداد ماده در هر بخش</label>
            <input id="paSubChunk" type="number" min="1" value="25">
          </div>
          <div class="field">
            <label>تکلیف هر بخش (اختیاری)</label>
            <input id="paSubTask" placeholder="مثلاً: مطالعه نص + نکات و تست">
          </div>
        </div>
      </div>

      <div id="paBoxJson" class="hidden surface-box" style="margin-top:14px;">
        <div class="field">
          <label>انتخاب فایل JSON برنامه (خروجی پشتیبان)</label>
          <input type="file" id="paJsonFile" accept=".json,application/json">
        </div>
        <div class="field" style="margin-top:8px;">
          <label>یا چسباندن متن JSON برنامه</label>
          <textarea id="paJsonText" rows="5" dir="ltr" placeholder='{"subjects":[...],"days":[...]}'></textarea>
        </div>
      </div>

      <div id="paBoxText" class="hidden surface-box" style="margin-top:14px;">
        <div class="form-grid">
          <div class="field">
            <label>عنوان درس</label>
            <input id="paTxtSub" placeholder="مثلاً: حقوق مدنی">
          </div>
          <div class="field">
            <label>منبع / قانون مرتبط در پایگاه</label>
            <select id="paTxtDb">
              <option value="">— بدون اتصال به پایگاه —</option>
              ${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="grid-column:1/-1;">
            <label>نام منبع نمایشی</label>
            <input id="paTxtLaw" placeholder="مثلاً: قانون مدنی">
          </div>
          <div class="field" style="grid-column:1/-1;">
            <label>متن برنامه (قالب: روز ۱ ـ عنوان)</label>
            <textarea id="paTxtBody" rows="6" placeholder="روز ۱ ـ کلیات قراردادها&#10;- مواد ۱۸۳ تا ۱۹۰&#10;- ۲۰ تست"></textarea>
          </div>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitPlanAssigner()">☁️ آپلود و ارسال برای کاربر</button>
      </div>
    `;

    const fileEl = document.getElementById('paJsonFile');
    if (fileEl) {
      fileEl.onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const txt = await f.text();
          const area = document.getElementById('paJsonText');
          if (area) area.value = txt;
          if (typeof toast === 'function') toast('فایل برنامه خوانده شد.');
        } catch (err) {
          alert('خواندن فایل ناموفق بود');
        }
      };
    }

    document.getElementById('modalBack').classList.add('show');
  };

  window.togglePlanAssignKind = function() {
    const k = document.getElementById('paKind')?.value || 'lib';
    document.getElementById('paBoxLib')?.classList.toggle('hidden', k !== 'lib');
    document.getElementById('paBoxSubjectSplit')?.classList.toggle('hidden', k !== 'subjectSplit');
    document.getElementById('paBoxJson')?.classList.toggle('hidden', k !== 'json');
    document.getElementById('paBoxText')?.classList.toggle('hidden', k !== 'text');
  };

  window.submitPlanAssigner = async function() {
    if (!window.isAdmin) return;
    const email = (document.getElementById('paEmail')?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return alert('لطفاً ایمیل معتبر کاربر را وارد کنید.');

    const kind = document.getElementById('paKind')?.value || 'lib';
    const mode = document.getElementById('paMode')?.value || 'merge';
    const note = (document.getElementById('paNote')?.value || '').trim();
    const helpers = window.BARAAT_PLANNER_HELPERS;

    let payload = {
      mode,
      note,
      planKind: kind,
      updatedAt: Date.now(),
      dateLabel: new Date().toLocaleDateString('fa-IR')
    };

    if (kind === 'lib') {
      const ids = [...document.querySelectorAll('input[name="paLibId"]:checked')].map(c => c.value);
      if (!ids.length) return alert('حداقل یک برنامه از کتابخانه انتخاب کنید.');
      payload.libIds = ids;
      payload.summary = 'کتابخانه (' + ids.map(id => ((helpers?.LIB || []).find(p => p.id === id)?.name || id)).join(' و ') + ')';
    } else if (kind === 'subjectSplit') {
      const subjectName = (document.getElementById('paSubName')?.value || '').trim() || 'درس اختصاصی';
      const dbLaw = (document.getElementById('paSubDb')?.value || '').trim();
      const lawName = (document.getElementById('paSubLaw')?.value || '').trim() || dbLaw || subjectName;
      const fromNum = Math.max(1, Number(document.getElementById('paSubFrom')?.value || 1));
      const toNum = Math.max(fromNum, Number(document.getElementById('paSubTo')?.value || fromNum));
      const chunkSize = Math.max(1, Number(document.getElementById('paSubChunk')?.value || 25));
      const sectionTitlePrefix = (document.getElementById('paSubPrefix')?.value || '').trim();
      const taskText = (document.getElementById('paSubTask')?.value || '').trim();
      payload.subjectName = subjectName;
      payload.dbLaw = dbLaw;
      payload.lawName = lawName;
      payload.fromNum = fromNum;
      payload.toNum = toNum;
      payload.chunkSize = chunkSize;
      payload.sectionTitlePrefix = sectionTitlePrefix;
      payload.taskText = taskText;
      const secCount = Math.ceil((toNum - fromNum + 1) / chunkSize);
      payload.summary = `برنامه درسی ${subjectName} (مواد ${toFa(fromNum)} تا ${toFa(toNum)} · ${toFa(secCount)} بخش)`;
    } else if (kind === 'json') {
      const raw = (document.getElementById('paJsonText')?.value || '').trim();
      if (!raw) return alert('فایل یا متن JSON برنامه را وارد کنید.');
      let parsed;
      try {
        parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.subjects) || (!Array.isArray(parsed.days) && !Array.isArray(parsed.subjectSections))) throw new Error();
      } catch (e) {
        return alert('ساختار فایل JSON معتبر نیست.');
      }
      payload.jsonState = parsed;
      payload.summary = 'فایل برنامه (' + toFa((parsed.days || []).length) + ' روز و ' + toFa((parsed.subjectSections || []).length) + ' بخش درسی)';
    } else if (kind === 'text') {
      const text = (document.getElementById('paTxtBody')?.value || '').trim();
      const subjectName = (document.getElementById('paTxtSub')?.value || '').trim() || 'برنامه اختصاصی';
      const dbLaw = (document.getElementById('paTxtDb')?.value || '').trim();
      const lawName = (document.getElementById('paTxtLaw')?.value || '').trim() || dbLaw || subjectName;
      const parsedDays = helpers && helpers.parsePlanText ? helpers.parsePlanText(text) : [];
      if (!parsedDays.length) return alert('در متن واردشده هیچ روزی با قالب «روز ۱ ـ عنوان» پیدا نشد.');
      payload.text = text;
      payload.subjectName = subjectName;
      payload.lawName = lawName;
      payload.dbLaw = dbLaw;
      payload.summary = subjectName + ' (' + toFa(parsedDays.length) + ' روز)';
    }

    const latestServer = await syncFromSupabase(ASSIGNED_PLANS_KEY);
    const map = (latestServer && latestServer.exists && typeof latestServer.data === 'object')
      ? latestServer.data
      : window.getAssignedPlansMap();

    map[email] = payload;
    localStorage.setItem(ASSIGNED_PLANS_KEY, JSON.stringify(map));
    const res = await syncToSupabase(ASSIGNED_PLANS_KEY, map);
    closeModal();
    if (typeof window.renderAdminPanels === 'function') window.renderAdminPanels();

    if (res.ok) {
      if (window.me && window.me.email && window.me.email.trim().toLowerCase() === email && window.refreshAssignedPlannerForMe) {
        await window.refreshAssignedPlannerForMe();
      }
      if (typeof toast === 'function') toast('برنامه مطالعاتی برای کاربر ' + email + ' روی سرور آپلود شد.');
    } else {
      if (typeof toast === 'function') toast('خطا در ارسال برنامه روی سرور: ' + res.error);
    }
  };

  window.deleteAssignedPlan = async function(email) {
    if (!window.isAdmin) return;
    if (!confirm('برنامه آپلودشده برای ' + email + ' از فهرست ارسال حذف شود؟')) return;
    const latestServer = await syncFromSupabase(ASSIGNED_PLANS_KEY);
    const map = (latestServer && latestServer.exists && typeof latestServer.data === 'object')
      ? latestServer.data
      : window.getAssignedPlansMap();
    delete map[email];
    localStorage.setItem(ASSIGNED_PLANS_KEY, JSON.stringify(map));
    await syncToSupabase(ASSIGNED_PLANS_KEY, map);
    if (typeof window.renderAdminPanels === 'function') window.renderAdminPanels();
    if (typeof toast === 'function') toast('مورد از فهرست برنامه‌های ارسالی حذف شد.');
  };


  // -------------------------------------------------------------------
  // ۴-د. دفتر کار و زمان‌بندی پرونده‌های وکیل
  // -------------------------------------------------------------------
  const CASES_KEY = 'baraat_lawyer_cases_v1';

  function parseJalaliDateParts(str) {
    const clean = toEn(str || '').trim();
    const m = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) };
    const now = new Date();
    return g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function jalaliToTimeMs(jStr, timeStr) {
    const j = parseJalaliDateParts(jStr);
    const g = j2g(j.jy, j.jm, j.jd);
    const [hh, mm] = (toEn(timeStr || '09:00').match(/^\d{1,2}:\d{2}/)?.[0] || '09:00').split(':').map(Number);
    return new Date(g.gy, g.gm - 1, g.gd, hh || 9, mm || 0, 0).getTime();
  }

  window.getCases = function() {
    try {
      if (!window.isAdmin && window.BARAAT_PLANNER_API && window.me) {
        const st = window.BARAAT_PLANNER_API.getState();
        if (st && Array.isArray(st.cases)) return st.cases;
        const userRaw = localStorage.getItem(CASES_KEY + '_' + window.me.id);
        if (userRaw) return JSON.parse(userRaw);
      }
      const raw = localStorage.getItem(CASES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  window.saveCases = async function(list) {
    if (window.isAdmin) {
      localStorage.setItem(CASES_KEY, JSON.stringify(list));
      if (window.me && window.BARAAT_PLANNER_API) {
        await window.BARAAT_PLANNER_API.ensureLoaded();
        const st = window.BARAAT_PLANNER_API.getState();
        st.cases = list;
        window.BARAAT_PLANNER_API.saveImmediate();
      }
      window.renderCases();
      const res = await syncToSupabase(CASES_KEY, list);
      if (res.ok) {
        if (typeof toast === 'function') toast('فهرست پرونده‌ها روی سرور و حساب شما ذخیره شد.');
      } else {
        if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error);
      }
      return;
    }

    if (window.me && window.BARAAT_PLANNER_API) {
      localStorage.setItem(CASES_KEY + '_' + window.me.id, JSON.stringify(list));
      await window.BARAAT_PLANNER_API.ensureLoaded();
      const st = window.BARAAT_PLANNER_API.getState();
      st.cases = list;
      window.renderCases();
      const ok = await window.BARAAT_PLANNER_API.saveImmediate();
      if (typeof toast === 'function') {
        toast(ok ? 'پرونده در حساب کاربری و سرور ابری ذخیره شد.' : 'پرونده در حافظه دستگاه ذخیره شد اما همگام‌سازی سرور ناموفق بود.');
      }
      return;
    }

    localStorage.setItem(CASES_KEY, JSON.stringify(list));
    window.renderCases();
    if (typeof toast === 'function') toast('پرونده موقتاً روی این مرورگر ذخیره شد؛ برای ذخیره ابری وارد حساب شوید.');
  };

  window.openCaseAlarm = function(id) {
    const c = window.getCases().find(x => x.id === id);
    if (!c) return;
    const j = parseJalaliDateParts(c.nextDateJalali);
    const g = j2g(j.jy, j.jm, j.jd);
    const dt = new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
    const jFull = formatJalaliFull(dt);
    window.__lastDeadlineCalc = {
      id: c.id,
      title: (c.actionTitle ? c.actionTitle + ' · ' : 'جلسه پرونده ') + c.title,
      law: [c.courtBranch, c.caseNumber ? 'کلاسه ' + c.caseNumber : '', c.clientName ? 'موکل: ' + c.clientName : ''].filter(Boolean).join(' · ') || 'پرونده دفتر وکالت برائت',
      days: 0,
      isoTarget: toLocalIsoDate(dt),
      gy: g.gy,
      gm: g.gm,
      gd: g.gd,
      jalali: jFull
    };
    window.openDeadlineAlarmModal();
    setTimeout(() => {
      const tInput = document.getElementById('alarmTimeInput');
      const titleInput = document.getElementById('alarmTitleInput');
      if (tInput && c.nextTime) tInput.value = toEn(c.nextTime).slice(0, 5);
      if (titleInput) titleInput.value = (c.actionTitle ? c.actionTitle + ': ' : 'جلسه پرونده: ') + c.title;
      if (window.updateAlarmCalendarLinks) window.updateAlarmCalendarLinks();
    }, 30);
  };

  window.openCaseEditor = function(id) {
    let c = {
      id: 'case_' + Date.now(),
      title: '',
      clientName: '',
      opponentName: '',
      courtBranch: '',
      caseNumber: '',
      caseType: 'حقوقی',
      status: 'جاری',
      nextDateJalali: '',
      nextTime: '09:30',
      actionTitle: 'جلسه رسیدگی',
      agreedFee: 0,
      paidFee: 0,
      notes: ''
    };
    if (id) {
      const found = window.getCases().find(x => x.id === id);
      if (found) c = Object.assign({}, c, found);
    }
    const nowJ = g2j(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const curJ = c.nextDateJalali ? parseJalaliDateParts(c.nextDateJalali) : nowJ;

    let yOpts = '';
    for (let y = nowJ.jy - 1; y <= nowJ.jy + 4; y++) {
      yOpts += `<option value="${y}" ${y === curJ.jy ? 'selected' : ''}>${toFa(y)}</option>`;
    }
    let mOpts = '';
    for (let mo = 1; mo <= 12; mo++) {
      mOpts += `<option value="${mo}" ${mo === curJ.jm ? 'selected' : ''}>${JALALI_MONTHS[mo - 1]}</option>`;
    }

    const m = document.getElementById('modal');
    if (!m) return;
    m.innerHTML = `
      <h2>${id ? 'ویرایش پرونده و زمان‌بندی' : 'ثبت پرونده و نوبت جدید'}</h2>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1;">
          <label>عنوان پرونده / موضوع دعوا *</label>
          <input id="edCsTitle" value="${esc(c.title)}" placeholder="مثلاً: مطالبه وجه چک یا خلع ید ملک تجریش">
        </div>
        <div class="field">
          <label>نام موکل</label>
          <input id="edCsClient" value="${esc(c.clientName)}">
        </div>
        <div class="field">
          <label>طرف مقابل دعوا</label>
          <input id="edCsOpp" value="${esc(c.opponentName)}">
        </div>
        <div class="field">
          <label>شعبه و مرجع قضایی</label>
          <input id="edCsBranch" value="${esc(c.courtBranch)}" placeholder="مثلاً: شعبه ۱۲ دادگاه حقوقی تهران">
        </div>
        <div class="field">
          <label>شماره کلاسه یا بایگانی</label>
          <input id="edCsNum" dir="ltr" value="${esc(c.caseNumber)}" placeholder="1404010023">
        </div>
        <div class="field">
          <label>نوع پرونده</label>
          <select id="edCsType">
            <option ${c.caseType === 'حقوقی' ? 'selected' : ''}>حقوقی</option>
            <option ${c.caseType === 'کیفری' ? 'selected' : ''}>کیفری</option>
            <option ${c.caseType === 'خانواده' ? 'selected' : ''}>خانواده</option>
            <option ${c.caseType === 'ثبتی و ملکی' ? 'selected' : ''}>ثبتی و ملکی</option>
            <option ${c.caseType === 'دیوان عدالت و اداری' ? 'selected' : ''}>دیوان عدالت و اداری</option>
            <option ${c.caseType === 'داوری و قراردادها' ? 'selected' : ''}>داوری و قراردادها</option>
          </select>
        </div>
        <div class="field">
          <label>وضعیت فعلی</label>
          <select id="edCsStatus">
            <option ${c.status === 'جاری' ? 'selected' : ''}>جاری</option>
            <option ${c.status === 'منتظر نوبت' ? 'selected' : ''}>منتظر نوبت</option>
            <option ${c.status === 'تجدیدنظر' ? 'selected' : ''}>تجدیدنظر</option>
            <option ${c.status === 'در اجرای احکام' ? 'selected' : ''}>در اجرای احکام</option>
            <option ${c.status === 'مختومه' ? 'selected' : ''}>مختومه</option>
          </select>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>تاریخ جلسه یا موعد اقدام بعدی (شمسی)</label>
          <div class="row" style="gap:6px; flex-wrap:nowrap;">
            <select id="edCsDay" style="flex:1;"></select>
            <select id="edCsMonth" onchange="populateJalaliDayOptions(document.getElementById('edCsDay'), Number(document.getElementById('edCsYear').value), Number(this.value), Number(document.getElementById('edCsDay').value))" style="flex:1.4;">${mOpts}</select>
            <select id="edCsYear" onchange="populateJalaliDayOptions(document.getElementById('edCsDay'), Number(this.value), Number(document.getElementById('edCsMonth').value), Number(document.getElementById('edCsDay').value))" style="flex:1.1;">${yOpts}</select>
          </div>
        </div>
        <div class="field">
          <label>ساعت جلسه</label>
          <input id="edCsTime" type="time" dir="ltr" value="${esc(toEn(c.nextTime || '09:30'))}">
        </div>
        <div class="field">
          <label>عنوان اقدام پیش‌رو</label>
          <input id="edCsAction" value="${esc(c.actionTitle || 'جلسه رسیدگی')}" placeholder="مثلاً: جلسه اول یا آخرین مهلت لایحه">
        </div>
        <div class="field">
          <label>حق‌الوکاله توافقی (تومان)</label>
          <input id="edCsFee" type="text" dir="ltr" value="${c.agreedFee || 0}">
        </div>
        <div class="field">
          <label>مبلغ دریافت‌شده تاکنون (تومان)</label>
          <input id="edCsPaid" type="text" dir="ltr" value="${c.paidFee || 0}">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>یادداشت، استراتژی دفاع و لوایح</label>
          <textarea id="edCsNotes" rows="3">${esc(c.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitCase('${c.id}')">ذخیره پرونده</button>
      </div>
    `;
    populateJalaliDayOptions(document.getElementById('edCsDay'), curJ.jy, curJ.jm, curJ.jd);
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitCase = function(id) {
    const title = (document.getElementById('edCsTitle')?.value || '').trim();
    if (!title) return alert('لطفاً عنوان پرونده را وارد کنید.');
    const jy = Number(document.getElementById('edCsYear')?.value || 1405);
    const jm = Number(document.getElementById('edCsMonth')?.value || 1);
    const jd = Number(document.getElementById('edCsDay')?.value || 1);
    const nextDateJalali = `${jy}/${pad2(jm)}/${pad2(jd)}`;

    const item = {
      id,
      title,
      clientName: (document.getElementById('edCsClient')?.value || '').trim(),
      opponentName: (document.getElementById('edCsOpp')?.value || '').trim(),
      courtBranch: (document.getElementById('edCsBranch')?.value || '').trim(),
      caseNumber: (document.getElementById('edCsNum')?.value || '').trim(),
      caseType: document.getElementById('edCsType')?.value || 'حقوقی',
      status: document.getElementById('edCsStatus')?.value || 'جاری',
      nextDateJalali,
      nextTime: (document.getElementById('edCsTime')?.value || '09:30').trim(),
      actionTitle: (document.getElementById('edCsAction')?.value || 'جلسه رسیدگی').trim(),
      agreedFee: Number(toEn(document.getElementById('edCsFee')?.value || '0').replace(/,/g, '')) || 0,
      paidFee: Number(toEn(document.getElementById('edCsPaid')?.value || '0').replace(/,/g, '')) || 0,
      notes: (document.getElementById('edCsNotes')?.value || '').trim(),
      updatedAt: Date.now()
    };

    const list = window.getCases();
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);

    closeModal();
    window.saveCases(list);
  };

  window.deleteCase = function(id) {
    if (!confirm('آیا از حذف این پرونده اطمینان دارید؟')) return;
    const list = window.getCases().filter(x => x.id !== id);
    window.saveCases(list);
  };

  window.renderCases = function() {
    const root = document.getElementById('casesWorkspaceRoot');
    if (!root) return;

    const all = window.getCases();
    const q = (document.getElementById('casesSearchInput')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('casesStatusFilter')?.value || 'all';

    const activeCases = all.filter(c => c.status !== 'مختومه');
    const nowMs = Date.now() - 86400000;
    const twoWeeksMs = Date.now() + (14 * 86400000);
    const upcomingAll = activeCases
      .filter(c => c.nextDateJalali)
      .map(c => ({ c, ms: jalaliToTimeMs(c.nextDateJalali, c.nextTime) }))
      .filter(x => x.ms >= nowMs)
      .sort((a, b) => a.ms - b.ms);
    const soonCount = upcomingAll.filter(x => x.ms <= twoWeeksMs).length;
    const totalRemainingFee = activeCases.reduce((sum, c) => sum + Math.max(0, (c.agreedFee || 0) - (c.paidFee || 0)), 0);

    const filtered = all.filter(c => {
      const mStatus = statusFilter === 'all' || c.status === statusFilter;
      const mText = !q || [c.title, c.clientName, c.opponentName, c.courtBranch, c.caseNumber, c.notes].join(' ').toLowerCase().includes(q);
      return mStatus && mText;
    });

    root.innerHTML = `
      <div class="baraat-section-bar" style="margin-bottom:14px;">
        <div>
          <h3>💼 دفتر کار و زمان‌بندی پرونده‌های وکیل</h3>
          <p>مدیریت جامع پرونده‌ها، تقویم جلسات دادرسی، پیگیری مانده حق‌الوکاله و ارسال آلارم مستقیم روی تقویم گوشی</p>
        </div>
        <button class="btn primary" onclick="openCaseEditor()">＋ ثبت پرونده جدید</button>
      </div>

      ${!window.me ? `
        <div class="panel callout-warn" style="margin-bottom:14px;">
          <div class="row between" style="gap:10px; flex-wrap:wrap;">
            <span style="font-size:13px;">در حال حاضر بدون ورود به حساب هستید؛ پرونده‌ها فقط در حافظه همین دستگاه نگهداری می‌شوند. برای ذخیره دائمی و ابری وارد حساب شوید.</span>
            <button class="btn small primary" onclick="openAuthModal()">ورود / ثبت‌نام وکیل</button>
          </div>
        </div>
      ` : `
        <div class="panel callout-info" style="margin-bottom:14px; padding:10px 14px;">
          <span style="font-size:12.5px; color:var(--main);">☁️ پرونده‌های شما در حساب کاربری (<b dir="ltr">${esc(window.me.email || '')}</b>) به صورت خودکار در سرور Supabase ذخیره می‌شوند و روی سایر دستگاه‌ها هم در دسترس هستند.</span>
        </div>
      `}

      <div class="cases-kpi-grid">
        <div class="cases-kpi-card">
          <div class="k-label">کل پرونده‌های ثبت‌شده</div>
          <div class="k-val">${toFa(all.length)}</div>
        </div>
        <div class="cases-kpi-card">
          <div class="k-label">پرونده‌های فعال در جریان</div>
          <div class="k-val">${toFa(activeCases.length)}</div>
        </div>
        <div class="cases-kpi-card">
          <div class="k-label">جلسات و مواعد ۱۴ روز آینده</div>
          <div class="k-val">${toFa(soonCount)}</div>
        </div>
        <div class="cases-kpi-card">
          <div class="k-label">مانده حق‌الوکاله پرونده‌های فعال (تومان)</div>
          <div class="k-val">${toFa(totalRemainingFee.toLocaleString())}</div>
        </div>
      </div>

      ${upcomingAll.length ? `
        <div class="panel" style="margin-bottom:16px;">
          <div class="row between" style="margin-bottom:10px; gap:8px;">
            <b style="font-size:14.5px;">🗓️ برنامه زمانی جلسات و مواعد پیش‌رو (مرتب‌سازی زمانی)</b>
            <span class="muted small">${toFa(upcomingAll.length)} نوبت آینده</span>
          </div>
          <div class="schedule-strip">
            ${upcomingAll.slice(0, 6).map(({ c, ms }) => {
              const dt = new Date(ms);
              const jf = formatJalaliFull(dt);
              return `
                <div class="schedule-row">
                  <div>
                    <b>${esc(c.actionTitle || 'جلسه')}: ${esc(c.title)}</b>
                    <div class="muted small" style="margin-top:3px;">
                      ${jf.named} · ساعت ${toFa(c.nextTime || '09:00')}${c.courtBranch ? ' · ' + esc(c.courtBranch) : ''}${c.clientName ? ' · موکل: ' + esc(c.clientName) : ''}
                    </div>
                  </div>
                  <button class="btn small primary" onclick="openCaseAlarm('${c.id}')">🔔 آلارم در تقویم</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="panel" style="margin-bottom:16px;">
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <input id="casesSearchInput" value="${esc(q)}" placeholder="جستجو در عنوان پرونده، نام موکل، شعبه یا کلاسه..." oninput="renderCases()" style="flex:1; min-width:160px; max-width:100%;">
          <select id="casesStatusFilter" onchange="renderCases()" style="width:auto; min-width:130px; max-width:100%;">
            <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>همه وضعیت‌ها</option>
            <option value="جاری" ${statusFilter === 'جاری' ? 'selected' : ''}>جاری</option>
            <option value="منتظر نوبت" ${statusFilter === 'منتظر نوبت' ? 'selected' : ''}>منتظر نوبت</option>
            <option value="تجدیدنظر" ${statusFilter === 'تجدیدنظر' ? 'selected' : ''}>تجدیدنظر</option>
            <option value="در اجرای احکام" ${statusFilter === 'در اجرای احکام' ? 'selected' : ''}>در اجرای احکام</option>
            <option value="مختومه" ${statusFilter === 'مختومه' ? 'selected' : ''}>مختومه</option>
          </select>
        </div>
      </div>

      ${!filtered.length ? `
        <div class="empty-glass-card">
          <div class="empty-icon">📂</div>
          <h3>${all.length ? 'پرونده‌ای با این فیلتر پیدا نشد' : 'هنوز پرونده‌ای ثبت نکرده‌اید'}</h3>
          <p>با کلیک بر روی «ثبت پرونده جدید» مشخصات موکل، شعبه، تاریخ جلسه شمسی و حق‌الوکاله را وارد کنید تا یادآورها و مانده حساب خودکار مدیریت شوند.</p>
          <div style="margin-top:14px;"><button class="btn primary" onclick="openCaseEditor()">＋ ثبت اولین پرونده</button></div>
        </div>
      ` : `
        <div class="cases-grid">
          ${filtered.map(c => {
            const rem = Math.max(0, (c.agreedFee || 0) - (c.paidFee || 0));
            const feePct = c.agreedFee > 0 ? Math.min(100, Math.round(((c.paidFee || 0) / c.agreedFee) * 100)) : 0;
            const metaLine = [c.caseType, c.status, c.caseNumber ? 'کلاسه ' + c.caseNumber : ''].filter(Boolean).map(esc).join(' · ');
            return `
              <article class="case-card">
                <div class="row between" style="gap:8px; align-items:flex-start;">
                  <div>
                    <h4 style="margin:0 0 4px; font-size:15.5px;">${esc(c.title)}</h4>
                    <div class="muted small">${metaLine}</div>
                  </div>
                </div>
                <div style="font-size:13px; color:var(--text); line-height:1.85; margin:10px 0;">
                  ${c.clientName ? `<div>موکل: <b>${esc(c.clientName)}</b>${c.opponentName ? ' · طرف دعوا: ' + esc(c.opponentName) : ''}</div>` : ''}
                  ${c.courtBranch ? `<div>مرجع رسیدگی: <b>${esc(c.courtBranch)}</b></div>` : ''}
                  ${c.nextDateJalali ? `<div>نوبت بعدی (${esc(c.actionTitle || 'جلسه')}): <b style="color:var(--main);">${toFa(c.nextDateJalali)}</b> ساعت ${toFa(c.nextTime || '09:00')}</div>` : ''}
                  ${c.notes ? `<div class="muted small" style="margin-top:4px;">${esc(c.notes)}</div>` : ''}
                </div>
                ${(c.agreedFee > 0 || c.paidFee > 0) ? `
                  <div class="case-finance-row" style="flex-direction:column; margin-bottom:12px;">
                    <div class="row between" style="font-size:12px;">
                      <span>توافقی: <b>${toFa((c.agreedFee || 0).toLocaleString())}</b> ت</span>
                      <span>دریافتی: <b>${toFa((c.paidFee || 0).toLocaleString())}</b> ت</span>
                      <span>مانده: <b style="color:${rem > 0 ? 'var(--warn)' : 'var(--ok)'};">${toFa(rem.toLocaleString())}</b> ت</span>
                    </div>
                    <div class="progress" style="margin-top:6px;"><span style="width:${feePct}%"></span></div>
                  </div>
                ` : ''}
                <div class="row" style="gap:6px; flex-wrap:wrap; margin-top:auto;">
                  ${c.nextDateJalali ? `<button class="btn small primary" onclick="openCaseAlarm('${c.id}')">🔔 آلارم در تقویم گوشی</button>` : ''}
                  <button class="btn small" onclick="openCaseEditor('${c.id}')">✎ ویرایش</button>
                  <button class="btn small danger" onclick="deleteCase('${c.id}')">✕ حذف</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `}
    `;
  };

  // -------------------------------------------------------------------
  // ۴-هـ. پیگیری پیشرفت داوطلب و سیستم پرسش و پاسخ با مدیر
  // -------------------------------------------------------------------
  const QUESTION_REPLIES_KEY = 'baraat_question_replies_v1';
  const STUDENT_REPORTS_KEY = 'baraat_student_reports_v1';

  window.getQuestionRepliesMap = function() {
    try {
      const raw = localStorage.getItem(QUESTION_REPLIES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  };

  window.syncStudentSnapshotToReport = async function(user, state) {
    if (!window.sb || !user || !state) return;
    try {
      const res = await window.sb.from('meta').select('value').eq('key', STUDENT_REPORTS_KEY).maybeSingle();
      let map = {};
      if (res && res.data && res.data.value) {
        map = typeof res.data.value === 'string' ? JSON.parse(res.data.value) : res.data.value;
      }
      map[user.id] = {
        user_id: user.id,
        email: user.email || '',
        summary: state._summary || {},
        questions: Array.isArray(state.questions) ? state.questions.slice(0, 30) : [],
        updatedAt: new Date().toISOString()
      };
      await window.sb.from('meta').upsert({ key: STUDENT_REPORTS_KEY, value: JSON.stringify(map) }, { onConflict: 'key' });
    } catch (e) {
      // ignore if meta table restricts non-admin writes
    }
  };

  window.jumpToStudyDay = function(dayId) {
    const api = window.BARAAT_PLANNER_API;
    if (!api) return;
    const st = api.getState();
    const d = (st.days || []).find(x => x.id === dayId);
    if (d) d.open = true;
    api.showView('days');
    api.render();
    setTimeout(() => {
      const el = document.getElementById('day-' + dayId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  window.submitStudentQuestion = async function() {
    const api = window.BARAAT_PLANNER_API;
    if (!api || !window.me) {
      if (typeof toast === 'function') toast('برای ارسال سوال به مدیر ابتدا وارد حساب کاربری شوید.');
      return;
    }
    const text = (document.getElementById('sqText')?.value || '').trim();
    if (!text) return alert('لطفاً متن سوال یا اشکال خود را بنویسید.');
    const subject = document.getElementById('sqSubject')?.value || 'عمومی و برنامه‌ریزی';
    const topic = (document.getElementById('sqTopic')?.value || '').trim();

    const st = api.getState();
    if (!Array.isArray(st.questions)) st.questions = [];
    const now = new Date();
    const jf = formatJalaliFull(now);
    const qObj = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      userId: window.me.id,
      userEmail: window.me.email || '',
      subject,
      topic,
      text,
      createdAt: now.toISOString(),
      jalaliDate: jf.numericFa
    };
    st.questions.unshift(qObj);
    api.persist();
    await window.syncStudentSnapshotToReport(window.me, st);
    window.renderStudentProgressView();
    if (typeof toast === 'function') toast('سوال شما ثبت و برای مدیر ارسال شد.');
  };

  window.renderStudentProgressView = function() {
    const root = document.getElementById('studentProgressRoot');
    const api = window.BARAAT_PLANNER_API;
    if (!root || !api) return;
    const st = api.getState();
    const blocks = api.allBlocks();
    const totalChecks = blocks.length * api.CHECKS.length;
    const doneChecks = blocks.reduce((a, b) => a + (b.checks || []).filter(Boolean).length, 0);
    const doneBlocks = blocks.filter(b => api.percent(b) === 100).length;
    const pct = totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0;

    const mGood = blocks.filter(b => b.mastery === 'خوب').length;
    const mMid = blocks.filter(b => b.mastery === 'متوسط').length;
    const mWeak = blocks.filter(b => b.mastery === 'ضعیف').length;
    const mNone = blocks.length - mGood - mMid - mWeak;

    const weakUnits = [];
    (st.days || []).forEach(d => {
      (d.blocks || []).forEach(b => {
        if (b.mastery === 'ضعیف' || b.mastery === 'متوسط') {
          const s = (st.subjects || []).find(x => x.id === b.subjectId);
          weakUnits.push({ kind: 'day', dayId: d.id, dayNum: d.number, subj: s?.name || '', law: b.law, title: b.title || b.spec, mastery: b.mastery, notes: b.notes || '' });
        }
      });
    });
    (st.subjectSections || []).forEach(b => {
      if (b.mastery === 'ضعیف' || b.mastery === 'متوسط') {
        const s = (st.subjects || []).find(x => x.id === b.subjectId);
        weakUnits.push({ kind: 'sec', blockId: b.id, label: b.sectionLabel || 'بخش درسی', subj: s?.name || '', law: b.law, title: b.title || b.spec, mastery: b.mastery, notes: b.notes || '' });
      }
    });

    const subjRows = (st.subjects || []).map(sub => {
      const sbs = blocks.filter(b => b.subjectId === sub.id);
      if (!sbs.length) return null;
      const sc = sbs.length * api.CHECKS.length;
      const sd = sbs.reduce((a, b) => a + (b.checks || []).filter(Boolean).length, 0);
      const sdDone = sbs.filter(b => api.percent(b) === 100).length;
      return { name: sub.name, count: sbs.length, done: sdDone, pct: sc ? Math.round((sd / sc) * 100) : 0 };
    }).filter(Boolean);

    const repliesMap = window.getQuestionRepliesMap();
    const questions = Array.isArray(st.questions) ? st.questions : [];
    const subjOptions = ['عمومی و برنامه‌ریزی', ...(st.subjects || []).map(s => s.name)];

    root.innerHTML = `
      ${st._lastAssignedNote ? `
        <div class="panel callout-info" style="margin-bottom:14px;">
          <b style="color:var(--main);">📌 پیام برنامه ارسالی مدیر:</b>
          <span style="font-size:13.5px; color:var(--text); margin-right:6px;">${esc(st._lastAssignedNote)}</span>
        </div>
      ` : ''}

      <div class="cases-kpi-grid">
        <div class="cases-kpi-card">
          <div class="k-label">پیشرفت کل برنامه</div>
          <div class="k-val">${toFa(pct)}٪</div>
        </div>
        <div class="cases-kpi-card">
          <div class="k-label">واحدهای تکمیل‌شده</div>
          <div class="k-val">${toFa(doneBlocks)} از ${toFa(blocks.length)}</div>
        </div>
        <div class="cases-kpi-card">
          <div class="k-label">واحدهای نیازمند مرور / ضعیف</div>
          <div class="k-val">${toFa(mWeak + mMid)}</div>
        </div>
        <div class="cases-kpi-card">
          <div class="k-label">سوالات ثبت‌شده شما</div>
          <div class="k-val">${toFa(questions.length)}</div>
        </div>
      </div>

      <div class="grid2" style="gap:16px; align-items:start;">
        <div class="panel">
          <h3 style="margin:0 0 12px; font-size:15.5px;">📈 تفکیک پیشرفت هر درس</h3>
          ${!subjRows.length
            ? '<div class="muted small">هنوز واحدی در برنامه ثبت نشده است.</div>'
            : `<div style="display:grid; gap:12px;">${subjRows.map(r => `
                <div>
                  <div class="row between" style="font-size:13px; margin-bottom:4px;">
                    <b>${esc(r.name)}</b>
                    <span class="muted">${toFa(r.done)} از ${toFa(r.count)} واحد · <b>${toFa(r.pct)}٪</b></span>
                  </div>
                  <div class="progress"><span style="width:${r.pct}%"></span></div>
                </div>
              `).join('')}</div>`}

          <h4 style="margin:18px 0 8px; font-size:14px;">توزیع سطح تسلط مطالب</h4>
          <div class="row" style="gap:12px; flex-wrap:wrap; font-size:12.5px;">
            <span>🟢 مسلط (خوب): <b>${toFa(mGood)}</b></span>
            <span>🟡 نیازمند مرور (متوسط): <b>${toFa(mMid)}</b></span>
            <span>🔴 نیازمند مطالعه مجدد (ضعیف): <b>${toFa(mWeak)}</b></span>
            <span>⚪ ارزیابی‌نشده: <b>${toFa(mNone)}</b></span>
          </div>

          ${weakUnits.length ? `
            <h4 style="margin:18px 0 8px; font-size:14px;">⚠️ مباحث اولویت‌دار برای مرور مجدد</h4>
            <div style="display:grid; gap:8px; max-height:260px; overflow:auto;">
              ${weakUnits.slice(0, 12).map(u => `
                <div class="row between surface-box" style="padding:8px 10px; border-radius:10px; gap:8px;">
                  <div style="font-size:12.5px;">
                    <b>${u.kind === 'day' ? 'روز ' + toFa(u.dayNum) : esc(u.label)} · ${esc(u.subj)}</b>
                    <div class="muted small">${esc(u.law)} · ${esc(u.title)} (${esc(u.mastery)})</div>
                  </div>
                  <button class="btn small" onclick="${u.kind === 'day' ? `jumpToStudyDay('${u.dayId}')` : `jumpToSubjectSection('${u.blockId}')`}">باز کردن</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="panel">
          <h3 style="margin:0 0 6px; font-size:15.5px;">✉️ ارسال سوال حقوقی یا گزارش به مدیر</h3>
          <p class="muted small" style="margin:0 0 12px;">اگر در ماده‌ای ابهام دارید یا نیاز به راهنمایی مدیر دارید سوال خود را ثبت کنید تا پاسخ مدیر همین‌جا نمایش داده شود.</p>
          <div class="form-grid" style="gap:10px;">
            <div class="field">
              <label>موضوع / درس مرتبط</label>
              <select id="sqSubject">
                ${subjOptions.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>شماره ماده یا روز مطالعاتی (اختیاری)</label>
              <input id="sqTopic" placeholder="مثلاً: ماده ۱۹۰ مدنی یا روز ۱۲">
            </div>
            <div class="field" style="grid-column:1/-1;">
              <label>متن سوال شما برای مدیر *</label>
              <textarea id="sqText" rows="3" placeholder="سوال یا ابهام خود را با جزئیات بنویسید..."></textarea>
            </div>
          </div>
          <div style="margin-top:10px;">
            <button class="btn primary" onclick="submitStudentQuestion()">📨 ارسال سوال به مدیر</button>
          </div>

          <h4 style="margin:18px 0 10px; font-size:14px;">تاریخچه سوالات و پاسخ‌های مدیر</h4>
          ${!questions.length
            ? '<div class="muted small">هنوز سوالی ثبت نکرده‌اید.</div>'
            : `<div style="display:grid; gap:10px; max-height:360px; overflow:auto;">
                ${questions.map(q => {
                  const rep = repliesMap[q.id];
                  return `
                    <div class="qa-card">
                      <div class="row between" style="font-size:12px; color:var(--muted); margin-bottom:4px;">
                        <b>${esc(q.subject)}${q.topic ? ' · ' + esc(q.topic) : ''}</b>
                        <span>${esc(q.jalaliDate || '')} · ${rep ? 'پاسخ داده‌شده' : 'در انتظار بررسی'}</span>
                      </div>
                      <div style="font-size:13.5px; color:var(--text); line-height:1.8;">${esc(q.text)}</div>
                      ${rep ? `
                        <div class="qa-answer-box">
                          <b>پاسخ مدیر (${esc(rep.dateLabel || '')}):</b>
                          <div style="margin-top:4px; line-height:1.85;">${esc(rep.answer)}</div>
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>`}
        </div>
      </div>
    `;
  };

  // -------------------------------------------------------------------
  // ۴-و. مانیتورینگ پیشرفت کاربران و پاسخ به سوالات توسط مدیر
  // -------------------------------------------------------------------
  let monitorUsersCache = [];
  let monitorQuestionsCache = [];
  let monitorRlsWarning = '';

  window.refreshAdminMonitor = async function() {
    if (!window.isAdmin || !window.sb) return;
    const root = document.getElementById('admMonitorRoot');
    if (root && !monitorUsersCache.length) {
      root.innerHTML = '<div class="muted small">در حال دریافت گزارش پیشرفت کاربران از سرور...</div>';
    }

    const userMap = new Map();
    const qList = [];
    monitorRlsWarning = '';

    // ۱. خواندن جدول planner (در صورت فعال بودن مجوز SELECT مدیر)
    try {
      const pRes = await window.sb.from('planner').select('user_id, data, updated_at').order('updated_at', { ascending: false });
      if (pRes && !pRes.error && Array.isArray(pRes.data)) {
        pRes.data.forEach(row => {
          const d = row.data || {};
          const key = (d._userEmail || row.user_id || '').toLowerCase();
          if (!key) return;
          userMap.set(key, {
            userId: row.user_id,
            email: d._userEmail || ('کاربر ' + String(row.user_id).slice(0, 8)),
            summary: d._summary || null,
            days: Array.isArray(d.days) ? d.days : [],
            subjectSections: Array.isArray(d.subjectSections) ? d.subjectSections : [],
            subjects: Array.isArray(d.subjects) ? d.subjects : [],
            questions: Array.isArray(d.questions) ? d.questions : [],
            examTags: (d.examTags && typeof d.examTags === 'object') ? d.examTags : {},
            updatedAt: row.updated_at || (d._summary && d._summary.updatedAt) || ''
          });
        });
      } else if (pRes && pRes.error) {
        monitorRlsWarning = pRes.error.message || 'RLS';
      }
    } catch (e) {
      monitorRlsWarning = e && e.message;
    }

    // ۲. ادغام با گزارش‌های سبک جدول meta (در صورت وجود)
    const repRes = await syncFromSupabase(STUDENT_REPORTS_KEY);
    if (repRes && repRes.exists && repRes.data && typeof repRes.data === 'object') {
      Object.values(repRes.data).forEach(r => {
        if (!r || !r.user_id) return;
        const key = (r.email || r.user_id).toLowerCase();
        if (!userMap.has(key)) {
          userMap.set(key, {
            userId: r.user_id,
            email: r.email || ('کاربر ' + String(r.user_id).slice(0, 8)),
            summary: r.summary || null,
            days: [],
            subjectSections: [],
            subjects: [],
            questions: Array.isArray(r.questions) ? r.questions : [],
            updatedAt: r.updatedAt || ''
          });
        }
      });
    }

    // ۳. ادغام با فهرست برنامه‌های ارسال‌شده توسط مدیر
    const assRes = await syncFromSupabase(ASSIGNED_PLANS_KEY);
    const assMap = (assRes && assRes.exists && typeof assRes.data === 'object') ? assRes.data : window.getAssignedPlansMap();
    if (assMap && typeof assMap === 'object') {
      Object.entries(assMap).forEach(([email, entry]) => {
        const key = email.toLowerCase();
        if (!userMap.has(key)) {
          userMap.set(key, {
            userId: '',
            email,
            summary: null,
            days: [],
            subjectSections: [],
            subjects: [],
            questions: [],
            assignedSummary: entry.summary || '',
            updatedAt: ''
          });
        } else {
          userMap.get(key).assignedSummary = entry.summary || '';
        }
      });
    }

    // ۴. دریافت پاسخ‌های مدیر
    const qrRes = await syncFromSupabase(QUESTION_REPLIES_KEY);
    if (qrRes && qrRes.exists && qrRes.data && typeof qrRes.data === 'object') {
      localStorage.setItem(QUESTION_REPLIES_KEY, JSON.stringify(qrRes.data));
    }

    const chkLen = (window.BARAAT_PLANNER_API && window.BARAAT_PLANNER_API.CHECKS) ? window.BARAAT_PLANNER_API.CHECKS.length : 7;
    monitorUsersCache = [...userMap.values()].map(u => {
      let summary = u.summary;
      if (!summary && ((Array.isArray(u.days) && u.days.length) || (Array.isArray(u.subjectSections) && u.subjectSections.length))) {
        const blocks = [...(u.days || []).flatMap(d => d.blocks || []), ...(u.subjectSections || [])];
        const total = blocks.length * chkLen;
        const doneC = blocks.reduce((a, b) => a + (b.checks || []).filter(Boolean).length, 0);
        const doneB = blocks.filter(b => (b.checks || []).filter(Boolean).length === (b.checks || []).length && b.checks.length > 0).length;
        summary = {
          days: (u.days || []).length,
          subjectSections: (u.subjectSections || []).length,
          blocks: blocks.length,
          doneBlocks: doneB,
          pct: total ? Math.round((doneC / total) * 100) : 0,
          goodCount: blocks.filter(b => b.mastery === 'خوب').length,
          midCount: blocks.filter(b => b.mastery === 'متوسط').length,
          weakCount: blocks.filter(b => b.mastery === 'ضعیف').length,
          subjects: []
        };
      }
      (u.questions || []).forEach(q => {
        qList.push(Object.assign({}, q, { userEmail: q.userEmail || u.email }));
      });
      return Object.assign({}, u, { summary });
    });

    qList.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    monitorQuestionsCache = qList;
    window.renderAdminMonitor();
  };

  window.submitAdminReply = async function(qId) {
    if (!window.isAdmin) return;
    const val = (document.getElementById('admReply_' + qId)?.value || '').trim();
    if (!val) return alert('لطفاً متن پاسخ را بنویسید.');
    const latest = await syncFromSupabase(QUESTION_REPLIES_KEY);
    const map = (latest && latest.exists && typeof latest.data === 'object')
      ? latest.data
      : window.getQuestionRepliesMap();
    map[qId] = {
      answer: val,
      answeredBy: window.me?.email || 'مدیر',
      dateLabel: formatJalaliFull(new Date()).numericFa,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(QUESTION_REPLIES_KEY, JSON.stringify(map));
    const res = await syncToSupabase(QUESTION_REPLIES_KEY, map);
    window.renderAdminMonitor();
    if (res.ok) {
      if (typeof toast === 'function') toast('پاسخ مدیر با موفقیت ثبت و برای داوطلب ارسال شد.');
    } else {
      if (typeof toast === 'function') toast('خطا در ارسال پاسخ: ' + res.error);
    }
  };

  window.inspectUserProgress = function(emailKey) {
    const u = monitorUsersCache.find(x => x.email.toLowerCase() === emailKey.toLowerCase());
    if (!u || !window.showModal) return;
    const s = u.summary || { days: 0, blocks: 0, doneBlocks: 0, pct: 0, goodCount: 0, midCount: 0, weakCount: 0, subjects: [] };
    const weakList = [];
    (u.days || []).forEach(d => (d.blocks || []).forEach(b => {
      if (b.mastery === 'ضعیف') weakList.push(`روز ${toFa(d.number)}: ${b.law} (${b.title || b.spec})`);
    }));
    (u.subjectSections || []).forEach(b => {
      if (b.mastery === 'ضعیف') weakList.push(`${b.sectionLabel || 'بخش درسی'}: ${b.law} (${b.title || b.spec})`);
    });

    window.showModal(`
      <h2>گزارش تفصیلی داوطلب</h2>
      <p dir="ltr" style="font-weight:700; color:var(--main); margin:4px 0 12px;">${esc(u.email)}</p>
      <div class="cases-kpi-grid" style="margin-bottom:14px;">
        <div class="cases-kpi-card"><div class="k-label">پیشرفت کل</div><div class="k-val">${toFa(s.pct || 0)}٪</div></div>
        <div class="cases-kpi-card"><div class="k-label">تعداد روز</div><div class="k-val">${toFa(s.days || 0)}</div></div>
        <div class="cases-kpi-card"><div class="k-label">واحد کامل</div><div class="k-val">${toFa(s.doneBlocks || 0)} از ${toFa(s.blocks || 0)}</div></div>
        <div class="cases-kpi-card"><div class="k-label">تسلط ضعیف</div><div class="k-val">${toFa(s.weakCount || 0)}</div></div>
      </div>
      ${(s.subjects && s.subjects.length) ? `
        <h4 style="margin:0 0 8px;">پیشرفت به تفکیک درس</h4>
        <div style="display:grid; gap:8px; margin-bottom:14px;">
          ${s.subjects.map(sb => `
            <div>
              <div class="row between" style="font-size:12.5px; margin-bottom:3px;">
                <span>${esc(sb.name)}</span>
                <b>${toFa(sb.pct)}٪ (${toFa(sb.blocks)} واحد)</b>
              </div>
              <div class="progress"><span style="width:${sb.pct}%"></span></div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${weakList.length ? `
        <h4 style="margin:0 0 6px;">مباحث علامت‌گذاری‌شده به عنوان ضعیف</h4>
        <ul style="font-size:12.5px; color:var(--danger, #dc2626); padding-right:18px; line-height:1.9;">
          ${weakList.slice(0, 10).map(w => `<li>${esc(w)}</li>`).join('')}
        </ul>
      ` : ''}
      ${(() => {
        const tagEntries = Object.entries(u.examTags || {}).filter(([, t]) => {
          const fl = (t && (t.tags || t.flags)) || [];
          return t && (t.difficulty || (Array.isArray(fl) && fl.length));
        });
        if (!tagEntries.length) return '';
        const diffLbl = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
        const flagLbl = { review: 'مرور', noteworthy: 'نکته‌دار', careless: 'بی‌دقتی' };
        return `
          <h4 style="margin:12px 0 6px;">🏷 تیک‌ها و برچسب‌های سوالات آزمون (${toFa(tagEntries.length)})</h4>
          <div style="display:grid; gap:6px; max-height:200px; overflow:auto; margin-bottom:10px;">
            ${tagEntries.slice(0, 25).map(([, t]) => {
              const fl = Array.isArray(t.tags) ? t.tags : (Array.isArray(t.flags) ? t.flags : []);
              const prev = t.qPreview || t.questionPreview || '';
              return `
              <div class="surface-box" style="padding:8px 10px; border-radius:10px; font-size:12px;">
                <div class="row between" style="gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                  <b>${esc(t.examTitle || 'آزمون')}${t.subjectName ? ' · ' + esc(t.subjectName) : ''}</b>
                  <div class="row" style="gap:4px; flex-wrap:wrap;">
                    ${t.difficulty ? `<span class="ex-tag-pill diff-${t.difficulty}">${diffLbl[t.difficulty] || t.difficulty}</span>` : ''}
                    ${fl.map(f => `<span class="ex-tag-pill flag-${f}">${flagLbl[f] || f}</span>`).join('')}
                  </div>
                </div>
                ${prev ? `<div class="muted small" style="line-height:1.6;">${esc(prev)}</div>` : ''}
              </div>
            `;
            }).join('')}
          </div>
        `;
      })()}
      <div class="modal-actions">
        <button class="btn" onclick="closeModal();openPlanAssignerModal('${esc(u.email)}')">📤 ارسال برنامه جدید</button>
        <button class="btn primary" onclick="closeModal()">بستن</button>
      </div>
    `);
  };

  window.copySupabaseMonitorSql = function() {
    const sqlText = `-- اجرای این کد در SQL Editor سامانه Supabase باعث می‌شود مدیر به پیشرفت همه داوطلبان دسترسی داشته باشد\nCREATE POLICY "admin_read_all_planner" ON public.planner\nFOR SELECT TO authenticated\nUSING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()) OR auth.uid() = user_id);`;
    navigator.clipboard?.writeText(sqlText);
    if (typeof toast === 'function') toast('کد SQL در حافظه کپی شد.');
  };

  window.renderAdminMonitor = function() {
    const root = document.getElementById('admMonitorRoot');
    if (!root || !window.isAdmin) return;

    const q = (document.getElementById('admMonSearch')?.value || '').trim().toLowerCase();
    const repliesMap = window.getQuestionRepliesMap();
    const pendingQuestions = monitorQuestionsCache.filter(x => !repliesMap[x.id]);
    const activeStudents = monitorUsersCache.filter(u => u.summary && u.summary.blocks > 0);
    const avgPct = activeStudents.length
      ? Math.round(activeStudents.reduce((s, u) => s + (u.summary.pct || 0), 0) / activeStudents.length)
      : 0;
    const totalDoneBlocks = activeStudents.reduce((s, u) => s + (u.summary.doneBlocks || 0), 0);

    const filteredUsers = monitorUsersCache.filter(u => !q || (u.email || '').toLowerCase().includes(q));
    const needRlsTip = monitorRlsWarning || monitorUsersCache.length <= 1;

    root.innerHTML = `
      <div class="monitor-kpi-grid">
        <div class="cases-kpi-card"><div class="k-label">داوطلبان دارای برنامه</div><div class="k-val">${toFa(monitorUsersCache.length)}</div></div>
        <div class="cases-kpi-card"><div class="k-label">میانگین پیشرفت کل</div><div class="k-val">${toFa(avgPct)}٪</div></div>
        <div class="cases-kpi-card"><div class="k-label">کل واحدهای تکمیل‌شده</div><div class="k-val">${toFa(totalDoneBlocks)}</div></div>
        <div class="cases-kpi-card"><div class="k-label">سوالات منتظر پاسخ</div><div class="k-val">${toFa(pendingQuestions.length)}</div></div>
      </div>

      ${needRlsTip ? `
        <details class="callout-warn" style="margin:12px 0; padding:10px 14px; border-style:dashed; border-radius:12px;">
          <summary style="cursor:pointer; font-size:12.5px; font-weight:700;">راهنمای مشاهده همه داوطلبان در سرور Supabase (در صورت محدودیت RLS)</summary>
          <p class="small" style="margin:8px 0; line-height:1.8;">
            اگر فقط حساب خودتان را می‌بینید، لازم است در بخش SQL Editor پنل Supabase دستور زیر را یک بار اجرا کنید تا مدیر اجازه خواندن ردیف‌های جدول planner را داشته باشد:
          </p>
          <pre dir="ltr" class="surface-box" style="padding:10px; border-radius:8px; font-size:11.5px; overflow:auto;">CREATE POLICY "admin_read_all_planner" ON public.planner FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()) OR auth.uid() = user_id);</pre>
          <button class="btn small" onclick="copySupabaseMonitorSql()">کپی دستور SQL</button>
        </details>
      ` : ''}

      <div style="margin-top:14px;">
        <div class="row between" style="gap:8px; margin-bottom:10px; flex-wrap:wrap;">
          <b style="font-size:14px;">وضعیت مطالعه و پیشرفت کاربران</b>
          <input id="admMonSearch" value="${esc(q)}" placeholder="جستجو بر اساس ایمیل داوطلب..." oninput="renderAdminMonitor()" style="width:240px;">
        </div>
        ${!filteredUsers.length
          ? '<div class="muted small surface-box">هنوز داوطلبی با این مشخصات یافت نشد.</div>'
          : `<div style="display:grid; gap:10px;">${filteredUsers.map(u => {
              const s = u.summary || { pct: 0, days: 0, doneBlocks: 0, blocks: 0, goodCount: 0, midCount: 0, weakCount: 0 };
              const uDate = u.updatedAt ? formatJalaliFull(new Date(u.updatedAt)).numericFa : 'ثبت نشده';
              return `
                <div class="monitor-user-card">
                  <div class="row between" style="gap:10px; flex-wrap:wrap;">
                    <div>
                      <b dir="ltr" style="font-size:14px;">${esc(u.email)}</b>
                      <div class="muted small" style="margin-top:3px;">
                        ${toFa(s.days || 0)} روز · ${toFa(s.doneBlocks || 0)} از ${toFa(s.blocks || 0)} واحد · تسلط: ${toFa(s.goodCount || 0)} خوب / ${toFa(s.midCount || 0)} متوسط / ${toFa(s.weakCount || 0)} ضعیف · آخرین بروزرسانی: ${esc(uDate)}
                      </div>
                      ${u.assignedSummary ? `<div class="muted small">آخرین برنامه ارسالی: ${esc(u.assignedSummary)}</div>` : ''}
                    </div>
                    <div class="row" style="gap:6px; align-items:center;">
                      <b style="color:var(--main); font-size:16px;">${toFa(s.pct || 0)}٪</b>
                      <button class="btn small" onclick="inspectUserProgress('${esc(u.email)}')">🔍 جزئیات</button>
                      <button class="btn small" onclick="openPlanAssignerModal('${esc(u.email)}')">📤 ارسال برنامه</button>
                    </div>
                  </div>
                  <div class="progress" style="margin-top:8px;"><span style="width:${s.pct || 0}%"></span></div>
                </div>
              `;
            }).join('')}</div>`}
      </div>

      <div style="margin-top:20px;">
        <b style="font-size:14px; display:block; margin-bottom:10px;">سوالات و اشکالات ارسالی داوطلبان (${toFa(monitorQuestionsCache.length)})</b>
        ${!monitorQuestionsCache.length
          ? '<div class="muted small surface-box">هنوز سوالی از سوی داوطلبان ثبت نشده است.</div>'
          : `<div style="display:grid; gap:10px;">${monitorQuestionsCache.map(item => {
              const rep = repliesMap[item.id];
              return `
                <div class="qa-card">
                  <div class="row between" style="font-size:12px; color:var(--muted); margin-bottom:6px; flex-wrap:wrap; gap:6px;">
                    <span><b dir="ltr" style="color:var(--text);">${esc(item.userEmail)}</b> · ${esc(item.subject)}${item.topic ? ' · ' + esc(item.topic) : ''}</span>
                    <span>${esc(item.jalaliDate || '')}</span>
                  </div>
                  <div style="font-size:13.5px; color:var(--text); line-height:1.8; margin-bottom:8px;">${esc(item.text)}</div>
                  <div class="row" style="gap:8px; align-items:flex-end;">
                    <textarea id="admReply_${item.id}" rows="2" placeholder="پاسخ مدیر را بنویسید..." style="flex:1;">${esc(rep ? rep.answer : '')}</textarea>
                    <button class="btn small primary" onclick="submitAdminReply('${item.id}')">${rep ? 'بروزرسانی پاسخ' : 'ارسال پاسخ'}</button>
                  </div>
                </div>
              `;
            }).join('')}</div>`}
      </div>
    `;
  };

  // -------------------------------------------------------------------
  // ۴-ز. ماژول جامع آزمون‌های حقوقی (نکات شخصی دانشجو، سابقه پاسخ‌ها، پوشه‌بندی و نمایش/عدم نمایش مدیر)
  // -------------------------------------------------------------------
  const EXAMS_KEY = 'baraat_exams_v1';
  const EXAMS_PRIVATE_KEY = 'baraat_exams_private_v1';
  const EXAM_RESULTS_LOCAL_KEY = 'baraat_exam_results_v1';
  const EXAM_NOTES_LOCAL_PREFIX = 'baraat_exam_notes_v1_';
  const EXAM_NOTES_META_LOCAL_PREFIX = 'baraat_exam_notes_meta_v1_';
  const EXAM_TAGS_LOCAL_PREFIX = 'baraat_exam_tags_v1_';
  const EXAM_TAGS_DEL_LOCAL_PREFIX = 'baraat_exam_tags_del_v1_';
  const EXAM_PREP_LOCAL_PREFIX = 'baraat_exam_prep_v1_';
  const EXAM_QSNAP_LOCAL_PREFIX = 'baraat_exam_qsnap_v1_';
  const EXAM_ATTEMPTS_KEY = 'baraat_exam_attempts_v1';
  const EXAM_DELETED_ATTEMPTS_KEY = 'baraat_deleted_exam_attempts_v1';
  const EXAM_SUBJECTS_KEY = 'baraat_exam_subjects_v1';
  const VIP_SETTINGS_KEY = 'baraat_vip_settings_v1';
  const DEFAULT_EXAM_SUBJECTS = [
    'حقوق مدنی',
    'آیین دادرسی مدنی',
    'حقوق تجارت',
    'حقوق جزا',
    'آیین دادرسی کیفری',
    'اصول فقه',
    'حقوق اساسی',
    'متون فقه'
  ];
  function calcExamDurationMin(qCount) {
    const n = Math.max(0, Number(qCount || 0));
    return n > 0 ? Math.max(2, n * 2) : 60;
  }
  const EXAM_ORGS = [
    'آزمون وکالت کانون',
    'کانون وکلا (اسکودا)',
    'مرکز وکلای قوه قضاییه',
    'آزمون قضاوت',
    'حقوق جزا',
    'حقوق تجارت',
    'حقوق مدنی',
    'آیین دادرسی مدنی',
    'آیین دادرسی کیفری',
    'آزمون سردفتری',
    'کارشناسی ارشد حقوق',
    'آزمون آزمایشی گروه برائت'
  ];
  const EXAM_TYPES = [
    'تالیفی',
    'سراسری / رسمی',
    'کانون وکلا',
    'مبحثی / فصلی',
    'شبیه‌ساز / آزمایشی'
  ];
  const EXAM_LETTERS = ['الف', 'ب', 'ج', 'د'];

  function injectExamUpgradeStyles() {
    if (document.getElementById('baraat-exam-upgrade-styles')) return;
    const st = document.createElement('style');
    st.id = 'baraat-exam-upgrade-styles';
    st.textContent = `
      .ex-folder-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; margin-top:14px; }
      .ex-folder-card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:16px; cursor:pointer; transition:all .18s ease; display:flex; flex-direction:column; gap:8px; text-align:right; }
      .ex-folder-card:hover { border-color:var(--main); transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,.06); }
      .ex-folder-card .ex-f-icon { font-size:24px; line-height:1; }
      .ex-folder-card .ex-f-title { font-weight:800; font-size:15px; color:var(--text); }
      .ex-folder-card .ex-f-meta { font-size:12px; color:var(--muted); }
      .ex-breadcrumb { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:10px 0 14px; padding:10px 12px; border-radius:12px; background:var(--soft); border:1px solid var(--line); font-size:13px; }
      .ex-crumb-btn { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:4px 10px; font-size:12.5px; font-weight:700; color:var(--text); cursor:pointer; }
      .ex-crumb-btn.active { background:var(--main); color:#fff; border-color:var(--main); }
      .ex-note-box { margin-top:14px; padding:12px; border-radius:12px; background:var(--soft); border:1px dashed var(--main); }
      .ex-note-box label { display:block; font-size:12px; font-weight:800; color:var(--main); margin-bottom:6px; }
      .ex-note-box textarea { width:100%; box-sizing:border-box; border-radius:10px; border:1px solid var(--line); background:var(--panel); color:var(--text); padding:8px 10px; font-family:inherit; font-size:12.5px; line-height:1.7; resize:vertical; }
      .ex-topic-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:10px; margin-top:10px; }
      .ex-topic-card { padding:12px 14px; border-radius:14px; border:1px solid var(--line); background:var(--panel); display:flex; flex-direction:column; gap:8px; }
      .ex-vis-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:99px; font-size:11.5px; font-weight:700; }
      .ex-vis-badge.pub { background:rgba(22,163,74,.12); color:#15803d; }
      .ex-vis-badge.hid { background:rgba(220,38,38,.12); color:#dc2626; }
      .ex-admin-csv-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:800; background:rgba(79,70,229,.12); border:1px solid rgba(79,70,229,.32); color:#3730a3; }
      [data-theme="dark"] .ex-admin-csv-badge { background:rgba(129,140,248,.16); border-color:rgba(129,140,248,.35); color:#c7d2fe; }
      .adm-section-nav { display:flex; flex-wrap:wrap; gap:6px; padding:10px 12px; margin-bottom:14px; border-radius:12px; background:var(--panel); border:1px solid var(--line); }
      .adm-subtab-bar { display:flex; flex-wrap:wrap; gap:6px; padding-bottom:10px; margin-bottom:12px; border-bottom:1px solid var(--line); }
      .adm-subtab-btn { padding:6px 12px; border-radius:8px; border:1px solid var(--line); background:var(--soft); color:var(--muted); font-family:inherit; font-size:12px; font-weight:800; cursor:pointer; transition:all .15s ease; }
      .adm-subtab-btn:hover { color:var(--text); border-color:var(--main); }
      .adm-subtab-btn.active { background:var(--main); color:#fff; border-color:var(--main); }
      .ex-subj-banner { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 14px; border-radius:12px; background:var(--panel); border:1px solid var(--line); border-right:4px solid var(--main); margin:4px 0 12px; font-weight:800; font-size:14.5px; color:var(--text); }
      .ex-subj-sec { display:grid; gap:14px; }
      #examRunnerOverlay .exam-workspace-grid { align-items:start; }
      @media (min-width: 900px) {
        #examRunnerOverlay .exam-palette-card { position:sticky; top:12px; max-height:calc(100vh - 150px); overflow-y:auto; overscroll-behavior:contain; }
      }
      @media (max-width: 899px) {
        #examRunnerOverlay .exam-palette-card { max-height:240px; overflow-y:auto; overscroll-behavior:contain; }
      }
      /* تیک‌های سطح سختی و برچسب مطالعه زیر هر سوال */
      .ex-tag-bar { margin-top:12px; padding:10px 12px; border-radius:12px; background:var(--soft); border:1px solid var(--line); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; }
      .ex-tag-group { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
      .ex-tag-lbl { font-size:11px; font-weight:800; color:var(--muted); margin-left:2px; }
      .ex-tag-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--muted); font-family:inherit; font-size:11.5px; font-weight:700; cursor:pointer; transition:all .15s ease; }
      .ex-tag-chip:hover { color:var(--text); border-color:var(--main); }
      .ex-tag-chip .ex-dot { width:7px; height:7px; border-radius:50%; background:currentColor; opacity:.45; }
      .ex-tag-chip.active .ex-dot { opacity:1; }
      .ex-tag-chip.diff-easy.active { background:rgba(16,185,129,.14); border-color:rgba(16,185,129,.55); color:#047857; }
      .ex-tag-chip.diff-medium.active { background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.55); color:#b45309; }
      .ex-tag-chip.diff-hard.active { background:rgba(244,63,94,.14); border-color:rgba(244,63,94,.55); color:#be123c; }
      .ex-tag-chip.flag-review.active { background:rgba(14,165,233,.14); border-color:rgba(14,165,233,.55); color:#0369a1; }
      .ex-tag-chip.flag-noteworthy.active { background:rgba(139,92,246,.14); border-color:rgba(139,92,246,.55); color:#6d28d9; }
      .ex-tag-chip.flag-careless.active { background:rgba(249,115,22,.14); border-color:rgba(249,115,22,.55); color:#c2410c; }
      [data-theme="dark"] .ex-tag-chip.diff-easy.active { color:#6ee7b7; }
      [data-theme="dark"] .ex-tag-chip.diff-medium.active { color:#fcd34d; }
      [data-theme="dark"] .ex-tag-chip.diff-hard.active { color:#fda4af; }
      [data-theme="dark"] .ex-tag-chip.flag-review.active { color:#7dd3fc; }
      [data-theme="dark"] .ex-tag-chip.flag-noteworthy.active { color:#c4b5fd; }
      [data-theme="dark"] .ex-tag-chip.flag-careless.active { color:#fdba74; }
      .ex-tag-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:6px; font-size:10.5px; font-weight:800; }
      .ex-tag-pill.diff-easy { background:rgba(16,185,129,.15); color:#047857; }
      .ex-tag-pill.diff-medium { background:rgba(245,158,11,.16); color:#b45309; }
      .ex-tag-pill.diff-hard { background:rgba(244,63,94,.15); color:#be123c; }
      .ex-tag-pill.flag-review { background:rgba(14,165,233,.15); color:#0369a1; }
      .ex-tag-pill.flag-noteworthy { background:rgba(139,92,246,.15); color:#6d28d9; }
      .ex-tag-pill.flag-careless { background:rgba(249,115,22,.15); color:#c2410c; }
      [data-theme="dark"] .ex-tag-pill.diff-easy { color:#6ee7b7; }
      [data-theme="dark"] .ex-tag-pill.diff-medium { color:#fcd34d; }
      [data-theme="dark"] .ex-tag-pill.diff-hard { color:#fda4af; }
      [data-theme="dark"] .ex-tag-pill.flag-review { color:#7dd3fc; }
      [data-theme="dark"] .ex-tag-pill.flag-noteworthy { color:#c4b5fd; }
      [data-theme="dark"] .ex-tag-pill.flag-careless { color:#fdba74; }
      .exam-q-dot { position:relative; }
      .exam-q-dot.has-tag::after { content:''; position:absolute; top:2px; left:2px; width:6px; height:6px; border-radius:50%; background:#8b5cf6; }
      .exam-q-dot.tag-hard::after { background:#f43f5e; }
      .exam-q-dot.tag-medium::after { background:#f59e0b; }
      .exam-q-dot.tag-easy::after { background:#10b981; }
      /* رنگ‌بندی مجزا و شیک برای باکس هر درس در برنامه مطالعه روزانه */
      .baraat-subj-theme-0 { border-right:4px solid #0d9488 !important; background:linear-gradient(270deg, rgba(20,184,166,.10) 0%, var(--panel) 55%) !important; border-color:rgba(20,184,166,.32) !important; }
      .baraat-subj-theme-1 { border-right:4px solid #2563eb !important; background:linear-gradient(270deg, rgba(59,130,246,.10) 0%, var(--panel) 55%) !important; border-color:rgba(59,130,246,.32) !important; }
      .baraat-subj-theme-2 { border-right:4px solid #d97706 !important; background:linear-gradient(270deg, rgba(245,158,11,.10) 0%, var(--panel) 55%) !important; border-color:rgba(245,158,11,.34) !important; }
      .baraat-subj-theme-3 { border-right:4px solid #e11d48 !important; background:linear-gradient(270deg, rgba(244,63,94,.09) 0%, var(--panel) 55%) !important; border-color:rgba(244,63,94,.30) !important; }
      .baraat-subj-theme-4 { border-right:4px solid #7c3aed !important; background:linear-gradient(270deg, rgba(139,92,246,.10) 0%, var(--panel) 55%) !important; border-color:rgba(139,92,246,.32) !important; }
      .baraat-subj-theme-5 { border-right:4px solid #ea580c !important; background:linear-gradient(270deg, rgba(249,115,22,.10) 0%, var(--panel) 55%) !important; border-color:rgba(249,115,22,.32) !important; }
      .baraat-subj-theme-6 { border-right:4px solid #0891b2 !important; background:linear-gradient(270deg, rgba(6,182,212,.10) 0%, var(--panel) 55%) !important; border-color:rgba(6,182,212,.32) !important; }
      .baraat-subj-theme-7 { border-right:4px solid #c026d3 !important; background:linear-gradient(270deg, rgba(217,70,239,.09) 0%, var(--panel) 55%) !important; border-color:rgba(217,70,239,.30) !important; }
      [data-theme="dark"] .baraat-subj-theme-0 { background:linear-gradient(270deg, rgba(20,184,166,.16) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-1 { background:linear-gradient(270deg, rgba(59,130,246,.16) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-2 { background:linear-gradient(270deg, rgba(245,158,11,.15) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-3 { background:linear-gradient(270deg, rgba(244,63,94,.15) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-4 { background:linear-gradient(270deg, rgba(139,92,246,.16) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-5 { background:linear-gradient(270deg, rgba(249,115,22,.15) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-6 { background:linear-gradient(270deg, rgba(6,182,212,.16) 0%, var(--panel) 60%) !important; }
      [data-theme="dark"] .baraat-subj-theme-7 { background:linear-gradient(270deg, rgba(217,70,239,.15) 0%, var(--panel) 60%) !important; }
      /* استایل‌های سبک بخش‌بندی دوقسمتی آزمون، VIP و سابقه آمادگی (بدون تغییر تم اصلی) */
      .ex-vip-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:800; background:rgba(245,158,11,.16); color:#b45309; border:1px solid rgba(245,158,11,.42); }
      [data-theme="dark"] .ex-vip-badge { color:#fcd34d; background:rgba(245,158,11,.18); }
      .ex-mode-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:800; }
      .ex-mode-badge.timed { background:rgba(37,99,235,.12); color:#1d4ed8; }
      .ex-mode-badge.prep { background:rgba(16,185,129,.14); color:#047857; }
      [data-theme="dark"] .ex-mode-badge.timed { color:#93c5fd; }
      [data-theme="dark"] .ex-mode-badge.prep { color:#6ee7b7; }
      .ex-prev-history-box { margin-top:8px; padding:8px 12px; border-radius:10px; font-size:12px; line-height:1.7; border:1px solid var(--line); background:var(--soft); }
      .ex-prev-history-box.ok { border-color:rgba(16,185,129,.45); background:rgba(16,185,129,.09); }
      .ex-prev-history-box.bad { border-color:rgba(239,68,68,.45); background:rgba(239,68,68,.09); }
      .ex-prep-stats-strip { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; font-weight:700; }
      .ex-section-tabs { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin:0 0 14px; }
      .ex-section-tab-card { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; border-radius:14px; border:1.5px solid var(--line); background:var(--panel); color:var(--text); cursor:pointer; font-family:inherit; text-align:right; transition:all .16s ease; }
      .ex-section-tab-card:hover { border-color:var(--main); }
      .ex-section-tab-card.active { border-color:var(--main); background:var(--soft); box-shadow:0 4px 14px rgba(0,0,0,.05); }
      .exam-q-dot.res-bad { background:rgba(239,68,68,.18) !important; border-color:#ef4444 !important; color:#b91c1c !important; }
      [data-theme="dark"] .exam-q-dot.res-bad { color:#fca5a5 !important; }
      /* نوار پیشرفت روی کارت‌های عنوان اصلی و سرفصل */
      .ex-prog-wrap { width:100%; display:flex; flex-direction:column; gap:4px; margin-top:2px; }
      .ex-prog-head { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:11.5px; color:var(--muted); font-weight:700; flex-wrap:wrap; }
      .ex-prog-bar { width:100%; height:6px; border-radius:99px; background:var(--soft); border:1px solid var(--line); overflow:hidden; }
      .ex-prog-fill { height:100%; border-radius:99px; background:linear-gradient(90deg, var(--main), #10b981); transition:width .25s ease; }
      /* فیلتر پاسخ‌داده‌نشده و غلط‌های اخیر داخل سرفصل‌ها */
      .ex-filter-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:0 0 12px; padding:10px 12px; border-radius:12px; background:var(--soft); border:1px solid var(--line); }
      .ex-filter-lbl { font-size:12px; font-weight:800; color:var(--muted); margin-left:4px; }
      /* دکمه گزینه‌های قابل کلیک در دفترچه نکات */
      .ex-nb-opt-btn { width:100%; text-align:right; font-family:inherit; cursor:pointer; }
      .ex-nb-opt-btn:hover { border-color:var(--main); }
      /* لینک ماده قانون داخل پاسخ تشریحی + پاپ‌آپ سریع ماده قانون */
      .exam-exp-box .exam-law-ref-btn { display:inline; background:rgba(13,148,136,.12); color:var(--main); border:none; border-bottom:1.5px dashed var(--main); border-radius:5px; padding:1px 6px; margin:0 1px; font-family:inherit; font-size:inherit; font-weight:800; cursor:pointer; transition:all .15s ease; }
      .exam-exp-box .exam-law-ref-btn:hover { background:var(--main); color:#fff; }
      #examLawRefPopup { position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; padding:14px; background:rgba(15,23,42,.58); backdrop-filter:blur(3px); }
      .ex-law-popup-card { width:100%; max-width:680px; max-height:84vh; display:flex; flex-direction:column; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:16px; box-shadow:0 20px 50px rgba(0,0,0,.35); overflow:hidden; }
      .ex-law-popup-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px; border-bottom:1px solid var(--line); background:var(--soft); }
      .ex-law-popup-body { padding:14px 16px; overflow-y:auto; display:grid; gap:12px; line-height:1.9; font-size:13.5px; }
      .ex-law-popup-body .exam-law-ref-btn { display:inline; background:rgba(13,148,136,.12); color:var(--main); border:none; border-bottom:1.5px dashed var(--main); border-radius:5px; padding:0 5px; font-family:inherit; font-size:inherit; font-weight:800; cursor:pointer; }
      /* کنترل فونت A- / A+ و شیت پرش سریع روی موبایل */
      .ex-font-ctrl { display:inline-flex; align-items:center; gap:2px; padding:2px 4px; border-radius:9px; border:1px solid var(--line); background:var(--soft); }
      .ex-font-btn { border:none; background:transparent; color:var(--text); font-family:inherit; font-size:12px; font-weight:800; padding:3px 7px; border-radius:6px; cursor:pointer; line-height:1.2; }
      .ex-font-btn:hover { background:var(--panel); color:var(--main); }
      .ex-font-val { font-size:11px; font-weight:800; color:var(--muted); min-width:34px; text-align:center; user-select:none; }
      #examRunnerOverlay .exam-q-stem { font-size:calc(15px * var(--exam-font-scale, 1)); line-height:1.95; }
      #examRunnerOverlay .exam-opt-btn { font-size:calc(13.8px * var(--exam-font-scale, 1)); line-height:1.75; }
      #examRunnerOverlay .exam-exp-box { font-size:calc(13.2px * var(--exam-font-scale, 1)); line-height:1.85; }
      #examQuickJumpSheet { position:fixed; inset:0; z-index:99990; display:flex; align-items:flex-end; justify-content:center; background:rgba(15,23,42,.54); backdrop-filter:blur(2px); }
      @media (min-width: 720px) {
        #examQuickJumpSheet { align-items:center; padding:16px; }
      }
      .ex-qj-card { width:100%; max-width:560px; max-height:80vh; display:flex; flex-direction:column; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:18px 18px 0 0; box-shadow:0 -12px 40px rgba(0,0,0,.28); overflow:hidden; }
      @media (min-width: 720px) {
        .ex-qj-card { border-radius:16px; }
      }
      .ex-qj-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px; border-bottom:1px solid var(--line); background:var(--soft); }
      .ex-qj-body { padding:14px 16px; overflow-y:auto; display:grid; gap:14px; }
      /* دسته‌بندی منظم آزمون‌ها بر اساس عنوان اصلی در پنل مدیریت */
      .adm-exam-filter-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:10px 12px; margin-bottom:12px; border-radius:12px; background:var(--soft); border:1px solid var(--line); }
      .adm-exam-group { border:1px solid var(--line); border-radius:14px; background:var(--panel); overflow:hidden; }
      .adm-exam-group-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:11px 14px; background:var(--soft); border-bottom:1px solid var(--line); }
      .adm-exam-group.collapsed .adm-exam-group-head { border-bottom:none; }
      .adm-exam-group-toggle { display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:transparent; border:none; padding:0; color:var(--text); font-family:inherit; cursor:pointer; text-align:right; }
      .adm-exam-group-toggle:hover .adm-exam-group-title { color:var(--main); }
      .adm-exam-group-title { font-size:14.5px; font-weight:800; color:var(--text); transition:color .15s ease; }
      .adm-exam-group-body { display:grid; gap:8px; padding:10px 12px; }
      .adm-exam-group.collapsed .adm-exam-group-body { display:none; }
    `;
    document.head.appendChild(st);
  }

  function normalizeExamSourceTag(raw) {
    return toFa(String(raw || '').replace(/\s+/g, ' ').trim());
  }

  function buildExamSourceLabel(rawSource, rawType, rawYear) {
    const src = String(rawSource || '').trim();
    const typ = String(rawType || '').trim();
    const yrEn = toEn(String(rawYear || '').trim()).replace(/[^\d]/g, '');
    const yrFa = yrEn ? toFa(yrEn) : '';
    if (src) {
      if (yrEn && !toEn(src).includes(yrEn) && !/تالیف/.test(src)) {
        return normalizeExamSourceTag(src + ' ' + yrFa);
      }
      return normalizeExamSourceTag(src);
    }
    if (typ) {
      if (yrEn && !toEn(typ).includes(yrEn) && !/تالیف/.test(typ)) {
        return normalizeExamSourceTag(typ + ' ' + yrFa);
      }
      return normalizeExamSourceTag(typ);
    }
    if (yrFa) {
      return normalizeExamSourceTag(yrFa);
    }
    return '';
  }

  function formatExamSourceBadgeHtml(sourceLabel) {
    const clean = normalizeExamSourceTag(sourceLabel);
    if (!clean) return '';
    return `<span class="pill" style="background:rgba(245,158,11,.14); color:#b45309; font-weight:800;">${esc(clean)}</span>`;
  }

  const examQuestionCopyRegistry = {};
  function registerCopyableQuestion(qObj, subjName, qNum) {
    if (!qObj || !qObj.id) return;
    examQuestionCopyRegistry[qObj.id] = { qObj, subjName: subjName || '', qNum: qNum || 0 };
  }

  window.copyExamQuestionById = async function(qId, btnEl) {
    const rec = examQuestionCopyRegistry[qId];
    if (!rec || !rec.qObj) return;
    const q = rec.qObj;
    const header = [
      rec.qNum ? 'سوال ' + toFa(rec.qNum) : 'سوال',
      rec.subjName || '',
      q.chapter ? 'سرفصل: ' + q.chapter : '',
      q.sourceLabel ? normalizeExamSourceTag(q.sourceLabel) : ''
    ].filter(Boolean).join(' · ');

    const opts = Array.isArray(q.options) ? q.options : [];
    const rightIdx = Number(q.answer || 0);
    const rightText = opts[rightIdx] || '';
    const lines = [
      header,
      q.q || '',
      '',
      ...opts.map((opt, idx) => opt ? `${EXAM_LETTERS[idx]}) ${opt}` : '').filter(Boolean),
      '',
      `پاسخ صحیح: گزینه ${EXAM_LETTERS[rightIdx]}${rightText ? ' — ' + rightText : ''}`
    ];
    if (q.exp) {
      lines.push(`نکته و پاسخ تشریحی: ${q.exp}`);
    }
    const personalNote = (typeof window.getExamQuestionNote === 'function' ? window.getExamQuestionNote(q.id) : '').trim();
    if (personalNote) {
      lines.push(`نکته شخصی من: ${personalNote}`);
    }
    const payload = lines.join('\n');
    try {
      await navigator.clipboard.writeText(payload);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btnEl) {
      const prev = btnEl.textContent;
      btnEl.textContent = '✓ کپی شد';
      setTimeout(() => { btnEl.textContent = prev; }, 1600);
    }
    if (typeof toast === 'function') toast('سوال، گزینه‌ها، جواب و نکته کپی شد.');
  };

  function getExamMainTitle(ex) {
    if (!ex || typeof ex !== 'object') return 'آزمون حقوقی';
    const mt = String(ex.mainTitle || '').trim();
    if (mt) return mt;
    if (ex.examScope === 'subject' && String(ex.subjectGroup || '').trim()) {
      return String(ex.subjectGroup).trim();
    }
    const cat = String(ex.category || ex.org || '').trim();
    const subjList = typeof getExamSubjectsList === 'function' ? getExamSubjectsList() : DEFAULT_EXAM_SUBJECTS;
    if (cat && subjList.includes(cat)) return cat;
    return String(ex.title || cat || 'آزمون حقوقی').trim();
  }

  function getAllMainTitleSuggestions() {
    const existing = window.getExams().map(getExamMainTitle).filter(Boolean);
    const defaults = typeof getExamSubjectsList === 'function' ? getExamSubjectsList() : DEFAULT_EXAM_SUBJECTS;
    return [...new Set([...existing, ...defaults])];
  }

  function normalizeExamRecord(ex) {
    if (!ex || typeof ex !== 'object') return ex;
    const cat = String(ex.category || ex.org || 'آزمون حقوقی').trim();
    const subjects = Array.isArray(ex.subjects) ? ex.subjects.map(s => Object.assign({}, s, {
      questions: Array.isArray(s.questions) ? s.questions.map(q => Object.assign({}, q, {
        chapter: String(q.chapter || q.topic || '').trim(),
        sourceLabel: normalizeExamSourceTag(q.sourceLabel || q.source || ''),
        csvQuestionNum: q.csvQuestionNum ? String(q.csvQuestionNum).trim() : '',
        csvRowIndex: q.csvRowIndex ? Number(q.csvRowIndex) : undefined,
        csvFileName: q.csvFileName ? String(q.csvFileName).trim() : ''
      })) : []
    })) : [];
    const qTotal = subjects.reduce((sum, s) => sum + ((s.questions || []).length), 0);
    const scope = ex.examScope === 'subject' ? 'subject' : 'general';
    const subjGrp = scope === 'subject' ? String(ex.subjectGroup || cat || '').trim() : '';
    const subjList = typeof getExamSubjectsList === 'function' ? getExamSubjectsList() : DEFAULT_EXAM_SUBJECTS;
    const inferredMain = (scope === 'subject' && subjGrp) ? subjGrp : (cat && subjList.includes(cat) ? cat : (ex.title || cat || 'آزمون حقوقی'));
    const mainTitle = String(ex.mainTitle || inferredMain || 'آزمون حقوقی').trim();
    const topicTitle = String(ex.topicTitle || '').trim();
    return Object.assign({}, ex, {
      mainTitle,
      topicTitle,
      org: cat,
      category: cat,
      examScope: scope,
      subjectGroup: subjGrp,
      isPremium: Boolean(ex.isPremium),
      examType: String(ex.examType || ex.source || '').trim() || 'تالیفی',
      year: ex.year ? (Number(toEn(String(ex.year))) || ex.year) : '',
      durationMinutes: qTotal > 0 ? calcExamDurationMin(qTotal) : (Number(ex.durationMinutes || ex.durationMin || 60) || 60),
      isPublished: ex.isPublished !== false,
      subjects
    });
  }

  // --- مدیریت دروس درس‌به‌درس و تنظیمات اشتراک ویژه (VIP) ---
  function getExamSubjectsList() {
    try {
      const raw = localStorage.getItem(EXAM_SUBJECTS_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr) && arr.length > 0) {
        return [...new Set(arr.map(x => String(x || '').trim()).filter(Boolean))];
      }
    } catch (e) {}
    return DEFAULT_EXAM_SUBJECTS.slice();
  }
  window.getExamSubjectsList = getExamSubjectsList;

  async function saveExamSubjectsList(list, msg) {
    const clean = [...new Set((list || []).map(x => String(x || '').trim()).filter(Boolean))];
    try { localStorage.setItem(EXAM_SUBJECTS_KEY, JSON.stringify(clean)); } catch (e) {}
    if (window.renderExamsHub) window.renderExamsHub();
    if (window.renderAdminExamsList) window.renderAdminExamsList();
    const res = await syncToSupabase(EXAM_SUBJECTS_KEY, clean);
    if (typeof toast === 'function') {
      toast(res.ok ? (msg || 'فهرست دروس درس‌به‌درس ذخیره شد.') : ('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error));
    }
  }

  function getVipSettings() {
    const def = {
      subscribers: [],
      upgradeMessage: 'این آزمون مخصوص اعضای دارای اشتراک ویژه (VIP) است. برای فعال‌سازی اشتراک با پشتیبانی گروه حقوقی برائت تماس بگیرید.',
      supportContact: ''
    };
    try {
      const raw = localStorage.getItem(VIP_SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        return {
          subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
          upgradeMessage: String(parsed.upgradeMessage || def.upgradeMessage),
          supportContact: String(parsed.supportContact || '')
        };
      }
    } catch (e) {}
    return def;
  }
  window.getVipSettings = getVipSettings;

  async function saveVipSettings(cfg, msg) {
    const clean = {
      subscribers: Array.isArray(cfg.subscribers) ? cfg.subscribers : [],
      upgradeMessage: String(cfg.upgradeMessage || '').trim(),
      supportContact: String(cfg.supportContact || '').trim()
    };
    try { localStorage.setItem(VIP_SETTINGS_KEY, JSON.stringify(clean)); } catch (e) {}
    if (window.renderAdminExamsList) window.renderAdminExamsList();
    if (window.renderExamsHub) window.renderExamsHub();
    const res = await syncToSupabase(VIP_SETTINGS_KEY, clean);
    if (typeof toast === 'function') {
      toast(res.ok ? (msg || 'تنظیمات اشتراک ویژه در سرور ذخیره شد.') : ('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + res.error));
    }
  }

  function isCurrentUserVip() {
    if (window.isAdmin) return true;
    const mail = (window.me && window.me.email) ? String(window.me.email).trim().toLowerCase() : '';
    if (!mail) return false;
    const cfg = getVipSettings();
    const now = Date.now();
    return cfg.subscribers.some(sub => {
      if (!sub || sub.active === false) return false;
      if (String(sub.email || '').trim().toLowerCase() !== mail) return false;
      if (sub.expiresAt) {
        const expMs = Date.parse(sub.expiresAt);
        if (!isNaN(expMs) && expMs < now) return false;
      }
      return true;
    });
  }

  function showVipLockModal(examTitle) {
    const cfg = getVipSettings();
    const m = document.getElementById('modal');
    if (!m) {
      if (typeof toast === 'function') toast(cfg.upgradeMessage);
      return;
    }
    m.innerHTML = `
      <h2>⭐ آزمون ویژه (اشتراک VIP)</h2>
      <div class="callout-warn" style="padding:14px; border-radius:12px; margin:12px 0;">
        <b style="display:block; margin-bottom:6px;">${esc(examTitle || 'این آزمون')}</b>
        <p style="margin:0; line-height:1.9; font-size:13.5px;">${esc(cfg.upgradeMessage)}</p>
        ${cfg.supportContact ? `<div style="margin-top:10px; font-weight:800; color:var(--main);">📞 راه ارتباطی فعال‌سازی: ${esc(cfg.supportContact)}</div>` : ''}
      </div>
      ${!window.me ? `<p class="muted small">اگر قبلاً اشتراک تهیه کرده‌اید ابتدا وارد حساب کاربری خود شوید.</p>` : `<p class="muted small">حساب فعلی شما: <b dir="ltr">${esc(window.me.email || '')}</b></p>`}
      <div class="modal-actions">
        ${!window.me ? `<button type="button" class="btn primary" onclick="closeModal();if(window.openAuthModal)openAuthModal()">ورود به حساب کاربری</button>` : ''}
        <button type="button" class="btn" onclick="closeModal()">بستن</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  }

  function formatAdminCsvRefText(qObj, fallbackGlobalIdx) {
    if (!qObj || typeof qObj !== 'object') return fallbackGlobalIdx ? ('سوال ' + toFa(fallbackGlobalIdx) + ' آزمون') : '';
    const num = qObj.csvQuestionNum ? String(qObj.csvQuestionNum).trim() : '';
    const row = qObj.csvRowIndex && Number(qObj.csvRowIndex) > 0 ? Number(qObj.csvRowIndex) : 0;
    if (num && row && num !== String(row)) return 'فایل CSV: سوال ' + toFa(num) + ' (ردیف ' + toFa(row) + ')';
    if (row) return 'فایل CSV: ردیف ' + toFa(row);
    if (num) return 'فایل CSV: سوال ' + toFa(num);
    if (fallbackGlobalIdx && fallbackGlobalIdx > 0) return 'سوال ' + toFa(fallbackGlobalIdx) + ' آزمون';
    return '';
  }

  function formatAdminCsvBadgeHtml(qObj, fallbackGlobalIdx) {
    if (!window.isAdmin) return '';
    const txt = formatAdminCsvRefText(qObj, fallbackGlobalIdx);
    if (!txt) return '';
    const titleAttr = (qObj && qObj.csvFileName) ? ('فایل منبع: ' + qObj.csvFileName) : 'شماره سوال در فایل منبع (فقط قابل مشاهده برای مدیر)';
    return `<span class="ex-admin-csv-badge" title="${esc(titleAttr)}">مدیر · ${esc(txt)}</span>`;
  }

  function getExamCategory(ex) {
    return String((ex && (ex.category || ex.org)) || 'آزمون حقوقی').trim();
  }

  function getExamTypeLabel(ex) {
    return String((ex && (ex.examType || ex.source)) || 'تالیفی').trim();
  }

  function isYearFirstCategory(catName) {
    const s = String(catName || '');
    return /کانون|مرکز|قضاوت|سردفتری|ارشد|وکالت/.test(s) && !/^حقوق\s/.test(s);
  }

  window.jumpToSubjectSection = function(blockId) {
    const api = window.BARAAT_PLANNER_API;
    if (!api) return;
    const st = api.getState();
    const blk = (st.subjectSections || []).find(b => b.id === blockId);
    if (!blk) return;
    blk.open = true;
    api.showView('subjectPlan');
    api.render();
    setTimeout(() => {
      const el = document.getElementById('blk-' + blockId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  let _examsMemCache = { pubRaw: null, privRaw: null, pubRef: null, privRef: null, isAdmin: null, list: null };
  function invalidateExamsCache() {
    _examsMemCache = { pubRaw: null, privRaw: null, pubRef: null, privRef: null, isAdmin: null, list: null };
  }

  window.getExams = function() {
    try {
      const adm = !!window.isAdmin;
      const pubRaw = _memPubExams ? null : localStorage.getItem(EXAMS_KEY);
      const privRaw = (adm && !_memPrivExams) ? localStorage.getItem(EXAMS_PRIVATE_KEY) : null;
      if (
        _examsMemCache.list &&
        _examsMemCache.isAdmin === adm &&
        _examsMemCache.pubRef === _memPubExams &&
        _examsMemCache.privRef === (adm ? _memPrivExams : null) &&
        _examsMemCache.pubRaw === pubRaw &&
        _examsMemCache.privRaw === privRaw
      ) {
        return _examsMemCache.list.slice();
      }
      const pubParsed = Array.isArray(_memPubExams) ? _memPubExams : (pubRaw ? JSON.parse(pubRaw) : []);
      const pubList = Array.isArray(pubParsed) ? pubParsed.map(normalizeExamRecord) : [];
      let out;
      if (!adm) {
        out = pubList.filter(ex => ex && ex.isPublished !== false);
      } else {
        const privParsed = Array.isArray(_memPrivExams) ? _memPrivExams : (privRaw ? JSON.parse(privRaw) : []);
        const privList = Array.isArray(privParsed) ? privParsed.map(ex => normalizeExamRecord(Object.assign({}, ex, { isPublished: false }))) : [];
        const map = new Map();
        pubList.forEach(ex => { if (ex && ex.id) map.set(ex.id, ex); });
        privList.forEach(ex => { if (ex && ex.id) map.set(ex.id, ex); });
        out = [...map.values()];
      }
      _examsMemCache = { pubRaw, privRaw, pubRef: _memPubExams, privRef: adm ? _memPrivExams : null, isAdmin: adm, list: out };
      return out.slice();
    } catch (e) {
      return [];
    }
  };

  function getVisibleExams() {
    const list = window.getExams();
    if (window.isAdmin) return list;
    return list.filter(ex => ex.isPublished !== false);
  }

  async function persistExamsList(list, successMsg) {
    const normalized = (list || []).map(normalizeExamRecord);
    const pubList = normalized.filter(ex => ex.isPublished !== false);
    const privList = normalized.filter(ex => ex.isPublished === false);
    _memPubExams = pubList;
    idbExamsSet(EXAMS_KEY, pubList);
    try { localStorage.setItem(EXAMS_KEY, JSON.stringify(pubList)); } catch (e) {}
    const canSyncPriv = window.isAdmin && (_syncedAsAdmin || privList.length > 0);
    if (canSyncPriv) {
      _memPrivExams = privList;
      idbExamsSet(EXAMS_PRIVATE_KEY, privList);
      try { localStorage.setItem(EXAMS_PRIVATE_KEY, JSON.stringify(privList)); } catch (e) {}
    }
    invalidateExamsCache();
    if (window.renderExamsHub) window.renderExamsHub();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    const resPub = await syncToSupabase(EXAMS_KEY, pubList);
    const resPriv = canSyncPriv ? await syncToSupabase(EXAMS_PRIVATE_KEY, privList) : { ok: true };
    if (resPub.ok && resPriv.ok) {
      if (typeof toast === 'function') toast(successMsg || 'آزمون در سرور ذخیره شد (آزمون‌های مخفی در کلید اختصاصی مدیر).');
    } else {
      if (typeof toast === 'function') toast('ذخیره محلی انجام شد اما خطای سرور رخ داد: ' + (resPub.error || resPriv.error));
    }
  }

  // --- نکات شخصی کاربر برای هر سوال (همگام کامل بین وب، PWA و اپلیکیشن اندروید) ---
  function getUserUidSuffix() {
    return (window.me && (window.me.id || window.me.email)) ? String(window.me.id || window.me.email).toLowerCase() : 'guest';
  }
  function getNotesLocalStorageKey() {
    return EXAM_NOTES_LOCAL_PREFIX + getUserUidSuffix();
  }
  function getNotesMetaLocalStorageKey() {
    return EXAM_NOTES_META_LOCAL_PREFIX + getUserUidSuffix();
  }

  function getQSnapLocalStorageKey() {
    return EXAM_QSNAP_LOCAL_PREFIX + getUserUidSuffix();
  }

  function getExamQuestionSnapshotsMap() {
    const merged = {};
    const keysToCheck = [getQSnapLocalStorageKey()];
    if (window.me && window.me.email) keysToCheck.push(EXAM_QSNAP_LOCAL_PREFIX + String(window.me.email).toLowerCase());
    keysToCheck.push(EXAM_QSNAP_LOCAL_PREFIX + 'guest');
    [...new Set(keysToCheck)].reverse().forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        const obj = raw ? JSON.parse(raw) : {};
        if (obj && typeof obj === 'object') Object.assign(merged, obj);
      } catch (e) {}
    });
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        if (st && st.examQuestionSnapshots && typeof st.examQuestionSnapshots === 'object') {
          Object.assign(merged, st.examQuestionSnapshots);
        }
      }
    } catch (e) {}
    return merged;
  }

  function buildCompactQuestionSnapshot(qId, fallbackMeta) {
    if (!qId) return null;
    const meta = fallbackMeta || examQuestionTagMetaRegistry[qId] || {};
    const makeSnap = (qObj, exTitle, subjName) => {
      const opts = Array.isArray(qObj && qObj.options) ? qObj.options.map(x => String(x || '')) : [];
      if (!opts.filter(Boolean).length) return null;
      return {
        id: qId,
        q: String(qObj.q || '').trim(),
        options: opts,
        answer: Number(qObj.answer || 0),
        exp: String(qObj.exp || '').trim(),
        chapter: String(qObj.chapter || '').trim(),
        sourceLabel: String(qObj.sourceLabel || '').trim(),
        examTitle: String(exTitle || meta.examTitle || '').trim(),
        subjectName: String(subjName || meta.subjectName || '').trim(),
        updatedAt: new Date().toISOString()
      };
    };

    const copyRec = examQuestionCopyRegistry[qId];
    if (copyRec && copyRec.qObj) {
      const s = makeSnap(copyRec.qObj, (examSession && examSession.exam && examSession.exam.title) || copyRec.qObj.examTitle || meta.examTitle, copyRec.subjName || copyRec.qObj.subjectName);
      if (s) return s;
    }

    if (examSession && Array.isArray(examSession.subjects)) {
      for (const sb of examSession.subjects) {
        const found = (sb.questions || []).find(q => q && q.id === qId);
        if (found) {
          const s = makeSnap(found, (examSession.exam && examSession.exam.title) || '', sb.name || '');
          if (s) return s;
        }
      }
    }

    const allEx = window.getExams();
    for (const ex of allEx) {
      for (const sb of (ex.subjects || [])) {
        const found = (sb.questions || []).find(q => q && q.id === qId);
        if (found) {
          const s = makeSnap(found, ex.title || getExamMainTitle(ex), sb.name || '');
          if (s) return s;
        }
      }
    }

    const resList = typeof getExamResults === 'function' ? getExamResults() : [];
    for (const att of resList) {
      const found = (att && Array.isArray(att.questionsSnapshot) ? att.questionsSnapshot : []).find(sn => sn && sn.id === qId);
      if (found) {
        const s = makeSnap(found, att.examTitle || '', found.subjName || found.subjectName || '');
        if (s) return s;
      }
    }
    return null;
  }

  function saveQuestionSnapshotLocalOnly(qId, snap) {
    if (!qId || !snap || !Array.isArray(snap.options) || !snap.options.filter(Boolean).length) return;
    const key = getQSnapLocalStorageKey();
    let obj = {};
    try { obj = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { obj = {}; }
    obj[qId] = snap;
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function getExamNotesMap() {
    const merged = {};
    const keysToCheck = [getNotesLocalStorageKey()];
    if (window.me && window.me.email) keysToCheck.push(EXAM_NOTES_LOCAL_PREFIX + String(window.me.email).toLowerCase());
    keysToCheck.push(EXAM_NOTES_LOCAL_PREFIX + 'guest');
    [...new Set(keysToCheck)].reverse().forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        const obj = raw ? JSON.parse(raw) : {};
        if (obj && typeof obj === 'object') Object.assign(merged, obj);
      } catch (e) {}
    });
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        if (st && st.examNotes && typeof st.examNotes === 'object') {
          Object.assign(merged, st.examNotes);
        }
        if (st && st.examNotesDeletedAt && typeof st.examNotesDeletedAt === 'object') {
          Object.entries(st.examNotesDeletedAt).forEach(([qid, delTs]) => {
            const updTs = st.examNotesUpdatedAt && st.examNotesUpdatedAt[qid];
            if (delTs && (!updTs || Date.parse(delTs) >= Date.parse(updTs))) {
              delete merged[qid];
            }
          });
        }
      }
    } catch (e) {}
    return merged;
  }

  window.getExamQuestionNote = function(qId) {
    if (!qId) return '';
    const map = getExamNotesMap();
    return String(map[qId] || '');
  };

  window.saveExamQuestionNote = async function(qId, textVal, statusElId) {
    if (!qId) return;
    const text = String(textVal || '').trim();
    const nowIso = new Date().toISOString();
    const localKey = getNotesLocalStorageKey();
    const metaKey = getNotesMetaLocalStorageKey();
    let localObj = {};
    let metaObj = { updatedAt: {}, deletedAt: {} };
    try { localObj = JSON.parse(localStorage.getItem(localKey) || '{}') || {}; } catch (e) { localObj = {}; }
    try {
      const parsedM = JSON.parse(localStorage.getItem(metaKey) || '{}') || {};
      metaObj.updatedAt = parsedM.updatedAt || {};
      metaObj.deletedAt = parsedM.deletedAt || {};
    } catch (e) {}

    const snap = text ? buildCompactQuestionSnapshot(qId) : null;
    if (text) {
      localObj[qId] = text;
      metaObj.updatedAt[qId] = nowIso;
      delete metaObj.deletedAt[qId];
      if (snap) saveQuestionSnapshotLocalOnly(qId, snap);
    } else {
      delete localObj[qId];
      metaObj.deletedAt[qId] = nowIso;
      delete metaObj.updatedAt[qId];
    }
    try { localStorage.setItem(localKey, JSON.stringify(localObj)); } catch (e) {}
    try { localStorage.setItem(metaKey, JSON.stringify(metaObj)); } catch (e) {}

    let savedCloud = false;
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me) {
        if (!api.isReady() && api.ensureLoaded) await api.ensureLoaded();
        if (api.isReady()) {
          const st = api.getState();
          st.examNotes = (st.examNotes && typeof st.examNotes === 'object') ? st.examNotes : {};
          st.examNotesUpdatedAt = (st.examNotesUpdatedAt && typeof st.examNotesUpdatedAt === 'object') ? st.examNotesUpdatedAt : {};
          st.examNotesDeletedAt = (st.examNotesDeletedAt && typeof st.examNotesDeletedAt === 'object') ? st.examNotesDeletedAt : {};
          st.examQuestionSnapshots = (st.examQuestionSnapshots && typeof st.examQuestionSnapshots === 'object') ? st.examQuestionSnapshots : {};
          if (text) {
            st.examNotes[qId] = text;
            st.examNotesUpdatedAt[qId] = nowIso;
            delete st.examNotesDeletedAt[qId];
            if (snap) st.examQuestionSnapshots[qId] = snap;
          } else {
            delete st.examNotes[qId];
            st.examNotesDeletedAt[qId] = nowIso;
            delete st.examNotesUpdatedAt[qId];
          }
          if (api.saveImmediate) savedCloud = !!(await api.saveImmediate());
          else if (api.persist) { api.persist(); savedCloud = true; }
        }
      }
    } catch (e) {}

    if (statusElId) {
      const el = document.getElementById(statusElId);
      if (el) {
        el.textContent = text
          ? (savedCloud ? '✅ همگام با حساب ابری (وب و اپ)' : '📱 ذخیره روی دستگاه (با اتصال همگام می‌شود)')
          : 'پاک شد';
      }
    }
    if (typeof toast === 'function') {
      toast(text ? (savedCloud ? 'نکته شما در حساب ابری ذخیره و همگام شد.' : 'نکته روی دستگاه ذخیره شد.') : 'نکته این سوال پاک شد.');
    }
  };

  function renderQuestionNoteBoxHtml(qId, domPrefix) {
    const existing = window.getExamQuestionNote(qId);
    const inpId = 'exNoteInp_' + domPrefix + '_' + qId;
    const stId = 'exNoteSt_' + domPrefix + '_' + qId;
    return `
      <div class="ex-note-box">
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:6px;">
          <label for="${inpId}" style="margin:0;">📝 نکته و یادداشت شخصی من زیر این سوال (محفوظ و مختص حساب شما)</label>
          <span id="${stId}" class="muted small" style="font-size:11.5px;">${existing ? 'ذخیره‌شده' : ''}</span>
        </div>
        <textarea id="${inpId}" rows="2" placeholder="نکته حقوقی، مستند ماده یا اشتباه رایج خود را اینجا یادداشت کنید..." onchange="saveExamQuestionNote('${qId}', this.value, '${stId}')">${esc(existing)}</textarea>
        <div class="row between" style="margin-top:6px; gap:8px;">
          <span class="muted small" style="font-size:11px;">با حذف نتایج آزمون، این نکات به هیچ وجه پاک نمی‌شوند.</span>
          <button type="button" class="btn small primary" onclick="saveExamQuestionNote('${qId}', document.getElementById('${inpId}').value, '${stId}')">💾 ذخیره نکته</button>
        </div>
      </div>
    `;
  }

  // --- تیک‌ها و برچسب‌های سطح سختی و مطالعه هر سوال (همگام کامل بین وب، PWA و اپلیکیشن) ---
  const examQuestionTagMetaRegistry = {};
  function getTagsLocalStorageKey() {
    return EXAM_TAGS_LOCAL_PREFIX + getUserUidSuffix();
  }
  function getTagsDelLocalStorageKey() {
    return EXAM_TAGS_DEL_LOCAL_PREFIX + getUserUidSuffix();
  }

  function getExamTagsMap() {
    const merged = {};
    const keysToCheck = [getTagsLocalStorageKey()];
    if (window.me && window.me.email) keysToCheck.push(EXAM_TAGS_LOCAL_PREFIX + String(window.me.email).toLowerCase());
    keysToCheck.push(EXAM_TAGS_LOCAL_PREFIX + 'guest');
    [...new Set(keysToCheck)].reverse().forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        const obj = raw ? JSON.parse(raw) : {};
        if (obj && typeof obj === 'object') Object.assign(merged, obj);
      } catch (e) {}
    });
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        if (st && st.examTags && typeof st.examTags === 'object') {
          Object.assign(merged, st.examTags);
        }
        if (st && st.examTagsDeletedAt && typeof st.examTagsDeletedAt === 'object') {
          Object.entries(st.examTagsDeletedAt).forEach(([qid, delTs]) => {
            const cur = merged[qid];
            if (delTs && (!cur || !cur.updatedAt || Date.parse(delTs) >= Date.parse(cur.updatedAt))) {
              delete merged[qid];
            }
          });
        }
      }
    } catch (e) {}
    return merged;
  }

  window.getExamQuestionTag = function(qId) {
    if (!qId) return null;
    const map = getExamTagsMap();
    return map[qId] || null;
  };

  async function persistExamQuestionTag(qId, nextTag) {
    if (!qId) return;
    const fl = (nextTag && (nextTag.tags || nextTag.flags)) || [];
    const isEmpty = !nextTag || (!nextTag.difficulty && (!Array.isArray(fl) || !fl.length));
    const nowIso = new Date().toISOString();
    const localKey = getTagsLocalStorageKey();
    const delKey = getTagsDelLocalStorageKey();
    let localObj = {};
    let delObj = {};
    try { localObj = JSON.parse(localStorage.getItem(localKey) || '{}') || {}; } catch (e) { localObj = {}; }
    try { delObj = JSON.parse(localStorage.getItem(delKey) || '{}') || {}; } catch (e) { delObj = {}; }
    const snap = !isEmpty ? buildCompactQuestionSnapshot(qId, nextTag) : null;
    if (isEmpty) {
      delete localObj[qId];
      delObj[qId] = nowIso;
    } else {
      localObj[qId] = Object.assign({}, nextTag, { updatedAt: nextTag.updatedAt || nowIso });
      delete delObj[qId];
      if (snap) saveQuestionSnapshotLocalOnly(qId, snap);
    }
    try { localStorage.setItem(localKey, JSON.stringify(localObj)); } catch (e) {}
    try { localStorage.setItem(delKey, JSON.stringify(delObj)); } catch (e) {}

    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me) {
        if (!api.isReady() && api.ensureLoaded) await api.ensureLoaded();
        if (api.isReady()) {
          const st = api.getState();
          st.examTags = (st.examTags && typeof st.examTags === 'object') ? st.examTags : {};
          st.examTagsDeletedAt = (st.examTagsDeletedAt && typeof st.examTagsDeletedAt === 'object') ? st.examTagsDeletedAt : {};
          st.examQuestionSnapshots = (st.examQuestionSnapshots && typeof st.examQuestionSnapshots === 'object') ? st.examQuestionSnapshots : {};
          if (isEmpty) {
            delete st.examTags[qId];
            st.examTagsDeletedAt[qId] = nowIso;
          } else {
            st.examTags[qId] = Object.assign({}, nextTag, { updatedAt: nextTag.updatedAt || nowIso });
            delete st.examTagsDeletedAt[qId];
            if (snap) st.examQuestionSnapshots[qId] = snap;
          }
          if (api.saveImmediate) await api.saveImmediate();
          else if (api.persist) api.persist();
        }
      }
    } catch (e) {}
  }

  // --- سابقه پاسخ‌دهی در حالت آمادگی (بدون نمایش پیشاپیش؛ فقط پس از پاسخ دادن) ---
  function getPrepLocalStorageKey() {
    return EXAM_PREP_LOCAL_PREFIX + getUserUidSuffix();
  }

  function getExamPrepHistoryMap() {
    const merged = {};
    const keysToCheck = [getPrepLocalStorageKey()];
    if (window.me && window.me.email) keysToCheck.push(EXAM_PREP_LOCAL_PREFIX + String(window.me.email).toLowerCase());
    keysToCheck.push(EXAM_PREP_LOCAL_PREFIX + 'guest');
    [...new Set(keysToCheck)].reverse().forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        const obj = raw ? JSON.parse(raw) : {};
        if (obj && typeof obj === 'object') Object.assign(merged, obj);
      } catch (e) {}
    });
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        if (st && st.examPrepHistory && typeof st.examPrepHistory === 'object') {
          Object.assign(merged, st.examPrepHistory);
        }
      }
    } catch (e) {}
    return merged;
  }

  function recordExamPrepAnswer(qId, choiceIdx, isCorrect) {
    if (!qId) return;
    const nowIso = new Date().toISOString();
    const localKey = getPrepLocalStorageKey();
    let localObj = {};
    try { localObj = JSON.parse(localStorage.getItem(localKey) || '{}') || {}; } catch (e) { localObj = {}; }
    const prev = localObj[qId] || getExamPrepHistoryMap()[qId] || {};
    const nextRec = {
      attempts: Number(prev.attempts || 0) + 1,
      correctRuns: Number(prev.correctRuns || 0) + (isCorrect ? 1 : 0),
      wrongRuns: Number(prev.wrongRuns || 0) + (isCorrect ? 0 : 1),
      lastChoice: Number(choiceIdx),
      isCorrect: !!isCorrect,
      updatedAt: nowIso
    };
    localObj[qId] = nextRec;
    try { localStorage.setItem(localKey, JSON.stringify(localObj)); } catch (e) {}
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        st.examPrepHistory = (st.examPrepHistory && typeof st.examPrepHistory === 'object') ? st.examPrepHistory : {};
        st.examPrepHistory[qId] = nextRec;
        if (api.persist) api.persist();
      }
    } catch (e) {}
  }

  function getTagFlagsArr(tg) {
    if (!tg) return [];
    if (Array.isArray(tg.tags)) return tg.tags;
    if (Array.isArray(tg.flags)) return tg.flags;
    return [];
  }

  function renderQuestionTagBarInnerHtml(qId, domPrefix) {
    const tg = window.getExamQuestionTag(qId) || {};
    const diff = tg.difficulty || '';
    const flags = getTagFlagsArr(tg);
    const diffs = [
      { id: 'easy', label: 'آسان' },
      { id: 'medium', label: 'متوسط' },
      { id: 'hard', label: 'سخت' }
    ];
    const flagItems = [
      { id: 'review', label: 'مرور' },
      { id: 'noteworthy', label: 'نکته‌دار' },
      { id: 'careless', label: 'بی‌دقتی' }
    ];
    return `
      <div class="ex-tag-group">
        <span class="ex-tag-lbl">سطح سوال:</span>
        ${diffs.map(d => `
          <button type="button" class="ex-tag-chip diff-${d.id} ${diff === d.id ? 'active' : ''}" onclick="toggleExamQuestionDifficulty('${qId}', '${d.id}', '${domPrefix}')">
            <span class="ex-dot"></span>${d.label}
          </button>
        `).join('')}
      </div>
      <div class="ex-tag-group">
        <span class="ex-tag-lbl">برچسب:</span>
        ${flagItems.map(f => `
          <button type="button" class="ex-tag-chip flag-${f.id} ${flags.includes(f.id) ? 'active' : ''}" onclick="toggleExamQuestionFlag('${qId}', '${f.id}', '${domPrefix}')">
            <span class="ex-dot"></span>${f.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderQuestionTagBarHtml(qId, examTitle, subjName, qText, domPrefix) {
    if (!qId) return '';
    examQuestionTagMetaRegistry[qId] = {
      examTitle: String(examTitle || '').trim(),
      subjectName: String(subjName || '').trim(),
      qPreview: String(qText || '').trim().slice(0, 140)
    };
    const barId = 'exTagBar_' + domPrefix + '_' + qId;
    return `<div id="${barId}" class="ex-tag-bar" data-qid="${qId}">${renderQuestionTagBarInnerHtml(qId, domPrefix)}</div>`;
  }

  function refreshTagBarsInDom(qId, domPrefix) {
    document.querySelectorAll('.ex-tag-bar[data-qid="' + qId + '"]').forEach(el => {
      const pfx = (el.id || '').replace('exTagBar_', '').replace('_' + qId, '') || domPrefix || 'ex';
      el.innerHTML = renderQuestionTagBarInnerHtml(qId, pfx);
    });
    const tg = window.getExamQuestionTag(qId);
    const hasAny = !!(tg && (tg.difficulty || getTagFlagsArr(tg).length));
    document.querySelectorAll('.exam-q-dot[data-qid="' + qId + '"]').forEach(dot => {
      dot.classList.remove('has-tag', 'tag-hard', 'tag-medium', 'tag-easy');
      if (hasAny) {
        dot.classList.add('has-tag');
        if (tg.difficulty) dot.classList.add('tag-' + tg.difficulty);
      }
    });
  }

  window.toggleExamQuestionDifficulty = async function(qId, diff, domPrefix) {
    const cur = window.getExamQuestionTag(qId) || {};
    const meta = examQuestionTagMetaRegistry[qId] || {};
    const nextDiff = cur.difficulty === diff ? undefined : diff;
    const nextTags = getTagFlagsArr(cur).slice();
    const nextTag = {
      difficulty: nextDiff,
      tags: nextTags.length ? nextTags : undefined,
      examTitle: meta.examTitle || cur.examTitle || '',
      subjectName: meta.subjectName || cur.subjectName || '',
      qPreview: meta.qPreview || cur.qPreview || cur.questionPreview || '',
      updatedAt: new Date().toISOString()
    };
    await persistExamQuestionTag(qId, nextTag);
    refreshTagBarsInDom(qId, domPrefix);
  };

  window.toggleExamQuestionFlag = async function(qId, flag, domPrefix) {
    const cur = window.getExamQuestionTag(qId) || {};
    const meta = examQuestionTagMetaRegistry[qId] || {};
    const prevTags = getTagFlagsArr(cur).slice();
    const nextTags = prevTags.includes(flag) ? prevTags.filter(f => f !== flag) : [...prevTags, flag];
    const nextTag = {
      difficulty: cur.difficulty,
      tags: nextTags.length ? nextTags : undefined,
      examTitle: meta.examTitle || cur.examTitle || '',
      subjectName: meta.subjectName || cur.subjectName || '',
      qPreview: meta.qPreview || cur.qPreview || cur.questionPreview || '',
      updatedAt: new Date().toISOString()
    };
    await persistExamQuestionTag(qId, nextTag);
    refreshTagBarsInDom(qId, domPrefix);
  };

  // --- نتایج و سوابق آزمون‌ها + حذف فقط توسط مدیر ---
  function getDeletedAttemptIdsSet() {
    try {
      const raw = localStorage.getItem(EXAM_DELETED_ATTEMPTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function getUserResultsStorageKey() {
    const uid = (window.me && (window.me.id || window.me.email)) ? String(window.me.id || window.me.email).toLowerCase() : 'guest';
    return EXAM_RESULTS_LOCAL_KEY + '_' + uid;
  }

  function getExamResults() {
    const deletedSet = getDeletedAttemptIdsSet();
    const map = new Map();
    const addRec = (r) => {
      if (!r || !r.id || deletedSet.has(r.id)) return;
      if (!map.has(r.id)) map.set(r.id, r);
    };
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        if (Array.isArray(st.examResults)) st.examResults.forEach(addRec);
      }
    } catch (e) {}
    try {
      const uRaw = localStorage.getItem(getUserResultsStorageKey());
      const uList = uRaw ? JSON.parse(uRaw) : [];
      if (Array.isArray(uList)) uList.forEach(addRec);
    } catch (e) {}
    try {
      const raw = localStorage.getItem(EXAM_RESULTS_LOCAL_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        const myId = window.me && window.me.id ? String(window.me.id) : '';
        const myMail = window.me && window.me.email ? String(window.me.email).toLowerCase() : '';
        list.forEach(r => {
          if (!r) return;
          if (!r.userId && !r.userEmail) addRec(r);
          else if ((myId && r.userId === myId) || (myMail && String(r.userEmail || '').toLowerCase() === myMail)) addRec(r);
        });
      }
    } catch (e) {}
    return [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async function saveExamResultRecord(rec) {
    try {
      const upsertById = (arr, item, maxLen) => {
        const clean = (Array.isArray(arr) ? arr : []).filter(x => x && x.id !== item.id);
        clean.unshift(item);
        return clean.slice(0, maxLen || 80);
      };
      const userKey = getUserResultsStorageKey();
      const userList = (() => {
        try { return JSON.parse(localStorage.getItem(userKey) || '[]'); } catch (e) { return []; }
      })();
      localStorage.setItem(userKey, JSON.stringify(upsertById(userList, rec, 80)));

      const localList = (() => {
        try { return JSON.parse(localStorage.getItem(EXAM_RESULTS_LOCAL_KEY) || '[]'); } catch (e) { return []; }
      })();
      localStorage.setItem(EXAM_RESULTS_LOCAL_KEY, JSON.stringify(upsertById(localList, rec, 80)));

      const api = window.BARAAT_PLANNER_API;
      if (api && window.me) {
        if (!api.isReady() && api.ensureLoaded) await api.ensureLoaded();
        if (api.isReady()) {
          const st = api.getState();
          st.examResults = upsertById(st.examResults, rec, 80);
          if (api.saveImmediate) await api.saveImmediate();
          else if (api.persist) api.persist();
        }
      }

      // ثبت در گزارش کل برای مشاهده مدیر (زمان‌دار و حالت آمادگی)
      if (window.sb && navigator.onLine) {
        try {
          const r = await syncFromSupabase(EXAM_ATTEMPTS_KEY);
          const arr = (r && r.exists && Array.isArray(r.data)) ? r.data : [];
          const sharedItem = {
            id: rec.id,
            examId: rec.examId,
            examTitle: rec.examTitle,
            examScope: rec.examScope || 'general',
            subjectGroup: rec.subjectGroup || '',
            mode: rec.mode || 'timed',
            scopeLabel: rec.scopeLabel,
            userId: rec.userId || '',
            userEmail: rec.userEmail || '',
            dateLabel: rec.dateLabel,
            correct: rec.correct,
            wrong: rec.wrong,
            blank: rec.blank,
            total: rec.total,
            rawPct: rec.rawPct,
            netPct: rec.netPct,
            answers: rec.answers || {},
            questionTags: rec.questionTags || {},
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt || rec.createdAt
          };
          const nextArr = upsertById(arr, sharedItem, 250);
          localStorage.setItem(EXAM_ATTEMPTS_KEY, JSON.stringify(nextArr));
          await syncToSupabase(EXAM_ATTEMPTS_KEY, nextArr);
        } catch (e2) {}
      }
    } catch (e) {
      console.warn('Exam result save notice:', e);
    }
  }

  let adminAttemptsCache = [];
  let adminStudentTagsCache = [];
  let adminTagFilterType = 'all';
  let adminAttemptModeFilter = 'all'; // 'all' | 'timed' | 'prep'
  let studentResultsModeFilter = 'all'; // 'all' | 'timed' | 'prep'

  window.setAdminTagFilter = function(val) {
    adminTagFilterType = val || 'all';
    const tagBox = document.getElementById('admExamTagsBox');
    if (tagBox) tagBox.innerHTML = renderAdminStudentTagsInnerHtml();
  };

  window.refreshAdminExamAttempts = async function() {
    if (!window.isAdmin) return;
    const deletedSet = getDeletedAttemptIdsSet();
    const map = new Map();
    const tagsList = [];
    const addRec = (r, srcEmail) => {
      if (!r || !r.id || deletedSet.has(r.id)) return;
      const existing = map.get(r.id);
      const item = Object.assign({}, r, { userEmail: r.userEmail || srcEmail || 'دانشجو / کاربر' });
      if (!existing) map.set(r.id, item);
    };

    try {
      const mRes = await syncFromSupabase(EXAM_ATTEMPTS_KEY);
      if (mRes && mRes.exists && Array.isArray(mRes.data)) {
        localStorage.setItem(EXAM_ATTEMPTS_KEY, JSON.stringify(mRes.data));
        mRes.data.forEach(r => addRec(r, r.userEmail));
      } else {
        const cached = JSON.parse(localStorage.getItem(EXAM_ATTEMPTS_KEY) || '[]');
        if (Array.isArray(cached)) cached.forEach(r => addRec(r, r.userEmail));
      }
    } catch (e) {}

    if (window.sb) {
      try {
        const pRes = await window.sb.from('planner').select('user_id, data');
        if (pRes && !pRes.error && Array.isArray(pRes.data)) {
          pRes.data.forEach(row => {
            const d = row.data || {};
            const email = d._userEmail || ('کاربر ' + String(row.user_id || '').slice(0, 8));
            if (Array.isArray(d.examResults)) {
              d.examResults.forEach(r => addRec(Object.assign({ userId: row.user_id }, r), email));
            }
            if (d.examTags && typeof d.examTags === 'object') {
              Object.entries(d.examTags).forEach(([qId, tg]) => {
                if (!tg || (!tg.difficulty && !getTagFlagsArr(tg).length)) return;
                tagsList.push({ userId: row.user_id, email, qId, tag: tg });
              });
            }
          });
        }
      } catch (e) {}
    }

    getExamResults().forEach(r => addRec(r, r.userEmail || (window.me && window.me.email) || 'مدیر'));
    adminAttemptsCache = [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    adminStudentTagsCache = tagsList.sort((a, b) => String(b.tag.updatedAt || '').localeCompare(String(a.tag.updatedAt || '')));
    const box = document.getElementById('admExamAttemptsBox');
    if (box) box.innerHTML = renderAdminAttemptsInnerHtml();
    const tagBox = document.getElementById('admExamTagsBox');
    if (tagBox) tagBox.innerHTML = renderAdminStudentTagsInnerHtml();
  };

  function renderAdminStudentTagsInnerHtml() {
    if (!adminStudentTagsCache.length) {
      return '<div class="muted small surface-box">هنوز سوالی توسط دانشجویان تیک نخورده است (پس از زدن تیک آسان/متوسط/سخت یا مرور/نکته‌دار/بی‌دقتی، در این بخش نمایش داده می‌شود).</div>';
    }
    const c = {
      all: adminStudentTagsCache.length,
      hard: adminStudentTagsCache.filter(x => x.tag.difficulty === 'hard').length,
      medium: adminStudentTagsCache.filter(x => x.tag.difficulty === 'medium').length,
      easy: adminStudentTagsCache.filter(x => x.tag.difficulty === 'easy').length,
      review: adminStudentTagsCache.filter(x => getTagFlagsArr(x.tag).includes('review')).length,
      noteworthy: adminStudentTagsCache.filter(x => getTagFlagsArr(x.tag).includes('noteworthy')).length,
      careless: adminStudentTagsCache.filter(x => getTagFlagsArr(x.tag).includes('careless')).length
    };
    const filtered = adminStudentTagsCache.filter(x => {
      if (adminTagFilterType === 'all') return true;
      if (['easy', 'medium', 'hard'].includes(adminTagFilterType)) return x.tag.difficulty === adminTagFilterType;
      return getTagFlagsArr(x.tag).includes(adminTagFilterType);
    });
    const btns = [
      ['all', 'همه (' + toFa(c.all) + ')'],
      ['hard', 'سخت (' + toFa(c.hard) + ')'],
      ['medium', 'متوسط (' + toFa(c.medium) + ')'],
      ['easy', 'آسان (' + toFa(c.easy) + ')'],
      ['review', 'مرور (' + toFa(c.review) + ')'],
      ['noteworthy', 'نکته‌دار (' + toFa(c.noteworthy) + ')'],
      ['careless', 'بی‌دقتی (' + toFa(c.careless) + ')']
    ];
    const diffLbl = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
    const flagLbl = { review: 'مرور', noteworthy: 'نکته‌دار', careless: 'بی‌دقتی' };
    const qLookup = new Map();
    (window.getExams ? window.getExams() : []).forEach(ex => {
      let gIdx = 0;
      (ex.subjects || []).forEach(sb => {
        (sb.questions || []).forEach(q => {
          gIdx++;
          qLookup.set(q.id, { q, gIdx });
        });
      });
    });
    return `
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        ${btns.map(([id, lbl]) => `<button type="button" class="btn small ${adminTagFilterType === id ? 'primary' : ''}" onclick="setAdminTagFilter('${id}')">${lbl}</button>`).join('')}
      </div>
      <div style="display:grid; gap:8px; max-height:360px; overflow:auto;">
        ${filtered.length ? filtered.slice(0, 100).map(item => {
          const fl = getTagFlagsArr(item.tag);
          const prev = item.tag.qPreview || item.tag.questionPreview || '';
          const hit = qLookup.get(item.qId);
          return `
          <div class="admin-list-row" style="display:grid; gap:6px;">
            <div class="row between" style="gap:8px; flex-wrap:wrap;">
              <div class="row" style="gap:6px; flex-wrap:wrap; align-items:center;">
                <b dir="ltr" style="font-size:12.5px;">${esc(item.email)}</b>
                ${item.tag.examTitle ? `<span class="pill">${esc(item.tag.examTitle)}</span>` : ''}
                ${item.tag.subjectName ? `<span class="art-tag">${esc(item.tag.subjectName)}</span>` : ''}
                ${hit ? formatAdminCsvBadgeHtml(hit.q, hit.gIdx) : ''}
              </div>
              <div class="row" style="gap:4px; flex-wrap:wrap;">
                ${item.tag.difficulty ? `<span class="ex-tag-pill diff-${item.tag.difficulty}">${diffLbl[item.tag.difficulty] || item.tag.difficulty}</span>` : ''}
                ${fl.map(f => `<span class="ex-tag-pill flag-${f}">${flagLbl[f] || f}</span>`).join('')}
              </div>
            </div>
            ${prev ? `<div class="muted small" style="line-height:1.6;">${esc(prev)}</div>` : ''}
          </div>
        `;
        }).join('') : '<div class="muted small surface-box">موردی با این فیلتر یافت نشد.</div>'}
      </div>
    `;
  }

  window.setAdminAttemptModeFilter = function(val) {
    adminAttemptModeFilter = (val === 'timed' || val === 'prep') ? val : 'all';
    const box = document.getElementById('admExamAttemptsBox');
    if (box) box.innerHTML = renderAdminAttemptsInnerHtml();
  };

  window.setStudentResultsModeFilter = function(val) {
    studentResultsModeFilter = (val === 'timed' || val === 'prep') ? val : 'all';
    if (window.renderExamsHub) window.renderExamsHub();
  };

  function resolveAttemptQuestionsSnapshot(rec) {
    if (Array.isArray(rec.questionsSnapshot) && rec.questionsSnapshot.length) return rec.questionsSnapshot;
    const ex = (window.getExams ? window.getExams() : []).find(x => x.id === rec.examId);
    if (!ex) return [];
    const out = [];
    (ex.subjects || []).forEach(sb => {
      (sb.questions || []).forEach(q => {
        out.push({
          id: q.id,
          subjName: sb.name || '',
          chapter: q.chapter || '',
          sourceLabel: q.sourceLabel || '',
          csvQuestionNum: q.csvQuestionNum || '',
          csvRowIndex: q.csvRowIndex || undefined,
          csvFileName: q.csvFileName || '',
          q: q.q,
          options: q.options || [],
          answer: Number(q.answer || 0),
          exp: q.exp || ''
        });
      });
    });
    return out;
  }

  window.openAdminAttemptInspectModal = function(attemptId, filterKind) {
    if (!window.isAdmin) return;
    const rec = adminAttemptsCache.find(x => x.id === attemptId) || getExamResults().find(x => x.id === attemptId);
    if (!rec) {
      if (typeof toast === 'function') toast('جزئیات این گزارش یافت نشد.');
      return;
    }
    const flt = filterKind || 'all';
    const snap = resolveAttemptQuestionsSnapshot(rec);
    const answers = (rec.answers && typeof rec.answers === 'object') ? rec.answers : {};
    const m = document.getElementById('modal');
    if (!m) return;

    const rows = snap.map((item, idx) => {
      const picked = answers[item.id];
      const isBlank = picked === undefined || picked === null;
      const isCorrect = !isBlank && Number(picked) === Number(item.answer);
      return { item, idx: idx + 1, picked, isBlank, isCorrect };
    }).filter(r => {
      if (flt === 'wrong') return !r.isBlank && !r.isCorrect;
      if (flt === 'correct') return r.isCorrect;
      if (flt === 'blank') return r.isBlank;
      return true;
    });

    const isPrep = rec.mode === 'prep';
    m.innerHTML = `
      <div class="row between" style="gap:10px; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <h2 style="margin:0;">👁 پاسخ‌های دانشجو: ${esc(rec.examTitle)}</h2>
          <div class="muted small" style="margin-top:4px;">
            دانشجو: <b dir="ltr">${esc(rec.userEmail || 'مهمان')}</b> ·
            <span class="ex-mode-badge ${isPrep ? 'prep' : 'timed'}">${isPrep ? '📖 حالت آمادگی' : '⏱ آزمون زمان‌دار'}</span> ·
            ${esc(rec.dateLabel || '')} · صحیح: <b>${toFa(rec.correct)}</b> · غلط: <b>${toFa(rec.wrong)}</b> · نزده: <b>${toFa(rec.blank)}</b> · درصد خام: <b>${toFa(rec.rawPct)}٪</b> · تراز: <b>${toFa(rec.netPct)}٪</b>
          </div>
        </div>
      </div>
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button type="button" class="btn small ${flt === 'all' ? 'primary' : ''}" onclick="openAdminAttemptInspectModal('${attemptId}', 'all')">همه (${toFa(snap.length)})</button>
        <button type="button" class="btn small ${flt === 'wrong' ? 'primary' : ''}" onclick="openAdminAttemptInspectModal('${attemptId}', 'wrong')">غلط‌ها (${toFa(rec.wrong)})</button>
        <button type="button" class="btn small ${flt === 'correct' ? 'primary' : ''}" onclick="openAdminAttemptInspectModal('${attemptId}', 'correct')">صحیح‌ها (${toFa(rec.correct)})</button>
        <button type="button" class="btn small ${flt === 'blank' ? 'primary' : ''}" onclick="openAdminAttemptInspectModal('${attemptId}', 'blank')">نزده‌ها (${toFa(rec.blank)})</button>
      </div>
      ${!snap.length ? `
        <div class="callout-info" style="padding:12px; border-radius:10px;">جزئیات سوال‌به‌سوال برای این سابقه قدیمی ثبت نشده است.</div>
      ` : !rows.length ? `
        <div class="muted small surface-box">موردی با این فیلتر یافت نشد.</div>
      ` : `
        <div style="display:grid; gap:10px; max-height:60vh; overflow:auto; padding-left:4px;">
          ${rows.map(r => `
            <div class="exam-q-card" style="padding:12px;">
              <div class="row between" style="gap:6px; flex-wrap:wrap;">
                <div class="row" style="gap:6px; flex-wrap:wrap;">
                  <span class="art-tag">${esc(r.item.subjName || 'سوال')} · سوال ${toFa(r.idx)}</span>
                  ${r.item.chapter ? `<span class="pill">سرفصل: ${esc(r.item.chapter)}</span>` : ''}
                  ${formatAdminCsvBadgeHtml(r.item, r.idx)}
                </div>
                <span class="pill ${r.isCorrect ? 'done' : (!r.isBlank ? 'bad' : '')}">
                  ${r.isBlank ? '⚪ نزده' : (r.isCorrect ? '✅ صحیح' : '❌ غلط')}
                </span>
              </div>
              <div style="font-size:13.5px; font-weight:700; margin:8px 0; line-height:1.7;">${esc(r.item.q)}</div>
              <div class="muted small" style="display:flex; gap:12px; flex-wrap:wrap;">
                <span>پاسخ دانشجو: <b>${r.isBlank ? 'نزده' : ('گزینه ' + (EXAM_LETTERS[Number(r.picked)] || toFa(Number(r.picked) + 1)))}</b></span>
                <span>کلید صحیح: <b style="color:var(--ok, #16a34a);">گزینه ${EXAM_LETTERS[Number(r.item.answer)] || toFa(Number(r.item.answer) + 1)}</b></span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
      <div class="modal-actions">
        <button type="button" class="btn primary" onclick="closeModal()">بستن</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  function renderAdminAttemptsInnerHtml() {
    if (!adminAttemptsCache.length) {
      return '<div class="muted small surface-box">نتیجه آزمون یا گزارش حالت آمادگی ثبت‌شده‌ای وجود ندارد.</div>';
    }
    const cAll = adminAttemptsCache.length;
    const cTimed = adminAttemptsCache.filter(r => r.mode !== 'prep').length;
    const cPrep = adminAttemptsCache.filter(r => r.mode === 'prep').length;
    const filtered = adminAttemptsCache.filter(r => {
      if (adminAttemptModeFilter === 'timed') return r.mode !== 'prep';
      if (adminAttemptModeFilter === 'prep') return r.mode === 'prep';
      return true;
    });
    return `
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button type="button" class="btn small ${adminAttemptModeFilter === 'all' ? 'primary' : ''}" onclick="setAdminAttemptModeFilter('all')">همه (${toFa(cAll)})</button>
        <button type="button" class="btn small ${adminAttemptModeFilter === 'timed' ? 'primary' : ''}" onclick="setAdminAttemptModeFilter('timed')">⏱ آزمون زمان‌دار (${toFa(cTimed)})</button>
        <button type="button" class="btn small ${adminAttemptModeFilter === 'prep' ? 'primary' : ''}" onclick="setAdminAttemptModeFilter('prep')">📖 حالت آمادگی (${toFa(cPrep)})</button>
      </div>
      <div style="display:grid; gap:8px; max-height:360px; overflow:auto;">
        ${filtered.length ? filtered.map(r => {
          const isPrep = r.mode === 'prep';
          const vals = r.questionTags && typeof r.questionTags === 'object' ? Object.values(r.questionTags) : [];
          const badges = [];
          const cEasy = vals.filter(t => t && t.difficulty === 'easy').length;
          const cMed = vals.filter(t => t && t.difficulty === 'medium').length;
          const cHard = vals.filter(t => t && t.difficulty === 'hard').length;
          const cRev = vals.filter(t => t && getTagFlagsArr(t).includes('review')).length;
          const cNote = vals.filter(t => t && getTagFlagsArr(t).includes('noteworthy')).length;
          const cCare = vals.filter(t => t && getTagFlagsArr(t).includes('careless')).length;
          if (cEasy) badges.push(`<span class="ex-tag-pill diff-easy">آسان ${toFa(cEasy)}</span>`);
          if (cMed) badges.push(`<span class="ex-tag-pill diff-medium">متوسط ${toFa(cMed)}</span>`);
          if (cHard) badges.push(`<span class="ex-tag-pill diff-hard">سخت ${toFa(cHard)}</span>`);
          if (cRev) badges.push(`<span class="ex-tag-pill flag-review">مرور ${toFa(cRev)}</span>`);
          if (cNote) badges.push(`<span class="ex-tag-pill flag-noteworthy">نکته‌دار ${toFa(cNote)}</span>`);
          if (cCare) badges.push(`<span class="ex-tag-pill flag-careless">بی‌دقتی ${toFa(cCare)}</span>`);
          return `
            <div class="row between admin-list-row" style="flex-wrap:wrap; gap:8px;">
              <div>
                <div class="row" style="gap:6px; flex-wrap:wrap; align-items:center;">
                  <b>${esc(r.examTitle)}</b>
                  <span class="ex-mode-badge ${isPrep ? 'prep' : 'timed'}">${isPrep ? '📖 حالت آمادگی' : '⏱ زمان‌دار'}</span>
                  ${r.scopeLabel ? `<span class="muted small">(${esc(r.scopeLabel)})</span>` : ''}
                </div>
                <div class="muted small" style="margin-top:3px;">
                  کاربر: <b dir="ltr">${esc(r.userEmail || 'مهمان')}</b> · ${esc(r.dateLabel || '')} · صحیح: <b>${toFa(r.correct)}</b> · غلط: <b>${toFa(r.wrong)}</b> · نزده: <b>${toFa(r.blank)}</b> · خام: <b>${toFa(r.rawPct)}٪</b> · تراز: <b>${toFa(r.netPct)}٪</b>
                </div>
                ${badges.length ? `<div class="row" style="gap:4px; flex-wrap:wrap; margin-top:5px;">${badges.join('')}</div>` : ''}
              </div>
              <div class="row" style="gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn small primary" onclick="openAdminAttemptInspectModal('${r.id}')">👁 پاسخ‌های دانشجو</button>
                <button type="button" class="btn small danger" onclick="adminDeleteExamAttempt('${r.id}')">🗑 حذف</button>
              </div>
            </div>
          `;
        }).join('') : '<div class="muted small surface-box">موردی با این فیلتر یافت نشد.</div>'}
      </div>
    `;
  }

  window.adminDeleteExamAttempt = async function(attemptId) {
    if (!window.isAdmin) {
      if (typeof toast === 'function') toast('فقط مدیر مجاز به حذف نتایج آزمون‌هاست.');
      return;
    }
    if (!confirm('این نتیجه آزمون حذف شود؟ (توجه: نکات شخصی دانشجو زیر سوالات دست‌نخورده و محفوظ می‌مانند)')) return;

    // ۱. ثبت در فهرست نتایج حذف‌شده در meta (تا روی دستگاه خود دانشجو هم پنهان شود و نکاتش دست‌نخورده بماند)
    const delSet = getDeletedAttemptIdsSet();
    delSet.add(attemptId);
    const delArr = [...delSet].slice(-500);
    localStorage.setItem(EXAM_DELETED_ATTEMPTS_KEY, JSON.stringify(delArr));
    await syncToSupabase(EXAM_DELETED_ATTEMPTS_KEY, delArr);

    // ۲. حذف از آرایه shared در meta
    try {
      const mRes = await syncFromSupabase(EXAM_ATTEMPTS_KEY);
      const arr = ((mRes && mRes.exists && Array.isArray(mRes.data)) ? mRes.data : adminAttemptsCache).filter(x => x && x.id !== attemptId);
      localStorage.setItem(EXAM_ATTEMPTS_KEY, JSON.stringify(arr));
      await syncToSupabase(EXAM_ATTEMPTS_KEY, arr);
    } catch (e) {}

    // ۳. پاکسازی احتمالی از نتایج محلی جاری (بدون دست زدن به examNotes)
    try {
      const filterLocal = (k) => {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr)) localStorage.setItem(k, JSON.stringify(arr.filter(x => x && x.id !== attemptId)));
      };
      filterLocal(EXAM_RESULTS_LOCAL_KEY);
      filterLocal(getUserResultsStorageKey());
      const api = window.BARAAT_PLANNER_API;
      if (api && window.me && api.isReady()) {
        const st = api.getState();
        if (Array.isArray(st.examResults)) {
          st.examResults = st.examResults.filter(x => x && x.id !== attemptId);
          await api.saveImmediate();
        }
      }
    } catch (e) {}

    adminAttemptsCache = adminAttemptsCache.filter(x => x.id !== attemptId);
    const box = document.getElementById('admExamAttemptsBox');
    if (box) box.innerHTML = renderAdminAttemptsInnerHtml();
    if (window.renderExamsHub) window.renderExamsHub();
    if (typeof toast === 'function') toast('نتیجه آزمون حذف شد (نکات شخصی دانشجو محفوظ ماند).');
  };

  function totalQuestionsCount(ex) {
    return (ex.subjects || []).reduce((sum, s) => sum + ((s.questions || []).length), 0);
  }

  function getExamChapters(ex) {
    const chSet = new Set();
    (ex.subjects || []).forEach(s => {
      (s.questions || []).forEach(q => {
        if (q.chapter && q.chapter.trim()) chSet.add(q.chapter.trim());
      });
    });
    return [...chSet];
  }

  let examHubSection = 'exams'; // 'exams' (عناوین اصلی و سرفصل‌ها) | 'notebook' (دفترچه نکات)
  let selectedMainTitle = '';   // عنوان اصلی انتخاب‌شده برای نمایش سرفصل‌ها
  let examLessonSearch = '';
  let examNbGroupBy = 'subject'; // 'subject' | 'exam'
  let examNbFilter = 'all';      // 'all' | 'noted' | 'review' | 'noteworthy' | 'careless' | 'hard' | 'medium' | 'easy' | 'wrong'
  let examNbGroup = 'all';
  let examNbSearch = '';
  const examNbExpanded = {};
  const examNbPicked = {};
  let examTopicFilter = 'all';
  let examHubCat = 'all';
  let examHubFilterType = 'all';
  let examHubFilterYear = 'all';
  let examHubFilterChapter = 'all';
  let examHubQuery = '';
  let examHubSubViewMode = 'list';

  // --- کمک‌تابع‌های پیشرفت دانشجو، فیلتر سرفصل، پاپ‌آپ ماده قانون، فونت و پرش سریع ---
  const EXAM_FONT_SCALE_KEY = 'baraat_exam_font_scale_v1';
  let examLawPopupStack = [];

  function getExamFontScale() {
    try {
      const raw = parseFloat(localStorage.getItem(EXAM_FONT_SCALE_KEY) || '1');
      if (Number.isFinite(raw) && raw >= 0.8 && raw <= 1.5) return Math.round(raw * 100) / 100;
    } catch (e) {}
    return 1;
  }

  function applyExamFontScale() {
    const sc = getExamFontScale();
    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) overlay.style.setProperty('--exam-font-scale', String(sc));
    const lbl = document.getElementById('exFontScaleLabel');
    if (lbl) lbl.textContent = toFa(Math.round(sc * 100)) + '٪';
  }

  window.changeExamFontScale = function(delta) {
    const cur = getExamFontScale();
    const next = delta === 0 ? 1 : Math.min(1.45, Math.max(0.85, Math.round((cur + delta) * 100) / 100));
    try { localStorage.setItem(EXAM_FONT_SCALE_KEY, String(next)); } catch (e) {}
    applyExamFontScale();
  };

  function renderExamFontControlsHtml() {
    const pct = Math.round(getExamFontScale() * 100);
    return `
      <div class="ex-font-ctrl" title="تغییر اندازه متن سوال و گزینه‌ها">
        <button type="button" class="ex-font-btn" onclick="changeExamFontScale(-0.1)" aria-label="کوچک کردن فونت">A-</button>
        <button type="button" class="ex-font-btn ex-font-val" id="exFontScaleLabel" onclick="changeExamFontScale(0)" title="بازگشت به اندازه پیش‌فرض">${toFa(pct)}٪</button>
        <button type="button" class="ex-font-btn" onclick="changeExamFontScale(0.1)" aria-label="بزرگ کردن فونت">A+</button>
      </div>
    `;
  }

  function buildStudentQuestionProgressMap() {
    const map = {};
    const prepMap = getExamPrepHistoryMap();
    Object.keys(prepMap || {}).forEach(qId => {
      const rec = prepMap[qId];
      if (!rec || typeof rec !== 'object') return;
      const ts = Date.parse(rec.updatedAt || '') || 0;
      map[qId] = {
        seen: true,
        lastCorrect: !!rec.isCorrect,
        lastWrong: !rec.isCorrect,
        latestTs: ts
      };
    });

    const results = getExamResults().slice().reverse();
    results.forEach(res => {
      const ans = (res && res.answers && typeof res.answers === 'object') ? res.answers : {};
      const snap = Array.isArray(res && res.questionsSnapshot) ? res.questionsSnapshot : [];
      if (!snap.length) return;
      const ts = Date.parse(res.updatedAt || res.createdAt || '') || 1;
      snap.forEach(item => {
        if (!item || !item.id) return;
        const picked = ans[item.id];
        if (picked === undefined || picked === null) return;
        const ok = Number(picked) === Number(item.answer);
        const existing = map[item.id];
        if (!existing || ts >= existing.latestTs) {
          map[item.id] = {
            seen: true,
            lastCorrect: ok,
            lastWrong: !ok,
            latestTs: ts
          };
        }
      });
    });
    return map;
  }

  function calcQuestionsProgressStats(questions, progMap) {
    const list = Array.isArray(questions) ? questions : [];
    let practiced = 0, correctLast = 0, wrongLast = 0;
    list.forEach(q => {
      const st = q && q.id ? progMap[q.id] : null;
      if (st && st.seen) {
        practiced++;
        if (st.lastCorrect) correctLast++;
        else wrongLast++;
      }
    });
    const total = list.length;
    const unseen = Math.max(0, total - practiced);
    const pctPracticed = total ? Math.round((practiced / total) * 100) : 0;
    const accuracyPct = practiced ? Math.round((correctLast / practiced) * 100) : null;
    return { total, practiced, unseen, wrong: wrongLast, correctLast, pctPracticed, accuracyPct };
  }

  function filterQuestionsByPracticeMode(questions, filterMode, progMap) {
    const list = Array.isArray(questions) ? questions : [];
    if (filterMode === 'unseen') return list.filter(q => !(q && q.id && progMap[q.id] && progMap[q.id].seen));
    if (filterMode === 'wrong') return list.filter(q => !!(q && q.id && progMap[q.id] && progMap[q.id].lastWrong));
    return list;
  }

  function renderProgressStripHtml(st, compact) {
    if (!st || !st.total) return '';
    const accText = st.accuracyPct !== null
      ? ` · دقت: <b style="color:${st.accuracyPct >= 60 ? 'var(--ok,#16a34a)' : 'var(--danger,#dc2626)'};">${toFa(st.accuracyPct)}٪</b>`
      : '';
    const wrongText = (!compact && st.wrong > 0)
      ? ` · غلط اخیر: <b style="color:var(--danger,#dc2626);">${toFa(st.wrong)}</b>`
      : '';
    return `
      <div class="ex-prog-wrap">
        <div class="ex-prog-head">
          <span>تمرین‌شده: <b>${toFa(st.practiced)}</b> از ${toFa(st.total)} (${toFa(st.pctPracticed)}٪)${accText}${wrongText}</span>
        </div>
        <div class="ex-prog-bar"><div class="ex-prog-fill" style="width:${st.pctPracticed}%;"></div></div>
      </div>
    `;
  }

  function formatExamExplanationHtml(expText, subjectHint) {
    const raw = String(expText || '');
    if (!raw) return '';
    try {
      if (window.LAWDB && typeof window.LAWDB.linkifyExamExp === 'function') {
        return window.LAWDB.linkifyExamExp(raw, subjectHint || '');
      }
    } catch (e) {}
    return esc(raw);
  }

  function renderExamLawRefPopupContent(entry) {
    let pop = document.getElementById('examLawRefPopup');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'examLawRefPopup';
      pop.addEventListener('click', (ev) => {
        if (ev.target === pop) window.closeExamLawRefPopup();
      });
      document.body.appendChild(pop);
    }
    const canBack = examLawPopupStack.length > 1;
    pop.innerHTML = `
      <div class="ex-law-popup-card" role="dialog" aria-modal="true">
        <div class="ex-law-popup-head">
          <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
            ${canBack ? `<button type="button" class="btn small" onclick="backExamLawRefPopup()">→ بازگشت</button>` : ''}
            <b style="font-size:14px;">⚖️ ${esc(entry.title || 'ماده قانون مرتبط')}</b>
          </div>
          <button type="button" class="btn small" onclick="closeExamLawRefPopup()">✕ بستن</button>
        </div>
        <div class="ex-law-popup-body">
          ${entry.html}
        </div>
      </div>
    `;
  }

  window.openExamLawRefPopup = async function(btnEl) {
    if (!btnEl) return;
    if (!window.LAWDB || typeof window.LAWDB.lookupLawRefHtml !== 'function') {
      if (typeof toast === 'function') toast('بانک قوانین هنوز بارگذاری نشده است.');
      return;
    }
    const numsCsv = btnEl.getAttribute('data-rel-nums') || '';
    const lawsRaw = btnEl.getAttribute('data-rel-laws') || '';
    const unkStr = btnEl.getAttribute('data-rel-unknown') || '';
    const afterCtx = btnEl.getAttribute('data-rel-after') || '';
    const subjHint = btnEl.getAttribute('data-rel-hint') || '';
    let lawsArr = [];
    if (lawsRaw) {
      try {
        const parsed = JSON.parse(lawsRaw);
        if (Array.isArray(parsed)) lawsArr = parsed.filter(Boolean);
      } catch (e) {
        lawsArr = lawsRaw.split('||').filter(Boolean);
      }
    }
    const label = (btnEl.textContent || '').trim() || 'ماده قانون مرتبط';
    if (!window.LAWDB.ready && typeof window.LAWDB.init === 'function') {
      renderExamLawRefPopupContent({ title: label, html: '<div class="muted small">در حال بارگذاری متن ماده از پایگاه قوانین...</div>' });
      try { await window.LAWDB.init(); } catch (e) {}
    }
    const res = window.LAWDB.lookupLawRefHtml(numsCsv, lawsArr, unkStr, afterCtx, subjHint);
    const entry = { title: label, html: res.html };
    examLawPopupStack.push(entry);
    renderExamLawRefPopupContent(entry);
  };

  window.backExamLawRefPopup = function() {
    if (examLawPopupStack.length <= 1) {
      window.closeExamLawRefPopup();
      return;
    }
    examLawPopupStack.pop();
    renderExamLawRefPopupContent(examLawPopupStack[examLawPopupStack.length - 1]);
  };

  window.closeExamLawRefPopup = function() {
    examLawPopupStack = [];
    const pop = document.getElementById('examLawRefPopup');
    if (pop) pop.remove();
  };

  if (!window._baraatExamLawRefBound) {
    window._baraatExamLawRefBound = true;
    document.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.exam-law-ref-btn') : null;
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      window.openExamLawRefPopup(btn);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (document.getElementById('examLawRefPopup')) {
        window.closeExamLawRefPopup();
        return;
      }
      if (document.getElementById('examQuickJumpSheet')) {
        window.closeExamQuickJumpSheet();
      }
    });
  }

  window.closeExamQuickJumpSheet = function() {
    const sheet = document.getElementById('examQuickJumpSheet');
    if (sheet) sheet.remove();
  };

  window.examJumpFromSheet = function(sIdx, qIdx, qId) {
    window.closeExamQuickJumpSheet();
    if (!examSession) return;
    if (examSession.mode === 'exam' && examSession.viewMode === 'single') {
      window.examSelectSubjQ(sIdx, qIdx);
      return;
    }
    window.examJumpToQ(qId);
  };

  window.examJumpToFirstUnanswered = function() {
    if (!examSession) return;
    const s = examSession;
    for (let sIdx = 0; sIdx < (s.subjects || []).length; sIdx++) {
      const sQs = (s.subjects[sIdx] && s.subjects[sIdx].questions) || [];
      for (let qIdx = 0; qIdx < sQs.length; qIdx++) {
        const q = sQs[qIdx];
        if (s.answers[q.id] === undefined || s.answers[q.id] === null) {
          window.examJumpFromSheet(sIdx, qIdx, q.id);
          return;
        }
      }
    }
    window.closeExamQuickJumpSheet();
    if (typeof toast === 'function') toast('به همه سوالات این آزمون پاسخ داده‌اید ✓');
  };

  window.openExamQuickJumpSheet = function() {
    if (!examSession) return;
    const s = examSession;
    let sheet = document.getElementById('examQuickJumpSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'examQuickJumpSheet';
      sheet.addEventListener('click', (ev) => {
        if (ev.target === sheet) window.closeExamQuickJumpSheet();
      });
      document.body.appendChild(sheet);
    }
    const totalQAll = s.subjects.reduce((acc, sb) => acc + (sb.questions || []).length, 0);
    const answeredAll = Object.keys(s.answers || {}).length;
    const remainAll = Math.max(0, totalQAll - answeredAll);

    sheet.innerHTML = `
      <div class="ex-qj-card" role="dialog" aria-modal="true">
        <div class="ex-qj-head">
          <div>
            <b style="font-size:14px;">🔢 پرش سریع بین سوالات</b>
            <div class="muted small">پاسخ‌داده‌شده: ${toFa(answeredAll)} از ${toFa(totalQAll)} · باقی‌مانده: ${toFa(remainAll)}</div>
          </div>
          <button type="button" class="btn small" onclick="closeExamQuickJumpSheet()">✕ بستن</button>
        </div>
        <div class="ex-qj-body">
          <div class="row between" style="gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn small primary" onclick="examJumpToFirstUnanswered()" ${remainAll ? '' : 'disabled'}>🎯 پرش به اولین سوال نزده</button>
            ${renderExamFontControlsHtml()}
          </div>
          ${s.subjects.map((sb, sIdx) => {
            const sQs = sb.questions || [];
            return `
              <div>
                <div style="font-size:12px; font-weight:800; color:var(--main); margin-bottom:6px;">${esc(sb.name)} (${toFa(sQs.length)})</div>
                <div class="exam-palette-grid" style="margin-top:0;">
                  ${sQs.map((q, qi) => {
                    const picked = s.answers[q.id];
                    const isPicked = picked !== undefined && picked !== null;
                    let stCls = '';
                    if (s.mode === 'study') {
                      const isRev = !!s.revealed[q.id];
                      const isRight = isPicked && Number(picked) === Number(q.answer);
                      const isWrong = isPicked && Number(picked) !== Number(q.answer);
                      stCls = isWrong ? 'res-bad' : ((isRight || isRev) ? 'res-ok' : (isPicked ? 'answered' : ''));
                    } else {
                      const isFlag = !!s.flags[q.id];
                      const isCur = s.viewMode === 'single' && sIdx === s.activeSubjIdx && qi === s.activeQIdx;
                      stCls = `${isPicked ? 'answered' : ''} ${isFlag ? 'flagged' : ''} ${isCur ? 'current' : ''}`;
                    }
                    return `<button type="button" class="exam-q-dot ${stCls}" onclick="examJumpFromSheet(${sIdx}, ${qi}, '${q.id}')">${toFa(qi + 1)}</button>`;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  function syncStudentsSubTabsActive() {
    const isNotebookActive = window._studentsSub === 'exams' && examHubSection === 'notebook';
    document.querySelectorAll('[data-studentssub]').forEach(b => {
      const ds = b.dataset.studentssub;
      const on = ds === 'exams'
        ? (window._studentsSub === 'exams' && !isNotebookActive)
        : (ds === window._studentsSub);
      b.classList.toggle('active', on);
    });
    const nbBtn = document.getElementById('studentsSubNotebookBtn');
    if (nbBtn) nbBtn.classList.toggle('active', isNotebookActive);
  }

  window.setExamHubSection = function(sec) {
    examHubSection = sec === 'notebook' ? 'notebook' : 'exams';
    if (sec === 'exams') selectedMainTitle = '';
    syncStudentsSubTabsActive();
    window.renderExamsHub();
  };

  window.selectMainTitleEnc = function(encName) {
    const nextTitle = decodeURIComponent(encName || '');
    if (nextTitle !== selectedMainTitle) examTopicFilter = 'all';
    examHubSection = 'exams';
    selectedMainTitle = nextTitle;
    syncStudentsSubTabsActive();
    window.renderExamsHub();
  };
  window.selectSubjectGroupEnc = window.selectMainTitleEnc;

  window.setExamTopicFilter = function(flt) {
    examTopicFilter = (flt === 'unseen' || flt === 'wrong') ? flt : 'all';
    window.renderExamsHub();
  };

  window.setExamLessonSearch = function(val) {
    examLessonSearch = String(val || '');
    window.renderExamsHub();
  };

  window.forceFullExamSync = async function() {
    if (typeof toast === 'function') toast('در حال همگام‌سازی کامل با سرور...');
    try {
      if (window.BARAAT_PLANNER_API && window.me && window.BARAAT_PLANNER_API.pullAndMerge) {
        await window.BARAAT_PLANNER_API.pullAndMerge();
      }
    } catch (e) {}
    try {
      if (window.syncAllFromSupabase) {
        await window.syncAllFromSupabase(true);
      }
    } catch (e) {}
    if (window.renderExamsHub) window.renderExamsHub();
    if (typeof toast === 'function') toast('آزمون‌ها، نکات و برچسب‌های شما با سرور همگام شدند ✓');
  };

  window.setExamNbFilter = function(val) {
    examNbFilter = val || 'all';
    examNbGroup = 'all';
    window.renderExamsHub();
  };

  window.setExamNbGroupBy = function(val) {
    examNbGroupBy = val === 'exam' ? 'exam' : 'subject';
    examNbGroup = 'all';
    window.renderExamsHub();
  };

  window.setExamNbGroupEnc = function(encVal) {
    examNbGroup = decodeURIComponent(encVal || 'all');
    window.renderExamsHub();
  };

  let _examSearchDebT = 0;
  window.setExamNbSearch = function(val) {
    examNbSearch = String(val || '');
    clearTimeout(_examSearchDebT);
    _examSearchDebT = setTimeout(() => window.renderExamsHub(), 120);
  };

  window.toggleExamNbExpand = function(qId) {
    const prevY = window.scrollY;
    examNbExpanded[qId] = !examNbExpanded[qId];
    window.renderExamsHub();
    window.scrollTo(0, prevY);
  };

  window.pickNotebookOption = function(qId, optIdx, rightIdx) {
    const prevY = window.scrollY;
    const isCorrect = Number(optIdx) === Number(rightIdx);
    examNbPicked[qId] = { choiceIdx: Number(optIdx), isCorrect };
    examNbExpanded[qId] = true;
    recordExamPrepAnswer(qId, Number(optIdx), isCorrect);
    window.renderExamsHub();
    window.scrollTo(0, prevY);
  };

  window.resetNotebookCardPick = function(qId) {
    const prevY = window.scrollY;
    delete examNbPicked[qId];
    delete examNbExpanded[qId];
    window.renderExamsHub();
    window.scrollTo(0, prevY);
  };

  window.openStudentExamNotebook = function() {
    examHubSection = 'notebook';
    if (window.setStudentsSub) window.setStudentsSub('exams', true);
    else {
      syncStudentsSubTabsActive();
      window.renderExamsHub();
    }
  };

  window.setExamHubFilters = function(kind, val) {
    if (kind === 'org' || kind === 'cat') {
      examHubCat = val || 'all';
      examHubFilterYear = 'all';
      examHubFilterChapter = 'all';
      examHubFilterType = 'all';
    }
    if (kind === 'type') examHubFilterType = val || 'all';
    if (kind === 'year') examHubFilterYear = val || 'all';
    if (kind === 'chapter') examHubFilterChapter = val || 'all';
    if (kind === 'q') {
      examHubQuery = String(val || '');
      clearTimeout(_examSearchDebT);
      _examSearchDebT = setTimeout(() => window.renderExamsHub(), 120);
      return;
    }
    if (kind === 'view') examHubSubViewMode = val || 'auto';
    window.renderExamsHub();
  };

  window.selectExamCategoryEnc = function(encCat) {
    window.setExamHubFilters('cat', decodeURIComponent(encCat || 'all'));
  };
  window.selectExamYearEnc = function(encY) {
    window.setExamHubFilters('year', decodeURIComponent(encY || 'all'));
  };
  window.selectExamChapterEnc = function(encCh) {
    window.setExamHubFilters('chapter', decodeURIComponent(encCh || 'all'));
  };
  window.selectExamTypeEnc = function(encT) {
    window.setExamHubFilters('type', decodeURIComponent(encT || 'all'));
  };

  window.toggleExamPublished = async function(examId) {
    if (!window.isAdmin) {
      if (typeof toast === 'function') toast('فقط مدیر مجاز به تغییر وضعیت نمایش آزمون است.');
      return;
    }
    const list = window.getExams();
    const target = list.find(x => x.id === examId);
    if (!target) return;
    target.isPublished = (target.isPublished === false);
    target.updatedAt = new Date().toISOString();
    await persistExamsList(list, target.isPublished ? 'آزمون برای همه کاربران فعال و نمایش داده شد.' : 'آزمون برای کاربران عادی مخفی شد (فقط مدیر می‌بیند).');
  };

  window.openPastAttemptReview = function(attemptId) {
    const rec = getExamResults().find(r => r.id === attemptId);
    if (!rec) {
      if (typeof toast === 'function') toast('جزئیات این کارنامه در دسترس نیست.');
      return;
    }
    const snap = Array.isArray(rec.questionsSnapshot) ? rec.questionsSnapshot : [];
    const answers = (rec.answers && typeof rec.answers === 'object') ? rec.answers : {};
    const m = document.getElementById('modal');
    if (!m) return;

    let bodyHtml = '';
    if (!snap.length) {
      bodyHtml = `
        <div class="callout-info" style="padding:14px; border-radius:12px;">
          این کارنامه مربوط به نسخه قبلی است و جزئیات گزینه‌های آن ذخیره نشده است؛ از این به بعد تمام آزمون‌ها به صورت سوال به سوال با پاسخ صحیح و غلط شما ذخیره می‌شوند.
        </div>
      `;
    } else {
      bodyHtml = `<div style="display:grid; gap:14px; max-height:65vh; overflow:auto; padding-left:4px;">` + snap.map((item, idx) => {
        registerCopyableQuestion(item, item.subjName || 'درس', idx + 1);
        const picked = answers[item.id];
        const isBlank = picked === undefined || picked === null;
        const isCorrect = !isBlank && Number(picked) === Number(item.answer);
        return `
          <div class="exam-q-card">
            <div class="row between" style="gap:8px; flex-wrap:wrap;">
              <div class="row" style="gap:6px; flex-wrap:wrap;">
                <span class="art-tag">${esc(item.subjName || 'درس')} · سوال ${toFa(idx + 1)}</span>
                ${item.chapter ? `<span class="pill">سرفصل: ${esc(item.chapter)}</span>` : ''}
                ${formatExamSourceBadgeHtml(item.sourceLabel)}
                ${formatAdminCsvBadgeHtml(item, idx + 1)}
              </div>
              <div class="row" style="gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn small" onclick="copyExamQuestionById('${item.id}', this)">📋 کپی سوال و جواب</button>
                <span class="pill ${isCorrect ? 'done' : (!isBlank ? 'bad' : '')}">
                  ${isBlank ? '⚪ نزده' : (isCorrect ? '✅ پاسخ صحیح شما' : '❌ پاسخ غلط شما')}
                </span>
              </div>
            </div>
            <div class="exam-q-stem">${esc(item.q)}</div>
            <div class="exam-options-list">
              ${(item.options || []).map((opt, oi) => {
                if (!opt) return '';
                const isRightOpt = oi === Number(item.answer);
                const isUserWrong = picked === oi && !isRightOpt;
                const tagUser = picked === oi ? ' (انتخاب شما)' : '';
                return `
                  <div class="exam-opt-btn ${isRightOpt ? 'correct' : ''} ${isUserWrong ? 'wrong' : ''}" style="cursor:default;">
                    <span class="exam-opt-letter">${EXAM_LETTERS[oi]}</span>
                    <span>${esc(opt)}${tagUser ? ` <small style="font-weight:800;">${tagUser}</small>` : ''}</span>
                  </div>
                `;
              }).join('')}
            </div>
            ${item.exp ? `<div class="exam-exp-box"><b>💡 پاسخ تشریحی:</b> ${formatExamExplanationHtml(item.exp, item.subjName || rec.examTitle)}</div>` : ''}
            ${renderQuestionTagBarHtml(item.id, rec.examTitle || '', item.subjName || '', item.q || '', 'past_' + attemptId)}
            ${renderQuestionNoteBoxHtml(item.id, 'past_' + attemptId)}
          </div>
        `;
      }).join('') + `</div>`;
    }

    m.innerHTML = `
      <div class="row between" style="gap:10px; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <h2 style="margin:0;">📊 بازبینی کارنامه: ${esc(rec.examTitle)}</h2>
          <div class="muted small">${esc(rec.dateLabel || '')} · ${esc(rec.scopeLabel || '')} · صحیح: <b>${toFa(rec.correct)}</b> · غلط: <b>${toFa(rec.wrong)}</b> · نزده: <b>${toFa(rec.blank)}</b> · تراز: <b>${toFa(rec.netPct)}٪</b></div>
        </div>
      </div>
      ${bodyHtml}
      <div class="modal-actions">
        <button type="button" class="btn primary" onclick="closeModal()">بستن</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.openTopicChapterRunner = function(encCat, encKind, encVal, mode) {
    const cat = decodeURIComponent(encCat || 'all');
    const kind = decodeURIComponent(encKind || 'chapter');
    const val = decodeURIComponent(encVal || '');
    const exams = getVisibleExams().filter(e => cat === 'all' || getExamCategory(e) === cat);
    const subjBuckets = new Map();

    exams.forEach(ex => {
      (ex.subjects || []).forEach(sb => {
        (sb.questions || []).forEach(q => {
          const match = kind === 'chapter'
            ? (String(q.chapter || '').trim() === val)
            : (String(sb.name || '').trim() === val);
          if (!match) return;
          const bName = sb.name || val || 'عمومی';
          if (!subjBuckets.has(bName)) subjBuckets.set(bName, { id: 'vs_' + subjBuckets.size, name: bName, questions: [] });
          const effSource = q.sourceLabel || buildExamSourceLabel('', ex.examType, ex.year);
          subjBuckets.get(bName).questions.push(Object.assign({}, q, { sourceLabel: effSource, _fromExam: ex.title }));
        });
      });
    });

    const rawSubjs = [...subjBuckets.values()].filter(s => s.questions.length > 0);
    if (!rawSubjs.length) {
      if (typeof toast === 'function') toast('سوالی در این سرفصل یافت نشد.');
      return;
    }

    stopExamTimer();
    const totalQ = rawSubjs.reduce((a, s) => a + s.questions.length, 0);
    const runMode = mode === 'exam' ? 'exam' : 'study';
    const defaultSeconds = calcExamDurationMin(totalQ) * 60;

    examSession = {
      exam: {
        id: 'topic_' + cat + '_' + val,
        title: (cat !== 'all' ? cat + ' · ' : '') + val,
        category: cat,
        examScope: 'general',
        examType: 'مبحثی / سرفصلی',
        negativeMarking: true
      },
      retryParams: { type: 'topic', encCat, encKind, encVal },
      mode: runMode,
      subjects: rawSubjs,
      scopeLabel: (kind === 'chapter' ? 'سرفصل: ' : 'بخش: ') + val,
      activeSubjIdx: 0,
      activeQIdx: 0,
      viewMode: 'list',
      answers: {},
      revealed: {},
      flags: {},
      sessionPrevPrep: Object.assign({}, getExamPrepHistoryMap()),
      secondsLeft: defaultSeconds,
      totalSeconds: defaultSeconds,
      paused: false,
      submitted: false,
      reviewFilter: 'all'
    };

    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (runMode === 'exam') startExamCountdown();
    renderExamRunner();
  };

  // --- تفکیک عناوین اصلی و سرفصل‌ها / مباحث زیر هر عنوان اصلی ---
  function getExamsForMainTitle(mainTitle) {
    const key = String(mainTitle || '').trim();
    return getVisibleExams().filter(ex => getExamMainTitle(ex) === key);
  }

  function getMainTitleTopicsBreakdown(mainTitle) {
    const subExams = getExamsForMainTitle(mainTitle);
    const chMap = new Map();
    subExams.forEach(ex => {
      const exTopic = String(ex.topicTitle || '').trim();
      (ex.subjects || []).forEach(sb => {
        const sbName = String(sb.name || '').trim();
        (sb.questions || []).forEach(q => {
          const chName = String(q.chapter || '').trim() || exTopic || sbName || String(ex.title || '').trim() || 'همه سوالات';
          if (!chMap.has(chName)) chMap.set(chName, { name: chName, questions: [], hasPremium: false, hasHidden: false });
          const entry = chMap.get(chName);
          if (ex.isPremium) entry.hasPremium = true;
          if (ex.isPublished === false) entry.hasHidden = true;
          entry.questions.push(Object.assign({}, q, {
            chapter: chName,
            sourceLabel: q.sourceLabel || buildExamSourceLabel('', ex.examType, ex.year) || ''
          }));
        });
      });
    });
    return [...chMap.values()];
  }

  function getMainTitleGroupsSummary() {
    const allExams = getVisibleExams();
    const groupsMap = new Map();
    allExams.forEach(ex => {
      const mt = getExamMainTitle(ex);
      if (!groupsMap.has(mt)) {
        groupsMap.set(mt, { name: mt, exams: [], hasPremium: false, allHidden: true });
      }
      const g = groupsMap.get(mt);
      g.exams.push(ex);
      if (ex.isPremium) g.hasPremium = true;
      if (ex.isPublished !== false) g.allHidden = false;
    });
    return [...groupsMap.values()].map(g => {
      const topics = getMainTitleTopicsBreakdown(g.name);
      const totalQ = topics.reduce((sum, t) => sum + t.questions.length, 0);
      return Object.assign(g, { topics, totalQ });
    });
  }

  window.openMainTitleRunner = function(encMainTitle, mode, encTopicName, filterMode) {
    const mainTitle = decodeURIComponent(encMainTitle || '');
    const topicFilter = encTopicName ? decodeURIComponent(encTopicName) : '';
    const practiceFilter = (filterMode === 'unseen' || filterMode === 'wrong') ? filterMode : 'all';
    const subExams = getExamsForMainTitle(mainTitle);
    if (!subExams.length) {
      if (typeof toast === 'function') toast('آزمونی زیر این عنوان یافت نشد.');
      return;
    }
    const baseTopics = getMainTitleTopicsBreakdown(mainTitle).filter(ch => !topicFilter || ch.name === topicFilter);
    if (!baseTopics.length) {
      if (typeof toast === 'function') toast('سوالی در این سرفصل یافت نشد.');
      return;
    }
    const requiresVip = baseTopics.some(ch => ch.hasPremium) && !isCurrentUserVip();
    if (requiresVip) {
      showVipLockModal(mainTitle + (topicFilter ? ' · ' + topicFilter : ''));
      return;
    }

    const progMap = practiceFilter !== 'all' ? buildStudentQuestionProgressMap() : {};
    const topics = practiceFilter === 'all'
      ? baseTopics
      : baseTopics.map(ch => ({
          name: ch.name,
          hasPremium: ch.hasPremium,
          questions: filterQuestionsByPracticeMode(ch.questions, practiceFilter, progMap)
        })).filter(ch => ch.questions.length > 0);

    const rawSubjs = topics.map((ch, idx) => ({
      id: 'mtch_' + idx,
      name: ch.name,
      questions: ch.questions
    }));
    const totalQ = rawSubjs.reduce((a, s) => a + s.questions.length, 0);
    if (!totalQ) {
      if (typeof toast === 'function') {
        if (practiceFilter === 'unseen') toast('همه سوالات این بخش را قبلاً پاسخ داده‌اید!');
        else if (practiceFilter === 'wrong') toast('سوال غلط ثبت‌شده‌ای در این بخش ندارید 🎉');
        else toast('برای این بخش هنوز سوالی ثبت نشده است.');
      }
      return;
    }

    stopExamTimer();
    const runMode = mode === 'exam' ? 'exam' : 'study';
    const defaultSeconds = calcExamDurationMin(totalQ) * 60;
    const stableId = 'mt_' + mainTitle + (topicFilter ? '__' + topicFilter : '');
    const fltSuffix = practiceFilter === 'unseen'
      ? ' · فقط پاسخ‌داده‌نشده‌ها'
      : (practiceFilter === 'wrong' ? ' · فقط اشتباهات اخیر' : '');

    examSession = {
      exam: {
        id: stableId,
        title: topicFilter ? (mainTitle + ' · ' + topicFilter) : mainTitle,
        mainTitle,
        category: mainTitle,
        examScope: 'subject',
        subjectGroup: mainTitle,
        examType: topicFilter ? 'سرفصل / مبحث' : 'آزمون کامل',
        negativeMarking: subExams.every(e => e.negativeMarking !== false)
      },
      retryParams: { type: 'mainTitle', encMainTitle, encTopicName: encTopicName || '', filterMode: practiceFilter },
      mode: runMode,
      subjects: rawSubjs,
      scopeLabel: (topicFilter ? (mainTitle + ' · مبحث: ' + topicFilter) : (mainTitle + ' (همه سرفصل‌ها)')) + fltSuffix,
      activeSubjIdx: 0,
      activeQIdx: 0,
      viewMode: 'list',
      answers: {},
      revealed: {},
      flags: {},
      sessionPrevPrep: Object.assign({}, getExamPrepHistoryMap()),
      secondsLeft: defaultSeconds,
      totalSeconds: defaultSeconds,
      paused: false,
      submitted: false,
      reviewFilter: 'all'
    };

    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (runMode === 'exam') startExamCountdown();
    renderExamRunner();
  };
  window.openSubjectLessonRunner = window.openMainTitleRunner;

  function getLessonGroupsAcrossAllExams() {
    const coreOrder = ['حقوق مدنی', 'آیین دادرسی مدنی', 'حقوق تجارت', 'اصول فقه', 'حقوق جزا', 'آیین دادرسی کیفری'];
    const map = new Map();
    getVisibleExams().forEach(ex => {
      (ex.subjects || []).forEach(sb => {
        const qs = sb.questions || [];
        if (!qs.length) return;
        const name = String(sb.name || '').trim() || 'سایر دروس';
        if (!map.has(name)) map.set(name, { name, totalQ: 0, exams: [], chapters: new Set() });
        const entry = map.get(name);
        entry.totalQ += qs.length;
        entry.exams.push({ examId: ex.id, examTitle: ex.title, year: ex.year || '', qCount: qs.length });
        qs.forEach(q => {
          if (q.chapter && String(q.chapter).trim()) entry.chapters.add(String(q.chapter).trim());
        });
      });
    });
    return [...map.values()].sort((a, b) => {
      const ia = coreOrder.indexOf(a.name);
      const ib = coreOrder.indexOf(b.name);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return b.totalQ - a.totalQ;
    });
  }

  window.openLessonAcrossExamsRunner = function(encLessonName, mode, onlyExamId) {
    const lessonName = decodeURIComponent(encLessonName || '');
    const exams = getVisibleExams();
    const rawSubjs = [];
    let totalQ = 0;

    exams.forEach(ex => {
      if (onlyExamId && ex.id !== onlyExamId) return;
      (ex.subjects || []).forEach(sb => {
        if ((String(sb.name || '').trim() || 'سایر دروس') !== lessonName) return;
        const qs = sb.questions || [];
        if (!qs.length) return;
        totalQ += qs.length;
        const tagged = qs.map(q => Object.assign({}, q, {
          sourceLabel: q.sourceLabel || buildExamSourceLabel('', ex.examType, ex.year) || ex.title
        }));
        rawSubjs.push({
          id: 'ls_' + ex.id + '_' + sb.id,
          name: ex.title + (ex.year ? ` (${toFa(ex.year)})` : ''),
          questions: tagged
        });
      });
    });

    if (!rawSubjs.length || !totalQ) {
      if (typeof toast === 'function') toast('سوالی برای این درس یافت نشد.');
      return;
    }

    stopExamTimer();
    const runMode = mode === 'exam' ? 'exam' : 'study';
    const defaultSeconds = calcExamDurationMin(totalQ) * 60;

    examSession = {
      exam: {
        id: 'lesson_' + Date.now(),
        title: 'مطالعه درس به درس: ' + lessonName,
        category: 'مطالعه درس به درس',
        examScope: 'subject',
        subjectGroup: lessonName,
        examType: onlyExamId ? rawSubjs[0].name : ('تجمیع ' + toFa(rawSubjs.length) + ' آزمون'),
        negativeMarking: true
      },
      retryParams: { type: 'lesson', encLessonName, onlyExamId: onlyExamId || '' },
      mode: runMode,
      subjects: rawSubjs,
      scopeLabel: 'درس: ' + lessonName,
      activeSubjIdx: 0,
      activeQIdx: 0,
      viewMode: 'list',
      answers: {},
      revealed: {},
      flags: {},
      sessionPrevPrep: Object.assign({}, getExamPrepHistoryMap()),
      secondsLeft: defaultSeconds,
      totalSeconds: defaultSeconds,
      paused: false,
      submitted: false,
      reviewFilter: 'all'
    };

    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (runMode === 'exam') startExamCountdown();
    renderExamRunner();
  };

  function normalizeQuestionStemForMatch(str) {
    return toEn(String(str || ''))
      .replace(/[يى]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[\u064B-\u065F\u0670\u0640\u200c\u200f\u200e]/g, '')
      .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function buildStudentNotebookEntries() {
    const exams = window.getExams();
    const results = getExamResults();
    const notesMap = getExamNotesMap();
    const tagsMap = getExamTagsMap();
    const snapshotsMap = getExamQuestionSnapshotsMap();
    const qMap = new Map();
    const qNormList = [];
    const seenNormSet = new Set();

    const indexQuestion = (rec) => {
      if (!rec || !rec.id) return;
      const hasOpts = Array.isArray(rec.options) && rec.options.filter(Boolean).length > 0;
      const prev = qMap.get(rec.id);
      if (!prev || (!prev.options.filter(Boolean).length && hasOpts)) {
        qMap.set(rec.id, rec);
      }
      if (hasOpts && rec.q) {
        const norm = normalizeQuestionStemForMatch(rec.q);
        if (norm.length >= 16 && !seenNormSet.has(norm)) {
          seenNormSet.add(norm);
          qNormList.push({ norm, info: rec });
        }
      }
    };

    exams.forEach(ex => {
      (ex.subjects || []).forEach(sb => {
        (sb.questions || []).forEach((q, idx) => {
          if (!q || !q.id) return;
          indexQuestion({
            id: q.id,
            q: q.q || '',
            options: Array.isArray(q.options) ? q.options : [],
            answer: Number(q.answer || 0),
            exp: q.exp || '',
            chapter: q.chapter || '',
            sourceLabel: q.sourceLabel || buildExamSourceLabel('', ex.examType, ex.year) || '',
            examId: ex.id,
            examTitle: ex.title || getExamMainTitle(ex) || 'آزمون',
            subjectName: String(sb.name || '').trim() || 'سایر دروس',
            qNumber: idx + 1
          });
        });
      });
    });

    const wrongMap = new Map();
    const scanAttemptsForPool = (attList, recordWrongs) => {
      (attList || []).forEach(att => {
        const snaps = Array.isArray(att && att.questionsSnapshot) ? att.questionsSnapshot : [];
        const ans = (att && att.answers && typeof att.answers === 'object') ? att.answers : {};
        snaps.forEach((sn, idx) => {
          if (!sn || !sn.id) return;
          indexQuestion({
            id: sn.id,
            q: sn.q || '',
            options: Array.isArray(sn.options) ? sn.options : [],
            answer: Number(sn.answer || 0),
            exp: sn.exp || '',
            chapter: sn.chapter || '',
            sourceLabel: sn.sourceLabel || '',
            examId: att.examId || '',
            examTitle: att.examTitle || 'آزمون',
            subjectName: String(sn.subjName || sn.subjectName || '').trim() || 'سایر دروس',
            qNumber: idx + 1
          });
          if (recordWrongs) {
            const picked = ans[sn.id];
            if (picked !== undefined && picked !== null && Number(picked) !== Number(sn.answer)) {
              const prev = wrongMap.get(sn.id);
              wrongMap.set(sn.id, {
                count: (prev ? prev.count : 0) + 1,
                lastExamTitle: (prev && prev.lastExamTitle) || att.examTitle || 'آزمون',
                lastPicked: prev ? prev.lastPicked : Number(picked)
              });
            }
          }
        });
      });
    };

    scanAttemptsForPool(results, true);
    if (window.isAdmin) {
      try {
        const admAtts = JSON.parse(localStorage.getItem(EXAM_ATTEMPTS_KEY) || '[]');
        if (Array.isArray(admAtts) && admAtts.length) scanAttemptsForPool(admAtts, false);
      } catch (e) {}
    }

    Object.entries(snapshotsMap).forEach(([qid, sn]) => {
      if (!sn || typeof sn !== 'object') return;
      indexQuestion({
        id: qid,
        q: sn.q || '',
        options: Array.isArray(sn.options) ? sn.options : [],
        answer: Number(sn.answer || 0),
        exp: sn.exp || '',
        chapter: sn.chapter || '',
        sourceLabel: sn.sourceLabel || '',
        examId: '',
        examTitle: sn.examTitle || 'آزمون‌های من',
        subjectName: String(sn.subjectName || '').trim() || 'سایر دروس',
        qNumber: 0
      });
    });

    const idSet = new Set();
    Object.entries(notesMap).forEach(([qId, val]) => {
      if (String(val || '').trim()) idSet.add(qId);
    });
    Object.entries(tagsMap).forEach(([qId, tg]) => {
      if (tg && (tg.difficulty || getTagFlagsArr(tg).length)) idSet.add(qId);
    });
    wrongMap.forEach((_v, qId) => idSet.add(qId));

    const findByTextFallback = (rawText) => {
      const candNorm = normalizeQuestionStemForMatch(rawText);
      if (candNorm.length < 16) return null;
      for (const entry of qNormList) {
        if (entry.norm === candNorm) return entry.info;
        if (entry.norm.startsWith(candNorm) || candNorm.startsWith(entry.norm)) return entry.info;
        if (candNorm.length >= 36 && entry.norm.length >= 36 && entry.norm.startsWith(candNorm.slice(0, 50))) return entry.info;
      }
      return null;
    };

    let backfilledCount = 0;
    const list = [...idSet].map(qId => {
      let info = qMap.get(qId);
      const tg = tagsMap[qId] || null;
      const note = String(notesMap[qId] || '').trim();
      const wrong = wrongMap.get(qId);
      if (!info || !Array.isArray(info.options) || !info.options.filter(Boolean).length) {
        const previewText = (info && info.q) || (tg && (tg.qPreview || tg.questionPreview)) || '';
        const recovered = findByTextFallback(previewText);
        if (recovered) info = recovered;
      }
      const opts = (info && Array.isArray(info.options)) ? info.options : [];
      const hasFull = opts.filter(Boolean).length > 0;
      if (hasFull && (note || tg) && (!snapshotsMap[qId] || !Array.isArray(snapshotsMap[qId].options) || !snapshotsMap[qId].options.filter(Boolean).length)) {
        const snapObj = {
          id: qId,
          q: info.q || '',
          options: opts,
          answer: Number(info.answer || 0),
          exp: info.exp || '',
          chapter: info.chapter || '',
          sourceLabel: info.sourceLabel || '',
          examTitle: info.examTitle || (tg && tg.examTitle) || 'آزمون‌های من',
          subjectName: info.subjectName || (tg && tg.subjectName) || 'سایر دروس',
          updatedAt: new Date().toISOString()
        };
        snapshotsMap[qId] = snapObj;
        saveQuestionSnapshotLocalOnly(qId, snapObj);
        backfilledCount++;
      }
      return {
        id: qId,
        q: (info && info.q) || (tg && (tg.qPreview || tg.questionPreview)) || 'سوال ثبت‌شده در سابقه شما',
        options: opts,
        answer: info ? info.answer : 0,
        hasFullQuestion: hasFull,
        exp: (info && info.exp) || '',
        chapter: (info && info.chapter) || '',
        sourceLabel: (info && info.sourceLabel) || '',
        examTitle: (info && info.examTitle) || (tg && tg.examTitle) || (wrong && wrong.lastExamTitle) || 'آزمون‌های من',
        subjectName: (info && info.subjectName) || (tg && tg.subjectName) || 'سایر دروس',
        qNumber: info ? info.qNumber : 0,
        note,
        tag: tg,
        isWrong: !!wrong,
        wrongCount: wrong ? wrong.count : 0,
        lastWrongPicked: wrong ? wrong.lastPicked : undefined,
        updatedAt: (tg && tg.updatedAt) || ''
      };
    });

    if (backfilledCount > 0) {
      try {
        const api = window.BARAAT_PLANNER_API;
        if (api && window.me && api.isReady()) {
          const st = api.getState();
          st.examQuestionSnapshots = Object.assign({}, st.examQuestionSnapshots || {}, snapshotsMap);
          if (api.persist) api.persist();
        }
      } catch (e) {}
    }

    list.sort((a, b) => {
      if (!!b.note !== !!a.note) return b.note ? 1 : -1;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return list;
  }

  function getFilteredNotebookEntries(allEntries) {
    const qNorm = examNbSearch.trim().toLowerCase();
    const base = allEntries.filter(item => {
      if (examNbFilter === 'noted' && !item.note) return false;
      if (examNbFilter === 'wrong' && !item.isWrong) return false;
      if (['easy', 'medium', 'hard'].includes(examNbFilter)) {
        if (!item.tag || item.tag.difficulty !== examNbFilter) return false;
      }
      if (['review', 'noteworthy', 'careless'].includes(examNbFilter)) {
        if (!item.tag || !getTagFlagsArr(item.tag).includes(examNbFilter)) return false;
      }
      if (qNorm) {
        const hay = `${item.q} ${item.note} ${item.subjectName} ${item.examTitle} ${item.chapter} ${item.sourceLabel}`.toLowerCase();
        if (!hay.includes(qNorm)) return false;
      }
      return true;
    });
    const groupCounts = new Map();
    base.forEach(item => {
      const k = examNbGroupBy === 'exam' ? item.examTitle : item.subjectName;
      groupCounts.set(k, (groupCounts.get(k) || 0) + 1);
    });
    const groups = [...groupCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const visible = examNbGroup === 'all'
      ? base
      : base.filter(item => (examNbGroupBy === 'exam' ? item.examTitle : item.subjectName) === examNbGroup);
    return { base, groups, visible };
  }

  window.openNotebookPracticeRunner = function(mode) {
    const all = buildStudentNotebookEntries();
    const { visible } = getFilteredNotebookEntries(all);
    const playable = visible.filter(x => x.hasFullQuestion);
    if (!playable.length) {
      if (typeof toast === 'function') toast('برای سوالات این فیلتر متن کامل گزینه‌ها موجود نیست.');
      return;
    }
    const grouped = new Map();
    playable.forEach(item => {
      const k = examNbGroupBy === 'exam' ? item.examTitle : item.subjectName;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push({
        id: item.id,
        q: item.q,
        options: item.options,
        answer: item.answer,
        exp: item.exp,
        chapter: item.chapter,
        sourceLabel: item.sourceLabel || item.examTitle
      });
    });
    const rawSubjs = [...grouped.entries()].map(([name, questions], idx) => ({
      id: 'nb_s_' + idx + '_' + Date.now(),
      name,
      questions
    }));
    stopExamTimer();
    const runMode = mode === 'exam' ? 'exam' : 'study';
    const defaultSeconds = calcExamDurationMin(playable.length) * 60;
    examSession = {
      exam: {
        id: 'notebook_' + (examNbGroup !== 'all' ? examNbGroup : 'all'),
        title: 'مرور هوشمند دفترچه نکات آزمونی' + (examNbGroup !== 'all' ? ' · ' + examNbGroup : ''),
        category: 'دفترچه نکات آزمونی',
        examScope: 'general',
        examType: 'مرور شخصی‌سازی‌شده',
        negativeMarking: true
      },
      retryParams: { type: 'notebook' },
      mode: runMode,
      subjects: rawSubjs,
      scopeLabel: 'دفترچه نکات (' + toFa(playable.length) + ' سوال)',
      activeSubjIdx: 0,
      activeQIdx: 0,
      viewMode: 'list',
      answers: {},
      revealed: {},
      flags: {},
      sessionPrevPrep: Object.assign({}, getExamPrepHistoryMap()),
      secondsLeft: defaultSeconds,
      totalSeconds: defaultSeconds,
      paused: false,
      submitted: false,
      reviewFilter: 'all'
    };
    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (runMode === 'exam') startExamCountdown();
    renderExamRunner();
  };

  window.copyAllNotebookNotes = async function() {
    const all = buildStudentNotebookEntries();
    const { visible } = getFilteredNotebookEntries(all);
    if (!visible.length) return;
    const diffFa = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
    const flagFa = { review: 'مرور', noteworthy: 'نکته‌دار', careless: 'بی‌دقتی' };
    const blocks = visible.map((item, idx) => {
      const badges = [
        item.tag && item.tag.difficulty ? diffFa[item.tag.difficulty] : '',
        ...(item.tag ? getTagFlagsArr(item.tag).map(t => flagFa[t] || t) : []),
        item.isWrong ? 'غلط در آزمون' : ''
      ].filter(Boolean);
      const lines = [
        `${toFa(idx + 1)}. [${item.subjectName} · ${item.examTitle}${item.qNumber ? ' · سوال ' + toFa(item.qNumber) : ''}]${badges.length ? ' (' + badges.join(' · ') + ')' : ''}`,
        'سوال: ' + item.q
      ];
      if (item.hasFullQuestion && item.options[item.answer]) {
        lines.push(`پاسخ صحیح: گزینه ${EXAM_LETTERS[item.answer] || toFa(item.answer + 1)}) ${item.options[item.answer]}`);
      }
      if (item.note) lines.push('★ نکته شخصی من: ' + item.note);
      if (item.exp) lines.push('تشریح: ' + item.exp);
      return lines.join('\n');
    });
    const payload = `دفترچه نکات آزمونی من (${toFa(visible.length)} مورد)\n────────────────────────\n\n` + blocks.join('\n\n────────────────\n\n');
    try {
      await navigator.clipboard.writeText(payload);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (typeof toast === 'function') toast(`جزوه نکات (${toFa(visible.length)} سوال) در حافظه کپی شد.`);
  };

  window.examRestartSession = function(newMode) {
    if (!examSession) return;
    if (examSession.retryParams && examSession.retryParams.type === 'mainTitle') {
      const p = examSession.retryParams;
      window.openMainTitleRunner(p.encMainTitle, newMode, p.encTopicName, p.filterMode || 'all');
      return;
    }
    if (examSession.retryParams && examSession.retryParams.type === 'subjectLesson') {
      const p = examSession.retryParams;
      window.openMainTitleRunner(p.encSubjectName, newMode, p.encChapterName, p.filterMode || 'all');
      return;
    }
    if (examSession.retryParams && examSession.retryParams.type === 'notebook') {
      window.openNotebookPracticeRunner(newMode);
      return;
    }
    if (examSession.retryParams && examSession.retryParams.type === 'topic') {
      const p = examSession.retryParams;
      window.openTopicChapterRunner(p.encCat, p.encKind, p.encVal, newMode);
      return;
    }
    if (examSession.retryParams && examSession.retryParams.type === 'lesson') {
      const p = examSession.retryParams;
      window.openLessonAcrossExamsRunner(p.encLessonName, newMode, p.onlyExamId);
      return;
    }
    const singleId = examSession.subjects.length === 1 && examSession.scopeLabel !== 'همه دروس' ? examSession.subjects[0].id : null;
    window.openExamRunner(examSession.exam.id, singleId, newMode);
  };

  window.adminRenameMainTitle = async function(encOldMainTitle) {
    if (!window.isAdmin) return;
    const oldName = decodeURIComponent(encOldMainTitle || '');
    const nextName = prompt('عنوان اصلی جدید را وارد کنید (برای ادغام با یک عنوان دیگر، دقیقاً نام آن عنوان را بنویسید):', oldName);
    if (!nextName || !nextName.trim() || nextName.trim() === oldName) return;
    const cleanNext = nextName.trim();
    const list = window.getExams();
    let changed = 0;
    list.forEach(ex => {
      if (getExamMainTitle(ex) === oldName) {
        ex.mainTitle = cleanNext;
        if (ex.examScope === 'subject') ex.subjectGroup = cleanNext;
        ex.updatedAt = new Date().toISOString();
        changed++;
      }
    });
    if (!changed) return;
    if (selectedMainTitle === oldName) selectedMainTitle = cleanNext;
    await persistExamsList(list, `عنوان اصلی به «${cleanNext}» تغییر یافت (${toFa(changed)} فایل به‌روزرسانی شد).`);
  };

  window.renderExamsHub = function() {
    injectExamUpgradeStyles();
    const root = document.getElementById('studentExamsRoot');
    if (!root) return;
    const prevFocusId = document.activeElement && (document.activeElement.id === 'examHubSearchInp' || document.activeElement.id === 'examNbSearchInp')
      ? document.activeElement.id
      : '';
    const prevSelEnd = prevFocusId && typeof document.activeElement.selectionEnd === 'number'
      ? document.activeElement.selectionEnd
      : null;

    const isNotebookView = examHubSection === 'notebook';
    if (!isNotebookView && selectedMainTitle && !getExamsForMainTitle(selectedMainTitle).length) {
      selectedMainTitle = '';
    }
    const groupsAll = (!isNotebookView && !selectedMainTitle) ? getMainTitleGroupsSummary() : [];
    if (!isNotebookView && !selectedMainTitle && !groupsAll.length && navigator.onLine && window.sb && !_syncPromise && (Date.now() - _lastEmptyExamsSyncAt > 5000)) {
      _lastEmptyExamsSyncAt = Date.now();
      window.syncAllFromSupabase(true);
    }

    const qNorm = examHubQuery.trim().toLowerCase();
    const filteredGroups = groupsAll.filter(g => {
      if (!qNorm) return true;
      if (g.name.toLowerCase().includes(qNorm)) return true;
      return g.topics.some(t => t.name.toLowerCase().includes(qNorm));
    });

    const userIsVip = isCurrentUserVip();
    const progMap = isNotebookView ? {} : buildStudentQuestionProgressMap();
    const resultsAll = getExamResults();
    const resultsTimedCount = resultsAll.filter(r => r.mode !== 'prep').length;
    const resultsPrepCount = resultsAll.filter(r => r.mode === 'prep').length;
    const resultsFiltered = resultsAll.filter(r => {
      if (studentResultsModeFilter === 'timed') return r.mode !== 'prep';
      if (studentResultsModeFilter === 'prep') return r.mode === 'prep';
      return true;
    });

    let nbAll = [];
    let nbCounts = { all: 0, noted: 0, review: 0, noteworthy: 0, careless: 0, hard: 0, medium: 0, easy: 0, wrong: 0 };
    if (isNotebookView) {
      nbAll = buildStudentNotebookEntries();
      nbCounts = {
        all: nbAll.length,
        noted: nbAll.filter(x => !!x.note).length,
        review: nbAll.filter(x => x.tag && getTagFlagsArr(x.tag).includes('review')).length,
        noteworthy: nbAll.filter(x => x.tag && getTagFlagsArr(x.tag).includes('noteworthy')).length,
        careless: nbAll.filter(x => x.tag && getTagFlagsArr(x.tag).includes('careless')).length,
        hard: nbAll.filter(x => x.tag && x.tag.difficulty === 'hard').length,
        medium: nbAll.filter(x => x.tag && x.tag.difficulty === 'medium').length,
        easy: nbAll.filter(x => x.tag && x.tag.difficulty === 'easy').length,
        wrong: nbAll.filter(x => x.isWrong).length
      };
    } else {
      const fastIds = new Set();
      const notesM = getExamNotesMap();
      Object.keys(notesM || {}).forEach(k => { if (String(notesM[k] || '').trim()) fastIds.add(k); });
      const tagsM = getExamTagsMap();
      Object.keys(tagsM || {}).forEach(k => {
        const tg = tagsM[k];
        if (tg && (tg.difficulty || getTagFlagsArr(tg).length)) fastIds.add(k);
      });
      resultsAll.forEach(r => {
        const ans = (r && r.answers) || {};
        (Array.isArray(r && r.questionsSnapshot) ? r.questionsSnapshot : []).forEach(it => {
          if (!it || !it.id) return;
          const pk = ans[it.id];
          if (pk !== undefined && pk !== null && Number(pk) !== Number(it.answer)) fastIds.add(it.id);
        });
      });
      nbCounts.all = fastIds.size;
    }
    const nbFilteredObj = isNotebookView ? getFilteredNotebookEntries(nbAll) : { base: [], groups: [], visible: [] };
    const nbPlayableCount = nbFilteredObj.visible.filter(x => x.hasFullQuestion).length;

    const renderAdminFileCardHtml = (ex) => {
      const totalQ = totalQuestionsCount(ex);
      const autoMin = calcExamDurationMin(totalQ);
      const hiddenByAdmin = ex.isPublished === false;
      const topicsNames = [...new Set((ex.subjects || []).flatMap(sb => (sb.questions || []).map(q => q.chapter || ex.topicTitle || sb.name)).filter(Boolean))];
      return `
        <article class="exam-card" style="${hiddenByAdmin ? 'opacity:.85; border:1.5px dashed var(--danger, #dc2626);' : ''}">
          <div class="row between" style="gap:6px; flex-wrap:wrap;">
            <div class="row" style="gap:6px; flex-wrap:wrap;">
              <span class="art-tag">${esc(getExamMainTitle(ex))}</span>
              ${ex.isPremium ? `<span class="ex-vip-badge">⭐ ویژه VIP</span>` : ''}
              ${hiddenByAdmin ? `<span class="ex-vis-badge hid">🙈 مخفی</span>` : ''}
            </div>
            <span class="pill ${totalQ ? 'done' : ''}">${toFa(totalQ)} سوال · ${toFa(autoMin)} دقیقه</span>
          </div>
          <div>
            <b style="font-size:14.5px; color:var(--text);">${esc(ex.title || ex.topicTitle || getExamMainTitle(ex))}</b>
            ${topicsNames.length ? `<div class="muted small" style="margin-top:4px;">سرفصل‌ها: ${esc(topicsNames.slice(0, 4).join(' · '))}${topicsNames.length > 4 ? ' ...' : ''}</div>` : ''}
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--line); margin-top:auto;">
            <button type="button" class="btn small primary" onclick="openExamQuestionsEditor('${ex.id}')">✏️ ویرایش سوالات</button>
            <button type="button" class="btn small" onclick="openExamMetaModal('${ex.id}')">✎ عنوان/مبحث</button>
            <button type="button" class="btn small" onclick="toggleExamPremium('${ex.id}')">${ex.isPremium ? '⭐ ویژه' : '🆓 رایگان'}</button>
            <button type="button" class="btn small" onclick="toggleExamPublished('${ex.id}')">${hiddenByAdmin ? '👁 انتشار' : '🙈 مخفی'}</button>
            <button type="button" class="btn small danger" onclick="deleteExam('${ex.id}')">✕</button>
          </div>
        </article>
      `;
    };

    let mainBodyHtml = '';
    if (examHubSection === 'notebook') {
      mainBodyHtml = `
        <div class="surface-box" style="padding:14px; border-radius:14px; margin-bottom:14px;">
          <div class="row between" style="gap:10px; flex-wrap:wrap; margin-bottom:12px;">
            <div>
              <h3 style="margin:0; font-size:15.5px; font-weight:800;">📓 دفترچه نکات و مرور آزمونی من</h3>
              <div class="muted small" style="margin-top:4px;">همه نکات شخصی زیر سوالات، تیک‌های سخت/متوسط/آسان/مرور/نکته‌دار/بی‌دقتی و غلط‌های قبلی شما (همگام در وب و اپ).</div>
            </div>
            <div class="row" style="gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn small" onclick="setExamHubSection('exams')">→ بازگشت به آزمون‌ها</button>
              <button type="button" class="btn small primary" ${nbPlayableCount ? '' : 'disabled'} onclick="openNotebookPracticeRunner('study')">📖 حالت آمادگی از فیلتر (${toFa(nbPlayableCount)})</button>
              <button type="button" class="btn small" ${nbPlayableCount ? '' : 'disabled'} onclick="openNotebookPracticeRunner('exam')">⏱ آزمون زمان‌دار</button>
              <button type="button" class="btn small" ${nbFilteredObj.visible.length ? '' : 'disabled'} onclick="copyAllNotebookNotes()">📋 کپی جزوه</button>
            </div>
          </div>

          <div class="cases-kpi-grid" style="margin:0 0 12px;">
            <div class="cases-kpi-card" style="cursor:pointer;" onclick="setExamNbFilter('noted')"><div class="k-label">نکات نوشته‌شده من</div><div class="k-val" style="color:var(--main);">${toFa(nbCounts.noted)}</div></div>
            <div class="cases-kpi-card" style="cursor:pointer;" onclick="setExamNbFilter('review')"><div class="k-label">نیاز به مرور</div><div class="k-val" style="color:#0284c7;">${toFa(nbCounts.review)}</div></div>
            <div class="cases-kpi-card" style="cursor:pointer;" onclick="setExamNbFilter('hard')"><div class="k-label">سوالات سخت</div><div class="k-val" style="color:#e11d48;">${toFa(nbCounts.hard)}</div></div>
            <div class="cases-kpi-card" style="cursor:pointer;" onclick="setExamNbFilter('wrong')"><div class="k-label">غلط‌های قبلی</div><div class="k-val" style="color:#d97706;">${toFa(nbCounts.wrong)}</div></div>
          </div>

          <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:10px;">
            ${[
              ['all', 'همه (' + toFa(nbCounts.all) + ')'],
              ['noted', 'دارای نکته (' + toFa(nbCounts.noted) + ')'],
              ['review', 'مرور (' + toFa(nbCounts.review) + ')'],
              ['noteworthy', 'نکته‌دار (' + toFa(nbCounts.noteworthy) + ')'],
              ['careless', 'بی‌دقتی (' + toFa(nbCounts.careless) + ')'],
              ['hard', 'سخت (' + toFa(nbCounts.hard) + ')'],
              ['medium', 'متوسط (' + toFa(nbCounts.medium) + ')'],
              ['easy', 'آسان (' + toFa(nbCounts.easy) + ')'],
              ['wrong', 'غلط‌های قبلی (' + toFa(nbCounts.wrong) + ')']
            ].map(([id, lbl]) => `<button type="button" class="btn small ${examNbFilter === id ? 'primary' : ''}" onclick="setExamNbFilter('${id}')">${lbl}</button>`).join('')}
          </div>

          <div class="row between" style="gap:10px; flex-wrap:wrap;">
            <div class="row" style="gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn small ${examNbGroupBy === 'subject' ? 'primary' : ''}" onclick="setExamNbGroupBy('subject')">📘 تفکیک بر اساس سرفصل/درس</button>
              <button type="button" class="btn small ${examNbGroupBy === 'exam' ? 'primary' : ''}" onclick="setExamNbGroupBy('exam')">📂 تفکیک بر اساس آزمون</button>
            </div>
            <input id="examNbSearchInp" value="${esc(examNbSearch)}" placeholder="جستجو در متن سوال یا نکات شخصی..." style="min-width:220px; flex:1; max-width:320px;" oninput="setExamNbSearch(this.value)">
          </div>

          ${nbFilteredObj.groups.length ? `
            <div class="row" style="gap:6px; flex-wrap:wrap; margin-top:10px;">
              <button type="button" class="ex-crumb-btn ${examNbGroup === 'all' ? 'active' : ''}" onclick="setExamNbGroupEnc('all')">${examNbGroupBy === 'subject' ? 'همه موارد' : 'همه آزمون‌ها'} (${toFa(nbFilteredObj.base.length)})</button>
              ${nbFilteredObj.groups.map(g => `<button type="button" class="ex-crumb-btn ${examNbGroup === g.name ? 'active' : ''}" onclick="setExamNbGroupEnc('${encodeURIComponent(g.name)}')">${esc(g.name)} (${toFa(g.count)})</button>`).join('')}
            </div>
          ` : ''}
        </div>

        ${!nbFilteredObj.visible.length ? `
          <div class="empty-glass-card" style="margin:24px auto;">
            <div class="empty-icon">📓</div>
            <h3>${nbAll.length ? 'موردی با این فیلتر پیدا نشد' : 'دفترچه نکات آزمونی شما هنوز خالی است'}</h3>
            <p>${nbAll.length ? 'فیلتر یا عبارت جستجو را تغییر دهید.' : 'در آزمون‌ها زیر هر سوال نکته بنویسید یا تیک سخت / مرور / نکته‌دار / بی‌دقتی بزنید تا اینجا دسته‌بندی شوند.'}</p>
          </div>
        ` : `
          <div style="display:grid; gap:14px;">
            ${nbFilteredObj.visible.map((item, idx) => {
              if (item.hasFullQuestion) registerCopyableQuestion(item, item.subjectName, item.qNumber || idx + 1);
              const isExp = !!examNbExpanded[item.id];
              const nbPick = examNbPicked[item.id] || null;
              const themeIdx = hashSubjectColorIdx(item.subjectName);
              const rightIdx = Number(item.answer || 0);
              const rightOptText = (item.options || [])[rightIdx] || '';
              return `
                <article class="exam-q-card baraat-subj-theme-${themeIdx}">
                  <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <div class="row" style="gap:6px; flex-wrap:wrap;">
                      <span class="art-tag">${esc(item.subjectName)}</span>
                      <span class="pill">${esc(item.examTitle)}${item.qNumber ? ' · سوال ' + toFa(item.qNumber) : ''}</span>
                      ${item.chapter ? `<span class="pill">سرفصل: ${esc(item.chapter)}</span>` : ''}
                      ${formatExamSourceBadgeHtml(item.sourceLabel)}
                      ${item.isWrong ? `<span class="pill bad">غلط در آزمون${item.wrongCount > 1 ? ' (' + toFa(item.wrongCount) + ' بار)' : ''}</span>` : ''}
                    </div>
                    ${item.hasFullQuestion ? `<button type="button" class="btn small" onclick="copyExamQuestionById('${item.id}', this)">📋 کپی سوال و نکته</button>` : ''}
                  </div>
                  <div class="exam-q-stem" style="margin-top:0;">${esc(item.q)}</div>
                  ${item.hasFullQuestion ? `
                    <div class="exam-options-list" style="margin-top:10px;">
                      ${(item.options || []).map((opt, oi) => {
                        if (!opt) return '';
                        const isRight = isExp && oi === rightIdx;
                        const isPickedNow = nbPick && nbPick.choiceIdx === oi;
                        const isPickedNowWrong = isPickedNow && oi !== rightIdx;
                        const isPrevWrongPick = isExp && !nbPick && item.isWrong && item.lastWrongPicked === oi && oi !== rightIdx;
                        const isWrongCls = isPickedNowWrong || isPrevWrongPick;
                        const badgeText = isPickedNow && isRight
                          ? ' <small style="font-weight:800;">✓ انتخاب صحیح شما</small>'
                          : (isRight
                              ? ' <small style="font-weight:800;">✓ صحیح</small>'
                              : (isPickedNowWrong
                                  ? ' <small style="font-weight:800;">✕ انتخاب شما</small>'
                                  : (isPrevWrongPick ? ' <small style="font-weight:800;">✕ انتخاب قبلی</small>' : '')));
                        return `
                          <button type="button" class="exam-opt-btn ex-nb-opt-btn ${isRight ? 'correct' : ''} ${isWrongCls ? 'wrong' : ''}" onclick="pickNotebookOption('${item.id}', ${oi}, ${rightIdx})">
                            <span class="exam-opt-letter">${EXAM_LETTERS[oi] || toFa(oi + 1)}</span>
                            <span>${esc(opt)}${badgeText}</span>
                          </button>
                        `;
                      }).join('')}
                    </div>
                  ` : ''}
                  <div class="row" style="gap:8px; flex-wrap:wrap; margin-top:12px;">
                    <button type="button" class="btn small ${isExp ? '' : 'primary'}" onclick="toggleExamNbExpand('${item.id}')">
                      ${isExp ? '▲ بستن پاسخ و یادداشت' : '👁 مشاهده پاسخ و یادداشت'}
                    </button>
                    ${nbPick ? `<button type="button" class="btn small" onclick="resetNotebookCardPick('${item.id}')">🔄 تمرین مجدد این کارت</button>` : ''}
                  </div>
                  ${isExp ? `
                    ${item.hasFullQuestion ? `
                      <div class="exam-exp-box" style="margin-top:10px; padding:10px 12px;">
                        ${nbPick ? `<div style="margin-bottom:6px;">${nbPick.isCorrect ? '<b style="color:var(--ok,#16a34a);">✅ آفرین! انتخاب شما صحیح بود.</b>' : '<b style="color:var(--danger,#dc2626);">❌ انتخاب شما اشتباه بود.</b>'}</div>` : ''}
                        <div><b>✅ پاسخ صحیح: گزینه ${EXAM_LETTERS[rightIdx] || toFa(rightIdx + 1)}</b>${rightOptText ? ` — ${esc(rightOptText)}` : ''}</div>
                        ${item.exp ? `<div style="margin-top:8px;"><b>💡 پاسخ تشریحی:</b> ${formatExamExplanationHtml(item.exp, item.subjectName || item.examTitle)}</div>` : ''}
                      </div>
                    ` : `
                      ${item.exp ? `<div class="exam-exp-box" style="margin-top:10px;"><b>💡 پاسخ تشریحی:</b> ${formatExamExplanationHtml(item.exp, item.subjectName || item.examTitle)}</div>` : ''}
                      <div class="muted small" style="margin-top:10px; padding:8px 10px; border-radius:10px; background:var(--soft); border:1px dashed var(--line);">
                        ℹ️ گزینه‌ها و پاسخ این سوال در آزمون‌های فعلی پیدا نشد (احتمالاً آزمون منبع قبلاً حذف یا مخفی شده است؛ با انتشار یا آپلود مجدد فایل آزمون به‌صورت خودکار بازیابی می‌شود).
                      </div>
                    `}
                    ${renderQuestionNoteBoxHtml(item.id, 'nb')}
                    ${renderQuestionTagBarHtml(item.id, item.examTitle, item.subjectName, item.q, 'nb')}
                  ` : ''}
                </article>
              `;
            }).join('')}
          </div>
        `}
      `;
    } else if (selectedMainTitle) {
      // سطح ۲: نمایش سرفصل‌ها / مباحث زیر عنوان اصلی انتخاب‌شده
      const subExams = getExamsForMainTitle(selectedMainTitle);
      const topics = getMainTitleTopicsBreakdown(selectedMainTitle);
      const allMainQs = topics.flatMap(c => c.questions || []);
      const totalSubjQ = allMainQs.length;
      const mainProg = calcQuestionsProgressStats(allMainQs, progMap);
      const mainFilteredCount = filterQuestionsByPracticeMode(allMainQs, examTopicFilter, progMap).length;
      const encMain = encodeURIComponent(selectedMainTitle);
      const anyLocked = topics.some(ch => ch.hasPremium) && !userIsVip;

      mainBodyHtml = `
        <div class="ex-breadcrumb">
          <button type="button" class="ex-crumb-btn" onclick="selectMainTitleEnc('')">→ بازگشت به عناوین اصلی</button>
          <span>›</span>
          <span class="ex-crumb-btn active">📘 ${esc(selectedMainTitle)} (${toFa(totalSubjQ)} سوال · ${toFa(topics.length)} سرفصل)</span>
          ${window.isAdmin ? `
            <div class="row" style="gap:6px; margin-right:auto; flex-wrap:wrap;">
              <button type="button" class="btn small primary" onclick="openMultiExamFileImportModal('${esc(selectedMainTitle)}')">📥 افزودن فایل زیر این عنوان</button>
              <button type="button" class="btn small" onclick="adminRenameMainTitle('${encMain}')">✎ تغییر عنوان اصلی</button>
            </div>
          ` : ''}
        </div>

        ${!totalSubjQ ? `
          <div class="empty-glass-card" style="margin:24px auto;">
            <div class="empty-icon">📑</div>
            <h3>هنوز سوالی زیر «${esc(selectedMainTitle)}» ثبت نشده است</h3>
            ${window.isAdmin ? `<div style="margin-top:14px;"><button type="button" class="btn primary" onclick="openMultiExamFileImportModal('${esc(selectedMainTitle)}')">📥 ورود فایل اکسل/CSV برای این عنوان</button></div>` : ''}
          </div>
        ` : `
          <div class="ex-filter-bar">
            <span class="ex-filter-lbl">🎯 فیلتر سوالات تمرین:</span>
            <button type="button" class="btn small ${examTopicFilter === 'all' ? 'primary' : ''}" onclick="setExamTopicFilter('all')">همه سوالات (${toFa(totalSubjQ)})</button>
            <button type="button" class="btn small ${examTopicFilter === 'unseen' ? 'primary' : ''}" onclick="setExamTopicFilter('unseen')">🆕 پاسخ‌داده‌نشده‌ها (${toFa(mainProg.unseen)})</button>
            <button type="button" class="btn small ${examTopicFilter === 'wrong' ? 'primary' : ''}" onclick="setExamTopicFilter('wrong')">❌ اشتباهات اخیر (${toFa(mainProg.wrong)})</button>
          </div>

          <div class="surface-box" style="padding:14px; border-radius:14px; margin-bottom:14px;">
            <div class="row between" style="gap:10px; flex-wrap:wrap;">
              <div style="flex:1; min-width:220px;">
                <b style="font-size:15px;">📘 آزمون کامل «${esc(selectedMainTitle)}»</b>
                <div class="muted small" style="margin-top:3px;">
                  ${examTopicFilter === 'all'
                    ? `${toFa(totalSubjQ)} سوال در ${toFa(topics.length)} سرفصل · زمان خودکار: ${toFa(calcExamDurationMin(totalSubjQ))} دقیقه`
                    : `فیلتر فعال: ${toFa(mainFilteredCount)} سوال از ${toFa(totalSubjQ)} · زمان خودکار: ${toFa(calcExamDurationMin(mainFilteredCount))} دقیقه`}
                </div>
                <div style="margin-top:8px; max-width:440px;">${renderProgressStripHtml(mainProg, false)}</div>
              </div>
              <div class="row" style="gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn primary" ${mainFilteredCount ? '' : 'disabled'} onclick="openMainTitleRunner('${encMain}', 'exam', '', '${examTopicFilter}')">${anyLocked ? '🔒 ' : '⏱ '}آزمون زمان‌دار کل${examTopicFilter !== 'all' ? ` (${toFa(mainFilteredCount)})` : ''}</button>
                <button type="button" class="btn" ${mainFilteredCount ? '' : 'disabled'} onclick="openMainTitleRunner('${encMain}', 'study', '', '${examTopicFilter}')">${anyLocked ? '🔒 ' : '📖 '}حالت آمادگی کل${examTopicFilter !== 'all' ? ` (${toFa(mainFilteredCount)})` : ''}</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <div style="font-size:13.5px; font-weight:800; color:var(--text); margin-bottom:8px;">📑 سرفصل‌ها و مباحث «${esc(selectedMainTitle)}» (${toFa(topics.length)} سرفصل):</div>
            <div class="ex-topic-grid">
              ${topics.map(ch => {
                const encCh = encodeURIComponent(ch.name);
                const chProg = calcQuestionsProgressStats(ch.questions, progMap);
                const chFilteredCount = filterQuestionsByPracticeMode(ch.questions, examTopicFilter, progMap).length;
                const chRunCount = examTopicFilter === 'all' ? ch.questions.length : chFilteredCount;
                const chMin = calcExamDurationMin(chRunCount || ch.questions.length);
                const chLocked = ch.hasPremium && !userIsVip;
                return `
                  <div class="ex-topic-card" style="${examTopicFilter !== 'all' && !chFilteredCount ? 'opacity:.62;' : ''}">
                    <div class="row between" style="gap:6px;">
                      <b style="font-size:14px; color:var(--text);">📑 ${esc(ch.name)}</b>
                      <span class="pill ${chRunCount ? 'done' : ''}">${toFa(chRunCount)} سوال · ${toFa(chMin)} د</span>
                    </div>
                    ${renderProgressStripHtml(chProg, true)}
                    ${ch.hasPremium ? `<div><span class="ex-vip-badge">⭐ ویژه VIP</span></div>` : ''}
                    <div class="row" style="gap:6px; flex-wrap:wrap; margin-top:auto;">
                      <button type="button" class="btn small primary" style="flex:1; justify-content:center;" ${chRunCount ? '' : 'disabled'} onclick="openMainTitleRunner('${encMain}', 'exam', '${encCh}', '${examTopicFilter}')">${chLocked ? '🔒 ' : '⏱ '}زمان‌دار</button>
                      <button type="button" class="btn small" style="flex:1; justify-content:center;" ${chRunCount ? '' : 'disabled'} onclick="openMainTitleRunner('${encMain}', 'study', '${encCh}', '${examTopicFilter}')">${chLocked ? '🔒 ' : '📖 '}حالت آمادگی</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `}

        ${window.isAdmin ? `
          <details class="surface-box" style="padding:12px 14px; border-radius:14px;">
            <summary style="cursor:pointer; font-weight:800; font-size:13px;">⚙️ مدیریت فایل‌ها و آزمون‌های زیر «${esc(selectedMainTitle)}» (${toFa(subExams.length)})</summary>
            <div class="exams-grid" style="margin-top:12px;">
              ${subExams.map(renderAdminFileCardHtml).join('')}
            </div>
          </details>
        ` : ''}
      `;
    } else {
      // سطح ۱: فقط عناوین اصلی (تمیز و خلوت)
      mainBodyHtml = `
        ${groupsAll.length > 3 ? `
          <div style="margin-bottom:12px;">
            <input id="examHubSearchInp" value="${esc(examHubQuery)}" placeholder="جستجوی عنوان اصلی یا نام سرفصل..." style="width:100%; max-width:380px;" oninput="setExamHubFilters('q', this.value)">
          </div>
        ` : ''}

        ${!filteredGroups.length ? `
          <div class="empty-glass-card" style="margin:24px auto;">
            <div class="empty-icon">📝</div>
            <h3>${groupsAll.length ? 'عنوانی با این جستجو پیدا نشد' : 'هنوز آزمونی بارگذاری نشده است'}</h3>
            <p>${groupsAll.length ? 'عبارت جستجو را تغییر دهید.' : 'مدیر می‌تواند با انتخاب عنوان اصلی و فایل CSV/اکسل اولین آزمون را وارد کند.'}</p>
            ${window.isAdmin ? `<div style="margin-top:16px;"><button type="button" class="btn primary" onclick="openMultiExamFileImportModal()">📥 ورود فایل اکسل / CSV</button></div>` : ''}
          </div>
        ` : `
          <div class="ex-folder-grid">
            ${filteredGroups.map(g => {
              const encName = encodeURIComponent(g.name);
              const locked = g.hasPremium && !userIsVip;
              const autoMin = calcExamDurationMin(g.totalQ);
              const gAllQs = g.topics.flatMap(t => t.questions || []);
              const gProg = calcQuestionsProgressStats(gAllQs, progMap);
              return `
                <button type="button" class="ex-folder-card" style="${g.allHidden ? 'opacity:.82; border-style:dashed; border-color:var(--danger,#dc2626);' : ''}" onclick="selectMainTitleEnc('${encName}')">
                  <div class="row between" style="width:100%; gap:6px;">
                    <span class="ex-f-icon">${locked ? '🔒' : '📘'}</span>
                    <span class="pill ${g.totalQ ? 'done' : ''}">${toFa(g.topics.length)} سرفصل · ${toFa(g.totalQ)} سوال</span>
                  </div>
                  <div class="ex-f-title">${esc(g.name)}</div>
                  ${g.topics.length ? `<div class="ex-f-meta" style="color:var(--text); opacity:.78;">سرفصل‌ها: ${esc(g.topics.slice(0, 3).map(t => t.name).join(' · '))}${g.topics.length > 3 ? ' ...' : ''}</div>` : ''}
                  ${renderProgressStripHtml(gProg, true)}
                  <div class="row" style="gap:6px; flex-wrap:wrap;">
                    ${g.hasPremium ? `<span class="ex-vip-badge">⭐ ویژه VIP</span>` : ''}
                    ${g.allHidden ? `<span class="ex-vis-badge hid">🙈 مخفی (فقط مدیر)</span>` : ''}
                  </div>
                  <div class="ex-f-meta">⏱ ${toFa(autoMin)} دقیقه · برای مشاهده سرفصل‌ها کلیک کنید ←</div>
                </button>
              `;
            }).join('')}
          </div>
        `}
      `;
    }

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>📝 سامانه آزمون‌های حقوقی</h2>
            <div class="muted small">عنوان اصلی را انتخاب کنید تا سرفصل‌ها و دو حالت زمان‌دار (۲ دقیقه/سوال) و آمادگی بدون تایمر باز شود</div>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn small ${examHubSection === 'notebook' ? 'primary' : ''}" onclick="setExamHubSection('${examHubSection === 'notebook' ? 'exams' : 'notebook'}')">
              ${examHubSection === 'notebook' ? '📚 بازگشت به آزمون‌ها' : `📓 دفترچه نکات (${toFa(nbCounts.all)})`}
            </button>
            ${window.isAdmin ? `<button type="button" class="btn small primary" onclick="openMultiExamFileImportModal('${selectedMainTitle ? esc(selectedMainTitle) : ''}')">📥 ورود فایل اکسل/CSV</button>` : ''}
            ${window.isAdmin ? `<button type="button" class="btn small" onclick="openExamMetaModal()">＋ ساخت دستی</button>` : ''}
            <button type="button" class="btn small" onclick="forceFullExamSync()">🔄 همگام‌سازی</button>
          </div>
        </div>

        ${mainBodyHtml}
      </div>

      ${resultsAll.length ? `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>📊 کارنامه‌ها و گزارش‌های من</h2>
              <div class="muted small">شامل کارنامه آزمون‌های زمان‌دار و گزارش تصحیح‌شده حالت آمادگی (حذف سوابق فقط توسط مدیر مجاز است)</div>
            </div>
            <div class="row" style="gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn small ${studentResultsModeFilter === 'all' ? 'primary' : ''}" onclick="setStudentResultsModeFilter('all')">همه (${toFa(resultsAll.length)})</button>
              <button type="button" class="btn small ${studentResultsModeFilter === 'timed' ? 'primary' : ''}" onclick="setStudentResultsModeFilter('timed')">⏱ زمان‌دار (${toFa(resultsTimedCount)})</button>
              <button type="button" class="btn small ${studentResultsModeFilter === 'prep' ? 'primary' : ''}" onclick="setStudentResultsModeFilter('prep')">📖 حالت آمادگی (${toFa(resultsPrepCount)})</button>
            </div>
          </div>
          <div style="display:grid; gap:10px;">
            ${resultsFiltered.length ? resultsFiltered.slice(0, 25).map(r => {
              const isPrep = r.mode === 'prep';
              return `
                <div class="row between surface-box" style="padding:12px 16px; border-radius:14px; flex-wrap:wrap; gap:10px;">
                  <div>
                    <div class="row" style="gap:6px; flex-wrap:wrap; align-items:center;">
                      <b style="font-size:14.5px; color:var(--text);">${esc(r.examTitle)} ${r.scopeLabel ? '· ' + esc(r.scopeLabel) : ''}</b>
                      <span class="ex-mode-badge ${isPrep ? 'prep' : 'timed'}">${isPrep ? '📖 حالت آمادگی' : '⏱ زمان‌دار'}</span>
                    </div>
                    <div class="muted small" style="margin-top:3px;">
                      ${esc(r.dateLabel || '')} · صحیح: <b>${toFa(r.correct)}</b> · غلط: <b>${toFa(r.wrong)}</b> · نزده: <b>${toFa(r.blank)}</b> از ${toFa(r.total)}
                    </div>
                  </div>
                  <div class="row" style="gap:8px; flex-wrap:wrap;">
                    <span class="pill">خام: ${toFa(r.rawPct)}٪</span>
                    <span class="pill done">تراز: ${toFa(r.netPct)}٪</span>
                    <button type="button" class="btn small primary" onclick="openPastAttemptReview('${r.id}')">👁 پاسخ‌برگ (درست و غلط‌ها)</button>
                  </div>
                </div>
              `;
            }).join('') : '<div class="muted small surface-box">موردی در این دسته‌بندی ثبت نشده است.</div>'}
          </div>
        </div>
      ` : ''}
    `;

    if (prevFocusId) {
      const ref = document.getElementById(prevFocusId);
      if (ref) {
        ref.focus();
        if (prevSelEnd !== null && typeof ref.setSelectionRange === 'function') {
          try { ref.setSelectionRange(prevSelEnd, prevSelEnd); } catch (e) {}
        }
      }
    }
  };

  // --- محیط اختصاصی مدیر برای مدیریت آزمون‌ها، نمایش/عدم نمایش، ورود فایل و حذف نتایج ---
  let adminExamsSubTab = 'list';
  let adminExamsMainFilter = 'all';
  const adminExamsCollapsedGroups = {};

  window.setAdminExamsSubTab = function(tabName) {
    adminExamsSubTab = tabName || 'list';
    window.renderAdminExamsList();
  };

  window.setAdminExamsMainFilterEnc = function(encName) {
    adminExamsMainFilter = encName === 'all' ? 'all' : decodeURIComponent(encName || 'all');
    window.renderAdminExamsList();
  };

  window.toggleAdminExamsGroupEnc = function(encName) {
    const name = decodeURIComponent(encName || '');
    if (!name) return;
    adminExamsCollapsedGroups[name] = !adminExamsCollapsedGroups[name];
    window.renderAdminExamsList();
  };

  window.adminToggleAllExamGroups = function(collapseAll) {
    const exams = window.getExams();
    const names = [...new Set(exams.map(getExamMainTitle))];
    names.forEach(n => { adminExamsCollapsedGroups[n] = !!collapseAll; });
    window.renderAdminExamsList();
  };

  window.adminSetGroupPublished = async function(encMainTitle, shouldPublish) {
    if (!window.isAdmin) return;
    const mainTitle = decodeURIComponent(encMainTitle || '');
    if (!mainTitle) return;
    const list = window.getExams();
    const targets = list.filter(ex => getExamMainTitle(ex) === mainTitle && (ex.isPublished !== false) !== !!shouldPublish);
    if (!targets.length) {
      if (typeof toast === 'function') toast(shouldPublish ? 'همه آزمون‌های این عنوان از قبل منتشر شده‌اند.' : 'همه آزمون‌های این عنوان از قبل مخفی هستند.');
      return;
    }
    const actionTxt = shouldPublish ? 'منتشر و برای همه کاربران فعال' : 'مخفی (فقط مدیر)';
    if (!confirm(`آیا همه ${toFa(targets.length)} آزمون زیر عنوان «${mainTitle}» ${actionTxt} شوند؟`)) return;
    const nowIso = new Date().toISOString();
    targets.forEach(ex => {
      ex.isPublished = !!shouldPublish;
      ex.updatedAt = nowIso;
    });
    await persistExamsList(list, `${toFa(targets.length)} آزمون زیر عنوان «${mainTitle}» ${shouldPublish ? 'منتشر شدند ✓' : 'مخفی شدند.'}`);
  };

  window.toggleExamPremium = async function(examId) {
    if (!window.isAdmin) return;
    const list = window.getExams();
    const target = list.find(x => x.id === examId);
    if (!target) return;
    target.isPremium = !target.isPremium;
    target.updatedAt = new Date().toISOString();
    await persistExamsList(list, target.isPremium ? 'آزمون به حالت ویژه (VIP) تغییر یافت.' : 'آزمون به حالت رایگان تغییر یافت.');
  };

  window.adminAddVipSubscriber = async function() {
    if (!window.isAdmin) return;
    const email = String(document.getElementById('admVipEmailInp')?.value || '').trim().toLowerCase();
    const days = Number(toEn(document.getElementById('admVipDaysInp')?.value || '30')) || 30;
    const note = String(document.getElementById('admVipNoteInp')?.value || '').trim();
    if (!email || !email.includes('@')) return alert('ایمیل معتبر وارد کنید.');
    const cfg = getVipSettings();
    const expDate = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : '';
    const existing = cfg.subscribers.find(s => String(s.email || '').toLowerCase() === email);
    if (existing) {
      existing.active = true;
      existing.expiresAt = expDate;
      if (note) existing.note = note;
    } else {
      cfg.subscribers.unshift({ email, active: true, expiresAt: expDate, note, addedAt: new Date().toISOString() });
    }
    await saveVipSettings(cfg, 'اشتراک ویژه برای ' + email + ' فعال شد.');
  };

  window.adminExtendVipSubscriber = async function(encEmail, addDays) {
    if (!window.isAdmin) return;
    const email = decodeURIComponent(encEmail || '').toLowerCase();
    const cfg = getVipSettings();
    const target = cfg.subscribers.find(s => String(s.email || '').toLowerCase() === email);
    if (!target) return;
    const baseMs = (target.expiresAt && Date.parse(target.expiresAt) > Date.now()) ? Date.parse(target.expiresAt) : Date.now();
    target.expiresAt = new Date(baseMs + (Number(addDays) || 30) * 86400000).toISOString();
    target.active = true;
    await saveVipSettings(cfg, 'اشتراک ' + email + ' به مدت ' + toFa(addDays || 30) + ' روز تمدید شد.');
  };

  window.adminToggleVipSubscriber = async function(encEmail) {
    if (!window.isAdmin) return;
    const email = decodeURIComponent(encEmail || '').toLowerCase();
    const cfg = getVipSettings();
    const target = cfg.subscribers.find(s => String(s.email || '').toLowerCase() === email);
    if (!target) return;
    target.active = target.active === false;
    await saveVipSettings(cfg, target.active ? 'اشتراک فعال شد.' : 'اشتراک غیرفعال شد.');
  };

  window.adminDeleteVipSubscriber = async function(encEmail) {
    if (!window.isAdmin) return;
    const email = decodeURIComponent(encEmail || '').toLowerCase();
    if (!confirm('این کاربر از فهرست اشتراک ویژه حذف شود؟')) return;
    const cfg = getVipSettings();
    cfg.subscribers = cfg.subscribers.filter(s => String(s.email || '').toLowerCase() !== email);
    await saveVipSettings(cfg, 'کاربر از فهرست VIP حذف شد.');
  };

  window.adminSaveVipMessage = async function() {
    if (!window.isAdmin) return;
    const cfg = getVipSettings();
    cfg.upgradeMessage = String(document.getElementById('admVipMsgInp')?.value || '').trim();
    cfg.supportContact = String(document.getElementById('admVipContactInp')?.value || '').trim();
    await saveVipSettings(cfg, 'پیام و اطلاعات فعال‌سازی اشتراک ذخیره شد.');
  };

  window.renderAdminExamsList = function() {
    injectExamUpgradeStyles();
    const box = document.getElementById('admExamsList');
    if (!box) return;
    const exams = window.getExams();
    const vipCfg = getVipSettings();

    // دسته‌بندی منظم همه آزمون‌ها بر اساس عنوان اصلی (هر عنوان اصلی در بخش جداگانه)
    const groupedMap = new Map();
    exams.forEach(ex => {
      const mainT = getExamMainTitle(ex);
      if (!groupedMap.has(mainT)) {
        groupedMap.set(mainT, { name: mainT, items: [], totalQ: 0, pubCount: 0, hidCount: 0 });
      }
      const g = groupedMap.get(mainT);
      g.items.push(ex);
      g.totalQ += totalQuestionsCount(ex);
      if (ex.isPublished !== false) g.pubCount++;
      else g.hidCount++;
    });
    const groups = [...groupedMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    if (adminExamsMainFilter !== 'all' && !groupedMap.has(adminExamsMainFilter)) {
      adminExamsMainFilter = 'all';
    }
    const visibleGroups = adminExamsMainFilter === 'all'
      ? groups
      : groups.filter(g => g.name === adminExamsMainFilter);
    const anyExpanded = visibleGroups.some(g => !adminExamsCollapsedGroups[g.name]);

    const renderAdminExamRowHtml = (ex) => {
      const qCount = totalQuestionsCount(ex);
      const autoMin = calcExamDurationMin(qCount);
      const isPub = ex.isPublished !== false;
      const mainT = getExamMainTitle(ex);
      const topicsNames = [...new Set((ex.subjects || []).flatMap(sb => (sb.questions || []).map(q => q.chapter || ex.topicTitle || sb.name)).filter(Boolean))];
      return `
        <div class="row between admin-list-row" style="flex-wrap:wrap; gap:8px;">
          <div>
            <div class="row" style="gap:6px; flex-wrap:wrap; align-items:center;">
              <b style="font-size:13.5px;">${esc(ex.title || mainT)}</b>
              ${ex.isPremium ? `<span class="ex-vip-badge">⭐ ویژه VIP</span>` : `<span class="pill">رایگان</span>`}
              <span class="ex-vis-badge ${isPub ? 'pub' : 'hid'}">${isPub ? 'منتشرشده' : 'مخفی (فقط مدیر)'}</span>
            </div>
            <div class="muted small" style="margin-top:4px;">
              ${topicsNames.length ? `سرفصل‌ها: <b>${esc(topicsNames.slice(0, 4).join(' · '))}${topicsNames.length > 4 ? ' ...' : ''}</b> · ` : ''}${toFa(qCount)} سوال · ⏱ ${toFa(autoMin)} دقیقه خودکار
            </div>
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn small primary" onclick="openExamQuestionsEditor('${ex.id}')">📝 سوالات و ویرایش تکی</button>
            <button type="button" class="btn small" onclick="toggleExamPremium('${ex.id}')">${ex.isPremium ? '⭐ ویژه' : '🆓 رایگان'}</button>
            <button type="button" class="btn small ${isPub ? '' : 'primary'}" onclick="toggleExamPublished('${ex.id}')">${isPub ? '🙈 مخفی' : '👁 انتشار'}</button>
            <button type="button" class="btn small" onclick="openExamBulkImportModal('${ex.id}')">📥 ورود فایل</button>
            <button type="button" class="btn small" onclick="openExamMetaModal('${ex.id}')">✎ عنوان/مبحث</button>
            <button type="button" class="btn small" onclick="exportExamJson('${ex.id}')">📤 JSON</button>
            <button type="button" class="btn small danger" onclick="deleteExam('${ex.id}')">✕ حذف</button>
          </div>
        </div>
      `;
    };

    const filterBarHtml = groups.length > 1 ? `
      <div class="adm-exam-filter-bar">
        <span class="muted small" style="font-weight:800; margin-left:4px;">📂 تفکیک عنوان اصلی:</span>
        <button type="button" class="ex-crumb-btn ${adminExamsMainFilter === 'all' ? 'active' : ''}" onclick="setAdminExamsMainFilterEnc('all')">همه عناوین (${toFa(exams.length)})</button>
        ${groups.map(g => `
          <button type="button" class="ex-crumb-btn ${adminExamsMainFilter === g.name ? 'active' : ''}" onclick="setAdminExamsMainFilterEnc('${encodeURIComponent(g.name)}')">${esc(g.name)} (${toFa(g.items.length)})</button>
        `).join('')}
      </div>
    ` : '';

    const examsHtml = !exams.length
      ? '<div class="muted small surface-box">هنوز آزمونی ثبت نشده است. با دکمه «ورود فایل اکسل / CSV» یا «ساخت دستی» آزمون اضافه کنید.</div>'
      : `${filterBarHtml}<div style="display:grid; gap:14px;">${visibleGroups.map(g => {
          const encName = encodeURIComponent(g.name);
          const isCollapsed = adminExamsMainFilter === 'all' && !!adminExamsCollapsedGroups[g.name];
          const themeIdx = hashSubjectColorIdx(g.name);
          const sortedItems = g.items.slice().sort((a, b) => {
            const pa = a.isPublished !== false ? 0 : 1;
            const pb = b.isPublished !== false ? 0 : 1;
            if (pa !== pb) return pa - pb;
            return String(a.title || '').localeCompare(String(b.title || ''), 'fa');
          });
          return `
            <section class="adm-exam-group ${isCollapsed ? 'collapsed' : ''}">
              <div class="adm-exam-group-head baraat-subj-theme-${themeIdx}">
                <button type="button" class="adm-exam-group-toggle" onclick="toggleAdminExamsGroupEnc('${encName}')">
                  <span style="font-size:12px; opacity:.8;">${isCollapsed ? '◀' : '▼'}</span>
                  <span class="adm-exam-group-title">📘 ${esc(g.name)}</span>
                  <span class="pill done">${toFa(g.items.length)} فایل/آزمون · ${toFa(g.totalQ)} سوال</span>
                  ${g.pubCount ? `<span class="ex-vis-badge pub">${toFa(g.pubCount)} منتشرشده</span>` : ''}
                  ${g.hidCount ? `<span class="ex-vis-badge hid">${toFa(g.hidCount)} مخفی</span>` : ''}
                </button>
                <div class="row" style="gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn small primary" onclick="openMultiExamFileImportModal('${esc(g.name)}')">📥 افزودن فایل</button>
                  ${g.hidCount ? `<button type="button" class="btn small" onclick="adminSetGroupPublished('${encName}', true)">👁 انتشار همه</button>` : ''}
                  ${g.pubCount ? `<button type="button" class="btn small" onclick="adminSetGroupPublished('${encName}', false)">🙈 مخفی همه</button>` : ''}
                  <button type="button" class="btn small" onclick="adminRenameMainTitle('${encName}')">✎ تغییر عنوان</button>
                </div>
              </div>
              <div class="adm-exam-group-body">
                ${sortedItems.map(renderAdminExamRowHtml).join('')}
              </div>
            </section>
          `;
        }).join('')}</div>`;

    if (adminExamsSubTab === 'subjects') adminExamsSubTab = 'list';
    const subTabsHtml = `
      <div class="adm-subtab-bar">
        <button type="button" class="adm-subtab-btn ${adminExamsSubTab === 'list' ? 'active' : ''}" onclick="setAdminExamsSubTab('list')">فهرست آزمون‌ها و فایل‌ها (${toFa(exams.length)})</button>
        <button type="button" class="adm-subtab-btn ${adminExamsSubTab === 'vip' ? 'active' : ''}" onclick="setAdminExamsSubTab('vip')">⭐ اشتراک ویژه (${toFa(vipCfg.subscribers.length)})</button>
        <button type="button" class="adm-subtab-btn ${adminExamsSubTab === 'attempts' ? 'active' : ''}" onclick="setAdminExamsSubTab('attempts')">کارنامه‌ها و آمادگی (${toFa(adminAttemptsCache.length)})</button>
        <button type="button" class="adm-subtab-btn ${adminExamsSubTab === 'tags' ? 'active' : ''}" onclick="setAdminExamsSubTab('tags')">تیک‌های دانشجویان (${toFa(adminStudentTagsCache.length)})</button>
        <button type="button" class="adm-subtab-btn ${adminExamsSubTab === 'security' ? 'active' : ''}" onclick="setAdminExamsSubTab('security')">امنیت و ایمیل</button>
      </div>
    `;

    let bodySection = '';
    if (adminExamsSubTab === 'list') {
      bodySection = `
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn small primary" onclick="openMultiExamFileImportModal()">📥 ورود فایل اکسل / CSV</button>
            <button type="button" class="btn small" onclick="openExamMetaModal()">＋ ساخت دستی آزمون</button>
            ${groups.length > 1 && adminExamsMainFilter === 'all' ? `<button type="button" class="btn small" onclick="adminToggleAllExamGroups(${anyExpanded ? 'true' : 'false'})">${anyExpanded ? '▲ جمع کردن همه بخش‌ها' : '▼ باز کردن همه بخش‌ها'}</button>` : ''}
          </div>
          ${exams.length ? `<button type="button" class="btn small danger" onclick="deleteAllExams()">🗑 حذف همه (${toFa(exams.length)})</button>` : ''}
        </div>
        ${examsHtml}
      `;
    } else if (adminExamsSubTab === 'vip') {
      bodySection = `
        <div class="surface-box" style="padding:12px; border-radius:12px; margin-bottom:12px;">
          <b style="display:block; font-size:13px; margin-bottom:8px;">➕ افزودن یا تمدید عضو دارای اشتراک ویژه (VIP)</b>
          <div class="form-grid" style="grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:8px;">
            <input id="admVipEmailInp" type="email" dir="ltr" placeholder="student@email.com">
            <input id="admVipDaysInp" type="number" min="0" value="30" placeholder="مدت (روز - ۰ برای نامحدود)">
            <input id="admVipNoteInp" placeholder="یادداشت (اختیاری)">
            <button type="button" class="btn small primary" onclick="adminAddVipSubscriber()">✓ فعال‌سازی اشتراک</button>
          </div>
        </div>
        <div style="display:grid; gap:8px; margin-bottom:14px;">
          ${!vipCfg.subscribers.length ? '<div class="muted small surface-box">هنوز کاربری در فهرست اشتراک ویژه ثبت نشده است.</div>' : vipCfg.subscribers.map(sub => {
            const enc = encodeURIComponent(sub.email || '');
            const expTxt = sub.expiresAt ? formatJalaliFull(new Date(sub.expiresAt)).numericFa : 'نامحدود';
            const expired = !!(sub.expiresAt && Date.parse(sub.expiresAt) < Date.now());
            const isAct = sub.active !== false && !expired;
            return `
              <div class="row between admin-list-row" style="flex-wrap:wrap; gap:8px;">
                <div>
                  <b dir="ltr">${esc(sub.email)}</b>
                  <span class="ex-vis-badge ${isAct ? 'pub' : 'hid'}" style="margin-right:6px;">${isAct ? 'فعال' : (expired ? 'منقضی' : 'غیرفعال')}</span>
                  <div class="muted small" style="margin-top:2px;">اعتبار تا: <b>${esc(expTxt)}</b>${sub.note ? ' · ' + esc(sub.note) : ''}</div>
                </div>
                <div class="row" style="gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn small" onclick="adminExtendVipSubscriber('${enc}', 30)">＋۳۰ روز</button>
                  <button type="button" class="btn small" onclick="adminToggleVipSubscriber('${enc}')">${sub.active === false ? 'فعال‌سازی' : 'تعلیق'}</button>
                  <button type="button" class="btn small danger" onclick="adminDeleteVipSubscriber('${enc}')">✕ حذف</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="surface-box" style="padding:12px; border-radius:12px;">
          <b style="display:block; font-size:13px; margin-bottom:8px;">💬 پیام قفل آزمون ویژه و راه ارتباطی</b>
          <div class="field" style="margin-bottom:8px;">
            <label>پیام نمایش داده‌شده به کاربران بدون اشتراک</label>
            <textarea id="admVipMsgInp" rows="2">${esc(vipCfg.upgradeMessage)}</textarea>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <input id="admVipContactInp" value="${esc(vipCfg.supportContact)}" placeholder="شماره تماس، آیدی تلگرام یا لینک پشتیبانی..." style="flex:1; min-width:200px;">
            <button type="button" class="btn small primary" onclick="adminSaveVipMessage()">💾 ذخیره پیام</button>
          </div>
        </div>
      `;
    } else if (adminExamsSubTab === 'attempts') {
      bodySection = `
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <div class="muted small">مشاهده کارنامه آزمون‌های زمان‌دار و گزارش تصحیح‌شده حالت آمادگی دانشجویان (با حذف کارنامه، نکات دانشجو حفظ می‌شود).</div>
          <button type="button" class="btn small" onclick="refreshAdminExamAttempts()">🔄 بروزرسانی</button>
        </div>
        <div id="admExamAttemptsBox">${renderAdminAttemptsInnerHtml()}</div>
      `;
    } else if (adminExamsSubTab === 'tags') {
      bodySection = `
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <div class="muted small">سوالات تیک‌خورده توسط دانشجویان به همراه شماره ردیف CSV هر سوال (فقط مدیر).</div>
          <button type="button" class="btn small" onclick="refreshAdminExamAttempts()">🔄 بروزرسانی</button>
        </div>
        <div id="admExamTagsBox">${renderAdminStudentTagsInnerHtml()}</div>
      `;
    } else {
      bodySection = `
        <div class="callout-warn" style="padding:12px 14px; border-style:dashed; border-radius:12px;">
          <b style="font-size:12.5px;">🔒 قفل امنیتی آزمون‌های مخفی در سرور Supabase (RLS)</b>
          <p class="small" style="margin:8px 0; line-height:1.8;">
            آزمون‌های مخفی در کلید جداگانه <code>baraat_exams_private_v1</code> ذخیره می‌شوند. برای بستن دسترسی مستقیم API، این کد SQL را یک بار در SQL Editor پنل Supabase اجرا کنید:
          </p>
          <pre dir="ltr" class="surface-box" style="padding:10px; border-radius:8px; font-size:11px; overflow:auto;">ALTER TABLE public.meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lock_private_exams_meta" ON public.meta;
CREATE POLICY "lock_private_exams_meta" ON public.meta
AS RESTRICTIVE
FOR ALL
TO public
USING (key &lt;&gt; 'baraat_exams_private_v1' OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()))
WITH CHECK (key &lt;&gt; 'baraat_exams_private_v1' OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));</pre>
          <button type="button" class="btn small" onclick="copyPrivateExamsRlsSql()">📋 کپی دستور SQL</button>
        </div>
        <div class="callout-info" style="margin-top:12px; padding:12px 14px; border-style:dashed; border-radius:12px;">
          <b style="font-size:12.5px;">✉️ تنظیمات ارسال کد تأیید ایمیل (OTP) هنگام ثبت‌نام</b>
          <p class="small" style="margin:8px 0 0; line-height:1.8;">
            در پنل Supabase در مسیر <code>Authentication → Email Templates → Confirm signup</code> متغیر <code>{{ .Token }}</code> را قرار دهید و در <code>Providers → Email</code> گزینه <code>Confirm email</code> را فعال کنید.
          </p>
        </div>
      `;
    }

    box.innerHTML = subTabsHtml + bodySection;
    if (window.isAdmin && !adminAttemptsCache.length && !adminStudentTagsCache.length) {
      setTimeout(() => { if (window.refreshAdminExamAttempts) window.refreshAdminExamAttempts(); }, 100);
    }
  };

  window.copyPrivateExamsRlsSql = function() {
    const sqlText = [
      'ALTER TABLE public.meta ENABLE ROW LEVEL SECURITY;',
      'DROP POLICY IF EXISTS "lock_private_exams_meta" ON public.meta;',
      'CREATE POLICY "lock_private_exams_meta" ON public.meta',
      'AS RESTRICTIVE',
      'FOR ALL',
      'TO public',
      "USING (key <> 'baraat_exams_private_v1' OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()))",
      "WITH CHECK (key <> 'baraat_exams_private_v1' OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()));"
    ].join('\n');
    navigator.clipboard?.writeText(sqlText);
    if (typeof toast === 'function') toast('کد SQL قفل امنیتی کپی شد.');
  };

  window.openExamMetaModal = function(examId) {
    if (!window.isAdmin) { if (typeof toast === 'function') toast('فقط مدیر مجاز به مدیریت آزمون‌هاست.'); return; }
    const existing = examId ? window.getExams().find(x => x.id === examId) : null;
    const suggestions = getAllMainTitleSuggestions();
    const ex = existing || {
      id: 'ex_' + Date.now(),
      mainTitle: selectedMainTitle || '',
      topicTitle: '',
      title: '',
      category: EXAM_ORGS[0],
      org: EXAM_ORGS[0],
      isPremium: false,
      examType: EXAM_TYPES[0],
      year: 1404,
      durationMinutes: 60,
      negativeMarking: true,
      isPublished: true,
      description: '',
      subjects: [
        { id: 'es_' + Date.now() + '_1', name: 'سرفصل اول', questions: [] }
      ]
    };

    const m = document.getElementById('modal');
    if (!m) return;
    const curMainTitle = existing ? getExamMainTitle(existing) : (ex.mainTitle || '');
    m.innerHTML = `
      <h2>${existing ? '✏️ ویرایش عنوان اصلی و مشخصات' : '📝 ساخت دستی آزمون'}</h2>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1;">
          <label>عنوان اصلی * (این عنوان در صفحه اصلی آزمون‌ها نمایش داده می‌شود — هر عنوان دلخواه مثل: مدنی، جزا، آزمون وکالت ۱۴۰۳)</label>
          <input id="exMetaMainTitle" list="exMetaMainTitleList" value="${esc(curMainTitle)}" placeholder="مثلاً: حقوق مدنی یا آزمون وکالت ۱۴۰۳">
          <datalist id="exMetaMainTitleList">
            ${suggestions.map(s => `<option value="${esc(s)}">`).join('')}
          </datalist>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>عنوان مبحث / سرفصل (اختیاری — برای دسته‌بندی زیر عنوان اصلی)</label>
          <input id="exMetaTopicTitle" value="${esc(ex.topicTitle || '')}" placeholder="مثلاً: عقود معین، قصاص و دیات، یا خالی بگذارید">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>نام نمایشی فایل / آزمون (اختیاری — در صورت خالی بودن از عنوان اصلی و مبحث ساخته می‌شود)</label>
          <input id="exMetaTitle" value="${esc(ex.title || '')}" placeholder="اختیاری">
        </div>
        <div class="field">
          <label>نوع / منبع (اختیاری)</label>
          <input id="exMetaType" list="exMetaTypeList" value="${esc(getExamTypeLabel(ex))}" placeholder="مثلاً: تالیفی یا سراسری">
          <datalist id="exMetaTypeList">
            ${EXAM_TYPES.map(t => `<option value="${esc(t)}">`).join('')}
          </datalist>
        </div>
        <div class="field">
          <label>سال (شمسی)</label>
          <input id="exMetaYear" type="number" min="1370" max="1420" value="${Number(ex.year || 1404)}">
        </div>
        <div class="field" style="justify-content:end;">
          <label class="check" style="margin:0; cursor:pointer;">
            <input type="checkbox" id="exMetaNeg" ${ex.negativeMarking !== false ? 'checked' : ''}>
            <span>اعمال نمره منفی یک‌سوم</span>
          </label>
        </div>
        <div class="field" style="justify-content:end;">
          <label class="check" style="margin:0; cursor:pointer;">
            <input type="checkbox" id="exMetaVip" ${ex.isPremium ? 'checked' : ''}>
            <span>⭐ آزمون ویژه (فقط کاربران دارای اشتراک VIP)</span>
          </label>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label class="check" style="margin:0; cursor:pointer;">
            <input type="checkbox" id="exMetaPub" ${ex.isPublished !== false ? 'checked' : ''}>
            <span>نمایش این آزمون برای همه کاربران (در غیر این صورت فقط مدیر می‌بیند)</span>
          </label>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>توضیحات یا نکات راهنما (اختیاری)</label>
          <textarea id="exMetaDesc" rows="2" placeholder="بودجه‌بندی، مباحث، نکات منابع طرح سوال...">${esc(ex.description || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">انصراف</button>
        <button class="btn primary" onclick="submitExamMeta('${ex.id}', ${!!existing})">${existing ? 'ذخیره تغییرات' : 'ایجاد و ورود به مدیریت سوالات'}</button>
      </div>
    `;
    window.__tmpNewExamPreset = existing ? null : ex;
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitExamMeta = async function(examId, isEdit) {
    if (!window.isAdmin) return;
    const mainTitle = (document.getElementById('exMetaMainTitle')?.value || '').trim();
    if (!mainTitle) return alert('عنوان اصلی را وارد کنید.');
    const topicTitle = (document.getElementById('exMetaTopicTitle')?.value || '').trim();
    const rawTitle = (document.getElementById('exMetaTitle')?.value || '').trim();
    const title = rawTitle || (topicTitle ? (mainTitle + ' · ' + topicTitle) : mainTitle);
    const examType = (document.getElementById('exMetaType')?.value || '').trim() || 'تالیفی';
    const year = Number(toEn(document.getElementById('exMetaYear')?.value || '1404')) || 1404;
    const negativeMarking = !!document.getElementById('exMetaNeg')?.checked;
    const isPremium = !!document.getElementById('exMetaVip')?.checked;
    const isPublished = !!document.getElementById('exMetaPub')?.checked;
    const description = (document.getElementById('exMetaDesc')?.value || '').trim();

    const list = window.getExams();
    if (isEdit) {
      const target = list.find(x => x.id === examId);
      if (target) {
        const qTot = totalQuestionsCount(target);
        Object.assign(target, {
          mainTitle, topicTitle, title, org: mainTitle, category: mainTitle,
          isPremium, examType, year, durationMinutes: calcExamDurationMin(qTot),
          negativeMarking, isPublished, description, updatedAt: new Date().toISOString()
        });
      }
    } else {
      const preset = window.__tmpNewExamPreset || { id: examId, subjects: [] };
      if (topicTitle && Array.isArray(preset.subjects) && preset.subjects.length === 1) {
        preset.subjects[0].name = topicTitle;
      }
      const created = Object.assign({}, preset, {
        id: examId,
        mainTitle, topicTitle, title, org: mainTitle, category: mainTitle,
        isPremium, examType, year, durationMinutes: 60, negativeMarking, isPublished, description,
        updatedAt: new Date().toISOString()
      });
      list.unshift(created);
    }
    window.__tmpNewExamPreset = null;
    await persistExamsList(list, isEdit ? 'مشخصات آزمون ذخیره شد.' : 'آزمون ساخته شد.');
    if (isEdit) closeModal();
    else window.openExamQuestionsEditor(examId);
  };

  window.deleteExam = async function(examId) {
    if (!window.isAdmin) return;
    if (!confirm('این آزمون و تمام سوالات آن حذف شود؟')) return;
    const list = window.getExams().filter(x => x.id !== examId);
    await persistExamsList(list, 'آزمون حذف شد.');
  };

  window.deleteAllExams = async function() {
    if (!window.isAdmin) return;
    const list = window.getExams();
    if (!list.length) return;
    if (!confirm('آیا از حذف کامل تمام ' + toFa(list.length) + ' آزمون ثبت‌شده مطمئن هستید؟ نکات شخصی دانشجویان حفظ می‌شوند.')) return;
    await persistExamsList([], 'تمام آزمون‌ها با موفقیت حذف شدند.');
  };

  window.exportExamJson = function(examId) {
    if (!window.isAdmin) return;
    const ex = window.getExams().find(x => x.id === examId);
    if (!ex) return;
    const blob = new Blob([JSON.stringify(ex, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exam-${ex.year || 'baraat'}-${ex.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  let editingExamSubjId = null;
  let editingQuestionId = null;

  window.openExamQuestionsEditor = function(examId, subjId) {
    if (!window.isAdmin) return;
    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    if (!ex) return;
    ex.subjects = ex.subjects || [];
    if (!ex.subjects.length) {
      ex.subjects.push({ id: 'es_' + Date.now(), name: 'حقوق مدنی', questions: [] });
    }
    const curSubj = (subjId && ex.subjects.find(s => s.id === subjId)) || (editingExamSubjId && ex.subjects.find(s => s.id === editingExamSubjId)) || ex.subjects[0];
    editingExamSubjId = curSubj.id;
    const curQ = editingQuestionId ? (curSubj.questions || []).find(q => q.id === editingQuestionId) : null;

    const m = document.getElementById('modal');
    if (!m) return;
    m.innerHTML = `
      <div class="row between" style="gap:10px; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <h2 style="margin:0;">📝 مدیریت سوالات: ${esc(ex.title)}</h2>
          <div class="muted small">${esc(getExamCategory(ex))} · ${esc(getExamTypeLabel(ex))} · سال ${toFa(ex.year)} · کل سوالات: ${toFa(totalQuestionsCount(ex))}</div>
        </div>
        <button type="button" class="btn small" onclick="openExamBulkImportModal('${ex.id}')">📥 ورود گروهی سوالات</button>
      </div>

      <div class="surface-box" style="display:flex; flex-wrap:wrap; gap:6px; padding:10px; margin-bottom:14px;">
        ${ex.subjects.map(s => `
          <button type="button" class="btn small ${s.id === curSubj.id ? 'primary' : ''}" onclick="editingQuestionId=null;openExamQuestionsEditor('${ex.id}', '${s.id}')">
            ${esc(s.name)} (${toFa((s.questions || []).length)})
          </button>
        `).join('')}
        <button type="button" class="btn small" onclick="addExamSubjectPrompt('${ex.id}')">＋ درس جدید</button>
      </div>

      <div class="row between" style="gap:8px; margin-bottom:12px; flex-wrap:wrap;">
        <b style="font-size:14.5px; color:var(--main);">درس فعال: ${esc(curSubj.name)} (${toFa((curSubj.questions || []).length)} سوال)</b>
        <div class="row" style="gap:6px;">
          <button type="button" class="btn small" onclick="renameExamSubject('${ex.id}', '${curSubj.id}')">✎ تغییر نام درس</button>
          ${ex.subjects.length > 1 ? `<button type="button" class="btn small danger" onclick="deleteExamSubject('${ex.id}', '${curSubj.id}')">حذف درس</button>` : ''}
        </div>
      </div>

      <div class="callout-info" style="padding:14px; border-radius:14px; margin-bottom:16px;">
        <h4 style="margin:0 0 10px; color:var(--main);">${curQ ? '✎ ویرایش سوال انتخاب‌شده' : '＋ افزودن سوال تکی به «' + esc(curSubj.name) + '»'}</h4>
        <div class="form-grid" style="gap:8px;">
          <div class="field">
            <label>سرفصل / مبحث سوال (مثلاً: قصاص، اسناد تجاری)</label>
            <input id="eqChapter" value="${esc(curQ ? (curQ.chapter || '') : '')}" placeholder="اختیاری — برای دسته‌بندی بر اساس سرفصل">
          </div>
          <div class="field">
            <label>منبع / سال سوال (نمایش هنگام آزمون)</label>
            <input id="eqSourceLabel" value="${esc(curQ ? (curQ.sourceLabel || '') : '')}" placeholder="مثلاً: تالیفی یا ارشد ۹۸ یا آزمون وکلا ۱۴۰۰">
          </div>
          <div class="field" style="grid-column:1/-1;">
            <label>صورت سوال *</label>
            <textarea id="eqStem" rows="3" placeholder="متن کامل سوال حقوقی...">${esc(curQ ? curQ.q : '')}</textarea>
          </div>
          ${EXAM_LETTERS.map((lt, idx) => `
            <div class="field">
              <label>گزینه ${lt}</label>
              <input id="eqOpt${idx}" value="${esc(curQ && curQ.options ? (curQ.options[idx] || '') : '')}" placeholder="متن گزینه ${lt}">
            </div>
          `).join('')}
          <div class="field">
            <label>گزینه صحیح</label>
            <select id="eqAns">
              ${EXAM_LETTERS.map((lt, idx) => `<option value="${idx}" ${(curQ && Number(curQ.answer) === idx) ? 'selected' : ''}>گزینه ${lt}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>ماده قانونی / پاسخ تشریحی</label>
            <input id="eqExp" value="${esc(curQ ? (curQ.exp || '') : '')}" placeholder="توضیح مختصر یا مستند ماده...">
          </div>
        </div>
        <div class="row" style="gap:8px; margin-top:10px; justify-content:flex-end;">
          ${curQ ? `<button type="button" class="btn small" onclick="editingQuestionId=null;openExamQuestionsEditor('${ex.id}', '${curSubj.id}')">انصراف از ویرایش</button>` : ''}
          <button type="button" class="btn primary small" onclick="saveSingleExamQuestion('${ex.id}', '${curSubj.id}', '${curQ ? curQ.id : ''}')">${curQ ? 'بروزرسانی سوال' : 'ذخیره و افزودن سوال'}</button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <input id="eqAdminSearch" type="text" placeholder="🔍 جستجو در متن سوال، سرفصل یا شماره سوال / ردیف CSV..." oninput="filterAdminExamQuestionsList(this.value)" style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:10px; border:1px solid var(--line); background:var(--panel); color:var(--text); font-family:inherit; font-size:12.5px;">
      </div>

      <div id="eqAdminListBox" style="max-height:280px; overflow:auto; display:grid; gap:8px;">
        ${!(curSubj.questions || []).length
          ? '<div class="muted small">هنوز سوالی در این درس ثبت نشده است.</div>'
          : (() => {
              let subjOffset = 0;
              for (const sb of ex.subjects) {
                if (sb.id === curSubj.id) break;
                subjOffset += (sb.questions || []).length;
              }
              return (curSubj.questions || []).map((q, qi) => {
                const gIdx = subjOffset + qi + 1;
                const searchKey = toEn([q.q, q.chapter || '', q.sourceLabel || '', q.csvQuestionNum || '', q.csvRowIndex || '', q.csvFileName || '', String(qi + 1), String(gIdx)].join(' ').toLowerCase());
                return `
                  <div class="eq-admin-row-item" data-search="${esc(searchKey)}" style="padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:var(--panel); font-size:12.5px;">
                    <div class="row between" style="gap:8px; align-items:flex-start;">
                      <div>
                        <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                          <b>سوال ${toFa(qi + 1)}</b>
                          ${formatAdminCsvBadgeHtml(q, gIdx)}
                          ${q.csvFileName ? `<span class="muted small" dir="ltr">${esc(q.csvFileName)}</span>` : ''}
                          ${q.chapter ? `<span class="pill">${esc(q.chapter)}</span>` : ''}
                          ${formatExamSourceBadgeHtml(q.sourceLabel)}
                        </div>
                        <div>${esc(q.q)}</div>
                        <div class="muted small" style="margin-top:4px;">پاسخ: <b>گزینه ${EXAM_LETTERS[Number(q.answer) || 0]}</b>${q.exp ? ' · ' + esc(q.exp.slice(0, 80)) : ''}</div>
                      </div>
                      <div class="row" style="gap:4px; flex-shrink:0;">
                        <button type="button" class="btn small" onclick="editExamQuestion('${ex.id}', '${curSubj.id}', '${q.id}')">✎</button>
                        <button type="button" class="btn small danger" onclick="deleteExamQuestion('${ex.id}', '${curSubj.id}', '${q.id}')">✕</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('');
            })()}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn primary" onclick="closeModal()">بستن</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.filterAdminExamQuestionsList = function(val) {
    const q = toEn(String(val || '').trim().toLowerCase());
    const box = document.getElementById('eqAdminListBox');
    if (!box) return;
    box.querySelectorAll('.eq-admin-row-item').forEach(el => {
      const hay = (el.getAttribute('data-search') || '').toLowerCase();
      el.style.display = (!q || hay.includes(q)) ? '' : 'none';
    });
  };

  window.addExamSubjectPrompt = async function(examId) {
    const name = prompt('نام درس جدید را وارد کنید (مثلاً: حقوق ثبت):');
    if (!name || !name.trim()) return;
    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    if (!ex) return;
    const ns = { id: 'es_' + Date.now(), name: name.trim(), questions: [] };
    ex.subjects = ex.subjects || [];
    ex.subjects.push(ns);
    editingExamSubjId = ns.id;
    editingQuestionId = null;
    await persistExamsList(list, 'درس جدید به آزمون اضافه شد.');
    window.openExamQuestionsEditor(examId, ns.id);
  };

  window.renameExamSubject = async function(examId, subjId) {
    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    const subj = ex && (ex.subjects || []).find(s => s.id === subjId);
    if (!subj) return;
    const n = prompt('نام جدید درس:', subj.name);
    if (!n || !n.trim()) return;
    subj.name = n.trim();
    await persistExamsList(list, 'نام درس ویرایش شد.');
    window.openExamQuestionsEditor(examId, subjId);
  };

  window.deleteExamSubject = async function(examId, subjId) {
    if (!confirm('این درس و تمام سوالات آن از آزمون حذف شود؟')) return;
    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    if (!ex) return;
    ex.subjects = (ex.subjects || []).filter(s => s.id !== subjId);
    editingExamSubjId = ex.subjects[0] ? ex.subjects[0].id : null;
    editingQuestionId = null;
    await persistExamsList(list, 'درس حذف شد.');
    window.openExamQuestionsEditor(examId, editingExamSubjId);
  };

  window.editExamQuestion = function(examId, subjId, qId) {
    editingExamSubjId = subjId;
    editingQuestionId = qId;
    window.openExamQuestionsEditor(examId, subjId);
  };

  window.deleteExamQuestion = async function(examId, subjId, qId) {
    if (!confirm('این سوال حذف شود؟')) return;
    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    const subj = ex && (ex.subjects || []).find(s => s.id === subjId);
    if (!subj) return;
    subj.questions = (subj.questions || []).filter(q => q.id !== qId);
    await persistExamsList(list, 'سوال حذف شد.');
    window.openExamQuestionsEditor(examId, subjId);
  };

  window.saveSingleExamQuestion = async function(examId, subjId, qId) {
    const stem = (document.getElementById('eqStem')?.value || '').trim();
    if (!stem) return alert('صورت سوال را وارد کنید.');
    const options = EXAM_LETTERS.map((_, i) => (document.getElementById('eqOpt' + i)?.value || '').trim());
    if (options.filter(Boolean).length < 2) return alert('حداقل دو گزینه وارد کنید.');
    const answer = Number(document.getElementById('eqAns')?.value || 0);
    const exp = (document.getElementById('eqExp')?.value || '').trim();
    const chapter = (document.getElementById('eqChapter')?.value || '').trim();
    const sourceLabel = normalizeExamSourceTag(document.getElementById('eqSourceLabel')?.value || '');

    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    const subj = ex && (ex.subjects || []).find(s => s.id === subjId);
    if (!subj) return;
    subj.questions = subj.questions || [];
    if (qId) {
      const tq = subj.questions.find(q => q.id === qId);
      if (tq) Object.assign(tq, { q: stem, options, answer, exp, chapter, sourceLabel });
    } else {
      subj.questions.push({ id: 'eq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), q: stem, options, answer, exp, chapter, sourceLabel });
    }
    editingQuestionId = null;
    await persistExamsList(list, qId ? 'سوال بروزرسانی شد.' : 'سوال به درس اضافه شد.');
    window.openExamQuestionsEditor(examId, subjId);
  };

  // --- ورود گروهی هوشمند سوالات (متن ساده، اکسل/CSV، JSON با پشتیبانی فصل، تالیفی، سال و اسم آزمون) ---
  function parseSmartExamText(rawText, defaultSubjName) {
    const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
    const grouped = {};
    let curSubj = defaultSubjName || 'عمومی';
    let curChapter = '';
    let curQ = null;

    const pushCur = () => {
      if (curQ && curQ.q && curQ.options.some(Boolean)) {
        while (curQ.options.length < 4) curQ.options.push('');
        grouped[curSubj] = grouped[curSubj] || [];
        grouped[curSubj].push(curQ);
      }
      curQ = null;
    };

    const letterToIdx = (ch) => {
      const n = toEn(String(ch || '')).trim().replace(/[.)]/g, '');
      if (n === '1' || n === 'الف' || n.toLowerCase() === 'a') return 0;
      if (n === '2' || n === 'ب' || n.toLowerCase() === 'b') return 1;
      if (n === '3' || n === 'ج' || n.toLowerCase() === 'c') return 2;
      if (n === '4' || n === 'د' || n.toLowerCase() === 'd') return 3;
      return 0;
    };

    lines.forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;

      const subjMatch = line.match(/^درس\s*[:：]\s*(.+)$/);
      if (subjMatch) {
        pushCur();
        curSubj = subjMatch[1].trim() || defaultSubjName;
        return;
      }

      const chMatch = line.match(/^(?:فصل|مبحث|بخش)\s*[:：]\s*(.+)$/);
      if (chMatch) {
        if (curQ && curQ.options.some(Boolean)) pushCur();
        curChapter = chMatch[1].trim();
        if (curQ) curQ.chapter = curChapter;
        return;
      }

      const ansMatch = line.match(/^(?:پاسخ\s*صحیح|پاسخ|جواب|کلید)\s*[:：]\s*(.+)$/);
      if (ansMatch && curQ) {
        curQ.answer = letterToIdx(ansMatch[1].slice(0, 4));
        return;
      }

      const expMatch = line.match(/^(?:تشریح|پاسخ\s*تشریحی|نکته|مستند|توضیح)\s*[:：]\s*(.+)$/);
      if (expMatch && curQ) {
        curQ.exp = (curQ.exp ? curQ.exp + ' ' : '') + expMatch[1].trim();
        return;
      }

      const optMatch = line.match(/^(?:گزینه\s*)?([الفبجد1-4۱-۴a-dA-D])\s*[).:\-–—]\s*(.+)$/);
      if (optMatch && curQ) {
        const idx = letterToIdx(optMatch[1]);
        curQ.options[idx] = optMatch[2].trim();
        return;
      }

      const qStart = line.match(/^(?:سوال\s*)?[0-9۰-۹]+\s*[).:\-–—]\s*(.+)$/);
      if (qStart) {
        pushCur();
        curQ = {
          id: 'eq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          q: qStart[1].trim(),
          options: ['', '', '', ''],
          answer: 0,
          exp: '',
          chapter: curChapter
        };
        return;
      }

      if (!curQ) {
        curQ = {
          id: 'eq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          q: line,
          options: ['', '', '', ''],
          answer: 0,
          exp: '',
          chapter: curChapter
        };
      } else if (!curQ.options.some(Boolean)) {
        curQ.q += '\n' + line;
      }
    });
    pushCur();
    return grouped;
  }

  window.openExamBulkImportModal = function(examId) {
    if (!window.isAdmin) return;
    const ex = window.getExams().find(x => x.id === examId);
    if (!ex) return;
    const subjNames = (ex.subjects || []).map(s => s.name);

    const m = document.getElementById('modal');
    if (!m) return;
    m.innerHTML = `
      <h2>📥 ورود گروهی سوالات به «${esc(ex.title)}»</h2>
      <p class="muted small" style="line-height:1.8;">سوالات را می‌توانید با متن ساده، اکسل (.xlsx/.csv) یا JSON همراه با ستون‌های <b>فصل/مبحث</b>، <b>نوع (تالیفی/سراسری)</b>، <b>سال</b> و <b>اسم آزمون</b> بارگذاری کنید.</p>

      <div class="field" style="margin-top:8px;">
        <label>درس پیش‌فرض (برای سوالاتی که بالای آن‌ها خط «درس: ...» نباشد)</label>
        <input id="impDefSubj" list="impSubjData" value="${esc(subjNames[0] || 'حقوق مدنی')}">
        <datalist id="impSubjData">${subjNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      </div>

      <div class="surface-box" style="margin-top:12px;">
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <label style="font-size:12.5px; font-weight:700;">۱. بارگذاری مستقیم از فایل اکسل، CSV یا JSON:</label>
          <button type="button" class="btn small" onclick="downloadExamSampleCsv()">⬇️ دانلود فایل نمونه CSV</button>
        </div>
        <input type="file" id="impExamFile" accept=".xlsx,.xls,.csv,.json" onchange="handleExamFileImport('${ex.id}', this)">
        <div class="muted small" style="margin-top:6px;">ستون‌های پشتیبانی‌شده: سرفصل (فصل/مبحث) | منبع سوال (تالیفی، ارشد، وکلا) | سال | صورت سوال | گزینه ۱ تا ۴ | پاسخ | تشریح | درس | دسته | اسم آزمون</div>
      </div>

      <div class="field" style="margin-top:14px;">
        <label>۲. یا چسباندن متن سوالات با فرمت هوشمند:</label>
        <textarea id="impExamText" rows="9" placeholder="درس: حقوق جزا&#10;فصل: قصاص و دیات&#10;۱. در کدام مورد قصاص ثابت نمی‌شود؟&#10;الف) گزینه اول&#10;ب) گزینه دوم&#10;ج) گزینه سوم&#10;د) گزینه چهارم&#10;پاسخ: ب&#10;تشریح: طبق ماده ... قانون مجازات اسلامی"></textarea>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn" onclick="openExamQuestionsEditor('${ex.id}')">بازگشت به سوالات</button>
        <button type="button" class="btn primary" onclick="submitExamTextBulkImport('${ex.id}')">⚡ تحلیل و افزودن سوالات متن</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.openMultiExamFileImportModal = function(presetMainTitle) {
    if (!window.isAdmin) return;
    const m = document.getElementById('modal');
    if (!m) return;
    const suggestions = getAllMainTitleSuggestions();
    const initialMain = String(presetMainTitle || '').trim();
    m.innerHTML = `
      <h2>📥 ورود فایل آزمون (CSV / اکسل / JSON)</h2>
      <p class="muted small" style="line-height:1.9;">
        یک <b>عنوان اصلی</b> بدهید (مثل: مدنی، جزا یا هر عنوان دلخواه) و در صورت تمایل <b>عنوان مبحث / سرفصل</b> را دستی بنویسید یا خالی بگذارید تا مستقیم از ستون «سرفصل / مبحث» داخل فایل CSV خوانده شود. زمان آزمون خودکار ۲ دقیقه به ازای هر سوال محاسبه می‌شود.
      </p>
      <div class="form-grid" style="margin-top:10px; gap:10px;">
        <div class="field" style="grid-column:1/-1;">
          <label>عنوان اصلی (در صفحه اصلی آزمون‌ها نمایش داده می‌شود — خالی بگذارید تا از ستون عنوان یا نام فایل خوانده شود)</label>
          <input id="mImpMainTitle" list="mImpMainTitleList" value="${esc(initialMain)}" placeholder="مثلاً: حقوق مدنی، حقوق جزا، آزمون وکالت ۱۴۰۳...">
          <datalist id="mImpMainTitleList">${suggestions.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>عنوان مبحث / سرفصل (اختیاری — اگر خالی بگذارید از ستون «سرفصل / مبحث» داخل فایل CSV خوانده می‌شود)</label>
          <input id="mImpTopicTitle" value="" placeholder="مثلاً: عقود معین یا قصاص (یا خالی بگذارید برای خواندن از CSV)">
        </div>
        <div class="field">
          <label>منبع / نوع (اختیاری)</label>
          <input id="mImpDefType" list="mImpTypeList" value="" placeholder="مثلاً: تالیفی یا سراسری">
          <datalist id="mImpTypeList">${EXAM_TYPES.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label>سال (اختیاری)</label>
          <input id="mImpDefYear" type="number" value="" placeholder="مثلاً: 1404">
        </div>
        <div class="field" style="justify-content:end;">
          <label class="check" style="margin:0; cursor:pointer;">
            <input type="checkbox" id="mImpVip">
            <span>⭐ آزمون ویژه (VIP)</span>
          </label>
        </div>
        <div class="field" style="justify-content:end;">
          <label class="check" style="margin:0; cursor:pointer;">
            <input type="checkbox" id="mImpPub" checked>
            <span>👁 انتشار فوری برای همه کاربران</span>
          </label>
        </div>
      </div>
      <div class="surface-box" style="margin-top:12px;">
        <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <label style="font-size:12.5px; font-weight:700;">انتخاب فایل اکسل، CSV یا JSON:</label>
          <button type="button" class="btn small" onclick="downloadExamSampleCsv()">⬇️ دانلود فایل نمونه CSV</button>
        </div>
        <input type="file" id="mImpFile" accept=".xlsx,.xls,.csv,.json" onchange="handleExamFileImport('__AUTO__', this)">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">بستن</button>
      </div>
    `;
    document.getElementById('modalBack').classList.add('show');
  };

  window.downloadExamSampleCsv = function() {
    const bom = '\uFEFF';
    const rows = [
      ['عنوان اصلی', 'سرفصل', 'منبع سوال', 'سال', 'صورت سوال', 'گزینه ۱', 'گزینه ۲', 'گزینه ۳', 'گزینه ۴', 'پاسخ', 'پاسخ تشریحی'],
      ['حقوق جزا', 'مسئولیت کیفری', 'آزمون وکلا', '1400', 'شرط تحقق مسئولیت کیفری در قبال جرایم عمدی کدام است؟', 'بلوغ و عقل و اختیار', 'صرف علم به حکم', 'سوگند متهم', 'عدم سابقه کیفری', '1', 'مطابق مواد ۱۴۰ تا ۱۴۶ قانون مجازات اسلامی'],
      ['حقوق جزا', 'قصاص و دیات', 'ارشد', '98', 'در چه صورتی قصاص نفس با گذشت ساقط می‌شود؟', 'با گذشت اولیای دم', 'با اقرار متهم', 'با تغییر قاضی', 'با مرور زمان', '1', 'مطابق قانون مجازات اسلامی'],
      ['حقوق جزا', 'تعزیرات', 'تالیفی', '', 'حداقل سن مسئولیت کیفری در پسران کدام است؟', '۱۵ سال تمام قمری', '۱۸ سال شمسی', '۱۲ سال شمسی', '۹ سال قمری', '1', 'ماده ۱۴۷ قانون مجازات اسلامی']
    ];
    const sample = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([bom + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baraat-exam-sample.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  };

  function decodeSpreadsheetBytesSmart(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try {
        return new TextDecoder('windows-1256').decode(bytes);
      } catch (e2) {
        return new TextDecoder('utf-8').decode(bytes);
      }
    }
  }

  function parseCsvTextToGrid(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const firstLine = (clean.split(/\r\n|\n|\r/).find(l => l.trim().length > 0) || '');
    let inQ0 = false, commas = 0, semis = 0, tabs = 0;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQ0 = !inQ0;
      else if (!inQ0) {
        if (ch === ',') commas++;
        else if (ch === ';') semis++;
        else if (ch === '\t') tabs++;
      }
    }
    const delim = (tabs > commas && tabs > semis) ? '\t' : (semis > commas ? ';' : ',');

    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQ) {
        if (ch === '"') {
          if (clean[i + 1] === '"') { cell += '"'; i++; }
          else inQ = false;
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQ = true;
        } else if (ch === delim) {
          row.push(cell);
          cell = '';
        } else if (ch === '\r' || ch === '\n') {
          if (ch === '\r' && clean[i + 1] === '\n') i++;
          row.push(cell);
          rows.push(row);
          row = [];
          cell = '';
        } else {
          cell += ch;
        }
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(r => r.some(c => String(c || '').trim() !== ''));
  }

  window.parseCsvBufferSmart = function(buf) {
    return parseCsvTextToGrid(decodeSpreadsheetBytesSmart(buf));
  };

  window.submitExamTextBulkImport = async function(examId) {
    if (!window.isAdmin) return;
    const raw = (document.getElementById('impExamText')?.value || '').trim();
    const defSubj = (document.getElementById('impDefSubj')?.value || '').trim() || 'حقوق مدنی';
    if (!raw) return alert('متن سوالات را وارد کنید.');

    const list = window.getExams();
    const ex = list.find(x => x.id === examId);
    if (!ex) return;

    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        let added = 0;
        const incSubjects = Array.isArray(parsed) ? [{ name: defSubj, questions: parsed }] : (parsed.subjects || []);
        ex.subjects = ex.subjects || [];
        incSubjects.forEach(s => {
          let target = ex.subjects.find(x => x.name === s.name);
          if (!target) { target = { id: 'es_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name: s.name || defSubj, questions: [] }; ex.subjects.push(target); }
          (s.questions || []).forEach(q => {
            target.questions.push(Object.assign({ id: 'eq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), options: ['', '', '', ''], answer: 0, exp: '', chapter: '' }, q));
            added++;
          });
        });
        if (!added) return alert('سوالی در JSON پیدا نشد.');
        await persistExamsList(list, toFa(added) + ' سوال از JSON اضافه شد.');
        window.openExamQuestionsEditor(examId);
        return;
      } catch (e) {}
    }

    const grouped = parseSmartExamText(raw, defSubj);
    let totalAdded = 0;
    ex.subjects = ex.subjects || [];
    Object.entries(grouped).forEach(([sName, qs]) => {
      if (!qs.length) return;
      let target = ex.subjects.find(x => x.name === sName);
      if (!target) {
        target = { id: 'es_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name: sName, questions: [] };
        ex.subjects.push(target);
      }
      target.questions.push(...qs);
      totalAdded += qs.length;
    });

    if (!totalAdded) return alert('هیچ سوال معتبری با گزینه‌ها شناسایی نشد. هر سوال را با شماره و گزینه‌ها را با الف) ب) ج) د) بنویسید.');
    await persistExamsList(list, toFa(totalAdded) + ' سوال با موفقیت به آزمون اضافه شد.');
    window.openExamQuestionsEditor(examId);
  };

  window.handleExamFileImport = async function(examId, inputEl) {
    const f = inputEl && inputEl.files && inputEl.files[0];
    if (!f) return;
    const isAutoMode = examId === '__AUTO__';
    const manualMainTitle = isAutoMode ? (document.getElementById('mImpMainTitle')?.value || '').trim() : '';
    const manualTopicTitle = isAutoMode ? (document.getElementById('mImpTopicTitle')?.value || '').trim() : '';
    const defSubj = (document.getElementById('impDefSubj')?.value || '').trim();
    const defType = (document.getElementById('mImpDefType')?.value || '').trim();
    const defYearRaw = toEn(document.getElementById('mImpDefYear')?.value || '').trim();
    const defYear = defYearRaw ? Number(defYearRaw) : '';
    const impIsPremium = isAutoMode ? !!document.getElementById('mImpVip')?.checked : false;
    const impIsPublished = isAutoMode ? (document.getElementById('mImpPub') ? !!document.getElementById('mImpPub').checked : true) : true;

    const list = window.getExams();
    const targetSingleExam = isAutoMode ? null : list.find(x => x.id === examId);
    if (!isAutoMode && !targetSingleExam) return;

    const fnameLower = f.name.toLowerCase();
    if (fnameLower.endsWith('.json')) {
      try {
        const txt = await f.text();
        if (!isAutoMode && document.getElementById('impExamText')) {
          document.getElementById('impExamText').value = txt;
          await window.submitExamTextBulkImport(examId);
          return;
        }
        const parsed = JSON.parse(txt);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        let addedEx = 0;
        arr.forEach(item => {
          if (!item || typeof item !== 'object') return;
          if (Array.isArray(item.subjects)) {
            const extra = { id: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5) };
            if (manualMainTitle) extra.mainTitle = manualMainTitle;
            if (manualTopicTitle) extra.topicTitle = manualTopicTitle;
            list.unshift(normalizeExamRecord(Object.assign(extra, item)));
            addedEx++;
          }
        });
        if (!addedEx) return alert('ساختار آزمون معتبری در فایل JSON پیدا نشد.');
        await persistExamsList(list, toFa(addedEx) + ' آزمون از JSON وارد شد.');
        closeModal();
      } catch (e) {
        alert('فایل JSON معتبر نیست.');
      } finally {
        if (inputEl) inputEl.value = '';
      }
      return;
    }

    try {
      let rawGrid = [];
      if (fnameLower.endsWith('.csv') || fnameLower.endsWith('.tsv')) {
        const buf = await f.arrayBuffer();
        rawGrid = parseCsvTextToGrid(decodeSpreadsheetBytesSmart(buf));
      } else {
        if (window.loadXLSX) await window.loadXLSX();
        if (!window.XLSX) return alert('ابزار خواندن اکسل بارگذاری نشد.');
        const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rawGrid = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      }
      const indexedRows = rawGrid
        .map((row, origIdx) => ({ row, origRowNum: origIdx + 1 }))
        .filter(item => Array.isArray(item.row) && item.row.some(c => String(c).trim() !== ''));
      if (indexedRows.length < 2) return alert('فایل اکسل/CSV خالی یا بدون سطر داده است.');

      const normH = (c) => String(c || '').trim().toLowerCase().replace(/[\u200c\s_()-]+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک');
      const hdr = indexedRows[0].row.map(normH);
      const findCol = (exacts, includes) => {
        let idx = hdr.findIndex(h => exacts.includes(h));
        if (idx >= 0) return idx;
        return hdr.findIndex(h => includes.some(p => h.includes(p)));
      };

      const ciNum = findCol(['شماره', 'شماره سوال', 'شماره تست', 'ردیف', 'کد', 'کد سوال', 'no', 'num', 'number', 'row', 'id', '#'], ['شماره سوال', 'شماره تست', 'ردیف']);
      const ciMainTitle = findCol(['عنوان اصلی', 'بخش اصلی', 'سردسته', 'نام درس اصلی', 'main title', 'maintitle'], ['عنوان اصلی', 'بخش اصلی', 'maintitle']);
      const ciCat = findCol(['دسته', 'دسته بندی', 'نهاد', 'رشته', 'category', 'org'], ['دسته', 'نهاد', 'category']);
      const ciSource = findCol(['منبع سوال', 'منبع', 'مرجع', 'آزمون مبدا', 'source', 'origin'], ['منبع', 'مرجع', 'مبدا', 'source', 'origin']);
      const ciType = findCol(['نوع', 'نوع سوال', 'نوع آزمون', 'ماهیت', 'تالیفی', 'type', 'examtype'], ['تالیفی', 'نوع آزمون', 'نوع سوال', 'examtype']);
      const ciYear = findCol(['سال', 'سال آزمون', 'year'], ['سال', 'year']);
      const ciTitle = findCol(['اسم آزمون', 'نام آزمون', 'عنوان آزمون', 'عنوان', 'exam', 'examtitle', 'title'], ['اسم آزمون', 'نام آزمون', 'عنوان آزمون', 'title']);
      const ciSubj = findCol(['درس', 'subject'], ['درس', 'subject']);
      const ciChap = findCol(['سرفصل', 'عنوان مبحث', 'مبحث', 'فصل', 'موضوع', 'بخش', 'chapter', 'topic'], ['سرفصل', 'مبحث', 'فصل', 'chapter', 'topic']);
      const ciQ = findCol(['سوال', 'سؤال', 'صورت سوال', 'متن سوال', 'question'], ['سوال', 'سؤال', 'صورت', 'question']);
      const ciA = findCol(['الف', 'ا', 'a', '1', '۱', 'گزینه الف', 'گزینه 1', 'گزینه ۱', 'گزینه اول', 'opt1', 'option1', 'option a'], ['گزینه الف', 'گزینه 1', 'گزینه ۱', 'opt1', 'option 1', 'option a']);
      const ciB = findCol(['ب', 'b', '2', '۲', 'گزینه ب', 'گزینه 2', 'گزینه ۲', 'گزینه دوم', 'opt2', 'option2', 'option b'], ['گزینه ب', 'گزینه 2', 'گزینه ۲', 'opt2', 'option 2', 'option b']);
      const ciC = findCol(['ج', 'c', '3', '۳', 'گزینه ج', 'گزینه 3', 'گزینه ۳', 'گزینه سوم', 'opt3', 'option3', 'option c'], ['گزینه ج', 'گزینه 3', 'گزینه ۳', 'opt3', 'option 3', 'option c']);
      const ciD = findCol(['د', 'd', '4', '۴', 'گزینه د', 'گزینه 4', 'گزینه ۴', 'گزینه چهارم', 'opt4', 'option4', 'option d'], ['گزینه د', 'گزینه 4', 'گزینه ۴', 'opt4', 'option 4', 'option d']);
      const ciAns = (() => {
        const isExpHeader = (h) => /تشریح|توضیح|نکته|شرح|مستند|explanation|exp/.test(h);
        const exacts = ['پاسخ', 'پاسخ صحیح', 'گزینه صحیح', 'جواب', 'جواب صحیح', 'کلید', 'کلید پاسخ', 'صحیح', 'answer', 'ans', 'key', 'correct', 'correct answer'];
        let idx = hdr.findIndex(h => !isExpHeader(h) && exacts.includes(h));
        if (idx >= 0) return idx;
        return hdr.findIndex(h => !isExpHeader(h) && ['پاسخ', 'کلید', 'جواب', 'صحیح', 'answer', 'ans', 'correct'].some(p => h.includes(p)));
      })();
      const ciExp = findCol(['تشریح', 'پاسخ تشریحی', 'توضیح', 'نکته', 'مستند', 'explanation', 'exp'], ['تشریح', 'توضیح', 'نکته', 'مستند', 'explanation']);

      const qCol = ciQ >= 0 ? ciQ : (ciSubj === 0 ? 1 : 0);
      const dataRowsForAns = indexedRows.slice(1);
      const hasZeroAns = ciAns >= 0 && dataRowsForAns.some(({ row: r }) => /^0(?:\.0+)?$/.test(toEn(String(r[ciAns] || '')).trim()));
      const hasFourAns = ciAns >= 0 && dataRowsForAns.some(({ row: r }) => /^4(?:\.0+)?$/.test(toEn(String(r[ciAns] || '')).trim()));
      const isZeroBasedAns = hasZeroAns && !hasFourAns;

      const ansToIdx = (v) => {
        const norm = toEn(String(v || ''))
          .replace(/[يى]/g, 'ی')
          .replace(/ك/g, 'ک')
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .replace(/[\u200c\u200f\u200e]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (!norm) return 0;

        const pureNum = norm.match(/^([0-4])(?:\.0+)?$/);
        if (pureNum) {
          const n = Number(pureNum[1]);
          if (isZeroBasedAns) return Math.max(0, Math.min(3, n));
          if (n >= 1 && n <= 4) return n - 1;
          return 0;
        }

        const expMatch = norm.match(/(?:گزینه|پاسخ|جواب|کلید|شماره)\s*(?:ی\s+|صحیح\s+|درست\s+)?[:：\-–—.]?\s*(?:([0-4])(?:\.0+)?(?![0-9])|(الف|ا|ب|ج|د|a|b|c|d)(?![\u0600-\u06FFa-z])|(اول|یکم|دوم|سوم|چهارم))/);
        if (expMatch) {
          if (expMatch[1] !== undefined) {
            const n = Number(expMatch[1]);
            if (isZeroBasedAns) return Math.max(0, Math.min(3, n));
            if (n >= 1 && n <= 4) return n - 1;
            return 0;
          }
          if (expMatch[2]) {
            const lt = expMatch[2];
            if (lt === 'الف' || lt === 'ا' || lt === 'a') return 0;
            if (lt === 'ب' || lt === 'b') return 1;
            if (lt === 'ج' || lt === 'c') return 2;
            if (lt === 'د' || lt === 'd') return 3;
          }
          if (expMatch[3]) {
            const ord = expMatch[3];
            if (ord === 'اول' || ord === 'یکم') return 0;
            if (ord === 'دوم') return 1;
            if (ord === 'سوم') return 2;
            if (ord === 'چهارم') return 3;
          }
        }

        const stripped = norm
          .replace(/(?:گزینه|پاسخ|جواب|کلید|صحیح|درست|است|می\s*باشد|شماره)/g, ' ')
          .replace(/[:：.\-–—()[\]«»؛،,]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (stripped === 'الف' || stripped === 'ا' || stripped === 'a' || stripped === 'اول' || stripped === 'یکم' || stripped === 'یک') return 0;
        if (stripped === 'ب' || stripped === 'b' || stripped === 'دوم' || stripped === 'دو') return 1;
        if (stripped === 'ج' || stripped === 'c' || stripped === 'سوم' || stripped === 'سه') return 2;
        if (stripped === 'د' || stripped === 'd' || stripped === 'چهارم' || stripped === 'چهار') return 3;

        const validDigit = stripped.match(/(?:^|\s)([0-4])(?:\.0+)?(?=\s|$)/);
        if (validDigit) {
          const n = Number(validDigit[1]);
          if (isZeroBasedAns) return Math.max(0, Math.min(3, n));
          if (n >= 1 && n <= 4) return n - 1;
          return 0;
        }

        const any14 = norm.match(/(?<![0-9])([1-4])(?![0-9])/);
        if (any14) {
          const n = Number(any14[1]);
          return isZeroBasedAns ? Math.max(0, Math.min(3, n)) : n - 1;
        }
        return 0;
      };

      const fileBaseTitle = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim() || 'آزمون بارگذاری‌شده';
      const parsedRows = [];
      let fileQSeq = 0;

      dataRowsForAns.forEach(({ row: r, origRowNum }) => {
        const qText = String(r[qCol] || '').trim();
        if (!qText) return;
        const opts = [
          String(r[ciA >= 0 ? ciA : qCol + 1] || '').trim(),
          String(r[ciB >= 0 ? ciB : qCol + 2] || '').trim(),
          String(r[ciC >= 0 ? ciC : qCol + 3] || '').trim(),
          String(r[ciD >= 0 ? ciD : qCol + 4] || '').trim()
        ];
        if (!opts.some(Boolean)) return;

        fileQSeq++;
        const explicitNum = ciNum >= 0 ? toEn(String(r[ciNum] || '').trim()) : '';
        const rowMain = ciMainTitle >= 0 ? String(r[ciMainTitle] || '').trim() : '';
        const rowSub = ciSubj >= 0 ? String(r[ciSubj] || '').trim() : '';
        const chName = ciChap >= 0 ? String(r[ciChap] || '').trim() : '';
        const rowSource = ciSource >= 0 ? String(r[ciSource] || '').trim() : '';
        const rowType = (ciType >= 0 && String(r[ciType] || '').trim()) || defType;
        const rowYearRaw = (ciYear >= 0 && toEn(String(r[ciYear] || '').trim())) || (defYear ? String(defYear) : '');
        const sourceLabel = buildExamSourceLabel(rowSource, rowType, rowYearRaw);

        parsedRows.push({
          rowMain,
          rowTitle: (ciTitle >= 0 && String(r[ciTitle] || '').trim()) || '',
          rowCat: (ciCat >= 0 && String(r[ciCat] || '').trim()) || '',
          rowType: rowType || 'تالیفی',
          rowYear: rowYearRaw ? (Number(rowYearRaw) || '') : '',
          rowSub,
          chName,
          sourceLabel,
          csvQuestionNum: explicitNum || String(fileQSeq),
          csvRowIndex: origRowNum,
          csvFileName: f.name,
          qText,
          opts,
          answer: ansToIdx(ciAns >= 0 ? r[ciAns] : 1),
          exp: ciExp >= 0 ? String(r[ciExp] || '').trim() : ''
        });
      });

      if (!parsedRows.length) return alert('سوال معتبری در فایل اکسل/CSV یافت نشد.');

      let added = 0;
      let firstImportedMainTitle = '';
      parsedRows.forEach(item => {
        // عنوان اصلی: اولویت با ورودی دستی مدیر -> ستون عنوان اصلی CSV -> ستون عنوان/دسته CSV -> نام فایل
        const effectiveMainTitle = manualMainTitle || item.rowMain || item.rowTitle || item.rowCat || fileBaseTitle;
        // عنوان مبحث/سرفصل: اولویت با ورودی دستی مدیر -> ستون سرفصل/مبحث CSV -> ستون درس CSV -> پیش‌فرض
        const effectiveTopic = isAutoMode
          ? (manualTopicTitle || item.chName || item.rowSub || 'سوالات عمومی')
          : (item.chName || item.rowSub || defSubj || 'سوالات عمومی');

        if (!firstImportedMainTitle) firstImportedMainTitle = effectiveMainTitle;

        let destExam = targetSingleExam;
        if (isAutoMode) {
          const examDisplayTitle = manualTopicTitle
            ? (effectiveMainTitle + ' · ' + manualTopicTitle)
            : (item.rowTitle && item.rowTitle !== effectiveMainTitle ? (effectiveMainTitle + ' · ' + item.rowTitle) : (fileBaseTitle !== effectiveMainTitle ? (effectiveMainTitle + ' · ' + fileBaseTitle) : effectiveMainTitle));
          destExam = list.find(x => getExamMainTitle(x) === effectiveMainTitle && x.title === examDisplayTitle);
          if (!destExam) {
            destExam = normalizeExamRecord({
              id: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              mainTitle: effectiveMainTitle,
              topicTitle: manualTopicTitle || '',
              title: examDisplayTitle,
              category: effectiveMainTitle,
              org: effectiveMainTitle,
              isPremium: impIsPremium,
              examType: defType || item.rowType || 'تالیفی',
              year: defYear || item.rowYear || '',
              durationMinutes: 60,
              negativeMarking: true,
              isPublished: impIsPublished,
              subjects: []
            });
            list.unshift(destExam);
          }
        }

        destExam.subjects = destExam.subjects || [];
        let targetSubj = destExam.subjects.find(x => x.name === effectiveTopic);
        if (!targetSubj) {
          targetSubj = { id: 'es_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name: effectiveTopic, questions: [] };
          destExam.subjects.push(targetSubj);
        }
        targetSubj.questions.push({
          id: 'eq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          q: item.qText,
          chapter: effectiveTopic,
          sourceLabel: item.sourceLabel,
          csvQuestionNum: item.csvQuestionNum,
          csvRowIndex: item.csvRowIndex,
          csvFileName: item.csvFileName,
          options: item.opts,
          answer: item.answer,
          exp: item.exp
        });
        added++;
      });

      if (isAutoMode && firstImportedMainTitle) {
        examHubSection = 'exams';
        selectedMainTitle = firstImportedMainTitle;
      }
      await persistExamsList(list, toFa(added) + ' سوال زیر عنوان «' + (firstImportedMainTitle || 'آزمون') + '» با زمان خودکار (۲ دقیقه/سوال) وارد شد.');
      if (isAutoMode) closeModal();
      else window.openExamQuestionsEditor(examId);
    } catch (e) {
      alert('خطا در خواندن فایل: ' + (e && e.message));
    } finally {
      if (inputEl) inputEl.value = '';
    }
  };

  // --- محیط امتحانی تمام‌صفحه (#examRunnerOverlay) ---
  let examSession = null;
  let examTimerHandle = null;

  function formatMmSs(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return hrs > 0 ? `${toFa(hrs)}:${toFa(pad(mins))}:${toFa(pad(secs))}` : `${toFa(pad(mins))}:${toFa(pad(secs))}`;
  }

  function stopExamTimer() {
    if (examTimerHandle) {
      clearInterval(examTimerHandle);
      examTimerHandle = null;
    }
  }

  function startExamCountdown() {
    stopExamTimer();
    examTimerHandle = setInterval(() => {
      if (!examSession || examSession.mode !== 'exam' || examSession.submitted || examSession.paused) return;
      examSession.secondsLeft = Math.max(0, examSession.secondsLeft - 1);
      const tEl = document.getElementById('exTimerDisplay');
      if (tEl) {
        tEl.textContent = formatMmSs(examSession.secondsLeft);
        tEl.parentElement?.classList.toggle('low', examSession.secondsLeft <= 300);
      }
      if (examSession.secondsLeft <= 0) {
        window.finishExamRunner(true);
      }
    }, 1000);
  }

  let prepSaveTimer = null;

  function findQuestionInSession(qId) {
    if (!examSession || !qId) return null;
    let runningG = 0;
    for (let sIdx = 0; sIdx < (examSession.subjects || []).length; sIdx++) {
      const subj = examSession.subjects[sIdx];
      const qs = subj.questions || [];
      for (let qIdx = 0; qIdx < qs.length; qIdx++) {
        runningG++;
        if (qs[qIdx] && qs[qIdx].id === qId) {
          return { subj, sIdx, qObj: qs[qIdx], qIdx, subjTotal: qs.length, globalIdx: runningG };
        }
      }
    }
    return null;
  }

  function computePrepLiveStats(s) {
    let total = 0, answered = 0, correct = 0, wrong = 0;
    (s.subjects || []).forEach(sb => {
      (sb.questions || []).forEach(q => {
        total++;
        const picked = s.answers[q.id];
        if (picked !== undefined && picked !== null) {
          answered++;
          if (Number(picked) === Number(q.answer)) correct++;
          else wrong++;
        }
      });
    });
    const pct = answered ? Math.round((correct / answered) * 100) : 0;
    return { total, answered, correct, wrong, pct };
  }

  function buildPrepReportRecord(s) {
    if (!s || s.mode !== 'study') return null;
    const ansKeys = Object.keys(s.answers || {});
    if (!ansKeys.length) return null;
    const stats = computeExamScorecard(s);
    const snapshot = [];
    (s.subjects || []).forEach(sb => {
      (sb.questions || []).forEach(q => {
        snapshot.push({
          id: q.id,
          subjName: sb.name,
          chapter: q.chapter || '',
          sourceLabel: q.sourceLabel || '',
          csvQuestionNum: q.csvQuestionNum || '',
          csvRowIndex: q.csvRowIndex || undefined,
          csvFileName: q.csvFileName || '',
          q: q.q,
          options: q.options || [],
          answer: Number(q.answer || 0),
          exp: q.exp || ''
        });
      });
    });
    const allTagMap = getExamTagsMap();
    const attemptTagsSnap = {};
    snapshot.forEach(item => {
      const tg = allTagMap[item.id];
      if (tg && (tg.difficulty || getTagFlagsArr(tg).length)) {
        attemptTagsSnap[item.id] = tg;
      }
    });
    const nowIso = new Date().toISOString();
    if (!s.prepReportId) {
      s.prepReportId = 'prep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      s.prepCreatedAt = nowIso;
    }
    const live = computePrepLiveStats(s);
    return {
      id: s.prepReportId,
      examId: s.exam.id,
      examTitle: s.exam.title,
      scopeLabel: s.scopeLabel,
      mode: 'prep',
      examScope: s.exam.examScope || 'general',
      subjectGroup: s.exam.subjectGroup || '',
      userId: (window.me && window.me.id) || '',
      userEmail: (window.me && window.me.email) || '',
      dateLabel: formatJalaliFull(new Date()).numericFa,
      correct: stats.correct,
      wrong: stats.wrong,
      blank: stats.blank,
      total: stats.total,
      rawPct: live.pct,
      netPct: stats.netPct,
      answers: Object.assign({}, s.answers),
      questionTags: attemptTagsSnap,
      questionsSnapshot: snapshot,
      createdAt: s.prepCreatedAt || nowIso,
      updatedAt: nowIso
    };
  }

  async function flushPrepReportSave(showToast, sessOverride) {
    if (prepSaveTimer) {
      clearTimeout(prepSaveTimer);
      prepSaveTimer = null;
    }
    const targetSess = sessOverride || examSession;
    if (!targetSess || targetSess.mode !== 'study') return false;
    const rec = buildPrepReportRecord(targetSess);
    if (!rec) {
      if (showToast && typeof toast === 'function') toast('ابتدا حداقل به یک سوال پاسخ دهید تا گزارش آمادگی ثبت شود.');
      return false;
    }
    await saveExamResultRecord(rec);
    if (showToast && typeof toast === 'function') {
      toast('گزارش حالت آمادگی با موفقیت ثبت و برای شما و مدیر ذخیره شد.');
    }
    return true;
  }

  function schedulePrepReportSave() {
    if (prepSaveTimer) clearTimeout(prepSaveTimer);
    prepSaveTimer = setTimeout(() => {
      prepSaveTimer = null;
      flushPrepReportSave(false).catch(() => {});
    }, 1200);
  }

  window.examSavePrepReportNow = async function() {
    const ok = await flushPrepReportSave(true);
    if (ok && window.renderExamsHub) window.renderExamsHub();
  };

  window.openExamRunner = function(examId, singleSubjId, mode, jumpToSubjId) {
    const ex = getVisibleExams().find(x => x.id === examId);
    if (!ex) {
      if (typeof toast === 'function') toast('این آزمون در دسترس نیست.');
      return;
    }
    if (ex.isPremium && !isCurrentUserVip()) {
      showVipLockModal(ex.title || 'آزمون ویژه');
      return;
    }
    const rawSubjs = (ex.subjects || []).filter(s => (s.questions || []).length > 0 && (!singleSubjId || s.id === singleSubjId));
    if (!rawSubjs.length) {
      if (typeof toast === 'function') toast('برای این آزمون هنوز سوالی ثبت نشده است.');
      return;
    }

    stopExamTimer();
    const runMode = mode === 'exam' ? 'exam' : 'study';
    const totalQ = rawSubjs.reduce((a, s) => a + s.questions.length, 0);
    const defaultSeconds = calcExamDurationMin(totalQ) * 60;
    const jumpIdx = jumpToSubjId ? Math.max(0, rawSubjs.findIndex(s => s.id === jumpToSubjId)) : 0;

    examSession = {
      exam: ex,
      mode: runMode,
      subjects: rawSubjs,
      scopeLabel: singleSubjId ? rawSubjs[0].name : 'همه دروس به ترتیب',
      activeSubjIdx: jumpIdx,
      activeQIdx: 0,
      viewMode: 'list',
      answers: {},
      revealed: {},
      flags: {},
      sessionPrevPrep: Object.assign({}, getExamPrepHistoryMap()),
      secondsLeft: defaultSeconds,
      totalSeconds: defaultSeconds,
      paused: false,
      submitted: false,
      reviewFilter: 'all'
    };

    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (runMode === 'exam') {
      startExamCountdown();
    }

    renderExamRunner();
    if (jumpToSubjId && jumpIdx > 0) {
      setTimeout(() => {
        const secEl = document.getElementById('exSubjSec-' + jumpIdx);
        if (secEl) secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  window.closeExamRunner = function(force) {
    if (!force && examSession && examSession.mode === 'exam' && !examSession.submitted) {
      if (!confirm('آزمون زمان‌دار هنوز تصحیح نشده است. مطمئن هستید که می‌خواهید خارج شوید؟')) return;
    }
    const closingSession = examSession;
    const shouldSavePrep = !!(closingSession && closingSession.mode === 'study' && Object.keys(closingSession.answers || {}).length > 0);
    stopExamTimer();
    window.closeExamLawRefPopup();
    window.closeExamQuickJumpSheet();
    examSession = null;
    const overlay = document.getElementById('examRunnerOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
    }
    document.body.style.overflow = '';
    if (shouldSavePrep) {
      flushPrepReportSave(false, closingSession).then(() => {
        if (window.renderExamsHub) window.renderExamsHub();
      }).catch(() => {});
    } else if (window.renderExamsHub) {
      window.renderExamsHub();
    }
  };

  window.examSwitchSubj = function(idx) {
    if (!examSession) return;
    examSession.activeSubjIdx = idx;
    examSession.activeQIdx = 0;
    const isContinuous = examSession.mode === 'study' || examSession.viewMode === 'list';
    if (isContinuous) {
      document.querySelectorAll('#examRunnerOverlay .exam-subj-tab').forEach((btn, bIdx) => {
        btn.classList.toggle('active', bIdx === idx);
      });
      const secEl = document.getElementById('exSubjSec-' + idx);
      if (secEl) secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    renderExamRunner();
    const bodyEl = document.querySelector('#examRunnerOverlay .exam-runner-body');
    if (bodyEl) bodyEl.scrollTop = 0;
  };

  window.examSelectQ = function(qIdx) {
    if (!examSession) return;
    examSession.activeQIdx = qIdx;
    renderExamRunner();
  };

  window.examSelectSubjQ = function(sIdx, qIdx) {
    if (!examSession) return;
    examSession.activeSubjIdx = sIdx;
    examSession.activeQIdx = qIdx;
    renderExamRunner();
  };

  window.examJumpToQ = function(qId) {
    const el = document.getElementById('exq-' + qId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.examToggleViewMode = function(mode) {
    if (!examSession) return;
    examSession.viewMode = mode;
    renderExamRunner();
  };

  window.examTogglePause = function() {
    if (!examSession || examSession.submitted || examSession.mode !== 'exam') return;
    examSession.paused = !examSession.paused;
    renderExamRunner();
  };

  function buildStudyCardHtml(s, qObj, qIdx, subjName, subjTotal, globalIdx) {
    registerCopyableQuestion(qObj, subjName, qIdx + 1);
    const picked = s.answers[qObj.id];
    const isRev = !!s.revealed[qObj.id];
    const rightIdx = Number(qObj.answer || 0);
    const rightOptText = (qObj.options || [])[rightIdx] || '';
    const isPickedCorrect = picked !== undefined && Number(picked) === rightIdx;
    const prevRec = (isRev && s.sessionPrevPrep && s.sessionPrevPrep[qObj.id]) ? s.sessionPrevPrep[qObj.id] : null;
    const prevLetter = (prevRec && typeof prevRec.lastChoice === 'number' && EXAM_LETTERS[prevRec.lastChoice]) ? EXAM_LETTERS[prevRec.lastChoice] : '';
    return `
      <div class="exam-q-card" id="exq-${qObj.id}">
        <div class="row between" style="gap:8px; flex-wrap:wrap;">
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <span class="art-tag">${esc(subjName)} · سوال ${toFa(qIdx + 1)} از ${toFa(subjTotal)}</span>
            ${qObj.chapter ? `<span class="pill">سرفصل: ${esc(qObj.chapter)}</span>` : ''}
            ${formatExamSourceBadgeHtml(qObj.sourceLabel)}
            ${formatAdminCsvBadgeHtml(qObj, globalIdx)}
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn small" onclick="copyExamQuestionById('${qObj.id}', this)">📋 کپی سوال و جواب</button>
            ${picked !== undefined ? `<button type="button" class="btn small" onclick="examClearAnswer('${qObj.id}')">پاک کردن انتخاب</button>` : ''}
          </div>
        </div>
        <div class="exam-q-stem">${esc(qObj.q)}</div>
        <div class="exam-options-list">
          ${(qObj.options || []).map((opt, oi) => {
            if (!opt) return '';
            let cls = '';
            if (isRev) {
              if (oi === rightIdx) cls = 'correct';
              else if (picked === oi) cls = 'wrong';
            } else if (picked === oi) {
              cls = 'selected';
            }
            return `
              <button type="button" class="exam-opt-btn ${cls}" onclick="examPickOption('${qObj.id}', ${oi})">
                <span class="exam-opt-letter">${EXAM_LETTERS[oi]}</span>
                <span>${esc(opt)}</span>
              </button>
            `;
          }).join('')}
        </div>

        <div class="exam-ans-toggle-wrap">
          <button type="button" class="exam-reveal-btn ${isRev ? 'open' : ''}" onclick="examToggleReveal('${qObj.id}')">
            ${isRev ? '🙈 بستن پاسخ و تشریح' : '💡 مشاهده پاسخ صحیح و تشریح'}
          </button>
          ${isRev ? `
            <div class="exam-exp-box">
              <div>
                ${picked !== undefined
                  ? (isPickedCorrect ? '<b style="color:var(--ok,#16a34a);">✅ پاسخ شما صحیح بود!</b> · ' : '<b style="color:var(--danger,#dc2626);">❌ پاسخ شما اشتباه بود.</b> · ')
                  : ''}
                <b>پاسخ صحیح: گزینه ${EXAM_LETTERS[rightIdx]}</b>${rightOptText ? ` — ${esc(rightOptText)}` : ''}
              </div>
              ${qObj.exp ? `<div style="margin-top:8px;"><b>📖 تشریح و مستند قانونی:</b> ${formatExamExplanationHtml(qObj.exp, subjName || s.exam.title)}</div>` : ''}
            </div>
            ${prevRec ? `
              <div class="ex-prev-history-box ${prevRec.isCorrect ? 'ok' : 'bad'}">
                <b>📌 سابقه قبلی شما در این سوال:</b>
                دفعه قبل پاسخ <b>${prevRec.isCorrect ? 'صحیح ✅' : 'اشتباه ❌'}</b> داده بودید${prevLetter ? ` (گزینه ${prevLetter})` : ''}
                · تعداد تمرین قبلی: <b>${toFa(prevRec.attempts || 1)}</b> بار (${toFa(prevRec.correctRuns || 0)} صحیح / ${toFa(prevRec.wrongRuns || 0)} غلط)
              </div>
            ` : ''}
          ` : ''}
        </div>
        ${renderQuestionTagBarHtml(qObj.id, s.exam.title || '', subjName || '', qObj.q || '', 'study')}
        ${renderQuestionNoteBoxHtml(qObj.id, 'study')}
      </div>
    `;
  }

  function buildTimedCardHtml(s, qObj, qIdx, subjName, subjTotal, sIdx) {
    registerCopyableQuestion(qObj, subjName, qIdx + 1);
    const picked = s.answers[qObj.id];
    const flagged = !!s.flags[qObj.id];
    let prevSubjQ = 0;
    for (let i = 0; i < sIdx; i++) prevSubjQ += ((s.subjects[i] && s.subjects[i].questions) || []).length;
    const globalIdx = prevSubjQ + qIdx + 1;
    return `
      <div class="exam-q-card" id="exq-${qObj.id}">
        <div class="row between" style="gap:8px; flex-wrap:wrap;">
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <span class="art-tag">${esc(subjName)} · سوال ${toFa(qIdx + 1)} از ${toFa(subjTotal)}</span>
            ${qObj.chapter ? `<span class="pill">سرفصل: ${esc(qObj.chapter)}</span>` : ''}
            ${formatExamSourceBadgeHtml(qObj.sourceLabel)}
            ${formatAdminCsvBadgeHtml(qObj, globalIdx)}
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn small" onclick="copyExamQuestionById('${qObj.id}', this)">📋 کپی سوال و جواب</button>
            ${picked !== undefined ? `<button type="button" class="btn small" onclick="examClearAnswer('${qObj.id}')">پاک کردن گزینه</button>` : ''}
            <button type="button" class="btn small ${flagged ? 'primary' : ''}" onclick="examToggleFlag('${qObj.id}')">${flagged ? '🔖 نشان‌دار' : '🏷 نشان‌گذاری'}</button>
          </div>
        </div>
        <div class="exam-q-stem">${esc(qObj.q)}</div>
        <div class="exam-options-list">
          ${(qObj.options || []).map((opt, oi) => opt ? `
            <button type="button" class="exam-opt-btn ${picked === oi ? 'selected' : ''}" onclick="examPickOption('${qObj.id}', ${oi})">
              <span class="exam-opt-letter">${EXAM_LETTERS[oi]}</span>
              <span>${esc(opt)}</span>
            </button>
          ` : '').join('')}
        </div>
        ${renderQuestionTagBarHtml(qObj.id, s.exam.title || '', subjName || '', qObj.q || '', 'ex')}
        ${renderQuestionNoteBoxHtml(qObj.id, 'ex')}
        ${s.viewMode === 'single' ? `
          <div class="row between" style="margin-top:20px; padding-top:14px; border-top:1px solid var(--line);">
            <button type="button" class="btn" ${qIdx > 0 ? `onclick="examSelectQ(${qIdx - 1})"` : (sIdx > 0 ? `onclick="examSelectSubjQ(${sIdx - 1}, ${(s.subjects[sIdx - 1].questions || []).length - 1})"` : 'disabled')}>→ سوال / درس قبلی</button>
            <button type="button" class="btn primary" ${qIdx < subjTotal - 1 ? `onclick="examSelectQ(${qIdx + 1})"` : (sIdx < s.subjects.length - 1 ? `onclick="examSelectSubjQ(${sIdx + 1}, 0)"` : `onclick="finishExamRunner(false)"`)}>
              ${qIdx < subjTotal - 1 ? 'سوال بعدی ←' : (sIdx < s.subjects.length - 1 ? 'درس بعدی ←' : 'پایان و مشاهده کارنامه ✓')}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function updateExamHeaderAndNavStats(qId) {
    if (!examSession) return;
    const s = examSession;
    const info = qId ? findQuestionInSession(qId) : null;
    if (info) {
      const dot = document.querySelector(`#examRunnerOverlay .exam-q-dot[data-qid="${qId}"]`);
      if (dot) {
        const picked = s.answers[qId];
        const isPicked = picked !== undefined && picked !== null;
        if (s.mode === 'study') {
          const isRev = !!s.revealed[qId];
          const isRight = isPicked && Number(picked) === Number(info.qObj.answer);
          const isWrong = isPicked && Number(picked) !== Number(info.qObj.answer);
          dot.classList.toggle('res-ok', isRight || (!isPicked && isRev));
          dot.classList.toggle('res-bad', isWrong);
          dot.classList.toggle('answered', isPicked && !isRev);
        } else {
          dot.classList.toggle('answered', isPicked);
          dot.classList.toggle('flagged', !!s.flags[qId]);
        }
      }
      if (s.mode === 'exam') {
        const tabBtn = document.getElementById('exSubjTab-' + info.sIdx);
        if (tabBtn) {
          const sb = s.subjects[info.sIdx];
          const ansCnt = (sb.questions || []).filter(q => s.answers[q.id] !== undefined).length;
          tabBtn.textContent = `${sb.name} (${toFa(ansCnt)}/${toFa((sb.questions || []).length)})`;
        }
      }
    }

    if (s.mode === 'study') {
      const liveEl = document.getElementById('exPrepLiveStats');
      if (liveEl) {
        const st = computePrepLiveStats(s);
        liveEl.innerHTML = `${esc(s.scopeLabel)} · ${toFa(st.total)} سوال · پاسخ‌داده‌شده: <b>${toFa(st.answered)}</b> · <span style="color:var(--ok,#16a34a);font-weight:700;">✅ ${toFa(st.correct)}</span> · <span style="color:var(--danger,#dc2626);font-weight:700;">❌ ${toFa(st.wrong)}</span>${st.answered ? ` · درصد: <b>${toFa(st.pct)}٪</b>` : ''}`;
      }
    } else {
      const cntEl = document.getElementById('exTimedAnsweredCount');
      if (cntEl) {
        const totalAnsweredAll = Object.keys(s.answers || {}).length;
        const totalQAll = s.subjects.reduce((acc, sb) => acc + (sb.questions || []).length, 0);
        cntEl.textContent = `${s.scopeLabel} · پاسخ‌داده‌شده: ${toFa(totalAnsweredAll)} از ${toFa(totalQAll)}`;
      }
    }
  }

  function updateExamCardInDom(qId) {
    if (!examSession) return;
    const s = examSession;
    if (s.submitted || s.paused) {
      renderExamRunner();
      return;
    }
    const cardEl = document.getElementById('exq-' + qId);
    const info = findQuestionInSession(qId);
    if (!cardEl || !info) {
      renderExamRunner();
      return;
    }
    const existingTa = cardEl.querySelector('textarea');
    const draftNoteVal = existingTa ? existingTa.value : null;
    if (s.mode === 'study') {
      cardEl.outerHTML = buildStudyCardHtml(s, info.qObj, info.qIdx, info.subj.name, info.subjTotal, info.globalIdx);
    } else {
      cardEl.outerHTML = buildTimedCardHtml(s, info.qObj, info.qIdx, info.subj.name, info.subjTotal, info.sIdx);
    }
    if (draftNoteVal !== null) {
      const nextCard = document.getElementById('exq-' + qId);
      const nextTa = nextCard ? nextCard.querySelector('textarea') : null;
      if (nextTa && nextTa.value !== draftNoteVal) nextTa.value = draftNoteVal;
    }
    updateExamHeaderAndNavStats(qId);
  }

  window.examToggleReveal = function(qId) {
    if (!examSession) return;
    if (examSession.revealed[qId]) delete examSession.revealed[qId];
    else examSession.revealed[qId] = true;
    updateExamCardInDom(qId);
  };

  window.examToggleRevealAll = function() {
    if (!examSession) return;
    const allQs = examSession.subjects.flatMap(sb => sb.questions || []);
    const allOpen = allQs.length > 0 && allQs.every(q => !!examSession.revealed[q.id]);
    const bodyEl = document.querySelector('#examRunnerOverlay .exam-runner-body');
    const prevScroll = bodyEl ? bodyEl.scrollTop : 0;
    allQs.forEach(q => {
      if (allOpen) delete examSession.revealed[q.id];
      else examSession.revealed[q.id] = true;
    });
    renderExamRunner();
    const nextBodyEl = document.querySelector('#examRunnerOverlay .exam-runner-body');
    if (nextBodyEl) nextBodyEl.scrollTop = prevScroll;
  };

  window.examSwitchSessionMode = function(newMode) {
    if (!examSession) return;
    const target = newMode === 'exam' ? 'exam' : 'study';
    if (examSession.mode === 'study' && target === 'exam' && Object.keys(examSession.answers || {}).length > 0) {
      flushPrepReportSave(false).catch(() => {});
    }
    if (target === 'exam') {
      stopExamTimer();
      examSession.mode = 'exam';
      examSession.submitted = false;
      examSession.paused = false;
      examSession.revealed = {};
      examSession.answers = {};
      examSession.secondsLeft = examSession.totalSeconds;
      examSession.viewMode = 'list';
      examSession.activeQIdx = 0;
      startExamCountdown();
    } else {
      stopExamTimer();
      examSession.mode = 'study';
      examSession.submitted = false;
      examSession.paused = false;
      examSession.sessionPrevPrep = Object.assign({}, getExamPrepHistoryMap());
      examSession.viewMode = 'list';
    }
    renderExamRunner();
  };

  window.examPickOption = function(qId, optIdx) {
    if (!examSession || examSession.submitted) return;
    if (examSession.mode === 'study') {
      const info = findQuestionInSession(qId);
      examSession.answers[qId] = optIdx;
      examSession.revealed[qId] = true;
      if (info && info.qObj) {
        const isCorrect = Number(optIdx) === Number(info.qObj.answer);
        recordExamPrepAnswer(qId, optIdx, isCorrect);
      }
      schedulePrepReportSave();
      updateExamCardInDom(qId);
      return;
    }
    if (examSession.answers[qId] === optIdx) delete examSession.answers[qId];
    else examSession.answers[qId] = optIdx;
    updateExamCardInDom(qId);
  };

  window.examClearAnswer = function(qId) {
    if (!examSession || examSession.submitted) return;
    delete examSession.answers[qId];
    if (examSession.mode === 'study') {
      delete examSession.revealed[qId];
      schedulePrepReportSave();
    }
    updateExamCardInDom(qId);
  };

  window.examToggleFlag = function(qId) {
    if (!examSession) return;
    if (examSession.flags[qId]) delete examSession.flags[qId];
    else examSession.flags[qId] = true;
    updateExamCardInDom(qId);
  };

  window.examSetReviewFilter = function(flt) {
    if (!examSession) return;
    examSession.reviewFilter = flt;
    renderExamRunner();
  };

  window.finishExamRunner = async function(autoExpired) {
    if (!examSession || examSession.submitted || examSession.mode !== 'exam') return;
    if (!autoExpired && !confirm('پاسخ‌برگ شما ثبت و آزمون تصحیح شود؟')) return;
    examSession.submitted = true;
    stopExamTimer();

    const stats = computeExamScorecard(examSession);
    const snapshot = [];
    examSession.subjects.forEach(sb => {
      (sb.questions || []).forEach(q => {
        snapshot.push({
          id: q.id,
          subjName: sb.name,
          chapter: q.chapter || '',
          sourceLabel: q.sourceLabel || '',
          csvQuestionNum: q.csvQuestionNum || '',
          csvRowIndex: q.csvRowIndex || undefined,
          csvFileName: q.csvFileName || '',
          q: q.q,
          options: q.options || [],
          answer: Number(q.answer || 0),
          exp: q.exp || ''
        });
      });
    });

    const allTagMap = getExamTagsMap();
    const attemptTagsSnap = {};
    snapshot.forEach(item => {
      const tg = allTagMap[item.id];
      if (tg && (tg.difficulty || getTagFlagsArr(tg).length)) {
        attemptTagsSnap[item.id] = tg;
      }
    });

    const nowIso = new Date().toISOString();
    await saveExamResultRecord({
      id: 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      examId: examSession.exam.id,
      examTitle: examSession.exam.title,
      scopeLabel: examSession.scopeLabel,
      mode: 'timed',
      examScope: examSession.exam.examScope || 'general',
      subjectGroup: examSession.exam.subjectGroup || '',
      userId: (window.me && window.me.id) || '',
      userEmail: (window.me && window.me.email) || '',
      dateLabel: formatJalaliFull(new Date()).numericFa,
      correct: stats.correct,
      wrong: stats.wrong,
      blank: stats.blank,
      total: stats.total,
      rawPct: stats.rawPct,
      netPct: stats.netPct,
      answers: Object.assign({}, examSession.answers),
      questionTags: attemptTagsSnap,
      questionsSnapshot: snapshot,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    if (window.renderExamsHub) window.renderExamsHub();
    renderExamRunner();
  };

  function computeExamScorecard(sess) {
    let correct = 0, wrong = 0, blank = 0, total = 0;
    const neg = sess.exam.negativeMarking !== false;
    const perSubject = sess.subjects.map(s => {
      let sc = 0, sw = 0, sb = 0;
      const qs = s.questions || [];
      qs.forEach(q => {
        total++;
        const picked = sess.answers[q.id];
        if (picked === undefined || picked === null) { blank++; sb++; }
        else if (Number(picked) === Number(q.answer)) { correct++; sc++; }
        else { wrong++; sw++; }
      });
      const st = qs.length;
      const sRaw = st ? Math.round((sc / st) * 100) : 0;
      const sNet = st ? Math.round(((neg ? ((3 * sc - sw) / 3) : sc) / st) * 1000) / 10 : 0;
      return { name: s.name, id: s.id, total: st, correct: sc, wrong: sw, blank: sb, rawPct: sRaw, netPct: sNet };
    });
    const rawPct = total ? Math.round((correct / total) * 100) : 0;
    const netPct = total ? Math.round(((neg ? ((3 * correct - wrong) / 3) : correct) / total) * 1000) / 10 : 0;
    return { correct, wrong, blank, total, rawPct, netPct, neg, perSubject };
  }

  function renderExamRunner() {
    injectExamUpgradeStyles();
    applyExamFontScale();
    const overlay = document.getElementById('examRunnerOverlay');
    if (!overlay || !examSession) return;
    const s = examSession;
    const curSubj = s.subjects[s.activeSubjIdx] || s.subjects[0];
    const qs = curSubj.questions || [];
    const curQ = qs[s.activeQIdx] || qs[0];
    const totalAnsweredAll = Object.keys(s.answers).length;
    const totalQAll = s.subjects.reduce((acc, sb) => acc + (sb.questions || []).length, 0);

    if (s.mode === 'exam' && s.submitted) {
      const sc = computeExamScorecard(s);
      const allTagged = [];
      s.subjects.forEach(sb => {
        (sb.questions || []).forEach((q, qi) => {
          const picked = s.answers[q.id];
          const isBlank = picked === undefined || picked === null;
          const isCorrect = !isBlank && Number(picked) === Number(q.answer);
          const isFlagged = !!s.flags[q.id];
          if (s.reviewFilter === 'wrong' && (isBlank || isCorrect)) return;
          if (s.reviewFilter === 'blank' && !isBlank) return;
          if (s.reviewFilter === 'flagged' && !isFlagged) return;
          allTagged.push({ subjName: sb.name, idx: qi + 1, q, picked, isBlank, isCorrect, isFlagged });
        });
      });

      overlay.innerHTML = `
        <div class="exam-runner-head">
          <div>
            <b style="font-size:15.5px; color:var(--text);">📊 کارنامه آزمون: ${esc(s.exam.title)}</b>
            <div class="muted small">${esc(s.scopeLabel)} · ${toFa(sc.total)} سوال</div>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            ${renderExamFontControlsHtml()}
            <button type="button" class="btn small" onclick="examRestartSession('study')">📖 حالت آمادگی</button>
            <button type="button" class="btn small" onclick="examRestartSession('exam')">🔄 آزمون مجدد</button>
            <button type="button" class="btn primary small" onclick="closeExamRunner(true)">✕ بستن و بازگشت</button>
          </div>
        </div>
        <div class="exam-runner-body">
          <div class="exam-scorecard">
            <div class="cases-kpi-grid" style="margin:0;">
              <div class="cases-kpi-card"><div class="k-label">درصد کل با نمره منفی</div><div class="k-val" style="color:var(--main);">${toFa(sc.netPct)}٪</div></div>
              <div class="cases-kpi-card"><div class="k-label">درصد خام بدون نمره منفی</div><div class="k-val">${toFa(sc.rawPct)}٪</div></div>
              <div class="cases-kpi-card"><div class="k-label">پاسخ‌های صحیح</div><div class="k-val" style="color:var(--ok, #16a34a);">${toFa(sc.correct)}</div></div>
              <div class="cases-kpi-card"><div class="k-label">غلط / نزده</div><div class="k-val" style="color:var(--danger, #dc2626);">${toFa(sc.wrong)} / ${toFa(sc.blank)}</div></div>
            </div>

            <div class="panel" style="margin:0;">
              <h3 style="margin:0 0 12px;">نتایج به تفکیک درس</h3>
              <div style="overflow-x:auto;">
                <table class="calc-table">
                  <thead>
                    <tr>
                      <th>عنوان درس</th>
                      <th>تعداد سوال</th>
                      <th>صحیح</th>
                      <th>غلط</th>
                      <th>نزده</th>
                      <th>درصد نهایی</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sc.perSubject.map(r => `
                      <tr>
                        <td><b>${esc(r.name)}</b></td>
                        <td>${toFa(r.total)}</td>
                        <td style="color:var(--ok, #16a34a); font-weight:700;">${toFa(r.correct)}</td>
                        <td style="color:var(--danger, #dc2626); font-weight:700;">${toFa(r.wrong)}</td>
                        <td>${toFa(r.blank)}</td>
                        <td><b style="color:var(--main);">${toFa(r.netPct)}٪</b></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel" style="margin:0;">
              <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                <h3 style="margin:0;">📖 پاسخنامه تشریحی، درست و غلط‌ها و نکات شما (${toFa(allTagged.length)} سوال)</h3>
                <div class="row" style="gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn small ${s.reviewFilter === 'all' ? 'primary' : ''}" onclick="examSetReviewFilter('all')">همه سوالات</button>
                  <button type="button" class="btn small ${s.reviewFilter === 'wrong' ? 'primary' : ''}" onclick="examSetReviewFilter('wrong')">فقط غلط‌ها (${toFa(sc.wrong)})</button>
                  <button type="button" class="btn small ${s.reviewFilter === 'blank' ? 'primary' : ''}" onclick="examSetReviewFilter('blank')">نزده‌ها (${toFa(sc.blank)})</button>
                  <button type="button" class="btn small ${s.reviewFilter === 'flagged' ? 'primary' : ''}" onclick="examSetReviewFilter('flagged')">نشان‌دارها</button>
                </div>
              </div>
              <div style="display:grid; gap:14px;">
                ${allTagged.length ? allTagged.map(item => {
                  registerCopyableQuestion(item.q, item.subjName, item.idx);
                  return `
                  <div class="exam-q-card">
                    <div class="row between" style="gap:8px; flex-wrap:wrap;">
                      <div class="row" style="gap:6px; flex-wrap:wrap;">
                        <span class="art-tag">${esc(item.subjName)} · سوال ${toFa(item.idx)}</span>
                        ${item.q.chapter ? `<span class="pill">سرفصل: ${esc(item.q.chapter)}</span>` : ''}
                        ${formatExamSourceBadgeHtml(item.q.sourceLabel)}
                        ${formatAdminCsvBadgeHtml(item.q, item.idx)}
                      </div>
                      <div class="row" style="gap:6px; flex-wrap:wrap;">
                        <button type="button" class="btn small" onclick="copyExamQuestionById('${item.q.id}', this)">📋 کپی سوال و جواب</button>
                        <span class="pill ${item.isCorrect ? 'done' : (!item.isBlank ? 'bad' : '')}">
                          ${item.isBlank ? '⚪ نزده' : (item.isCorrect ? '✅ پاسخ صحیح' : '❌ پاسخ اشتباه')}
                        </span>
                      </div>
                    </div>
                    <div class="exam-q-stem">${esc(item.q.q)}</div>
                    <div class="exam-options-list">
                      ${(item.q.options || []).map((opt, oi) => {
                        if (!opt) return '';
                        const isRightOpt = oi === Number(item.q.answer);
                        const isUserWrong = item.picked === oi && !isRightOpt;
                        const pickedTag = item.picked === oi ? ' (انتخاب شما)' : '';
                        return `
                          <div class="exam-opt-btn ${isRightOpt ? 'correct' : ''} ${isUserWrong ? 'wrong' : ''}" style="cursor:default;">
                            <span class="exam-opt-letter">${EXAM_LETTERS[oi]}</span>
                            <span>${esc(opt)}${pickedTag ? ` <small style="font-weight:800;">${pickedTag}</small>` : ''}</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                    ${item.q.exp ? `<div class="exam-exp-box"><b>💡 توضیح و مستند قانونی:</b> ${formatExamExplanationHtml(item.q.exp, item.subjName || s.exam.title)}</div>` : ''}
                    ${renderQuestionTagBarHtml(item.q.id, s.exam.title || '', item.subjName || '', item.q.q || '', 'rev')}
                    ${renderQuestionNoteBoxHtml(item.q.id, 'rev')}
                  </div>
                `;
                }).join('') : '<div class="muted small">موردی با این فیلتر وجود ندارد.</div>'}
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (s.mode === 'study') {
      const allQs = s.subjects.flatMap(sb => sb.questions || []);
      const allRevealedInExam = allQs.length > 0 && allQs.every(q => !!s.revealed[q.id]);
      const prepStats = computePrepLiveStats(s);

      overlay.innerHTML = `
        <div class="exam-runner-head">
          <div>
            <b style="font-size:15.5px; color:var(--text);">📖 حالت آمادگی (بدون تایمر): ${esc(s.exam.title)}</b>
            <div class="muted small" id="exPrepLiveStats">
              ${esc(s.scopeLabel)} · ${toFa(prepStats.total)} سوال · پاسخ‌داده‌شده: <b>${toFa(prepStats.answered)}</b> · <span style="color:var(--ok,#16a34a);font-weight:700;">✅ ${toFa(prepStats.correct)}</span> · <span style="color:var(--danger,#dc2626);font-weight:700;">❌ ${toFa(prepStats.wrong)}</span>${prepStats.answered ? ` · درصد: <b>${toFa(prepStats.pct)}٪</b>` : ''}
            </div>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            ${renderExamFontControlsHtml()}
            <button type="button" class="btn small" onclick="openExamQuickJumpSheet()" title="پرش سریع بین سوالات و اولین سوال نزده">🔢 پرش سریع</button>
            <button type="button" class="btn small" onclick="examSavePrepReportNow()" title="ثبت فوری گزارش آمادگی در کارنامه شما و پنل مدیر">
              💾 ثبت گزارش آمادگی
            </button>
            <button type="button" class="btn small" onclick="examToggleRevealAll()">
              ${allRevealedInExam ? '🙈 بستن همه پاسخ‌ها' : '👁 نمایش همه پاسخ‌ها'}
            </button>
            <button type="button" class="btn small" onclick="examSwitchSessionMode('exam')" title="تغییر به آزمون زمان‌دار با تایمر و کارنامه">
              ⏱ آزمون زمان‌دار
            </button>
            <button type="button" class="btn primary small" onclick="closeExamRunner(true)">✕ بستن</button>
          </div>
        </div>

        <div class="exam-subj-tabs">
          ${s.subjects.map((sb, idx) => `
            <button type="button" class="exam-subj-tab ${idx === s.activeSubjIdx ? 'active' : ''}" onclick="examSwitchSubj(${idx})">
              ${esc(sb.name)} (${toFa((sb.questions || []).length)})
            </button>
          `).join('')}
        </div>

        <div class="exam-runner-body">
          <div class="exam-workspace-grid">
            <div style="display:grid; gap:22px;">
              ${(() => {
                let runningG = 0;
                return s.subjects.map((sb, sIdx) => {
                  const sQs = sb.questions || [];
                  return `
                    <section id="exSubjSec-${sIdx}" class="ex-subj-sec">
                      <div class="ex-subj-banner">
                        <span>📚 ${esc(sb.name)}</span>
                        <span class="pill done">${toFa(sQs.length)} سوال</span>
                      </div>
                      ${sQs.map((q, qi) => {
                        runningG++;
                        return buildStudyCardHtml(s, q, qi, sb.name, sQs.length, runningG);
                      }).join('')}
                    </section>
                  `;
                }).join('');
              })()}
            </div>

            <aside class="exam-palette-card">
              <b style="font-size:14px; color:var(--text);">ناوبری سریع سوالات (${toFa(allQs.length)})</b>
              <div class="muted small" style="margin-top:4px;">انتخاب هر گزینه = تصحیح فوری و ثبت در گزارش آمادگی</div>
              <div style="display:grid; gap:12px; margin-top:12px;">
                ${s.subjects.map(sb => {
                  const sQs = sb.questions || [];
                  return `
                    <div>
                      <div style="font-size:11.5px; font-weight:800; color:var(--main); margin-bottom:6px;">${esc(sb.name)} (${toFa(sQs.length)})</div>
                      <div class="exam-palette-grid" style="margin-top:0;">
                        ${sQs.map((q, qi) => {
                          const picked = s.answers[q.id];
                          const isPicked = picked !== undefined && picked !== null;
                          const isRev = !!s.revealed[q.id];
                          const isRight = isPicked && Number(picked) === Number(q.answer);
                          const isWrong = isPicked && Number(picked) !== Number(q.answer);
                          const stCls = isWrong ? 'res-bad' : ((isRight || isRev) ? 'res-ok' : (isPicked ? 'answered' : ''));
                          const qTg = window.getExamQuestionTag(q.id);
                          const hasTg = !!(qTg && (qTg.difficulty || getTagFlagsArr(qTg).length));
                          const tgCls = hasTg ? ('has-tag' + (qTg.difficulty ? ' tag-' + qTg.difficulty : '')) : '';
                          return `<button type="button" data-qid="${q.id}" class="exam-q-dot ${stCls} ${tgCls}" onclick="examJumpToQ('${q.id}')">${toFa(qi + 1)}</button>`;
                        }).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
              <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--line); display:grid; gap:6px; font-size:12px; color:var(--muted);">
                <div>🟢 سبز: پاسخ صحیح · 🔴 قرمز: پاسخ اشتباه</div>
                <div>💡 پاسخ‌های شما در حالت آمادگی به‌صورت خودکار برای شما و مدیر ثبت و تصحیح می‌شود.</div>
                <div>📝 یادداشت و سطح سختی زیر هر سوال بین اپلیکیشن و وب همگام می‌ماند.</div>
              </div>
            </aside>
          </div>
        </div>
      `;
      return;
    }

    overlay.innerHTML = `
      <div class="exam-runner-head">
        <div>
          <b style="font-size:15.5px; color:var(--text);">📝 آزمون زمان‌دار: ${esc(s.exam.title)}</b>
          <div class="muted small" id="exTimedAnsweredCount">${esc(s.scopeLabel)} · پاسخ‌داده‌شده: ${toFa(totalAnsweredAll)} از ${toFa(totalQAll)}</div>
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <div class="exam-timer-box ${s.secondsLeft <= 300 ? 'low' : ''}">
            <span>⏱</span>
            <span id="exTimerDisplay">${formatMmSs(s.secondsLeft)}</span>
            <button type="button" class="btn small" style="padding:2px 8px; font-size:11px;" onclick="examTogglePause()">${s.paused ? '▶ ادامه' : '⏸ توقف'}</button>
          </div>
          ${renderExamFontControlsHtml()}
          <button type="button" class="btn small" onclick="openExamQuickJumpSheet()" title="پرش سریع بین سوالات و اولین سوال نزده">🔢 پرش سریع</button>
          <button type="button" class="btn small" onclick="examSwitchSessionMode('study')">📖 حالت آمادگی</button>
          <button type="button" class="btn small" onclick="examToggleViewMode('${s.viewMode === 'single' ? 'list' : 'single'}')">
            ${s.viewMode === 'single' ? '☰ نمای لیستی' : '🎯 تک‌سوالی'}
          </button>
          <button type="button" class="btn primary small" onclick="finishExamRunner(false)">✓ تصحیح و کارنامه</button>
          <button type="button" class="btn danger small" onclick="closeExamRunner(false)">✕ خروج</button>
        </div>
      </div>

      <div class="exam-subj-tabs">
        ${s.subjects.map((sb, idx) => {
          const ansCnt = (sb.questions || []).filter(q => s.answers[q.id] !== undefined).length;
          return `
            <button type="button" id="exSubjTab-${idx}" class="exam-subj-tab ${idx === s.activeSubjIdx ? 'active' : ''}" onclick="examSwitchSubj(${idx})">
              ${esc(sb.name)} (${toFa(ansCnt)}/${toFa((sb.questions || []).length)})
            </button>
          `;
        }).join('')}
      </div>

      <div class="exam-runner-body">
        <div class="exam-workspace-grid">
          <div style="display:grid; gap:20px;">
            ${s.paused ? `
              <div class="empty-glass-card" style="margin:20px auto;">
                <div class="empty-icon">⏸</div>
                <h3>زمان آزمون متوقف شده است</h3>
                <p>برای جلوگیری از دیده شدن سوالات هنگام استراحت متن سوال پنهان شده است.</p>
                <div style="margin-top:16px;"><button type="button" class="btn primary" onclick="examTogglePause()">▶ ادامه آزمون</button></div>
              </div>
            ` : (s.viewMode === 'single'
                ? buildTimedCardHtml(s, curQ, s.activeQIdx, curSubj.name, qs.length, s.activeSubjIdx)
                : s.subjects.map((sb, sIdx) => {
                    const sQs = sb.questions || [];
                    return `
                      <section id="exSubjSec-${sIdx}" class="ex-subj-sec">
                        <div class="ex-subj-banner">
                          <span>📚 ${esc(sb.name)}</span>
                          <span class="pill done">${toFa(sQs.length)} سوال</span>
                        </div>
                        ${sQs.map((q, qi) => buildTimedCardHtml(s, q, qi, sb.name, sQs.length, sIdx)).join('')}
                      </section>
                    `;
                  }).join(''))}
          </div>

          <aside class="exam-palette-card">
            <b style="font-size:14px; color:var(--text);">پاسخ‌برگ کل سوالات (${toFa(totalQAll)})</b>
            <div class="muted small" style="margin-top:4px;">این بخش اسکرول جداگانه دارد · روی هر شماره کلیک کنید</div>
            <div style="display:grid; gap:12px; margin-top:12px;">
              ${s.subjects.map((sb, sIdx) => {
                const sQs = sb.questions || [];
                return `
                  <div>
                    <div style="font-size:11.5px; font-weight:800; color:var(--main); margin-bottom:6px;">${esc(sb.name)} (${toFa(sQs.length)})</div>
                    <div class="exam-palette-grid" style="margin-top:0;">
                      ${sQs.map((q, qi) => {
                        const isAns = s.answers[q.id] !== undefined;
                        const isFlag = !!s.flags[q.id];
                        const isCur = s.viewMode === 'single' && sIdx === s.activeSubjIdx && qi === s.activeQIdx;
                        const qTg = window.getExamQuestionTag(q.id);
                        const hasTg = !!(qTg && (qTg.difficulty || getTagFlagsArr(qTg).length));
                        const tgCls = hasTg ? ('has-tag' + (qTg.difficulty ? ' tag-' + qTg.difficulty : '')) : '';
                        return `<button type="button" data-qid="${q.id}" class="exam-q-dot ${isAns ? 'answered' : ''} ${isFlag ? 'flagged' : ''} ${isCur ? 'current' : ''} ${tgCls}" onclick="${s.viewMode === 'list' ? `examJumpToQ('${q.id}')` : `examSelectSubjQ(${sIdx}, ${qi})`}">${toFa(qi + 1)}</button>`;
                      }).join('')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--line); display:grid; gap:6px; font-size:12px; color:var(--muted);">
              <div>🟢 سبز: پاسخ‌داده‌شده · 🟧 حاشیه نارنجی: نشان‌دار</div>
              <div>⚖️ وضعیت نمره منفی: <b>${s.exam.negativeMarking !== false ? 'یک‌سوم فعال' : 'غیرفعال'}</b></div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  window.toggleMobileDockDrawer = function(show) {
    const back = document.getElementById('mobileDockDrawerBack');
    if (!back) return;
    if (typeof show === 'boolean') back.classList.toggle('hidden', !show);
    else back.classList.toggle('hidden');
  };

  // -------------------------------------------------------------------
  // مدیریت نصب PWA (اپلیکیشن برائت) و وضعیت اتصال آنلاین / آفلاین
  // -------------------------------------------------------------------
  let deferredPWAInstallPrompt = window.__deferredPWA || null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPWAInstallPrompt = e;
    window.__deferredPWA = e;
    const hBtn = document.getElementById('pwaInstallHeaderBtn');
    const dBtn = document.getElementById('pwaInstallDockBtn');
    if (hBtn) hBtn.style.display = 'inline-flex';
    if (dBtn) dBtn.style.display = 'flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredPWAInstallPrompt = null;
    window.__deferredPWA = null;
    const hBtn = document.getElementById('pwaInstallHeaderBtn');
    const dBtn = document.getElementById('pwaInstallDockBtn');
    if (hBtn) hBtn.style.display = 'none';
    if (dBtn) dBtn.style.display = 'none';
    if (typeof toast === 'function') toast('اپلیکیشن «برائت» با موفقیت نصب شد.');
  });

  window.downloadAndroidApk = async function() {
    const localUrl = './downloads/baraat.apk';
    const ghPagesUrl = 'https://rezavafaei1990.github.io/law-planner/downloads/baraat.apk';
    const triggerDownload = (url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'baraat.apk';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 500);
      if (typeof toast === 'function') toast('دانلود فایل نصبی اندروید (baraat.apk) آغاز شد.');
    };

    try {
      const res = await fetch(localUrl, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        triggerDownload(localUrl);
        return;
      }
    } catch(e) {}

    try {
      const resGh = await fetch(ghPagesUrl, { method: 'HEAD', cache: 'no-store' });
      if (resGh.ok) {
        triggerDownload(ghPagesUrl);
        return;
      }
    } catch(e) {}

    if (window.showModal) {
      window.showModal(`
        <h2>🤖 فایل نصبی اندروید (APK)</h2>
        <p style="line-height:1.9; font-size:13.5px; margin:14px 0; color:var(--text);">
          فایل <b>baraat.apk</b> پس از آپلود پوشه <b>android</b> و فایل گردش‌کار گیتهاب به صورت خودکار توسط GitHub Actions ساخته می‌شود و مستقیماً از همین دکمه قابل دانلود خواهد بود.
        </p>
        <div class="modal-actions">
          <button class="btn primary" onclick="closeModal()">متوجه شدم</button>
        </div>
      `);
    }
  };

  window.triggerNativePwaPrompt = async function() {
    if (!deferredPWAInstallPrompt) return;
    deferredPWAInstallPrompt.prompt();
    const { outcome } = await deferredPWAInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPWAInstallPrompt = null;
      const hBtn = document.getElementById('pwaInstallHeaderBtn');
      const dBtn = document.getElementById('pwaInstallDockBtn');
      if (hBtn) hBtn.style.display = 'none';
      if (dBtn) dBtn.style.display = 'none';
      if (typeof closeModal === 'function') closeModal();
    }
  };

  window.promptPWAInstall = async function() {
    const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    if (window.showModal) {
      window.showModal(`
        <h2>📲 دانلود و نصب اپلیکیشن «برائت»</h2>
        <div style="display:grid; gap:14px; margin:16px 0;">
          <div class="callout-info" style="border-radius:14px; padding:16px;">
            <div style="font-weight:800; font-size:15px; color:var(--main); margin-bottom:6px;">🤖 نسخه نصبی مستقیم اندروید (فایل APK)</div>
            <p style="font-size:13px; color:var(--text); line-height:1.8; margin:0 0 12px;">
              مخصوص گوشی‌های اندروید با قابلیت اجرای تمام‌صفحه، کارکرد آفلاین و ثبت مستقیم آلارم مواعد قانونی در تقویم گوشی.
            </p>
            <button type="button" class="btn primary" onclick="downloadAndroidApk()" style="width:100%; justify-content:center;">
              ⬇️ دانلود اپلیکیشن اندروید (baraat.apk)
            </button>
          </div>

          <div class="surface-box" style="border-radius:14px; padding:16px;">
            <div style="font-weight:800; font-size:15px; color:var(--text); margin-bottom:6px;">🌐 نصب نسخه وب اپلیکیشن (PWA)</div>
            ${isIOS ? `
              <div style="line-height:2; font-size:13px; color:var(--text);">
                <p style="margin:0 0 6px;">برای نصب روی آیفون و آیپد در مرورگر Safari:</p>
                <ol style="padding-right:20px; margin:0;">
                  <li>دکمه <b>Share (اشتراک‌گذاری)</b> ⎋ را لمس کنید.</li>
                  <li>گزینه <b>Add to Home Screen</b> ➕ را انتخاب کنید.</li>
                  <li>دکمه <b>Add</b> را بزنید.</li>
                </ol>
              </div>
            ` : (deferredPWAInstallPrompt ? `
              <p style="font-size:13px; color:var(--text); line-height:1.8; margin:0 0 12px;">
                نصب آنی و سبک بدون نیاز به دانلود فایل نصبی برای گوشی و کامپیوتر.
              </p>
              <button type="button" class="btn" onclick="triggerNativePwaPrompt()" style="width:100%; justify-content:center;">
                📲 نصب فوری نسخه وب (PWA)
              </button>
            ` : `
              <p style="font-size:13px; color:var(--text); line-height:1.8; margin:0;">
                از منوی سه نقطه مرورگر خود گزینه <b>Install App</b> یا <b>Add to Home Screen</b> را انتخاب کنید.
              </p>
            `)}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="closeModal()">بستن</button>
        </div>
      `);
    }
  };

  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    const banner = document.getElementById('offlineBanner');
    if (banner) {
      banner.classList.toggle('hidden', isOnline);
    }
    const syncBadge = document.getElementById('cloudSyncBadge');
    if (syncBadge) {
      syncBadge.innerHTML = isOnline
        ? '<span class="status-dot green"></span> آنلاین (همگام با Supabase)'
        : '<span class="status-dot amber"></span> حالت آفلاین (داده‌های دستگاه)';
    }
  }

  window.addEventListener('online', () => {
    updateOnlineStatus();
    if (typeof toast === 'function') toast('اتصال آنلاین برقرار شد؛ اطلاعات با سرور همگام شد.');
    if (typeof window.syncAllFromSupabase === 'function') window.syncAllFromSupabase(true);
  });

  window.addEventListener('offline', () => {
    updateOnlineStatus();
    if (typeof toast === 'function') toast('حالت آفلاین فعال شد؛ تمام اطلاعات و قوانین از حافظه دستگاه خوانده می‌شوند.');
  });

  // -------------------------------------------------------------------
  // مدیریت تم شب و روز (Dark / Light Theme)
  // -------------------------------------------------------------------
  const THEME_KEY = 'baraat_theme_v1';

  window.applyTheme = function(mode) {
    const m = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = m;
    try { localStorage.setItem(THEME_KEY, m); } catch (e) {}

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', m === 'dark' ? '#0f141d' : '#f4f6fb');

    const headerBtn = document.getElementById('themeToggleBtn');
    if (headerBtn) {
      headerBtn.innerHTML = m === 'dark' ? '☀️<span class="theme-lbl-long"> تم روز</span>' : '🌙<span class="theme-lbl-long"> تم شب</span>';
      headerBtn.title = m === 'dark' ? 'تغییر به تم روز' : 'تغییر به تم شب';
    }
    const dockBtn = document.getElementById('themeToggleDockBtn');
    if (dockBtn) {
      dockBtn.innerHTML = `<span class="dock-icon">${m === 'dark' ? '☀️' : '🌙'}</span><span class="dock-label">${m === 'dark' ? 'تم روز' : 'تم شب'}</span>`;
    }
    const drawerBtn = document.getElementById('themeToggleDrawerBtn');
    if (drawerBtn) {
      drawerBtn.innerHTML = m === 'dark' ? '☀️ تم روز' : '🌙 تم شب';
    }
  };

  window.toggleTheme = function() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    window.applyTheme(isDark ? 'light' : 'dark');
  };

  function checkStandalone() {
    const isNativeApk = !!window.BaraatAndroid;
    const isStandalone = isNativeApk || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    document.body.classList.toggle('pwa-standalone', isStandalone);
    const hBtn = document.getElementById('pwaInstallHeaderBtn');
    const dBtn = document.getElementById('pwaInstallDockBtn');
    if (isStandalone) {
      if (hBtn) hBtn.style.display = 'none';
      if (dBtn) dBtn.style.display = 'none';
    } else {
      if (hBtn) hBtn.style.display = 'inline-flex';
      if (dBtn) dBtn.style.display = 'flex';
    }
  }

  // -------------------------------------------------------------------
  // ۵. ناوبری ۶ بخشی (قوانین، دانشجویان، وکلا، مقالات، معرفی، تماس) و تضمین پنهان‌سازی بخش مدیریت
  // -------------------------------------------------------------------
  window._studentsSub = 'planner';
  window._lawyersSub = 'cases';

  window.setStudentsSub = function(sub, keepExamSection) {
    window._studentsSub = sub === 'exams' ? 'exams' : 'planner';
    if (window._studentsSub === 'exams' && !keepExamSection) {
      examHubSection = 'exams';
    }
    document.getElementById('tab-planner')?.classList.toggle('hidden', window._studentsSub !== 'planner');
    document.getElementById('tab-exams')?.classList.toggle('hidden', window._studentsSub !== 'exams');
    syncStudentsSubTabsActive();
    if (window._studentsSub === 'planner') {
      if (typeof enterPlanner === 'function') enterPlanner();
    } else {
      window.renderExamsHub();
    }
    try { history.replaceState(null, '', '#' + (window._studentsSub === 'exams' && examHubSection === 'notebook' ? 'notebook' : window._studentsSub)); } catch (e) {}
  };

  window.setLawyersSub = function(sub) {
    window._lawyersSub = ['cases', 'deadlines', 'calculator'].includes(sub) ? sub : 'cases';
    document.getElementById('tab-cases')?.classList.toggle('hidden', window._lawyersSub !== 'cases');
    document.getElementById('tab-deadlines')?.classList.toggle('hidden', window._lawyersSub !== 'deadlines');
    document.getElementById('tab-calculator')?.classList.toggle('hidden', window._lawyersSub !== 'calculator');
    document.querySelectorAll('[data-lawyerssub]').forEach(b => b.classList.toggle('active', b.dataset.lawyerssub === window._lawyersSub));
    if (window._lawyersSub === 'cases') window.renderCases();
    if (window._lawyersSub === 'deadlines') window.renderDeadlines();
    if (window._lawyersSub === 'calculator') window.renderCalculators();
    try { history.replaceState(null, '', '#' + window._lawyersSub); } catch (e) {}
  };

  window.go = function(tab) {
    const t = String(tab || 'search').replace(/^#/, '');
    if (t === 'admin' && !window.isAdmin) {
      return window.go('search');
    }

    if (t === 'articles') {
      window.location.href = './articles.html';
      return;
    }

    let topHub = 'search';
    let exactSub = t;
    if (t === 'search') {
      topHub = 'search';
      exactSub = 'search';
    } else if (t === 'articles') {
      topHub = 'articles';
      exactSub = 'articles';
    } else if (t === 'students' || t === 'planner' || t === 'exams' || t === 'notebook') {
      topHub = 'students';
      if (t === 'notebook') {
        window._studentsSub = 'exams';
        examHubSection = 'notebook';
      } else if (t !== 'students') {
        window._studentsSub = t;
      }
      exactSub = window._studentsSub;
    } else if (t === 'lawyers' || t === 'cases' || t === 'deadlines' || t === 'calculator') {
      topHub = 'lawyers';
      if (t !== 'lawyers') window._lawyersSub = t;
      exactSub = window._lawyersSub;
    } else if (['about', 'contact', 'admin'].includes(t)) {
      topHub = t;
      exactSub = t;
    } else {
      topHub = 'search';
      exactSub = 'search';
    }

    ['tab-search', 'hub-students', 'hub-lawyers', 'tab-articles', 'tab-about', 'tab-contact', 'tab-admin'].forEach(cid => {
      const el = document.getElementById(cid);
      if (!el) return;
      const show = (cid === 'hub-' + topHub) || (cid === 'tab-' + topHub);
      el.classList.toggle('hidden', !show);
    });

    document.querySelectorAll('[data-tab]').forEach(b => {
      const dt = b.dataset.tab;
      const isActive = (dt === topHub) || (dt === exactSub);
      b.classList.toggle('active', isActive);
    });

    window.toggleMobileDockDrawer(false);

    if (topHub === 'search') {
      try { history.replaceState(null, '', '#search'); } catch (e) {}
      window.syncAllFromSupabase();
    } else if (topHub === 'articles') {
      window.renderArticles();
      window.syncAllFromSupabase();
      try { history.replaceState(null, '', '#articles'); } catch (e) {}
    } else if (topHub === 'students') {
      window.setStudentsSub(window._studentsSub, t === 'notebook' || t === 'students');
      window.syncAllFromSupabase();
    } else if (topHub === 'lawyers') {
      window.setLawyersSub(window._lawyersSub);
      window.syncAllFromSupabase();
    } else if (topHub === 'about') {
      window.renderAbout();
      window.syncAllFromSupabase();
      try { history.replaceState(null, '', '#about'); } catch (e) {}
    } else if (topHub === 'contact') {
      window.renderContact();
      window.syncAllFromSupabase();
      try { history.replaceState(null, '', '#contact'); } catch (e) {}
    } else if (topHub === 'admin') {
      if (window.LAWDB && LAWDB.admRefresh) LAWDB.admRefresh();
      window.renderAdminPanels();
      window.syncAllFromSupabase();
      if (window.refreshAdminMonitor) window.refreshAdminMonitor();
      try { history.replaceState(null, '', '#admin'); } catch (e) {}
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // -------------------------------------------------------------------
  // رنگ‌بندی مجزا و خودکار باکس هر درس در بخش مطالعه روزانه + فرم ثبت‌نام با کد تأیید ایمیل (OTP)
  // -------------------------------------------------------------------
  function hashSubjectColorIdx(seed) {
    const str = String(seed || '').trim();
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 8;
  }

  function applyPlannerSubjectColors() {
    const plannerRoot = document.getElementById('tab-planner') || document.getElementById('hub-students');
    if (!plannerRoot || plannerRoot.classList.contains('hidden')) return;
    injectExamUpgradeStyles();
    const blockById = new Map();
    const subjNameById = new Map();
    try {
      const api = window.BARAAT_PLANNER_API;
      if (api && typeof api.getState === 'function') {
        const st = api.getState() || {};
        (st.subjects || []).forEach((s, idx) => {
          if (s && s.id) subjNameById.set(s.id, { name: s.name || s.id, idx });
        });
        (st.days || []).forEach(d => {
          (d.blocks || []).forEach(b => { if (b && b.id) blockById.set(b.id, b); });
        });
        (st.subjectSections || []).forEach(b => { if (b && b.id) blockById.set(b.id, b); });
      }
    } catch (e) {}

    const cards = plannerRoot.querySelectorAll('[id^="blk-"], .block-card, .study-block, .day-block');
    cards.forEach((el, fallbackIdx) => {
      if (!el || !el.classList) return;
      for (let i = 0; i < 8; i++) el.classList.remove('baraat-subj-theme-' + i);
      const rawId = (el.id || '').replace(/^blk-/, '');
      const blk = blockById.get(rawId);
      let idx;
      if (blk && blk.subjectId && subjNameById.has(blk.subjectId)) {
        idx = subjNameById.get(blk.subjectId).idx % 8;
      } else if (blk) {
        idx = hashSubjectColorIdx(blk.law || blk.title || blk.subjectId || rawId);
      } else {
        const heading = el.querySelector('h4, h5, b, strong, .blk-law, .blk-title');
        const txt = heading ? heading.textContent : '';
        idx = txt ? hashSubjectColorIdx(txt) : (fallbackIdx % 8);
      }
      el.classList.add('baraat-subj-theme-' + idx);
    });
  }

  let plannerColorObserver = null;
  function startPlannerSubjectColorObserver() {
    applyPlannerSubjectColors();
    const plannerRoot = document.getElementById('tab-planner') || document.getElementById('hub-students');
    if (!plannerRoot || plannerColorObserver || typeof MutationObserver === 'undefined') return;
    let raf = 0;
    plannerColorObserver = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyPlannerSubjectColors();
      });
    });
    plannerColorObserver.observe(plannerRoot, { childList: true, subtree: true });
  }

  // فرم ورود و ثبت‌نام همراه با مرحله تأیید کد ایمیل (OTP)
  let otpCooldownTimer = null;
  let otpAuthState = { mode: 'signin', step: 'form', email: '', cooldown: 0 };

  function renderBaraatAuthOtpModal() {
    const m = document.getElementById('modal');
    const back = document.getElementById('modalBack');
    if (!m || !back) return;
    const isVerify = otpAuthState.step === 'verify';
    const isSignup = otpAuthState.mode === 'signup';
    m.innerHTML = `
      <h2 style="margin:0 0 6px;">${isVerify ? '✉️ تأیید ایمیل با کد ارسال‌شده' : (isSignup ? '📝 ثبت‌نام کاربر جدید' : '🔐 ورود به حساب کاربری')}</h2>
      ${!isVerify ? `
        <div class="row" style="gap:6px; margin:10px 0 14px;">
          <button type="button" class="btn small ${!isSignup ? 'primary' : ''}" style="flex:1;" onclick="setBaraatAuthMode('signin')">ورود</button>
          <button type="button" class="btn small ${isSignup ? 'primary' : ''}" style="flex:1;" onclick="setBaraatAuthMode('signup')">ثبت‌نام با کد ایمیل</button>
        </div>
        <div id="baraatAuthErr" class="callout-warn hidden" style="margin-bottom:10px; padding:8px 10px; border-radius:10px; font-size:12px;"></div>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <label>ایمیل *</label>
            <input id="baraatAuthEmail" type="email" dir="ltr" value="${esc(otpAuthState.email)}" placeholder="name@example.com" autocomplete="email">
          </div>
          <div class="field" style="grid-column:1/-1;">
            <label>رمز عبور *</label>
            <input id="baraatAuthPass" type="password" dir="ltr" placeholder="حداقل ۶ کاراکتر" autocomplete="${isSignup ? 'new-password' : 'current-password'}" onkeydown="if(event.key==='Enter')submitBaraatAuthForm()">
          </div>
        </div>
        ${isSignup ? '<div class="muted small" style="margin-top:8px;">پس از ثبت‌نام، کد تأیید به ایمیل شما ارسال می‌شود و برای فعال‌سازی حساب باید آن را وارد کنید.</div>' : ''}
        <div class="modal-actions">
          <button type="button" class="btn" onclick="closeModal()">انصراف</button>
          <button type="button" id="baraatAuthSubmitBtn" class="btn primary" onclick="submitBaraatAuthForm()">${isSignup ? 'ثبت‌نام و ارسال کد تأیید' : 'ورود به حساب'}</button>
        </div>
      ` : `
        <div class="callout-info" style="margin:10px 0 12px; padding:10px 12px; border-radius:10px; font-size:12.5px; line-height:1.8;">
          کد تأیید به نشانی <b dir="ltr">${esc(otpAuthState.email)}</b> ارسال شد. لطفاً صندوق ورودی یا پوشه Spam را بررسی کرده و کد را وارد نمایید.
        </div>
        <div id="baraatAuthErr" class="callout-warn hidden" style="margin-bottom:10px; padding:8px 10px; border-radius:10px; font-size:12px;"></div>
        <div class="field">
          <label>کد تأیید ایمیل *</label>
          <input id="baraatOtpCode" type="text" inputmode="numeric" dir="ltr" maxlength="8" placeholder="مثلاً 123456" style="text-align:center; font-size:18px; letter-spacing:6px; font-weight:800;" onkeydown="if(event.key==='Enter')submitBaraatOtpVerify()">
        </div>
        <div class="row between" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn small" onclick="backToBaraatAuthForm()">← تغییر ایمیل</button>
          <button type="button" id="baraatOtpResendBtn" class="btn small" ${otpAuthState.cooldown > 0 ? 'disabled' : ''} onclick="resendBaraatOtpCode()">
            ${otpAuthState.cooldown > 0 ? 'ارسال مجدد (' + toFa(otpAuthState.cooldown) + ' ثانیه)' : '🔄 ارسال مجدد کد'}
          </button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" onclick="closeModal()">بستن</button>
          <button type="button" id="baraatOtpVerifyBtn" class="btn primary" onclick="submitBaraatOtpVerify()">✓ تأیید کد و ورود</button>
        </div>
      `}
    `;
    back.classList.add('show');
  }

  function startOtpCooldown(sec) {
    if (otpCooldownTimer) clearInterval(otpCooldownTimer);
    otpAuthState.cooldown = sec || 60;
    otpCooldownTimer = setInterval(() => {
      otpAuthState.cooldown = Math.max(0, otpAuthState.cooldown - 1);
      const btn = document.getElementById('baraatOtpResendBtn');
      if (btn) {
        btn.disabled = otpAuthState.cooldown > 0;
        btn.textContent = otpAuthState.cooldown > 0 ? 'ارسال مجدد (' + toFa(otpAuthState.cooldown) + ' ثانیه)' : '🔄 ارسال مجدد کد';
      }
      if (otpAuthState.cooldown <= 0) {
        clearInterval(otpCooldownTimer);
        otpCooldownTimer = null;
      }
    }, 1000);
  }

  function showBaraatAuthErr(msg) {
    const el = document.getElementById('baraatAuthErr');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  window.setBaraatAuthMode = function(mode) {
    otpAuthState.mode = mode === 'signup' ? 'signup' : 'signin';
    otpAuthState.step = 'form';
    renderBaraatAuthOtpModal();
  };

  window.backToBaraatAuthForm = function() {
    otpAuthState.step = 'form';
    renderBaraatAuthOtpModal();
  };

  window.submitBaraatAuthForm = async function() {
    if (!window.sb || !window.sb.auth) {
      showBaraatAuthErr('سرویس احراز هویت در دسترس نیست.');
      return;
    }
    const email = (document.getElementById('baraatAuthEmail')?.value || '').trim();
    const password = document.getElementById('baraatAuthPass')?.value || '';
    if (!email || !password) return showBaraatAuthErr('ایمیل و رمز عبور را وارد کنید.');
    if (otpAuthState.mode === 'signup' && password.length < 6) {
      return showBaraatAuthErr('رمز عبور باید حداقل ۶ کاراکتر باشد.');
    }
    otpAuthState.email = email;
    const btn = document.getElementById('baraatAuthSubmitBtn');
    if (btn) btn.disabled = true;
    showBaraatAuthErr('');
    try {
      if (otpAuthState.mode === 'signin') {
        const res = await window.sb.auth.signInWithPassword({ email, password });
        if (res.error) {
          const msg = String(res.error.message || '');
          if (msg.toLowerCase().includes('email not confirmed')) {
            otpAuthState.step = 'verify';
            renderBaraatAuthOtpModal();
            showBaraatAuthErr('ایمیل شما هنوز تأیید نشده است. کد ارسال‌شده به ایمیل را وارد کنید یا روی ارسال مجدد بزنید.');
            return;
          }
          showBaraatAuthErr('ورود ناموفق: ' + msg);
          return;
        }
        if (res.data && res.data.session && res.data.session.user && typeof window.afterAuth === 'function') {
          await window.afterAuth(res.data.session.user);
        }
        if (typeof closeModal === 'function') closeModal();
        if (typeof toast === 'function') toast('خوش آمدید! ورود با موفقیت انجام شد.');
      } else {
        const res = await window.sb.auth.signUp({ email, password });
        if (res.error) {
          showBaraatAuthErr('خطا در ثبت‌نام: ' + res.error.message);
          return;
        }
        if (res.data && res.data.session) {
          if (res.data.session.user && typeof window.afterAuth === 'function') {
            await window.afterAuth(res.data.session.user);
          }
          if (typeof closeModal === 'function') closeModal();
          if (typeof toast === 'function') toast('حساب کاربری شما با موفقیت ساخته شد.');
          return;
        }
        otpAuthState.step = 'verify';
        startOtpCooldown(60);
        renderBaraatAuthOtpModal();
        if (typeof toast === 'function') toast('کد تأیید به ایمیل شما ارسال شد.');
      }
    } catch (e) {
      showBaraatAuthErr('خطای ارتباط با سرور. دوباره تلاش کنید.');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.submitBaraatOtpVerify = async function() {
    if (!window.sb || !window.sb.auth) return;
    const rawCode = document.getElementById('baraatOtpCode')?.value || '';
    const token = toEn(rawCode).replace(/\s+/g, '').trim();
    if (token.length < 4) return showBaraatAuthErr('کد تأیید ارسال‌شده به ایمیل را به‌صورت کامل وارد کنید.');
    const btn = document.getElementById('baraatOtpVerifyBtn');
    if (btn) btn.disabled = true;
    showBaraatAuthErr('');
    try {
      let res = await window.sb.auth.verifyOtp({ email: otpAuthState.email, token, type: 'signup' });
      if (res.error) {
        const fb = await window.sb.auth.verifyOtp({ email: otpAuthState.email, token, type: 'email' });
        if (!fb.error) res = fb;
      }
      if (res.error) {
        showBaraatAuthErr('کد تأیید نامعتبر یا منقضی شده است.');
        return;
      }
      if (res.data && res.data.session && res.data.session.user && typeof window.afterAuth === 'function') {
        await window.afterAuth(res.data.session.user);
      }
      if (typeof closeModal === 'function') closeModal();
      if (typeof toast === 'function') toast('ایمیل شما با موفقیت تأیید شد! خوش آمدید.');
    } catch (e) {
      showBaraatAuthErr('خطا در بررسی کد تأیید.');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.resendBaraatOtpCode = async function() {
    if (!window.sb || !window.sb.auth || !otpAuthState.email || otpAuthState.cooldown > 0) return;
    try {
      const res = await window.sb.auth.resend({ type: 'signup', email: otpAuthState.email });
      if (res.error) {
        showBaraatAuthErr('ارسال مجدد ناموفق: ' + res.error.message);
        return;
      }
      startOtpCooldown(60);
      showBaraatAuthErr('');
      if (typeof toast === 'function') toast('کد تأیید جدید به ایمیل شما ارسال شد.');
    } catch (e) {
      showBaraatAuthErr('خطا در ارسال مجدد کد.');
    }
  };

  window.openBaraatAuthOtpModal = function(mode) {
    otpAuthState = { mode: mode === 'signup' ? 'signup' : 'signin', step: 'form', email: '', cooldown: 0 };
    renderBaraatAuthOtpModal();
  };

  function upgradeLegacyAuthModal() {
    if (window.sb && window.sb.auth) {
      window.openAuthModal = window.openBaraatAuthOtpModal;
    }
  }

  function ensureStudentsNotebookSubTab() {
    const examsBtn = document.querySelector('[data-studentssub="exams"]');
    if (!examsBtn || !examsBtn.parentElement) return;
    if (document.getElementById('studentsSubNotebookBtn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'studentsSubNotebookBtn';
    btn.className = examsBtn.className.replace(/\bactive\b/g, '').trim();
    btn.textContent = '📓 دفترچه نکات آزمونی';
    btn.onclick = () => window.openStudentExamNotebook();
    examsBtn.parentElement.appendChild(btn);
  }

  function initBaraatEngine() {
    let savedTheme = 'light';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
    window.applyTheme(savedTheme);
    injectExamUpgradeStyles();
    startPlannerSubjectColorObserver();
    ensureStudentsNotebookSubTab();
    upgradeLegacyAuthModal();
    setTimeout(upgradeLegacyAuthModal, 400);
    const curTab = (location.hash || '#search').replace('#', '') || 'search';
    hydrateExamsFromIdb();
    window.go(curTab);
    checkStandalone();
    updateOnlineStatus();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initBaraatEngine();
  } else {
    document.addEventListener('DOMContentLoaded', initBaraatEngine);
  }

})();
