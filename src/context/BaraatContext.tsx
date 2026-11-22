import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
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
  ExamAttemptResult,
  ExamQuestionTagState,
  QuestionReplyItem,
  PlannerState,
  StudySubject,
  VipSettings,
  VipSubscriber,
} from '../types';
import {
  supabase,
  fetchFullLawDatabase,
  checkRemoteLawVer,
  fetchSiteMetaFromSupabase,
  loadLocalSiteMeta,
  checkIsAdmin,
  loadUserPlanner,
  saveUserPlanner,
  upsertMetaKey,
  saveExamsSplitToSupabase,
  appendExamAttemptToServer,
  deleteExamAttemptFromServer,
  META_KEYS,
  DEFAULT_VIP_SETTINGS,
} from '../services/supabase';
import { DEFAULT_DEADLINES, DEFAULT_CUSTOM_CALCS, DEFAULT_ABOUT, DEFAULT_CONTACT } from '../utils/legal';

const THEME_KEY = 'baraat_theme_v1';

const DEFAULT_SUBJECTS: StudySubject[] = [
  { id: 'sub_civil', name: 'حقوق مدنی', laws: [{ name: 'قانون مدنی', count: 1335, unit: 'ماده', db: 'قانون مدنی' }, { name: 'قانون مسئولیت مدنی', count: 16, unit: 'ماده', db: 'قانون مسئولیت مدنی' }] },
  { id: 'sub_civ_proc', name: 'آیین دادرسی مدنی', laws: [{ name: 'قانون آیین دادرسی مدنی', count: 526, unit: 'ماده', db: 'آیین دادرسی مدنی' }, { name: 'قانون اجرای احکام مدنی', count: 180, unit: 'ماده', db: 'قانون اجرای احکام مدنی' }] },
  { id: 'sub_commerce', name: 'حقوق تجارت', laws: [{ name: 'قانون تجارت', count: 526, unit: 'ماده', db: 'قانون تجارت' }, { name: 'لایحه اصلاحی قانون تجارت', count: 300, unit: 'ماده', db: 'لایحه اصلاحی قانون تجارت' }, { name: 'قانون صدور چک', count: 26, unit: 'ماده', db: 'قانون صدور چک' }] },
  { id: 'sub_crim_gen', name: 'حقوق جزای عمومی', laws: [{ name: 'قانون مجازات اسلامی — بخش عمومی', count: 216, unit: 'ماده', db: 'قانون مجازات اسلامی', min: 1, max: 216 }] },
  { id: 'sub_crim_spec', name: 'حقوق جزای اختصاصی', laws: [{ name: 'قانون مجازات اسلامی — حدود و تعزیرات', count: 730, unit: 'ماده', db: 'قانون مجازات اسلامی', min: 217 }] },
  { id: 'sub_crim_proc', name: 'آیین دادرسی کیفری', laws: [{ name: 'قانون آیین دادرسی کیفری', count: 699, unit: 'ماده', db: 'آیین دادرسی کیفری' }] },
];

export const EMPTY_PLANNER: PlannerState = {
  subjects: DEFAULT_SUBJECTS,
  days: [],
  subjectSections: [],
  marks: {},
  imports: [],
};

interface BaraatContextValue {
  laws: Law[];
  articles: Article[];
  decisions: Decision[];
  dbLoading: boolean;
  dbError: boolean;
  reloadLawDb: (force?: boolean) => Promise<void>;

