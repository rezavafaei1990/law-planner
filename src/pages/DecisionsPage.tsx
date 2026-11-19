import React, { useMemo, useState, useEffect } from 'react';
import { Search, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useBaraat } from '../context/BaraatContext';
import { toFa, normFa } from '../utils/legal';
import { updateDocumentSeo } from '../utils/seo';

export const DecisionsPage: React.FC = () => {
  const { decisions, dbLoading, showToast } = useBaraat();
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    updateDocumentSeo({
      title: 'آرای وحدت رویه دیوان عالی کشور | گروه حقوقی برائت',
      description: 'بانک قابل جستجوی آرای وحدت رویه هیئت عمومی دیوان عالی کشور با شماره، سال، موضوع و متن کامل رأی.',
      canonicalPath: '/decisions',
    });
  }, []);

  const filtered = useMemo(() => {
    const clean = normFa(q);
    if (!clean) return decisions;
    const words = clean.split(' ').filter(Boolean);
    return decisions.filter((d) => {
      const corpus = normFa(`${d.number} ${d.year} ${d.date || ''} ${d.subject || ''} ${d.text}`);
      return words.every((w) => corpus.includes(w));
    });
  }, [decisions, q]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      <div className="border-b border-[var(--hairline)] pb-6">
        <p className="text-xs font-bold text-teal-700 dark:text-teal-400">هیئت عمومی دیوان عالی کشور</p>
        <h1 className="mt-2 text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">آرای وحدت رویه قضایی</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          جستجو بر اساس شماره رأی، سال صدور، موضوع یا عبارت موجود در استدلال دیوان
        </p>

        <div className="relative mt-5 max-w-xl">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="شماره رأی (مثلاً ۸۳۰)، سال یا موضوع..."
            className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] py-3 pr-10 pl-4 text-sm text-[var(--ink)] outline-none focus:border-teal-600"
          />
        </div>
      </div>

      {dbLoading ? (
        <div className="mt-8 text-sm text-[var(--ink-muted)]">در حال بارگذاری آرا...</div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--ink-muted)]">
          رأیی مطابق جستجوی شما یافت نشد.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filtered.map((d) => {
            const key = `${d.number}-${d.year}`;
            const isOpen = openKey === key;
            return (
              <article
                key={key}
                className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] tabular-nums">
                      <span className="font-bold text-teal-700 dark:text-teal-400">
                        رأی شماره {toFa(d.number)}
                      </span>
                      <span>·</span>
                      <span>سال {toFa(d.year)}</span>
                      {d.date && (
                        <>
                          <span>·</span>
                          <span>{toFa(d.date)}</span>
                        </>
                      )}
                    </div>
                    {d.subject && (
                      <h2 className="mt-1.5 text-base font-extrabold text-[var(--ink)]">{d.subject}</h2>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`رأی وحدت رویه شماره ${d.number} سال ${d.year}\n${d.subject || ''}\n\n${d.text}`);
                        showToast('متن رأی کپی شد.');
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      title="کپی رأی"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenKey(isOpen ? null : key)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--ink)]"
                    >
                      <span>{isOpen ? 'بستن متن کامل' : 'مطالعه رأی'}</span>
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <p className={`mt-4 whitespace-pre-line text-sm leading-8 text-[var(--ink-prose)] ${isOpen ? '' : 'line-clamp-3'}`}>
                  {toFa(d.text)}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
