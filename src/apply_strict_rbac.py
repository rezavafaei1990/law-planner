import re

# 1. Update src/chic.css with adm-only rules
with open("src/chic.css", "r", encoding="utf-8") as f:
    css = f.read()

adm_css = """
/* RBAC: Admin-only elements hidden by default, visible only to verified admins */
.adm-only {
  display: none !important;
}
body.is-admin .adm-only {
  display: inline-flex !important;
}
div.adm-only, p.adm-only, section.adm-only {
  display: none !important;
}
body.is-admin div.adm-only, body.is-admin p.adm-only, body.is-admin section.adm-only {
  display: block !important;
}
"""

if "/* RBAC: Admin-only elements" not in css:
    css += "\n" + adm_css
    with open("src/chic.css", "w", encoding="utf-8") as f:
        f.write(css)

print("Updated chic.css with RBAC styling!")

# 2. Update src/baraat_engine.js to guard functions and conditionally render edit/delete buttons
with open("src/baraat_engine.js", "r", encoding="utf-8") as f:
    engine = f.read()

# Guard saveArticle and deleteArticle
engine = re.sub(
    r'window\.saveArticle = function\(art\) \{',
    'window.saveArticle = function(art) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: نگارش مقاله فقط برای مدیر سامانه مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.deleteArticle = function\(id\) \{',
    'window.deleteArticle = function(id) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف مقاله فقط برای مدیر سامانه مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.openArticleEditor = function\(id\) \{',
    'window.openArticleEditor = function(id) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: نگارش مقاله فقط برای مدیر سامانه مجاز است."); return; }',
    engine
)

# Guard saveDeadline, deleteDeadline, resetDefaultDeadlines, openDeadlineEditor
engine = re.sub(
    r'window\.saveDeadline = function\(dl\) \{',
    'window.saveDeadline = function(dl) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: تغییر مواعد فقط برای مدیر مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.deleteDeadline = function\(id\) \{',
    'window.deleteDeadline = function(id) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف مواعد فقط برای مدیر مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.resetDefaultDeadlines = function\(\) \{',
    'window.resetDefaultDeadlines = function() {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: بازنشانی مواعد فقط برای مدیر مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.openDeadlineEditor = function\(id\) \{',
    'window.openDeadlineEditor = function(id) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ویرایش مواعد فقط برای مدیر مجاز است."); return; }',
    engine
)

# Guard saveCustomCalculator, deleteCustomCalculator, openCustomCalcEditor
engine = re.sub(
    r'window\.saveCustomCalculator = function\(calc\) \{',
    'window.saveCustomCalculator = function(calc) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ثبت فرمول فقط برای مدیر مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.deleteCustomCalculator = function\(id\) \{',
    'window.deleteCustomCalculator = function(id) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: حذف فرمول فقط برای مدیر مجاز است."); return; }',
    engine
)

engine = re.sub(
    r'window\.openCustomCalcEditor = function\(id\) \{',
    'window.openCustomCalcEditor = function(id) {\n    if (!window.isAdmin) { if (typeof toast === "function") toast("خطای دسترسی: ویرایش فرمول‌ها فقط برای مدیر مجاز است."); return; }',
    engine
)

# Conditional rendering of edit/delete in renderArticles
old_art_actions = """            <div class="art-actions">
              <button class="btn small primary" onclick="readArticle('${a.id}')">📖 مطالعه کامل</button>
              <div class="row" style="gap:4px">
                <button class="btn small" onclick="openArticleEditor('${a.id}')" title="ویرایش">✎</button>
                <button class="btn small danger" onclick="deleteArticle('${a.id}')" title="حذف">✕</button>
              </div>
            </div>"""

new_art_actions = """            <div class="art-actions">
              <button class="btn small primary" onclick="readArticle('${a.id}')">📖 مطالعه کامل</button>
              ${window.isAdmin ? `
                <div class="row" style="gap:4px">
                  <button class="btn small" onclick="openArticleEditor('${a.id}')" title="ویرایش">✎</button>
                  <button class="btn small danger" onclick="deleteArticle('${a.id}')" title="حذف">✕</button>
                </div>
              ` : ''}
            </div>"""

