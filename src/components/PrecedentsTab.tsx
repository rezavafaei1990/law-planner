import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Scale, 
  Bookmark, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Filter
} from 'lucide-react';
import type { Decision } from '../types';
import { toPersianDigits, toEnglishDigits, copyCitation } from '../utils/legalFormatter';

interface PrecedentsTabProps {
  decisions: Decision[];
  bookmarks: string[];
  onToggleBookmark: (item: { id: string; type: 'article' | 'decision'; title: string; text: string; num?: string }) => void;
}

export const PrecedentsTab: React.FC<PrecedentsTabProps> = ({
  decisions,
  bookmarks,
  onToggleBookmark
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'حقوقی' | 'کیفری' | 'ثبتی'>('all');
  const [expandedNum, setExpandedNum] = useState<string | null>(null);
  const [copiedNum, setCopiedNum] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qEng = toEnglishDigits(q);

    return decisions.filter((d) => {
      if (category !== 'all' && d.category && d.category !== category) {
        return false;
      }
      if (!q) return true;

      const numEng = toEnglishDigits(d.number);
      const yearEng = toEnglishDigits(d.year);

      return (
        numEng.includes(qEng) ||
        yearEng.includes(qEng) ||
        d.subject.toLowerCase().includes(q) ||
        d.text.toLowerCase().includes(q)
      );
    });
  }, [decisions, query, category]);

  const handleCopy = async (dec: Decision) => {
    const success = await copyCitation('هیأت عمومی دیوان عالی کشور', `رأی وحدت رویه شماره ${dec.number}`, dec.text);
    if (success) {
      setCopiedNum(dec.number);
      setTimeout(() => setCopiedNum(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute inset-y-0 right-3.5 my-auto text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در شماره رأی، سال صدور یا موضوع رأی وحدت رویه..."
              className="w-full pl-4 pr-11 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            {(['all', 'حقوقی', 'کیفری', 'ثبتی'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  category === cat
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {cat === 'all' ? 'همه حوزه‌ها' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Counter */}
      <div className="text-xs text-slate-500 flex items-center justify-between px-1">
        <span>
          نمایش{' '}
          <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
            {toPersianDigits(filtered.length)}
          </strong>{' '}
          رأی وحدت رویه
        </span>
        <span className="text-[11px] text-teal-600 dark:text-teal-400">
          آرای هیأت عمومی دیوان عالی کشور در حکم قانون و لازم‌الاتباع است
        </span>
      </div>

      {/* Decisions List */}
      <div className="space-y-3">
        {filtered.map((dec) => {
          const isExpanded = expandedNum === dec.number;
          const isBookmarked = bookmarks.includes(`dec-${dec.number}`);
          const isCopied = copiedNum === dec.number;

          return (
            <div
              key={dec.number}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-teal-700 text-white font-mono">
                      رأی شماره {toPersianDigits(dec.number)}
                    </span>
                    {dec.year && (
                      <span className="text-xs text-slate-500 font-mono">
                        سال {toPersianDigits(dec.year)}
                      </span>
                    )}
                    {dec.date && (
                      <span className="text-xs text-slate-400 font-mono">
                        مورخ {toPersianDigits(dec.date)}
                      </span>
                    )}
                    {dec.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {dec.category}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                    {dec.subject}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(dec)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="کپی رأی وحدت رویه"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() =>
                      onToggleBookmark({
                        id: `dec-${dec.number}`,
                        type: 'decision',
                        title: `رأی وحدت رویه شماره ${dec.number}`,
                        num: dec.number,
                        text: dec.text
                      })
                    }
                    className={`p-1.5 rounded-lg ${
                      isBookmarked
                        ? 'text-amber-500 hover:text-amber-600'
                        : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title={isBookmarked ? 'حذف از نشان‌شده‌ها' : 'نشان کردن'}
                  >
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Collapsed or Expanded Text */}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div
                  className={`text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap ${
                    !isExpanded ? 'line-clamp-2' : ''
                  }`}
                >
                  {dec.text}
                </div>

                <button
                  onClick={() => setExpandedNum(isExpanded ? null : dec.number)}
                  className="mt-2 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                >
                  <span>{isExpanded ? 'خلاصه کردن رأی' : 'مشاهده متن کامل و استدلال دیوان'}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
