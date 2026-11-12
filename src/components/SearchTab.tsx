import React, { useState, useMemo } from 'react';
import { 
  Search as SearchIcon, 
  X, 
  Bookmark, 
  Copy, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Scale, 
  Hash, 
  Layers
} from 'lucide-react';
import type { Law, Article, Decision } from '../types';
import { toPersianDigits, toEnglishDigits, formatLegalText, copyCitation } from '../utils/legalFormatter';

interface SearchTabProps {
  laws: Law[];
  articles: Article[];
  decisions: Decision[];
  bookmarks: string[];
  onToggleBookmark: (item: { id: string; type: 'article' | 'decision'; title: string; text: string; lawName?: string; num?: string; path?: string[] }) => void;
  initialQuery?: string;
  initialLawId?: number | null;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  laws,
  articles,
  decisions,
  bookmarks,
  onToggleBookmark,
  initialQuery = '',
  initialLawId = null
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedLawId, setSelectedLawId] = useState<number | 'all'>(initialLawId || 'all');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedDecisionKey, setExpandedDecisionKey] = useState<string | null>(null);

  // Quick preset laws
  const topLaws = useMemo(() => {
    return laws.slice(0, 7);
  }, [laws]);

  // Clean numbers for search
  const cleanSearchNum = useMemo(() => {
    const raw = query.trim();
    const match = raw.match(/(?:ماده\s*)?([۰-۹\d]+)/);
    return match ? toEnglishDigits(match[1]) : null;
  }, [query]);

  // Filter articles
  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qEng = toEnglishDigits(q);

    return articles.filter((art) => {
      // Law filter
      if (selectedLawId !== 'all' && art.law_id !== selectedLawId) {
        return false;
      }

      if (!q) return true;

      // Exact or partial article number match
      const artNum = toEnglishDigits(art.num);
      if (cleanSearchNum && artNum === cleanSearchNum) {
        return true;
      }

      // Check text or path
      const inText = art.text.toLowerCase().includes(q) || art.text.includes(qEng);
      const inPath = art.path.some((p) => p.toLowerCase().includes(q));
      const inNum = art.num_text?.toLowerCase().includes(q) || artNum.includes(qEng);

      return inText || inPath || inNum;
    });
  }, [articles, query, selectedLawId, cleanSearchNum]);

  // Relevant decisions
  const filteredDecisions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qEng = toEnglishDigits(q);

    return decisions.filter((d) => {
      const numEng = toEnglishDigits(d.number);
      return (
        numEng === qEng ||
        d.subject.toLowerCase().includes(q) ||
        d.text.toLowerCase().includes(q)
      );
    }).slice(0, 5);
  }, [decisions, query]);

  const handleCopy = async (art: Article) => {
    const lawName = laws.find((l) => l.id === art.law_id)?.name || 'قانون';
    const success = await copyCitation(lawName, art.num_text || `ماده ${art.num}`, art.text);
    if (success) {
      setCopiedId(art.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleJumpArticle = (lawId: number, targetOrd: number) => {
    const target = articles.find((a) => a.law_id === lawId && a.ord === targetOrd);
    if (target) {
      setQuery(`ماده ${target.num}`);
      setSelectedLawId(target.law_id);
    }
  };

  const highlightKeyword = (text: string, term: string) => {
    if (!term.trim()) return text;
    const cleanTerm = term.trim();
    const parts = text.split(new RegExp(`(${cleanTerm})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === cleanTerm.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 dark:bg-amber-900/60 text-slate-900 dark:text-amber-100 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input Box */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <SearchIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی شماره ماده (مثلاً ۲۱۸) یا کلمات کلیدی (مثل وجه التزام، صوری، اهلیت)..."
                className="w-full pl-10 pr-11 py-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 dark:focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Law Select Dropdown */}
            <div className="w-full sm:w-64">
              <select
                value={selectedLawId}
                onChange={(e) => setSelectedLawId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full py-3 px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 outline-none text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">همه قوانین ({laws.length} قانون)</option>
                {laws.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.count ? `(${toPersianDigits(l.count)} ${l.unit || 'ماده'})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick preset chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0 ml-1">
              <Layers className="w-3.5 h-3.5" />
              قوانین پرکاربرد:
            </span>
            <button
              onClick={() => setSelectedLawId('all')}
              className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedLawId === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              همه
            </button>
            {topLaws.map((law) => {
              const active = selectedLawId === law.id;
              return (
                <button
                  key={law.id}
                  onClick={() => setSelectedLawId(law.id)}
                  className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-teal-600 text-white font-medium shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {law.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Meta Info */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
        <div>
          <span>یافته‌ها: </span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono tabular-nums">
            {toPersianDigits(filteredArticles.length)}
          </span>
          <span> ماده</span>
          {filteredDecisions.length > 0 && (
            <span>
              {' '}
              و{' '}
              <span className="font-semibold text-teal-600 dark:text-teal-400 font-mono tabular-nums">
                {toPersianDigits(filteredDecisions.length)}
              </span>{' '}
              رأی وحدت رویه مرتبط
            </span>
          )}
        </div>
        {selectedLawId !== 'all' && (
          <button
            onClick={() => setSelectedLawId('all')}
            className="text-teal-600 dark:text-teal-400 hover:underline"
          >
            حذف فیلتر قانون
          </button>
        )}
      </div>

      {/* Precedent Highlights (if query matches decisions) */}
      {filteredDecisions.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
            <Scale className="w-4 h-4" />
            آرای وحدت رویه مرتبط با عبارت جستجو
          </div>
          <div className="grid gap-3">
            {filteredDecisions.map((dec) => {
              const isExpanded = expandedDecisionKey === dec.number;
              return (
                <div
                  key={dec.number}
                  className="p-4 rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/50 dark:bg-teal-950/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-teal-700 text-white">
                          رأی وحدت رویه شماره {toPersianDigits(dec.number)}
                        </span>
                        {dec.year && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            سال {toPersianDigits(dec.year)}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mt-1.5">
                        {dec.subject}
                      </h4>
                    </div>
                    <button
                      onClick={() => setExpandedDecisionKey(isExpanded ? null : dec.number)}
                      className="px-2.5 py-1 text-xs text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {isExpanded ? 'بستن متن' : 'متن کامل رأی'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-teal-200/60 dark:border-teal-900/40 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {dec.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Articles Stream */}
      <div className="space-y-4">
        {filteredArticles.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <Scale className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">ماده‌ای یافت نشد</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              می‌توانید کلمه را کوتاه‌تر بنویسید، شماره ماده را تغییر دهید یا فیلتر قانون را به «همه قوانین» بازگردانید.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
              <span className="text-slate-400">جستجوهای نمونه:</span>
              {['ماده ۲۱۸', 'ماده ۱۰', 'ماده ۱۹۰', 'وجه التزام', 'تجدیدنظر'].map((sample) => (
                <button
                  key={sample}
                  onClick={() => setQuery(sample)}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-950/60 hover:text-teal-600 transition-colors"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : (
          filteredArticles.map((art) => {
            const lawName = laws.find((l) => l.id === art.law_id)?.name || 'قانون';
            const isBookmarked = bookmarks.includes(`art-${art.id}`);
            const isCopied = copiedId === art.id;

            return (
              <article
                key={art.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-150"
              >
                {/* Article Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/50">
                      {lawName}
                    </span>
                    <span className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1 font-mono">
                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                      {toPersianDigits(art.num_text || `ماده ${art.num}`)}
                    </span>
                  </div>

                  {/* Top article actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(art)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="کپی متن ماده و مشخصات"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() =>
                        onToggleBookmark({
                          id: `art-${art.id}`,
                          type: 'article',
                          title: `${art.num_text || `ماده ${art.num}`} — ${lawName}`,
                          lawName,
                          num: art.num,
                          text: art.text,
                          path: art.path
                        })
                      }
                      className={`p-1.5 rounded-lg transition-colors ${
                        isBookmarked
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title={isBookmarked ? 'حذف از نشان‌شده‌ها' : 'نشان کردن این ماده'}
                    >
                      <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Article Path Breadcrumbs */}
                {art.path && art.path.length > 0 && (
                  <div className="text-xs text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1 flex-wrap">
                    {art.path.map((segment, idx) => (
                      <React.Fragment key={idx}>
                        <span>{segment}</span>
                        {idx < art.path.length - 1 && <span className="opacity-40">›</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Article Body */}
                <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-normal whitespace-pre-wrap select-text">
                  {highlightKeyword(formatLegalText(art.text), query)}
                </div>

                {/* Article Navigation Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                  <button
                    onClick={() => handleJumpArticle(art.law_id, art.ord - 1)}
                    disabled={art.ord <= 1}
                    className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>ماده قبل</span>
                  </button>
                  <button
                    onClick={() => handleJumpArticle(art.law_id, art.ord + 1)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span>ماده بعد</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
