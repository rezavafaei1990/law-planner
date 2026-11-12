import re

with open("index.html", "r", encoding="utf-8") as f:
    text = f.read()

with open("src/chic.css", "r", encoding="utf-8") as f:
    css = f.read()

# 1. Update title and meta
text = text.replace("<title>همراه مطالعه حقوق</title>", "<title>گروه حقوقی برائت | پایگاه جامع حقوقی</title>")
text = text.replace("<title>پایگاه و برنامه‌ریز حقوقی دادبان | Law Planner</title>", "<title>گروه حقوقی برائت | پایگاه جامع حقوقی</title>")
text = re.sub(r'apple-mobile-web-app-title" content="[^"]+"', 'apple-mobile-web-app-title" content="گروه حقوقی برائت"', text)

# 2. Update <style>
text = re.sub(r"<style>.*?</style>", "<style>\n" + css + "\n</style>", text, flags=re.DOTALL)

# 3. Add right-dock after <body> if not already added
dock_html = """
<aside class="right-hover-dock" id="rightDock">
  <div class="dock-header">
    <div class="dock-logo">⚖</div>
    <div class="dock-brand-text">گروه حقوقی برائت</div>
  </div>
  <nav class="dock-nav">
    <button class="dock-btn active" data-tab="search" title="جستجوی مواد و قوانین">
      <span class="dock-icon">🔎</span>
      <span class="dock-label">جستجوی مواد</span>
    </button>
    <button class="dock-btn" data-tab="planner" title="برنامه مطالعاتی و لایتنر">
      <span class="dock-icon">📅</span>
      <span class="dock-label">برنامه مطالعاتی</span>
    </button>
    <button class="dock-btn" data-tab="articles" title="مقالات و پژوهش‌های حقوقی">
      <span class="dock-icon">📚</span>
      <span class="dock-label">مقالات و پژوهش‌ها</span>
    </button>
    <button class="dock-btn" data-tab="deadlines" title="مواعد قانونی و قضایی">
      <span class="dock-icon">⚖️</span>
      <span class="dock-label">مواعد قانونی</span>
    </button>
    <button class="dock-btn" data-tab="calculator" title="محاسبه‌گر هزینه دادرسی و خسارت">
      <span class="dock-icon">🧮</span>
      <span class="dock-label">محاسبه‌گر حقوقی</span>
    </button>
    <button class="dock-btn" id="dockAdminBtn" data-tab="admin" title="مدیریت سیستم">
      <span class="dock-icon">🛠</span>
      <span class="dock-label">مدیریت قوانین</span>
    </button>
  </nav>
  <div class="dock-footer">
    <button class="dock-btn-auth" onclick="openAuthModal()">
      <span class="dock-icon">👤</span>
      <span class="dock-label" id="dockAuthLabel">ورود / ثبت‌نام</span>
    </button>
  </div>
</aside>
"""

if "id=\"rightDock\"" not in text:
    text = text.replace("<body>", "<body>\n" + dock_html)

# 4. Update header branding
text = re.sub(
    r'<div class="brand">[\s\S]*?</div>\s*</div>',
    '<div class="brand"><div class="logo">⚖</div><div><h1>گروه حقوقی برائت</h1><p>سامانه هوشمند قوانین، مقالات و پژوهش‌ها، مواعد قضایی و برنامه‌ریزی</p></div></div>',
    text,
    count=1
)

# 5. Update nav.tabs
new_tabs = """<nav class="tabs">
  <button class="active" data-tab="search">🔎 جستجوی مواد</button>
  <button data-tab="planner">📅 برنامه مطالعاتی</button>
  <button data-tab="articles">📚 مقالات و پژوهش‌ها</button>
  <button data-tab="deadlines">⚖️ مواعد قانونی</button>
  <button data-tab="calculator">🧮 محاسبه‌گر حقوقی</button>
  <button class="hidden" id="adminTab" data-tab="admin">🛠 مدیریت قوانین</button>
</nav>"""

text = re.sub(r'<nav class="tabs">[\s\S]*?</nav>', new_tabs, text)

