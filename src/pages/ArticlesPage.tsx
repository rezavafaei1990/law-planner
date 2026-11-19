import React, { useMemo, useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Share2, Plus, Edit3, Trash2, BookOpen } from 'lucide-react';
import defaultJournalCover from '../assets/images/journal_editorial_cover_1794776844436.jpg';
import { useBaraat } from '../context/BaraatContext';
import type { JournalArticle } from '../types';
import { toFa, compressImageFile } from '../utils/legal';
import { updateDocumentSeo } from '../utils/seo';

const CATEGORIES = [
  'حقوق مدنی',
  'حقوق تجارت',
  'آیین دادرسی مدنی',
  'حقوق جزا و جرم‌شناسی',
  'آیین دادرسی کیفری',
  'رویه قضایی و دیوان عالی',
  'حقوق ثبت و املاک',
  'کاربردی و حرفه‌ای وکالت',
];

function readMinutes(a: JournalArticle): number {
  const words = `${a.abstract || ''} ${a.content || ''}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 170));
}

export const ArticlesPage: React.FC = () => {
  const { articleId } = useParams<{ articleId?: string }>();
  const navigate = useNavigate();
  const { journalArticles, setJournalArticles, isAdmin, showToast } = useBaraat();

  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [fontSize, setFontSize] = useState(17);
  const [scrollPct, setScrollPct] = useState(0);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<JournalArticle | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCat, setFormCat] = useState(CATEGORIES[0]);
  const [formAuthor, setFormAuthor] = useState('هیئت تحریریه برائت');
  const [formAbstract, setFormAbstract] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCover, setFormCover] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formFeatured, setFormFeatured] = useState(false);

  const activeArticle = useMemo(
    () => (articleId ? journalArticles.find((a) => a.id === decodeURIComponent(articleId)) || null : null),
    [articleId, journalArticles]
  );

  useEffect(() => {
    if (activeArticle) {
      updateDocumentSeo({
        title: `${activeArticle.title} | نشریه حقوقی برائت`,
        description: activeArticle.abstract || activeArticle.title,
        canonicalPath: `/articles/${encodeURIComponent(activeArticle.id)}`,
      });
    } else {
      updateDocumentSeo({
        title: 'نشریه تخصصی و مقالات حقوقی | گروه حقوقی برائت',
        description: 'مجموعه یادداشت‌های تحلیلی، مقالات پژوهشی و نقد آرای قضایی گروه حقوقی برائت.',
        canonicalPath: '/articles',
      });
    }
  }, [activeArticle]);

  useEffect(() => {
    if (!activeArticle) {
      setScrollPct(0);
      return;
    }
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeArticle]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return journalArticles.filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false;
      if (!q) return true;
      return `${a.title} ${a.author} ${a.abstract} ${(a.tags || []).join(' ')}`.toLowerCase().includes(q);
    });
  }, [journalArticles, cat, search]);

  const leadArticle = useMemo(() => {
    if (!filtered.length || search.trim() || cat !== 'all') return null;
    return filtered.find((a) => a.featured) || filtered[0];
  }, [filtered, search, cat]);

  const restArticles = useMemo(() => {
    if (!leadArticle) return filtered;
    return filtered.filter((a) => a.id !== leadArticle.id);
  }, [filtered, leadArticle]);

  const openEditor = (art?: JournalArticle) => {
    setEditing(art || null);
    setFormTitle(art?.title || '');
    setFormCat(art?.category || CATEGORIES[0]);
    setFormAuthor(art?.author || 'هیئت تحریریه برائت');
    setFormAbstract(art?.abstract || '');
    setFormContent(art?.content || '');
    setFormCover(art?.coverImage || '');
    setFormCaption(art?.coverCaption || '');
    setFormTags((art?.tags || []).join('، '));
    setFormFeatured(Boolean(art?.featured));
    setComposerOpen(true);
  };

  const handleUploadCover = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 1100, 0.8);
      setFormCover(dataUrl);
      showToast('تصویر کاور با کیفیت بهینه بارگذاری شد.');
    } catch {
      showToast('پردازش تصویر ناموفق بود.');
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !formTitle.trim() || !formContent.trim()) return;
    const item: JournalArticle = {
      id: editing?.id || `art_${Date.now()}`,
      title: formTitle.trim(),
      category: formCat,
      author: formAuthor.trim() || 'هیئت تحریریه برائت',
      date: editing?.date || new Date().toLocaleDateString('fa-IR'),
      abstract: formAbstract.trim(),
      content: formContent.trim(),
      coverImage: formCover.trim(),
      coverCaption: formCaption.trim(),
      featured: formFeatured,
      tags: formTags.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
    };
    const next = journalArticles
      .map((a) => (item.featured ? { ...a, featured: false } : a))
      .filter((a) => a.id !== item.id);
    await setJournalArticles([item, ...next]);
    setComposerOpen(false);
  };

  const handleDeleteArticle = async (id: string) => {
    if (!isAdmin) return;
    await setJournalArticles(journalArticles.filter((a) => a.id !== id));
    if (activeArticle?.id === id) navigate('/articles');
  };

  if (activeArticle) {
    const related = journalArticles.filter((a) => a.id !== activeArticle.id).slice(0, 3);
    return (
      <>
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent">
          <div
            className="h-full bg-teal-600 transition-transform duration-150 origin-right"
            style={{ transform: `scaleX(${scrollPct / 100})` }}
          />
        </div>

        <article className="mx-auto max-w-[880px] px-4 py-10 sm:px-6 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/articles"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowRight className="h-4 w-4" />
              <span>بازگشت به فهرست نشریه</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.max(14, s - 1))}
                className="rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-xs font-bold text-[var(--ink-muted)]"
              >
                آ-
              </button>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.min(22, s + 1))}
                className="rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-xs font-bold text-[var(--ink-muted)]"
              >
                آ+
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  showToast('لینک مقاله کپی شد.');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-3 py-1 text-xs font-bold text-[var(--ink)]"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>اشتراک‌گذاری</span>
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditor(activeArticle)}
                    className="rounded-lg border border-[var(--hairline)] px-3 py-1 text-xs font-bold text-[var(--ink)]"
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteArticle(activeArticle.id)}
                    className="rounded-lg border border-red-500/30 px-3 py-1 text-xs font-bold text-red-600"
                  >
                    حذف
                  </button>
                </>
              )}
            </div>
          </div>

          <header className="mt-8 border-b border-[var(--hairline)] pb-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)] tabular-nums">
              <span className="font-bold text-teal-700 dark:text-teal-400">{activeArticle.category || 'تحلیلی'}</span>
              <span>·</span>
              <span>{toFa(activeArticle.date)}</span>
              <span>·</span>
              <span>زمان مطالعه {toFa(readMinutes(activeArticle))} دقیقه</span>
            </div>

            <h1 className="font-editorial mt-3 text-3xl font-bold leading-snug text-[var(--ink)] sm:text-4xl">
              {activeArticle.title}
            </h1>

            {activeArticle.abstract && (
              <p className="mt-4 text-base leading-8 text-[var(--ink-muted)]">{activeArticle.abstract}</p>
            )}

            <div className="mt-4 text-xs font-bold text-[var(--ink)]">
              نویسنده: {activeArticle.author || 'هیئت تحریریه برائت'}
            </div>
          </header>

          <figure className="mt-8 overflow-hidden rounded-2xl border border-[var(--hairline)]">
            <img
              src={activeArticle.coverImage || defaultJournalCover}
              alt={activeArticle.title}
              referrerPolicy="no-referrer"
              className="aspect-video w-full object-cover"
            />
            {activeArticle.coverCaption && (
              <figcaption className="border-t border-[var(--hairline)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs text-[var(--ink-muted)]">
                {activeArticle.coverCaption}
              </figcaption>
            )}
          </figure>

          <div
            className="editorial-prose mx-auto mt-10 max-w-[68ch] space-y-6 text-[var(--ink-prose)]"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.95 }}
          >
            {activeArticle.content
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
          </div>

          {related.length > 0 && (
            <section className="mt-16 border-t border-[var(--hairline)] pt-8">
              <h2 className="text-lg font-extrabold text-[var(--ink)]">سایر مقالات نشریه</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    to={`/articles/${encodeURIComponent(r.id)}`}
                    className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 hover:border-teal-600/40"
                  >
                    <div className="text-xs font-bold text-teal-700 dark:text-teal-400">{r.category}</div>
                    <h3 className="mt-1.5 text-sm font-bold leading-6 text-[var(--ink)]">{r.title}</h3>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-6 border-b border-[var(--hairline)] pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold text-teal-700 dark:text-teal-400">فصلنامه تخصصی پژوهش و دکترین حقوقی</p>
          <h1 className="font-editorial mt-2 text-3xl font-bold text-[var(--ink)] sm:text-4xl">
            مقالات، تحلیل‌ها و نقد آرای قضایی
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
            مجموعه یادداشت‌های تحلیلی و پژوهش‌های کاربردی گروه حقوقی برائت در حوزه حقوق خصوصی، کیفری و رویه دیوان عالی کشور.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در مقالات..."
            className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-teal-600 sm:w-64"
          />
          {isAdmin && (
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>نگارش مقاله جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Category Filter */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCat('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
            cat === 'all'
              ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
              : 'bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
          }`}
        >
          همه مقالات
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              cat === c
                ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                : 'bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Lead Featured Story */}
      {leadArticle && (
        <section className="mt-8 overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="relative min-h-[260px] lg:col-span-6 overflow-hidden">
            <img
              src={leadArticle.coverImage || defaultJournalCover}
              alt={leadArticle.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
            />
          </div>
          <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] tabular-nums">
                <span className="font-bold text-teal-700 dark:text-teal-400">سرمقاله منتخب</span>
                <span>·</span>
                <span>{leadArticle.category}</span>
                <span>·</span>
                <span>{toFa(readMinutes(leadArticle))} دقیقه</span>
              </div>
              <h2 className="font-editorial mt-3 text-2xl font-bold leading-snug text-[var(--ink)] sm:text-3xl">
                <Link to={`/articles/${encodeURIComponent(leadArticle.id)}`} className="hover:text-teal-700 dark:hover:text-teal-300">
                  {leadArticle.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--ink-muted)]">{leadArticle.abstract}</p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-[var(--hairline)] pt-4">
              <span className="text-xs font-semibold text-[var(--ink-muted)]">
                {leadArticle.author} · {toFa(leadArticle.date)}
              </span>
              <Link
                to={`/articles/${encodeURIComponent(leadArticle.id)}`}
                className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-400"
              >
                مطالعه مقاله ←
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Articles Catalog Grid */}
      {restArticles.length === 0 && !leadArticle ? (
        <div className="mt-10 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-[var(--ink-muted)]" />
          <p className="mt-3 text-sm font-bold text-[var(--ink)]">هنوز مقاله‌ای در این دسته‌بندی ثبت نشده است.</p>
        </div>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {restArticles.map((art) => (
            <article
              key={art.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] transition-colors hover:border-[var(--hairline-strong)]"
            >
              <Link to={`/articles/${encodeURIComponent(art.id)}`} className="aspect-[16/10] overflow-hidden bg-[var(--surface-muted)]">
                <img
                  src={art.coverImage || defaultJournalCover}
                  alt={art.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </Link>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] tabular-nums">
                    <span className="font-bold text-teal-700 dark:text-teal-400">{art.category}</span>
                    <span>·</span>
                    <span>{toFa(readMinutes(art))} دقیقه</span>
                  </div>
                  <h3 className="mt-2 text-base font-extrabold leading-7 text-[var(--ink)] group-hover:text-teal-700 dark:group-hover:text-teal-300">
                    <Link to={`/articles/${encodeURIComponent(art.id)}`}>{art.title}</Link>
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-6 text-[var(--ink-muted)]">{art.abstract}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-xs text-[var(--ink-muted)]">
                  <span>{art.author}</span>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditor(art)} title="ویرایش" className="hover:text-teal-700">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDeleteArticle(art.id)} title="حذف" className="hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Admin Article Composer Modal */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setComposerOpen(false)}
        >
          <form
            onSubmit={handleSaveArticle}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-2xl"
          >
            <h2 className="text-lg font-extrabold text-[var(--ink)]">
              {editing ? 'ویرایش مقاله' : 'نگارش مقاله جدید در نشریه'}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">عنوان مقاله</label>
                <input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">دپارتمان / موضوع</label>
                <select
                  value={formCat}
                  onChange={(e) => setFormCat(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">نویسنده</label>
                <input
                  value={formAuthor}
                  onChange={(e) => setFormAuthor(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">تصویر کاور (آپلود یا لینک)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleUploadCover(e.target.files?.[0])}
                    className="text-xs text-[var(--ink-muted)]"
                  />
                  <input
                    value={formCover}
                    onChange={(e) => setFormCover(e.target.value)}
                    placeholder="یا لینک تصویر https://..."
                    dir="ltr"
                    className="flex-1 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)]"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">چکیده مقاله</label>
                <textarea
                  rows={2}
                  value={formAbstract}
                  onChange={(e) => setFormAbstract(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink)]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">متن کامل مقاله</label>
                <textarea
                  required
                  rows={8}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">زیرنویس تصویر</label>
                <input
                  value={formCaption}
                  onChange={(e) => setFormCaption(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">کلیدواژه‌ها (با ویرگول)</label>
                <input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={formFeatured}
                  onChange={(e) => setFormFeatured(e.target.checked)}
                  className="h-4 w-4 accent-teal-700"
                />
                <span>انتخاب به عنوان سرمقاله ویژه صفحه اول مجله</span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-xl border border-[var(--hairline)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800"
              >
                انتشار و ذخیره
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
