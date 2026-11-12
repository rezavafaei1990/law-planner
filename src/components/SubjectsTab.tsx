import React, { useState } from 'react';
import { BookOpen, Plus, Search, ExternalLink, Layers, Check } from 'lucide-react';
import type { Subject } from '../types';
import { toPersianDigits } from '../utils/legalFormatter';

interface SubjectsTabProps {
  subjects: Subject[];
  onAddSubject: (subject: Subject) => void;
  onSelectLawForSearch: (lawName: string) => void;
}

export const SubjectsTab: React.FC<SubjectsTabProps> = ({
  subjects,
  onAddSubject,
  onSelectLawForSearch
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newLawName, setNewLawName] = useState('');
  const [newCount, setNewCount] = useState('');

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;

    const newSub: Subject = {
      id: `sub-${Date.now()}`,
      name: newSubName.trim(),
      laws: newLawName.trim()
        ? [
            {
              name: newLawName.trim(),
              count: Number(newCount) || 100,
              unit: 'ماده'
            }
          ]
        : []
    };

    onAddSubject(newSub);
    setNewSubName('');
    setNewLawName('');
    setNewCount('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            فهرست دروس و منابع آزمونی
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            منابع و قوانین مرجع آزمون وکالت، قضاوت و تحصیلات تکمیلی حقوق
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors shrink-0 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن درس یا منبع جدید</span>
        </button>
      </div>

      {/* Grid of Subjects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map((sub) => (
          <div
            key={sub.id}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-xs">
                  {sub.name.charAt(0)}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{sub.name}</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {toPersianDigits(sub.laws.length)} قانون / منبع
              </span>
            </div>

            <div className="space-y-1.5">
              {sub.laws.map((law, lIdx) => (
                <div
                  key={lIdx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{law.name}</span>
                    {law.count ? (
                      <span className="text-[11px] text-slate-400 font-mono">
                        ({toPersianDigits(law.count)} {law.unit || 'ماده'})
                      </span>
                    ) : null}
                  </div>

                  <button
                    onClick={() => onSelectLawForSearch(law.name)}
                    className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline px-2 py-1 rounded"
                    title="جستجو در این قانون"
                  >
                    <span>مشاهده مواد</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add Subject Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              افزودن درس یا منبع جدید به برنامه
            </h3>
            <form onSubmit={handleCreateSubject} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
                  نام درس:
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: حقوق ثبت، حقوق کار، حقوق بین‌الملل..."
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
                  قانون یا منبع اولیه:
                </label>
                <input
                  type="text"
                  placeholder="مثلاً: قانون ثبت اسناد و املاک"
                  value={newLawName}
                  onChange={(e) => setNewLawName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">
                  تعداد تقریبی مواد / سرفصل‌ها:
                </label>
                <input
                  type="number"
                  placeholder="مثلاً: ۱۴۴"
                  value={newCount}
                  onChange={(e) => setNewCount(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 shadow-xs"
                >
                  ذخیره درس
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