  journalArticles: JournalArticle[];
  setJournalArticles: (list: JournalArticle[]) => Promise<void>;
  deadlines: DeadlineItem[];
  setDeadlines: (list: DeadlineItem[]) => Promise<void>;
  customCalcs: CustomCalculator[];
  setCustomCalcs: (list: CustomCalculator[]) => Promise<void>;
  about: AboutInfo;
  setAbout: (val: AboutInfo) => Promise<void>;
  contact: ContactInfo;
  setContact: (val: ContactInfo) => Promise<void>;
  exams: LegalExam[];
  setExams: (list: LegalExam[]) => Promise<void>;
  examAttempts: ExamAttemptResult[];
  recordExamAttempt: (attempt: ExamAttemptResult) => Promise<void>;
  deleteExamAttempt: (attemptId: string) => Promise<void>;
  examNotes: Record<string, string>;
  saveExamNote: (questionId: string, note: string) => Promise<void>;
  examTags: Record<string, ExamQuestionTagState>;
  saveExamTag: (questionId: string, tagState: ExamQuestionTagState | null) => Promise<void>;
  questions: Record<string, QuestionReplyItem>;
  setQuestions: (map: Record<string, QuestionReplyItem>) => Promise<void>;
  vipSettings: VipSettings;
  setVipSettings: (val: VipSettings) => Promise<void>;
  refreshMeta: () => Promise<void>;

  user: User | null;
  isAdmin: boolean;
  isVip: boolean;
  hasVipAccess: boolean;
  vipInfo: VipSubscriber | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  logout: () => Promise<void>;

  planner: PlannerState;
  updatePlanner: (next: PlannerState) => Promise<void>;
  toggleArticleMark: (law: string, numText: string, note?: string) => Promise<void>;

  theme: 'light' | 'dark';
  toggleTheme: () => void;

  toastMsg: string | null;
  showToast: (msg: string) => void;
}

const BaraatContext = createContext<BaraatContextValue | null>(null);