engine = engine.replace(old_art_actions, new_art_actions)

# Conditional write button in empty state
old_empty_art_btn = """          <div style="margin-top: 18px;">
            <button class="btn primary" onclick="openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>
          </div>"""

new_empty_art_btn = """          ${window.isAdmin ? `
            <div style="margin-top: 18px;">
              <button class="btn primary" onclick="openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>
            </div>
          ` : ''}"""

engine = engine.replace(old_empty_art_btn, new_empty_art_btn)

# Conditional edit/delete in renderDeadlines
old_dl_actions = """          <div class="row" style="gap:6px; justify-content:flex-end;">
            <button class="btn small" onclick="openDeadlineEditor('${d.id}')">✎ ویرایش</button>
            <button class="btn small danger" onclick="deleteDeadline('${d.id}')">✕ حذف</button>
          </div>"""

new_dl_actions = """          ${window.isAdmin ? `
            <div class="row" style="gap:6px; justify-content:flex-end;">
              <button class="btn small" onclick="openDeadlineEditor('${d.id}')">✎ ویرایش</button>
              <button class="btn small danger" onclick="deleteDeadline('${d.id}')">✕ حذف</button>
            </div>
          ` : ''}"""

engine = engine.replace(old_dl_actions, new_dl_actions)

# Conditional edit/delete in renderCalculators
old_calc_actions = """          <div class="row" style="gap:4px">
            <button class="btn small" onclick="openCustomCalcEditor('${c.id}')" title="ویرایش فرمول">✎</button>
            <button class="btn small danger" onclick="deleteCustomCalculator('${c.id}')" title="حذف">✕</button>
          </div>"""

new_calc_actions = """          ${window.isAdmin ? `
            <div class="row" style="gap:4px">
              <button class="btn small" onclick="openCustomCalcEditor('${c.id}')" title="ویرایش فرمول">✎</button>
              <button class="btn small danger" onclick="deleteCustomCalculator('${c.id}')" title="حذف">✕</button>
            </div>
          ` : ''}"""

engine = engine.replace(old_calc_actions, new_calc_actions)

with open("src/baraat_engine.js", "w", encoding="utf-8") as f:
    f.write(engine)

print("Updated baraat_engine.js with strict RBAC guards!")

# 3. Update index.html
with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Add adm-only class to admin-action buttons in tab-articles, tab-deadlines, tab-calculator
html = html.replace(
    '<button class="btn primary" onclick="openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>',
    '<button class="btn primary adm-only" onclick="openArticleEditor()">✍️ نگارش و انتشار مقاله جدید</button>'
)

html = html.replace(
    '<button class="btn primary" onclick="openDeadlineEditor()">＋ افزودن موعد جدید</button>',
    '<button class="btn primary adm-only" onclick="openDeadlineEditor()">＋ افزودن موعد جدید</button>'
)

html = html.replace(
    '<button class="btn" onclick="resetDefaultDeadlines()">بازنشانی مواعد پیش‌فرض</button>',
    '<button class="btn adm-only" onclick="resetDefaultDeadlines()">بازنشانی مواعد پیش‌فرض</button>'
)

html = html.replace(
    '<button class="btn primary" onclick="openCustomCalcEditor()">＋ افزودن محاسبه‌گر جدید</button>',
    '<button class="btn primary adm-only" onclick="openCustomCalcEditor()">＋ افزودن محاسبه‌گر جدید</button>'
)

