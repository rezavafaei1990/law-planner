import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  ChevronLeft, 
  Award, 
  Scale, 
  Compass
} from 'lucide-react';
import { DEADLINE_TYPES, computeLegalDeadline, LegalDeadlineType } from '../utils/deadlines';
import { toPersianDigits } from '../utils/legalFormatter';

export const DeadlinesTab: React.FC = () => {
  const [selectedType, setSelectedType] = useState<LegalDeadlineType>(DEADLINE_TYPES[0]);
  const [notificationDateStr, setNotificationDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isAbroad, setIsAbroad] = useState<boolean>(false);

  // Compute deadline
  const calculation = useMemo(() => {
    const d = new Date(notificationDateStr);
    const days = isAbroad ? selectedType.daysAbroad : selectedType.daysIran;
    return computeLegalDeadline(d, days, isAbroad);
  }, [selectedType, notificationDateStr, isAbroad]);

  // Days left from today
  const daysLeft = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(calculation.targetDate);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [calculation]);

  // Exam Countdown (Target: upcoming Bar Exam)
  const examDaysLeft = useMemo(() => {
    // Autumn / Winter upcoming session
    const target = new Date('2026-12-20');
    const today = new Date();
    const diff = target.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner: Exam Countdown */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-900 rounded-2xl p-6 text-white border border-teal-800/40 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold">شمارنده معکوس آزمون وکالت و قضاوت</h2>
            </div>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              برنامه‌ریزی دقیق، مرور مستمر لایتنر و تسلط بر نص قوانین رمز قبولی در آزمون‌های حقوقی سراسری است.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 shrink-0">
            <div className="text-center px-2">
              <div className="text-3xl font-extrabold font-mono text-amber-300 tabular-nums">
                {toPersianDigits(examDaysLeft)}
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">روز باقیمانده</div>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div className="text-right text-xs space-y-0.5">
              <div className="font-semibold text-white">هدف: آزمون جامع پیش‌رو</div>
              <div className="text-slate-300 text-[11px]">مرورهای طلایی روزانه</div>
            </div>
          </div>
        </div>
      </div>

      {/* Legal Deadlines Calculator */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            محاسبه‌گر هوشمند مواعد قانونی و قضایی
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            محاسبه دقیق مهلت‌های قانونی طبق ماده ۴۴۳ الی ۴۴۵ قانون آیین دادرسی مدنی (با احتساب مواعد ابلاغ و روزهای تعطیل)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Deadline Type Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              نوع موعد قانونی / اقدام قضایی:
            </label>
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {DEADLINE_TYPES.map((type) => {
                const isSelected = selectedType.id === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type)}
                    className={`w-full text-right p-3 rounded-xl border text-xs transition-all ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-900 dark:text-teal-200 font-semibold shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold">{type.title}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{type.lawRef}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 2: Inputs */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                تاریخ ابلاغ در سامانه ثنا:
              </label>
              <input
                type="date"
                value={notificationDateStr}
                onChange={(e) => setNotificationDateStr(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[11px] text-slate-400 block">
                تاریخی که ابلاغیه الکترونیکی به حساب شما در سامانه ابلاغ وارد شده است.
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                محل اقامت شخص ابلاغ‌شونده:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsAbroad(false)}
                  className={`p-2.5 rounded-xl border font-medium text-center transition-colors ${
                    !isAbroad
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  مقیم داخل کشور ({toPersianDigits(selectedType.daysIran)} روز)
                </button>
                <button
                  type="button"
                  onClick={() => setIsAbroad(true)}
                  className={`p-2.5 rounded-xl border font-medium text-center transition-colors ${
                    isAbroad
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  مقیم خارج از کشور ({toPersianDigits(selectedType.daysAbroad)} روز)
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                مستند قانونی: {selectedType.lawRef}
              </div>
              <p className="leading-relaxed">{selectedType.description}</p>
            </div>
          </div>

          {/* Column 3: Output Result Box */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 space-y-4">
            <div>
              <span className="text-xs text-teal-800 dark:text-teal-300 font-semibold block">
                نتیجه محاسبه موعد اقدام:
              </span>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
                  {toPersianDigits(calculation.targetDate.toISOString().split('T')[0])}
                </div>
                <div className="text-xs text-slate-500 mt-1">تا پایان وقت اداری این روز</div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-white dark:bg-slate-900 border border-teal-100 dark:border-teal-900/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">وضعیت زمان:</span>
                  <span
                    className={`font-bold font-mono ${
                      daysLeft > 0
                        ? 'text-teal-600 dark:text-teal-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {daysLeft > 0
                      ? `${toPersianDigits(daysLeft)} روز باقیمانده`
                      : 'مهلت منقضی شده'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">مدت قانونی:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-mono">
                    {toPersianDigits(calculation.effectiveDays)} روز
                  </span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-teal-800/80 dark:text-teal-300/80 leading-relaxed pt-2 border-t border-teal-200/60 dark:border-teal-900/60">
              {calculation.explanation}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
