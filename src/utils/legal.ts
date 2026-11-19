import type {
  Article,
  Decision,
  DeadlineItem,
  CustomCalculator,
  AboutInfo,
  ContactInfo,
  LegalExam,
  ExamSubject,
  ExamQuestion,
} from '../types';

export function toFa(n: number | string | null | undefined): string {
  const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n ?? '').replace(/[0-9]/g, (w) => digits[+w]);
}

export function toEn(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '۰';
  return toFa(Math.round(n).toLocaleString('en-US'));
}

export function normFa(s: string | null | undefined): string {
  return toEn(String(s ?? ''))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function formatLegalText(value: string | null | undefined): string {
  const s = String(value ?? '').replace(/\r\n?/g, '\n');
  const letterLabels = 'الف|ب|ج|د|ه|و|ز|ح|ط|ی|ک|ل|م|ن|س|ع|ف|ص|ق|ر|ش|ت|ث|خ|ذ|ض|ظ|غ';
  const numberLabel = '[0-9۰-۹٠-٩]{1,3}\\s*(?:[-–—ـ]|[.)])';
  const label = `(?:${letterLabels})\\s*[-–—ـ]`;
  const re = new RegExp(`\\s+(?=(?:${label}|${numberLabel})\\s+)`, 'g');
  return s
    .replace(re, (gap, offset, whole) => {
      const before = whole.slice(0, offset + gap.length);
      const next = whole.slice(offset + gap.length);
      if (/^[0-9۰-۹٠-٩]{1,3}\s*(?:[-–—ـ]|[.)])/.test(next) && /شماره\s*$/.test(before)) {
        return gap;
      }
      return '\n';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseQuery(q: string): { num: string | null; words: string[] } {
  let clean = normFa(q);
  let num: string | null = null;
  const onlyNum = /^(ماده\s*)?\d+$/.test(clean);
  if (/ماده\s*\d+/.test(clean) || onlyNum) {
    const match = clean.match(/\d+/);
    if (match) num = match[0];
    clean = clean.replace(/ماده\s*\d+/, '').replace(/^\d+$/, '').trim();
  }
  return { num, words: clean.split(' ').filter(Boolean) };
}

export function enrichArticle(a: Article): Article {
  const secText = (a.sections || []).map((x) => `${x.h} ${x.v}`).join(' ');
  const pathText = (a.path || []).join(' ');
  const norm = normFa(`${a.text} ${pathText} ${secText}`);
  const tn = normFa(`${a.text} ${secText}`);
  const pn = normFa(
    `${pathText} ${(a.sections || [])
      .filter((x) => /عنوان|موضوع/.test(x.h))
      .map((x) => x.v)
      .join(' ')}`
  );
  return { ...a, norm, tn, pn };
}

export interface ScannedRef {
  raw: string;
  nums: string[];
  targetLawHint: string;
  beforeLawHint?: string;
}

const NON_ARTICLE_UNIT_RE =
  /^\s*(?:روز|ماه|سال|هفته|ساعت|دقیقه|درصد|ریال|تومان|میلیون|میلیارد|هزار|نفر|درجه|مرتبه|بار|برابر|قسمت|سهم|دانگ|ضرب|شلاق|تبصره|بند|فصل|باب|کتاب|قسم|حکم|جلسه)/;

const AMENDMENT_PAREN_RE = /(?:اصلاحی|الحاقی|مصوب|مورخ|حذفی|منسوخ|موقت|آزمایشی|تکراری|تاریخ|سال)/;

function protectLegalAbbrevs(s: string): string {
  return s.replace(/(?:ق\s*\.\s*)?(?:آ\s*\.\s*د\s*\.\s*[مک]|ق\s*\.\s*م\s*\.\s*ا|ق\s*\.\s*[مت])/g, (m) =>
    m.replace(/\./g, '·')
  );
}

function clipClauseAfter(text: string, startIdx: number, maxLen = 110): string {
  const slice = text.slice(startIdx, startIdx + maxLen);
  const protectedSlice = protectLegalAbbrevs(slice);
  const stopMatch = protectedSlice.search(/[\n؛;!.؟?]|(?:\s+(?:ماده|مادّه|مواد)\s+[0-9۰-۹٠-٩(])/);
  const clipped = stopMatch >= 0 ? protectedSlice.slice(0, stopMatch) : protectedSlice;
  return clipped.replace(/·/g, '.');
}

function clipClauseBefore(text: string, endIdx: number, maxLen = 65): string {
  const slice = text.slice(Math.max(0, endIdx - maxLen), endIdx);
  const protectedSlice = protectLegalAbbrevs(slice);
  let lastSentenceBreak = -1;
  const sentRe = /[\n؛;!.؟?]/g;
  let sm: RegExpExecArray | null;
  while ((sm = sentRe.exec(protectedSlice)) !== null) {
    lastSentenceBreak = sm.index + sm[0].length;
  }
  const sameSentence = lastSentenceBreak >= 0 ? protectedSlice.slice(lastSentenceBreak) : protectedSlice;
  // If another ماده/مواد already appeared earlier in the same sentence, any law name immediately after it belongs to THAT earlier article unless a new law phrase ("در/طبق/مطابق قانون ...") explicitly precedes this article
  if (/(?:ماده|مادّه|مواد)\s+[0-9۰-۹٠-٩()]/.test(sameSentence)) {
    const introMatch = sameSentence.match(/(?:در|طبق|مطابق|برابر|موضوع|به\s*موجب|بموجب)\s+([^،,؛;.!?]{3,55})$/);
    if (!introMatch) return '';
    return introMatch[0].replace(/·/g, '.');
  }
  return sameSentence.replace(/·/g, '.');
}

export function scanArticleRefs(text: string): ScannedRef[] {
  if (!text) return [];
  const out: ScannedRef[] = [];
  // Match ONLY ماده / مادّه / مواد (never بند or تبصره!)
  const headRe = /(?:^|[\s،,؛;:.()«»\-–—])(مادّ?ه|مواد)\s+/g;
  let hm: RegExpExecArray | null;

  while ((hm = headRe.exec(text)) !== null) {
    const keywordStart = hm.index + hm[0].length - hm[1].length - (hm[0].length - hm[0].trimEnd().length);
    const seqStart = hm.index + hm[0].length;
    let pos = seqStart;
    const nums: string[] = [];
    const addNum = (n: string) => {
      const clean = n.trim();
      if (clean && !nums.includes(clean)) nums.push(clean);
    };

    const maxScanEnd = Math.min(text.length, seqStart + 220);
    let iterations = 0;

    while (pos < maxScanEnd && iterations < 45) {
      iterations++;
      const rest = text.slice(pos, maxScanEnd);

      // Handle parentheses — both normal (...) and RTL-reversed )...( as seen in Persian legal PDFs/Word exports
      const parenMatch = rest.match(/^\s*(?:\(([^()]{1,60})\)|\)([^()]{1,60})\()/);
      if (parenMatch) {
        const inner = (parenMatch[1] ?? parenMatch[2] ?? '').trim();
        const innerEn = toEn(inner);
        // Pure number(s) inside parens like (۱۸), )18(, (۱۰ و ۱۸), or (۱۰ تا ۱۲)
        if (!AMENDMENT_PAREN_RE.test(inner) && /^[0-9۰-۹٠-٩\s،,ویا\-–—تاالی]+$/.test(inner)) {
          const parenTokens = innerEn.match(/\d+\s*(?:تا|الی|إلی|-|–|—)\s*\d+|\d+/g) || [];
          parenTokens.forEach((tok) => {
            const rm = tok.match(/^(\d+)\s*(?:تا|الی|إلی|-|–|—)\s*(\d+)$/);
            if (rm) {
              const a = Number(rm[1]);
              const b = Number(rm[2]);
              if (b >= a && b - a <= 40) {
                for (let k = a; k <= b; k++) addNum(String(k));
              }
            } else if (/^\d{1,4}$/.test(tok)) {
              addNum(String(Number(tok)));
            }
          });
          pos += parenMatch[0].length;
          continue;
        }
        if (AMENDMENT_PAREN_RE.test(inner)) {
          pos += parenMatch[0].length;
          continue;
        }
        break;
      }

      // First token: no separator needed; subsequent tokens require separator or parenthetical number
      let sepLen = 0;
      if (nums.length > 0) {
        const sepMatch = rest.match(/^\s*(?:و|یا|،|,|\/|\\|تا|الی|إلی|-|–|—)\s*/);
        if (!sepMatch) break;
        sepLen = sepMatch[0].length;
      }

      const afterSep = rest.slice(sepLen);
      // Check if next is a parenthetical pure number after a separator like "و (۱۸)" or "و )18("
      const parenNumAfterSep = afterSep.match(/^(?:\(\s*([0-9۰-۹٠-٩]{1,4})(?:\s*(مکرر))?\s*\)|\)\s*([0-9۰-۹٠-٩]{1,4})(?:\s*(مکرر))?\s*\()/);
      if (parenNumAfterSep) {
        const rawDigits = parenNumAfterSep[1] || parenNumAfterSep[3];
        const rawMok = parenNumAfterSep[2] || parenNumAfterSep[4];
        const numVal = String(Number(toEn(rawDigits)));
        addNum(rawMok ? `${numVal} مکرر` : numVal);
        pos += sepLen + parenNumAfterSep[0].length;
        continue;
      }

      // Match a range: "10 تا 15" / "10 الی 15" / "10-15"
      const rangeMatch = afterSep.match(/^([0-9۰-۹٠-٩]{1,4})\s*(?:تا|الی|إلی|-|–|—)\s*([0-9۰-۹٠-٩]{1,4})/);
      if (rangeMatch) {
        const afterRange = afterSep.slice(rangeMatch[0].length);
        if (NON_ARTICLE_UNIT_RE.test(afterRange)) break;
        const a = Number(toEn(rangeMatch[1]));
        const b = Number(toEn(rangeMatch[2]));
        if (b >= a && b - a <= 40) {
          for (let k = a; k <= b; k++) addNum(String(k));
          pos += sepLen + rangeMatch[0].length;
          continue;
        }
      }

      // Match a single article number (with optional مکرر)
      const singleMatch = afterSep.match(/^([0-9۰-۹٠-٩]{1,4})(?:\s+(مکرر))?(?![0-9۰-۹٠-٩])/);
      if (!singleMatch) break;

      const afterSingle = afterSep.slice(singleMatch[0].length);
      // Do not consume numbers followed by non-article units like "و ۵ روز" or "و ۳ نفر"
      if (nums.length > 0 && NON_ARTICLE_UNIT_RE.test(afterSingle)) break;

      const numVal = String(Number(toEn(singleMatch[1])));
      addNum(singleMatch[2] ? `${numVal} مکرر` : numVal);
      pos += sepLen + singleMatch[0].length;
    }

    if (nums.length > 0) {
      out.push({
        raw: text.slice(keywordStart, pos).trim(),
        nums: nums.slice(0, 40),
        targetLawHint: clipClauseAfter(text, pos, 110),
        beforeLawHint: clipClauseBefore(text, keywordStart, 65),
      });
      headRe.lastIndex = pos;
    }
  }
  return out;
}

function findMatchingLawInClause(clause: string, lawNames: string[]): { law: string; idx: number; end: number } | null {
  const n = normFa(clause);
  if (!n) return null;

  type Candidate = { law: string; idx: number; len: number };
  const candidates: Candidate[] = [];

  const findLawByPredicate = (pred: (normName: string) => boolean): string | undefined =>
    lawNames.find((ln) => pred(normFa(ln)));

  const pushPattern = (re: RegExp, targetLaw: string | undefined) => {
    if (!targetLaw) return;
    const m = re.exec(n);
    if (m) {
      candidates.push({ law: targetLaw, idx: m.index, len: m[0].length });
    }
  };

  // Explicit disambiguated canonical legal patterns (highest accuracy between آیین دادرسی مدنی / کیفری / قانون مدنی)
  const admLaw = findLawByPredicate((x) => x.includes('دادرسی') && x.includes('مدنی'));
  const adkLaw = findLawByPredicate((x) => x.includes('دادرسی') && (x.includes('کیفری') || x.includes('جزایی')));
  const mojazatLaw = findLawByPredicate((x) => x.includes('مجازات اسلامی'));
  const tejaratLaw = findLawByPredicate((x) => x === 'قانون تجارت' || x.includes('قانون تجارت'));
  const madaniLaw = findLawByPredicate(
    (x) => x === 'قانون مدنی' || (x.includes('مدنی') && !x.includes('دادرسی') && !x.includes('مسئولیت') && !x.includes('اجرای احکام'))
  );
  const ejraLaw = findLawByPredicate((x) => x.includes('اجرای احکام') && x.includes('مدنی'));
  const sabtLaw = findLawByPredicate((x) => x.includes('ثبت اسناد') || x === 'قانون ثبت');
  const hasbiLaw = findLawByPredicate((x) => x.includes('امور حسبی'));
  const khanevadehLaw = findLawByPredicate((x) => x.includes('حمایت خانواده'));
  const karLaw = findLawByPredicate((x) => x === 'قانون کار' || x.includes('قانون کار'));
  const divanLaw = findLawByPredicate((x) => x.includes('دیوان عدالت اداری'));
  const shoraLaw = findLawByPredicate((x) => x.includes('شورای حل اختلاف') || x.includes('شوراهای حل اختلاف'));
  const checkLaw = findLawByPredicate((x) => x.includes('صدور چک'));
  const asasiLaw = findLawByPredicate((x) => x.includes('قانون اساسی'));

  // 1. آیین دادرسی کیفری (strictly before anything else that might contain دادرسی)
  pushPattern(
    /(?:قانون\s+)?(?:ایین|آیین|آئین)\s+دادرسی(?:\s+دادگاه\s*های\s+عمومی\s+و\s+انقلاب)?(?:\s+در\s+امور)?\s+(?:کیفری|جزایی)|دادرسی\s+(?:کیفری|جزایی)|ق\s*\.\s*آ\s*\.\s*د\s*\.\s*ک|آ\s*\.\s*د\s*\.\s*ک/,
    adkLaw
  );

  // 2. آیین دادرسی مدنی (strictly separate from کیفری and قانون مدنی)
  pushPattern(
    /(?:قانون\s+)?(?:ایین|آیین|آئین)\s+دادرسی(?:\s+دادگاه\s*های\s+عمومی\s+و\s+انقلاب)?(?:\s+در\s+امور)?\s+مدنی|دادرسی\s+مدنی|ق\s*\.\s*آ\s*\.\s*د\s*\.\s*م|آ\s*\.\s*د\s*\.\s*م/,
    admLaw
  );

  // 3. اجرای احکام مدنی
  pushPattern(/(?:قانون\s+)?اجرای\s+احکام\s+مدنی/, ejraLaw);

  // 4. قانون مجازات اسلامی
  pushPattern(/(?:قانون\s+)?مجازات\s+اسلامی|ق\s*\.\s*م\s*\.\s*ا/, mojazatLaw);

  // 5. قانون تجارت
  pushPattern(/(?:لایحه\s+قانونی\s+اصلاح\s+قسمتی\s+از\s+)?قانون\s+تجارت|ق\s*\.\s*ت(?![\u0600-\u06FF])/, tejaratLaw);

  // 6. قانون مدنی (NEVER match if preceded by دادرسی / مسئولیت / امور / اجرای احکام)
  pushPattern(/(?<!دادرسی\s)(?<!مسئولیت\s)(?<!احکام\s)قانون\s+مدنی|ق\s*\.\s*م(?!\s*\.\s*ا)(?![\u0600-\u06FF])/, madaniLaw);

  // 7. Other major Iranian statutes
  pushPattern(/(?:قانون\s+)?ثبت\s+اسناد(?:\s+و\s+املاک)?|قانون\s+ثبت/, sabtLaw);
  pushPattern(/(?:قانون\s+)?امور\s+حسبی/, hasbiLaw);
  pushPattern(/(?:قانون\s+)?حمایت\s+خانواده/, khanevadehLaw);
  pushPattern(/قانون\s+کار(?![\u0600-\u06FF])/, karLaw);
  pushPattern(/(?:قانون\s+)?(?:تشکیلات\s+و\s+آیین\s+دادرسی\s+)?دیوان\s+عدالت\s+اداری/, divanLaw);
  pushPattern(/(?:قانون\s+)?شورا(?:ی|های)\s+حل\s+اختلاف/, shoraLaw);
  pushPattern(/(?:قانون\s+)?صدور\s+چک/, checkLaw);
  pushPattern(/قانون\s+اساسی/, asasiLaw);

  // 8. Dynamic match against all exact law names in DB (longest first, guarding against substring collisions)
  const sortedNames = [...lawNames].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    const nn = normFa(name);
    if (!nn || nn.length < 4) continue;
    const idx = n.indexOf(nn);
    if (idx >= 0) {
      // Prevent "قانون مدنی" from matching inside "قانون آیین دادرسی مدنی" or "قانون اجرای احکام مدنی"
      if (nn === 'قانون مدنی') {
        const prevSlice = n.slice(Math.max(0, idx - 20), idx);
        if (/دادرسی|مسئولیت|احکام/.test(prevSlice)) continue;
      }
      candidates.push({ law: name, idx, len: nn.length });
    }
  }

  if (!candidates.length) return null;
  // Pick the EARLIEST law mentioned in the clause; break ties by LONGEST (most specific) match
  candidates.sort((a, b) => a.idx - b.idx || b.len - a.len);
  return { law: candidates[0].law, idx: candidates[0].idx, end: candidates[0].idx + candidates[0].len };
}

export function resolveHintLaw(
  hint: string,
  lawNames: string[],
  fallbackLaw: string,
  beforeHint?: string
): string {
  const afterNorm = normFa(hint);

  // Rule 1: Explicit self-reference right after the article number ALWAYS resolves to fallbackLaw
  const selfRefMatch = /(?:این|همین)\s+(?:قانون|آیین\s*نامه|لایحه|مقررات|فصل|باب)|قانون\s+(?:حاضر|فوق|مزبور|مذکور|اخیر)/.exec(
    afterNorm
  );
  if (selfRefMatch && selfRefMatch.index <= 28) {
    return fallbackLaw;
  }

  // Rule 2: Look for an explicit law name immediately AFTER the article number (within the same clause)
  if (afterNorm) {
    const immediateAfter = afterNorm.slice(0, 75);
    const afterLaw = findMatchingLawInClause(immediateAfter, lawNames);
    if (afterLaw) {
      // Only prefer fallbackLaw if an explicit self-reference appeared BEFORE that other law name
      if (selfRefMatch && selfRefMatch.index < afterLaw.idx) {
        return fallbackLaw;
      }
      return afterLaw.law;
    }
  }

  // Rule 3: Only if afterClause had no law name, check immediately BEFORE (e.g. "در قانون مجازات اسلامی ماده ۱۵")
  if (beforeHint) {
    const beforeNorm = normFa(beforeHint);
    if (/(?:این|همین)\s+قانون/.test(beforeNorm)) return fallbackLaw;
    const beforeLaw = findMatchingLawInClause(beforeNorm, lawNames);
    // Require the law name to be reasonably close to the article keyword (not an unrelated earlier clause)
    if (beforeLaw && beforeNorm.length - beforeLaw.end <= 20) {
      return beforeLaw.law;
    }
  }

  // Rule 4: Default strictly to the current article's own law
  return fallbackLaw;
}

export function expandSpecNumbers(spec: string): string[] {
  let clean = toEn(spec || '');
  const out: string[] = [];
  const seen = new Set<string>();
  clean = clean.replace(/(\d+)\s*(?:-|–|—|تا)\s*(\d+)/g, (m, aStr, bStr) => {
    const a = Number(aStr);
    const b = Number(bStr);
    if (b < a || b - a > 5000) return m;
    for (let i = a; i <= b; i++) {
      const key = String(i);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return ' ';
  });
  (clean.match(/\d+/g) || []).forEach((n) => {
    const key = String(Number(n));
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  });
  return out.sort((a, b) => Number(a) - Number(b));
}

export function compressNums(arr: Array<string | number>): string {
  const nums = [...new Set(arr.map(Number).filter((x) => !Number.isNaN(x)))].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `${nums[i]}-${nums[j]}` : String(nums[i]));
    i = j + 1;
  }
  return parts.join(' - ');
}

export function compressImageFile(file: File, maxSide = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن تصویر'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر پشتیبانی نمی‌شود'));
      img.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('خطا در پردازش تصویر'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

// Jalali <-> Gregorian exact calendar conversions
export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
export const PERSIAN_WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

function divInt(a: number, b: number): number {
  return ~~(a / b);
}
function modInt(a: number, b: number): number {
  return a - ~~(a / b) * b;
}

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < breaks.length; i++) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + divInt(jump, 33) * 8 + divInt(modInt(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + divInt(n, 33) * 8 + divInt(modInt(n, 33) + 3, 4);
  if (modInt(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = divInt(gy, 4) - divInt((divInt(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + divInt(jump + 4, 33) * 33;
  let leap = modInt(modInt(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    divInt((gy + divInt(gm - 8, 6) + 100100) * 1461, 4) +
    divInt(153 * modInt(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - divInt(divInt(gy + 100100 + divInt(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + divInt(divInt(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = divInt(modInt(j, 1461), 4) * 5 + 308;
  const gd = divInt(modInt(i, 153), 5) + 1;
  const gm = modInt(divInt(i, 153), 12) + 1;
  const gy = divInt(j, 1461) - 100100 + divInt(8 - gm, 6);
  return { gy, gm, gd };
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jd = 0;
  let jm = 0;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + divInt(k, 31);
      jd = modInt(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + divInt(k, 30);
  jd = modInt(k, 30) + 1;
  return { jy, jm, jd };
}

export function jalaaliToDate(jy: number, jm: number, jd: number): Date {
  const r = jalCal(jy);
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - divInt(jm, 7) * (jm - 7) + jd - 1;
  const g = d2g(jdn);
  return new Date(g.gy, g.gm - 1, g.gd);
}

export function dateToJalaali(date: Date): { jy: number; jm: number; jd: number } {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

export function formatJalaali(date: Date): string {
  const j = dateToJalaali(date);
  const wd = PERSIAN_WEEKDAYS[date.getDay()];
  return `${wd} ${toFa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFa(j.jy)}`;
}

// CPI Indices (Central Bank of Iran annual indices 1350 - 1405)
export const CPI_INDICES: Record<number, number> = {
  1350: 0.014, 1351: 0.015, 1352: 0.017, 1353: 0.020, 1354: 0.022,
  1355: 0.025, 1356: 0.032, 1357: 0.035, 1358: 0.039, 1359: 0.048,
  1360: 0.059, 1361: 0.070, 1362: 0.081, 1363: 0.089, 1364: 0.095,
  1365: 0.118, 1366: 0.150, 1367: 0.193, 1368: 0.227, 1369: 0.248,
  1370: 0.299, 1371: 0.372, 1372: 0.457, 1373: 0.618, 1374: 0.923,
  1375: 1.137, 1376: 1.334, 1377: 1.576, 1378: 1.892, 1379: 2.131,
  1380: 2.374, 1381: 2.748, 1382: 3.178, 1383: 3.662, 1384: 4.041,
  1385: 4.521, 1386: 5.354, 1387: 6.712, 1388: 7.437, 1389: 8.356,
  1390: 10.15, 1391: 13.25, 1392: 17.85, 1393: 20.64, 1394: 23.10,
  1395: 25.17, 1396: 27.59, 1397: 36.19, 1398: 51.12, 1399: 69.72,
  1400: 102.0, 1401: 149.4, 1402: 210.2, 1403: 280.1, 1404: 372.5,
  1405: 465.0,
};

export const DEFAULT_DEADLINES: DeadlineItem[] = [
  { id: 'dl_1', title: 'واخواهی از احکام غیابی دادگاه عمومی و انقلاب', law: 'ماده ۳۰۶ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'محکوم‌علیه غایب حق دارد ظرف ۲۰ روز برای مقیمین داخل یا ۶۰ روز برای مقیمین خارج به حکم غیابی اعتراض و واخواهی کند.' },
  { id: 'dl_2', title: 'تجدیدنظرخواهی از احکام و قرارهای مدنی', law: 'ماده ۳۳۶ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'مهلت تجدیدنظرخواهی از آرای قابل تجدیدنظر دادگاه عمومی و انقلاب در دادگاه تجدیدنظر استان ۲۰ روز از تاریخ ابلاغ است.' },
  { id: 'dl_3', title: 'فرجام‌خواهی در دیوان عالی کشور', law: 'ماده ۳۹۷ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'مهلت فرجام‌خواهی نسبت به آرای قابل فرجام شعب تجدیدنظر استان ۲۰ روز برای مقیمین داخل و ۲ ماه برای مقیمین خارج است.' },
  { id: 'dl_4', title: 'اعاده دادرسی در امور مدنی', law: 'ماده ۴۲۷ قانون آیین دادرسی مدنی', daysIran: 20, daysAbroad: 60, cat: 'مدنی', desc: 'مهلت درخواست اعاده دادرسی ۲۰ روز از تاریخ ابلاغ حکم یا حادث شدن جهت اعاده است.' },
  { id: 'dl_5', title: 'رفع نقص دادخواست توسط خواهان', law: 'ماده ۵۴ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'مدیر دفتر دادگاه مراتب نقص دادخواست را به خواهان ابلاغ و ۱۰ روز مهلت رفع نقص می‌دهد.' },
  { id: 'dl_6', title: 'تبادل لوایح در مرحله تجدیدنظر', law: 'ماده ۳۴۶ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'تجدیدنظرخوانده می‌تواند ظرف ۱۰ روز از تاریخ ابلاغ دادخواست تجدیدنظر پاسخ خود را تسلیم نماید.' },
  { id: 'dl_7', title: 'اعتراض به قرار رد دادخواست', law: 'ماده ۳۳۲ قانون آیین دادرسی مدنی', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'قرار رد دادخواست صادره توسط مدیر دفتر ظرف ۱۰ روز از تاریخ ابلاغ قابل شکایت در دادگاه است.' },
  { id: 'dl_8', title: 'تجدیدنظرخواهی و فرجام‌خواهی کیفری', law: 'ماده ۴۳۱ قانون آیین دادرسی کیفری', daysIran: 20, daysAbroad: 60, cat: 'کیفری', desc: 'مهلت تجدیدنظر یا فرجام‌خواهی از احکام و قرارهای کیفری ۲۰ روز برای داخل و ۲ ماه برای خارج از کشور است.' },
  { id: 'dl_9', title: 'اعتراض به قرار منع یا موقوفی تعقیب دادسرا', law: 'ماده ۲۷۰ قانون آیین دادرسی کیفری', daysIran: 10, daysAbroad: 30, cat: 'کیفری', desc: 'شاکی حق دارد ظرف ۱۰ روز از ابلاغ قرار منع یا موقوفی تعقیب در دادگاه کیفری ذی‌صلاح اعتراض نماید.' },
  { id: 'dl_10', title: 'اعتراض به قرار تأمین خواسته یا دستور موقت', law: 'ماده ۱۱۶ و ۳۲۵ ق.آ.د.م', daysIran: 10, daysAbroad: 10, cat: 'مدنی', desc: 'خوانده حق دارد ظرف ۱۰ روز پس از ابلاغ قرار تأمین خواسته به آن اعتراض کند.' },
  { id: 'dl_11', title: 'اعتراض به نظریه کارشناس رسمی دادگستری', law: 'ماده ۲۶۰ قانون آیین دادرسی مدنی', daysIran: 7, daysAbroad: 7, cat: 'مدنی', desc: 'طرفین دعوا می‌توانند ظرف ۷ روز از ابلاغ نظریه کارشناسی اعتراض مستدل خود را تسلیم دادگاه نمایند.' },
  { id: 'dl_12', title: 'دادخواهی در شعب دیوان عدالت اداری', law: 'ماده ۱۶ قانون دیوان عدالت اداری', daysIran: 90, daysAbroad: 180, cat: 'اداری', desc: 'مهلت طرح دادخواست نسبت به آرای قطعی هیأت‌ها ۳ ماه برای مقیمین داخل و ۶ ماه برای مقیمین خارج است.' },
  { id: 'dl_13', title: 'اعتراض به تصمیم ثبتی افراز ملک مشاع', law: 'ماده ۲ قانون افراز و فروش املاک مشاع', daysIran: 10, daysAbroad: 10, cat: 'ثبتی', desc: 'تصمیم واحد ثبتی مبنی بر عدم قابلیت افراز ظرف ۱۰ روز از ابلاغ در دادگاه عمومی حقوقی محل ملک قابل اعتراض است.' },
  { id: 'dl_14', title: 'شکایت از آرای هیأت‌های حل اختلاف کار', law: 'ماده ۱۵۹ قانون کار', daysIran: 15, daysAbroad: 15, cat: 'کارگری', desc: 'آرای قطعی هیأت حل اختلاف کار پس از ابلاغ در مهلت مقرر قابل طرح در دیوان عدالت اداری است.' },
];

export const DEFAULT_CUSTOM_CALCS: CustomCalculator[] = [
  { id: 'c_arb', title: 'حق‌الزحمه داوری', type: 'percent', rate: 1.5, desc: 'محاسبه بر مبنای ۱.۵ درصد از مبلغ خواسته ارجاعی به داوری' },
  { id: 'c_reg', title: 'حق‌الثبت اسناد مالی دفاتر اسناد', type: 'percent', rate: 0.5, desc: 'نیم درصد ارزش معاملاتی طبق قانون ثبت اسناد و املاک' },
  { id: 'c_exp', title: 'حق‌الزحمه ارزیابی کارشناس رسمی', type: 'percent', rate: 0.25, desc: 'تعرفه ارزیابی دارایی‌ها بر مبنای درصدی از ارزش روز' },
  { id: 'c_delay', title: 'خسارت روزشمار تأخیر قرارداد', type: 'daily', rate: 0.1, desc: 'یک در هزار ارزش قرارداد به ازای هر روز تأخیر' },
];

export const DEFAULT_ABOUT: AboutInfo = {
  title: 'گروه حقوقی و پژوهشی برائت',
  subtitle: 'تلفیق دانش روز حقوق، رویه قضایی و فناوری اطلاعات',
  mission: 'ایجاد دسترسی سریع و دقیق به متن منقح قوانین و آرای وحدت رویه همراه با ابزارهای تخصصی برای وکلا و داوطلبان آزمون‌های حقوقی.',
  vision: 'مرجع اول دیجیتال در پژوهش حقوقی و برنامه‌ریزی علمی آزمون‌های حقوقی کشور.',
  team: [
    { name: 'هیئت تحریریه و پژوهش برائت', role: 'تدوین و تنقیح قوانین', bio: 'گردآوری، تطبیق و به‌روزرسانی مستمر متون قانونی و آرای دیوان عالی کشور.' },
    { name: 'کارگروه وکالت و مشاوره', role: 'دعاوی حقوقی و کیفری', bio: 'پاسخ‌گویی تخصصی به مسائل کاربردی و تحلیل پرونده‌های پیچیده.' },
  ],
  services: ['مشاوره تخصصی دعاوی حقوقی و کیفری', 'تنظیم اوراق قضایی و قراردادهای تجاری', 'بانک منقح قوانین و آرای وحدت رویه', 'برنامه‌ریزی و پشتیبانی علمی آزمون وکالت و قضاوت'],
  stats: [
    { label: 'قوانین منقح', value: '۱۹+ قانون مادر' },
    { label: 'مواد قانونی', value: '۵۰۰۰+ ماده' },
    { label: 'آرای وحدت رویه', value: 'به‌روزرسانی مستمر' },
    { label: 'محاسبه‌گرها', value: '۷ ابزار تخصصی' },
  ],
};

export const DEFAULT_CONTACT: ContactInfo = {
  phone: '۰۲۱-۰۰۰۰۰۰۰۰',
  mobile: '۰۹۱۲-۰۰۰۰۰۰۰',
  email: 'info@baraat.ir',
  address: 'تهران — دفتر مرکزی گروه حقوقی برائت',
  hours: 'شنبه تا چهارشنبه ۹ تا ۱۷',
  telegram: '',
  instagram: '',
  whatsapp: '',
  mapNote: 'پیش از مراجعه حضوری از طریق فرم زیر هماهنگ فرمایید.',
};

// Smart spreadsheet/CSV parser for Admin Excel/CSV/JSON law & decision imports
export function decodeSpreadsheetBytesSmart(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  try {
    return new TextDecoder('windows-1256').decode(bytes);
  } catch {
    return utf8;
  }
}

export function parseCsvTextToGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const sample = lines.slice(0, 5).join('\n');
  const sep = (sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length ? '\t' : ',';
  const rows: string[][] = [];
  for (const line of lines) {
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === sep && !inQ) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

export async function parseLawSpreadsheetFile(file: File): Promise<Array<{ law: string; num: string; numText: string; text: string; path: string[]; sections: { h: string; v: string }[] }>> {
  const lower = file.name.toLowerCase();
  const baseLawName = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const buf = await file.arrayBuffer();
  const grids: { name: string; grid: string[][] }[] = [];

  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    grids.push({ name: baseLawName, grid: parseCsvTextToGrid(decodeSpreadsheetBytesSmart(buf)) });
  } else {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    wb.SheetNames.forEach((sn) => {
      const ws = wb.Sheets[sn];
      const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
      const lawName = wb.SheetNames.length > 1 ? `${baseLawName} - ${sn}` : baseLawName;
      grids.push({ name: lawName, grid });
    });
  }

  const all: Array<{ law: string; num: string; numText: string; text: string; path: string[]; sections: { h: string; v: string }[] }> = [];
  const PATH_CORE = ['باب', 'مبحث', 'فصل', 'بخش', 'کتاب', 'گفتار', 'قسمت'];

  for (const { name, grid } of grids) {
    const cleanGrid = grid.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    if (cleanGrid.length < 2) continue;
    let hi = 0;
    let bestScore = -1;
    const KW = /شماره|متن|ماده|باب|مبحث|فصل|بخش|بند|تبصره|عنوان|موضوع/;
    cleanGrid.slice(0, 10).forEach((r, idx) => {
      const sc = r.filter((c) => String(c).length < 45 && KW.test(normFa(String(c)))).length;
      if (sc > bestScore) {
        bestScore = sc;
        hi = idx;
      }
    });
    const width = Math.max(...cleanGrid.slice(0, 400).map((r) => r.length));
    const headers = Array.from({ length: width }, (_, i) => String(cleanGrid[hi][i] ?? '').trim() || `ستون ${i + 1}`);
    const H = headers.map((h) => normFa(h).replace(/\s|\//g, ''));
    let numIdx = H.findIndex((h) => h.includes('شمارهماده') || (h.includes('شماره') && !/تبصره|بند|ردیف/.test(h)) || h === 'ماده');
    if (numIdx < 0) numIdx = 0;
    let textIdx = H.findIndex((h, i) => i !== numIdx && (h.includes('متنماده') || h.includes('متن')));
    if (textIdx < 0) textIdx = Math.min(numIdx + 1, width - 1);
    const pathCols: number[] = [];
    const secCols: number[] = [];
    H.forEach((h, i) => {
      if (i === numIdx || i === textIdx) return;
      if (PATH_CORE.some((p) => h.includes(p))) pathCols.push(i);
      else secCols.push(i);
    });

    const lastPath: Record<number, string> = {};
    for (const row of cleanGrid.slice(hi + 1)) {
      const numText = String(row[numIdx] ?? '').trim();
      const text = String(row[textIdx] ?? '').trim();
      if (!text && !numText) continue;
      const numMatch = toEn(numText).match(/\d+/);
      const path = pathCols
        .map((c) => {
          const val = String(row[c] ?? '').trim();
          if (val && !/^[-–—_.\s]+$/.test(val)) lastPath[c] = val;
          return val && !/^[-–—_.\s]+$/.test(val) ? val : lastPath[c] || '';
        })
        .filter(Boolean);
      const sections = secCols
        .map((c) => ({ h: headers[c], v: String(row[c] ?? '').trim() }))
        .filter((x) => x.v && !/^[-–—_.\s]+$/.test(x.v));
      all.push({
        law: name,
        num: numMatch ? numMatch[0] : numText,
        numText: numText || (numMatch ? `ماده ${numMatch[0]}` : ''),
        text,
        path,
        sections,
      });
    }
  }
  return all;
}

export async function parseDecisionsSpreadsheetFile(file: File): Promise<Decision[]> {
  const lower = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  const grids: string[][][] = [];
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    grids.push(parseCsvTextToGrid(decodeSpreadsheetBytesSmart(buf)));
  } else {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    wb.SheetNames.forEach((sn) => {
      grids.push(XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sn], { header: 1, defval: '' }) as string[][]);
    });
  }
  const out: Decision[] = [];
  for (const rawGrid of grids) {
    const grid = rawGrid.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    if (grid.length < 2) continue;
    const headers = grid[0].map((x) => normFa(String(x)).replace(/[\s_/]/g, ''));
    let ni = headers.findIndex((h) => h.includes('شماره'));
    const yi = headers.findIndex((h) => h.includes('سال'));
    let ti = headers.findIndex((h) => h.includes('متن'));
    const di = headers.findIndex((h) => h.includes('تاریخ'));
    const si = headers.findIndex((h) => h.includes('موضوع') || h.includes('عنوان'));
    if (ni < 0) ni = 0;
    if (ti < 0) ti = Math.min(2, headers.length - 1);
    for (const r of grid.slice(1)) {
      const number = (toEn(String(r[ni] ?? '')).match(/\d+/) || [''])[0];
      const year = yi >= 0 ? (toEn(String(r[yi] ?? '')).match(/\d{4}/) || [''])[0] : '';
      const text = String(r[ti] ?? '').trim();
      if (number && year && text) {
        out.push({
          number,
          year,
          date: di >= 0 ? String(r[di] ?? '').trim() : '',
          subject: si >= 0 ? String(r[si] ?? '').trim() : '',
          text,
        });
      }
    }
  }
  return out;
}

function parseAnswerIndex(rawVal: unknown, zeroBased: boolean): number {
  const norm = normFa(String(rawVal ?? ''));
  if (!norm) return 0;

  // 1. Decimal integer from Excel e.g. "2.0" or "2"
  const pureNum = norm.match(/^([0-4])(?:\.0+)?$/);
  if (pureNum) {
    const n = Number(pureNum[1]);
    if (zeroBased) return Math.max(0, Math.min(3, n));
    if (n >= 1 && n <= 4) return n - 1;
    return 0;
  }

  // 2. Explicit phrase like "گزینه 2" / "گزینه ی ۲" / "گزینه ب" / "پاسخ 3" / "گزینه دوم"
  const explicitMatch = norm.match(
    /(?:گزینه|پاسخ|جواب|کلید|شماره)\s*(?:ی\s+|صحیح\s+|درست\s+)?[:：\-–—.]?\s*(?:([0-4])(?:\.0+)?(?![0-9])|(الف|ا|ب|ج|د|a|b|c|d)(?![\u0600-\u06FFa-z])|(اول|یکم|دوم|سوم|چهارم))/
  );
  if (explicitMatch) {
    if (explicitMatch[1] !== undefined) {
      const n = Number(explicitMatch[1]);
      if (zeroBased) return Math.max(0, Math.min(3, n));
      if (n >= 1 && n <= 4) return n - 1;
      return 0;
    }
    if (explicitMatch[2]) {
      const lt = explicitMatch[2];
      if (lt === 'الف' || lt === 'ا' || lt === 'a') return 0;
      if (lt === 'ب' || lt === 'b') return 1;
      if (lt === 'ج' || lt === 'c') return 2;
      if (lt === 'د' || lt === 'd') return 3;
    }
    if (explicitMatch[3]) {
      const ord = explicitMatch[3];
      if (ord === 'اول' || ord === 'یکم') return 0;
      if (ord === 'دوم') return 1;
      if (ord === 'سوم') return 2;
      if (ord === 'چهارم') return 3;
    }
  }

  // 3. Clean standalone letter or ordinal word (e.g. "ب)", "(ج)", "دوم", "گزینه ب صحیح است")
  const stripped = norm
    .replace(/(?:گزینه|پاسخ|جواب|کلید|صحیح|درست|است|می\s*باشد|شماره)/g, ' ')
    .replace(/[:：.\-–—()[\]«»؛،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped === 'الف' || stripped === 'ا' || stripped === 'a' || stripped === 'اول' || stripped === 'یکم' || stripped === 'یک') return 0;
  if (stripped === 'ب' || stripped === 'b' || stripped === 'دوم' || stripped === 'دو') return 1;
  if (stripped === 'ج' || stripped === 'c' || stripped === 'سوم' || stripped === 'سه') return 2;
  if (stripped === 'د' || stripped === 'd' || stripped === 'چهارم' || stripped === 'چهار') return 3;

  // 4. Standalone digit 0..4 inside cleaned string (avoid grabbing unrelated multi-digit numbers like article 123)
  const validDigit = stripped.match(/(?:^|\s)([0-4])(?:\.0+)?(?=\s|$)/);
  if (validDigit) {
    const n = Number(validDigit[1]);
    if (zeroBased) return Math.max(0, Math.min(3, n));
    if (n >= 1 && n <= 4) return n - 1;
    return 0;
  }

  // 5. Fallback: any single digit 1..4 in normalized string
  const anyOneToFour = norm.match(/(?<![0-9])([1-4])(?![0-9])/);
  if (anyOneToFour) {
    const n = Number(anyOneToFour[1]);
    return zeroBased ? Math.max(0, Math.min(3, n)) : n - 1;
  }

  return 0;
}

export interface ExamImportDefaults {
  title?: string;
  category?: string;
  examType?: string;
  year?: string;
  subject?: string;
  durationMin?: number;
  isPublished?: boolean;
}

export function normalizeSourceTag(raw: string): string {
  return toFa(String(raw || '').replace(/\s+/g, ' ').trim());
}

export function buildQuestionSourceLabel(
  rawSource?: string,
  rawType?: string,
  rawYear?: string
): string {
  const src = String(rawSource || '').trim();
  const typ = String(rawType || '').trim();
  const yrEn = toEn(String(rawYear || '').trim()).replace(/[^\d]/g, '');
  const yrFa = yrEn ? toFa(yrEn) : '';

  if (src) {
    if (yrEn && !toEn(src).includes(yrEn) && !/تالیف/.test(src)) {
      return normalizeSourceTag(`${src} ${yrFa}`);
    }
    return normalizeSourceTag(src);
  }
  if (typ) {
    if (yrEn && !toEn(typ).includes(yrEn) && !/تالیف/.test(typ)) {
      return normalizeSourceTag(`${typ} ${yrFa}`);
    }
    return normalizeSourceTag(typ);
  }
  if (yrFa) {
    return normalizeSourceTag(`آزمون سال ${yrFa}`);
  }
  return '';
}

export function createSampleExamCsv(): string {
  const rows = [
    ['سرفصل', 'منبع سوال', 'سال', 'صورت سوال', 'گزینه ۱', 'گزینه ۲', 'گزینه ۳', 'گزینه ۴', 'پاسخ', 'پاسخ تشریحی'],
    ['کلیات و مسئولیت کیفری', 'آزمون وکلا', '1400', 'شرط تحقق مسئولیت کیفری در قبال جرایم عمدی کدام است؟', 'بلوغ و عقل و اختیار', 'صرف علم به حکم', 'سوگند متهم', 'عدم سابقه کیفری', '1', 'مطابق مواد ۱۴۰ تا ۱۴۶ قانون مجازات اسلامی'],
    ['قصاص و دیات', 'ارشد', '98', 'در چه صورتی قصاص نفس ساقط و تبدیل به دیه می‌شود؟', 'با گذشت ولی دم یا مصالحه', 'با اقرار متهم', 'با تغییر قاضی', 'با مرور زمان یک‌ساله', '1', 'مطابق قانون مجازات اسلامی با گذشت اولیای دم قصاص ساقط می‌شود.'],
    ['تعزیرات', 'تالیفی', '', 'حداقل سن مسئولیت کیفری در پسران مطابق قانون مجازات اسلامی کدام است؟', '۱۵ سال تمام قمری', '۱۸ سال تمام شمسی', '۱۲ سال تمام شمسی', '۹ سال تمام قمری', '1', 'ماده ۱۴۷ قانون مجازات اسلامی']
  ];
  return '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export function formatAdminCsvQuestionRef(
  q: { csvQuestionNum?: string; csvRowIndex?: number; csvFileName?: string },
  fallbackGlobalIdx?: number
): string {
  const num = q.csvQuestionNum ? String(q.csvQuestionNum).trim() : '';
  const row = typeof q.csvRowIndex === 'number' && q.csvRowIndex > 0 ? q.csvRowIndex : undefined;
  if (num && row && num !== String(row)) {
    return `فایل CSV: سوال ${toFa(num)} (ردیف ${toFa(row)})`;
  }
  if (row) {
    return `فایل CSV: ردیف ${toFa(row)}`;
  }
  if (num) {
    return `فایل CSV: سوال ${toFa(num)}`;
  }
  if (fallbackGlobalIdx && fallbackGlobalIdx > 0) {
    return `سوال ${toFa(fallbackGlobalIdx)} آزمون`;
  }
  return '';
}

export async function parseExamSpreadsheetFile(
  file: File,
  defaults: ExamImportDefaults = {}
): Promise<LegalExam[]> {
  const lower = file.name.toLowerCase();
  const fileBase = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const baseStamp = Date.now();

  type RawQRow = {
    title?: string;
    category?: string;
    examType?: string;
    year?: string;
    subject?: string;
    hasExplicitSubject?: boolean;
    chapter?: string;
    sourceLabel?: string;
    csvQuestionNum?: string;
    csvRowIndex?: number;
    csvFileName?: string;
    q: string;
    options: string[];
    answer: number;
    exp?: string;
    durationMin?: number;
  };

  const rawRows: RawQRow[] = [];
  let hasDistinctTitleColumn = false;

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(await file.text()) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown[] }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : [parsed];

    if (arr.length > 0 && arr[0] && typeof arr[0] === 'object' && Array.isArray((arr[0] as { subjects?: unknown[] }).subjects)) {
      return (arr as Partial<LegalExam>[]).map((ex, i) => {
        let runningSeq = 0;
        return {
          id: ex.id || `ex_${baseStamp}_${i}`,
          title: ex.title || defaults.title || fileBase,
          durationMin: Number(ex.durationMin || defaults.durationMin) || 45,
          desc: ex.desc || '',
          category: ex.category || defaults.category || '',
          examType: ex.examType || defaults.examType || '',
          year: ex.year ? toEn(ex.year) : defaults.year ? toEn(defaults.year) : '',
          isPublished: ex.isPublished ?? defaults.isPublished ?? true,
          subjects: (ex.subjects || []).map((sb, sIdx) => ({
            id: sb.id || `sub_${baseStamp}_${i}_${sIdx}`,
            name: sb.name || defaults.subject || 'عمومی',
            questions: (sb.questions || []).map((q, qIdx) => {
              runningSeq += 1;
              return {
                id: q.id || `q_${baseStamp}_${i}_${sIdx}_${qIdx}`,
                q: q.q || '',
                options: Array.isArray(q.options) ? q.options : [],
                answer: Number(q.answer) || 0,
                exp: q.exp || '',
                chapter: q.chapter || '',
                sourceLabel: q.sourceLabel || buildQuestionSourceLabel('', ex.examType, ex.year),
                csvQuestionNum: q.csvQuestionNum || String(runningSeq),
                csvRowIndex: q.csvRowIndex || runningSeq,
                csvFileName: q.csvFileName || file.name,
              };
            }),
          })),
          createdAt: ex.createdAt || new Date().toISOString(),
        };
      });
    }

    const hasZeroJson = arr.some(
      (item) => item && typeof item === 'object' && /^0(?:\.0+)?$/.test(toEn(String((item as { answer?: unknown }).answer ?? '')).trim())
    );
    const hasFourJson = arr.some(
      (item) => item && typeof item === 'object' && /^4(?:\.0+)?$/.test(toEn(String((item as { answer?: unknown }).answer ?? '')).trim())
    );
    const zeroBased = hasZeroJson && !hasFourJson;
    let jsonSeq = 0;
    for (let itemIdx = 0; itemIdx < arr.length; itemIdx++) {
      const item = arr[itemIdx];
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const qText = String(o.q || o.question || o['سوال'] || o['متن سوال'] || '').trim();
      if (!qText) continue;
      const rawOpts = Array.isArray(o.options)
        ? (o.options as unknown[]).map((x) => String(x ?? '').trim())
        : [
            String(o.option1 || o.a || o['گزینه ۱'] || o['گزینه 1'] || o['الف'] || '').trim(),
            String(o.option2 || o.b || o['گزینه ۲'] || o['گزینه 2'] || o['ب'] || '').trim(),
            String(o.option3 || o.c || o['گزینه ۳'] || o['گزینه 3'] || o['ج'] || '').trim(),
            String(o.option4 || o.d || o['گزینه ۴'] || o['گزینه 4'] || o['د'] || '').trim(),
          ];
      if (rawOpts.filter(Boolean).length < 2) continue;
      const opts = [...rawOpts];
      while (opts.length > 2 && !opts[opts.length - 1]) opts.pop();
      jsonSeq += 1;
      const rowTitle = String(o.examName || o.title || o['نام آزمون'] || o['اسم آزمون'] || '').trim();
      if (rowTitle) hasDistinctTitleColumn = true;
      const rowYear = toEn(String(o.year || o['سال'] || defaults.year || '').trim());
      const rowType = String(o.examType || o.type || o['نوع'] || defaults.examType || '').trim();
      const rowSource = String(o.sourceLabel || o.source || o['منبع'] || o['منبع سوال'] || '').trim();
      const rawSub = String(o.subject || o['درس'] || '').trim();
      const chapter = String(o.chapter || o.topic || o['سرفصل'] || o['فصل'] || o['مبحث'] || o['موضوع'] || '').trim();
      const explicitNum = toEn(String(o.csvQuestionNum || o.number || o.no || o.row || o['شماره'] || o['شماره سوال'] || o['ردیف'] || '').trim());
      rawRows.push({
        title: rowTitle || defaults.title || fileBase,
        category: String(o.category || o['دسته'] || o['گروه'] || defaults.category || '').trim(),
        examType: rowType,
        year: rowYear,
        subject: rawSub || defaults.subject || chapter || 'عمومی',
        hasExplicitSubject: Boolean(rawSub),
        chapter,
        sourceLabel: buildQuestionSourceLabel(rowSource, rowType, rowYear),
        csvQuestionNum: explicitNum || String(jsonSeq),
        csvRowIndex: itemIdx + 1,
        csvFileName: file.name,
        q: qText,
        options: opts,
        answer: parseAnswerIndex(o.answer ?? o.correct ?? o['پاسخ'] ?? o['گزینه صحیح'], zeroBased),
        exp: String(o.exp || o.explanation || o['توضیح'] || o['پاسخ تشریحی'] || '').trim(),
        durationMin: Number(o.durationMin || o.duration || defaults.durationMin) || 45,
      });
    }
  } else {
    const buf = await file.arrayBuffer();
    const grids: { sheetName: string; grid: string[][] }[] = [];
    if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
      grids.push({ sheetName: fileBase, grid: parseCsvTextToGrid(decodeSpreadsheetBytesSmart(buf)) });
    } else {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'array' });
      wb.SheetNames.forEach((sn) => {
        const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sn], { header: 1, defval: '' }) as string[][];
        grids.push({ sheetName: sn, grid });
      });
    }

    let fileQuestionSeq = 0;
    for (const { sheetName, grid } of grids) {
      const indexedGrid = grid
        .map((row, origIdx) => ({ row, origRowNum: origIdx + 1 }))
        .filter((item) => item.row.some((c) => String(c ?? '').trim() !== ''));
      if (indexedGrid.length < 2) continue;
      let hi = 0;
      let best = -1;
      const KW = /سوال|پرسش|گزینه|پاسخ|جواب|درس|سرفصل|فصل|مبحث|منبع|سال|آزمون|دسته|question|option|answer/;
      indexedGrid.slice(0, 6).forEach((item, idx) => {
        const sc = item.row.filter((c) => String(c).length < 40 && KW.test(normFa(String(c)))).length;
        if (sc > best) {
          best = sc;
          hi = idx;
        }
      });

      const headers = indexedGrid[hi].row.map((h) => normFa(String(h ?? '')).replace(/[\s_/()-]/g, ''));
      const findCol = (re: RegExp, exclude?: RegExp) =>
        headers.findIndex((h) => re.test(h) && (!exclude || !exclude.test(h)));

      const numCol = findCol(/^(شماره|شمارهسوال|شمارهتست|ردیف|کدسوال|کد|no|num|number|row|qno|id|#)$/);
      const qCol = findCol(/^(سوال|متنسوال|صورتسوال|پرسش|q|question)/) >= 0 ? findCol(/^(سوال|متنسوال|صورتسوال|پرسش|q|question)/) : findCol(/سوال|پرسش|question/);
      const titleCol = findCol(/نامازمون|اسمازمون|عنوانازمون|examname|examtitle/);
      const catCol = findCol(/^(دسته|دستهبندی|گروه|آزموناصل|رشته|category|track)/);
      const sourceCol = findCol(/^(منبعسوال|منبع|مرجع|آزمونمبدا|منبعازمون|مبدا|source|origin|examsource)/);
      const typeCol = findCol(/^(نوع|نوعسوال|نوعازمون|ماهیت|تالیفی|type|examtype)/);
      const yearCol = findCol(/^(سال|سالازمون|year)/);
      const subCol = findCol(/^(درس|مادهدرس|subject)/);
      const chapCol = findCol(/^(سرفصل|فصل|مبحث|موضوع|بخش|عنوانفصل|chapter|topic|section|heading)/);
      const ansCol = findCol(/^(پاسخ|جواب|کلید|گزینهصحیح|answer|correct)/, /تشریح/);
      const expCol = findCol(/تشریح|توضیح|نکته|شرح|مستند|explanation|exp/);
      const durCol = findCol(/مدت|زمان|duration/);

      if (titleCol >= 0) hasDistinctTitleColumn = true;

      const o1Col = findCol(/^(گزینه1|گزینه۱|الف|opt1|option1|a)$/) >= 0 ? findCol(/^(گزینه1|گزینه۱|الف|opt1|option1|a)$/) : findCol(/گزینه1|گزینه۱|گزینهاول|option1/);
      const o2Col = findCol(/^(گزینه2|گزینه۲|ب|opt2|option2|b)$/) >= 0 ? findCol(/^(گزینه2|گزینه۲|ب|opt2|option2|b)$/) : findCol(/گزینه2|گزینه۲|گزینهدوم|option2/);
      const o3Col = findCol(/^(گزینه3|گزینه۳|ج|opt3|option3|c)$/) >= 0 ? findCol(/^(گزینه3|گزینه۳|ج|opt3|option3|c)$/) : findCol(/گزینه3|گزینه۳|گزینهسوم|option3/);
      const o4Col = findCol(/^(گزینه4|گزینه۴|د|opt4|option4|d)$/) >= 0 ? findCol(/^(گزینه4|گزینه۴|د|opt4|option4|d)$/) : findCol(/گزینه4|گزینه۴|گزینهچهارم|option4/);

      const dataRows = indexedGrid.slice(hi + 1);
      // Only treat a spreadsheet as 0-based (0..3) if it actually contains '0' AND has NO '4' anywhere
      const hasZeroAns =
        ansCol >= 0 && dataRows.some((item) => /^0(?:\.0+)?$/.test(toEn(String(item.row[ansCol] ?? '')).trim()));
      const hasFourAns =
        ansCol >= 0 && dataRows.some((item) => /^4(?:\.0+)?$/.test(toEn(String(item.row[ansCol] ?? '')).trim()));
      const zeroBased = hasZeroAns && !hasFourAns;

      const fallbackTitle = defaults.title || (grids.length > 1 ? `${fileBase} - ${sheetName}` : fileBase);
      for (const { row: r, origRowNum } of dataRows) {
        const qText = String(r[qCol >= 0 ? qCol : 0] ?? '').trim();
        // Preserve positional indices 0..3 (never filter out an earlier empty option and shift answer indices!)
        const rawOpts = [
          o1Col >= 0 ? String(r[o1Col] ?? '').trim() : '',
          o2Col >= 0 ? String(r[o2Col] ?? '').trim() : '',
          o3Col >= 0 ? String(r[o3Col] ?? '').trim() : '',
          o4Col >= 0 ? String(r[o4Col] ?? '').trim() : '',
        ];
        const nonEmptyCount = rawOpts.filter(Boolean).length;
        if (!qText || nonEmptyCount < 2) continue;
        const opts = [...rawOpts];
        while (opts.length > 2 && !opts[opts.length - 1]) opts.pop();

        fileQuestionSeq += 1;
        const explicitNum = numCol >= 0 ? toEn(String(r[numCol] ?? '').trim()) : '';
        const rowChap = chapCol >= 0 ? String(r[chapCol] ?? '').trim() : '';
        const rowSub = subCol >= 0 ? String(r[subCol] ?? '').trim() : '';
        const rowSource = sourceCol >= 0 ? String(r[sourceCol] ?? '').trim() : '';
        const rowType = (typeCol >= 0 ? String(r[typeCol] ?? '').trim() : '') || defaults.examType || '';
        const rowYear = toEn((yearCol >= 0 ? String(r[yearCol] ?? '').trim() : '') || defaults.year || '');
        const computedSource = buildQuestionSourceLabel(rowSource, rowType, rowYear);

        rawRows.push({
          title: (titleCol >= 0 ? String(r[titleCol] ?? '').trim() : '') || fallbackTitle,
          category: (catCol >= 0 ? String(r[catCol] ?? '').trim() : '') || defaults.category || '',
          examType: rowType,
          year: rowYear,
          subject: rowSub || defaults.subject || rowChap || 'عمومی',
          hasExplicitSubject: Boolean(rowSub),
          chapter: rowChap,
          sourceLabel: computedSource,
          csvQuestionNum: explicitNum || String(fileQuestionSeq),
          csvRowIndex: origRowNum,
          csvFileName: file.name,
          q: qText,
          options: opts,
          answer: ansCol >= 0 ? parseAnswerIndex(r[ansCol], zeroBased) : 0,
          exp: expCol >= 0 ? String(r[expCol] ?? '').trim() : '',
          durationMin: durCol >= 0 ? Number(toEn(r[durCol])) || defaults.durationMin || 45 : defaults.durationMin || 45,
        });
      }
    }
  }

  // Group into cohesive exam(s): if user set defaults.title OR file doesn't specify multiple distinct exam titles,
  // keep one cohesive exam organized by سرفصل / درس while preserving per-question sourceLabel tags.
  const distinctTitles = new Set(rawRows.map((r) => (r.title || '').trim()).filter(Boolean));
  const shouldKeepSingleExam = Boolean(defaults.title) || !hasDistinctTitleColumn || distinctTitles.size <= 1;

  const examGroups = new Map<string, { meta: RawQRow; rows: RawQRow[] }>();
  rawRows.forEach((row) => {
    const title = defaults.title || row.title || fileBase;
    const category = defaults.category || row.category || '';
    const examType = defaults.examType || row.examType || '';
    const year = defaults.year || row.year || '';
    const gKey = shouldKeepSingleExam ? title : `${category}||${title}`;

    if (!examGroups.has(gKey)) {
      examGroups.set(gKey, { meta: { ...row, title, category, examType, year }, rows: [] });
    }
    examGroups.get(gKey)!.rows.push(row);
  });

  const outExams: LegalExam[] = [];
  let eIdx = 0;
  for (const [, grp] of examGroups.entries()) {
    const explicitSubjects = new Set(grp.rows.filter((r) => r.hasExplicitSubject && r.subject).map((r) => r.subject!));
    const hasChapters = grp.rows.some((r) => Boolean(r.chapter));
    const useChapterBuckets = hasChapters && explicitSubjects.size <= 1;

    const bySubject = new Map<string, ExamQuestion[]>();
    grp.rows.forEach((row, idx) => {
      const bucketName = useChapterBuckets
        ? row.chapter || (row.hasExplicitSubject ? row.subject : '') || defaults.subject || 'سوالات آزمون'
        : (row.hasExplicitSubject ? row.subject : row.chapter) || defaults.subject || 'سوالات آزمون';
      if (!bySubject.has(bucketName)) bySubject.set(bucketName, []);
      bySubject.get(bucketName)!.push({
        id: `q_${baseStamp}_${eIdx}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        q: row.q,
        options: row.options,
        answer: row.answer,
        exp: row.exp || '',
        chapter: row.chapter || '',
        sourceLabel: row.sourceLabel || undefined,
        csvQuestionNum: row.csvQuestionNum,
        csvRowIndex: row.csvRowIndex,
        csvFileName: row.csvFileName,
      });
    });

    const subjects: ExamSubject[] = [];
    let sIdx = 0;
    for (const [subName, qList] of bySubject.entries()) {
      subjects.push({
        id: `sub_${baseStamp}_${eIdx}_${sIdx}`,
        name: subName,
        questions: qList,
      });
      sIdx += 1;
    }
    outExams.push({
      id: `ex_${baseStamp}_${eIdx}`,
      title: grp.meta.title || fileBase,
      durationMin: grp.meta.durationMin || defaults.durationMin || 45,
      category: grp.meta.category || undefined,
      examType: grp.meta.examType || undefined,
      year: grp.meta.year || undefined,
      isPublished: defaults.isPublished ?? true,
      subjects,
      createdAt: new Date().toISOString(),
    });
    eIdx += 1;
  }

  return outExams;
}
