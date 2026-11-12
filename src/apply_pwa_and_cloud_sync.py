import re

# =====================================================================
# 1. Update src/baraat_engine.js with Supabase Cloud Sync and PWA Installation
# =====================================================================

with open("src/baraat_engine.js", "r", encoding="utf-8") as f:
    engine = f.read()

# Add sync functions after esc helper
sync_code = """
  // -------------------------------------------------------------------
  // هماهنگ‌سازی ابری دوطرفه با پایگاه داده Supabase و ذخیره‌سازی آفلاین
  // -------------------------------------------------------------------
  async function syncToSupabase(key, data) {
    try {
      if (window.sb && navigator.onLine) {
        await window.sb.from('meta').upsert({ key: key, value: JSON.stringify(data) });
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
      if (Array.isArray(data) && data.length > 0) {
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
    await syncFromSupabase(CALCULATORS_KEY, (data) => {
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(CALCULATORS_KEY, JSON.stringify(data));
        window.renderCalculators();
      }
    });
    if (typeof renderAdminPanels === 'function') renderAdminPanels();
  };
"""

if "syncToSupabase" not in engine:
    engine = engine.replace(
        "const esc = s => String(s==null?'':s).replace(/[&<>\"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));",
        "const esc = s => String(s==null?'':s).replace(/[&<>\"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));\n" + sync_code
    )

# Hook syncToSupabase into saveArticle and deleteArticle
engine = re.sub(
    r'(window\.saveArticle = function\(art\) \{[\s\S]*?localStorage\.setItem\(ARTICLES_KEY, JSON\.stringify\(list\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(ARTICLES_KEY, list);',
    engine
)

engine = re.sub(
    r'(window\.deleteArticle = function\(id\) \{[\s\S]*?localStorage\.setItem\(ARTICLES_KEY, JSON\.stringify\(list\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(ARTICLES_KEY, list);',
    engine
)

# Hook syncToSupabase into saveDeadline, deleteDeadline, resetDefaultDeadlines
engine = re.sub(
    r'(window\.saveDeadline = function\(dl\) \{[\s\S]*?localStorage\.setItem\(DEADLINES_KEY, JSON\.stringify\(list\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(DEADLINES_KEY, list);',
    engine
)

engine = re.sub(
    r'(window\.deleteDeadline = function\(id\) \{[\s\S]*?localStorage\.setItem\(DEADLINES_KEY, JSON\.stringify\(list\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(DEADLINES_KEY, list);',
    engine
)

engine = re.sub(
    r'(window\.resetDefaultDeadlines = function\(\) \{[\s\S]*?localStorage\.setItem\(DEADLINES_KEY, JSON\.stringify\(DEFAULT_DEADLINES\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(DEADLINES_KEY, DEFAULT_DEADLINES);',
    engine
)

# Hook syncToSupabase into saveCustomCalculator, deleteCustomCalculator
engine = re.sub(
    r'(window\.saveCustomCalculator = function\(calc\) \{[\s\S]*?localStorage\.setItem\(CALCULATORS_KEY, JSON\.stringify\(list\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(CALCULATORS_KEY, list);',
    engine
)

engine = re.sub(
    r'(window\.deleteCustomCalculator = function\(id\) \{[\s\S]*?localStorage\.setItem\(CALCULATORS_KEY, JSON\.stringify\(list\)\);[\s\S]*?)(if \(typeof toast === \'function\'\) toast\([^\)]+\);)',
    r'\1\2\n    syncToSupabase(CALCULATORS_KEY, list);',
    engine
)

# PWA Install & Offline Status in baraat_engine.js
pwa_code = """
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
"""

if "deferredPWAInstallPrompt" not in engine:
    # Insert before window.go
    engine = engine.replace(
        "  // -------------------------------------------------------------------\n  // ۵. ناوبری سراسری",
        pwa_code + "\n  // -------------------------------------------------------------------\n  // ۵. ناوبری سراسری"
    )

# Hook syncAllFromSupabase and checkStandalone into init
init_calls = """
    checkStandalone();
    updateOnlineStatus();
    window.syncAllFromSupabase();
"""
if "window.syncAllFromSupabase();" not in engine:
    engine = engine.replace(
        "window.go(curTab);",
        "window.go(curTab);" + init_calls
    )

with open("src/baraat_engine.js", "w", encoding="utf-8") as f:
    f.write(engine)

print("Updated src/baraat_engine.js with cloud sync & PWA installation!")

