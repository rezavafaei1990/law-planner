import { createClient } from '@supabase/supabase-js';
import type {
  Law,
  Article,
  Decision,
  JournalArticle,
  DeadlineItem,
  CustomCalculator,
  AboutInfo,
  ContactInfo,
  LegalExam,
  ExamSubjectFolder,
  ExamAttemptResult,
  ExamQuestionTagState,
  ExamPrepRecord,
  LegalCase,
  QuestionReplyItem,
  PlannerState,
  AssignedPlanEntry,
  VipSettings,
} from '../types';
import {
  enrichArticle,
  DEFAULT_DEADLINES,
  DEFAULT_CUSTOM_CALCS,
  DEFAULT_ABOUT,
  DEFAULT_CONTACT,
  compressImageFile,
} from '../utils/legal';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xfmdpeeuzhuvqwoalfea.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ndrrbpAGh5VfuiVfETIE8g_IS-jfJD4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const META_KEYS = {
  VER: 'ver',
  ARTICLES: 'baraat_articles_v2',
  DEADLINES: 'baraat_deadlines_v2',
  CALCS: 'baraat_custom_calcs_v2',
  ABOUT: 'baraat_about_v1',
  CONTACT: 'baraat_contact_v1',
  ASSIGNED_PLANS: 'baraat_assigned_plans_v1',
  CASES: 'baraat_lawyer_cases_v1',
  QUESTIONS: 'baraat_question_replies_v1',
  REPORTS: 'baraat_student_reports_v1',
  EXAMS: 'baraat_exams_v1',
  EXAMS_PRIVATE: 'baraat_exams_private_v1',
  EXAM_SUBJECTS: 'baraat_exam_subjects_v1',
  EXAM_ATTEMPTS: 'baraat_exam_attempts_v1',
  VIP_SUBSCRIPTIONS: 'baraat_vip_subscriptions_v1',
} as const;

export const DEFAULT_EXAM_SUBJECTS: ExamSubjectFolder[] = [
  { id: 'esub_civil', name: 'حقوق مدنی', desc: 'قواعد عمومی قراردادها، عقود معین، اموال، ارث و خانواده', order: 1 },
  { id: 'esub_civ_proc', name: 'آیین دادرسی مدنی', desc: 'صلاحیت، ادله اثبات، طرق شکایت از آرا و اجرای احکام', order: 2 },
  { id: 'esub_commerce', name: 'حقوق تجارت', desc: 'شرکت‌ها، اسناد تجاری، چک، ورشکستگی و قراردادهای تجاری', order: 3 },
  { id: 'esub_criminal', name: 'حقوق جزا', desc: 'حقوق جزای عمومی و اختصاصی (حدود، قصاص، دیات و تعزیرات)', order: 4 },
  { id: 'esub_crim_proc', name: 'آیین دادرسی کیفری', desc: 'کشف جرم، تعقیب، تحقیقات مقدماتی، دادگاه‌ها و تجدیدنظر', order: 5 },
  { id: 'esub_usool', name: 'اصول فقه', desc: 'مباحث الفاظ، حجج و امارات، اصول عملیه و تعارض ادله', order: 6 },
];

export const DEFAULT_VIP_SETTINGS: VipSettings = {
  subscribers: [],
  upgradeMessage:
    'این آزمون ویژه اعضای دارای اشتراک فعال برائت است. برای فعال‌سازی اشتراک ویژه و دسترسی نامحدود به تمام آزمون‌های تخصصی با پشتیبانی در ارتباط باشید.',
  supportContact: '',
};

const IDB_NAME = 'lawdb_v2';
const IDB_STORE = 'kv';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIDB();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, val: T): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore storage quota errors
  }
}

export interface LawDbBundle {
  ver: string | null;
  laws: Law[];
  articles: Article[];
  decisions: Decision[];
}

