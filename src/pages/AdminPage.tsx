import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Database,
  FileSpreadsheet,
  Newspaper,
  Calculator,
  ClipboardList,
  Users,
  Settings,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Download,
  Search,
  ListChecks,
  ArrowRight,
  Lock,
  Mail,
  Copy,
  Check,
  Tag,
  Pencil,
  Save,
  X,
  Crown,
} from 'lucide-react';
import { useBaraat } from '../context/BaraatContext';
import type {
  DeadlineItem,
  CustomCalculator,
  LegalExam,
  ExamQuestion,
  ExamQuestionTagState,
  PlannerState,
  AssignedPlanEntry,
  VipSubscriber,
} from '../types';
import {
  supabase,
  bumpLawVersion,
  ensureLawRecord,
  importLawArticles,
  importDecisionsList,
  upsertMetaKey,
  META_KEYS,
} from '../services/supabase';
import {
  toFa,
  toEn,
  DEFAULT_DEADLINES,
  DEFAULT_CUSTOM_CALCS,
  parseLawSpreadsheetFile,
  parseDecisionsSpreadsheetFile,
  parseExamSpreadsheetFile,
  createSampleExamCsv,
  buildQuestionSourceLabel,
  formatAdminCsvQuestionRef,
  calcExamDurationMin,
  compressImageFile,
} from '../utils/legal';
import { updateDocumentSeo } from '../utils/seo';

type AdminTab = 'exams' | 'laws' | 'articles' | 'tools' | 'students' | 'settings';
type ExamSubTab = 'list' | 'import' | 'subscriptions' | 'attempts' | 'tags' | 'security';
type LawSubTab = 'list' | 'import' | 'single';
type ArticleSubTab = 'list' | 'create';
type ToolSubTab = 'deadlines' | 'calcs';
type StudentSubTab = 'qa' | 'progress' | 'assign';
type SettingSubTab = 'site' | 'email';

const OPTION_LETTERS = ['الف', 'ب', 'ج', 'د'];

const RLS_SQL_SNIPPET = `ALTER TABLE public.meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lock_private_exams_meta" ON public.meta;
CREATE POLICY "lock_private_exams_meta" ON public.meta
AS RESTRICTIVE
FOR ALL
TO public
USING (
  key <> 'baraat_exams_private_v1'
  OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid())
)
WITH CHECK (
  key <> 'baraat_exams_private_v1'
  OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid())
);`;

