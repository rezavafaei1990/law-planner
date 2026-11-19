import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calculator, Calendar, Briefcase, Plus, Trash2, Download } from 'lucide-react';
import lawyerSuiteImg from '../assets/images/lawyer_desk_suite_1794776844251.jpg';
import { useBaraat } from '../context/BaraatContext';
import type { LegalCase, DeadlineItem } from '../types';
import { fetchUserCases, upsertMetaKey, META_KEYS } from '../services/supabase';
import {
  toFa,
  formatMoney,
  CPI_INDICES,
  JALALI_MONTHS,
  jalaaliToDate,
  dateToJalaali,
  formatJalaali,
} from '../utils/legal';
import { updateDocumentSeo } from '../utils/seo';

type LawyerTab = 'calculators' | 'deadlines' | 'cases';
type CalcKind = 'mehrieh' | 'inheritance' | 'diyah' | 'court' | 'attorney' | 'late' | 'custom';

export const LawyersHubPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { deadlines, customCalcs, user, isAdmin, openAuthModal, showToast } = useBaraat();

  const initialTab: LawyerTab = location.pathname.startsWith('/deadlines')
    ? 'deadlines'
    : location.pathname.startsWith('/cases')
      ? 'cases'
      : 'calculators';

  const [activeTab, setActiveTab] = useState<LawyerTab>(initialTab);
  const [calcKind, setCalcKind] = useState<CalcKind>('mehrieh');

  // Mehrieh state
  const [mAmount, setMAmount] = useState(50000000);
  const [mContractYear, setMContractYear] = useState(1390);
  const [mCalcYear, setMCalcYear] = useState(1404);

  // Inheritance state
  const [inhEstate, setInhEstate] = useState(10000000000);
  const [inhSpouse, setInhSpouse] = useState<'none' | 'wife' | 'husband'>('wife');
  const [inhSons, setInhSons] = useState(1);
  const [inhDaughters, setInhDaughters] = useState(1);
  const [inhFather, setInhFather] = useState(false);
  const [inhMother, setInhMother] = useState(false);

  // Diyah state
  const [diyahBase, setDiyahBase] = useState(16000000000); // ریال
  const [diyahPct, setDiyahPct] = useState(100);
  const [diyahHaram, setDiyahHaram] = useState(false);

  // Court fee state
  const [courtClaim, setCourtClaim] = useState(1000000000);
  const [courtStage, setCourtStage] = useState<'first' | 'appeal' | 'cassation'>('first');

  // Attorney fee state
  const [attClaim, setAttClaim] = useState(1000000000);
  const [attStage, setAttStage] = useState<'first' | 'appeal'>('first');

  // Late payment (Art 522)
  const [lateAmt, setLateAmt] = useState(500000000);
  const [lateFromY, setLateFromY] = useState(1399);
  const [lateToY, setLateToY] = useState(1404);

  // Custom calc
  const [customId, setCustomId] = useState(customCalcs[0]?.id || '');
  const [customAmt, setCustomAmt] = useState(1000000000);
  const [customDays, setCustomDays] = useState(30);

  // Deadlines Jalali calculator
  const todayJ = useMemo(() => dateToJalaali(new Date()), []);
  const [dlCat, setDlCat] = useState('all');
  const [dlJy, setDlJy] = useState(todayJ.jy);
  const [dlJm, setDlJm] = useState(todayJ.jm);
  const [dlJd, setDlJd] = useState(todayJ.jd);
  const [dlAbroad, setDlAbroad] = useState(false);
  const [selectedDl, setSelectedDl] = useState<DeadlineItem | null>(deadlines[0] || null);

  // Cases
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [caseTitle, setCaseTitle] = useState('');
  const [caseClient, setCaseClient] = useState('');
  const [caseCourt, setCaseCourt] = useState('');
  const [caseNo, setCaseNo] = useState('');
  const [caseNextDate, setCaseNextDate] = useState('');

  useEffect(() => {
    if (location.pathname.startsWith('/deadlines')) setActiveTab('deadlines');
    else if (location.pathname.startsWith('/cases')) setActiveTab('cases');
    else if (location.pathname.startsWith('/calculators')) setActiveTab('calculators');
  }, [location.pathname]);

  useEffect(() => {
    if (activeTab === 'deadlines') {
      updateDocumentSeo({
        title: 'مواعد قانونی و تقویم شمسی دعاوی | گروه حقوقی برائت',
        description: 'محاسبه دقیق تاریخ پایان مهلت واخواهی، تجدیدنظر، فرجام و اعاده دادرسی با افزودن به تقویم.',
        canonicalPath: '/deadlines',
      });
    } else if (activeTab === 'cases') {
      updateDocumentSeo({
        title: 'مدیریت پرونده‌های وکالت | گروه حقوقی برائت',
        description: 'ثبت، پیگیری وضعیت و مدیریت جلسات پرونده‌های وکالتی.',
        canonicalPath: '/cases',
      });
    } else {
      updateDocumentSeo({
        title: 'محاسبه‌گر آنلاین مهریه، دیه، ارث، هزینه دادرسی و خسارت تأخیر — برائت',
        description: 'مجموعه کامل محاسبه‌گرهای دقیق حقوقی برای وکلا و مراجعان.',
        canonicalPath: '/calculators',
      });
    }
  }, [activeTab]);

  useEffect(() => {
    fetchUserCases(user?.id).then(setCases);
  }, [user?.id]);

  // Calculations
  const mehriehUpdated = useMemo(() => {
    const i1 = CPI_INDICES[mContractYear] || 1;
    const i2 = CPI_INDICES[mCalcYear] || 1;
    return Math.round((mAmount * i2) / i1);
  }, [mAmount, mContractYear, mCalcYear]);

  const lateUpdated = useMemo(() => {
    const i1 = CPI_INDICES[lateFromY] || 1;
    const i2 = CPI_INDICES[lateToY] || 1;
    const total = Math.round((lateAmt * i2) / i1);
    return { total, diff: Math.max(0, total - lateAmt) };
  }, [lateAmt, lateFromY, lateToY]);

  const diyahResult = useMemo(() => {
    const base = Math.round((diyahBase * diyahPct) / 100);
    return diyahHaram ? Math.round(base * (4 / 3)) : base;
  }, [diyahBase, diyahPct, diyahHaram]);

  const courtFeeResult = useMemo(() => {
    const rate = courtStage === 'first' ? 0.035 : courtStage === 'appeal' ? 0.045 : 0.055;
    return Math.round(courtClaim * rate);
  }, [courtClaim, courtStage]);

  const attorneyResult = useMemo(() => {
    // Simplified tiered bar tariff (آیین‌نامه تعرفه حق‌الوکاله)
    const c = attClaim;
    let fee = 0;
    const t1 = Math.min(c, 500_000_000);
    fee += t1 * 0.08;
    if (c > 500_000_000) fee += Math.min(c - 500_000_000, 1_500_000_000) * 0.06;
    if (c > 2_000_000_000) fee += Math.min(c - 2_000_000_000, 8_000_000_000) * 0.04;
    if (c > 10_000_000_000) fee += (c - 10_000_000_000) * 0.03;
    const total = Math.round(attStage === 'appeal' ? fee * 0.7 : fee);
    return { fee: total, tax: Math.round(total * 0.05) };
  }, [attClaim, attStage]);

  const inheritanceRows = useMemo(() => {
    const hasChild = inhSons + inhDaughters > 0;
    let remaining = inhEstate;
    const rows: { heir: string; shareLabel: string; amount: number }[] = [];

    if (inhSpouse === 'wife') {
      const share = hasChild ? 1 / 8 : 1 / 4;
      const amt = inhEstate * share;
      remaining -= amt;
      rows.push({ heir: 'زوجه', shareLabel: hasChild ? '۱/۸ (با فرزند)' : '۱/۴ (بدون فرزند)', amount: amt });
    } else if (inhSpouse === 'husband') {
      const share = hasChild ? 1 / 4 : 1 / 2;
      const amt = inhEstate * share;
      remaining -= amt;
      rows.push({ heir: 'زوج', shareLabel: hasChild ? '۱/۴ (با فرزند)' : '۱/۲ (بدون فرزند)', amount: amt });
    }

    if (inhFather) {
      const amt = hasChild ? inhEstate / 6 : remaining * 0.5;
      remaining -= amt;
      rows.push({ heir: 'پدر', shareLabel: hasChild ? '۱/۶' : 'باقیمانده', amount: amt });
    }
    if (inhMother) {
      const amt = hasChild ? inhEstate / 6 : inhEstate / 3;
      remaining -= amt;
      rows.push({ heir: 'مادر', shareLabel: hasChild ? '۱/۶' : '۱/۳', amount: amt });
    }

    if (hasChild && remaining > 0) {
      const units = inhSons * 2 + inhDaughters;
      const unitAmt = remaining / units;
      if (inhSons > 0) {
        rows.push({
          heir: `فرزند پسر (${toFa(inhSons)} نفر)`,
          shareLabel: '۲ برابر دختر',
          amount: unitAmt * 2 * inhSons,
        });
      }
      if (inhDaughters > 0) {
        rows.push({
          heir: `فرزند دختر (${toFa(inhDaughters)} نفر)`,
          shareLabel: '۱ سهم',
          amount: unitAmt * inhDaughters,
        });
      }
    }
    return rows;
  }, [inhEstate, inhSpouse, inhSons, inhDaughters, inhFather, inhMother]);

  const activeDeadlineEndDate = useMemo(() => {
    if (!selectedDl) return null;
    const start = jalaaliToDate(dlJy, dlJm, dlJd);
    const days = dlAbroad ? selectedDl.daysAbroad : selectedDl.daysIran;
    // Standard civil procedure rule: notification day + deadline days + action day (days + 1)
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + days + 1);
    return { start, end, days };
  }, [selectedDl, dlJy, dlJm, dlJd, dlAbroad]);

  const downloadIcs = () => {
    if (!selectedDl || !activeDeadlineEndDate) return;
    const d = activeDeadlineEndDate.end;
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Baraat Legal//Deadlines//FA',
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${ymd}`,
      `SUMMARY:${selectedDl.title}`,
      `DESCRIPTION:${selectedDl.law}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDl.id}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!caseTitle.trim()) return;
    const nextCase: LegalCase = {
      id: `case_${Date.now()}`,
      title: caseTitle.trim(),
      client: caseClient.trim(),
      court: caseCourt.trim(),
      caseNumber: caseNo.trim(),
      status: 'جاری',
      nextDate: caseNextDate.trim(),
      updatedAt: new Date().toISOString(),
    };
    const next = [nextCase, ...cases];
    setCases(next);
    localStorage.setItem(`${META_KEYS.CASES}_${user.id}`, JSON.stringify(next));
    if (isAdmin) await upsertMetaKey(META_KEYS.CASES, next);
    setCaseTitle('');
    setCaseClient('');
    setCaseCourt('');
    setCaseNo('');
    setCaseNextDate('');
    showToast('پرونده جدید ثبت شد.');
  };

  const removeCase = async (id: string) => {
    const next = cases.filter((c) => c.id !== id);
    setCases(next);
    if (user) localStorage.setItem(`${META_KEYS.CASES}_${user.id}`, JSON.stringify(next));
    if (isAdmin) await upsertMetaKey(META_KEYS.CASES, next);
    showToast('پرونده حذف شد.');
  };

  const years = Object.keys(CPI_INDICES).map(Number).sort((a, b) => b - a);
  const selectedCustom = customCalcs.find((c) => c.id === customId) || customCalcs[0];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      {/* Editorial Lawyer Header */}
      <section className="grid grid-cols-1 items-stretch overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] lg:grid-cols-12">
        <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
          <div>
            <p className="text-xs font-bold text-teal-700 dark:text-teal-400">میزکار تخصصی وکلای دادگستری</p>
            <h1 className="mt-2 text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">
              محاسبه‌گرها، مواعد قانونی و مدیریت پرونده
            </h1>
            <p className="mt-3 text-sm leading-7 text-[var(--ink-muted)]">
              محاسبه دقیق خسارت تأخیر، مهریه، دیه، هزینه دادرسی و مهلت‌های قانونی آیین دادرسی با تبدیل تقویم شمسی به میلادی.
            </p>
          </div>

          <div className="mt-6 inline-flex flex-wrap gap-1 rounded-xl bg-[var(--surface-muted)] p-1 self-start">
            {(
              [
                ['calculators', 'محاسبه‌گرها', Calculator, '/calculators'],
                ['deadlines', 'مواعد قانونی', Calendar, '/deadlines'],
                ['cases', 'پرونده‌های من', Briefcase, '/cases'],
              ] as const
            ).map(([id, label, Icon, path]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveTab(id);
                  navigate(path);
                }}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                  activeTab === id
                    ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-h-[200px] lg:col-span-5">
          <img
            src={lawyerSuiteImg}
            alt="میزکار وکلای گروه حقوقی برائت"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>
      </section>

      {/* Tab 1: Calculators */}
      {activeTab === 'calculators' && (
        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-1.5 lg:col-span-4">
            {(
              [
                ['mehrieh', 'مهریه به نرخ روز (شاخص بانک مرکزی)'],
                ['court', 'هزینه دادرسی بدوی، تجدیدنظر و فرجام'],
                ['diyah', 'دیه کامل، اعضا و ماه‌های حرام'],
                ['late', 'خسارت تأخیر تأدیه (ماده ۵۲۲)'],
                ['attorney', 'تعرفه حق‌الوکاله و سهم تمبر مالیاتی'],
                ['inheritance', 'تقسیم قانونی ارث میان وراث'],
                ['custom', 'فرمول‌های سفارشی مدیر'],
              ] as [CalcKind, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCalcKind(k)}
                className={`w-full rounded-xl border px-4 py-3 text-right text-xs font-bold transition-colors ${
                  calcKind === k
                    ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950'
                    : 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink)] hover:border-teal-600/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 lg:col-span-8">
            {calcKind === 'mehrieh' && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">محاسبه مهریه به نرخ روز (تبصره ماده ۱۰۸۲ قانون مدنی)</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">مبلغ مندرج در عقدنامه (ریال)</label>
                    <input
                      type="number"
                      value={mAmount}
                      onChange={(e) => setMAmount(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">سال وقوع عقد</label>
                    <select
                      value={mContractYear}
                      onChange={(e) => setMContractYear(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      {years.map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">سال محاسبه</label>
                    <select
                      value={mCalcYear}
                      onChange={(e) => setMCalcYear(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      {years.map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-5 tabular-nums">
                  <div className="text-xs font-bold text-[var(--ink-muted)]">مبلغ به‌روزشده مهریه</div>
                  <div className="mt-1 text-2xl font-extrabold text-teal-800 dark:text-teal-300">
                    {formatMoney(mehriehUpdated)} ریال
                  </div>
                  <div className="mt-1 text-xs text-[var(--ink-muted)]">معادل {formatMoney(mehriehUpdated / 10)} تومان</div>
                </div>
              </div>
            )}

            {calcKind === 'court' && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">محاسبه هزینه دادرسی دعاوی مالی</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">بهای خواسته (ریال)</label>
                    <input
                      type="number"
                      value={courtClaim}
                      onChange={(e) => setCourtClaim(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">مرحله رسیدگی</label>
                    <select
                      value={courtStage}
                      onChange={(e) => setCourtStage(e.target.value as 'first' | 'appeal' | 'cassation')}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      <option value="first">مرحله بدوی (۳.۵٪)</option>
                      <option value="appeal">مرحله تجدیدنظر و واخواهی (۴.۵٪)</option>
                      <option value="cassation">فرجام‌خواهی و اعاده دادرسی (۵.۵٪)</option>
                    </select>
                  </div>
                </div>
                <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-5 tabular-nums">
                  <div className="text-xs font-bold text-[var(--ink-muted)]">مبلغ هزینه دادرسی</div>
                  <div className="mt-1 text-2xl font-extrabold text-teal-800 dark:text-teal-300">
                    {formatMoney(courtFeeResult)} ریال
                  </div>
                  <div className="mt-1 text-xs text-[var(--ink-muted)]">معادل {formatMoney(courtFeeResult / 10)} تومان</div>
                </div>
              </div>
            )}

            {calcKind === 'diyah' && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">محاسبه دیه نفس، اعضا و جراحات</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">نرخ دیه کامل سال (ریال)</label>
                    <input
                      type="number"
                      value={diyahBase}
                      onChange={(e) => setDiyahBase(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">درصد دیه (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step="0.5"
                      value={diyahPct}
                      onChange={(e) => setDiyahPct(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                  <input
                    type="checkbox"
                    checked={diyahHaram}
                    onChange={(e) => setDiyahHaram(e.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  <span>اعمال تغلیظ دیه نفس در ماه‌های حرام (+۱/۳)</span>
                </label>
                <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-5 tabular-nums">
                  <div className="text-xs font-bold text-[var(--ink-muted)]">مبلغ دیه محاسبه‌شده</div>
                  <div className="mt-1 text-2xl font-extrabold text-teal-800 dark:text-teal-300">
                    {formatMoney(diyahResult)} ریال
                  </div>
                  <div className="mt-1 text-xs text-[var(--ink-muted)]">معادل {formatMoney(diyahResult / 10)} تومان</div>
                </div>
              </div>
            )}

            {calcKind === 'late' && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">خسارت تأخیر تأدیه (ماده ۵۲۲ ق.آ.د.م)</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">اصل طلب (ریال)</label>
                    <input
                      type="number"
                      value={lateAmt}
                      onChange={(e) => setLateAmt(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">از سال سررسید</label>
                    <select
                      value={lateFromY}
                      onChange={(e) => setLateFromY(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      {years.map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">تا سال پرداخت</label>
                    <select
                      value={lateToY}
                      onChange={(e) => setLateToY(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      {years.map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 tabular-nums">
                  <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-5">
                    <div className="text-xs font-bold text-[var(--ink-muted)]">جمع اصل + خسارت تأخیر</div>
                    <div className="mt-1 text-xl font-extrabold text-teal-800 dark:text-teal-300">
                      {formatMoney(lateUpdated.total)} ریال
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)] p-5">
                    <div className="text-xs font-bold text-[var(--ink-muted)]">میزان خسارت افزوده‌شده</div>
                    <div className="mt-1 text-xl font-extrabold text-[var(--ink)]">
                      {formatMoney(lateUpdated.diff)} ریال
                    </div>
                  </div>
                </div>
              </div>
            )}

            {calcKind === 'attorney' && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">محاسبه تعرفه حق‌الوکاله دعاوی مالی</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">بهای خواسته یا محکوم‌به (ریال)</label>
                    <input
                      type="number"
                      value={attClaim}
                      onChange={(e) => setAttClaim(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">مرحله دادرسی</label>
                    <select
                      value={attStage}
                      onChange={(e) => setAttStage(e.target.value as 'first' | 'appeal')}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      <option value="first">مرحله نخستین (۱۰۰٪ تعرفه)</option>
                      <option value="appeal">مرحله تجدیدنظر (۷۰٪ تعرفه)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 tabular-nums">
                  <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-5">
                    <div className="text-xs font-bold text-[var(--ink-muted)]">حق‌الوکاله قانونی</div>
                    <div className="mt-1 text-xl font-extrabold text-teal-800 dark:text-teal-300">
                      {formatMoney(attorneyResult.fee)} ریال
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)] p-5">
                    <div className="text-xs font-bold text-[var(--ink-muted)]">تمبر مالیاتی (۵٪)</div>
                    <div className="mt-1 text-xl font-extrabold text-[var(--ink)]">
                      {formatMoney(attorneyResult.tax)} ریال
                    </div>
                  </div>
                </div>
              </div>
            )}

            {calcKind === 'inheritance' && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">محاسبه سهام قانونی ارث (طبقه اول)</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">ارزش خالص ماترک (ریال)</label>
                    <input
                      type="number"
                      value={inhEstate}
                      onChange={(e) => setInhEstate(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">همسر در قید حیات</label>
                    <select
                      value={inhSpouse}
                      onChange={(e) => setInhSpouse(e.target.value as 'none' | 'wife' | 'husband')}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--ink)]"
                    >
                      <option value="none">ندارد</option>
                      <option value="wife">زوجه (همسر زن)</option>
                      <option value="husband">زوج (همسر مرد)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">پسر</label>
                      <input type="number" min={0} value={inhSons} onChange={(e) => setInhSons(Number(e.target.value) || 0)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--ink)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">دختر</label>
                      <input type="number" min={0} value={inhDaughters} onChange={(e) => setInhDaughters(Number(e.target.value) || 0)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--ink)]" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-6 text-xs font-bold">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={inhFather} onChange={(e) => setInhFather(e.target.checked)} className="accent-teal-700" />
                    <span>پدر در قید حیات است</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={inhMother} onChange={(e) => setInhMother(e.target.checked)} className="accent-teal-700" />
                    <span>مادر در قید حیات است</span>
                  </label>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
                  <table className="w-full text-right text-xs tabular-nums">
                    <thead className="bg-[var(--surface-muted)] text-[var(--ink-muted)]">
                      <tr>
                        <th className="px-4 py-2.5">وارث</th>
                        <th className="px-4 py-2.5">سهم قانونی</th>
                        <th className="px-4 py-2.5">مبلغ سهم (ریال)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--hairline)]">
                      {inheritanceRows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5 font-bold text-[var(--ink)]">{r.heir}</td>
                          <td className="px-4 py-2.5 text-[var(--ink-muted)]">{r.shareLabel}</td>
                          <td className="px-4 py-2.5 font-bold text-teal-800 dark:text-teal-300">{formatMoney(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {calcKind === 'custom' && selectedCustom && (
              <div className="space-y-5">
                <h2 className="text-lg font-extrabold text-[var(--ink)]">فرمول‌های سفارشی تعریف‌شده توسط مدیر</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">انتخاب فرمول</label>
                    <select
                      value={selectedCustom.id}
                      onChange={(e) => setCustomId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
                    >
                      {customCalcs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">مبلغ مبنا (ریال)</label>
                    <input
                      type="number"
                      value={customAmt}
                      onChange={(e) => setCustomAmt(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                    />
                  </div>
                  {selectedCustom.type === 'daily' && (
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1.5">تعداد روز تأخیر</label>
                      <input
                        type="number"
                        value={customDays}
                        onChange={(e) => setCustomDays(Number(e.target.value) || 0)}
                        className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm font-mono-num text-[var(--ink)]"
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-[var(--ink-muted)]">{selectedCustom.desc}</p>
                <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-5 tabular-nums">
                  <div className="text-xs font-bold text-[var(--ink-muted)]">نتیجه محاسبه</div>
                  <div className="mt-1 text-2xl font-extrabold text-teal-800 dark:text-teal-300">
                    {formatMoney(
                      selectedCustom.type === 'daily'
                        ? (customAmt * selectedCustom.rate * customDays) / 100
                        : selectedCustom.type === 'fixed'
                          ? selectedCustom.rate
                          : (customAmt * selectedCustom.rate) / 100
                    )}{' '}
                    ریال
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tab 2: Legal Deadlines + Jalali Calendar Calculator */}
      {activeTab === 'deadlines' && (
        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap gap-1.5">
              {['all', 'مدنی', 'کیفری', 'اداری', 'ثبتی', 'کارگری'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDlCat(c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    dlCat === c
                      ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                      : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                  }`}
                >
                  {c === 'all' ? 'همه موارد' : c}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {deadlines
                .filter((d) => dlCat === 'all' || d.cat === dlCat)
                .map((dl) => (
                  <button
                    key={dl.id}
                    type="button"
                    onClick={() => setSelectedDl(dl)}
                    className={`w-full rounded-2xl border p-4 text-right transition-colors ${
                      selectedDl?.id === dl.id
                        ? 'border-teal-700 bg-[var(--accent-soft)]'
                        : 'border-[var(--hairline)] bg-[var(--surface)] hover:border-teal-600/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-muted)] tabular-nums">
                      <span className="font-bold text-teal-700 dark:text-teal-400">{dl.cat} · {dl.law}</span>
                      <span className="font-bold text-[var(--ink)]">{toFa(dl.daysIran)} روز داخل / {toFa(dl.daysAbroad)} روز خارج</span>
                    </div>
                    <div className="mt-1.5 text-sm font-extrabold text-[var(--ink)]">{dl.title}</div>
                    <p className="mt-1 text-xs leading-6 text-[var(--ink-muted)]">{dl.desc}</p>
                  </button>
                ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 lg:col-span-5 self-start sticky top-20">
            <h2 className="text-base font-extrabold text-[var(--ink)]">محاسبه دقیق تاریخ پایان مهلت (شمسی)</h2>
            {selectedDl && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs font-bold text-[var(--ink)]">
                  {selectedDl.title}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">روز ابلاغ</label>
                    <select value={dlJd} onChange={(e) => setDlJd(Number(e.target.value))} className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-2 py-2 text-xs text-[var(--ink)]">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{toFa(d)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">ماه ابلاغ</label>
                    <select value={dlJm} onChange={(e) => setDlJm(Number(e.target.value))} className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-2 py-2 text-xs text-[var(--ink)]">
                      {JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">سال</label>
                    <select value={dlJy} onChange={(e) => setDlJy(Number(e.target.value))} className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-2 py-2 text-xs text-[var(--ink)]">
                      {[todayJ.jy - 1, todayJ.jy, todayJ.jy + 1].map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                  <input type="checkbox" checked={dlAbroad} onChange={(e) => setDlAbroad(e.target.checked)} className="accent-teal-700" />
                  <span>شخص مقیم خارج از کشور است</span>
                </label>

                {activeDeadlineEndDate && (
                  <div className="rounded-xl border border-teal-700/20 bg-[var(--accent-soft)] p-4">
                    <div className="text-xs text-[var(--ink-muted)]">آخرین روز اقدام قانونی (با احتساب روز ابلاغ و اقدام):</div>
                    <div className="mt-1.5 text-lg font-extrabold text-teal-800 dark:text-teal-300">
                      {formatJalaali(activeDeadlineEndDate.end)}
                    </div>
                    <button
                      type="button"
                      onClick={downloadIcs}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800"
                    >
                      <Download className="h-4 w-4" />
                      <span>افزودن یادآور به تقویم (.ics)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tab 3: Lawyer Cases Manager */}
      {activeTab === 'cases' && (
        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={addCase} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 lg:col-span-4 space-y-4 self-start">
            <h2 className="text-base font-extrabold text-[var(--ink)]">ثبت پرونده جدید</h2>
            <div>
              <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">عنوان دعوا / موضوع</label>
              <input required value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-sm text-[var(--ink)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">نام موکل</label>
              <input value={caseClient} onChange={(e) => setCaseClient(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-sm text-[var(--ink)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">مرجع رسیدگی / شعبه</label>
              <input value={caseCourt} onChange={(e) => setCaseCourt(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-sm text-[var(--ink)]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">شماره پرونده</label>
                <input value={caseNo} onChange={(e) => setCaseNo(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">تاریخ جلسه بعدی</label>
                <input value={caseNextDate} onChange={(e) => setCaseNextDate(e.target.value)} placeholder="مثلاً ۱۴۰۵/۰۹/۱۲" className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)]" />
              </div>
            </div>
            <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white hover:bg-teal-800">
              <Plus className="h-4 w-4" />
              <span>ثبت پرونده</span>
            </button>
          </form>

          <div className="space-y-3 lg:col-span-8">
            {cases.length === 0 ? (
              <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--ink-muted)]">
                هنوز پرونده‌ای ثبت نکرده‌اید.
              </div>
            ) : (
              cases.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <span className="font-bold text-teal-700 dark:text-teal-400">{c.status}</span>
                      {c.caseNumber && <><span>·</span><span className="tabular-nums">کلاسه {toFa(c.caseNumber)}</span></>}
                      {c.nextDate && <><span>·</span><span>جلسه: {toFa(c.nextDate)}</span></>}
                    </div>
                    <h3 className="mt-1 text-base font-extrabold text-[var(--ink)]">{c.title}</h3>
                    <div className="mt-1 text-xs text-[var(--ink-muted)]">
                      {c.client && `موکل: ${c.client}`} {c.court && ` · ${c.court}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCase(c.id)}
                    className="rounded-lg border border-red-500/20 p-2 text-red-600 hover:bg-red-500/10"
                    title="حذف پرونده"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
};