async function fetchPaged<T>(table: string, cols: string, orders: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols);
    orders.forEach((o) => {
      q = q.order(o, { ascending: true });
    });
    const res = await q.range(from, from + 999);
    if (res.error) throw res.error;
    const rows = (res.data || []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function fetchFullLawDatabase(force = false): Promise<LawDbBundle> {
  const cached = await idbGet<LawDbBundle>('db');
  if (!force && cached && Array.isArray(cached.laws) && cached.articles?.length > 0) {
    const needsEnrich = cached.articles.some((a) => !a.norm || a.tn === undefined);
    return {
      ver: cached.ver || null,
      laws: cached.laws,
      articles: needsEnrich ? cached.articles.map((a) => (a.norm && a.tn !== undefined ? a : enrichArticle(a))) : cached.articles,
      decisions: cached.decisions || [],
    };
  }

  try {
    const [verRes, laws, rawArts, rawDecs] = await Promise.all([
      Promise.resolve(supabase.from('meta').select('value').eq('key', META_KEYS.VER).maybeSingle()).then(
        (r) => r,
        () => ({ data: null })
      ),
      fetchPaged<Law>('laws', 'id,name,sort', ['sort', 'id']),
      fetchPaged<{
        id: number;
        law_id: number;
        ord: number;
        num: string;
        num_text?: string;
        text?: string;
        path?: string[];
        sections?: { h: string; v: string }[];
      }>('articles', 'id,law_id,ord,num,num_text,text,path,sections', ['law_id', 'ord']),
      fetchPaged<Decision>('decisions', 'number,year,date,subject,text', ['year', 'number']),
    ]);

    const nameMap = new Map<number, string>(laws.map((l) => [l.id, l.name]));
    const articles: Article[] = rawArts.map((a) =>
      enrichArticle({
        id: a.id,
        law_id: a.law_id,
        law: nameMap.get(a.law_id) || 'نامشخص',
        ord: a.ord,
        num: String(a.num || ''),
        num_text: a.num_text || String(a.num || ''),
        text: a.text || '',
        path: a.path || [],
        sections: a.sections || [],
      })
    );

    const ver = (verRes && verRes.data && typeof verRes.data.value === 'string' ? verRes.data.value : null) || null;
    const bundle: LawDbBundle = { ver, laws, articles, decisions: rawDecs };
    await idbSet('db', bundle);
    return bundle;
  } catch (err) {
    if (cached && Array.isArray(cached.laws)) {
      const needsEnrich = cached.articles.some((a) => !a.norm || a.tn === undefined);
      return {
        ver: cached.ver || null,
        laws: cached.laws,
        articles: needsEnrich ? cached.articles.map((a) => (a.norm && a.tn !== undefined ? a : enrichArticle(a))) : cached.articles,
        decisions: cached.decisions || [],
      };
    }
    throw err;
  }
}

export async function checkRemoteLawVer(): Promise<string | null> {
  try {
    const res = await Promise.resolve(
      supabase.from('meta').select('value').eq('key', META_KEYS.VER).maybeSingle()
    );
    return res?.data && typeof res.data.value === 'string' ? res.data.value : null;
  } catch {
    return null;
  }
}

export async function invalidateServerCache(): Promise<void> {
  try {
    await fetch('/api/cache/invalidate', { method: 'POST' });
  } catch {
    // non-fatal
  }
}

export async function bumpLawVersion(): Promise<void> {
  await supabase.from('meta').upsert({ key: META_KEYS.VER, value: new Date().toISOString() });
  await invalidateServerCache();
}

export async function upsertMetaKey(key: string, data: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await supabase
    .from('meta')
    .upsert({ key, value: JSON.stringify(data) }, { onConflict: 'key' })
    .select('key');
  if (res.error) return { ok: false, error: res.error.message };
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
  await invalidateServerCache();
  return { ok: true };
}

export interface SiteMetaBundle {
  articles: JournalArticle[];
  deadlines: DeadlineItem[];
  customCalcs: CustomCalculator[];
  about: AboutInfo;
  contact: ContactInfo;
  exams: LegalExam[];
  examSubjects: ExamSubjectFolder[];
  examAttempts: ExamAttemptResult[];
  questions: Record<string, QuestionReplyItem>;
  vipSettings: VipSettings;
}

function parseMetaVal<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  try {
    const val = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (val ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function loadLocalSiteMeta(isAdminUser = false): SiteMetaBundle {
  const get = <T>(k: string, fb: T): T => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fb;
    } catch {
      return fb;
    }
  };
  const pubExams = get<LegalExam[]>(META_KEYS.EXAMS, []).filter((e) => e && e.isPublished !== false);
  let mergedExams = pubExams;
  if (isAdminUser) {
    const privExams = get<LegalExam[]>(META_KEYS.EXAMS_PRIVATE, []).map((e) => ({ ...e, isPublished: false }));
    const map = new Map<string, LegalExam>();
    for (const ex of pubExams) if (ex?.id) map.set(ex.id, ex);
    for (const ex of privExams) if (ex?.id) map.set(ex.id, ex);
    mergedExams = Array.from(map.values());
  } else {
    try {
      localStorage.removeItem(META_KEYS.EXAMS_PRIVATE);
    } catch {
      // ignore
    }
  }
  return {
    articles: get<JournalArticle[]>(META_KEYS.ARTICLES, []),
    deadlines: get<DeadlineItem[]>(META_KEYS.DEADLINES, DEFAULT_DEADLINES),
    customCalcs: get<CustomCalculator[]>(META_KEYS.CALCS, DEFAULT_CUSTOM_CALCS),
    about: get<AboutInfo>(META_KEYS.ABOUT, DEFAULT_ABOUT),
    contact: get<ContactInfo>(META_KEYS.CONTACT, DEFAULT_CONTACT),
    exams: mergedExams,
    examSubjects: get<ExamSubjectFolder[]>(META_KEYS.EXAM_SUBJECTS, DEFAULT_EXAM_SUBJECTS),
    examAttempts: get<ExamAttemptResult[]>(META_KEYS.EXAM_ATTEMPTS, []),
    questions: get<Record<string, QuestionReplyItem>>(META_KEYS.QUESTIONS, {}),
    vipSettings: get<VipSettings>(META_KEYS.VIP_SUBSCRIPTIONS, DEFAULT_VIP_SETTINGS),
  };
}

export async function saveExamsSplitToSupabase(list: LegalExam[]): Promise<{ ok: boolean; error?: string }> {
  const pub = list.filter((e) => e.isPublished !== false);
  const priv = list.filter((e) => e.isPublished === false).map((e) => ({ ...e, isPublished: false }));
  const r1 = await upsertMetaKey(META_KEYS.EXAMS, pub);
  const r2 = await upsertMetaKey(META_KEYS.EXAMS_PRIVATE, priv);
  if (!r1.ok) return r1;
  if (!r2.ok) return r2;
  return { ok: true };
}

export async function fetchSiteMetaFromSupabase(isAdminUser = false): Promise<SiteMetaBundle> {
  const local = loadLocalSiteMeta(isAdminUser);
  const keys: string[] = [
    META_KEYS.ARTICLES,
    META_KEYS.DEADLINES,
    META_KEYS.CALCS,
    META_KEYS.ABOUT,
    META_KEYS.CONTACT,
    META_KEYS.EXAMS,
    META_KEYS.EXAM_SUBJECTS,
    META_KEYS.EXAM_ATTEMPTS,
    META_KEYS.QUESTIONS,
    META_KEYS.VIP_SUBSCRIPTIONS,
  ];
  if (isAdminUser) {
    keys.push(META_KEYS.EXAMS_PRIVATE);
  } else {
    try {
      localStorage.removeItem(META_KEYS.EXAMS_PRIVATE);
    } catch {
      // ignore
    }
  }
  const res = await supabase.from('meta').select('key,value').in('key', keys);
  if (res.error || !res.data) return local;

  const map: Record<string, unknown> = {};
  for (const row of res.data) {
    if (row?.key) map[row.key] = row.value;
  }

  const rawPubExams = Array.isArray(parseMetaVal(map[META_KEYS.EXAMS], null))
    ? parseMetaVal<LegalExam[]>(map[META_KEYS.EXAMS], local.exams)
    : local.exams;
  const legacyHidden = rawPubExams.filter((e) => e && e.isPublished === false);
  const cleanPubExams = rawPubExams.filter((e) => e && e.isPublished !== false);

  let finalExams = cleanPubExams;
  if (isAdminUser) {
    const rawPrivExams = Array.isArray(parseMetaVal(map[META_KEYS.EXAMS_PRIVATE], null))
      ? parseMetaVal<LegalExam[]>(map[META_KEYS.EXAMS_PRIVATE], [])
      : [];
    const mergedMap = new Map<string, LegalExam>();
    for (const ex of cleanPubExams) if (ex?.id) mergedMap.set(ex.id, ex);
    for (const ex of rawPrivExams) if (ex?.id) mergedMap.set(ex.id, { ...ex, isPublished: false });
    for (const ex of legacyHidden) {
      if (ex?.id && !mergedMap.has(ex.id)) mergedMap.set(ex.id, { ...ex, isPublished: false });
    }
    finalExams = Array.from(mergedMap.values());
    const cleanPrivExams = finalExams.filter((e) => e.isPublished === false);
    if (legacyHidden.length > 0) {
      await upsertMetaKey(META_KEYS.EXAMS_PRIVATE, cleanPrivExams);
      await upsertMetaKey(META_KEYS.EXAMS, cleanPubExams);
    }
    try {
      localStorage.setItem(META_KEYS.EXAMS_PRIVATE, JSON.stringify(cleanPrivExams));
    } catch {
      // ignore
    }
  }

  const next: SiteMetaBundle = {
    articles: Array.isArray(parseMetaVal(map[META_KEYS.ARTICLES], null))
      ? parseMetaVal<JournalArticle[]>(map[META_KEYS.ARTICLES], local.articles)
      : local.articles,
    deadlines: Array.isArray(parseMetaVal(map[META_KEYS.DEADLINES], null))
      ? parseMetaVal<DeadlineItem[]>(map[META_KEYS.DEADLINES], DEFAULT_DEADLINES)
      : local.deadlines,
    customCalcs: Array.isArray(parseMetaVal(map[META_KEYS.CALCS], null))
      ? parseMetaVal<CustomCalculator[]>(map[META_KEYS.CALCS], DEFAULT_CUSTOM_CALCS)
      : local.customCalcs,
    about: parseMetaVal<AboutInfo>(map[META_KEYS.ABOUT], local.about),
    contact: parseMetaVal<ContactInfo>(map[META_KEYS.CONTACT], local.contact),
    exams: finalExams,
    examSubjects: Array.isArray(parseMetaVal(map[META_KEYS.EXAM_SUBJECTS], null))
      ? parseMetaVal<ExamSubjectFolder[]>(map[META_KEYS.EXAM_SUBJECTS], DEFAULT_EXAM_SUBJECTS)
      : local.examSubjects?.length
        ? local.examSubjects
        : DEFAULT_EXAM_SUBJECTS,
    examAttempts: Array.isArray(parseMetaVal(map[META_KEYS.EXAM_ATTEMPTS], null))
      ? parseMetaVal<ExamAttemptResult[]>(map[META_KEYS.EXAM_ATTEMPTS], local.examAttempts)
      : local.examAttempts,
    questions: parseMetaVal<Record<string, QuestionReplyItem>>(map[META_KEYS.QUESTIONS], local.questions),
    vipSettings: parseMetaVal<VipSettings>(map[META_KEYS.VIP_SUBSCRIPTIONS], local.vipSettings || DEFAULT_VIP_SETTINGS),
  };

  try {
    localStorage.setItem(META_KEYS.ARTICLES, JSON.stringify(next.articles));
    localStorage.setItem(META_KEYS.DEADLINES, JSON.stringify(next.deadlines));
    localStorage.setItem(META_KEYS.CALCS, JSON.stringify(next.customCalcs));
    localStorage.setItem(META_KEYS.ABOUT, JSON.stringify(next.about));
    localStorage.setItem(META_KEYS.CONTACT, JSON.stringify(next.contact));
    localStorage.setItem(META_KEYS.EXAMS, JSON.stringify(cleanPubExams));
    localStorage.setItem(META_KEYS.EXAM_SUBJECTS, JSON.stringify(next.examSubjects));
    localStorage.setItem(META_KEYS.EXAM_ATTEMPTS, JSON.stringify(next.examAttempts));
    localStorage.setItem(META_KEYS.QUESTIONS, JSON.stringify(next.questions));
    localStorage.setItem(META_KEYS.VIP_SUBSCRIPTIONS, JSON.stringify(next.vipSettings));
  } catch {
    // ignore storage full
  }

  return next;
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  try {
    const r = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
    return Boolean(r.data && r.data.user_id);
  } catch {
    return false;
  }
}

export async function ensureLawRecord(name: string): Promise<number> {
  const existing = await supabase.from('laws').select('id').eq('name', name).maybeSingle();
  if (existing.data) return existing.data.id as number;
  const maxRes = await supabase.from('laws').select('sort').order('sort', { ascending: false }).limit(1);
  const sort = ((maxRes.data?.[0]?.sort as number | undefined) || 0) + 1;
  const ins = await supabase.from('laws').insert({ name, sort }).select('id').single();
  if (ins.error) throw ins.error;
  return ins.data.id as number;
}

export async function importLawArticles(
  lawName: string,
  rows: Array<{ num: string; numText: string; text: string; path: string[]; sections: { h: string; v: string }[] }>,
  replace: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const lawId = await ensureLawRecord(lawName);
  let start = 0;
  if (replace) {
    const delRes = await supabase.from('articles').delete().eq('law_id', lawId);
    if (delRes.error) throw delRes.error;
  } else {
    const maxOrd = await supabase
      .from('articles')
      .select('ord')
      .eq('law_id', lawId)
      .order('ord', { ascending: false })
      .limit(1);
    start = ((maxOrd.data?.[0]?.ord as number | undefined) ?? -1) + 1;
  }

  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300).map((o, idx) => ({
      law_id: lawId,
      ord: start + i + idx,
      num: String(o.num || ''),
      num_text: o.numText || String(o.num || ''),
      text: o.text || '',
      path: o.path || [],
      sections: o.sections || [],
    }));
    const r = await supabase.from('articles').insert(chunk);
    if (r.error) throw r.error;
    onProgress?.(Math.min(i + 300, rows.length), rows.length);
  }
}

