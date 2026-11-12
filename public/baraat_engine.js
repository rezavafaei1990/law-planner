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
  async function syncToSupabase(key, data) {
    try {
      if (window.sb && navigator.onLine) {
        const res = await window.sb.from('meta').upsert({ key: key, value: JSON.stringify(data) });
        if (res && res.error) {
          console.warn('Supabase sync error for ' + key + ':', res.error.message);
        }
      }
    } catch(err) {
      console.warn('Supabase sync deferred (offline):', err);
    }
  }

  async function syncFromSupabase(key, onDataLoaded) {
    try {
      if (window.sb && navigator.onLine) {
        const r = await window.sb.from('meta').select('value').eq('key', key).maybeSingle();
        if (r && r.data && r.data.value) {
          const parsed = JSON.parse(r.data.value);
          if (parsed && onDataLoaded) onDataLoaded(parsed);
        }
      }
    } catch(err) {
      console.warn('Supabase fetch deferred, using cached local data:', err);
    }
  }

  window.syncAllFromSupabase = async function() {
    if (!window.sb || !navigator.onLine) return;
    await syncFromSupabase(ARTICLES_KEY, (data) => {
      if (Array.isArray(data)) {
        localStorage.setItem(ARTICLES_KEY, JSON.stringify(data));
        window.renderArticles();
      }
    });
    await syncFromSupabase(DEADLINES_KEY, (data) => {
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(DEADLINES_KEY, JSON.stringify(data));
        window.renderDeadlines();
      }
    });
    await syncFromSupabase(CALC_CUSTOM_KEY, (data) => {
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(CALC_CUSTOM_KEY, JSON.stringify(data));
        window.renderCalculators();
      }
    });
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
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

  window.saveArticle = function(art) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: نگارش مقاله فقط برای مدیر سامانه مجاز است."); return; }
    const list = window.getArticles();
    const idx = list.findIndex(a => a.id === art.id);
    if (idx >= 0) list[idx] = art;
    else list.unshift(art);
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(list));
    window.renderArticles();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('مقاله با موفقیت ذخیره شد.');
    syncToSupabase(ARTICLES_KEY, list);
  };

  window.deleteArticle = function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف مقاله فقط برای مدیر سامانه مجاز است."); return; }
    if (!confirm('آیا از حذف این مقاله اطمینان دارید؟')) return;
    const list = window.getArticles().filter(a => a.id !== id);
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(list));
    window.renderArticles();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('مقاله حذف شد.');
    syncToSupabase(ARTICLES_KEY, list);
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
    let art = { id: 'art_' + Date.now(), title: '', category: 'حقوق مدنی', author: '', abstract: '', content: '', tags: [] };
    if (id) {
      const found = window.getArticles().find(a => a.id === id);
      if (found) art = found;
    }

    const m = document.getElementById('modal');
    if (!m) return;

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
    document.getElementById('modalBack').classList.add('show');
  };

  window.submitArticle = function(id) {
    const title = (document.getElementById('edArtTitle')?.value || '').trim();
    if (!title) return alert('لطفاً عنوان مقاله را وارد کنید.');

    const category = document.getElementById('edArtCat')?.value || 'حقوق مدنی';
    const author = (document.getElementById('edArtAuthor')?.value || '').trim();
    const abstract = (document.getElementById('edArtAbstract')?.value || '').trim();
    const content = (document.getElementById('edArtContent')?.value || '').trim();
    const rawTags = (document.getElementById('edArtTags')?.value || '').split(/[,،،-]/).map(t => t.trim()).filter(Boolean);

    window.saveArticle({
      id,
      title,
      category,
      author,
      abstract,
      content,
      tags: rawTags,
      date: new Date().toLocaleDateString('fa-IR')
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

  window.saveDeadline = function(dl) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: تغییر مواعد فقط برای مدیر مجاز است."); return; }
    const list = window.getDeadlines();
    const idx = list.findIndex(d => d.id === dl.id);
    if (idx >= 0) list[idx] = dl;
    else list.push(dl);
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(list));
    window.renderDeadlines();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('موعد قانونی ذخیره شد.');
    syncToSupabase(DEADLINES_KEY, list);
  };

  window.deleteDeadline = function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف مواعد فقط برای مدیر مجاز است."); return; }
    if (!confirm('آیا از حذف این موعد قانونی اطمینان دارید؟')) return;
    const list = window.getDeadlines().filter(d => d.id !== id);
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(list));
    window.renderDeadlines();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('موعد حذف شد.');
    syncToSupabase(DEADLINES_KEY, list);
  };

  window.resetDefaultDeadlines = function() {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: بازنشانی مواعد فقط برای مدیر مجاز است."); return; }
    if (!confirm('آیا مایلید تمام مواعد قانونی به لیست استاندارد ۱۵ گانه بازنشانی شوند؟')) return;
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(DEFAULT_DEADLINES));
    window.renderDeadlines();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('مواعد پیش‌فرض بازنشانی شد.');
    syncToSupabase(DEADLINES_KEY, DEFAULT_DEADLINES);
  };

  window.computeDeadlineResult = function() {
    const list = window.getDeadlines();
    const selId = document.getElementById('calcDlSelect')?.value;
    const cur = list.find(d => d.id === selId) || list[0];
    if (!cur) return;

    const notifStr = document.getElementById('calcDlDate')?.value || new Date().toISOString().split('T')[0];
    const isAbroad = document.getElementById('calcDlAbroad')?.checked || false;

    const days = isAbroad ? Number(cur.daysAbroad) : Number(cur.daysIran);
    const date = new Date(notifStr);
    
    // ماده ۴۴۳-۴۴۵ ق.آ.د.م: روز ابلاغ و اقدام جزو مدت نیست
    date.setDate(date.getDate() + days + 1);
    
    // اگر جمعه بود به روز شنبه موکول می‌شود
    if (date.getDay() === 5) {
      date.setDate(date.getDate() + 1);
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(date);
    target.setHours(0,0,0,0);
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

    const out = document.getElementById('calcDlOutput');
    if (out) {
      out.innerHTML = `
        <div class="dl-result-card">
          <div class="row between">
            <span style="font-size:12px; color:var(--muted)">آخرین مهلت قانونی تقدیم دادخواست / لایحه:</span>
            <span class="pill ${diffDays >= 0 ? 'done' : 'danger'} font-mono">${diffDays >= 0 ? toFa(diffDays) + ' روز باقیمانده' : 'مهلت منقضی شده'}</span>
          </div>
          <div style="font-size:24px; font-weight:800; color:var(--main); margin:10px 0; font-family:monospace">
            ${toFa(date.toISOString().split('T')[0])}
          </div>
          <p style="font-size:12.5px; color:var(--text); line-height:1.8; margin:0">
            بر مبنای <b>${toFa(days)} روز قانونی</b> (${esc(cur.law)}) با اعمال قاعده عدم احتساب روز ابلاغ و اقدام و انتقال روز آخر تعطیل به اولین روز کاری پس از تعطیل (مواد ۴۴۳ الی ۴۴۵ ق.آ.د.م).
          </p>
        </div>
      `;
    }
  };

  window.renderDeadlines = function() {
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
          ${window.isAdmin ? `
            <div class="row" style="gap:6px; justify-content:flex-end;">
              <button class="btn small" onclick="openDeadlineEditor('${d.id}')">✎ ویرایش</button>
              <button class="btn small danger" onclick="deleteDeadline('${d.id}')">✕ حذف</button>
            </div>
          ` : ''}
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

  window.saveCustomCalculator = function(c) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ثبت فرمول فقط برای مدیر مجاز است."); return; }
    const list = window.getCustomCalculators();
    const idx = list.findIndex(item => item.id === c.id);
    if (idx >= 0) list[idx] = c;
    else list.push(c);
    localStorage.setItem(CALC_CUSTOM_KEY, JSON.stringify(list));
    window.renderCalculators();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('محاسبه‌گر ذخیره شد.');
    syncToSupabase(CALC_CUSTOM_KEY, list);
  };

  window.deleteCustomCalculator = function(id) {
    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف فرمول فقط برای مدیر مجاز است."); return; }
    if (!confirm('آیا از حذف این محاسبه‌گر اطمینان دارید؟')) return;
    const list = window.getCustomCalculators().filter(item => item.id !== id);
    localStorage.setItem(CALC_CUSTOM_KEY, JSON.stringify(list));
    window.renderCalculators();
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
    if (typeof toast === 'function') toast('محاسبه‌گر حذف شد.');
    syncToSupabase(CALC_CUSTOM_KEY, list);
  };

  // ۱. محاسبه هزینه دادرسی
  window.calcCourtFees = function() {
    const rawVal = toEn(document.getElementById('cfAmount')?.value || '0').replace(/,/g, '');
    const amount = Number(rawVal) || 0;
    const stage = document.getElementById('cfStage')?.value || 'first';

    let fee = 0;
    let label = '';
    if (stage === 'first') {
      label = 'مرحله نخستین / بدوی (۲.۵٪ تا ۲۰ میلیون تومان، مازاد ۳.۵٪)';
      if (amount <= 20000000) {
        fee = amount * 0.025;
      } else {
        fee = (20000000 * 0.025) + ((amount - 20000000) * 0.035);
      }
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
          <div>
            <span style="font-size:12px; color:var(--muted)">مبلغ برآورد هزینه دادرسی (${label}):</span>
            <div style="font-size:22px; font-weight:800; color:var(--main); margin-top:4px;">
              ${toFa(Math.round(fee).toLocaleString())} تومان
            </div>
            <div style="font-size:12px; color:var(--muted); margin-top:2px;">
              (معادل ${toFa(Math.round(fee * 10).toLocaleString())} ریال)
            </div>
          </div>
        </div>
      `;
    }
  };

  // ۲. محاسبه تعرفه حق‌الوکاله
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
    const tax = fee * 0.05; // ۵٪ مالیات علی‌الحساب
    const fund = fee * 0.04; // ۴٪ صندوق حمایت

    const out = document.getElementById('atResult');
    if (out) {
      out.innerHTML = `
        <div class="calc-res-strip">
          <div>
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
        </div>
      `;
    }
  };

  // ۳. محاسبه خسارت تأخیر تأدیه (ماده ۵۲۲)
  window.calcLatePayment = function() {
    const rawVal = toEn(document.getElementById('lpAmount')?.value || '0').replace(/,/g, '');
    const amount = Number(rawVal) || 0;
    const yDue = Number(document.getElementById('lpYearDue')?.value) || 1399;
    const yPay = Number(document.getElementById('lpYearPay')?.value) || 1403;

    // شاخص‌های تورم نمونه بانک مرکزی
    const indices = {
      1390: 25.1, 1391: 32.8, 1392: 44.2, 1393: 51.1, 1394: 57.2,
      1395: 62.3, 1396: 68.3, 1397: 89.2, 1398: 125.7, 1399: 171.4,
      1400: 240.3, 1401: 352.1, 1402: 520.4, 1403: 740.0
    };

    const idxDue = indices[yDue] || (indices[1399]);
    const idxPay = indices[yPay] || (indices[1403]);

    const totalUpdated = (amount * idxPay) / idxDue;
    const delayDamage = totalUpdated - amount;

    const out = document.getElementById('lpResult');
    if (out) {
      out.innerHTML = `
        <div class="calc-res-strip">
          <div class="row between">
            <span style="font-size:12px; color:var(--muted)">مبلغ به‌روزشده کل بدهی:</span>
            <span class="pill done font-mono">${toFa(Math.round(totalUpdated).toLocaleString())} تومان</span>
          </div>
          <div style="font-size:20px; font-weight:800; color:var(--main); margin:8px 0;">
            خسارت تأخیر تأدیه: ${toFa(Math.round(delayDamage).toLocaleString())} تومان
          </div>
          <p style="font-size:12px; color:var(--muted); margin:0; line-height:1.8">
            اصل طلب: <b>${toFa(amount.toLocaleString())} تومان</b> · بر مبنای شاخص سال ${toFa(yDue)} (${toFa(idxDue)}) به سال ${toFa(yPay)} (${toFa(idxPay)}) طبق فرمول ماده ۵۲۲ ق.آ.د.م.
          </p>
        </div>
      `;
    }
  };

  // ۴. اجرای محاسبه‌گر سفارشی
  window.runCustomCalc = function(id) {
    const list = window.getCustomCalculators();
    const c = list.find(item => item.id === id);
    if (!c) return;

    const inVal = Number(toEn(document.getElementById('input_' + id)?.value || '0').replace(/,/g, '')) || 0;
    let res = 0;
    if (c.type === 'percent') {
      res = (inVal * Number(c.rate)) / 100;
    } else if (c.type === 'daily') {
      const days = Number(toEn(document.getElementById('days_' + id)?.value || '1')) || 1;
      res = inVal * (Number(c.rate) / 100) * days;
    }

    const out = document.getElementById('out_' + id);
    if (out) {
      out.innerHTML = `مبلغ محاسبه‌شده: <b>${toFa(Math.round(res).toLocaleString())} تومان</b>`;
    }
  };

  window.renderCalculators = function() {
    window.calcCourtFees();
    window.calcAttorneyFees();
    window.calcLatePayment();

    const box = document.getElementById('customCalculatorsGrid');
    if (!box) return;

    const list = window.getCustomCalculators();
    box.innerHTML = list.map(c => `
      <div class="calculator-card">
        <div class="row between">
          <h4 style="margin:0; font-size:15px; font-weight:700;">${esc(c.title)}</h4>
          ${window.isAdmin ? `
            <div class="row" style="gap:4px">
              <button class="btn small" onclick="openCustomCalcEditor('${c.id}')" title="ویرایش فرمول">✎</button>
              <button class="btn small danger" onclick="deleteCustomCalculator('${c.id}')" title="حذف">✕</button>
            </div>
          ` : ''}
        </div>
        <p style="font-size:12px; color:var(--muted); margin:6px 0 10px;">${esc(c.desc || '')}</p>
        <div class="form-grid" style="gap:8px;">
          <div class="field">
            <label style="font-size:11.5px">مبلغ پایه (تومان)</label>
            <input id="input_${c.id}" type="text" placeholder="مثلاً: 50,000,000" oninput="runCustomCalc('${c.id}')">
          </div>
          ${c.type === 'daily' ? `
            <div class="field">
              <label style="font-size:11.5px">تعداد روز تأخیر</label>
              <input id="days_${c.id}" type="number" value="10" oninput="runCustomCalc('${c.id}')">
            </div>
          ` : ''}
        </div>
        <div id="out_${c.id}" style="margin-top:10px; font-size:13px; color:var(--main); font-weight:600;">
          برای محاسبه، مبلغ را وارد کنید.
        </div>
      </div>
    `).join('');
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

    window.saveCustomCalculator({ id, title, type, rate, desc });
    closeModal();
  };

  // -------------------------------------------------------------------
  // ۴. رندر پنل‌های اختصاصی مدیریت در تب tab-admin
  // -------------------------------------------------------------------
  window.renderAdminPanels = function() {
    // رندر مقالات در ادمین
    const admArtBox = document.getElementById('admArticlesList');
    if (admArtBox) {
      const arts = window.getArticles();
      if (!arts.length) {
        admArtBox.innerHTML = '<div class="muted small" style="padding:12px; background:#f8fafc; border-radius:10px;">هنوز مقاله‌ای ثبت نشده است. برای انتشار اولین مقاله روی دکمه «نگارش مقاله جدید» کلیک کنید.</div>';
      } else {
        admArtBox.innerHTML = `
          <div style="display:grid; gap:8px;">
            ${arts.map(a => `
              <div class="row between" style="padding:10px 14px; background:#f8fafc; border:1px solid var(--line); border-radius:10px; font-size:13px;">
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
            <div class="row between" style="padding:10px 14px; background:#f8fafc; border:1px solid var(--line); border-radius:10px; font-size:13px;">
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
            <div class="row between" style="padding:10px 14px; background:#f8fafc; border:1px solid var(--line); border-radius:10px; font-size:13px;">
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
  };


  // -------------------------------------------------------------------
  // مدیریت نصب PWA (اپلیکیشن برائت) و وضعیت اتصال آنلاین / آفلاین
  // -------------------------------------------------------------------
  let deferredPWAInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPWAInstallPrompt = e;
    const hBtn = document.getElementById('pwaInstallHeaderBtn');
    const dBtn = document.getElementById('pwaInstallDockBtn');
    if (hBtn) hBtn.style.display = 'inline-flex';
    if (dBtn) dBtn.style.display = 'flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredPWAInstallPrompt = null;
    const hBtn = document.getElementById('pwaInstallHeaderBtn');
    const dBtn = document.getElementById('pwaInstallDockBtn');
    if (hBtn) hBtn.style.display = 'none';
    if (dBtn) dBtn.style.display = 'none';
    if (typeof toast === 'function') toast('اپلیکیشن «برائت» با موفقیت نصب شد.');
  });

  window.promptPWAInstall = async function() {
    const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    if (isIOS) {
      if (window.showModal) {
        window.showModal(`
          <h2>📲 نصب اپلیکیشن «برائت» روی آیفون / آیپد</h2>
          <div style="line-height:2.1; font-size:13.5px; margin:16px 0; color:#334155;">
            <p>برای نصب سامانه <b>برائت</b> روی صفحه اصلی دستگاه iOS خود:</p>
            <ol style="padding-right:22px; margin:12px 0;">
              <li>در نوار ابزار پایین مرورگر Safari، دکمه <b>Share (اشتراک‌گذاری)</b> ⎋ را لمس کنید.</li>
              <li>صفحه را کمی به پایین اسکرول کرده و گزینه <b>Add to Home Screen (افزودن به صفحه اصلی)</b> ➕ را انتخاب نمایید.</li>
              <li>در گوشه بالا دکمه <b>Add</b> را لمس کنید تا آیکون رسمی «برائت» به صفحه گوشی افزوده شود.</li>
            </ol>
          </div>
          <div class="modal-actions">
            <button class="btn primary" onclick="closeModal()">متوجه شدم</button>
          </div>
        `);
      }
      return;
    }

    if (deferredPWAInstallPrompt) {
      deferredPWAInstallPrompt.prompt();
      const { outcome } = await deferredPWAInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredPWAInstallPrompt = null;
        const hBtn = document.getElementById('pwaInstallHeaderBtn');
        const dBtn = document.getElementById('pwaInstallDockBtn');
        if (hBtn) hBtn.style.display = 'none';
        if (dBtn) dBtn.style.display = 'none';
      }
    } else {
      if (window.showModal) {
        window.showModal(`
          <h2>📲 نصب نسخه تحت وب «برائت»</h2>
          <p style="margin:14px 0; line-height:1.9;">برای نصب برنامه برائت، از منوی سه نقطه مرورگر خود (در بالای سمت راست یا چپ)، گزینه <b>Install App</b> یا <b>Add to Home Screen</b> را انتخاب کنید.</p>
          <div class="modal-actions">
            <button class="btn primary" onclick="closeModal()">بستن</button>
          </div>
        `);
      }
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
    if (typeof window.syncAllFromSupabase === 'function') window.syncAllFromSupabase();
  });

  window.addEventListener('offline', () => {
    updateOnlineStatus();
    if (typeof toast === 'function') toast('حالت آفلاین فعال شد؛ تمام اطلاعات و قوانین از حافظه دستگاه خوانده می‌شوند.');
  });

  // Check standalone mode (already running as PWA)
  function checkStandalone() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      const hBtn = document.getElementById('pwaInstallHeaderBtn');
      const dBtn = document.getElementById('pwaInstallDockBtn');
      if (hBtn) hBtn.style.display = 'none';
      if (dBtn) dBtn.style.display = 'none';
    } else {
      // Show install buttons if browser supports it or on mobile
      const hBtn = document.getElementById('pwaInstallHeaderBtn');
      const dBtn = document.getElementById('pwaInstallDockBtn');
      if (hBtn) hBtn.style.display = 'inline-flex';
      if (dBtn) dBtn.style.display = 'flex';
    }
  }

  // -------------------------------------------------------------------
  // ۵. ناوبری سراسری و تضمین سوییچ آنی تب‌ها
  // -------------------------------------------------------------------
  const ALL_TABS = ['search', 'planner', 'articles', 'deadlines', 'calculator', 'admin'];

  window.go = function(tab) {
    if (!ALL_TABS.includes(tab)) tab = 'search';

    ALL_TABS.forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('hidden', t !== tab);
    });

    document.querySelectorAll('[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    try { history.replaceState(null, '', '#' + tab); } catch(e) {}

    if (tab === 'planner' && typeof enterPlanner === 'function') enterPlanner();
    if (tab === 'admin') {
      if (window.LAWDB && LAWDB.admRefresh) LAWDB.admRefresh();
      window.renderAdminPanels();
    }
    if (tab === 'articles') window.renderArticles();
    if (tab === 'deadlines') window.renderDeadlines();
    if (tab === 'calculator') window.renderCalculators();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function initBaraatEngine() {
    const curTab = (location.hash || '#search').replace('#', '') || 'search';
    window.go(curTab);
    checkStandalone();
    updateOnlineStatus();
    window.syncAllFromSupabase();
  }

  // اجرای خودکار پس از لود صفحه
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initBaraatEngine();
  } else {
    document.addEventListener('DOMContentLoaded', initBaraatEngine);
  }

})();