export const BaraatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocal = loadLocalSiteMeta();

  const [laws, setLaws] = useState<Law[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const [journalArticles, setJournalState] = useState<JournalArticle[]>(initialLocal.articles);
  const [deadlines, setDeadlinesState] = useState<DeadlineItem[]>(
    initialLocal.deadlines.length ? initialLocal.deadlines : DEFAULT_DEADLINES
  );
  const [customCalcs, setCustomCalcsState] = useState<CustomCalculator[]>(
    initialLocal.customCalcs.length ? initialLocal.customCalcs : DEFAULT_CUSTOM_CALCS
  );
  const [about, setAboutState] = useState<AboutInfo>(initialLocal.about || DEFAULT_ABOUT);
  const [contact, setContactState] = useState<ContactInfo>(initialLocal.contact || DEFAULT_CONTACT);
  const [exams, setExamsState] = useState<LegalExam[]>(initialLocal.exams);
  const [examAttempts, setExamAttemptsState] = useState<ExamAttemptResult[]>(initialLocal.examAttempts);
  const [questions, setQuestionsState] = useState<Record<string, QuestionReplyItem>>(initialLocal.questions);
  const [vipSettings, setVipSettingsState] = useState<VipSettings>(initialLocal.vipSettings || DEFAULT_VIP_SETTINGS);

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [planner, setPlanner] = useState<PlannerState>(EMPTY_PLANNER);
  const [guestNotes, setGuestNotes] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('baraat_exam_notes_v1_guest');
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [guestTags, setGuestTags] = useState<Record<string, ExamQuestionTagState>>(() => {
    try {
      const raw = localStorage.getItem('baraat_exam_tags_v1_guest');
      return raw ? (JSON.parse(raw) as Record<string, ExamQuestionTagState>) : {};
    } catch {
      return {};
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.dataset.theme = 'dark';
    } else {
      root.classList.remove('dark');
      root.dataset.theme = 'light';
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b111a' : '#faf9f6');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const reloadLawDb = useCallback(async (force = false) => {
    setDbLoading(true);
    setDbError(false);
    try {
      const bundle = await fetchFullLawDatabase(force);
      setLaws(bundle.laws);
      setArticles(bundle.articles);
      setDecisions(bundle.decisions);
      if (!force && navigator.onLine && bundle.ver) {
        const remoteVer = await checkRemoteLawVer();
        if (remoteVer && remoteVer !== bundle.ver) {
          const fresh = await fetchFullLawDatabase(true);
          setLaws(fresh.laws);
          setArticles(fresh.articles);
          setDecisions(fresh.decisions);
        }
      }
    } catch {
      setDbError(true);
    } finally {
      setDbLoading(false);
    }
  }, []);

  const refreshMeta = useCallback(async (adminOverride?: boolean) => {
    try {
      const effectiveAdmin = typeof adminOverride === 'boolean' ? adminOverride : isAdmin;
      const meta = await fetchSiteMetaFromSupabase(effectiveAdmin);
      setJournalState(meta.articles);
      if (meta.deadlines.length) setDeadlinesState(meta.deadlines);
      if (meta.customCalcs.length) setCustomCalcsState(meta.customCalcs);
      if (meta.about) setAboutState(meta.about);
      if (meta.contact) setContactState(meta.contact);
      setExamsState(meta.exams);
      setExamAttemptsState(meta.examAttempts);
      setQuestionsState(meta.questions);
      if (meta.vipSettings) setVipSettingsState(meta.vipSettings);
    } catch {
      // offline fallback remains active
    }
  }, [isAdmin]);

  const syncAuthUser = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) {
      setIsAdmin(false);
      setPlanner(EMPTY_PLANNER);
      setExamsState((prev) => prev.filter((e) => e.isPublished !== false));
      try {
        localStorage.removeItem(META_KEYS.EXAMS_PRIVATE);
      } catch {
        // ignore
      }
      return;
    }
    const adm = await checkIsAdmin(u.id);
    setIsAdmin(adm);
    if (adm) {
      refreshMeta(true);
    } else {
      setExamsState((prev) => prev.filter((e) => e.isPublished !== false));
      try {
        localStorage.removeItem(META_KEYS.EXAMS_PRIVATE);
      } catch {
        // ignore
      }
    }
    const loadedPlanner = await loadUserPlanner(u.id, u.email);
    let userNotes: Record<string, string> = {};
    let userTags: Record<string, ExamQuestionTagState> = {};
    try {
      const raw = localStorage.getItem(`baraat_exam_notes_v1_${u.id}`);
      if (raw) userNotes = JSON.parse(raw) as Record<string, string>;
    } catch {
      // ignore
    }
    try {
      const rawT = localStorage.getItem(`baraat_exam_tags_v1_${u.id}`);
      if (rawT) userTags = JSON.parse(rawT) as Record<string, ExamQuestionTagState>;
    } catch {
      // ignore
    }
    if (loadedPlanner) {
      setPlanner({
        ...loadedPlanner,
        examNotes: { ...userNotes, ...(loadedPlanner.examNotes || {}) },
        examTags: { ...userTags, ...(loadedPlanner.examTags || {}) },
      });
    } else {
      setPlanner({ ...EMPTY_PLANNER, _userEmail: u.email, examNotes: userNotes, examTags: userTags });
    }
  }, [refreshMeta]);

  useEffect(() => {
    reloadLawDb(false);
    refreshMeta(false);

    supabase.auth.getSession().then(({ data }) => {
      syncAuthUser(data?.session?.user || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      syncAuthUser(session?.user || null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [reloadLawDb, refreshMeta, syncAuthUser]);

  const setJournalArticles = useCallback(async (list: JournalArticle[]) => {
    setJournalState(list);
    const res = await upsertMetaKey(META_KEYS.ARTICLES, list);
    showToast(res.ok ? 'مقالات در سرور ذخیره شد.' : `ذخیره محلی انجام شد: ${res.error}`);
  }, [showToast]);

  const setDeadlines = useCallback(async (list: DeadlineItem[]) => {
    setDeadlinesState(list);
    const res = await upsertMetaKey(META_KEYS.DEADLINES, list);
    showToast(res.ok ? 'مواعد قانونی به‌روزرسانی شد.' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const setCustomCalcs = useCallback(async (list: CustomCalculator[]) => {
    setCustomCalcsState(list);
    const res = await upsertMetaKey(META_KEYS.CALCS, list);
    showToast(res.ok ? 'محاسبه‌گرها ذخیره شد.' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const setAbout = useCallback(async (val: AboutInfo) => {
    setAboutState(val);
    const res = await upsertMetaKey(META_KEYS.ABOUT, val);
    showToast(res.ok ? 'اطلاعات درباره ما ذخیره شد.' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const setContact = useCallback(async (val: ContactInfo) => {
    setContactState(val);
    const res = await upsertMetaKey(META_KEYS.CONTACT, val);
    showToast(res.ok ? 'اطلاعات تماس ذخیره شد.' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const setExams = useCallback(async (list: LegalExam[]) => {
    setExamsState(list);
    const res = await saveExamsSplitToSupabase(list);
    showToast(res.ok ? 'آزمون‌ها ذخیره شد (آزمون‌های مخفی فقط برای مدیر).' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const recordExamAttempt = useCallback(async (attempt: ExamAttemptResult) => {
    const res = await appendExamAttemptToServer(attempt, examAttempts);
    setExamAttemptsState(res.list);
  }, [examAttempts]);

  const deleteExamAttempt = useCallback(async (attemptId: string) => {
    if (!isAdmin) {
      showToast('فقط مدیر سامانه مجاز به حذف نتایج آزمون است.');
      return;
    }
    const res = await deleteExamAttemptFromServer(attemptId, examAttempts);
    setExamAttemptsState(res.list);
    showToast(res.ok ? 'نتیجه آزمون توسط مدیر حذف شد (نکات دانشجویان محفوظ ماند).' : `خطا در حذف نتیجه: ${res.error}`);
  }, [isAdmin, examAttempts, showToast]);

  const setQuestions = useCallback(async (map: Record<string, QuestionReplyItem>) => {
    setQuestionsState(map);
    const res = await upsertMetaKey(META_KEYS.QUESTIONS, map);
    showToast(res.ok ? 'پیام در سرور ثبت شد.' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const setVipSettings = useCallback(async (val: VipSettings) => {
    setVipSettingsState(val);
    const res = await upsertMetaKey(META_KEYS.VIP_SUBSCRIPTIONS, val);
    showToast(res.ok ? 'تنظیمات اشتراک ویژه در سرور ذخیره شد.' : `خطا در سرور: ${res.error}`);
  }, [showToast]);

  const vipInfo = useMemo<VipSubscriber | null>(() => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return null;
    const found = (vipSettings.subscribers || []).find(
      (s) => s && s.email?.trim().toLowerCase() === email && s.active !== false
    );
    if (!found) return null;
    if (found.expiresAt) {
      const expTs = new Date(found.expiresAt).getTime();
      if (!Number.isNaN(expTs) && expTs < Date.now()) return null;
    }
    return found;
  }, [user, vipSettings]);

  const isVip = Boolean(vipInfo);
  const hasVipAccess = isAdmin || isVip;

  const updatePlanner = useCallback(async (next: PlannerState) => {
    setPlanner(next);
    if (user) {
      await saveUserPlanner(user.id, user.email, next);
    }
  }, [user]);

  const examNotes = user ? (planner.examNotes || {}) : guestNotes;
  const examTags = user ? (planner.examTags || {}) : guestTags;

  const saveExamNote = useCallback(async (questionId: string, note: string) => {
    const trimmed = note;
    if (user) {
      const nextNotes = { ...(planner.examNotes || {}) };
      if (trimmed.trim()) nextNotes[questionId] = trimmed;
      else delete nextNotes[questionId];
      try {
        localStorage.setItem(`baraat_exam_notes_v1_${user.id}`, JSON.stringify(nextNotes));
      } catch {
        // ignore
      }
      await updatePlanner({ ...planner, examNotes: nextNotes });
      showToast('نکته شخصی شما زیر سوال ذخیره شد.');
    } else {
      const nextNotes = { ...guestNotes };
      if (trimmed.trim()) nextNotes[questionId] = trimmed;
      else delete nextNotes[questionId];
      setGuestNotes(nextNotes);
      try {
        localStorage.setItem('baraat_exam_notes_v1_guest', JSON.stringify(nextNotes));
      } catch {
        // ignore
      }
      showToast('نکته روی این دستگاه ذخیره شد (برای همگام‌سازی همیشگی وارد حساب شوید).');
    }
  }, [user, planner, guestNotes, updatePlanner, showToast]);

  const saveExamTag = useCallback(async (questionId: string, tagState: ExamQuestionTagState | null) => {
    const hasAny = Boolean(tagState && (tagState.difficulty || (tagState.tags && tagState.tags.length > 0)));
    if (user) {
      const nextTags = { ...(planner.examTags || {}) };
      if (hasAny && tagState) {
        nextTags[questionId] = { ...tagState, updatedAt: new Date().toISOString() };
      } else {
        delete nextTags[questionId];
      }
      try {
        localStorage.setItem(`baraat_exam_tags_v1_${user.id}`, JSON.stringify(nextTags));
      } catch {
        // ignore
      }
      await updatePlanner({ ...planner, examTags: nextTags });
    } else {
      const nextTags = { ...guestTags };
      if (hasAny && tagState) {
        nextTags[questionId] = { ...tagState, updatedAt: new Date().toISOString() };
      } else {
        delete nextTags[questionId];
      }
      setGuestTags(nextTags);
      try {
        localStorage.setItem('baraat_exam_tags_v1_guest', JSON.stringify(nextTags));
      } catch {
        // ignore
      }
    }
  }, [user, planner, guestTags, updatePlanner]);

  const toggleArticleMark = useCallback(async (law: string, numText: string, note?: string) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    const key = `${law}|${numText}`;
    const marks = { ...(planner.marks || {}) };
    if (note !== undefined) {
      marks[key] = { note, t: Date.now() };
    } else if (marks[key]) {
      delete marks[key];
    } else {
      marks[key] = { note: '', t: Date.now() };
    }
    const next = { ...planner, marks };
    await updatePlanner(next);
  }, [user, planner, updatePlanner]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setPlanner(EMPTY_PLANNER);
    setExamsState((prev) => prev.filter((e) => e.isPublished !== false));
    try {
      localStorage.removeItem(META_KEYS.EXAMS_PRIVATE);
    } catch {
      // ignore
    }
    showToast('از حساب کاربری خارج شدید.');
  }, [showToast]);

  return (
    <BaraatContext.Provider
      value={{
        laws,
        articles,
        decisions,
        dbLoading,
        dbError,
        reloadLawDb,
        journalArticles,
        setJournalArticles,
        deadlines,
        setDeadlines,
        customCalcs,
        setCustomCalcs,
        about,
        setAbout,
        contact,
        setContact,
        exams,
        setExams,
        examAttempts,
        recordExamAttempt,
        deleteExamAttempt,
        examNotes,
        saveExamNote,
        examTags,
        saveExamTag,
        questions,
        setQuestions,
        vipSettings,
        setVipSettings,
        refreshMeta,
        user,
        isAdmin,
        isVip,
        hasVipAccess,
        vipInfo,
        openAuthModal: () => setAuthModalOpen(true),
        closeAuthModal: () => setAuthModalOpen(false),
        authModalOpen,
        logout,
        planner,
        updatePlanner,
        toggleArticleMark,
        theme,
        toggleTheme,
        toastMsg,
        showToast,
      }}
    >
      {children}
    </BaraatContext.Provider>
  );
};

export function useBaraat() {
  const ctx = useContext(BaraatContext);
  if (!ctx) throw new Error('useBaraat must be used inside BaraatProvider');
  return ctx;
}