export async function importDecisionsList(list: Decision[]): Promise<void> {
  for (let i = 0; i < list.length; i += 200) {
    const part = list.slice(i, i + 200).map((d) => ({
      number: String(d.number),
      year: String(d.year),
      date: d.date || '',
      subject: d.subject || '',
      text: d.text || '',
    }));
    const r = await supabase.from('decisions').upsert(part);
    if (r.error) throw r.error;
  }
}

export async function fetchUserCases(userId?: string): Promise<LegalCase[]> {
  try {
    const key = userId ? `${META_KEYS.CASES}_${userId}` : META_KEYS.CASES;
    const localRaw = localStorage.getItem(key) || localStorage.getItem(META_KEYS.CASES);
    if (navigator.onLine) {
      const res = await supabase.from('meta').select('value').eq('key', META_KEYS.CASES).maybeSingle();
      if (res.data?.value) {
        const parsed = parseMetaVal<LegalCase[]>(res.data.value, []);
        localStorage.setItem(META_KEYS.CASES, JSON.stringify(parsed));
        return parsed;
      }
    }
    return localRaw ? (JSON.parse(localRaw) as LegalCase[]) : [];
  } catch {
    return [];
  }
}

export async function uploadPlannerAttachment(
  userId: string,
  file: File
): Promise<{ name: string; type: string; path?: string; dataUrl?: string; size: number }> {
  const isImage = /^image\//i.test(file.type || '') || /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(file.name);
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${Date.now()}_${cleanName}`;
  const up = await supabase.storage.from('files').upload(storagePath, file, { upsert: false });
  if (!up.error) {
    return { name: file.name, type: file.type || (isImage ? 'image/jpeg' : 'application/pdf'), path: storagePath, size: file.size };
  }
  if (isImage) {
    const dataUrl = await compressImageFile(file, 1200, 0.78);
    return { name: file.name, type: 'image/jpeg', dataUrl, size: file.size };
  }
  throw up.error;
}

export async function getSignedAttachmentUrl(path: string): Promise<string | null> {
  const res = await supabase.storage.from('files').createSignedUrl(path, 3600);
  return res.error ? null : res.data.signedUrl;
}

function parseTagTs(tg?: ExamQuestionTagState): number {
  if (!tg?.updatedAt) return 0;
  const t = new Date(tg.updatedAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Conflict-free cross-device merge for PlannerState (PWA <-> Web <-> Android).
 * Preserves all notes, difficulty/review tags, prep history, and article marks
 * by comparing per-item timestamps & tombstones so one device never wipes another.
 */
export function mergePlannerStates(local: PlannerState, remote: PlannerState | null): PlannerState {
  if (!remote) return local;

  // 1. Merge examNotes with per-question update & deletion timestamps
  const mergedNotes: Record<string, string> = {};
  const mergedNotesUpdated: Record<string, number> = {};
  const mergedNotesDeleted: Record<string, number> = {};
  const allNoteIds = new Set([
    ...Object.keys(local.examNotes || {}),
    ...Object.keys(remote.examNotes || {}),
    ...Object.keys(local.examNotesDeletedAt || {}),
    ...Object.keys(remote.examNotesDeletedAt || {}),
  ]);
  for (const qId of allNoteIds) {
    const lVal = (local.examNotes?.[qId] || '').trim();
    const rVal = (remote.examNotes?.[qId] || '').trim();
    const lUpd = local.examNotesUpdatedAt?.[qId] || (lVal ? 1 : 0);
    const rUpd = remote.examNotesUpdatedAt?.[qId] || (rVal ? 1 : 0);
    const lDel = local.examNotesDeletedAt?.[qId] || 0;
    const rDel = remote.examNotesDeletedAt?.[qId] || 0;
    const maxDel = Math.max(lDel, rDel);
    const maxUpd = Math.max(lUpd, rUpd);

    if (maxDel > 0) mergedNotesDeleted[qId] = maxDel;
    if (maxDel > maxUpd) {
      // Deleted more recently than last edit
      continue;
    }
    if (lVal && !rVal) {
      if (lUpd >= maxDel) {
        mergedNotes[qId] = local.examNotes![qId];
        if (lUpd > 1) mergedNotesUpdated[qId] = lUpd;
      }
    } else if (rVal && !lVal) {
      if (rUpd >= maxDel) {
        mergedNotes[qId] = remote.examNotes![qId];
        if (rUpd > 1) mergedNotesUpdated[qId] = rUpd;
      }
    } else if (lVal && rVal) {
      if (lUpd >= rUpd) {
        mergedNotes[qId] = local.examNotes![qId];
        if (lUpd > 1) mergedNotesUpdated[qId] = lUpd;
      } else {
        mergedNotes[qId] = remote.examNotes![qId];
        if (rUpd > 1) mergedNotesUpdated[qId] = rUpd;
      }
    }
  }

  // 2. Merge examTags with per-question updatedAt & deletion tombstones
  const mergedTags: Record<string, ExamQuestionTagState> = {};
  const mergedTagsDeleted: Record<string, number> = {};
  const allTagIds = new Set([
    ...Object.keys(local.examTags || {}),
    ...Object.keys(remote.examTags || {}),
    ...Object.keys(local.examTagsDeletedAt || {}),
    ...Object.keys(remote.examTagsDeletedAt || {}),
  ]);
  for (const qId of allTagIds) {
    const lTg = local.examTags?.[qId];
    const rTg = remote.examTags?.[qId];
    const lHas = Boolean(lTg && (lTg.difficulty || (lTg.tags && lTg.tags.length > 0)));
    const rHas = Boolean(rTg && (rTg.difficulty || (rTg.tags && rTg.tags.length > 0)));
    const lTs = lHas ? Math.max(1, parseTagTs(lTg)) : 0;
    const rTs = rHas ? Math.max(1, parseTagTs(rTg)) : 0;
    const maxDel = Math.max(local.examTagsDeletedAt?.[qId] || 0, remote.examTagsDeletedAt?.[qId] || 0);
    const maxTs = Math.max(lTs, rTs);

    if (maxDel > 0) mergedTagsDeleted[qId] = maxDel;
    if (maxDel > maxTs) continue;
    if (lHas && !rHas) {
      mergedTags[qId] = lTg!;
    } else if (rHas && !lHas) {
      mergedTags[qId] = rTg!;
    } else if (lHas && rHas) {
      mergedTags[qId] = lTs >= rTs ? lTg! : rTg!;
    }
  }

  // 3. Merge examPrepHistory per question by updatedAt / attempts
  const mergedPrep: Record<string, ExamPrepRecord> = {};
  const allPrepIds = new Set([
    ...Object.keys(local.examPrepHistory || {}),
    ...Object.keys(remote.examPrepHistory || {}),
  ]);
  for (const qId of allPrepIds) {
    const lP = local.examPrepHistory?.[qId];
    const rP = remote.examPrepHistory?.[qId];
    if (lP && !rP) mergedPrep[qId] = lP;
    else if (rP && !lP) mergedPrep[qId] = rP;
    else if (lP && rP) {
      const newer = (lP.updatedAt || 0) >= (rP.updatedAt || 0) ? lP : rP;
      mergedPrep[qId] = {
        ...newer,
        attempts: Math.max(lP.attempts || 0, rP.attempts || 0),
        correctRuns: Math.max(lP.correctRuns || 0, rP.correctRuns || 0),
        wrongRuns: Math.max(lP.wrongRuns || 0, rP.wrongRuns || 0),
      };
    }
  }

  // 4. Merge article marks by timestamp
  const mergedMarks = { ...(remote.marks || {}) };
  for (const [k, v] of Object.entries(local.marks || {})) {
    if (!mergedMarks[k] || (v?.t || 0) >= (mergedMarks[k]?.t || 0)) {
      mergedMarks[k] = v;
    }
  }

  // Pick fresher planner schedule (days/sections) by _summary.updatedAt
  const localSchedTs = local._summary?.updatedAt ? new Date(local._summary.updatedAt).getTime() : 0;
  const remoteSchedTs = remote._summary?.updatedAt ? new Date(remote._summary.updatedAt).getTime() : 0;
  const baseSched = localSchedTs >= remoteSchedTs && (local.days?.length || local.subjectSections?.length || !remote.days?.length)
    ? local
    : remote;

  return {
    ...baseSched,
    subjects: baseSched.subjects?.length ? baseSched.subjects : remote.subjects?.length ? remote.subjects : local.subjects,
    marks: mergedMarks,
    examNotes: mergedNotes,
    examNotesUpdatedAt: mergedNotesUpdated,
    examNotesDeletedAt: mergedNotesDeleted,
    examTags: mergedTags,
    examTagsDeletedAt: mergedTagsDeleted,
    examPrepHistory: mergedPrep,
    _userEmail: local._userEmail || remote._userEmail,
    _lastAssignedAt: local._lastAssignedAt || remote._lastAssignedAt,
  };
}

export async function saveUserPlanner(
  userId: string,
  email: string | undefined,
  state: PlannerState,
  options: { mergeRemoteFirst?: boolean } = {}
): Promise<{ ok: boolean; state: PlannerState; error?: string }> {
  let next: PlannerState = { ...state, _userEmail: email || state._userEmail };

  const persistLocal = (s: PlannerState) => {
    try {
      localStorage.setItem(`planner_${userId}`, JSON.stringify(s));
      localStorage.setItem(`baraat_exam_notes_v1_${userId}`, JSON.stringify(s.examNotes || {}));
      localStorage.setItem(`baraat_exam_tags_v1_${userId}`, JSON.stringify(s.examTags || {}));
    } catch {
      // ignore storage quota
    }
  };

  persistLocal(next);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      localStorage.setItem(`baraat_planner_dirty_${userId}`, '1');
    } catch {
      // ignore
    }
    return { ok: false, state: next, error: 'offline' };
  }

  try {
    if (options.mergeRemoteFirst !== false) {
      const existing = await supabase.from('planner').select('data').eq('user_id', userId).maybeSingle();
      if (!existing.error && existing.data?.data) {
        next = mergePlannerStates(next, existing.data.data as PlannerState);
        next._userEmail = email || next._userEmail;
      }
    }

    const r = await supabase
      .from('planner')
      .upsert(
        {
          user_id: userId,
          data: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (r.error) {
      try {
        localStorage.setItem(`baraat_planner_dirty_${userId}`, '1');
      } catch {
        // ignore
      }
      return { ok: false, state: next, error: r.error.message };
    }

    persistLocal(next);
    try {
      localStorage.removeItem(`baraat_planner_dirty_${userId}`);
    } catch {
      // ignore
    }
    return { ok: true, state: next };
  } catch (err) {
    try {
      localStorage.setItem(`baraat_planner_dirty_${userId}`, '1');
    } catch {
      // ignore
    }
    return { ok: false, state: next, error: err instanceof Error ? err.message : 'network_error' };
  }
}

export async function loadUserPlanner(userId: string, email?: string): Promise<{ state: PlannerState | null; needsPush: boolean }> {
  let localState: PlannerState | null = null;
  try {
    const localRaw = localStorage.getItem(`planner_${userId}`);
    if (localRaw) localState = JSON.parse(localRaw) as PlannerState;
  } catch {
    localState = null;
  }

  // Also gather legacy per-user localStorage notes/tags & any guest notes/tags waiting to migrate
  const readJson = <T,>(k: string): T | null => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const legacyUserNotes = readJson<Record<string, string>>(`baraat_exam_notes_v1_${userId}`) || {};
  const legacyUserTags = readJson<Record<string, ExamQuestionTagState>>(`baraat_exam_tags_v1_${userId}`) || {};
  const guestNotes = readJson<Record<string, string>>('baraat_exam_notes_v1_guest') || {};
  const guestTags = readJson<Record<string, ExamQuestionTagState>>('baraat_exam_tags_v1_guest') || {};
  const guestPrep = readJson<Record<string, ExamPrepRecord>>('baraat_exam_prep_v1_guest') || {};
  const wasDirty = (() => {
    try {
      return localStorage.getItem(`baraat_planner_dirty_${userId}`) === '1';
    } catch {
      return false;
    }
  })();

  const hasGuestData =
    Object.keys(guestNotes).length > 0 ||
    Object.keys(guestTags).length > 0 ||
    Object.keys(guestPrep).length > 0;

  let remoteState: PlannerState | null = null;
  try {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      const r = await supabase.from('planner').select('data').eq('user_id', userId).maybeSingle();
      if (!r.error && r.data?.data) {
        remoteState = r.data.data as PlannerState;
      }
    }
  } catch {
    remoteState = null;
  }

  // Build combined local snapshot (preserving legacy & guest notes/tags so PWA local notes never vanish)
  const localCombined: PlannerState | null =
    localState || Object.keys(legacyUserNotes).length > 0 || Object.keys(legacyUserTags).length > 0 || hasGuestData
      ? {
          subjects: localState?.subjects || [],
          days: localState?.days || [],
          subjectSections: localState?.subjectSections || [],
          marks: localState?.marks || {},
          imports: localState?.imports || [],
          ...localState,
          examNotes: {
            ...guestNotes,
            ...legacyUserNotes,
            ...(localState?.examNotes || {}),
          },
          examTags: {
            ...guestTags,
            ...legacyUserTags,
            ...(localState?.examTags || {}),
          },
          examPrepHistory: {
            ...guestPrep,
            ...(localState?.examPrepHistory || {}),
          },
        }
      : null;

  let merged: PlannerState | null = null;
  if (localCombined && remoteState) {
    merged = mergePlannerStates(localCombined, remoteState);
  } else {
    merged = remoteState || localCombined;
  }

  let needsPush = wasDirty || hasGuestData;
  if (merged && !remoteState && localCombined) {
    needsPush = true;
  } else if (merged && remoteState) {
    // Check if merged has notes/tags/prep that remote didn't have yet (e.g. stuck on PWA before!)
    const rNotes = remoteState.examNotes || {};
    const mNotes = merged.examNotes || {};
    for (const [k, v] of Object.entries(mNotes)) {
      if (v && rNotes[k] !== v) {
        needsPush = true;
        break;
      }
    }
    if (!needsPush) {
      const rTags = remoteState.examTags || {};
      const mTags = merged.examTags || {};
      for (const [k, v] of Object.entries(mTags)) {
        if (JSON.stringify(rTags[k] || null) !== JSON.stringify(v || null)) {
          needsPush = true;
          break;
        }
      }
    }
    if (!needsPush) {
      const rPrep = remoteState.examPrepHistory || {};
      const mPrep = merged.examPrepHistory || {};
      for (const [k, v] of Object.entries(mPrep)) {
        if ((rPrep[k]?.updatedAt || 0) < (v?.updatedAt || 0)) {
          needsPush = true;
          break;
        }
      }
    }
  }

  // Check if admin assigned a plan update for this user email (preserve notes, tags, AND prep history!)
  if (merged && email && (typeof navigator === 'undefined' || navigator.onLine)) {
    try {
      const ar = await supabase.from('meta').select('value').eq('key', META_KEYS.ASSIGNED_PLANS).maybeSingle();
      if (ar.data?.value) {
        const map = parseMetaVal<Record<string, AssignedPlanEntry>>(ar.data.value, {});
        const entry = map[email.trim().toLowerCase()];
        if (entry && entry.updatedAt && merged._lastAssignedAt !== entry.updatedAt && entry.jsonState) {
          merged = {
            ...entry.jsonState,
            examNotes: merged.examNotes,
            examNotesUpdatedAt: merged.examNotesUpdatedAt,
            examNotesDeletedAt: merged.examNotesDeletedAt,
            examTags: merged.examTags,
            examTagsDeletedAt: merged.examTagsDeletedAt,
            examPrepHistory: merged.examPrepHistory,
            marks: merged.marks,
            _userEmail: email,
            _lastAssignedAt: entry.updatedAt,
          };
          needsPush = true;
        }
      }
    } catch {
      // ignore offline
    }
  }

  if (merged) {
    try {
      localStorage.setItem(`planner_${userId}`, JSON.stringify(merged));
      localStorage.setItem(`baraat_exam_notes_v1_${userId}`, JSON.stringify(merged.examNotes || {}));
      localStorage.setItem(`baraat_exam_tags_v1_${userId}`, JSON.stringify(merged.examTags || {}));
    } catch {
      // ignore
    }
  }

  if (needsPush && merged) {
    const pushRes = await saveUserPlanner(userId, email, merged, { mergeRemoteFirst: false });
    if (pushRes.ok && hasGuestData) {
      try {
        localStorage.removeItem('baraat_exam_notes_v1_guest');
        localStorage.removeItem('baraat_exam_tags_v1_guest');
        localStorage.removeItem('baraat_exam_prep_v1_guest');
      } catch {
        // ignore
      }
    }
    return { state: pushRes.state, needsPush: !pushRes.ok };
  }

  return { state: merged, needsPush: false };
}

export async function appendExamAttemptToServer(
  attempt: ExamAttemptResult,
  fallbackList: ExamAttemptResult[]
): Promise<{ list: ExamAttemptResult[]; synced: boolean }> {
  let latest = fallbackList;
  try {
    const res = await supabase.from('meta').select('value').eq('key', META_KEYS.EXAM_ATTEMPTS).maybeSingle();
    if (res.data?.value) {
      const parsed = parseMetaVal<ExamAttemptResult[]>(res.data.value, fallbackList);
      if (Array.isArray(parsed)) latest = parsed;
    }
  } catch {
    // fallback to current list
  }
  const merged = [attempt, ...latest.filter((x) => x.id !== attempt.id)].slice(0, 300);
  try {
    localStorage.setItem(META_KEYS.EXAM_ATTEMPTS, JSON.stringify(merged));
  } catch {
    // ignore
  }
  const saveRes = await upsertMetaKey(META_KEYS.EXAM_ATTEMPTS, merged);
  return { list: merged, synced: saveRes.ok };
}

export async function deleteExamAttemptFromServer(
  attemptId: string,
  fallbackList: ExamAttemptResult[]
): Promise<{ list: ExamAttemptResult[]; ok: boolean; error?: string }> {
  let latest = fallbackList;
  try {
    const res = await supabase.from('meta').select('value').eq('key', META_KEYS.EXAM_ATTEMPTS).maybeSingle();
    if (res.data?.value) {
      const parsed = parseMetaVal<ExamAttemptResult[]>(res.data.value, fallbackList);
      if (Array.isArray(parsed)) latest = parsed;
    }
  } catch {
    // use fallback
  }
  const filtered = latest.filter((x) => x.id !== attemptId);
  const saveRes = await upsertMetaKey(META_KEYS.EXAM_ATTEMPTS, filtered);
  if (saveRes.ok) {
    try {
      localStorage.setItem(META_KEYS.EXAM_ATTEMPTS, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }
  return { list: saveRes.ok ? filtered : latest, ok: saveRes.ok, error: saveRes.error };
}
