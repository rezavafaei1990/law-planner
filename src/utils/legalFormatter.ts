export function toPersianDigits(n: number | string): string {
  const f = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/[0-9]/g, (w) => f[+w]);
}

export function toEnglishDigits(s: string): string {
  return String(s)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function formatLegalText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/(\n|^)(تبصره\s*[۰-۹\d]*\s*[-–—:]?)/g, '$1\n$2')
    .trim();
}

export interface DetectedArticleRef {
  raw: string;
  num: string;
}

export function extractArticleRefs(text: string): DetectedArticleRef[] {
  if (!text) return [];
  const re = /(?:ماده|مواد)\s+([۰-۹\d]{1,4})(?:\s+(?:تا|الی)\s+([۰-۹\d]{1,4}))?/g;
  const refs: DetectedArticleRef[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const n = toEnglishDigits(m[1]);
    refs.push({ raw, num: n });
  }
  return refs;
}

export function copyCitation(lawName: string, numText: string, text: string): Promise<boolean> {
  const formatted = `«${numText} ${lawName}»\n\n${text}\n\n— برگرفته از پایگاه حقوقی دادبان`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(formatted).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}
