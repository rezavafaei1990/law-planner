import re

with open("index.html", "r", encoding="utf-8") as f:
    text = f.read()

# =====================================================================
# 1. Update Buttons with direct onclick="go('...')" for 100% Reliability
# =====================================================================

# Right hover dock buttons
dock_html = """
<aside class="right-hover-dock" id="rightDock">
  <div class="dock-header">
    <div class="dock-logo">⚖</div>
    <div class="dock-brand-text">گروه حقوقی برائت</div>
  </div>
  <nav class="dock-nav">
    <button class="dock-btn active" data-tab="search" onclick="go('search')" title="جستجوی مواد و قوانین">
      <span class="dock-icon">🔎</span>
      <span class="dock-label">جستجوی مواد</span>
    </button>
    <button class="dock-btn" data-tab="planner" onclick="go('planner')" title="برنامه مطالعاتی و لایتنر">
      <span class="dock-icon">📅</span>
      <span class="dock-label">برنامه مطالعاتی</span>
    </button>
    <button class="dock-btn" data-tab="articles" onclick="go('articles')" title="مقالات و پژوهش‌های حقوقی">
      <span class="dock-icon">📚</span>
      <span class="dock-label">مقالات و پژوهش‌ها</span>
    </button>
    <button class="dock-btn" data-tab="deadlines" onclick="go('deadlines')" title="مواعد قانونی و قضایی">
      <span class="dock-icon">⚖️</span>
      <span class="dock-label">مواعد قانونی</span>
    </button>
    <button class="dock-btn" data-tab="calculator" onclick="go('calculator')" title="محاسبه‌گر هزینه دادرسی و خسارت">
      <span class="dock-icon">🧮</span>
      <span class="dock-label">محاسبه‌گر حقوقی</span>
    </button>
    <button class="dock-btn" id="dockAdminBtn" data-tab="admin" onclick="go('admin')" title="مدیریت سیستم">
      <span class="dock-icon">🛠</span>
      <span class="dock-label">مدیریت سیستم</span>
    </button>
  </nav>
  <div class="dock-footer">
    <button class="dock-btn-auth" onclick="openAuthModal()">
      <span class="dock-icon">👤</span>
      <span class="dock-label" id="dockAuthLabel">ورود / حساب</span>
    </button>
  </div>
</aside>
"""

# Replace rightDock if present, else prepend after <body>
if '<aside class="right-hover-dock"' in text:
    text = re.sub(r'<aside class="right-hover-dock"[\s\S]*?</aside>', dock_html.strip(), text)
else:
    text = text.replace("<body>", "<body>\n" + dock_html.strip())

# Top nav tabs with direct onclick="go('...')"
top_tabs_html = """<nav class="tabs">
  <button class="active" data-tab="search" onclick="go('search')">🔎 جستجوی مواد</button>
  <button data-tab="planner" onclick="go('planner')">📅 برنامه مطالعاتی</button>
  <button data-tab="articles" onclick="go('articles')">📚 مقالات و پژوهش‌ها</button>
  <button data-tab="deadlines" onclick="go('deadlines')">⚖️ مواعد قانونی</button>
  <button data-tab="calculator" onclick="go('calculator')">🧮 محاسبه‌گر حقوقی</button>
  <button data-tab="admin" onclick="go('admin')">🛠 مدیریت سیستم</button>
</nav>"""

text = re.sub(r'<nav class="tabs">[\s\S]*?</nav>', top_tabs_html, text)

# =====================================================================
# 2. Sections: Articles, Deadlines, and Calculators
# =====================================================================