# Protect tab-admin with Gate when not isAdmin
admin_gate_html = """<section id="tab-admin" class="hidden">
  <!-- گیت امنیتی دسترسی مدیران -->
  <div id="adminAccessGate" class="panel text-center" style="padding: 48px 24px; text-align: center;">
    <div style="font-size: 52px; margin-bottom: 14px;">🔒</div>
    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 10px;">بخش مدیریت سامانه برائت</h2>
    <p class="muted" style="max-width: 540px; margin: 0 auto 22px; font-size: 14px; line-height: 2;">
      دسترسی به بخش مدیریت سامانه، انتشار مقالات پژوهشی، تغییر مواعد قانونی، فرمول‌ها و تنقیح قوانین، <b>منحصراً برای مدیرانی است که ایمیل آن‌ها در پایگاه داده Supabase ثبت شده باشد</b>.
    </p>
    <div class="row" style="justify-content: center; gap: 10px;">
      <button class="btn primary" onclick="openAuthModal()">ورود با حساب مدیریت</button>
      <button class="btn" onclick="go('search')">بازگشت به جستجوی مواد</button>
    </div>
  </div>

  <div id="adminSuiteContent" style="display: none;">"""

html = re.sub(
    r'<section id="tab-admin" class="hidden">\s*<!-- پنل مدیریت مقالات و پژوهش‌ها -->',
    admin_gate_html + '\n  <!-- پنل مدیریت مقالات و پژوهش‌ها -->',
    html,
    count=1
)

# Close the adminSuiteContent div right before </section>
html = re.sub(
    r'<div class="panel"><h2>گزارش</h2><pre id="admLog"></pre></div>\s*</section>',
    '<div class="panel"><h2>گزارش</h2><pre id="admLog"></pre></div>\n  </div>\n</section>',
    html,
    count=1
)

# Update afterAuth and updateAuthUI in index.html to manage isAdmin state and class
auth_update_code = """function updateAuthUI(){
  window.isAdmin = typeof isAdmin !== 'undefined' ? !!isAdmin : false;
  window.me = typeof me !== 'undefined' ? me : null;

  document.body.classList.toggle('is-admin', !!window.isAdmin);

  document.getElementById("authBtn").classList.toggle("hidden", !!me);
  const o = document.getElementById("outBtn");
  o.classList.toggle("hidden", !me);
  if (me) o.textContent = "خروج (" + (me.email || "").split("@")[0] + (window.isAdmin ? " · مدیر" : "") + ")";

  const dockAuth = document.getElementById("dockAuthLabel");
  if (dockAuth) dockAuth.textContent = me ? (me.email || "").split("@")[0] + (window.isAdmin ? " (مدیر)" : "") : "ورود / حساب";

  // Hide or show admin-only elements
  document.querySelectorAll(".adm-only").forEach(el => {
    el.style.display = window.isAdmin ? "" : "none";
  });

  // Admin section gate vs suite
  const admContent = document.getElementById("adminSuiteContent");
  const admGate = document.getElementById("adminAccessGate");
  if (admContent && admGate) {
    admContent.style.display = window.isAdmin ? "block" : "none";
    admGate.style.display = window.isAdmin ? "none" : "block";
  }

  // Update tabs to re-render buttons based on role
  if (window.renderArticles) window.renderArticles();
  if (window.renderDeadlines) window.renderDeadlines();
  if (window.renderCalculators) window.renderCalculators();
}

async function afterAuth(user){
  me = user;
  try {
    const r = await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    isAdmin = !!(r.data && r.data.user_id);
  } catch(e) {
    isAdmin = false;
  }
  window.isAdmin = isAdmin;
  window.me = me;
  document.body.classList.toggle('is-admin', !!isAdmin);
  updateAuthUI();
  if (window.renderAdminPanels) window.renderAdminPanels();
  if (window.LAWDB) LAWDB.onAdmin();
  if (!document.getElementById("tab-planner").classList.contains("hidden")) enterPlanner();
}"""

html = re.sub(
    r'function updateAuthUI\(\)\{[\s\S]*?async function afterAuth\(user\)\{[\s\S]*?enterPlanner\(\)\}',
    auth_update_code,
    html
)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("Updated index.html with strict RBAC access gate and UI updates!")
