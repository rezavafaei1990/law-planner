import re

with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

# 1. Ensure chic.css is linked in <head>
if 'chic.css' not in html:
    html = html.replace('</head>', '  <link rel="stylesheet" href="/src/chic.css">\n</head>')

# 2. Get pristine tab-planner from raw_planner.html
with open("/tmp/raw_planner.html", "r", encoding="utf-8") as f:
    orig = f.read()

p_start_orig = orig.find('<section id="tab-planner"')
p_end_orig = orig.find('<section id="tab-admin"')
pristine_planner = orig[p_start_orig:p_end_orig].strip()

# 3. Define the three new sections (Articles, Deadlines, Calculator)
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

# 4. Define clean tab-admin with management panels
admin_html = """
<section id="tab-admin" class="hidden">
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

  <div class="panel"><div class="panel-head"><h2>🛠 قوانین موجود در پایگاه</h2></div><div id="admLaws"></div></div>
  <div class="panel"><h2>افزودن یا جایگزینی قانون (اکسل)</h2><p class="muted small">هر فایل یک قانون است و نام قانون از نام فایل گرفته می‌شود. ستون‌ها خودکار تشخیص داده می‌شوند و نتیجه‌ی تشخیص در «گزارش» پایین نوشته می‌شود.</p>
   <div class="row"><input type="file" id="admFiles" accept=".xlsx,.xls,.csv" multiple><label class="small"><input type="checkbox" id="admReplace" checked style="width:auto"> اگر قانونی با همین نام هست، جایگزین شود (وگرنه موادش به آخر اضافه می‌شود)</label></div></div>
  <div class="panel"><h2>آرای وحدت رویه (اکسل)</h2><input type="file" id="admDec" accept=".xlsx,.xls,.csv" multiple></div>
  <div class="panel"><h2>ایمپورت فایل JSON</h2><p class="muted small">برای انتقال یک‌باره‌ی داده‌های قبلی (فایل <b>laws-export.json</b>).</p><input type="file" id="admJson" accept=".json"></div>
  <div class="panel"><h2>افزودن یک ماده</h2>
   <div class="form-grid"><div class="field"><label>قانون</label><select id="admAddLaw"></select></div><div class="field"><label>نام قانون جدید</label><input id="admNewLaw" class="hidden"></div>
   <div class="field"><label>شماره ماده</label><input id="admNum"></div><div class="field"><label>عنوان ماده (اختیاری، مثل «ماده ۵ مکرر»)</label><input id="admNumText"></div>
   <div class="field" style="grid-column:1/-1"><label>مسیر (باب › فصل › مبحث)</label><input id="admPath"></div></div>
   <div class="field" style="margin-top:10px"><label>متن ماده</label><textarea id="admText" rows="4"></textarea></div><div class="modal-actions"><button class="btn primary" id="admAddBtn">افزودن ماده</button></div></div>
  <div class="panel"><h2>گزارش</h2><pre id="admLog"></pre></div>
</section>
"""

# 5. In current html, find everything between <section id="tab-planner" and </section> of tab-admin
p_start = html.find('<section id="tab-planner"')
p_admin = html.find('<section id="tab-admin"')
p_admin_end = html.find('</section>', html.find('<pre id="admLog"></pre>')) + 10

# Construct the correct sequence of sections:
# tab-planner -> tab-articles -> tab-deadlines -> tab-calculator -> tab-admin
replacement_middle = pristine_planner + "\n" + sections_html.strip() + "\n" + admin_html.strip()

html = html[:p_start] + replacement_middle + html[p_admin_end:]

# 6. Fix updateAuthUI and inline go in index.html
# Safe adminTab toggle
html = html.replace(
    'document.getElementById("adminTab").classList.toggle("hidden",!isAdmin)',
    'const at=document.getElementById("adminTab");if(at)at.classList.toggle("hidden",!isAdmin);'
)

# Fix inline go(tab)
old_go_pattern = r'const ALL_TABS=\["search","planner","articles","deadlines","calculator","admin"\];function go\(tab\)\{[\s\S]*?window\.scrollTo\(\{top:0,behavior:"smooth"\}\);\}'
new_go_code = '''const ALL_TABS=["search","planner","articles","deadlines","calculator","admin"];
function go(tab){
  if(window.go && window.go !== go){ return window.go(tab); }
  if(!ALL_TABS.includes(tab)) tab="search";
  ALL_TABS.forEach(n=>{
    const el=document.getElementById("tab-"+n);
    if(el) el.classList.toggle("hidden",n!==tab);
  });
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  try{history.replaceState(null,"","#"+tab)}catch(e){}
  if(tab==="planner") enterPlanner();
  if(tab==="admin"){
    if(window.LAWDB && LAWDB.admRefresh) LAWDB.admRefresh();
    if(window.renderAdminPanels) window.renderAdminPanels();
  }
  if(tab==="articles" && window.renderArticles) window.renderArticles();
  if(tab==="deadlines" && window.renderDeadlines) window.renderDeadlines();
  if(tab==="calculator" && window.renderCalculators) window.renderCalculators();
  window.scrollTo({top:0,behavior:"smooth"});
}'''

html = re.sub(old_go_pattern, new_go_code, html)

# 7. Add baraat_engine.js script tag before </body>
if '<script src="/src/baraat_engine.js"></script>' not in html:
    # Replace baraat_modules.js with baraat_engine.js
    if '<script type="module" src="/src/baraat_modules.js"></script>' in html:
        html = html.replace(
            '<script type="module" src="/src/baraat_modules.js"></script>',
            '<script src="/src/baraat_engine.js"></script>'
        )
    else:
        html = html.replace('</body>', '<script src="/src/baraat_engine.js"></script>\n</body>')

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("Repair completed successfully!")
