import React, { useState } from 'react';
import { Database, Plus, RefreshCw, Upload, Download, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Law, Article } from '../types';
import { toPersianDigits } from '../utils/legalFormatter';

interface AdminTabProps {
  laws: Law[];
  articles: Article[];
  onAddArticle: (art: Article) => void;
  onRefreshData: () => Promise<void>;
  isSyncing: boolean;
}

export const AdminTab: React.FC<AdminTabProps> = ({
  laws,
  articles,
  onAddArticle,
  onRefreshData,
  isSyncing
}) => {
  const [selectedLawId, setSelectedLawId] = useState<number>(laws[0]?.id || 1);
  const [articleNum, setArticleNum] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articlePath, setArticlePath] = useState('');
  const [articleText, setArticleText] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSaveArticle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleText.trim() || !articleNum.trim()) return;

    const pathArray = articlePath
      ? articlePath.split(/[›>/،,]/).map((s) => s.trim()).filter(Boolean)
      : ['سایر مقررات'];

    const newArt: Article = {
      id: Date.now(),
      law_id: selectedLawId,
      ord: Number(articleNum) || 9999,
      num: articleNum.trim(),
      num_text: articleTitle.trim() || `ماده ${articleNum.trim()}`,
      text: articleText.trim(),
      path: pathArray
    };

    onAddArticle(newArt);
    setArticleNum('');
    setArticleTitle('');
    setArticlePath('');
    setArticleText('');
    setSuccessMsg('ماده قانونی با موفقیت ذخیره شد.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleExportJSON = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      laws,
      articles
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `law-database-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* System Status Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                مدیریت پایگاه داده و همگام‌سازی ابری
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              مخزن متصل به سرور Supabase با کش هوشمند آفلاین محلی (IndexedDB)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefreshData()}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'در حال همگام‌سازی...' : 'بروزرسانی از پایگاه'}</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>پشتیبان‌گیری JSON</span>
            </button>
          </div>
        </div>

        {/* Database Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">قوانین ثبت‌شده:</span>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 mt-1">
              {toPersianDigits(laws.length)} قانون
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">مواد قانونی موجود:</span>
            <div className="text-lg font-bold font-mono text-teal-600 dark:text-teal-400 mt-1">
              {toPersianDigits(articles.length)} ماده
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200/60 dark:border-slate-800 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-400">سرور و پروکسی:</span>
            <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1 truncate">
              xfmdpeeuzhuvqwoalfea
            </div>
          </div>
        </div>
      </div>

      {/* Add New Article Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-teal-600" />
          افزودن ماده قانونی جدید
        </h3>

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveArticle} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
                انتخاب قانون:
              </label>
              <select
                value={selectedLawId}
                onChange={(e) => setSelectedLawId(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500"
              >
                {laws.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
                شماره ماده:
              </label>
              <input
                type="text"
                required
                placeholder="مثلاً: 218 یا 5 مکرر"
                value={articleNum}
                onChange={(e) => setArticleNum(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
                عنوان ماده (اختیاری):
              </label>
              <input
                type="text"
                placeholder="مثلاً: ماده ۲۱۸ مکرر"
                value={articleTitle}
                onChange={(e) => setArticleTitle(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
              مسیر سلسله‌مراتب قانون (با علامت › یا ویرگول جدا کنید):
            </label>
            <input
              type="text"
              placeholder="مثلاً: کتاب دوم › باب اول › فصل سوم › مبحث دوم"
              value={articlePath}
              onChange={(e) => setArticlePath(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
              متن کامل ماده قانونی و تبصره‌ها:
            </label>
            <textarea
              required
              rows={5}
              placeholder="متن ماده را در اینجا وارد یا جای‌گذاری کنید..."
              value={articleText}
              onChange={(e) => setArticleText(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500 leading-relaxed"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors shadow-xs"
            >
              افزودن و ذخیره ماده در پایگاه
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