# 6. Update search section with centered glass hero if not already wrapped
if "search-hero-glass" not in text:
    pattern_search = r'<section id="tab-search" class="law-ui">[\s\S]*?<div class="modes">[\s\S]*?</div>'
    replacement_search = """<section id="tab-search" class="law-ui">
  <div class="search-hero-glass">
    <div class="hero-chip">گروه حقوقی برائت · پایگاه هوشمند تنقیح و پژوهش قوانین</div>
    <h2 class="hero-heading">جستجوی هوشمند در متن قوانین و آرای قضایی</h2>
    <p class="hero-subheading">شماره ماده (مثلاً «ماده ۲۱۸») یا هر واژه، عنوان یا قاعده حقوقی را جستجو کنید</p>
    
    <div class="hero-search-wrapper">
      <div class="hero-search-icon">🔍</div>
      <input id="q" type="search" placeholder="مثلاً: ماده 218  یا  وجه التزام  یا  معامله فضولی  یا  ماده 10 اراده">
    </div>

    <div class="hero-filters-row">
      <div class="bar" style="margin:0;">
        <select id="lawSel">
          <option value="">همه قوانین پایگاه</option>
        </select>
      </div>
      <div class="modes" style="margin:0;">
        <b>جستجو در:</b>
        <label><input type="radio" name="mode" value="all" checked> همه (متن و موضوع)</label>
        <label><input type="radio" name="mode" value="text"> فقط متن ماده</label>
        <label><input type="radio" name="mode" value="topic"> موضوع (باب / فصل)</label>
        <label><input type="radio" name="mode" value="decision"> آرای دیوان</label>
        <label><input type="radio" name="mode" value="marks"> ★ نشان‌شده‌ها</label>
      </div>
    </div>
  </div>"""
    text = re.sub(pattern_search, replacement_search, text, count=1)

# 7. Add sections for articles, deadlines, and calculator if not present
new_sections = """
<section id="tab-articles" class="hidden">
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>📚 مقالات و پژوهش‌های حقوقی</h2>
        <div class="muted small">مجموعه مقالات تخصصی، نقدهای رویه قضایی و پژوهش‌های علمی گروه حقوقی برائت</div>
      </div>
      <button class="btn primary" onclick="window.openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>
    </div>
    
    <div class="row between" style="margin-bottom:14px; gap:10px;">
      <div style="flex:1; max-width:400px;">
        <input id="artSearch" placeholder="جستجو در مقالات و کلمات کلیدی..." oninput="window.renderArticles()">
      </div>
      <div style="width:auto; min-width:180px;">
        <select id="artCatFilter" onchange="window.renderArticles()">
          <option value="all">همه گرایش‌ها</option>
          <option value="حقوق مدنی">حقوق مدنی</option>
          <option value="حقوق تجارت">حقوق تجارت</option>
          <option value="آیین دادرسی مدنی">آیین دادرسی مدنی</option>
          <option value="حقوق جزا و جرم‌شناسی">حقوق جزا و جرم‌شناسی</option>
          <option value="آیین دادرسی کیفری">آیین دادرسی کیفری</option>
          <option value="رویه قضایی و دیوان عالی">رویه قضایی و دیوان عالی</option>
          <option value="کاربردی و حرفه‌ای وکالت">کاربردی و حرفه‌ای وکالت</option>
        </select>
      </div>
    </div>

    <div id="articlesList"></div>
  </div>
</section>

<section id="tab-deadlines" class="hidden">
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>⚖️ مواعد قانونی و قضایی</h2>
        <div class="muted small">محاسبه دقیق مهلت‌های قانونی ابلاغ با اعمال مواد ۴۴۳ الی ۴۴۵ قانون آیین دادرسی مدنی</div>
      </div>
      <button class="btn primary" onclick="window.openDeadlineEditor()">＋ افزودن موعد سفارشی</button>
    </div>

    <!-- Interactive Sana Calculator -->
    <div style="background:#f0fdfa; border:1px solid #99f6e4; border-radius:18px; padding:22px; margin-bottom:24px;">
      <h3 style="margin:0 0 14px; font-size:15px; color:#0f766e;">محاسبه‌گر موعد اقدام بر اساس تاریخ ابلاغ ثنا</h3>
      <div class="form-grid" style="align-items:end;">
        <div class="field">
          <label>اقدام یا موعد قانونی مورد نظر</label>
          <select id="calcDlSelect" onchange="window.computeDeadlineResult()"></select>
        </div>
        <div class="field">
          <label>تاریخ ابلاغ در سامانه ثنا</label>
          <input type="date" id="calcDlDate" onchange="window.computeDeadlineResult()">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label class="check" style="cursor:pointer; display:inline-flex; width:auto; border:0; padding:0; background:transparent;">
            <input type="checkbox" id="calcDlAbroad" onchange="window.computeDeadlineResult()">
            <span>محل اقامت شخص ابلاغ‌شونده خارج از کشور است (مهلت طولانی‌تر قانون)</span>
          </label>
        </div>
      </div>
      <div id="calcDlOutput" style="margin-top:16px;"></div>
    </div>

    <!-- Deadlines Table / Cards -->
    <h3 style="margin:20px 0 12px; font-size:16px;">جدول مواعد قانونی (قابل ویرایش و اضافه کردن)</h3>
    <div class="deadlines-grid" id="deadlinesGrid"></div>
  </div>
</section>

<section id="tab-calculator" class="hidden">
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>🧮 محاسبه‌گرهای حقوقی و قضایی</h2>
        <div class="muted small">محاسبه هزینه دادرسی، خسارت تأخیر تأدیه و تعرفه حق‌الوکاله با قابلیت افزودن فرمول سفارشی</div>
      </div>
      <button class="btn primary" onclick="window.openCustomCalcEditor()">＋ افزودن محاسبه‌گر جدید</button>
    </div>

    <div class="form-grid" style="gap:18px;">
      <!-- Court fees calculator -->
      <div class="calculator-card">
        <h3 style="margin:0 0 6px; font-size:16px; color:#0f766e;">۱. محاسبه هزینه دادرسی دعاوی مالی</h3>
        <p style="font-size:12px; color:var(--muted); margin:0 0 14px;">محاسبه بر اساس قانون وصول برخی از درآمدهای دولت و جدول تعرفه مصوب</p>
        <div class="field">
          <label>مرحله دادرسی</label>
          <select id="cfStage" onchange="window.calcCourtFees()">
            <option value="first">مرحله نخستین / بدوی (۲.۵٪ تا ۲۰ میلیون تومان، مازاد ۳.۵٪)</option>
            <option value="appeal">مرحله تجدیدنظر و واخواهی (۴.۵٪)</option>
            <option value="supreme">مرحله فرجام‌خواهی و اعاده دادرسی (۵.۵٪)</option>
            <option value="exec">اجرای احکام مدنی (۵٪ محکوم‌به)</option>
          </select>
        </div>
        <div class="field" style="margin-top:10px;">
          <label>بهای خواسته / مبلغ دعوا (تومان)</label>
          <input type="text" id="cfAmount" value="50,000,000" oninput="window.calcCourtFees()">
        </div>
        <div id="cfResult"></div>
      </div>

      <!-- Attorney fees calculator -->
      <div class="calculator-card">
        <h3 style="margin:0 0 6px; font-size:16px; color:#0f766e;">۲. محاسبه تعرفه قانونی حق‌الوکاله</h3>
        <p style="font-size:12px; color:var(--muted); margin:0 0 14px;">طبق آیین‌نامه تعرفه حق‌الوکاله و هزینه سفر وکلای دادگستری مصوب قوه قضائیه</p>
        <div class="field">
          <label>بهای خواسته یا مبلغ محکوم‌به (تومان)</label>
          <input type="text" id="atAmount" value="100,000,000" oninput="window.calcAttorneyFees()">
        </div>
        <div id="atResult"></div>
      </div>
    </div>

    <!-- Custom calculators -->
    <h3 style="margin:26px 0 12px; font-size:16px;">محاسبه‌گرهای اختصاصی و سفارشی (قابل تنظیم)</h3>
    <div class="articles-grid" id="customCalculatorsGrid"></div>
  </div>
</section>
"""