export const AdminPage: React.FC = () => {
  const {
    user,
    isAdmin,
    openAuthModal,
    laws,
    articles,
    decisions,
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
    deleteExamAttempt,
    questions,
    setQuestions,
    vipSettings,
    setVipSettings,
    showToast,
  } = useBaraat();

  // Primary & secondary navigation
  const [tab, setTab] = useState<AdminTab>('exams');
  const [examSubTab, setExamSubTab] = useState<ExamSubTab>('list');
  const [examCreateMode, setExamCreateMode] = useState<'file' | 'json'>('file');
  const [lawSubTab, setLawSubTab] = useState<LawSubTab>('list');
  const [articleSubTab, setArticleSubTab] = useState<ArticleSubTab>('list');
  const [toolSubTab, setToolSubTab] = useState<ToolSubTab>('deadlines');
  const [studentSubTab, setStudentSubTab] = useState<StudentSubTab>('qa');
  const [settingSubTab, setSettingSubTab] = useState<SettingSubTab>('site');

  // Exam inspector (admin-only CSV row/number viewer)
  const [inspectedExamId, setInspectedExamId] = useState<string | null>(null);
  const [inspectSubjectId, setInspectSubjectId] = useState<string>('all');
  const [inspectSearch, setInspectSearch] = useState('');
  const [examListSearch, setExamListSearch] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  // Laws & Decisions import state
  const [lawListSearch, setLawListSearch] = useState('');
  const [lawImportName, setLawImportName] = useState('');
  const [lawImportReplace, setLawImportReplace] = useState(true);
  const [lawImporting, setLawImporting] = useState(false);
  const [lawImportProgress, setLawImportProgress] = useState('');

  // Single article add
  const [singleLaw, setSingleLaw] = useState('');
  const [singleNum, setSingleNum] = useState('');
  const [singlePath, setSinglePath] = useState('');
  const [singleText, setSingleText] = useState('');

  // Quick journal article form
  const [jaTitle, setJaTitle] = useState('');
  const [jaCat, setJaCat] = useState('حقوق مدنی');
  const [jaAuthor, setJaAuthor] = useState('هیئت تحریریه برائت');
  const [jaAbstract, setJaAbstract] = useState('');
  const [jaContent, setJaContent] = useState('');
  const [jaCover, setJaCover] = useState('');
  const [jaFeatured, setJaFeatured] = useState(false);

  // Deadlines & Calcs forms
  const [dlTitle, setDlTitle] = useState('');
  const [dlLaw, setDlLaw] = useState('');
  const [dlIran, setDlIran] = useState(20);
  const [dlAbroad, setDlAbroad] = useState(60);
  const [dlCat, setDlCat] = useState('مدنی');
  const [dlDesc, setDlDesc] = useState('');

  const [ccTitle, setCcTitle] = useState('');
  const [ccType, setCcType] = useState<'percent' | 'daily' | 'fixed'>('percent');
  const [ccRate, setCcRate] = useState(1.5);
  const [ccDesc, setCcDesc] = useState('');

  // Exam creator state
  const [exTitle, setExTitle] = useState('');
  const [exCategory, setExCategory] = useState('');
  const [exType, setExType] = useState('');
  const [exYear, setExYear] = useState('');
  const [exDesc, setExDesc] = useState('');
  const [exSubjectName, setExSubjectName] = useState('');
  const [exIsPublished, setExIsPublished] = useState(true);
  const [exIsPremium, setExIsPremium] = useState(false);
  const [exQuestionsJson, setExQuestionsJson] = useState('');
  const [exImporting, setExImporting] = useState(false);
  const [attemptFilter, setAttemptFilter] = useState('');
  const [tagFilterType, setTagFilterType] = useState<string>('all');
  const [tagFilterStudent, setTagFilterStudent] = useState<string>('');

  // Single-question inline editor state
  const [editingQuestionKey, setEditingQuestionKey] = useState<string | null>(null);
  const [editQDraft, setEditQDraft] = useState<{
    q: string;
    options: [string, string, string, string];
    answer: number;
    exp: string;
    chapter: string;
    sourceLabel: string;
  }>({
    q: '',
    options: ['', '', '', ''],
    answer: 0,
    exp: '',
    chapter: '',
    sourceLabel: '',
  });
  const [addingQOpen, setAddingQOpen] = useState(false);
  const [newQSubjectId, setNewQSubjectId] = useState('');
  const [newQDraft, setNewQDraft] = useState<{
    q: string;
    options: [string, string, string, string];
    answer: number;
    exp: string;
    chapter: string;
    sourceLabel: string;
  }>({
    q: '',
    options: ['', '', '', ''],
    answer: 0,
    exp: '',
    chapter: '',
    sourceLabel: '',
  });

  // VIP subscription management state
  const [vipEmail, setVipEmail] = useState('');
  const [vipName, setVipName] = useState('');
  const [vipDurationDays, setVipDurationDays] = useState<'30' | '90' | '180' | '365' | 'lifetime'>('30');
  const [vipNote, setVipNote] = useState('');
  const [vipSearch, setVipSearch] = useState('');
  const [vipMsgDraft, setVipMsgDraft] = useState(vipSettings.upgradeMessage || '');
  const [vipSupportDraft, setVipSupportDraft] = useState(vipSettings.supportContact || '');

  useEffect(() => {
    setVipMsgDraft(vipSettings.upgradeMessage || '');
    setVipSupportDraft(vipSettings.supportContact || '');
  }, [vipSettings.upgradeMessage, vipSettings.supportContact]);

  // QA reply + Student progress + Assign plan + About/Contact
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [studentRows, setStudentRows] = useState<
    Array<{
      user_id: string;
      email?: string;
      pct?: number;
      totalBlocks?: number;
      updated_at?: string;
      examTags?: Record<string, ExamQuestionTagState>;
    }>
  >([]);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignJson, setAssignJson] = useState('');
  const [aboutTitle, setAboutTitle] = useState(about.title);
  const [aboutMission, setAboutMission] = useState(about.mission);
  const [contactPhone, setContactPhone] = useState(contact.phone);
  const [contactMobile, setContactMobile] = useState(contact.mobile);
  const [contactEmail, setContactEmail] = useState(contact.email);
  const [contactAddress, setContactAddress] = useState(contact.address);

  useEffect(() => {
    updateDocumentSeo({
      title: 'پنل مدیریت سامانه | گروه حقوقی برائت',
      description: 'مدیریت بانک قوانین، مقالات نشریه، آزمون‌ها و تنظیمات گروه حقوقی برائت.',
      canonicalPath: '/admin',
    });
  }, []);

  useEffect(() => {
    if (!isAdmin || (tab !== 'students' && tab !== 'exams')) return;
    supabase
      .from('planner')
      .select('user_id,data,updated_at')
      .order('updated_at', { ascending: false })
      .limit(100)
      .then((res) => {
        if (res.data) {
          setStudentRows(
            res.data.map((r) => {
              const d = (r.data || {}) as PlannerState;
              return {
                user_id: r.user_id,
                email: d._userEmail,
                pct: d._summary?.pct ?? 0,
                totalBlocks: d._summary?.totalBlocks ?? 0,
                updated_at: r.updated_at,
                examTags: d.examTags && typeof d.examTags === 'object' ? d.examTags : {},
              };
            })
          );
        }
      });
  }, [isAdmin, tab]);

  // Quick lookup from questionId -> CSV metadata for admin tags view
  const questionCsvLookup = useMemo(() => {
    const map = new Map<
      string,
      { csvQuestionNum?: string; csvRowIndex?: number; csvFileName?: string; globalIdx: number }
    >();
    exams.forEach((ex) => {
      let idx = 0;
      ex.subjects.forEach((sb) => {
        sb.questions.forEach((q) => {
          idx += 1;
          map.set(q.id, {
            csvQuestionNum: q.csvQuestionNum,
            csvRowIndex: q.csvRowIndex,
            csvFileName: q.csvFileName,
            globalIdx: idx,
          });
        });
      });
    });
    return map;
  }, [exams]);

  const pendingQaCount = useMemo(
    () => Object.values(questions).filter((q) => !q.reply).length,
    [questions]
  );

  const inspectedExam = useMemo(
    () => (inspectedExamId ? exams.find((e) => e.id === inspectedExamId) || null : null),
    [exams, inspectedExamId]
  );

  const inspectedQuestions = useMemo(() => {
    if (!inspectedExam) return [];
    const list: Array<{
      q: ExamQuestion;
      subjectId: string;
      subjectName: string;
      localIdx: number;
      globalIdx: number;
    }> = [];
    let globalIdx = 0;
    inspectedExam.subjects.forEach((sb) => {
      sb.questions.forEach((q, localIdx) => {
        globalIdx += 1;
        list.push({
          q,
          subjectId: sb.id,
          subjectName: sb.name,
          localIdx: localIdx + 1,
          globalIdx,
        });
      });
    });

    const term = toEn(inspectSearch.trim().toLowerCase());
    return list.filter((item) => {
      if (inspectSubjectId !== 'all' && item.subjectId !== inspectSubjectId) return false;
      if (!term) return true;
      const haystack = toEn(
        [
          item.q.q,
          item.q.chapter || '',
          item.q.sourceLabel || '',
          item.q.csvQuestionNum || '',
          item.q.csvRowIndex ? String(item.q.csvRowIndex) : '',
          item.q.csvFileName || '',
          String(item.globalIdx),
          String(item.localIdx),
          item.subjectName,
        ]
          .join(' ')
          .toLowerCase()
      );
      return haystack.includes(term);
    });
  }, [inspectedExam, inspectSubjectId, inspectSearch]);

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-8">
          <ShieldCheck className="mx-auto h-10 w-10 text-teal-700 dark:text-teal-400" />
          <h1 className="mt-4 text-lg font-extrabold text-[var(--ink)]">دسترسی محدود به مدیران سامانه</h1>
          <p className="mt-2 text-xs leading-6 text-[var(--ink-muted)]">
            {user
              ? 'حساب کاربری فعلی دسترسی مدیریتی در جدول ادمین‌ها ندارد.'
              : 'برای ورود به پنل مدیریت، با حساب ادمین وارد شوید.'}
          </p>
          {!user && (
            <button
              type="button"
              onClick={openAuthModal}
              className="mt-5 rounded-xl bg-teal-700 px-6 py-2.5 text-xs font-bold text-white dark:bg-teal-500 dark:text-slate-950"
            >
              ورود مدیر
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Handlers ---
  const handleUploadLaws = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLawImporting(true);
    setLawImportProgress('در حال خواندن فایل...');
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const raw = JSON.parse(await file.text()) as Array<{
          law?: string;
          num: string;
          numText?: string;
          num_text?: string;
          text: string;
          path?: string[];
          sections?: { h: string; v: string }[];
        }>;
        const grouped = new Map<string, typeof raw>();
        raw.forEach((item) => {
          const ln = lawImportName.trim() || item.law || file.name.replace(/\.json$/i, '');
          if (!grouped.has(ln)) grouped.set(ln, []);
          grouped.get(ln)!.push(item);
        });
        for (const [ln, rows] of grouped.entries()) {
          await importLawArticles(
            ln,
            rows.map((r) => ({
              num: String(r.num),
              numText: r.numText || r.num_text || `ماده ${r.num}`,
              text: r.text,
              path: r.path || [],
              sections: r.sections || [],
            })),
            lawImportReplace,
            (done, tot) => setLawImportProgress(`${ln}: ${toFa(done)} از ${toFa(tot)}`)
          );
        }
      } else {
        const parsed = await parseLawSpreadsheetFile(file);
        const grouped = new Map<string, typeof parsed>();
        parsed.forEach((item) => {
          const ln = lawImportName.trim() || item.law;
          if (!grouped.has(ln)) grouped.set(ln, []);
          grouped.get(ln)!.push(item);
        });
        for (const [ln, rows] of grouped.entries()) {
          await importLawArticles(ln, rows, lawImportReplace, (done, tot) =>
            setLawImportProgress(`${ln}: ${toFa(done)} از ${toFa(tot)}`)
          );
        }
      }
      await bumpLawVersion();
      await reloadLawDb(true);
      showToast('قوانین جدید با موفقیت در سرور ثبت و همگام‌سازی شد.');
    } catch (err) {
      showToast(`خطا در ورود اطلاعات: ${err instanceof Error ? err.message : 'نامشخص'}`);
    } finally {
      setLawImporting(false);
      setLawImportProgress('');
      e.target.value = '';
    }
  };

  const handleUploadDecisions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLawImporting(true);
    try {
      const list = file.name.toLowerCase().endsWith('.json')
        ? JSON.parse(await file.text())
        : await parseDecisionsSpreadsheetFile(file);
      await importDecisionsList(list);
      await bumpLawVersion();
      await reloadLawDb(true);
      showToast(`${toFa(list.length)} رأی وحدت رویه ثبت شد.`);
    } catch {
      showToast('خطا در بارگذاری فایل آرا.');
    } finally {
      setLawImporting(false);
      e.target.value = '';
    }
  };

  const handleAddSingleArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    const ln = singleLaw.trim();
    if (!ln || !singleNum.trim() || !singleText.trim()) {
      showToast('نام قانون، شماره ماده و متن ماده الزامی است.');
      return;
    }
    try {
      const lawId = await ensureLawRecord(ln);
      const maxRes = await supabase
        .from('articles')
        .select('ord')
        .eq('law_id', lawId)
        .order('ord', { ascending: false })
        .limit(1);
      const nextOrd = ((maxRes.data?.[0]?.ord as number | undefined) ?? -1) + 1;
      const ins = await supabase.from('articles').insert({
        law_id: lawId,
        ord: nextOrd,
        num: singleNum.trim(),
        num_text: `ماده ${singleNum.trim()}`,
        text: singleText.trim(),
        path: singlePath
          .split('>')
          .map((s) => s.trim())
          .filter(Boolean),
        sections: [],
      });
      if (ins.error) throw ins.error;
      await bumpLawVersion();
      await reloadLawDb(true);
      setSingleNum('');
      setSingleText('');
      showToast('ماده قانونی با موفقیت اضافه شد.');
    } catch {
      showToast('خطا در ثبت ماده قانونی.');
    }
  };

  const handleDeleteLaw = async (lawId: number, lawName: string) => {
    if (!window.confirm(`حذف کامل «${lawName}» و تمام مواد آن؟`)) return;
    await supabase.from('articles').delete().eq('law_id', lawId);
    await supabase.from('laws').delete().eq('id', lawId);
    await bumpLawVersion();
    await reloadLawDb(true);
    showToast(`${lawName} حذف شد.`);
  };

  const handleCreateJournalArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jaTitle.trim() || !jaContent.trim()) {
      showToast('عنوان و متن مقاله الزامی است.');
      return;
    }
    const item = {
      id: `art_${Date.now()}`,
      title: jaTitle.trim(),
      category: jaCat,
      author: jaAuthor.trim() || 'هیئت تحریریه برائت',
      date: new Date().toLocaleDateString('fa-IR'),
      abstract: jaAbstract.trim() || jaContent.trim().slice(0, 160),
      content: jaContent.trim(),
      coverImage: jaCover || undefined,
      featured: jaFeatured,
    };
    await setJournalArticles([item, ...journalArticles]);
    setJaTitle('');
    setJaAbstract('');
    setJaContent('');
    setJaCover('');
    setJaFeatured(false);
    setArticleSubTab('list');
  };

  const handleCreateDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dlTitle.trim()) return;
    const item: DeadlineItem = {
      id: `dl_${Date.now()}`,
      title: dlTitle.trim(),
      law: dlLaw.trim() || 'قانون مرتبط',
      daysIran: Number(dlIran) || 20,
      daysAbroad: Number(dlAbroad) || 60,
      cat: dlCat,
      desc: dlDesc.trim(),
    };
    await setDeadlines([item, ...deadlines]);
    setDlTitle('');
    setDlDesc('');
  };

  const handleCreateCalc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ccTitle.trim()) return;
    const item: CustomCalculator = {
      id: `cc_${Date.now()}`,
      title: ccTitle.trim(),
      type: ccType,
      rate: Number(ccRate) || 0,
      desc: ccDesc.trim(),
    };
    await setCustomCalcs([item, ...customCalcs]);
    setCcTitle('');
    setCcDesc('');
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exTitle.trim() || !exQuestionsJson.trim()) {
      showToast('عنوان آزمون و فهرست پرسش‌ها را وارد کنید.');
      return;
    }
    try {
      const parsed = JSON.parse(exQuestionsJson) as unknown;
      const rawQuestions = Array.isArray(parsed) ? parsed : [parsed];
      const hasZero = rawQuestions.some(
        (item) => item && typeof item === 'object' && /^0(?:\.0+)?$/.test(toEn(String((item as { answer?: unknown }).answer ?? '')).trim())
      );
      const hasFour = rawQuestions.some(
        (item) => item && typeof item === 'object' && /^4(?:\.0+)?$/.test(toEn(String((item as { answer?: unknown }).answer ?? '')).trim())
      );
      const zeroBased = hasZero && !hasFour;
      const questionsList: ExamQuestion[] = rawQuestions.map((raw, idx) => {
        const item = raw as {
          q: string;
          options: string[];
          answer: number;
          exp?: string;
          chapter?: string;
          sourceLabel?: string;
          source?: string;
          year?: string;
          type?: string;
          csvQuestionNum?: string;
          csvRowIndex?: number;
        };
        const ansNum = Number(toEn(String(item.answer ?? ''))) || 0;
        const ansIdx = zeroBased ? Math.max(0, Math.min(3, ansNum)) : ansNum >= 1 && ansNum <= 4 ? ansNum - 1 : Math.max(0, Math.min(3, ansNum));
        return {
          id: `q_${Date.now()}_${idx}`,
          q: item.q,
          options: item.options,
          answer: ansIdx,
          exp: item.exp,
          chapter: item.chapter,
          sourceLabel:
            item.sourceLabel ||
            buildQuestionSourceLabel(item.source, item.type || exType.trim(), item.year || exYear.trim()) ||
            undefined,
          csvQuestionNum: item.csvQuestionNum || String(idx + 1),
          csvRowIndex: item.csvRowIndex || idx + 1,
        };
      });
      const exam: LegalExam = {
        id: `ex_${Date.now()}`,
        title: exTitle.trim(),
        category: exCategory.trim() || undefined,
        examType: exType.trim() || undefined,
        year: exYear.trim() || undefined,
        isPublished: exIsPublished,
        isPremium: exIsPremium,
        durationMin: calcExamDurationMin(questionsList.length),
        desc: exDesc.trim(),
        subjects: [{ id: `sub_${Date.now()}`, name: exSubjectName.trim() || 'سوالات آزمون', questions: questionsList }],
        createdAt: new Date().toISOString(),
      };
      await setExams([exam, ...exams]);
      setExTitle('');
      setExDesc('');
      setExQuestionsJson('');
      setExamSubTab('list');
    } catch {
      showToast('فرمت JSON پرسش‌ها معتبر نیست.');
    }
  };

  const handleUploadExamFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExImporting(true);
    try {
      const parsedExams = await parseExamSpreadsheetFile(file, {
        title: exTitle.trim() || undefined,
        category: exCategory.trim() || undefined,
        examType: exType.trim() || undefined,
        year: exYear.trim() || undefined,
        subject: exSubjectName.trim() || undefined,
        isPublished: exIsPublished,
        isPremium: exIsPremium,
      });
      if (!parsedExams.length) {
        showToast('سوالی با ساختار معتبر در فایل پیدا نشد.');
        return;
      }
      await setExams([...parsedExams, ...exams]);
      showToast(`${toFa(parsedExams.length)} آزمون با موفقیت از فایل وارد و ذخیره شد (زمان: خودکار ۲ دقیقه/سوال).`);
      setExamSubTab('list');
    } catch (err) {
      showToast(`خطا در خواندن فایل آزمون: ${err instanceof Error ? err.message : 'نامشخص'}`);
    } finally {
      setExImporting(false);
      e.target.value = '';
    }
  };

  const handleDownloadSampleExamCsv = () => {
    const csv = createSampleExamCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baraat-exam-sample.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleToggleExamVisibility = async (examId: string) => {
    const updated = exams.map((ex) =>
      ex.id === examId ? { ...ex, isPublished: ex.isPublished === false ? true : false } : ex
    );
    await setExams(updated);
  };

  const handleToggleExamPremium = async (examId: string) => {
    const updated = exams.map((ex) =>
      ex.id === examId ? { ...ex, isPremium: !ex.isPremium } : ex
    );
    await setExams(updated);
  };

  const startEditQuestion = (subjectId: string, q: ExamQuestion) => {
    setEditingQuestionKey(`${subjectId}::${q.id}`);
    setEditQDraft({
      q: q.q || '',
      options: [
        q.options[0] || '',
        q.options[1] || '',
        q.options[2] || '',
        q.options[3] || '',
      ],
      answer: Math.max(0, Math.min(3, Number(q.answer) || 0)),
      exp: q.exp || '',
      chapter: q.chapter || '',
      sourceLabel: q.sourceLabel || '',
    });
  };

  const handleSaveEditedQuestion = async (examId: string, subjectId: string, questionId: string) => {
    if (!editQDraft.q.trim()) {
      showToast('متن سوال نمی‌تواند خالی باشد.');
      return;
    }
    const cleanOpts = [...editQDraft.options].map((x) => x.trim());
    while (cleanOpts.length > 2 && !cleanOpts[cleanOpts.length - 1]) {
      cleanOpts.pop();
    }
    if (cleanOpts.filter(Boolean).length < 2) {
      showToast('حداقل دو گزینه برای سوال وارد کنید.');
      return;
    }
    const safeAns = Math.max(0, Math.min(cleanOpts.length - 1, editQDraft.answer));
    const updated = exams.map((ex) => {
      if (ex.id !== examId) return ex;
      return {
        ...ex,
        subjects: ex.subjects.map((sb) =>
          sb.id !== subjectId
            ? sb
            : {
                ...sb,
                questions: sb.questions.map((q) =>
                  q.id !== questionId
                    ? q
                    : {
                        ...q,
                        q: editQDraft.q.trim(),
                        options: cleanOpts,
                        answer: safeAns,
                        exp: editQDraft.exp.trim(),
                        chapter: editQDraft.chapter.trim(),
                        sourceLabel: editQDraft.sourceLabel.trim() || undefined,
                      }
                ),
              }
        ),
      };
    });
    await setExams(updated);
    setEditingQuestionKey(null);
    showToast('سوال با موفقیت ویرایش و ذخیره شد.');
  };

  const handleAddSingleQuestion = async (examId: string) => {
    const targetExam = exams.find((e) => e.id === examId);
    if (!targetExam) return;
    if (!newQDraft.q.trim()) {
      showToast('متن سوال جدید را وارد کنید.');
      return;
    }
    const cleanOpts = [...newQDraft.options].map((x) => x.trim());
    while (cleanOpts.length > 2 && !cleanOpts[cleanOpts.length - 1]) {
      cleanOpts.pop();
    }
    if (cleanOpts.filter(Boolean).length < 2) {
      showToast('حداقل دو گزینه وارد کنید.');
      return;
    }
    const targetSubId = newQSubjectId || targetExam.subjects[0]?.id;
    const totalBefore = targetExam.subjects.reduce((s, b) => s + b.questions.length, 0);
    const createdQ: ExamQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      q: newQDraft.q.trim(),
      options: cleanOpts,
      answer: Math.max(0, Math.min(cleanOpts.length - 1, newQDraft.answer)),
      exp: newQDraft.exp.trim(),
      chapter: newQDraft.chapter.trim(),
      sourceLabel: newQDraft.sourceLabel.trim() || undefined,
      csvQuestionNum: String(totalBefore + 1),
      csvRowIndex: totalBefore + 1,
    };
    const updated = exams.map((ex) => {
      if (ex.id !== examId) return ex;
      const nextSubjects = ex.subjects.map((sb) =>
        sb.id === targetSubId ? { ...sb, questions: [...sb.questions, createdQ] } : sb
      );
      const nextTotal = nextSubjects.reduce((s, b) => s + b.questions.length, 0);
      return {
        ...ex,
        durationMin: calcExamDurationMin(nextTotal),
        subjects: nextSubjects,
      };
    });
    await setExams(updated);
    setNewQDraft({ q: '', options: ['', '', '', ''], answer: 0, exp: '', chapter: '', sourceLabel: '' });
    setAddingQOpen(false);
    showToast('سوال جدید به آزمون اضافه شد.');
  };

  const handleDeleteExamQuestion = async (examId: string, subjectId: string, questionId: string) => {
    if (!window.confirm('این سوال از آزمون حذف شود؟')) return;
    const updated = exams.map((ex) => {
      if (ex.id !== examId) return ex;
      const nextSubjects = ex.subjects.map((sb) =>
        sb.id === subjectId ? { ...sb, questions: sb.questions.filter((q) => q.id !== questionId) } : sb
      );
      const nextTotal = nextSubjects.reduce((s, b) => s + b.questions.length, 0);
      return {
        ...ex,
        durationMin: calcExamDurationMin(nextTotal),
        subjects: nextSubjects,
      };
    });
    await setExams(updated);
    if (editingQuestionKey === `${subjectId}::${questionId}`) setEditingQuestionKey(null);
    showToast('سوال از آزمون حذف شد.');
  };

  const handleUpsertVipSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = vipEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('ایمیل معتبر دانشجو را وارد کنید.');
      return;
    }
    const planLabels: Record<typeof vipDurationDays, string> = {
      '30': '۱ ماهه',
      '90': '۳ ماهه',
      '180': '۶ ماهه',
      '365': '۱ ساله',
      lifetime: 'دائمی',
    };
    const expiresAt =
      vipDurationDays === 'lifetime'
        ? ''
        : new Date(Date.now() + Number(vipDurationDays) * 24 * 60 * 60 * 1000).toISOString();
    const entry: VipSubscriber = {
      email: cleanEmail,
      name: vipName.trim() || undefined,
      plan: planLabels[vipDurationDays],
      expiresAt,
      note: vipNote.trim() || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const existing = vipSettings.subscribers || [];
    const nextList = [entry, ...existing.filter((s) => s.email.trim().toLowerCase() !== cleanEmail)];
    await setVipSettings({ ...vipSettings, subscribers: nextList });
    setVipEmail('');
    setVipName('');
    setVipNote('');
  };

  const handleToggleVipActive = async (email: string) => {
    const nextList = (vipSettings.subscribers || []).map((s) =>
      s.email.trim().toLowerCase() === email.trim().toLowerCase() ? { ...s, active: s.active === false ? true : false } : s
    );
    await setVipSettings({ ...vipSettings, subscribers: nextList });
  };

  const handleExtendVip30Days = async (email: string) => {
    const nextList = (vipSettings.subscribers || []).map((s) => {
      if (s.email.trim().toLowerCase() !== email.trim().toLowerCase()) return s;
      const baseTs = s.expiresAt ? Math.max(Date.now(), new Date(s.expiresAt).getTime()) : Date.now();
      return {
        ...s,
        active: true,
        expiresAt: new Date(baseTs + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    });
    await setVipSettings({ ...vipSettings, subscribers: nextList });
  };

  const handleDeleteVipSubscriber = async (email: string) => {
    if (!window.confirm(`اشتراک ویژه «${email}» حذف شود؟`)) return;
    const nextList = (vipSettings.subscribers || []).filter(
      (s) => s.email.trim().toLowerCase() !== email.trim().toLowerCase()
    );
    await setVipSettings({ ...vipSettings, subscribers: nextList });
  };

  const handleSaveVipMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await setVipSettings({
      ...vipSettings,
      upgradeMessage: vipMsgDraft.trim(),
      supportContact: vipSupportDraft.trim(),
    });
  };

  const handleDeleteAllExams = async () => {
    if (!exams.length) return;
    if (
      !window.confirm(
        `آیا از حذف کامل تمام ${toFa(exams.length)} آزمون ثبت‌شده مطمئن هستید؟ نکات شخصی دانشجویان حفظ می‌شوند.`
      )
    ) {
      return;
    }
    setInspectedExamId(null);
    await setExams([]);
    showToast('تمام آزمون‌ها با موفقیت حذف شدند.');
  };

  const handleReplyQuestion = async (id: string) => {
    const replyText = (replyDrafts[id] || '').trim();
    if (!replyText) return;
    const item = questions[id];
    if (!item) return;
    await setQuestions({
      ...questions,
      [id]: { ...item, reply: replyText, repliedAt: new Date().toLocaleDateString('fa-IR') },
    });
  };

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = assignEmail.trim().toLowerCase();
    if (!em || !assignJson.trim()) return;
    try {
      const parsed = JSON.parse(assignJson) as PlannerState;
      const existingRes = await supabase
        .from('meta')
        .select('value')
        .eq('key', META_KEYS.ASSIGNED_PLANS)
        .maybeSingle();
      const map: Record<string, AssignedPlanEntry> = existingRes.data?.value
        ? JSON.parse(String(existingRes.data.value))
        : {};
      map[em] = {
        updatedAt: new Date().toISOString(),
        mode: 'replace',
        planKind: 'json',
        jsonState: parsed,
      };
      const res = await upsertMetaKey(META_KEYS.ASSIGNED_PLANS, map);
      showToast(res.ok ? `برنامه برای ${em} ثبت شد.` : 'خطا در ثبت برنامه.');
    } catch {
      showToast('ساختار JSON برنامه نامعتبر است.');
    }
  };

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    { id: 'exams', label: 'آزمون‌های آنلاین', icon: ClipboardList, count: exams.length },
    { id: 'laws', label: 'قوانین و آرا', icon: Database, count: laws.length },
    { id: 'articles', label: 'نشریه و مقالات', icon: Newspaper, count: journalArticles.length },
    { id: 'tools', label: 'مواعد و ابزارها', icon: Calculator, count: deadlines.length + customCalcs.length },
    { id: 'students', label: 'دانشجویان و پرسش‌ها', icon: Users, count: pendingQaCount || undefined },
    { id: 'settings', label: 'تنظیمات و ایمیل', icon: Settings },
  ];

  // Filtered exams for list
  const filteredExams = useMemo(() => {
    const q = toEn(examListSearch.trim().toLowerCase());
    if (!q) return exams;
    return exams.filter((ex) =>
      toEn([ex.title, ex.category || '', ex.examType || '', ex.year || ''].join(' ').toLowerCase()).includes(q)
    );
  }, [exams, examListSearch]);

  // Filtered laws for list
  const filteredLaws = useMemo(() => {
    const q = lawListSearch.trim().toLowerCase();
    if (!q) return laws;
    return laws.filter((l) => l.name.toLowerCase().includes(q));
  }, [laws, lawListSearch]);

  // Student tags flat list
  const allTaggedEntries = useMemo(() => {
    const entries: Array<{
      email: string;
      qId: string;
      tag: ExamQuestionTagState;
    }> = [];
    studentRows.forEach((sr) => {
      if (!sr.examTags) return;
      Object.entries(sr.examTags).forEach(([qId, tg]) => {
        if (tg && (tg.difficulty || (tg.tags && tg.tags.length > 0))) {
          entries.push({
            email: sr.email || sr.user_id.slice(0, 8),
            qId,
            tag: tg,
          });
        }
      });
    });
    return entries;
  }, [studentRows]);

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 animate-fade-up">
      {/* Compact Workspace Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hairline)] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-teal-700 dark:text-teal-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>پنل مدیریت برائت</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-extrabold text-[var(--ink)]">مدیریت سامانه</h1>
            <p className="text-xs text-[var(--ink-muted)] tabular-nums">
              {toFa(exams.length)} آزمون · {toFa(laws.length)} قانون ({toFa(articles.length)} ماده) · {toFa(decisions.length)} رأی · {toFa(journalArticles.length)} مقاله
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => reloadLawDb(true)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>بازخوانی بانک</span>
        </button>
      </header>

      {/* Mobile Horizontal Navigation */}
      <nav aria-label="بخش‌های پنل مدیریت" className="mt-4 flex gap-1.5 overflow-x-auto pb-2 lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setInspectedExamId(null);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                active
                  ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                  : 'border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="text-[10.5px] opacity-80 tabular-nums">({toFa(item.count)})</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main 2-Column SaaS Workspace */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[224px_minmax(0,1fr)] items-start">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block sticky top-20 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-2">
          <p className="px-3 pt-1.5 pb-2 text-[11px] font-bold text-[var(--ink-muted)]">بخش‌های مدیریت</p>
          <nav className="space-y-0.5" aria-label="منوی مدیریت">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setInspectedExamId(null);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${
                    active
                      ? 'bg-teal-700/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300'
                      : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span className="text-[11px] font-semibold tabular-nums opacity-75">
                      {toFa(item.count)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Active Section Workspace */}
        <main className="min-w-0 space-y-5">
          {/* ==================== SECTION 1: EXAMS ==================== */}
          {tab === 'exams' && (
            <>
              {/* Clean Sub-tab Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'list' as const, label: `فهرست آزمون‌ها (${toFa(exams.length)})` },
                    { id: 'import' as const, label: 'افزودن / ورود فایل' },
                    {
                      id: 'subscriptions' as const,
                      label: `اشتراک و اعضای ویژه (${toFa((vipSettings.subscribers || []).filter((s) => s.active !== false).length)})`,
                    },
                    { id: 'attempts' as const, label: `کارنامه‌ها (${toFa(examAttempts.length)})` },
                    { id: 'tags' as const, label: `تیک‌های دانشجویان (${toFa(allTaggedEntries.length)})` },
                    { id: 'security' as const, label: 'قفل امنیتی' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setExamSubTab(st.id);
                        if (st.id !== 'list') setInspectedExamId(null);
                      }}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        examSubTab === st.id
                          ? 'bg-[var(--ink)] text-[var(--surface)]'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {examSubTab === 'list' && !inspectedExam && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExamSubTab('import')}
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>ورود آزمون جدید</span>
                    </button>
                    {exams.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDeleteAllExams}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>حذف همه</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Sub-tab 1A: Exam List OR Focused Admin CSV Question Inspector */}
              {examSubTab === 'list' &&
                (inspectedExam ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            setInspectedExamId(null);
                            setInspectSearch('');
                            setInspectSubjectId('all');
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline dark:text-teal-400"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          <span>بازگشت به فهرست آزمون‌ها</span>
                        </button>
                        <h2 className="mt-1.5 text-base font-extrabold text-[var(--ink)]">{inspectedExam.title}</h2>
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)] tabular-nums">
                          {[
                            inspectedExam.category,
                            inspectedExam.examType,
                            inspectedExam.year ? `سال ${toFa(inspectedExam.year)}` : '',
                            `${toFa(inspectedExam.subjects.length)} درس / سرفصل`,
                            `${toFa(inspectedExam.subjects.reduce((s, b) => s + b.questions.length, 0))} سوال`,
                            `${toFa(calcExamDurationMin(inspectedExam.subjects.reduce((s, b) => s + b.questions.length, 0)))} دقیقه (۲ د/سوال)`,
                            inspectedExam.isPremium ? 'ویژه اشتراک' : 'رایگان',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingQOpen((v) => !v);
                            setNewQSubjectId(inspectedExam.subjects[0]?.id || '');
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{addingQOpen ? 'بستن فرم افزودن' : 'افزودن سوال تکی'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleExamPremium(inspectedExam.id)}
                          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold ${
                            inspectedExam.isPremium
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                              : 'border-[var(--hairline)] bg-[var(--surface-muted)] text-[var(--ink)]'
                          }`}
                        >
                          <Crown className="h-3.5 w-3.5" />
                          <span>{inspectedExam.isPremium ? 'ویژه اشتراک' : 'تبدیل به ویژه'}</span>
                        </button>
                        <Link
                          to="/exams"
                          className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40"
                        >
                          مشاهده در محیط آزمون
                        </Link>
                      </div>
                    </div>

                    {/* Add Single Question Inline Form */}
                    {addingQOpen && (
                      <div className="rounded-xl border border-teal-600/35 bg-[var(--surface)] p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-2">
                          <h3 className="text-xs font-extrabold text-teal-800 dark:text-teal-300">افزودن سوال جدید به این آزمون</h3>
                          <button
                            type="button"
                            onClick={() => setAddingQOpen(false)}
                            className="rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {inspectedExam.subjects.length > 1 && (
                          <div>
                            <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">درس مقصد</label>
                            <select
                              value={newQSubjectId || inspectedExam.subjects[0]?.id || ''}
                              onChange={(e) => setNewQSubjectId(e.target.value)}
                              className="w-full sm:w-64 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                            >
                              {inspectedExam.subjects.map((sb) => (
                                <option key={sb.id} value={sb.id}>
                                  {sb.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">متن سوال *</label>
                          <textarea
                            rows={3}
                            value={newQDraft.q}
                            onChange={(e) => setNewQDraft((d) => ({ ...d, q: e.target.value }))}
                            placeholder="صورت سوال را وارد کنید..."
                            className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-2.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {newQDraft.options.map((optVal, oi) => {
                            const isRight = newQDraft.answer === oi;
                            return (
                              <div
                                key={oi}
                                className={`flex items-center gap-2 rounded-lg border p-2 ${
                                  isRight
                                    ? 'border-emerald-500/50 bg-emerald-500/10'
                                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/60'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setNewQDraft((d) => ({ ...d, answer: oi }))}
                                  title="انتخاب به عنوان گزینه صحیح"
                                  className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold transition-colors ${
                                    isRight
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-[var(--hairline-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                  }`}
                                >
                                  {OPTION_LETTERS[oi]} {isRight ? '✓' : ''}
                                </button>
                                <input
                                  type="text"
                                  value={optVal}
                                  onChange={(e) =>
                                    setNewQDraft((d) => {
                                      const opts = [...d.options] as [string, string, string, string];
                                      opts[oi] = e.target.value;
                                      return { ...d, options: opts };
                                    })
                                  }
                                  placeholder={`متن گزینه ${OPTION_LETTERS[oi]}...`}
                                  className="min-w-0 flex-1 bg-transparent text-xs text-[var(--ink)] outline-none"
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            value={newQDraft.chapter}
                            onChange={(e) => setNewQDraft((d) => ({ ...d, chapter: e.target.value }))}
                            placeholder="سرفصل / مبحث (اختیاری)"
                            className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                          <input
                            type="text"
                            value={newQDraft.sourceLabel}
                            onChange={(e) => setNewQDraft((d) => ({ ...d, sourceLabel: e.target.value }))}
                            placeholder="منبع / سال سوال (اختیاری)"
                            className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">پاسخ تشریحی (اختیاری)</label>
                          <textarea
                            rows={2}
                            value={newQDraft.exp}
                            onChange={(e) => setNewQDraft((d) => ({ ...d, exp: e.target.value }))}
                            placeholder="توضیح مستندات قانونی و پاسخ تشریحی..."
                            className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-2.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setAddingQOpen(false)}
                            className="rounded-lg border border-[var(--hairline)] px-3.5 py-1.5 text-xs font-bold text-[var(--ink-muted)]"
                          >
                            انصراف
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddSingleQuestion(inspectedExam.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                          >
                            <Save className="h-3.5 w-3.5" />
                            <span>افزودن و ذخیره سوال</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inspector Search & Subject Filters */}
                    <div className="flex flex-col gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
                      <div className="relative">
                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
                        <input
                          type="text"
                          value={inspectSearch}
                          onChange={(e) => setInspectSearch(e.target.value)}
                          placeholder="جستجو بر اساس شماره سوال در CSV، شماره ردیف فایل، سرفصل یا متن سوال..."
                          className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] py-2 pr-9 pl-3 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                        />
                      </div>

                      {inspectedExam.subjects.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectSubjectId('all')}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                              inspectSubjectId === 'all'
                                ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                : 'border border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                            }`}
                          >
                            همه درس‌ها
                          </button>
                          {inspectedExam.subjects.map((sb) => (
                            <button
                              key={sb.id}
                              type="button"
                              onClick={() => setInspectSubjectId(sb.id)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                                inspectSubjectId === sb.id
                                  ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                  : 'border border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                              }`}
                            >
                              {sb.name} ({toFa(sb.questions.length)})
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="text-[11px] text-[var(--ink-muted)] tabular-nums">
                        نمایش {toFa(inspectedQuestions.length)} سوال — شماره ردیف و فایل CSV فقط برای مدیر قابل مشاهده است.
                      </p>
                    </div>

                    {/* Questions List with Exact CSV Row / Number */}
                    <div className="space-y-3">
                      {inspectedQuestions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-8 text-center text-xs text-[var(--ink-muted)]">
                          سوالی با این عبارت پیدا نشد.
                        </div>
                      ) : (
                        inspectedQuestions.map(({ q, subjectId, subjectName, localIdx, globalIdx }) => {
                          const csvRef = formatAdminCsvQuestionRef(q, globalIdx);
                          const isEditingThis = editingQuestionKey === `${subjectId}::${q.id}`;
                          return (
                            <div
                              key={q.id}
                              className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                                isEditingThis
                                  ? 'border-teal-600/50 bg-[var(--surface)] shadow-xs'
                                  : 'border-[var(--hairline)] bg-[var(--surface)]'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-2">
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                                  <span className="font-extrabold text-[var(--ink)] tabular-nums">
                                    سوال {toFa(localIdx)} ({subjectName})
                                  </span>
                                  <span
                                    title={q.csvFileName ? `نام فایل: ${q.csvFileName}` : undefined}
                                    className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-extrabold text-indigo-800 dark:text-indigo-300 tabular-nums"
                                  >
                                    {csvRef}
                                  </span>
                                  {q.csvFileName && (
                                    <span className="text-[var(--ink-muted)]" dir="ltr">
                                      {q.csvFileName}
                                    </span>
                                  )}
                                  {q.chapter && (
                                    <span className="text-teal-700 dark:text-teal-400 font-semibold">
                                      سرفصل: {q.chapter}
                                    </span>
                                  )}
                                  {q.sourceLabel && (
                                    <span className="text-amber-700 dark:text-amber-300 font-semibold">
                                      {q.sourceLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isEditingThis ? (
                                    <button
                                      type="button"
                                      onClick={() => setEditingQuestionKey(null)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    >
                                      <X className="h-3 w-3" />
                                      <span>انصراف</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => startEditQuestion(subjectId, q)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-700/25 bg-teal-700/10 px-2.5 py-1 text-[11px] font-bold text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      <span>ویرایش</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExamQuestion(inspectedExam.id, subjectId, q.id)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>حذف</span>
                                  </button>
                                </div>
                              </div>

                              {isEditingThis ? (
                                <div className="space-y-3 pt-1">
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">متن سوال</label>
                                    <textarea
                                      rows={3}
                                      value={editQDraft.q}
                                      onChange={(e) => setEditQDraft((d) => ({ ...d, q: e.target.value }))}
                                      className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-2.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">
                                      گزینه‌ها (روی دکمه حروف کلیک کنید تا گزینه صحیح انتخاب شود)
                                    </label>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      {editQDraft.options.map((optVal, oi) => {
                                        const isRight = editQDraft.answer === oi;
                                        return (
                                          <div
                                            key={oi}
                                            className={`flex items-center gap-2 rounded-lg border p-2 ${
                                              isRight
                                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                                : 'border-[var(--hairline)] bg-[var(--surface-muted)]/60'
                                            }`}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => setEditQDraft((d) => ({ ...d, answer: oi }))}
                                              title="انتخاب به عنوان پاسخ صحیح"
                                              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold transition-colors ${
                                                isRight
                                                  ? 'bg-emerald-600 text-white'
                                                  : 'border border-[var(--hairline-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                              }`}
                                            >
                                              {OPTION_LETTERS[oi]} {isRight ? '✓ صحیح' : ''}
                                            </button>
                                            <input
                                              type="text"
                                              value={optVal}
                                              onChange={(e) =>
                                                setEditQDraft((d) => {
                                                  const opts = [...d.options] as [string, string, string, string];
                                                  opts[oi] = e.target.value;
                                                  return { ...d, options: opts };
                                                })
                                              }
                                              placeholder={`متن گزینه ${OPTION_LETTERS[oi]}...`}
                                              className="min-w-0 flex-1 bg-transparent text-xs text-[var(--ink)] outline-none"
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">سرفصل / مبحث</label>
                                      <input
                                        type="text"
                                        value={editQDraft.chapter}
                                        onChange={(e) => setEditQDraft((d) => ({ ...d, chapter: e.target.value }))}
                                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">منبع / سال</label>
                                      <input
                                        type="text"
                                        value={editQDraft.sourceLabel}
                                        onChange={(e) => setEditQDraft((d) => ({ ...d, sourceLabel: e.target.value }))}
                                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">پاسخ تشریحی</label>
                                    <textarea
                                      rows={3}
                                      value={editQDraft.exp}
                                      onChange={(e) => setEditQDraft((d) => ({ ...d, exp: e.target.value }))}
                                      placeholder="پاسخ تشریحی و مستندات قانونی..."
                                      className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-2.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                                    />
                                  </div>
                                  <div className="flex items-center justify-end gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditingQuestionKey(null)}
                                      className="rounded-lg border border-[var(--hairline)] px-3.5 py-1.5 text-xs font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    >
                                      انصراف
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEditedQuestion(inspectedExam.id, subjectId, q.id)}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                                    >
                                      <Save className="h-3.5 w-3.5" />
                                      <span>ذخیره تغییرات</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="text-xs font-bold leading-6 text-[var(--ink)]">{q.q}</p>

                                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                    {q.options.map((opt, oi) => {
                                      const isRight = oi === q.answer;
                                      return (
                                        <div
                                          key={oi}
                                          className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] ${
                                            isRight
                                              ? 'border-emerald-500/40 bg-emerald-500/10 font-bold text-emerald-900 dark:text-emerald-200'
                                              : 'border-[var(--hairline)] bg-[var(--surface-muted)]/50 text-[var(--ink-muted)]'
                                          }`}
                                        >
                                          <span className="ml-1.5 font-extrabold">{OPTION_LETTERS[oi] || toFa(oi + 1)})</span>
                                          {opt}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {q.exp && (
                                    <p className="rounded-lg bg-[var(--surface-muted)]/60 px-3 py-2 text-[11.5px] leading-6 text-[var(--ink-muted)]">
                                      <span className="font-bold text-[var(--ink)]">پاسخ تشریحی: </span>
                                      {q.exp}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exams.length > 4 && (
                      <div className="relative">
                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
                        <input
                          type="text"
                          value={examListSearch}
                          onChange={(e) => setExamListSearch(e.target.value)}
                          placeholder="جستجو در نام آزمون، دسته یا سال..."
                          className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] py-2.5 pr-9 pl-3 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                        />
                      </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                      {filteredExams.length === 0 ? (
                        <div className="p-8 text-center text-xs text-[var(--ink-muted)]">
                          آزمونی یافت نشد. از بخش «افزودن / ورود فایل» اولین آزمون را بارگذاری کنید.
                        </div>
                      ) : (
                        filteredExams.map((ex) => {
                          const totalQ = ex.subjects.reduce((s, b) => s + b.questions.length, 0);
                          const autoMin = calcExamDurationMin(totalQ);
                          const isPub = ex.isPublished !== false;
                          const isPrem = Boolean(ex.isPremium);
                          return (
                            <div
                              key={ex.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--surface-muted)]/40 transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-extrabold text-[var(--ink)]">{ex.title}</span>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${
                                      isPrem
                                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    }`}
                                  >
                                    {isPrem ? 'ویژه اشتراک' : 'رایگان'}
                                  </span>
                                  <span
                                    className={`text-[11px] font-bold ${
                                      isPub
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-amber-700 dark:text-amber-400'
                                    }`}
                                  >
                                    {isPub ? '· منتشرشده' : '· مخفی (فقط مدیر)'}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-[var(--ink-muted)] tabular-nums">
                                  {[
                                    ex.category,
                                    ex.examType,
                                    ex.year ? `سال ${toFa(ex.year)}` : '',
                                    `${toFa(ex.subjects.length)} درس`,
                                    `${toFa(totalQ)} سوال`,
                                    `${toFa(autoMin)} دقیقه (۲ د/سوال)`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInspectedExamId(ex.id);
                                    setInspectSubjectId('all');
                                    setInspectSearch('');
                                    setEditingQuestionKey(null);
                                    setAddingQOpen(false);
                                  }}
                                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-500/15 dark:text-indigo-300"
                                >
                                  <ListChecks className="h-3.5 w-3.5" />
                                  <span>سوالات و ویرایش</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExamPremium(ex.id)}
                                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                                    isPrem
                                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300'
                                      : 'border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                  }`}
                                  title="تغییر وضعیت رایگان یا ویژه اشتراک"
                                >
                                  <Crown className="h-3.5 w-3.5" />
                                  <span>{isPrem ? 'ویژه' : 'رایگان'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExamVisibility(ex.id)}
                                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-xs font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                >
                                  {isPub ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  <span>{isPub ? 'مخفی' : 'انتشار'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`حذف آزمون «${ex.title}»؟`)) {
                                      setExams(exams.filter((x) => x.id !== ex.id));
                                    }
                                  }}
                                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--hairline)] p-1.5 text-red-600 hover:bg-red-500/10"
                                  title="حذف آزمون"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}

              {/* Sub-tab 1B: Import or Manual Exam Creation */}
              {examSubTab === 'import' && (
                <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-4">
                    <div>
                      <h2 className="text-sm font-extrabold text-[var(--ink)]">ساخت یا ورود آزمون جدید</h2>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        هنگام ورود فایل CSV یا اکسل، شماره ردیف و شماره سوال در فایل به‌طور خودکار فقط برای مدیر ذخیره می‌شود.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] p-1">
                      <button
                        type="button"
                        onClick={() => setExamCreateMode('file')}
                        className={`rounded-md px-3 py-1 text-xs font-bold ${
                          examCreateMode === 'file'
                            ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                            : 'text-[var(--ink-muted)]'
                        }`}
                      >
                        ورود از فایل CSV / اکسل
                      </button>
                      <button
                        type="button"
                        onClick={() => setExamCreateMode('json')}
                        className={`rounded-md px-3 py-1 text-xs font-bold ${
                          examCreateMode === 'json'
                            ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                            : 'text-[var(--ink-muted)]'
                        }`}
                      >
                        ثبت دستی با JSON
                      </button>
                    </div>
                  </div>

                  {/* Shared Metadata Fields */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">
                        عنوان آزمون {examCreateMode === 'file' ? '(اختیاری — پیش‌فرض از نام فایل)' : '*'}
                      </label>
                      <input
                        type="text"
                        value={exTitle}
                        onChange={(e) => setExTitle(e.target.value)}
                        placeholder="مثلاً آزمون وکالت ۱۴۰۴"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">
                        دسته / آزمون (اختیاری)
                      </label>
                      <input
                        type="text"
                        value={exCategory}
                        onChange={(e) => setExCategory(e.target.value)}
                        placeholder="مثلاً کانون وکلا / مرکز وکلا / قضاوت"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">
                        درس پیش‌فرض (اختیاری)
                      </label>
                      <input
                        type="text"
                        value={exSubjectName}
                        onChange={(e) => setExSubjectName(e.target.value)}
                        placeholder="مثلاً حقوق مدنی (یا از ستون درس/سرفصل فایل)"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">نوع سوال</label>
                      <input
                        type="text"
                        value={exType}
                        onChange={(e) => setExType(e.target.value)}
                        placeholder="سراسری یا تالیفی"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">سال</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={exYear}
                        onChange={(e) => setExYear(e.target.value)}
                        placeholder="1404"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-center text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">زمان‌بندی آزمون</label>
                      <div className="flex h-[34px] items-center justify-center rounded-lg border border-teal-700/25 bg-teal-700/5 px-3 text-[11px] font-bold text-teal-800 dark:text-teal-300">
                        خودکار: ۲ دقیقه به ازای هر سوال
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--ink)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exIsPublished}
                        onChange={(e) => setExIsPublished(e.target.checked)}
                        className="h-4 w-4 accent-teal-700"
                      />
                      <span>انتشار عمومی (در صورت برداشتن تیک فقط برای مدیر قابل مشاهده است)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exIsPremium}
                        onChange={(e) => setExIsPremium(e.target.checked)}
                        className="h-4 w-4 accent-amber-600"
                      />
                      <span>آزمون ویژه اعضای اشتراکی (نیازمند اشتراک فعال)</span>
                    </label>
                  </div>

                  {examCreateMode === 'file' ? (
                    <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-muted)]/50 p-6 text-center space-y-3">
                      <FileSpreadsheet className="mx-auto h-8 w-8 text-teal-700 dark:text-teal-400" />
                      <div>
                        <p className="text-xs font-extrabold text-[var(--ink)]">
                          انتخاب فایل CSV · Excel (xlsx / xls) · JSON
                        </p>
                        <p className="mt-1 text-[11.5px] text-[var(--ink-muted)] leading-6">
                          ستون‌های پشتیبانی‌شده: شماره / ردیف · سرفصل · درس · منبع · سال · سوال · گزینه ۱ تا ۴ · پاسخ · تشریح
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950">
                          <FileSpreadsheet className="h-4 w-4" />
                          <span>{exImporting ? 'در حال پردازش فایل...' : 'انتخاب فایل و ورود خودکار'}</span>
                          <input
                            type="file"
                            accept=".csv,.tsv,.xlsx,.xls,.json"
                            onChange={handleUploadExamFile}
                            disabled={exImporting}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleDownloadSampleExamCsv}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>دانلود فایل نمونه CSV</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateExam} className="space-y-3">
                      <input
                        type="text"
                        value={exDesc}
                        onChange={(e) => setExDesc(e.target.value)}
                        placeholder="توضیح کوتاه آزمون (اختیاری)"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                      <textarea
                        rows={7}
                        dir="ltr"
                        value={exQuestionsJson}
                        onChange={(e) => setExQuestionsJson(e.target.value)}
                        placeholder='[{"q":"متن سوال...","options":["گزینه الف","گزینه ب","گزینه ج","گزینه د"],"answer":1,"chapter":"عقود معین","sourceLabel":"وکالت ۱۴۰۳","exp":"توضیح ماده قانونی..."}]'
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 font-mono text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                      >
                        <Plus className="h-4 w-4" />
                        <span>ثبت و ذخیره آزمون</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Sub-tab 1B-2: VIP Subscriptions & Premium Exam Access */}
              {examSubTab === 'subscriptions' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Add / Update VIP Subscriber */}
                    <form
                      onSubmit={handleUpsertVipSubscriber}
                      className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-600" />
                        <h2 className="text-sm font-extrabold text-[var(--ink)]">افزودن یا تمدید عضو ویژه (اشتراک)</h2>
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] leading-5">
                        ایمیل دانشجو را وارد کنید تا دسترسی کامل به تمام آزمون‌های «ویژه اشتراک» برای او فعال شود.
                      </p>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">ایمیل دانشجو *</label>
                          <input
                            type="email"
                            dir="ltr"
                            required
                            value={vipEmail}
                            onChange={(e) => setVipEmail(e.target.value)}
                            placeholder="student@example.com"
                            className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-left text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">نام (اختیاری)</label>
                          <input
                            type="text"
                            value={vipName}
                            onChange={(e) => setVipName(e.target.value)}
                            placeholder="مثلاً علی رضایی"
                            className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">مدت اشتراک</label>
                          <select
                            value={vipDurationDays}
                            onChange={(e) => setVipDurationDays(e.target.value as '30' | '90' | '180' | '365' | 'lifetime')}
                            className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                          >
                            <option value="30">۱ ماهه (۳۰ روز)</option>
                            <option value="90">۳ ماهه (۹۰ روز)</option>
                            <option value="180">۶ ماهه (۱۸۰ روز)</option>
                            <option value="365">۱ ساله (۳۶۵ روز)</option>
                            <option value="lifetime">دائمی (بدون انقضا)</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">یادداشت مدیر (اختیاری)</label>
                          <input
                            type="text"
                            value={vipNote}
                            onChange={(e) => setVipNote(e.target.value)}
                            placeholder="شماره پیگیری یا توضیح..."
                            className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                          />
                        </div>
                      </div>

                      {/* Quick-pick from known students */}
                      {(() => {
                        const existingEmails = new Set(
                          (vipSettings.subscribers || []).map((s) => s.email.trim().toLowerCase())
                        );
                        const knownEmails = Array.from(
                          new Set([
                            ...studentRows.map((r) => (r.email || '').trim().toLowerCase()),
                            ...examAttempts.map((a) => (a.userEmail || '').trim().toLowerCase()),
                          ])
                        )
                          .filter((em) => em && em.includes('@') && !existingEmails.has(em))
                          .slice(0, 8);
                        if (!knownEmails.length) return null;
                        return (
                          <div className="pt-1">
                            <p className="text-[11px] font-bold text-[var(--ink-muted)] mb-1.5">
                              انتخاب سریع از دانشجویان ثبت‌شده:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {knownEmails.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  dir="ltr"
                                  onClick={() => setVipEmail(em)}
                                  className="rounded-md border border-[var(--hairline)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-mono text-[var(--ink)] hover:border-amber-500/50"
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
                      >
                        <Crown className="h-3.5 w-3.5" />
                        <span>فعال‌سازی / تمدید اشتراک ویژه</span>
                      </button>
                    </form>

                    {/* Upgrade Prompt Message Settings */}
                    <form
                      onSubmit={handleSaveVipMessage}
                      className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3"
                    >
                      <h2 className="text-sm font-extrabold text-[var(--ink)]">پیام راهنمای خرید اشتراک برای کاربران عادی</h2>
                      <p className="text-xs text-[var(--ink-muted)] leading-5">
                        وقتی دانشجوی بدون اشتراک روی آزمون «ویژه اشتراک» کلیک کند، این متن و راه ارتباطی نمایش داده می‌شود.
                      </p>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">متن پیام</label>
                        <textarea
                          rows={3}
                          value={vipMsgDraft}
                          onChange={(e) => setVipMsgDraft(e.target.value)}
                          className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-2.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">
                          شماره تماس / آیدی تلگرام یا لینک پرداخت (اختیاری)
                        </label>
                        <input
                          type="text"
                          value={vipSupportDraft}
                          onChange={(e) => setVipSupportDraft(e.target.value)}
                          placeholder="مثلاً پیام به تلگرام @baraat_support یا شماره ۰۹۱۲..."
                          className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                        />
                      </div>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>ذخیره متن راهنما</span>
                      </button>
                    </form>
                  </div>

                  {/* Subscribers List */}
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-xs font-extrabold text-[var(--ink)]">
                        فهرست اعضای ویژه ({toFa((vipSettings.subscribers || []).length)} نفر)
                      </h3>
                      <input
                        type="text"
                        value={vipSearch}
                        onChange={(e) => setVipSearch(e.target.value)}
                        placeholder="جستجوی ایمیل یا نام..."
                        className="w-full sm:w-60 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>

                    {(() => {
                      const q = vipSearch.trim().toLowerCase();
                      const filteredSubs = (vipSettings.subscribers || []).filter((s) => {
                        if (!q) return true;
                        return `${s.email} ${s.name || ''} ${s.note || ''} ${s.plan || ''}`.toLowerCase().includes(q);
                      });
                      if (!filteredSubs.length) {
                        return (
                          <div className="rounded-lg border border-dashed border-[var(--hairline)] p-6 text-center text-xs text-[var(--ink-muted)]">
                            هنوز عضو ویژه‌ای ثبت نشده است. از فرم بالا ایمیل دانشجو را اضافه کنید.
                          </div>
                        );
                      }
                      return (
                        <div className="divide-y divide-[var(--hairline)]">
                          {filteredSubs.map((sub) => {
                            const isExpired = Boolean(
                              sub.expiresAt && !Number.isNaN(new Date(sub.expiresAt).getTime()) && new Date(sub.expiresAt).getTime() < Date.now()
                            );
                            const isActiveNow = sub.active !== false && !isExpired;
                            return (
                              <div
                                key={sub.email}
                                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span dir="ltr" className="font-mono font-bold text-[var(--ink)]">
                                      {sub.email}
                                    </span>
                                    {sub.name && <span className="font-bold text-[var(--ink-muted)]">({sub.name})</span>}
                                    <span
                                      className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                                        isActiveNow
                                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                          : isExpired
                                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                            : 'bg-slate-500/15 text-[var(--ink-muted)]'
                                      }`}
                                    >
                                      {isActiveNow ? 'فعال' : isExpired ? 'منقضی‌شده' : 'غیرفعال'}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-[var(--ink-muted)] tabular-nums">
                                    طرح: {sub.plan || 'ویژه'} ·{' '}
                                    {sub.expiresAt
                                      ? `انقضا: ${new Date(sub.expiresAt).toLocaleDateString('fa-IR')}`
                                      : 'دائمی (بدون تاریخ انقضا)'}
                                    {sub.note ? ` · ${sub.note}` : ''}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleExtendVip30Days(sub.email)}
                                    className="rounded-lg border border-teal-700/25 bg-teal-700/10 px-2.5 py-1 text-[11px] font-bold text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
                                  >
                                    +۳۰ روز تمدید
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVipActive(sub.email)}
                                    className="rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                  >
                                    {sub.active === false ? 'فعال‌سازی' : 'تعلیق'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVipSubscriber(sub.email)}
                                    className="rounded-lg border border-[var(--hairline)] p-1.5 text-red-600 hover:bg-red-500/10"
                                    title="حذف اشتراک"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Sub-tab 1C: Exam Attempts */}
              {examSubTab === 'attempts' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[var(--ink-muted)]">
                      با حذف کارنامه، فقط نتیجه آزمون پاک می‌شود و یادداشت‌های شخصی دانشجو حفظ خواهد شد.
                    </p>
                    <input
                      type="text"
                      value={attemptFilter}
                      onChange={(e) => setAttemptFilter(e.target.value)}
                      placeholder="فیلتر با ایمیل دانشجو یا عنوان آزمون..."
                      className="w-full sm:w-64 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                    {examAttempts.filter((a) => {
                      const q = attemptFilter.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (a.userEmail || '').toLowerCase().includes(q) ||
                        a.examTitle.toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                      <div className="p-8 text-center text-xs text-[var(--ink-muted)]">
                        کارنامه‌ای برای نمایش وجود ندارد.
                      </div>
                    ) : (
                      examAttempts
                        .filter((a) => {
                          const q = attemptFilter.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            (a.userEmail || '').toLowerCase().includes(q) ||
                            a.examTitle.toLowerCase().includes(q)
                          );
                        })
                        .map((a) => (
                          <div
                            key={a.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-extrabold text-[var(--ink)]">{a.examTitle}</span>
                                <span className="text-[var(--ink-muted)]" dir="ltr">
                                  {a.userEmail || 'کاربر میهمان'}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-[var(--ink-muted)] tabular-nums">
                                نمره: <b className="text-[var(--ink)]">{toFa(a.scorePct)}٪</b> · صحیح {toFa(a.correctCount)} · غلط{' '}
                                {toFa(a.wrongCount)} · نزده {toFa(a.blankCount)} ·{' '}
                                {new Date(a.submittedAt).toLocaleDateString('fa-IR')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('حذف این کارنامه؟ (یادداشت‌های شخصی دانشجو پاک نمی‌شود)')) {
                                  deleteExamAttempt(a.id);
                                }
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--hairline)] px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>حذف</span>
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* Sub-tab 1D: Student Question Tags (with CSV row lookup!) */}
              {examSubTab === 'tags' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { id: 'all', label: `همه (${toFa(allTaggedEntries.length)})` },
                        { id: 'hard', label: 'سخت' },
                        { id: 'medium', label: 'متوسط' },
                        { id: 'easy', label: 'آسان' },
                        { id: 'review', label: 'مرور' },
                        { id: 'noteworthy', label: 'نکته‌دار' },
                        { id: 'careless', label: 'بی‌دقتی' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setTagFilterType(f.id)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                            tagFilterType === f.id
                              ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                              : 'border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={tagFilterStudent}
                      onChange={(e) => setTagFilterStudent(e.target.value)}
                      placeholder="جستجو بر اساس ایمیل، آزمون یا متن..."
                      className="w-full sm:w-60 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>

                  {(() => {
                    const filtered = allTaggedEntries.filter((e) => {
                      if (tagFilterType !== 'all') {
                        if (['easy', 'medium', 'hard'].includes(tagFilterType)) {
                          if (e.tag.difficulty !== tagFilterType) return false;
                        } else if (!(e.tag.tags || []).includes(tagFilterType as 'review' | 'noteworthy' | 'careless')) {
                          return false;
                        }
                      }
                      const q = tagFilterStudent.trim().toLowerCase();
                      if (q) {
                        const hay = `${e.email} ${e.tag.examTitle || ''} ${e.tag.subjectName || ''} ${e.tag.qPreview || ''}`.toLowerCase();
                        if (!hay.includes(q)) return false;
                      }
                      return true;
                    });

                    const diffLabel: Record<string, string> = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
                    const flagLabel: Record<string, string> = {
                      review: 'مرور',
                      noteworthy: 'نکته‌دار',
                      careless: 'بی‌دقتی',
                    };

                    if (filtered.length === 0) {
                      return (
                        <div className="rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-8 text-center text-xs text-[var(--ink-muted)]">
                          <Tag className="mx-auto mb-2 h-6 w-6 opacity-50" />
                          هنوز تیک سوالی با این فیلتر ثبت نشده است.
                        </div>
                      );
                    }

                    return (
                      <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                        {filtered.slice(0, 100).map((item, idx) => {
                          const csvMeta = questionCsvLookup.get(item.qId);
                          const csvRef = csvMeta
                            ? formatAdminCsvQuestionRef(csvMeta, csvMeta.globalIdx)
                            : '';
                          return (
                            <div key={`${item.email}_${item.qId}_${idx}`} className="p-3.5 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-bold text-[var(--ink)]" dir="ltr">
                                    {item.email}
                                  </span>
                                  {item.tag.examTitle && (
                                    <span className="text-[var(--ink-muted)]">· {item.tag.examTitle}</span>
                                  )}
                                  {item.tag.subjectName && (
                                    <span className="text-teal-700 dark:text-teal-400 font-semibold">
                                      · {item.tag.subjectName}
                                    </span>
                                  )}
                                  {csvRef && (
                                    <span
                                      title={csvMeta?.csvFileName || undefined}
                                      className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-800 dark:text-indigo-300 tabular-nums"
                                    >
                                      {csvRef}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                                  {item.tag.difficulty && (
                                    <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink)]">
                                      {diffLabel[item.tag.difficulty] || item.tag.difficulty}
                                    </span>
                                  )}
                                  {(item.tag.tags || []).map((fl) => (
                                    <span
                                      key={fl}
                                      className="rounded-md bg-teal-700/10 px-2 py-0.5 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300"
                                    >
                                      {flagLabel[fl] || fl}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {item.tag.qPreview && (
                                <p className="text-xs leading-6 text-[var(--ink-muted)]">{item.tag.qPreview}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Sub-tab 1E: Server RLS Security */}
              {examSubTab === 'security' && (
                <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <span>قفل امنیتی آزمون‌های مخفی در Supabase (RLS)</span>
                  </div>
                  <p className="text-xs leading-6 text-[var(--ink-muted)]">
                    آزمون‌های مخفی در کلید جداگانه <code className="font-mono">baraat_exams_private_v1</code> ذخیره می‌شوند تا در مرورگر کاربران عادی لود نشوند. برای بستن کامل دسترسی مستقیم از طریق API، دستور زیر را یک بار در بخش SQL Editor پنل Supabase اجرا کنید:
                  </p>
                  <pre
                    dir="ltr"
                    className="overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] p-3.5 text-[11px] leading-5 text-[var(--ink)]"
                  >
                    {RLS_SQL_SNIPPET}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(RLS_SQL_SNIPPET);
                      setCopiedSql(true);
                      showToast('کد SQL قفل امنیتی کپی شد.');
                      setTimeout(() => setCopiedSql(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40"
                  >
                    {copiedSql ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedSql ? 'کپی شد' : 'کپی دستور SQL'}</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* ==================== SECTION 2: LAWS & DECISIONS ==================== */}
          {tab === 'laws' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] pb-3">
                {[
                  { id: 'list' as const, label: `فهرست قوانین (${toFa(laws.length)})` },
                  { id: 'import' as const, label: 'ورود گروهی فایل' },
                  { id: 'single' as const, label: 'ثبت ماده تکی' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setLawSubTab(st.id)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      lawSubTab === st.id
                        ? 'bg-[var(--ink)] text-[var(--surface)]'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {lawSubTab === 'list' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
                    <input
                      type="text"
                      value={lawListSearch}
                      onChange={(e) => setLawListSearch(e.target.value)}
                      placeholder="جستجو در نام قوانین ثبت‌شده..."
                      className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] py-2.5 pr-9 pl-3 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                    {filteredLaws.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[var(--ink-muted)]">قانونی یافت نشد.</div>
                    ) : (
                      filteredLaws.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                          <span className="font-bold text-[var(--ink)]">{l.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteLaw(l.id, l.name)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-bold text-red-600 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {lawSubTab === 'import' && (
                <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-extrabold text-[var(--ink)]">ورود قوانین یا آرای وحدت رویه از فایل</h2>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      فایل Excel · CSV یا JSON را انتخاب کنید. پس از ثبت، نسخه بانک به‌روزرسانی می‌شود.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={lawImportName}
                      onChange={(e) => setLawImportName(e.target.value)}
                      placeholder="نام قانون (اختیاری — اگر در فایل نیست)"
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lawImportReplace}
                        onChange={(e) => setLawImportReplace(e.target.checked)}
                        className="h-4 w-4 accent-teal-700"
                      />
                      <span>جایگزینی مواد قبلی در صورت هم‌نام بودن قانون</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>{lawImporting ? 'در حال ثبت...' : 'آپلود فایل قوانین'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv,.json"
                        onChange={handleUploadLaws}
                        disabled={lawImporting}
                        className="hidden"
                      />
                    </label>
                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-4 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>آپلود فایل آرای وحدت رویه</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv,.json"
                        onChange={handleUploadDecisions}
                        disabled={lawImporting}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {lawImportProgress && (
                    <p className="text-xs font-bold text-teal-700 dark:text-teal-400 tabular-nums">{lawImportProgress}</p>
                  )}
                </div>
              )}

              {lawSubTab === 'single' && (
                <form
                  onSubmit={handleAddSingleArticle}
                  className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3"
                >
                  <h2 className="text-sm font-extrabold text-[var(--ink)]">افزودن ماده قانونی تکی</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      value={singleLaw}
                      onChange={(e) => setSingleLaw(e.target.value)}
                      placeholder="نام قانون (مثلاً قانون مدنی)"
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                    <input
                      type="text"
                      value={singleNum}
                      onChange={(e) => setSingleNum(e.target.value)}
                      placeholder="شماره ماده (مثلاً ۱۸۳)"
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                    <input
                      type="text"
                      value={singlePath}
                      onChange={(e) => setSinglePath(e.target.value)}
                      placeholder="مسیر ساختاری (کتاب > باب > فصل)"
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>
                  <textarea
                    rows={4}
                    value={singleText}
                    onChange={(e) => setSingleText(e.target.value)}
                    placeholder="متن کامل ماده قانونی و تبصره‌ها..."
                    className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                  >
                    <Plus className="h-4 w-4" />
                    <span>ثبت ماده در بانک</span>
                  </button>
                </form>
              )}
            </>
          )}

          {/* ==================== SECTION 3: ARTICLES ==================== */}
          {tab === 'articles' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'list' as const, label: `مقالات منتشرشده (${toFa(journalArticles.length)})` },
                    { id: 'create' as const, label: 'انتشار مقاله جدید' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setArticleSubTab(st.id)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        articleSubTab === st.id
                          ? 'bg-[var(--ink)] text-[var(--surface)]'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <Link
                  to="/articles"
                  className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-400"
                >
                  مشاهده نشریه
                </Link>
              </div>

              {articleSubTab === 'list' ? (
                <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                  {journalArticles.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--ink-muted)]">هنوز مقاله‌ای منتشر نشده است.</div>
                  ) : (
                    journalArticles.map((art) => (
                      <div key={art.id} className="flex items-center justify-between gap-3 px-4 py-3.5 text-xs">
                        <div className="min-w-0">
                          <p className="font-extrabold text-[var(--ink)] truncate">{art.title}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                            {art.category} · {art.author} · {art.date}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`حذف مقاله «${art.title}»؟`)) {
                              setJournalArticles(journalArticles.filter((a) => a.id !== art.id));
                            }
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-bold text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <form
                  onSubmit={handleCreateJournalArticle}
                  className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      value={jaTitle}
                      onChange={(e) => setJaTitle(e.target.value)}
                      placeholder="عنوان مقاله *"
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600 sm:col-span-2"
                    />
                    <select
                      value={jaCat}
                      onChange={(e) => setJaCat(e.target.value)}
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none"
                    >
                      {['حقوق مدنی', 'حقوق کیفری', 'آیین دادرسی', 'حقوق تجارت', 'حقوق ثبت و املاک', 'تحلیل رویه قضایی'].map(
                        (c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={jaAuthor}
                      onChange={(e) => setJaAuthor(e.target.value)}
                      placeholder="نویسنده"
                      className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--ink-muted)] hover:border-teal-600">
                      <span>{jaCover ? 'تصویر شاخص انتخاب شد' : 'انتخاب تصویر شاخص (اختیاری)'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const url = await compressImageFile(f);
                            setJaCover(url);
                          } catch {
                            showToast('خطا در پردازش تصویر.');
                          }
                        }}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={jaAbstract}
                    onChange={(e) => setJaAbstract(e.target.value)}
                    placeholder="چکیده کوتاه مقاله"
                    className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                  />
                  <textarea
                    rows={7}
                    value={jaContent}
                    onChange={(e) => setJaContent(e.target.value)}
                    placeholder="متن کامل مقاله حقوقی..."
                    className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 text-xs leading-7 text-[var(--ink)] outline-none focus:border-teal-600"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={jaFeatured}
                        onChange={(e) => setJaFeatured(e.target.checked)}
                        className="h-4 w-4 accent-teal-700"
                      />
                      <span>نمایش به‌عنوان مقاله برگزیده</span>
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                    >
                      انتشار مقاله
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ==================== SECTION 4: TOOLS ==================== */}
          {tab === 'tools' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'deadlines' as const, label: `مواعد قانونی (${toFa(deadlines.length)})` },
                    { id: 'calcs' as const, label: `محاسبه‌گرها (${toFa(customCalcs.length)})` },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setToolSubTab(st.id)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        toolSubTab === st.id
                          ? 'bg-[var(--ink)] text-[var(--surface)]'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toolSubTab === 'deadlines'
                      ? setDeadlines(DEFAULT_DEADLINES)
                      : setCustomCalcs(DEFAULT_CUSTOM_CALCS)
                  }
                  className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-400"
                >
                  بازنشانی به پیش‌فرض
                </button>
              </div>

              {toolSubTab === 'deadlines' ? (
                <div className="space-y-4">
                  <form
                    onSubmit={handleCreateDeadline}
                    className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 space-y-3"
                  >
                    <h2 className="text-xs font-extrabold text-[var(--ink)]">افزودن موعد قانونی جدید</h2>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                      <input
                        type="text"
                        value={dlTitle}
                        onChange={(e) => setDlTitle(e.target.value)}
                        placeholder="عنوان موعد *"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600 lg:col-span-2"
                      />
                      <input
                        type="text"
                        value={dlLaw}
                        onChange={(e) => setDlLaw(e.target.value)}
                        placeholder="مستند قانونی"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                      <select
                        value={dlCat}
                        onChange={(e) => setDlCat(e.target.value)}
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none"
                      >
                        {['مدنی', 'کیفری', 'ثبتی', 'دیوان عدالت', 'مالیاتی'].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={dlIran}
                        onChange={(e) => setDlIran(Number(e.target.value))}
                        placeholder="مهلت داخل (روز)"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none tabular-nums"
                      />
                      <input
                        type="number"
                        value={dlAbroad}
                        onChange={(e) => setDlAbroad(Number(e.target.value))}
                        placeholder="مهلت خارج (روز)"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none tabular-nums"
                      />
                      <input
                        type="text"
                        value={dlDesc}
                        onChange={(e) => setDlDesc(e.target.value)}
                        placeholder="توضیح کوتاه"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600 sm:col-span-2"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                    >
                      افزودن موعد
                    </button>
                  </form>

                  <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                    {deadlines.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                        <div>
                          <span className="font-bold text-[var(--ink)]">{d.title}</span>
                          <span className="mr-2 text-[var(--ink-muted)] tabular-nums">
                            {d.law} · داخل {toFa(d.daysIran)} روز · خارج {toFa(d.daysAbroad)} روز
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeadlines(deadlines.filter((x) => x.id !== d.id))}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/10"
                          title="حذف موعد"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <form
                    onSubmit={handleCreateCalc}
                    className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 space-y-3"
                  >
                    <h2 className="text-xs font-extrabold text-[var(--ink)]">افزودن محاسبه‌گر جدید</h2>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <input
                        type="text"
                        value={ccTitle}
                        onChange={(e) => setCcTitle(e.target.value)}
                        placeholder="عنوان محاسبه‌گر *"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                      <select
                        value={ccType}
                        onChange={(e) => setCcType(e.target.value as 'percent' | 'daily' | 'fixed')}
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none"
                      >
                        <option value="percent">درصد از مبلغ</option>
                        <option value="daily">روزشمار</option>
                        <option value="fixed">مبلغ ثابت</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        value={ccRate}
                        onChange={(e) => setCcRate(Number(e.target.value))}
                        placeholder="نرخ / درصد"
                        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none tabular-nums"
                      />
                    </div>
                    <input
                      type="text"
                      value={ccDesc}
                      onChange={(e) => setCcDesc(e.target.value)}
                      placeholder="توضیح فرمول و مستند قانونی"
                      className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                    >
                      ثبت محاسبه‌گر
                    </button>
                  </form>

                  <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                    {customCalcs.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                        <div>
                          <span className="font-bold text-[var(--ink)]">{c.title}</span>
                          <span className="mr-2 text-[var(--ink-muted)] tabular-nums">
                            ({c.type} · {toFa(c.rate)})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCustomCalcs(customCalcs.filter((x) => x.id !== c.id))}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/10"
                          title="حذف محاسبه‌گر"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ==================== SECTION 5: STUDENTS & QA ==================== */}
          {tab === 'students' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] pb-3">
                {[
                  { id: 'qa' as const, label: `پرسش‌های داوطلبان (${toFa(Object.keys(questions).length)})` },
                  { id: 'progress' as const, label: `پیشرفت دانشجویان (${toFa(studentRows.length)})` },
                  { id: 'assign' as const, label: 'ارسال برنامه اختصاصی' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStudentSubTab(st.id)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      studentSubTab === st.id
                        ? 'bg-[var(--ink)] text-[var(--surface)]'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {studentSubTab === 'qa' && (
                <div className="space-y-3">
                  {Object.values(questions).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-8 text-center text-xs text-[var(--ink-muted)]">
                      هنوز پرسشی ثبت نشده است.
                    </div>
                  ) : (
                    Object.values(questions)
                      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                      .map((q) => (
                        <div
                          key={q.id}
                          className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ink-muted)]">
                            <span className="font-bold text-[var(--ink)]">
                              {q.userName || q.email} · {q.subject || 'عمومی'}
                            </span>
                            <span>{q.reply ? 'پاسخ داده‌شده' : 'در انتظار پاسخ'}</span>
                          </div>
                          <p className="text-xs leading-6 text-[var(--ink)]">{q.question}</p>
                          {q.reply && (
                            <p className="rounded-lg border border-teal-600/25 bg-teal-600/5 p-2.5 text-xs leading-6 text-[var(--ink)]">
                              <span className="font-bold text-teal-700 dark:text-teal-400">پاسخ ثبت‌شده: </span>
                              {q.reply}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={replyDrafts[q.id] ?? q.reply ?? ''}
                              onChange={(e) => setReplyDrafts((p) => ({ ...p, [q.id]: e.target.value }))}
                              placeholder="پاسخ تخصصی و مستند به ماده قانونی..."
                              className="flex-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                            />
                            <button
                              type="button"
                              onClick={() => handleReplyQuestion(q.id)}
                              className="shrink-0 whitespace-nowrap rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                            >
                              ثبت پاسخ
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}

              {studentSubTab === 'progress' && (
                <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] divide-y divide-[var(--hairline)]">
                  {studentRows.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--ink-muted)]">
                      دانشجوی فعالی ثبت نشده است.
                    </div>
                  ) : (
                    studentRows.map((s) => (
                      <div key={s.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                        <span className="font-bold text-[var(--ink)]" dir="ltr">
                          {s.email || s.user_id.slice(0, 10)}
                        </span>
                        <div className="flex items-center gap-4 tabular-nums">
                          <span className="text-[var(--ink-muted)]">{toFa(s.totalBlocks || 0)} مبحث</span>
                          <span className="font-extrabold text-teal-700 dark:text-teal-400">
                            {toFa(s.pct || 0)}٪ پیشرفت
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {studentSubTab === 'assign' && (
                <form
                  onSubmit={handleAssignPlan}
                  className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3"
                >
                  <div>
                    <h2 className="text-sm font-extrabold text-[var(--ink)]">ارسال برنامه اختصاصی برای دانشجو</h2>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                      برنامه JSON واردشده هنگام ورود کاربر با ایمیل مشخص‌شده به‌صورت خودکار جایگزین می‌شود.
                    </p>
                  </div>
                  <input
                    type="email"
                    dir="ltr"
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                  />
                  <textarea
                    rows={6}
                    dir="ltr"
                    value={assignJson}
                    onChange={(e) => setAssignJson(e.target.value)}
                    placeholder="ساختار JSON برنامه مطالعاتی..."
                    className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 font-mono text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                  >
                    ارسال و ثبت برنامه
                  </button>
                </form>
              )}
            </>
          )}

          {/* ==================== SECTION 6: SETTINGS & EMAIL OTP ==================== */}
          {tab === 'settings' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] pb-3">
                {[
                  { id: 'site' as const, label: 'درباره ما و تماس' },
                  { id: 'email' as const, label: 'تأیید ایمیل (OTP)' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSettingSubTab(st.id)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      settingSubTab === st.id
                        ? 'bg-[var(--ink)] text-[var(--surface)]'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {settingSubTab === 'site' ? (
                <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-4">
                  <h2 className="text-sm font-extrabold text-[var(--ink)]">ویرایش صفحه درباره ما و اطلاعات تماس</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">عنوان معرفی</label>
                      <input
                        type="text"
                        value={aboutTitle}
                        onChange={(e) => setAboutTitle(e.target.value)}
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">ایمیل رسمی</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">تلفن ثابت</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">تلفن همراه</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={contactMobile}
                        onChange={(e) => setContactMobile(e.target.value)}
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">نشانی دفتر</label>
                    <input
                      type="text"
                      value={contactAddress}
                      onChange={(e) => setContactAddress(e.target.value)}
                      className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[var(--ink-muted)]">شرح رسالت گروه</label>
                    <textarea
                      rows={3}
                      value={aboutMission}
                      onChange={(e) => setAboutMission(e.target.value)}
                      className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await setAbout({ ...about, title: aboutTitle, mission: aboutMission });
                      await setContact({
                        ...contact,
                        phone: contactPhone,
                        mobile: contactMobile,
                        email: contactEmail,
                        address: contactAddress,
                      });
                    }}
                    className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                  >
                    ذخیره تنظیمات سایت
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]">
                    <Mail className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <span>تنظیمات ارسال کد تأیید ایمیل (OTP) هنگام ثبت‌نام</span>
                  </div>
                  <p className="text-xs leading-6 text-[var(--ink-muted)]">
                    بخش ورود کد تأیید ایمیل در فرم ثبت‌نام فعال است. برای ارسال کد ۶ رقمی به جای لینک ساده، این دو گام را در پنل Supabase انجام دهید:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-xs leading-6 text-[var(--ink)]">
                    <li>
                      در مسیر <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px]">Authentication → Providers → Email</code> گزینه <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px]">Confirm email</code> را روشن کنید.
                    </li>
                    <li>
                      در مسیر <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px]">Authentication → Email Templates → Confirm signup</code> متغیر <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px]">{'{{ .Token }}'}</code> را در متن ایمیل قرار دهید.
                    </li>
                  </ol>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
