import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  BookOpen, 
  Sparkles, 
  Filter, 
  ExternalLink, 
  Smile, 
  Meh, 
  Frown, 
  Plus, 
  FileEdit,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { StudyDay } from '../types';
import { CHECKS_LABELS, BUILT_IN_CURRICULA } from '../data/defaultPlans';
import { toPersianDigits } from '../utils/legalFormatter';

interface PlannerTabProps {
  days: StudyDay[];
  onUpdateDay: (updatedDay: StudyDay) => void;
  onAddDay: () => void;
  onViewArticlesInSearch: (lawName: string, artRange: string) => void;
  onOpenAiImporter: () => void;
  activeCurriculumKey: string;
  onSelectCurriculum: (key: string) => void;
}

export const PlannerTab: React.FC<PlannerTabProps> = ({
  days,
  onUpdateDay,
  onAddDay,
  onViewArticlesInSearch,
  onOpenAiImporter,
  activeCurriculumKey,
  onSelectCurriculum
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'done'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [openDayIds, setOpenDayIds] = useState<Record<string, boolean>>({
    [days[0]?.id || '']: true
  });
  const [editingNoteDayId, setEditingNoteDayId] = useState<string | null>(null);

  // Groups list for filter
  const groups = useMemo(() => {
    const set = new Set<string>();
    days.forEach((d) => {
      if (d.group) set.add(d.group);
    });
    return Array.from(set);
  }, [days]);

  // Overall KPI statistics
  const stats = useMemo(() => {
    const totalDays = days.length;
    let completedDays = 0;
    let totalChecks = 0;
    let checkedCount = 0;

    days.forEach((day) => {
      let dayAllDone = true;
      day.blocks.forEach((blk) => {
        const done = blk.checks.filter(Boolean).length;
        checkedCount += done;
        totalChecks += blk.checks.length;
        if (done < blk.checks.length) {
          dayAllDone = false;
        }
      });
      if (dayAllDone && day.blocks.length > 0) {
        completedDays++;
      }
    });

    const percent = totalChecks > 0 ? Math.round((checkedCount / totalChecks) * 100) : 0;
    return {
      totalDays,
      completedDays,
      percent,
      checkedCount,
      totalChecks
    };
  }, [days]);

  // Filter days
  const filteredDays = useMemo(() => {
    return days.filter((d) => {
      // Group filter
      if (selectedGroup !== 'all' && d.group !== selectedGroup) {
        return false;
      }

      // Check completion
      const isDayDone = d.blocks.every((b) => b.checks.every(Boolean));
      if (filterMode === 'done' && !isDayDone) return false;
      if (filterMode === 'pending' && isDayDone) return false;

      return true;
    });
  }, [days, selectedGroup, filterMode]);

  const toggleDayOpen = (id: string) => {
    setOpenDayIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCheckChange = (day: StudyDay, blockIndex: number, checkIndex: number) => {
    const updated = { ...day };
    const blk = { ...updated.blocks[blockIndex] };
    const checks = [...blk.checks];
    checks[checkIndex] = !checks[checkIndex];
    blk.checks = checks;
    updated.blocks[blockIndex] = blk;
    onUpdateDay(updated);
  };

  const handleMoodChange = (day: StudyDay, blockIndex: number, mood: 'good' | 'mid' | 'bad') => {
    const updated = { ...day };
    const blk = { ...updated.blocks[blockIndex] };
    blk.mood = blk.mood === mood ? null : mood;
    updated.blocks[blockIndex] = blk;
    onUpdateDay(updated);
  };

  const handleNoteChange = (day: StudyDay, notes: string) => {
    onUpdateDay({ ...day, notes });
  };

  return (
    <div className="space-y-6">
      {/* Top Curriculum Switcher Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0 ml-1">
              انتخاب درس:
            </span>
            {Object.entries(BUILT_IN_CURRICULA).map(([key, curr]) => {
              const active = activeCurriculumKey === key;
              return (
                <button
                  key={key}
                  onClick={() => onSelectCurriculum(key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-teal-600 text-white shadow-xs font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {curr.title.split('—')[0].trim()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAiImporter}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>ایمپورت هوشمند هوش مصنوعی</span>
            </button>
            <button
              onClick={onAddDay}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن روز</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">پیشرفت کل برنامه</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 font-mono tabular-nums">
              {toPersianDigits(stats.percent)}٪
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">روزهای سپری‌شده</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {toPersianDigits(stats.completedDays)}
            </span>
            <span className="text-xs text-slate-400">/ {toPersianDigits(stats.totalDays)} روز</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {toPersianDigits(stats.totalDays - stats.completedDays)} روز تا پایان دوره
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">مراحل مرور لایتنر</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
              {toPersianDigits(stats.checkedCount)}
            </span>
            <span className="text-xs text-slate-400">/ {toPersianDigits(stats.totalChecks)} مرحله</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">نص قانون، تست و تکرارهای هفت‌گانه</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">دوره فعال</span>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-2">
            {BUILT_IN_CURRICULA[activeCurriculumKey]?.title.split('—')[0] || 'برنامه اختصاصی'}
          </div>
          <p className="text-[11px] text-teal-600 dark:text-teal-400 mt-2">تطابق کامل با مواد امتحانی</p>
        </div>
      </div>

      {/* Filter and Group Selection Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        {/* Status segmented control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filterMode === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-medium'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            همه روزها ({toPersianDigits(days.length)})
          </button>
          <button
            onClick={() => setFilterMode('pending')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filterMode === 'pending'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-medium'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            مطالعه‌نشده
          </button>
          <button
            onClick={() => setFilterMode('done')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filterMode === 'done'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-medium'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            تکمیل‌شده
          </button>
        </div>

        {/* Stage/Week filter dropdown */}
        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="py-1.5 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">همه مراحل و هفته‌ها</option>
              {groups.map((grp) => (
                <option key={grp} value={grp}>
                  {grp}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Days List */}
      <div className="space-y-3">
        {filteredDays.map((day) => {
          const isOpen = !!openDayIds[day.id];
          const isDone = day.blocks.every((b) => b.checks.every(Boolean));
          const completedChecksCount = day.blocks.reduce(
            (acc, b) => acc + b.checks.filter(Boolean).length,
            0
          );
          const totalChecksCount = day.blocks.reduce((acc, b) => acc + b.checks.length, 0);

          return (
            <div
              key={day.id}
              className={`bg-white dark:bg-slate-900 rounded-xl border transition-all ${
                isDone
                  ? 'border-emerald-200/80 dark:border-emerald-900/60'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Day Header Accordion */}
              <div
                onClick={() => toggleDayOpen(day.id)}
                className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 select-none rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm font-mono shrink-0 ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {toPersianDigits(day.number)}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        روز {toPersianDigits(day.number)}
                        {day.blocks[0]?.title ? ` — ${day.blocks[0].title}` : ''}
                      </span>
                      {day.blocks[0]?.artRange && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                          مواد {toPersianDigits(day.blocks[0].artRange)}
                        </span>
                      )}
                    </div>
                    {day.group && (
                      <p className="text-xs text-slate-400 mt-0.5">{day.group}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-400 hidden sm:inline font-mono tabular-nums">
                    {toPersianDigits(completedChecksCount)} / {toPersianDigits(totalChecksCount)}
                  </span>
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                  )}
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Day Expanded Content */}
              {isOpen && (
                <div className="px-4 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-4">
                  {day.blocks.map((blk, bIdx) => {
                    return (
                      <div
                        key={blk.id || bIdx}
                        className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {blk.subjectName || 'درس حقوقی'}
                            </span>
                            {blk.lawName && (
                              <span className="text-xs text-slate-500">({blk.lawName})</span>
                            )}
                          </div>

                          {/* Jump to Search Button */}
                          {blk.lawName && (
                            <button
                              onClick={() =>
                                onViewArticlesInSearch(blk.lawName || '', blk.artRange || '')
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800/80 hover:bg-teal-50 dark:hover:bg-teal-950/60 transition-colors w-fit"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>مشاهده متن مواد در پایگاه قوانین</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {blk.desc && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {blk.desc}
                          </p>
                        )}

                        {/* 7 Leitner check buttons */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1">
                          {CHECKS_LABELS.map((label, cIdx) => {
                            const checked = !!blk.checks[cIdx];
                            return (
                              <button
                                key={cIdx}
                                onClick={() => handleCheckChange(day, bIdx, cIdx)}
                                className={`flex items-center justify-between p-2 rounded-lg text-[11px] text-right border transition-all ${
                                  checked
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-medium'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                              >
                                <span className="truncate">{label}</span>
                                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mr-1" />}
                              </button>
                            );
                          })}
                        </div>

                        {/* Mastery Mood Selector */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
                          <span className="text-slate-400 text-[11px]">ارزیابی تسلط بر این مبحث:</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleMoodChange(day, bIdx, 'good')}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                blk.mood === 'good'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-medium'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title="تسلط عالی"
                            >
                              <Smile className="w-3.5 h-3.5" />
                              <span>عالی</span>
                            </button>
                            <button
                              onClick={() => handleMoodChange(day, bIdx, 'mid')}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                blk.mood === 'mid'
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-medium'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title="متوسط"
                            >
                              <Meh className="w-3.5 h-3.5" />
                              <span>متوسط</span>
                            </button>
                            <button
                              onClick={() => handleMoodChange(day, bIdx, 'bad')}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                blk.mood === 'bad'
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 font-medium'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title="نیاز به تمرین و مرور مجدد"
                            >
                              <Frown className="w-3.5 h-3.5" />
                              <span>نیاز به تمرین</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Personal Day Study Notes */}
                  <div className="pt-1">
                    {editingNoteDayId === day.id ? (
                      <div className="space-y-2">
                        <textarea
                          defaultValue={day.notes || ''}
                          onBlur={(e) => {
                            handleNoteChange(day, e.target.value);
                            setEditingNoteDayId(null);
                          }}
                          placeholder="یادداشت‌های مهم این روز، نکات تستی، آرای مرتبط یا نقاط ضعف..."
                          rows={3}
                          autoFocus
                          className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:border-teal-500"
                        />
                        <button
                          onClick={() => setEditingNoteDayId(null)}
                          className="px-2.5 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700"
                        >
                          ثبت یادداشت
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="truncate">
                          {day.notes ? `یادداشت: ${day.notes}` : 'بدون یادداشت برای این روز'}
                        </span>
                        <button
                          onClick={() => setEditingNoteDayId(day.id)}
                          className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline shrink-0"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>{day.notes ? 'ویرایش یادداشت' : 'افزودن یادداشت'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
