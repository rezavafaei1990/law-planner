export interface LegalDeadlineType {
  id: string;
  title: string;
  lawRef: string;
  daysIran: number;
  daysAbroad: number; // in days (approx 60 for 2 months)
  category: 'مدنی' | 'کیفری' | 'ثبتی' | 'اجرای احکام';
  description: string;
}

export const DEADLINE_TYPES: LegalDeadlineType[] = [
  {
    id: 'appeal_civil',
    title: 'تجدیدنظرخواهی مدنی',
    lawRef: 'ماده ۳۳۶ قانون آیین دادرسی مدنی',
    daysIran: 20,
    daysAbroad: 60,
    category: 'مدنی',
    description: 'مهلت تجدیدنظرخواهی از احکام و قرارهای قابل تجدیدنظر دادگاه عمومی و انقلاب.'
  },
  {
    id: 'vakhahi_civil',
    title: 'واخواهی از حکم غیابی مدنی',
    lawRef: 'ماده ۳۰۶ قانون آیین دادرسی مدنی',
    daysIran: 20,
    daysAbroad: 60,
    category: 'مدنی',
    description: 'محکوم‌علیه غایب حق دارد ظرف مدت مقرر به حکم غیابی اعتراض و واخواهی نماید.'
  },
  {
    id: 'farjam_civil',
    title: 'فرجام‌خواهی در دیوان عالی کشور',
    lawRef: 'ماده ۳۹۷ قانون آیین دادرسی مدنی',
    daysIran: 20,
    daysAbroad: 60,
    category: 'مدنی',
    description: 'مهلت فرجام‌خواهی از آرای قابل فرجام شعب دادگاه‌های تجدیدنظر استان.'
  },
  {
    id: 'defect_remedy',
    title: 'رفع نقص دادخواست / اخطار رفع نقص',
    lawRef: 'ماده ۵۴ قانون آیین دادرسی مدنی',
    daysIran: 10,
    daysAbroad: 10,
    category: 'مدنی',
    description: 'مدیر دفتر دادگاه مراتب نقص را به خواهان ابلاغ و ظرف ده روز مهلت رفع نقص می‌دهد.'
  },
  {
    id: 'brief_exchange',
    title: 'تبادل لوایح در مرحله تجدیدنظر',
    lawRef: 'ماده ۳۴۶ قانون آیین دادرسی مدنی',
    daysIran: 10,
    daysAbroad: 10,
    category: 'مدنی',
    description: 'تجدیدنظرخوانده می‌تواند ظرف ده روز پاسخ دادخواست تجدیدنظر را تسلیم نماید.'
  },
  {
    id: 'appeal_criminal',
    title: 'تجدیدنظرخواهی کیفری',
    lawRef: 'ماده ۴۳۱ قانون آیین دادرسی کیفری',
    daysIran: 20,
    daysAbroad: 60,
    category: 'کیفری',
    description: 'مهلت تجدیدنظرخواهی یا فرجام‌خواهی از احکام و قرارهای کیفری دادگاه‌ها.'
  },
  {
    id: 'registry_protest',
    title: 'اعتراض به تصمیم افراز یا ثبت',
    lawRef: 'ماده ۲ قانون فروش و افراز املاک مشاع',
    daysIran: 10,
    daysAbroad: 10,
    category: 'ثبتی',
    description: 'مهلت اعتراض به تصمیم واحد ثبتی مبنی بر عدم قابلیت افراز در دادگاه عمومی.'
  }
];

export function computeLegalDeadline(
  startDate: Date,
  days: number,
  isAbroad: boolean
): {
  targetDate: Date;
  effectiveDays: number;
  explanation: string;
} {
  // According to Article 445 & 446 of Iranian Civil Procedure Code:
  // The day of service (notification) and the day of action are NOT counted.
  // So effective duration = days + 1 day for service rule.
  // If target day falls on Friday, extends to Saturday.
  const target = new Date(startDate.getTime());
  // Add notification offset + days
  target.setDate(target.getDate() + days + 1);

  // If Friday (weekday === 5 in JS is Friday? 0 is Sunday, 5 is Friday):
  if (target.getDay() === 5) {
    target.setDate(target.getDate() + 1); // Move to Saturday
  }

  const effectiveDays = days;
  const explanation = `طبق مواد ۴۴۳ تا ۴۴۵ قانون آیین دادرسی مدنی، روز ابلاغ جزو مدت محسوب نشده و آخرین مهلت اقدام پایان وقت اداری روز تعیین‌شده است.`;

  return { targetDate: target, effectiveDays, explanation };
}