if "id=\"tab-articles\"" not in text:
    p_end = text.find("</section>", text.find("<section id=\"tab-planner\"")) + 10
    text = text[:p_end] + new_sections + text[p_end:]

# 8. Script 4 router update
if "baraat_modules.js" not in text:
    text = text.replace("</body>", '<script src="/src/baraat_modules.js"></script>\n</body>')

router_script = """<script>
(function(){
  const ALL_TABS = ["search", "planner", "articles", "deadlines", "calculator", "admin"];
  window.go = function(tab) {
    if (!ALL_TABS.includes(tab) || (tab === "admin" && !isAdmin)) tab = "search";
    ALL_TABS.forEach(n => {
      const el = document.getElementById("tab-" + n);
      if (el) el.classList.toggle("hidden", n !== tab);
    });
    document.querySelectorAll("[data-tab]").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    try { history.replaceState(null, "", "#" + tab); } catch(e) {}
    if (tab === "planner" && window.enterPlanner) enterPlanner();
    if (tab === "admin" && window.LAWDB) LAWDB.admRefresh();
    if (tab === "articles" && window.renderArticles) window.renderArticles();
    if (tab === "deadlines" && window.renderDeadlines) window.renderDeadlines();
    if (tab === "calculator" && window.renderCalculators) window.renderCalculators();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  document.querySelectorAll("[data-tab]").forEach(b => {
    b.addEventListener("click", () => go(b.dataset.tab));
  });

  window.addEventListener("hashchange", () => {
    const t = (location.hash || "#search").slice(1);
    if (ALL_TABS.includes(t)) go(t);
  });

  if (!CLOUD || !window.supabase) {
    document.getElementById("cfgWarn").classList.remove("hidden");
    document.getElementById("out").innerHTML = '<div class="empty">تنظیمات Supabase کامل نیست.</div>';
  } else {
    sb = supabase.createClient(SUPA_URL, SUPA_KEY);
    LAWDB.init();
    initAuth();
  }

  const initialTab = (location.hash || "#search").slice(1);
  go(initialTab);
})();
</script>"""

# Replace the existing script 4
pattern_script4 = r'<script>\(function\(\)\{\s*document\.querySelectorAll\("\.tabs button"\)[\s\S]*?go\(\(location\.hash\|\|"#search"\)\.slice\(1\)\);\s*\}\)\(\);</script>'
text = re.sub(pattern_script4, router_script, text)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(text)

print("Applied update successfully! index.html length:", len(text))