sections_html = """
<section id="tab-articles" class="hidden">
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>📚 مقالات، تحلیل‌ها و پژوهش‌های حقوقی</h2>
        <div class="muted small">مجموعه پژوهش‌های تخصصی، تحلیل‌های رویه قضایی و مقالات دکترین گروه حقوقی برائت</div>
      </div>
      <button class="btn primary" onclick="openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>
    </div>

    <div class="row between" style="margin-bottom:16px; gap:10px;">
      <div style="flex:1; max-width:440px;">
        <input id="artSearch" placeholder="جستجو در عنوان یا متن مقالات..." oninput="renderArticles()">
      </div>
      <div style="width:auto; min-width:200px;">
        <select id="artCatFilter" onchange="renderArticles()">
          <option value="all">همه گرایش‌های حقوقی</option>
          <option value="حقوق مدنی">حقوق مدنی</option>
          <option value="حقوق تجارت">حقوق تجارت</option>
          <option value="آیین دادرسی مدنی">آیین دادرسی مدنی</option>
          <option value="حقوق جزا و جرم‌شناسی">حقوق جزا و جرم‌شناسی</option>
          <option value="آیین دادرسی کیفری">آیین دادرسی کیفری</option>
          <option value="رویه قضایی و دیوان عالی">رویه قضایی و دیوان عالی</option>
          <option value="حقوق ثبت و املاک">حقوق ثبت و املاک</option>
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
        <h2>⚖️ مواعد قانونی و قضایی (محاسبه‌گر و جدول مواعد)</h2>
        <div class="muted small">محاسبه دقیق مهلت‌های قانونی با اعمال مواد ۴۴۳ الی ۴۴۵ قانون آیین دادرسی مدنی</div>
      </div>
      <div class="row" style="gap:8px;">
        <button class="btn primary" onclick="openDeadlineEditor()">＋ افزودن موعد جدید</button>
        <button class="btn" onclick="resetDefaultDeadlines()">بازنشانی مواعد پیش‌فرض</button>
      </div>
    </div>

    <!-- Interactive Calculator -->
    <div style="background:#f0fdfa; border:1px solid #99f6e4; border-radius:18px; padding:22px; margin-bottom:24px;">
      <h3 style="margin:0 0 14px; font-size:15px; color:#0f766e;">محاسبه‌گر آنلاین موعد اقدام بر اساس ابلاغ در سامانه ثنا</h3>
      <div class="form-grid" style="align-items:end;">
        <div class="field">
          <label>انتخاب موعد یا اقدام قانونی</label>
          <select id="calcDlSelect" onchange="computeDeadlineResult()"></select>
        </div>
        <div class="field">
          <label>تاریخ ابلاغ الکترونیک در سامانه ثنا</label>
          <input type="date" id="calcDlDate" onchange="computeDeadlineResult()">
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label class="check" style="cursor:pointer; display:inline-flex; width:auto; border:0; padding:0; background:transparent;">
            <input type="checkbox" id="calcDlAbroad" onchange="computeDeadlineResult()">
            <span>محل اقامت شخص ابلاغ‌شونده خارج از کشور است (مهلت طولانی‌تر قانون)</span>
          </label>
        </div>
      </div>
      <div id="calcDlOutput" style="margin-top:16px;"></div>
    </div>

    <!-- Deadlines Grid -->
    <h3 style="margin:20px 0 12px; font-size:16px;">فهرست جامع مواعد قانونی ایران (قابل ویرایش و اضافه کردن)</h3>
    <div class="deadlines-grid" id="deadlinesGrid"></div>
  </div>
</section>

<section id="tab-calculator" class="hidden">
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>🧮 محاسبه‌گرهای حقوقی، خسارت و تعرفه‌ها</h2>
        <div class="muted small">محاسبه دقیق هزینه دادرسی، خسارت تأخیر تأدیه و تعرفه قانونی حق‌الوکاله</div>
      </div>
      <div class="row" style="gap:8px;">
        <button class="btn primary" onclick="openCustomCalcEditor()">＋ افزودن محاسبه‌گر جدید</button>
      </div>
    </div>

    <div class="form-grid" style="gap:20px;">
      <!-- Court fees calculator -->
      <div class="calculator-card">
        <h3 style="margin:0 0 6px; font-size:16px; color:#0f766e;">۱. محاسبه هزینه دادرسی دعاوی مالی و غیرمالی</h3>
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px;">محاسبه بر مبنای قانون وصول برخی از درآمدهای دولت و جدول تعرفه مصوب قوه قضائیه</p>
        <div class="field">
          <label>مرحله رسیدگی قضایی</label>
          <select id="cfStage" onchange="calcCourtFees()">
            <option value="first">مرحله نخستین / بدوی (۲.۵٪ تا ۲۰ میلیون تومان، مازاد ۳.۵٪)</option>
            <option value="appeal">مرحله تجدیدنظر و واخواهی (۴.۵٪ مبلغ خواسته)</option>
            <option value="supreme">مرحله فرجام‌خواهی و اعاده دادرسی (۵.۵٪ مبلغ خواسته)</option>
            <option value="exec">اجرای احکام مدنی (۵٪ مبلغ محکوم‌به - نیم‌عشر دولتی)</option>
          </select>
        </div>
        <div class="field" style="margin-top:12px;">
          <label>بهای خواسته یا مبلغ مورد مطالبه (تومان)</label>
          <input type="text" id="cfAmount" value="50,000,000" oninput="calcCourtFees()">
        </div>
        <div id="cfResult"></div>
      </div>

      <!-- Attorney fees calculator -->
      <div class="calculator-card">
        <h3 style="margin:0 0 6px; font-size:16px; color:#0f766e;">۲. محاسبه تعرفه قانونی حق‌الوکاله وکیل</h3>
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px;">طبق آیین‌نامه تعرفه حق‌الوکاله و هزینه سفر وکلای دادگستری مصوب قوه قضائیه</p>
        <div class="field">
          <label>بهای خواسته یا مبلغ محکوم‌به (تومان)</label>
          <input type="text" id="atAmount" value="100,000,000" oninput="calcAttorneyFees()">
        </div>
        <div id="atResult"></div>
      </div>

      <!-- Late payment interest -->
      <div class="calculator-card" style="grid-column:1/-1;">
        <h3 style="margin:0 0 6px; font-size:16px; color:#0f766e;">۳. محاسبه خسارت تأخیر تأدیه (ماده ۵۲۲ قانون آیین دادرسی مدنی)</h3>
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px;">بر اساس فرمول شاخص بهای کالاها و خدمات مصرفی بانک مرکزی جمهوری اسلامی ایران</p>
        <div class="form-grid">
          <div class="field">
            <label>مبلغ اصل دین / طلب (تومان)</label>
            <input type="text" id="lpAmount" value="100,000,000" oninput="calcLatePayment()">
          </div>
          <div class="field">
            <label>سال سررسید دین (زمان استحقاق)</label>
            <input type="number" id="lpYearDue" value="1399" oninput="calcLatePayment()">
          </div>
          <div class="field">
            <label>سال پرداخت یا مطالبه</label>
            <input type="number" id="lpYearPay" value="1403" oninput="calcLatePayment()">
          </div>
        </div>
        <div id="lpResult"></div>
      </div>
    </div>

    <!-- Custom calculators -->
    <h3 style="margin:26px 0 12px; font-size:16px;">محاسبه‌گرهای اختصاصی و فرمول‌های سفارشی (قابل تنظیم و ویرایش)</h3>
    <div class="articles-grid" id="customCalculatorsGrid"></div>
  </div>
</section>
"""

