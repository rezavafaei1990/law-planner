import React, { useState } from 'react';
import { Sparkles, Copy, Check, X, FileText, ArrowLeft } from 'lucide-react';
import type { StudyDay } from '../types';
import { toEnglishDigits, toPersianDigits } from '../utils/legalFormatter';

interface AiImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportPlan: (days: StudyDay[], subjectName: string) => void;
}

export const AiImportModal: React.FC<AiImportModalProps> = ({
  isOpen,
  onClose,
  onImportPlan
}) => {
  const [subjectName, setSubjectName] = useState('حقوق مدنی');
  const [lawName, setLawName] = useState('قانون مدنی');
  const [planText, setPlanText] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  if (!isOpen) return null;

  const aiPromptText = `من داوطلب آزمون وکالت هستم و می‌خواهم برای درس «${subjectName}» یک برنامه‌ی مطالعه‌ی روزانه بنویسی.
قالب خروجی دقیقاً باید به این شکل باشد (بدون مقدمه یا علامت‌های اضافه):

روز ۱ ـ عنوان مبحث اول
- مواد ۱ تا ۱۰
- خلاصه نکات و مطالعه شرح
- ۲۰ تست مفهومی

روز ۲ ـ عنوان مبحث دوم
- مواد ۱۱ تا ۲۸
- ۲۰ تست

لطفاً روزها را از روز ۱ شروع کن و برای هر روز حتماً یک خط با قالب «مواد فلان تا فلان» بگذار تا سیستم هوشمند بتواند به مواد قانونی لینک دهد.`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(aiPromptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleParseAndImport = () => {
    if (!planText.trim()) return;

    const lines = planText.replace(/\r/g, '').split('\n');
    const days: StudyDay[] = [];
    const dayRegex = /^\s*روز\s*([0-9۰-۹\d]+)\s*[ـ\-–—:.]+\s*(.*?)\s*$/;
    const artRegex = /(?:مواد|ماده)\s*([0-9۰-۹\d]+)(?:\s*(?:تا|الی|-)\s*([0-9۰-۹\d]+))?/;

    let currentDay: {
      num: number;
      title: string;
      artRange?: string;
      desc?: string;
    } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const dayMatch = trimmed.match(dayRegex);
      if (dayMatch) {
        if (currentDay) {
          days.push({
            id: `ai-day-${currentDay.num}-${Date.now()}`,
            number: currentDay.num,
            group: `برنامه هوشمند ${subjectName}`,
            blocks: [
              {
                id: `ai-blk-${currentDay.num}`,
                subjectId: 'custom',
                subjectName,
                lawName,
                artRange: currentDay.artRange || '',
                title: currentDay.title,
                desc: currentDay.desc,
                checks: [false, false, false, false, false, false, false],
                mood: null
              }
            ]
          });
        }
        currentDay = {
          num: Number(toEnglishDigits(dayMatch[1])) || days.length + 1,
          title: dayMatch[2] || `مبحث روز ${dayMatch[1]}`,
          desc: ''
        };
        continue;
      }

      if (currentDay) {
        const artMatch = trimmed.match(artRegex);
        if (artMatch && !currentDay.artRange) {
          const from = toEnglishDigits(artMatch[1]);
          const to = artMatch[2] ? toEnglishDigits(artMatch[2]) : from;
          currentDay.artRange = from === to ? from : `${from}-${to}`;
        }
        currentDay.desc = (currentDay.desc ? currentDay.desc + ' · ' : '') + trimmed.replace(/^[-*•]\s*/, '');
      }
    }

    if (currentDay) {
      days.push({
        id: `ai-day-${currentDay.num}-${Date.now()}`,
        number: currentDay.num,
        group: `برنامه هوشمند ${subjectName}`,
        blocks: [
          {
            id: `ai-blk-${currentDay.num}`,
            subjectId: 'custom',
            subjectName,
            lawName,
            artRange: currentDay.artRange || '',
            title: currentDay.title,
            desc: currentDay.desc,
            checks: [false, false, false, false, false, false, false],
            mood: null
          }
        ]
      });
    }

    if (days.length > 0) {
      onImportPlan(days, subjectName);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              ایمپورت هوشمند برنامه مطالعه با هوش مصنوعی
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">نام درس:</label>
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">قانون مرجع در پایگاه:</label>
              <input
                type="text"
                value={lawName}
                onChange={(e) => setLawName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* AI Prompt Box */}
          <div className="p-3.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-teal-900 dark:text-teal-200">
                ۱. دستور آماده برای کپی در هوش مصنوعی (Gemini / ChatGPT):
              </span>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors"
              >
                {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPrompt ? 'کپی شد' : 'کپی پرامپت'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-mono whitespace-pre-wrap bg-white/70 dark:bg-slate-900/70 p-2.5 rounded-lg border border-teal-100 dark:border-teal-900/30">
              {aiPromptText}
            </p>
          </div>

          {/* Paste result text */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-medium">
              ۲. متن برنامه‌ی دریافت شده را در اینجا بچسبانید:
            </label>
            <textarea
              rows={6}
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
              placeholder={`روز ۱ ـ کلیات و تعریف عقد
- مواد ۱ تا ۱۰
- ۲۰ تست مفهومی

روز ۲ ـ اقسام عقود
- مواد ۱۱ تا ۳۰...`}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-teal-500 font-mono text-[11px] leading-relaxed"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
          >
            انصراف
          </button>
          <button
            onClick={handleParseAndImport}
            disabled={!planText.trim()}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 shadow-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>ایمپورت و تبدیل به برنامه مطالعه</span>
          </button>
        </div>
      </div>
    </div>
  );
};
