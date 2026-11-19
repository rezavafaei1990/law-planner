import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, Star, Copy, ChevronLeft, ChevronRight, Edit3, Trash2, BookOpen, Share2, ExternalLink } from 'lucide-react';
import heroImage from '../assets/images/hero_legal_architecture_1794776842788.jpg';
import { useBaraat } from '../context/BaraatContext';
import type { Article } from '../types';
import { supabase, bumpLawVersion } from '../services/supabase';
import {
  toFa,
  toEn,
  normFa,
  formatLegalText,
  parseQuery,
  scanArticleRefs,
  resolveHintLaw,
} from '../utils/legal';
import { updateDocumentSeo } from '../utils/seo';

type SearchMode = 'all' | 'text' | 'topic' | 'marks';

export const HomeSearchPage: React.FC = () => {
  const { lawSlug, artNum } = useParams<{ lawSlug?: string; artNum?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    laws,
    articles,
    decisions,
    dbLoading,
    dbError,
    reloadLawDb,
    journalArticles,
    isAdmin,
    user,
    planner,
    toggleArticleMark,
    showToast,
  } = useBaraat();

  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [mode, setMode] = useState<SearchMode>('all');
  const [exactPath, setExactPath] = useState<string>('');
  const [showAllAdmin, setShowAllAdmin] = useState(false);
  const [limit, setLimit] = useState(60);
  const [expandedRef, setExpandedRef] = useState<Record<string, Article | null>>({});
  const [editingArt, setEditingArt] = useState<Article | null>(null);
  const [editText, setEditText] = useState('');
  const [editPath, setEditPath] = useState('');

  const selectedLawName = useMemo(() => {
    if (!lawSlug) return '';
    const decoded = decodeURIComponent(lawSlug);
    const normalized = decoded.replace(/-/g, ' ');
    const found = laws.find((l) => String(l.id) === decoded || l.name === decoded || l.name === normalized);
    return found ? found.name : decoded;
  }, [lawSlug, laws]);

  const decodedArtNum = artNum ? decodeURIComponent(artNum).trim() : '';

  useEffect(() => {
    setLimit(60);
    setExactPath('');
  }, [selectedLawName, decodedArtNum]);

  useEffect(() => {
    if (selectedLawName && decodedArtNum) {
      updateDocumentSeo({
        title: `ماده ${toFa(decodedArtNum)} ${selectedLawName} | گروه حقوقی برائت`,
        description: `متن کامل ماده ${toFa(decodedArtNum)} ${selectedLawName} به همراه ارجاعات و مواد مرتبط در سامانه حقوقی برائت.`,
        canonicalPath: `/laws/${encodeURIComponent(selectedLawName)}/${encodeURIComponent(decodedArtNum)}`,
      });
    } else if (selectedLawName) {
      updateDocumentSeo({
        title: `متن کامل ${selectedLawName} | جستجو و بررسی مواد — برائت`,
        description: `متن کامل ${selectedLawName} با قابلیت جستجوی فوری، دسته‌بندی باب و فصل و یادداشت‌برداری.`,
        canonicalPath: `/laws/${encodeURIComponent(selectedLawName)}`,
      });
    } else {
      updateDocumentSeo({
        title: 'گروه حقوقی برائت | سامانه جامع قوانین، مقالات و ابزارهای حقوقی',
        description: 'جستجوی سریع قوانین ایران، آرای وحدت رویه دیوان عالی کشور، نشریه تخصصی حقوق، محاسبه‌گرهای حقوقی و برنامه مطالعاتی.',
        canonicalPath: '/',
      });
    }
  }, [selectedLawName, decodedArtNum]);

  const articleIndex = useMemo(() => {
    const map = new Map<string, Map<string, Article>>();
    for (const a of articles) {
      let inner = map.get(a.law);
      if (!inner) {
        inner = new Map<string, Article>();
        map.set(a.law, inner);
      }
      const rawKey = String(a.num || '').trim();
      const normKey = toEn(rawKey).replace(/\s+/g, ' ').trim();
      const numericOnly = normKey.replace(/^0+/, '') || normKey;
      if (rawKey && !inner.has(rawKey)) inner.set(rawKey, a);
      if (normKey && !inner.has(normKey)) inner.set(normKey, a);
      if (numericOnly && !inner.has(numericOnly)) inner.set(numericOnly, a);
      // Also index "X مکرر" if num_text specifies مکرر
      const numTextEn = toEn(String(a.num_text || ''));
      if (/مکرر/.test(numTextEn)) {
        const mNum = numTextEn.match(/\d+/);
        if (mNum) {
          const mokKey = `${String(Number(mNum[0]))} مکرر`;
          if (!inner.has(mokKey)) inner.set(mokKey, a);
        }
      }
    }
    return map;
  }, [articles]);

  const lawCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) {
      counts.set(a.law, (counts.get(a.law) || 0) + 1);
    }
    return counts;
  }, [articles]);

  const lawNames = useMemo(() => laws.map((l) => l.name), [laws]);

  const { filtered, topics } = useMemo(() => {
    const inLaw = selectedLawName ? articles.filter((a) => a.law === selectedLawName) : articles;

    if (decodedArtNum && selectedLawName) {
      const exact = inLaw.filter((a) => a.num === decodedArtNum || a.num_text === decodedArtNum);
      return { filtered: exact, topics: [] as { key: string; label: string; count: number }[] };
    }

    if (mode === 'marks') {
      const marks = planner.marks || {};
      const marked = inLaw.filter((a) => Boolean(marks[`${a.law}|${a.num_text}`]));
      return { filtered: marked, topics: [] };
    }

    const { num, words } = parseQuery(query);
    const hasQuery = num !== null || words.length > 0 || Boolean(exactPath);

    if (!hasQuery && mode === 'topic') {
      const tMap = new Map<string, { label: string; count: number }>();
      for (const a of inLaw) {
        if (!a.path.length) continue;
        const k = `${a.law}\u0001${a.path.join(' › ')}`;
        const prev = tMap.get(k);
        const label = selectedLawName ? a.path.join(' › ') : `${a.law} › ${a.path.join(' › ')}`;
        tMap.set(k, { label, count: (prev?.count || 0) + 1 });
      }
      const list = Array.from(tMap.entries()).map(([key, v]) => ({ key, ...v }));
      return { filtered: [], topics: list };
    }

    if (!hasQuery && !showAllAdmin && !selectedLawName) {
      return { filtered: [], topics: [] };
    }

    if (!hasQuery && selectedLawName && !showAllAdmin) {
      // On a dedicated /laws/:lawName SEO page, immediately show the opening articles of that law!
      return { filtered: inLaw, topics: [] };
    }

    const field = mode === 'text' ? 'tn' : mode === 'topic' ? 'pn' : 'norm';
    const matches = inLaw.filter((a) => {
      if (exactPath && `${a.law}\u0001${a.path.join(' › ')}` !== exactPath) return false;
      if (num !== null && a.num !== num) return false;
      return words.every((w) => (a[field] || '').includes(w));
    });
    return { filtered: matches, topics: [] };
  }, [articles, selectedLawName, decodedArtNum, mode, planner.marks, query, exactPath, showAllAdmin]);

  const isLandingState = !selectedLawName && !decodedArtNum && !query.trim() && mode !== 'marks' && mode !== 'topic' && !showAllAdmin;

  const handleLawChange = (nextLaw: string) => {
    if (!nextLaw) navigate('/laws');
    else navigate(`/laws/${encodeURIComponent(nextLaw)}`);
  };

  const handleCopy = (a: Article) => {
    const text = `${a.law} - ${a.num_text}\n\n${a.text}`;
    navigator.clipboard?.writeText(text);
    showToast('متن ماده کپی شد.');
  };

  const handleShareArticle = (a: Article) => {
    const url = `${window.location.origin}/laws/${encodeURIComponent(a.law)}/${encodeURIComponent(a.num)}`;
    navigator.clipboard?.writeText(url);
    showToast('لینک اختصاصی ماده کپی شد.');
  };

  const saveArticleEdit = async () => {
    if (!editingArt || !isAdmin) return;
    const nextPath = editPath.split('›').map((x) => x.trim()).filter(Boolean);
    const res = await supabase.from('articles').update({ text: editText, path: nextPath }).eq('id', editingArt.id);
    if (res.error) {
      showToast(res.error.message);
      return;
    }
    await bumpLawVersion();
    await reloadLawDb(true);
    setEditingArt(null);
    showToast('تغییرات ماده با موفقیت ذخیره شد.');
  };

  const deleteSingleArticle = async (a: Article) => {
    if (!isAdmin) return;
    const res = await supabase.from('articles').delete().eq('id', a.id);
    if (res.error) {
      showToast(res.error.message);
      return;
    }
    await bumpLawVersion();
    await reloadLawDb(true);
    showToast('ماده حذف شد.');
  };

  const renderHighlighted = (txt: string) => {
    const { words } = parseQuery(query);
    if (!words.length) return txt;
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ی/g, '[یيى]').replace(/ک/g, '[کك]'));
    const re = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = txt.split(re);
    return parts.map((part, idx) =>
      idx % 2 === 1 ? (
        <mark key={idx} className="rounded bg-amber-300/60 px-0.5 text-slate-900 dark:bg-amber-400/30 dark:text-amber-100">
          {part}
        </mark>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      )
    );
  };

  const marks = planner.marks || {};

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      {/* Architectural Hero on Home Landing */}
      {isLandingState && (
        <section className="mb-10 grid grid-cols-1 items-stretch overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] lg:grid-cols-12">
          <div className="flex flex-col justify-between p-6 sm:p-10 lg:col-span-7">
            <div>
              <p className="text-xs font-bold text-teal-700 dark:text-teal-400">
                پایگاه منقح قوانین و دکترین حقوقی ایران
              </p>
              <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-[var(--ink)] sm:text-4xl">
                دسترسی فوری به متن قوانین، آرای وحدت رویه و ابزارهای حقوقی
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-[var(--ink-muted)]">
                شماره ماده، واژه کلیدی یا عنوان قانون را بنویسید تا ارجاعات متقابل، آرای دیوان عالی کشور و یادداشت‌های اختصاصی شما در لحظه نمایش داده شود.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-[var(--hairline)] pt-6 tabular-nums">
              <div>
                <div className="text-2xl font-extrabold text-[var(--ink)]">{toFa(laws.length || 19)}</div>
                <div className="text-xs text-[var(--ink-muted)]">قانون مادر و آیین‌نامه</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-[var(--ink)]">{toFa(articles.length || 4999)}</div>
                <div className="text-xs text-[var(--ink-muted)]">ماده قانونی جستجوپذیر</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-[var(--ink)]">{toFa(decisions.length || 35)}</div>
                <div className="text-xs text-[var(--ink-muted)]">رأی وحدت رویه دیوان</div>
              </div>
            </div>
          </div>

          <div className="relative min-h-[260px] lg:col-span-5">
            <img
              src={heroImage}
              alt="تالار پژوهش و کتابخانه گروه حقوقی برائت"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent lg:bg-gradient-to-l" />
          </div>
        </section>
      )}

      {/* Active Breadcrumb on Law / Article SEO Routes */}
      {(selectedLawName || decodedArtNum) && (
        <nav aria-label="مسیر صفحه" className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
          <Link to="/laws" className="hover:text-teal-700 dark:hover:text-teal-400">بانک قوانین</Link>
          <span>/</span>
          {decodedArtNum ? (
            <>
              <Link to={`/laws/${encodeURIComponent(selectedLawName)}`} className="hover:text-teal-700 dark:hover:text-teal-400">
                {selectedLawName}
              </Link>
              <span>/</span>
              <span className="font-bold text-[var(--ink)]">ماده {toFa(decodedArtNum)}</span>
            </>
          ) : (
            <span className="font-bold text-[var(--ink)]">{selectedLawName}</span>
          )}
        </nav>
      )}

      {/* Search & Filter Control Workspace */}
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-7">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (decodedArtNum && selectedLawName) navigate(`/laws/${encodeURIComponent(selectedLawName)}`);
              }}
              placeholder="جستجو در مواد قانونی (مثلاً: ماده ۲۱۹ یا خیار غبن یا چک)..."
              className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] py-3 pr-10 pl-4 text-sm text-[var(--ink)] outline-none focus:border-teal-600"
            />
          </div>

          <div className="md:col-span-5">
            <select
              value={selectedLawName}
              onChange={(e) => handleLawChange(e.target.value)}
              aria-label="انتخاب قانون"
              className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-3 text-sm font-medium text-[var(--ink)] outline-none focus:border-teal-600"
            >
              <option value="">همه قوانین پایگاه ({toFa(laws.length)} قانون)</option>
              {laws.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name} ({toFa(lawCounts.get(l.name) || 0)} ماده)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
            {(
              [
                ['all', 'همه بخش‌ها'],
                ['text', 'فقط متن ماده'],
                ['topic', 'موضوع / باب و فصل'],
                ['marks', 'مواد نشان‌شده'],
              ] as [SearchMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setMode(k);
                  setExactPath('');
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  mode === k
                    ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)] tabular-nums">
            {dbLoading ? (
              <span>در حال بارگذاری پایگاه قوانین...</span>
            ) : (
              <span>
                {filtered.length > 0
                  ? `${toFa(filtered.length)} نتیجه`
                  : `${toFa(articles.length)} ماده آماده جستجو`}
              </span>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAllAdmin((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                  showAllAdmin
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-[var(--hairline-strong)] bg-[var(--surface)] text-[var(--ink)]'
                }`}
              >
                {showAllAdmin ? 'بستن کل مواد' : 'نمایش کل مواد (مدیر)'}
              </button>
            )}
          </div>
        </div>

        {exactPath && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-teal-600/25 bg-[var(--accent-soft)] px-3.5 py-2 text-xs font-bold text-teal-800 dark:text-teal-300">
            <span>موضوع انتخابی: {exactPath.split('\u0001').filter(Boolean).join(' › ')}</span>
            <button type="button" onClick={() => setExactPath('')} className="hover:underline">
              حذف فیلتر
            </button>
          </div>
        )}
      </section>

      {/* Error State */}
      {dbError && !articles.length && (
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/5 p-6 text-center">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">بارگذاری پایگاه قوانین با خطا مواجه شد.</p>
          <button
            type="button"
            onClick={() => reloadLawDb(true)}
            className="mt-3 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white"
          >
            تلاش مجدد
          </button>
        </div>
      )}

      {/* Topics List when topic mode is selected without query */}
      {topics.length > 0 && (
        <section className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setExactPath(t.key)}
              className="flex items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-right text-xs font-medium text-[var(--ink)] hover:border-teal-600/40 transition-colors"
            >
              <span className="truncate pl-2">{t.label}</span>
              <span className="shrink-0 font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                {toFa(t.count)} ماده
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Search Results */}
      {filtered.length > 0 && (
        <section className="mt-6 space-y-4">
          {filtered.slice(0, isAdmin ? limit : Math.min(limit, 120)).map((a) => {
            const markKey = `${a.law}|${a.num_text}`;
            const marked = marks[markKey];
            const refs = scanArticleRefs(a.text);
            const idxInDb = articles.indexOf(a);
            const prevArt = idxInDb > 0 && articles[idxInDb - 1].law === a.law ? articles[idxInDb - 1] : null;
            const nextArt = idxInDb >= 0 && idxInDb < articles.length - 1 && articles[idxInDb + 1].law === a.law ? articles[idxInDb + 1] : null;

            return (
              <article
                key={a.id}
                className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 sm:p-6 transition-colors hover:border-[var(--hairline-strong)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      to={`/laws/${encodeURIComponent(a.law)}`}
                      className="font-extrabold text-teal-800 hover:underline dark:text-teal-300"
                    >
                      {a.law}
                    </Link>
                    <span className="text-[var(--ink-muted)]" aria-hidden="true">·</span>
                    <Link
                      to={`/laws/${encodeURIComponent(a.law)}/${encodeURIComponent(a.num)}`}
                      className="font-bold text-[var(--ink)] hover:text-teal-700 dark:hover:text-teal-300 tabular-nums"
                    >
                      {toFa(a.num_text)}
                    </Link>
                    {a.path.length > 0 && (
                      <>
                        <span className="text-[var(--ink-muted)]" aria-hidden="true">·</span>
                        <span className="text-[var(--ink-muted)]">{a.path.join(' › ')}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleArticleMark(a.law, a.num_text)}
                      title={marked ? 'حذف از نشان‌شده‌ها' : 'نشان‌گذاری ماده'}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                        marked
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                          : 'border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <Star className={`h-4 w-4 ${marked ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(a)}
                      title="کپی متن ماده"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareArticle(a)}
                      title="کپی لینک سئو ماده"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingArt(a);
                            setEditText(a.text);
                            setEditPath(a.path.join(' › '));
                          }}
                          title="ویرایش ماده"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-[var(--ink-muted)] hover:text-teal-700"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSingleArticle(a)}
                          title="حذف ماده"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 whitespace-pre-line text-[15px] leading-8 text-[var(--ink-prose)]">
                  {renderHighlighted(toFa(formatLegalText(a.text)))}
                </div>

                {a.sections.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-[var(--hairline)] pt-3 text-sm text-[var(--ink-muted)]">
                    {a.sections.map((s, si) => (
                      <div key={si}>
                        <strong className="text-[var(--ink)]">{s.h}: </strong>
                        <span className="whitespace-pre-line">{toFa(formatLegalText(s.v))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cross-referenced articles inline lookup */}
                {(() => {
                  const selfNumNorm = toEn(String(a.num || '')).replace(/^0+/, '').trim();
                  const seenRefKeys = new Set<string>();
                  const resolvedRefs: Array<{ key: string; targetLaw: string; num: string; targetObj: Article | null }> = [];
                  for (const r of refs) {
                    const targetLaw = resolveHintLaw(r.targetLawHint, lawNames, a.law, r.beforeLawHint);
                    for (const n of r.nums) {
                      const normN = toEn(n).replace(/\s+/g, ' ').trim();
                      if (targetLaw === a.law && normN === selfNumNorm) continue;
                      const dedupKey = `${targetLaw}::${normN}`;
                      if (seenRefKeys.has(dedupKey)) continue;
                      seenRefKeys.add(dedupKey);
                      const lawMap = articleIndex.get(targetLaw);
                      const targetObj = lawMap?.get(normN) || null;
                      resolvedRefs.push({
                        key: `${a.id}_${targetLaw}_${normN}`,
                        targetLaw,
                        num: normN,
                        targetObj,
                      });
                    }
                  }
                  if (resolvedRefs.length === 0) return null;
                  const availableRefs = resolvedRefs.filter((x) => x.targetObj !== null);
                  const allOpened =
                    availableRefs.length > 0 && availableRefs.every((x) => Boolean(expandedRef[x.key]));

                  return (
                    <>
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-3">
                        <span className="text-xs font-bold text-[var(--ink-muted)]">ارجاعات:</span>
                        {resolvedRefs.map(({ key, targetLaw, num, targetObj }) => {
                          const isOpen = Boolean(expandedRef[key]);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                if (!targetObj) {
                                  showToast(`ماده ${toFa(num)} در «${targetLaw}» در بانک قوانین فعلی ثبت نشده است.`);
                                  return;
                                }
                                setExpandedRef((prev) => ({
                                  ...prev,
                                  [key]: prev[key] ? null : targetObj,
                                }));
                              }}
                              title={
                                targetObj
                                  ? `مشاهده ماده ${toFa(num)} از ${targetLaw}`
                                  : `ماده ${toFa(num)} در ${targetLaw} یافت نشد`
                              }
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors tabular-nums ${
                                isOpen
                                  ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-slate-950'
                                  : targetObj
                                    ? 'border-[var(--hairline-strong)] bg-[var(--surface-muted)] text-teal-800 hover:border-teal-600 dark:text-teal-300'
                                    : 'border-dashed border-[var(--hairline)] bg-transparent text-[var(--ink-muted)] opacity-75'
                              }`}
                            >
                              ماده {toFa(num)} {targetLaw !== a.law ? `(${targetLaw})` : ''}
                            </button>
                          );
                        })}
                        {availableRefs.length >= 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedRef((prev) => {
                                const next = { ...prev };
                                availableRefs.forEach((item) => {
                                  next[item.key] = allOpened ? null : item.targetObj;
                                });
                                return next;
                              });
                            }}
                            className="mr-auto text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-400"
                          >
                            {allOpened ? 'بستن همه' : `باز کردن همه (${toFa(availableRefs.length)})`}
                          </button>
                        )}
                      </div>

                      {/* Expanded Inline Reference Boxes */}
                      {resolvedRefs
                        .filter((item) => Boolean(expandedRef[item.key]))
                        .map((item) => {
                          const refArt = expandedRef[item.key]!;
                          return (
                            <div
                              key={`box_${item.key}`}
                              className="mt-3 rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-4 text-sm"
                            >
                              <div className="flex items-center justify-between text-xs font-bold text-teal-800 dark:text-teal-300">
                                <span>
                                  {refArt.law} · {toFa(refArt.num_text)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedRef((p) => ({ ...p, [item.key]: null }))}
                                  className="hover:underline"
                                >
                                  بستن
                                </button>
                              </div>
                              <p className="mt-2 whitespace-pre-line leading-7 text-[var(--ink-prose)]">
                                {toFa(formatLegalText(refArt.text))}
                              </p>
                            </div>
                          );
                        })}
                    </>
                  );
                })()}

                {/* Personal Bookmark Note */}
                {user && marked && (
                  <div className="mt-4 border-t border-[var(--hairline)] pt-3">
                    <label className="block text-xs font-bold text-amber-700 dark:text-amber-300 mb-1.5">
                      یادداشت شخصی شما روی این ماده
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={marked.note}
                      onBlur={(e) => toggleArticleMark(a.law, a.num_text, e.target.value)}
                      placeholder="نکته آزمونی، رأی مرتبط یا برداشت شخصی خود را بنویسید..."
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>
                )}

                {/* Neighboring Article Quick Navigation */}
                {(prevArt || nextArt) && (
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-xs">
                    {prevArt ? (
                      <Link
                        to={`/laws/${encodeURIComponent(prevArt.law)}/${encodeURIComponent(prevArt.num)}`}
                        className="inline-flex items-center gap-1 font-semibold text-[var(--ink-muted)] hover:text-teal-700 dark:hover:text-teal-300"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span>قبلی: {toFa(prevArt.num_text)}</span>
                      </Link>
                    ) : (
                      <span />
                    )}
                    {nextArt && (
                      <Link
                        to={`/laws/${encodeURIComponent(nextArt.law)}/${encodeURIComponent(nextArt.num)}`}
                        className="inline-flex items-center gap-1 font-semibold text-[var(--ink-muted)] hover:text-teal-700 dark:hover:text-teal-300"
                      >
                        <span>بعدی: {toFa(nextArt.num_text)}</span>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {filtered.length > limit && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + 80)}
                className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-6 py-2.5 text-xs font-bold text-[var(--ink)] hover:border-teal-600"
              >
                نمایش {toFa(Math.min(80, filtered.length - limit))} مورد بعدی ({toFa(filtered.length - limit)} مانده)
              </button>
            </div>
          )}
        </section>
      )}

      {/* SEO Law Catalog & Latest Journal Teaser on Home Landing */}
      {isLandingState && (
        <>
          <section className="mt-12">
            <div className="flex items-end justify-between border-b border-[var(--hairline)] pb-3">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--ink)]">فهرست کامل قوانین پایگاه</h2>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  برای مشاهده متن کامل و ساختار باب‌ها و فصول، هر قانون را انتخاب کنید
                </p>
              </div>
              <Link to="/decisions" className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-400">
                آرای وحدت رویه ←
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {laws.map((l) => (
                <Link
                  key={l.id}
                  to={`/laws/${encodeURIComponent(l.name)}`}
                  className="group flex items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3.5 transition-colors hover:border-teal-600/50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BookOpen className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                    <span className="truncate text-sm font-bold text-[var(--ink)] group-hover:text-teal-700 dark:group-hover:text-teal-300">
                      {l.name}
                    </span>
                  </div>
                  <span className="mr-2 shrink-0 text-xs text-[var(--ink-muted)] tabular-nums">
                    {toFa(lawCounts.get(l.name) || 0)} ماده
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {journalArticles.length > 0 && (
            <section className="mt-14">
              <div className="flex items-end justify-between border-b border-[var(--hairline)] pb-3">
                <div>
                  <h2 className="text-xl font-extrabold text-[var(--ink)]">تازه‌های نشریه تخصصی برائت</h2>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">پژوهش‌ها و تحلیل‌های کاربردی رویه قضایی</p>
                </div>
                <Link to="/articles" className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline dark:text-teal-400">
                  <span>ورود به مجله</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
                {journalArticles.slice(0, 3).map((art) => (
                  <Link
                    key={art.id}
                    to={`/articles/${encodeURIComponent(art.id)}`}
                    className="group flex flex-col justify-between rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 transition-colors hover:border-teal-600/40"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                        <span className="font-bold text-teal-700 dark:text-teal-400">{art.category || 'حقوقی'}</span>
                        <span>·</span>
                        <span>{toFa(art.date)}</span>
                      </div>
                      <h3 className="mt-2.5 text-base font-extrabold leading-7 text-[var(--ink)] group-hover:text-teal-700 dark:group-hover:text-teal-300">
                        {art.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-xs leading-6 text-[var(--ink-muted)]">
                        {art.abstract}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[var(--hairline)] text-xs font-semibold text-[var(--ink-muted)]">
                      {art.author || 'هیئت تحریریه برائت'}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Admin Edit Modal */}
      {editingArt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setEditingArt(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-[var(--ink)]">
              ویرایش {toFa(editingArt.num_text)} — {editingArt.law}
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">متن ماده</label>
                <textarea
                  rows={7}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink)] outline-none focus:border-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">مسیر ساختاری (با › جدا شود)</label>
                <input
                  value={editPath}
                  onChange={(e) => setEditPath(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-teal-600"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingArt(null)}
                className="rounded-xl border border-[var(--hairline)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={saveArticleEdit}
                className="rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800"
              >
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