# Replace or insert tab-articles, tab-deadlines, tab-calculator
pattern_sections = r'<section id="tab-articles"[\s\S]*?</section>\s*<section id="tab-deadlines"[\s\S]*?</section>\s*<section id="tab-calculator"[\s\S]*?</section>'
if re.search(pattern_sections, text):
    text = re.sub(pattern_sections, sections_html.strip(), text)
else:
    p_end = text.find("</section>", text.find('<section id="tab-planner"')) + 10
    text = text[:p_end] + "\n" + sections_html.strip() + "\n" + text[p_end:]

# =====================================================================
# 3. Dedicated Admin Panels for Deadlines, Calculators, and Articles
# =====================================================================

admin_extra_panels = """
  <!-- پنل مدیریت مقالات و پژوهش‌ها -->
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>📚 مدیریت و نگارش مقالات پژوهشی</h2>
        <div class="muted small">نگارش، انتشار، ویرایش و حذف مقالات تخصصی و یادداشت‌های تحلیلی گروه حقوقی برائت</div>
      </div>
      <button class="btn primary" onclick="openArticleEditor()">✍️ نگارش مقاله جدید</button>
    </div>
    <div id="admArticlesList"></div>
  </div>

  <!-- پنل مدیریت مواعد قانونی -->
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>⚖️ مدیریت مواعد قانونی (ویرایش و افزودن)</h2>
        <div class="muted small">افزودن مواعد قانونی جدید، تغییر تعداد روزها و مستندات قانونی</div>
      </div>
      <div class="row" style="gap:6px;">
        <button class="btn primary" onclick="openDeadlineEditor()">＋ افزودن موعد جدید</button>
        <button class="btn" onclick="resetDefaultDeadlines()">بازنشانی پیش‌فرض‌ها</button>
      </div>
    </div>
    <div id="admDeadlinesList"></div>
  </div>

  <!-- پنل مدیریت محاسبه‌گرها و نرخ‌ها -->
  <div class="panel">
    <div class="panel-head">
      <div>
        <h2>🧮 مدیریت فرمول‌ها و محاسبه‌گرهای حقوقی</h2>
        <div class="muted small">ویرایش نرخ‌ها و درصدهای محاسبه‌گرها یا افزودن فرمول سفارشی جدید</div>
      </div>
      <button class="btn primary" onclick="openCustomCalcEditor()">＋ افزودن فرمول جدید</button>
    </div>
    <div id="admCalculatorsList"></div>
  </div>
"""

# Replace or inject in tab-admin
pattern_adm = r'<section id="tab-admin" class="hidden">[\s\S]*?<div class="panel">'
text = re.sub(
    r'<section id="tab-admin" class="hidden">\s*<div class="panel">',
    '<section id="tab-admin" class="hidden">\n' + admin_extra_panels + '\n  <div class="panel">',
    text,
    count=1
)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(text)

print("Updated HTML markup with all sections, dock, and admin panels!")