# =====================================================================
# 2. Update index.html
# =====================================================================

with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Update Title and App Name to برائت
html = re.sub(r'<title>.*?</title>', '<title>برائت | سامانه جامع گروه حقوقی برائت</title>', html)
html = re.sub(r'<meta name="apple-mobile-web-app-title" content=".*?">', '<meta name="apple-mobile-web-app-title" content="برائت">', html)

# Ensure application-name and meta tags
head_meta = """<meta name="application-name" content="برائت">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="برائت">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">"""

if '<meta name="application-name"' not in html:
    html = html.replace('<meta name="apple-mobile-web-app-title" content="برائت">', head_meta)

# Offline Banner right after <body>
offline_banner_html = """<div id="offlineBanner" class="offline-banner hidden">
  <span class="pulse-dot"></span>
  <span>📡 حالت آفلاین فعال است — تمام قوانین، مواد، یادداشت‌ها و محاسبات از حافظه دستگاه لود شده‌اند.</span>
</div>"""

if '<div id="offlineBanner"' not in html:
    html = html.replace('<body>', '<body>\n' + offline_banner_html)

# Header actions: Add cloud sync badge and in-app install button
header_actions_new = """ <div class="actions">
  <div class="cloud-sync-badge" id="cloudSyncBadge">
    <span class="status-dot green"></span> آنلاین (سینک با Supabase)
  </div>
  <button class="btn" id="pwaInstallHeaderBtn" onclick="promptPWAInstall()" style="color:#0f766e; border-color:#99f6e4; background:#f0fdfa;">
    <span style="font-size:15px">📲</span> نصب اپلیکیشن برائت
  </button>
  <button class="btn primary" id="authBtn" onclick="openAuthModal()">ورود / ثبت‌نام</button>
  <button class="btn hidden" id="outBtn" onclick="logout()">خروج</button>
 </div>"""

html = re.sub(r'<div class="actions">\s*<button class="btn primary" id="authBtn"[\s\S]*?</div>', header_actions_new, html, count=1)

# Right dock footer: Add install button
dock_footer_new = """  <div class="dock-footer">
    <button class="dock-btn-auth" id="pwaInstallDockBtn" onclick="promptPWAInstall()" style="margin-bottom:6px; color:#0f766e; background:#f0fdfa;" title="نصب اپلیکیشن برائت روی دستگاه">
      <span class="dock-icon">📲</span>
      <span class="dock-label">نصب برائت</span>
    </button>
    <button class="dock-btn-auth" onclick="openAuthModal()">
      <span class="dock-icon">👤</span>
      <span class="dock-label" id="dockAuthLabel">ورود / حساب</span>
    </button>
  </div>"""

html = re.sub(r'<div class="dock-footer">[\s\S]*?</div>', dock_footer_new, html, count=1)

# Robust offline support in loadDB
load_db_new = """async function loadDB(force){
  try{
    LOADERR=false;let ver=null;
    const cached=await idbGet('db');
    if(!navigator.onLine && cached){ applyDB(cached); return; }
    try{const m=await sb.from('meta').select('value').eq('key','ver').maybeSingle();ver=(m.data&&m.data.value)||null;}catch(e){}
    if(!force&&ver){if(cached&&cached.ver===ver){applyDB(cached);return;}}
    const laws=await fetchAll('laws','id,name,sort',['sort','id']);
    const arts=await fetchAll('articles','id,law_id,ord,num,num_text,text,path,sections',['law_id','ord']);
    const decs=await fetchAll('decisions','number,year,date,subject,text',['year','number']);
    const o={ver,laws,arts,decs};applyDB(o);idbSet('db',o);
  }catch(e){
    console.warn('Network fetch error, loading from local offline cache:', e);
    const c=await idbGet('db');
    if(c){applyDB(c);LOADERR=false;} else {LOADERR=true;}
  }
}"""

html = re.sub(r'async function loadDB\(force\)\{[\s\S]*?\}\s*async function reloadAll', load_db_new + "\nasync function reloadAll", html)

# Service Worker registration without strict protocol check
sw_register_code = """<script>
// PWA: register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Baraat PWA service worker registered');
    }).catch(err => {
      console.warn('PWA service worker registration notice:', err);
    });
  });
}
</script>"""

html = re.sub(r'<script>\s*// PWA: cache only the application shell[\s\S]*?</script>', sw_register_code, html)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("Updated index.html with PWA metadata, offline banner, and offline-first loadDB!")
