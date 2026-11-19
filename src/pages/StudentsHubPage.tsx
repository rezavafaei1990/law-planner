import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  CalendarDays,
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  Plus,
  Trash2,
  Paperclip,
  Eye,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
  FolderOpen,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Copy,
  StickyNote,
  Search,
  Play,
  Layers,
} from 'lucide-react';
import studentBannerImg from '../assets/images/student_study_library_1794776843555.jpg';
import { useBaraat, EMPTY_PLANNER } from '../context/BaraatContext';
import type {
  StudyBlock,
  StudyDay,
  PlannerState,
  PlannerFileAttachment,
  LegalExam,
  ExamAttemptResult,
  ExamAttemptQuestionSnapshot,
  ExamQuestionDifficulty,
  ExamQuestionFlagTag,
  ExamQuestionTagState,
  QuestionReplyItem,
} from '../types';
import { uploadPlannerAttachment, getSignedAttachmentUrl } from '../services/supabase';
import { toFa, formatJalaali, normalizeSourceTag, buildQuestionSourceLabel, formatAdminCsvQuestionRef } from '../utils/legal';
import { updateDocumentSeo } from '../utils/seo';

function formatQuestionSourceNotice(label?: string): string {
  return normalizeSourceTag(label || '');
}

const SUBJECT_COLOR_THEMES = [
  {
    card: 'border-teal-500/30 border-r-4 border-r-teal-600 bg-teal-50/55 dark:bg-teal-950/25 dark:border-teal-500/30 dark:border-r-teal-400',
    badge: 'bg-teal-600/15 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300',
    accentText: 'text-teal-700 dark:text-teal-300',
  },
  {
    card: 'border-blue-500/30 border-r-4 border-r-blue-600 bg-blue-50/55 dark:bg-blue-950/25 dark:border-blue-500/30 dark:border-r-blue-400',
    badge: 'bg-blue-600/15 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300',
    accentText: 'text-blue-700 dark:text-blue-300',
  },
  {
    card: 'border-amber-500/35 border-r-4 border-r-amber-500 bg-amber-50/60 dark:bg-amber-950/25 dark:border-amber-500/30 dark:border-r-amber-400',
    badge: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
    accentText: 'text-amber-700 dark:text-amber-300',
  },
  {
    card: 'border-rose-500/30 border-r-4 border-r-rose-600 bg-rose-50/55 dark:bg-rose-950/25 dark:border-rose-500/30 dark:border-r-rose-400',
    badge: 'bg-rose-600/15 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300',
    accentText: 'text-rose-700 dark:text-rose-300',
  },
  {
    card: 'border-violet-500/30 border-r-4 border-r-violet-600 bg-violet-50/55 dark:bg-violet-950/25 dark:border-violet-500/30 dark:border-r-violet-400',
    badge: 'bg-violet-600/15 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300',
    accentText: 'text-violet-700 dark:text-violet-300',
  },
  {
    card: 'border-orange-500/35 border-r-4 border-r-orange-500 bg-orange-50/60 dark:bg-orange-950/25 dark:border-orange-500/30 dark:border-r-orange-400',
    badge: 'bg-orange-500/15 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300',
    accentText: 'text-orange-700 dark:text-orange-300',
  },
  {
    card: 'border-cyan-500/30 border-r-4 border-r-cyan-600 bg-cyan-50/55 dark:bg-cyan-950/25 dark:border-cyan-500/30 dark:border-r-cyan-400',
    badge: 'bg-cyan-600/15 text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-300',
    accentText: 'text-cyan-700 dark:text-cyan-300',
  },
  {
    card: 'border-fuchsia-500/30 border-r-4 border-r-fuchsia-600 bg-fuchsia-50/55 dark:bg-fuchsia-950/25 dark:border-fuchsia-500/30 dark:border-r-fuchsia-400',
    badge: 'bg-fuchsia-600/15 text-fuchsia-800 dark:bg-fuchsia-400/15 dark:text-fuchsia-300',
    accentText: 'text-fuchsia-700 dark:text-fuchsia-300',
  },
];

const KNOWN_SUBJECT_THEME_IDX: Record<string, number> = {
  sub_civil: 0,
  sub_civ_proc: 1,
  sub_commerce: 2,
  sub_crim_gen: 3,
  sub_crim_spec: 4,
  sub_crim_proc: 5,
  sub_osoul: 6,
};

function getSubjectColorTheme(subjectId?: string, subjectName?: string, lawName?: string) {
  if (subjectId && KNOWN_SUBJECT_THEME_IDX[subjectId] !== undefined) {
    return SUBJECT_COLOR_THEMES[KNOWN_SUBJECT_THEME_IDX[subjectId]];
  }
  const key = `${subjectName || ''}|${lawName || ''}`.trim();
  if (/دادرسی مدنی|اجرای احکام/i.test(key)) return SUBJECT_COLOR_THEMES[1];
  if (/تجارت|چک/i.test(key)) return SUBJECT_COLOR_THEMES[2];
  if (/جزای عمومی/i.test(key)) return SUBJECT_COLOR_THEMES[3];
  if (/جزای اختصاصی|مجازات|جزا/i.test(key)) return SUBJECT_COLOR_THEMES[4];
  if (/دادرسی کیفری/i.test(key)) return SUBJECT_COLOR_THEMES[5];
  if (/اصول فقه|فقه/i.test(key)) return SUBJECT_COLOR_THEMES[6];
  if (/مدنی/i.test(key)) return SUBJECT_COLOR_THEMES[0];
  let hash = 0;
  const seed = (subjectId || key || 'default').trim();
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_COLOR_THEMES[hash % SUBJECT_COLOR_THEMES.length];
}

const EXAM_DIFFICULTY_OPTIONS: { id: ExamQuestionDifficulty; label: string; activeCls: string; dotCls: string }[] = [
  {
    id: 'easy',
    label: 'آسان',
    activeCls: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 shadow-2xs',
    dotCls: 'bg-emerald-500',
  },
  {
    id: 'medium',
    label: 'متوسط',
    activeCls: 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300 shadow-2xs',
    dotCls: 'bg-amber-500',
  },
  {
    id: 'hard',
    label: 'سخت',
    activeCls: 'border-rose-500/60 bg-rose-500/15 text-rose-800 dark:text-rose-300 shadow-2xs',
    dotCls: 'bg-rose-500',
  },
];

const EXAM_FLAG_OPTIONS: { id: ExamQuestionFlagTag; label: string; activeCls: string }[] = [
  {
    id: 'review',
    label: 'مرور',
    activeCls: 'border-sky-500/60 bg-sky-500/15 text-sky-800 dark:text-sky-300 shadow-2xs',
  },
  {
    id: 'noteworthy',
    label: 'نکته‌دار',
    activeCls: 'border-violet-500/60 bg-violet-500/15 text-violet-800 dark:text-violet-300 shadow-2xs',
  },
  {
    id: 'careless',
    label: 'بی‌دقتی',
    activeCls: 'border-orange-500/60 bg-orange-500/15 text-orange-800 dark:text-orange-300 shadow-2xs',
  },
];

type StudentTab = 'overview' | 'days' | 'sections' | 'exams' | 'notes' | 'qa';

const CHECK_LABELS = ['مطالعه نص', 'تست', 'مرور'];
const MASTERY_OPTIONS = ['', 'نیاز به مرور', 'متوسط', 'مسلط'];

function createBlockDefaults(partial: Partial<StudyBlock>): StudyBlock {
  return {
    id: partial.id || `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    subjectId: partial.subjectId || 'sub_civil',
    law: partial.law || 'قانون مدنی',
    spec: partial.spec || '',
    title: partial.title || 'مبحث مطالعاتی',
    task: partial.task || '',
    items: partial.items?.length === 3 ? partial.items : CHECK_LABELS,
    checks: partial.checks?.length === 3 ? partial.checks : [false, false, false],
    notes: partial.notes || '',
    mastery: partial.mastery || '',
    files: partial.files || [],
    open: partial.open ?? true,
  };
}

function summarizePlanner(state: PlannerState) {
  const allBlocks: StudyBlock[] = [
    ...(state.days || []).flatMap((d) => d.blocks || []),
    ...(state.subjectSections || []),
  ];
  let doneChecks = 0;
  let totalChecks = 0;
  for (const b of allBlocks) {
    const ch = b.checks || [false, false, false];
    totalChecks += ch.length || 3;
    doneChecks += ch.filter(Boolean).length;
  }
  const pct = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 0;
  return {
    totalBlocks: allBlocks.length,
    doneChecks,
    pct,
    updatedAt: new Date().toISOString(),
  };
}

const ProgressRing: React.FC<{ pct: number; size?: number }> = ({ pct, size = 64 }) => {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-200 dark:text-slate-700/70"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-teal-700 dark:text-teal-400 transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute text-xs font-extrabold text-[var(--ink)] tabular-nums">
        {toFa(clamped)}٪
      </span>
    </div>
  );
};

export const StudentsHubPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    laws,
    user,
    isAdmin,
    openAuthModal,
    planner,
    updatePlanner,
    exams,
    examAttempts,
    recordExamAttempt,
    examNotes,
    saveExamNote,
    examTags,
    saveExamTag,
    questions,
    setQuestions,
    showToast,
  } = useBaraat();

  const initialTab: StudentTab = location.pathname.startsWith('/exams')
    ? 'exams'
    : location.pathname.startsWith('/planner')
      ? 'days'
      : 'overview';

  const [activeTab, setActiveTab] = useState<StudentTab>(initialTab);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [expandedDayIds, setExpandedDayIds] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ name: string; url: string; type?: string } | null>(null);

  // Add Day / Block forms
  const [newBlockTitle, setNewBlockTitle] = useState('');
  const [newBlockSubjectId, setNewBlockSubjectId] = useState(planner.subjects[0]?.id || 'sub_civil');
  const [newBlockLaw, setNewBlockLaw] = useState('قانون مدنی');
  const [newBlockSpec, setNewBlockSpec] = useState('1-30');
  const [newBlockTargetDayId, setNewBlockTargetDayId] = useState<string>('sections');

  // Exam browser & runner state
  const [examHubSection, setExamHubSection] = useState<'exams' | 'lessons'>('exams');
  const [lessonSearch, setLessonSearch] = useState('');
  const [selectedExamCat, setSelectedExamCat] = useState<string>('all');
  const [selectedExamYear, setSelectedExamYear] = useState<string>('all');
  const [selectedExamType, setSelectedExamType] = useState<string>('all');
  const [selectedExamChapter, setSelectedExamChapter] = useState<string>('all');
  const [examSearch, setExamSearch] = useState('');
  const [activeExam, setActiveExam] = useState<LegalExam | null>(null);
  const [activeExamMode, setActiveExamMode] = useState<'exam' | 'study'>('study');
  const [revealedQIds, setRevealedQIds] = useState<Record<string, boolean>>({});
  const [examAnswers, setExamAnswers] = useState<Record<string, number>>({});
  const [examSecondsLeft, setExamSecondsLeft] = useState<number>(0);
  const [inspectedAttempt, setInspectedAttempt] = useState<ExamAttemptResult | null>(null);
  const [examNoteDrafts, setExamNoteDrafts] = useState<Record<string, string>>({});
  const [copiedQId, setCopiedQId] = useState<string | null>(null);

  // Exam Notebook (دفترچه نکات و مرور آزمونی) state
  const [nbGroupBy, setNbGroupBy] = useState<'subject' | 'exam'>('subject');
  const [nbFilter, setNbFilter] = useState<
    'all' | 'noted' | 'review' | 'noteworthy' | 'careless' | 'hard' | 'medium' | 'easy' | 'wrong'
  >('all');
  const [nbSelectedGroup, setNbSelectedGroup] = useState<string>('all');
  const [nbSearch, setNbSearch] = useState('');
  const [nbExpandedQIds, setNbExpandedQIds] = useState<Record<string, boolean>>({});

  // QA state
  const [qaSubject, setQaSubject] = useState('حقوق مدنی');
  const [qaText, setQaText] = useState('');
  const [qaSubmitting, setQaSubmitting] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith('/exams')) setActiveTab('exams');
    else if (location.pathname.startsWith('/planner')) setActiveTab('days');
  }, [location.pathname]);

  useEffect(() => {
    if (activeTab === 'exams') {
      updateDocumentSeo({
        title: 'آزمون‌های آنلاین حقوقی و کارنامه تفکیکی | گروه حقوقی برائت',
        description: 'شرکت در آزمون‌های آزمایشی حقوقی با زمان‌بندی و تحلیل درصد هر درس.',
        canonicalPath: '/exams',
      });
    } else if (activeTab === 'days' || activeTab === 'sections') {
      updateDocumentSeo({
        title: 'برنامه مطالعاتی هوشمند آزمون وکالت و قضاوت | برائت',
        description: 'مدیریت روزانه و درس‌به‌درس مطالعه قوانین مادر با چک‌لیست مرور و ثبت اشکالات.',
        canonicalPath: '/planner',
      });
    } else {
      updateDocumentSeo({
        title: 'باشگاه دانشجویان حقوق و برنامه مطالعاتی | گروه حقوقی برائت',
        description: 'داشبورد پیشرفت دروس، برنامه مطالعاتی ۹۰ روزه، ثبت ایرادات و آزمون‌های حقوقی.',
        canonicalPath: '/students',
      });
    }
  }, [activeTab]);

  // Active exam countdown timer
  useEffect(() => {
    if (!activeExam || activeExamMode !== 'exam' || examSecondsLeft <= 0) return;
    const t = setInterval(() => {
      setExamSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeExam, activeExamMode, examSecondsLeft]);

  const subjectSummaries = useMemo(() => {
    const subjects = planner.subjects?.length ? planner.subjects : EMPTY_PLANNER.subjects;
    const allBlocks: StudyBlock[] = [
      ...(planner.days || []).flatMap((d) => d.blocks || []),
      ...(planner.subjectSections || []),
    ];

    return subjects.map((sub) => {
      const blocks = allBlocks.filter((b) => b.subjectId === sub.id);
      let done = 0;
      let total = 0;
      let mastered = 0;
      let noted = 0;
      for (const b of blocks) {
        const checks = b.checks || [false, false, false];
        total += checks.length || 3;
        done += checks.filter(Boolean).length;
        if (b.mastery === 'مسلط') mastered += 1;
        if ((b.notes || '').trim().length > 0) noted += 1;
      }
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        ...sub,
        blocksCount: blocks.length,
        doneChecks: done,
        totalChecks: total,
        masteredCount: mastered,
        notedCount: noted,
        pct,
      };
    });
  }, [planner]);

  const overallSummary = useMemo(() => summarizePlanner(planner), [planner]);

  const commitPlanner = async (nextState: PlannerState, toast?: string) => {
    const withSummary: PlannerState = {
      ...nextState,
      _summary: summarizePlanner(nextState),
    };
    await updatePlanner(withSummary);
    if (toast) showToast(toast);
  };

  const handleToggleCheck = async (scope: 'day' | 'section', dayId: string | null, blockId: string, idx: number) => {
    if (!user) {
      openAuthModal();
      return;
    }
    const updateBlock = (b: StudyBlock): StudyBlock => {
      if (b.id !== blockId) return b;
      const checks = [...(b.checks || [false, false, false])];
      checks[idx] = !checks[idx];
      return { ...b, checks };
    };

    const next: PlannerState =
      scope === 'day'
        ? {
            ...planner,
            days: (planner.days || []).map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map(updateBlock) } : d)),
          }
        : {
            ...planner,
            subjectSections: (planner.subjectSections || []).map(updateBlock),
          };

    await commitPlanner(next);
  };

  const handleMasteryChange = async (scope: 'day' | 'section', dayId: string | null, blockId: string, mastery: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    const updateBlock = (b: StudyBlock) => (b.id === blockId ? { ...b, mastery } : b);
    const next: PlannerState =
      scope === 'day'
        ? {
            ...planner,
            days: (planner.days || []).map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map(updateBlock) } : d)),
          }
        : {
            ...planner,
            subjectSections: (planner.subjectSections || []).map(updateBlock),
          };
    await commitPlanner(next);
  };

  const handleSaveNotes = async (scope: 'day' | 'section', dayId: string | null, blockId: string, notes: string, notify = false) => {
    if (!user) {
      openAuthModal();
      return;
    }
    const updateBlock = (b: StudyBlock) => (b.id === blockId ? { ...b, notes } : b);
    const next: PlannerState =
      scope === 'day'
        ? {
            ...planner,
            days: (planner.days || []).map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map(updateBlock) } : d)),
          }
        : {
            ...planner,
            subjectSections: (planner.subjectSections || []).map(updateBlock),
          };
    await commitPlanner(next, notify ? 'یادداشت و اشکالات در سرور ذخیره شد.' : undefined);
  };

  const handleUploadFile = async (
    scope: 'day' | 'section',
    dayId: string | null,
    blockId: string,
    file: File
  ) => {
    if (!user) {
      openAuthModal();
      return;
    }
    setUploadingBlockId(blockId);
    try {
      const uploaded = await uploadPlannerAttachment(user.id, file);
      const attachment: PlannerFileAttachment = {
        id: `att_${Date.now()}`,
        name: uploaded.name,
        type: uploaded.type,
        path: uploaded.path,
        dataUrl: uploaded.dataUrl,
        size: uploaded.size,
      };
      const updateBlock = (b: StudyBlock) =>
        b.id === blockId ? { ...b, files: [...(b.files || []), attachment] } : b;
      const next: PlannerState =
        scope === 'day'
          ? {
              ...planner,
              days: (planner.days || []).map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map(updateBlock) } : d)),
            }
          : {
              ...planner,
              subjectSections: (planner.subjectSections || []).map(updateBlock),
            };
      await commitPlanner(next, 'فایل پیوست با موفقیت ذخیره شد.');
    } catch {
      showToast('خطا در بارگذاری فایل پیوست.');
    } finally {
      setUploadingBlockId(null);
    }
  };

  const handleRemoveFile = async (scope: 'day' | 'section', dayId: string | null, blockId: string, idx: number) => {
    if (!user) return;
    const updateBlock = (b: StudyBlock) => {
      if (b.id !== blockId) return b;
      const files = [...(b.files || [])];
      files.splice(idx, 1);
      return { ...b, files };
    };
    const next: PlannerState =
      scope === 'day'
        ? {
            ...planner,
            days: (planner.days || []).map((d) => (d.id === dayId ? { ...d, blocks: d.blocks.map(updateBlock) } : d)),
          }
        : {
            ...planner,
            subjectSections: (planner.subjectSections || []).map(updateBlock),
          };
    await commitPlanner(next, 'پیوست حذف شد.');
  };

  const handleOpenAttachment = async (att: PlannerFileAttachment) => {
    if (att.dataUrl) {
      setPreviewAttachment({ name: att.name, url: att.dataUrl, type: att.type });
      return;
    }
    if (att.path) {
      const url = await getSignedAttachmentUrl(att.path);
      if (url) {
        setPreviewAttachment({ name: att.name, url, type: att.type });
        return;
      }
    }
    showToast('امکان باز کردن این پیوست وجود ندارد.');
  };

  const handleAddDay = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    const nextNum = (planner.days || []).reduce((m, d) => Math.max(m, d.number || 0), 0) + 1;
    const newDay: StudyDay = {
      id: `day_${Date.now()}`,
      number: nextNum,
      blocks: [],
      open: true,
    };
    setExpandedDayIds((p) => ({ ...p, [newDay.id]: true }));
    await commitPlanner({ ...planner, days: [...(planner.days || []), newDay] }, `روز ${toFa(nextNum)} اضافه شد.`);
  };

  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!newBlockTitle.trim()) {
      showToast('عنوان مبحث را وارد کنید.');
      return;
    }
    const block = createBlockDefaults({
      subjectId: newBlockSubjectId,
      law: newBlockLaw,
      spec: newBlockSpec.trim(),
      title: newBlockTitle.trim(),
    });
    if (newBlockTargetDayId === 'sections') {
      await commitPlanner(
        { ...planner, subjectSections: [...(planner.subjectSections || []), block] },
        'بخش مطالعاتی به برنامه درس‌محور اضافه شد.'
      );
    } else {
      await commitPlanner(
        {
          ...planner,
          days: (planner.days || []).map((d) =>
            d.id === newBlockTargetDayId ? { ...d, blocks: [...d.blocks, block] } : d
          ),
        },
        'بخش مطالعاتی به روز انتخابی اضافه شد.'
      );
    }
    setNewBlockTitle('');
  };

  const handleDeleteBlock = async (scope: 'day' | 'section', dayId: string | null, blockId: string) => {
    if (!user) return;
    const next: PlannerState =
      scope === 'day'
        ? {
            ...planner,
            days: (planner.days || []).map((d) =>
              d.id === dayId ? { ...d, blocks: d.blocks.filter((b) => b.id !== blockId) } : d
            ),
          }
        : {
            ...planner,
            subjectSections: (planner.subjectSections || []).filter((b) => b.id !== blockId),
          };
    await commitPlanner(next, 'بخش مطالعاتی حذف شد.');
  };

  const exportPlannerBackup = () => {
    const blob = new Blob([JSON.stringify(planner, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `baraat-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('فایل پشتیبان برنامه دانلود شد.');
  };

  const visibleExams = useMemo(
    () => (isAdmin ? exams : exams.filter((e) => e.isPublished !== false)),
    [exams, isAdmin]
  );

  const examCategoriesSummary = useMemo(() => {
    const map = new Map<
      string,
      { name: string; examCount: number; qCount: number; years: Set<string>; types: Set<string>; chapters: Set<string> }
    >();
    for (const ex of visibleExams) {
      const cat = ex.category?.trim() || ex.subjects[0]?.name || 'سایر آزمون‌ها';
      if (!map.has(cat)) {
        map.set(cat, { name: cat, examCount: 0, qCount: 0, years: new Set(), types: new Set(), chapters: new Set() });
      }
      const entry = map.get(cat)!;
      entry.examCount += 1;
      if (ex.year) entry.years.add(ex.year);
      if (ex.examType) entry.types.add(ex.examType);
      for (const sb of ex.subjects) {
        entry.qCount += sb.questions.length;
        for (const q of sb.questions) {
          if (q.chapter) entry.chapters.add(q.chapter);
        }
      }
    }
    return Array.from(map.values());
  }, [visibleExams]);

  const categoryScopedExams = useMemo(() => {
    return visibleExams.filter((ex) => {
      const cat = ex.category?.trim() || ex.subjects[0]?.name || 'سایر آزمون‌ها';
      if (selectedExamCat !== 'all' && cat !== selectedExamCat) return false;
      if (selectedExamYear !== 'all' && (ex.year || '') !== selectedExamYear) return false;
      if (selectedExamType !== 'all' && (ex.examType || '') !== selectedExamType) return false;
      if (selectedExamChapter !== 'all') {
        const hasChap = ex.subjects.some((s) => s.questions.some((q) => q.chapter === selectedExamChapter));
        if (!hasChap) return false;
      }
      const qTxt = examSearch.trim().toLowerCase();
      if (qTxt) {
        const hay = `${ex.title} ${ex.category || ''} ${ex.examType || ''} ${ex.year || ''} ${ex.subjects.map((s) => s.name).join(' ')}`.toLowerCase();
        if (!hay.includes(qTxt)) return false;
      }
      return true;
    });
  }, [visibleExams, selectedExamCat, selectedExamYear, selectedExamType, selectedExamChapter, examSearch]);

  const activeCategoryFacets = useMemo(() => {
    const base =
      selectedExamCat === 'all'
        ? visibleExams
        : visibleExams.filter((ex) => (ex.category?.trim() || ex.subjects[0]?.name || 'سایر آزمون‌ها') === selectedExamCat);
    const years = Array.from(new Set(base.map((e) => e.year).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a));
    const types = Array.from(new Set(base.map((e) => e.examType).filter(Boolean) as string[]));
    const chapterCounts = new Map<string, number>();
    const subjectCounts = new Map<string, number>();
    for (const ex of base) {
      for (const sb of ex.subjects) {
        if (sb.name?.trim() && sb.questions.length > 0) {
          subjectCounts.set(sb.name.trim(), (subjectCounts.get(sb.name.trim()) || 0) + sb.questions.length);
        }
        for (const q of sb.questions) {
          if (q.chapter?.trim()) {
            chapterCounts.set(q.chapter.trim(), (chapterCounts.get(q.chapter.trim()) || 0) + 1);
          }
        }
      }
    }
    const useChapters = chapterCounts.size > 0;
    const topicSource = useChapters ? chapterCounts : subjectCounts;
    return {
      years,
      types,
      topicKind: (useChapters ? 'chapter' : 'subject') as 'chapter' | 'subject',
      chapters: Array.from(topicSource.entries()).map(([name, count]) => ({ name, count })),
    };
  }, [visibleExams, selectedExamCat]);

  const lessonBankSummary = useMemo(() => {
    const coreOrder = [
      'حقوق مدنی',
      'آیین دادرسی مدنی',
      'حقوق تجارت',
      'اصول فقه',
      'حقوق جزا',
      'آیین دادرسی کیفری',
    ];
    const map = new Map<
      string,
      {
        name: string;
        totalQ: number;
        exams: { examId: string; examTitle: string; year?: string; qCount: number }[];
        chapters: Set<string>;
      }
    >();
    for (const ex of visibleExams) {
      for (const sb of ex.subjects) {
        if (!sb.questions.length) continue;
        const sName = sb.name?.trim() || 'سایر دروس';
        if (!map.has(sName)) {
          map.set(sName, { name: sName, totalQ: 0, exams: [], chapters: new Set() });
        }
        const entry = map.get(sName)!;
        entry.totalQ += sb.questions.length;
        entry.exams.push({
          examId: ex.id,
          examTitle: ex.title,
          year: ex.year,
          qCount: sb.questions.length,
        });
        for (const q of sb.questions) {
          if (q.chapter?.trim()) entry.chapters.add(q.chapter.trim());
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const ia = coreOrder.indexOf(a.name);
      const ib = coreOrder.indexOf(b.name);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return b.totalQ - a.totalQ;
    });
  }, [visibleExams]);

  const myExamHistory = useMemo(() => {
    return examAttempts.filter((a) => {
      if (user) return a.userId === user.id || (a.userEmail && a.userEmail === user.email);
      return !a.userId;
    });
  }, [examAttempts, user]);

  const handleCopyQuestion = async (
    qItem: { id: string; q: string; options: string[]; answer: number; exp?: string; chapter?: string; sourceLabel?: string },
    subjectName?: string,
    qNumber?: number
  ) => {
    const headerParts = [
      qNumber ? `سوال ${toFa(qNumber)}` : 'سوال',
      subjectName || '',
      qItem.chapter ? `سرفصل: ${qItem.chapter}` : '',
      qItem.sourceLabel ? normalizeSourceTag(qItem.sourceLabel) : '',
    ].filter(Boolean);
    const lines: string[] = [
      headerParts.join(' · '),
      qItem.q,
      '',
      ...qItem.options.filter(Boolean).map((opt, idx) => `${toFa(idx + 1)}) ${opt}`),
      '',
      `پاسخ صحیح: گزینه ${toFa(qItem.answer + 1)}) ${qItem.options[qItem.answer] || ''}`,
    ];
    if (qItem.exp) {
      lines.push(`نکته و پاسخ تشریحی: ${qItem.exp}`);
    }
    const personalNote = (examNotes[qItem.id] || '').trim();
    if (personalNote) {
      lines.push(`نکته شخصی من: ${personalNote}`);
    }
    const payload = lines.join('\n');
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedQId(qItem.id);
    setTimeout(() => setCopiedQId((prev) => (prev === qItem.id ? null : prev)), 1800);
    showToast('سوال، گزینه‌ها، پاسخ صحیح و نکته کپی شد.');
  };

  const notebookEntries = useMemo(() => {
    type QLookup = {
      id: string;
      q: string;
      options: string[];
      answer: number;
      exp?: string;
      chapter?: string;
      sourceLabel?: string;
      examId?: string;
      examTitle: string;
      examYear?: string;
      subjectName: string;
      qNumber?: number;
    };

    const qMap = new Map<string, QLookup>();
    for (const ex of visibleExams) {
      for (const sb of ex.subjects) {
        sb.questions.forEach((q, idx) => {
          if (!qMap.has(q.id)) {
            qMap.set(q.id, {
              id: q.id,
              q: q.q,
              options: q.options || [],
              answer: q.answer,
              exp: q.exp,
              chapter: q.chapter,
              sourceLabel: q.sourceLabel || buildQuestionSourceLabel('', ex.examType, ex.year) || undefined,
              examId: ex.id,
              examTitle: ex.title,
              examYear: ex.year,
              subjectName: sb.name?.trim() || 'سایر دروس',
              qNumber: idx + 1,
            });
          }
        });
      }
    }

    const wrongInfoMap = new Map<string, { count: number; lastExamTitle: string; lastPicked?: number }>();
    for (const att of myExamHistory) {
      const snaps = att.questionsSnapshot || [];
      const ans = att.answers || {};
      snaps.forEach((sn, idx) => {
        if (!qMap.has(sn.id)) {
          qMap.set(sn.id, {
            id: sn.id,
            q: sn.q,
            options: sn.options || [],
            answer: sn.answer,
            exp: sn.exp,
            chapter: sn.chapter,
            sourceLabel: sn.sourceLabel,
            examId: att.examId,
            examTitle: att.examTitle,
            examYear: att.examYear,
            subjectName: sn.subjectName?.trim() || 'سایر دروس',
            qNumber: idx + 1,
          });
        }
        const picked = ans[sn.id];
        if (picked !== undefined && picked !== null && Number(picked) !== Number(sn.answer)) {
          const prev = wrongInfoMap.get(sn.id);
          wrongInfoMap.set(sn.id, {
            count: (prev?.count || 0) + 1,
            lastExamTitle: prev?.lastExamTitle || att.examTitle,
            lastPicked: prev ? prev.lastPicked : Number(picked),
          });
        }
      });
    }

    const idSet = new Set<string>();
    Object.entries(examNotes).forEach(([qId, val]) => {
      if (val && val.trim()) idSet.add(qId);
    });
    Object.entries(examTags).forEach(([qId, tg]) => {
      if (tg && (tg.difficulty || (tg.tags && tg.tags.length > 0))) idSet.add(qId);
    });
    wrongInfoMap.forEach((_v, qId) => idSet.add(qId));

    const list = Array.from(idSet).map((qId) => {
      const info = qMap.get(qId);
      const tg = examTags[qId];
      const note = (examNotes[qId] || '').trim();
      const wrong = wrongInfoMap.get(qId);
      return {
        id: qId,
        q: info?.q || tg?.qPreview || 'سوال ثبت‌شده در سابقه شما',
        options: info?.options || [],
        answer: info?.answer ?? 0,
        hasFullQuestion: Boolean(info && info.options.filter(Boolean).length > 0),
        exp: info?.exp,
        chapter: info?.chapter,
        sourceLabel: info?.sourceLabel,
        examId: info?.examId,
        examTitle: info?.examTitle || tg?.examTitle || wrong?.lastExamTitle || 'آزمون‌های من',
        examYear: info?.examYear,
        subjectName: info?.subjectName || tg?.subjectName || 'سایر دروس',
        qNumber: info?.qNumber,
        note,
        tag: tg,
        isWrong: Boolean(wrong),
        wrongCount: wrong?.count || 0,
        lastWrongPicked: wrong?.lastPicked,
        updatedAt: tg?.updatedAt || '',
      };
    });

    list.sort((a, b) => {
      if (Boolean(b.note) !== Boolean(a.note)) return b.note ? 1 : -1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return list;
  }, [visibleExams, myExamHistory, examNotes, examTags]);

  const notebookCounts = useMemo(() => {
    return {
      all: notebookEntries.length,
      noted: notebookEntries.filter((x) => Boolean(x.note)).length,
      review: notebookEntries.filter((x) => x.tag?.tags?.includes('review')).length,
      noteworthy: notebookEntries.filter((x) => x.tag?.tags?.includes('noteworthy')).length,
      careless: notebookEntries.filter((x) => x.tag?.tags?.includes('careless')).length,
      hard: notebookEntries.filter((x) => x.tag?.difficulty === 'hard').length,
      medium: notebookEntries.filter((x) => x.tag?.difficulty === 'medium').length,
      easy: notebookEntries.filter((x) => x.tag?.difficulty === 'easy').length,
      wrong: notebookEntries.filter((x) => x.isWrong).length,
    };
  }, [notebookEntries]);

  const notebookBaseFiltered = useMemo(() => {
    const qNorm = nbSearch.trim().toLowerCase();
    return notebookEntries.filter((item) => {
      if (nbFilter === 'noted' && !item.note) return false;
      if (nbFilter === 'wrong' && !item.isWrong) return false;
      if (nbFilter === 'easy' || nbFilter === 'medium' || nbFilter === 'hard') {
        if (item.tag?.difficulty !== nbFilter) return false;
      }
      if (nbFilter === 'review' || nbFilter === 'noteworthy' || nbFilter === 'careless') {
        if (!item.tag?.tags?.includes(nbFilter)) return false;
      }
      if (qNorm) {
        const hay = `${item.q} ${item.note} ${item.subjectName} ${item.examTitle} ${item.chapter || ''} ${item.sourceLabel || ''}`.toLowerCase();
        if (!hay.includes(qNorm)) return false;
      }
      return true;
    });
  }, [notebookEntries, nbFilter, nbSearch]);

  const notebookGroupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    notebookBaseFiltered.forEach((item) => {
      const key = nbGroupBy === 'subject' ? item.subjectName : item.examTitle;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [notebookBaseFiltered, nbGroupBy]);

  const notebookVisibleItems = useMemo(() => {
    if (nbSelectedGroup === 'all') return notebookBaseFiltered;
    return notebookBaseFiltered.filter((item) => {
      const key = nbGroupBy === 'subject' ? item.subjectName : item.examTitle;
      return key === nbSelectedGroup;
    });
  }, [notebookBaseFiltered, nbGroupBy, nbSelectedGroup]);

  const startNotebookPractice = (mode: 'study' | 'exam') => {
    const playable = notebookVisibleItems.filter((x) => x.hasFullQuestion);
    if (!playable.length) {
      showToast('برای سوالات این فیلتر متن کامل گزینه‌ها موجود نیست.');
      return;
    }
    const grouped = new Map<string, LegalExam['subjects'][number]['questions']>();
    playable.forEach((item) => {
      const gKey = nbGroupBy === 'subject' ? item.subjectName : item.examTitle;
      if (!grouped.has(gKey)) grouped.set(gKey, []);
      grouped.get(gKey)!.push({
        id: item.id,
        q: item.q,
        options: item.options,
        answer: item.answer,
        exp: item.exp,
        chapter: item.chapter,
        sourceLabel: item.sourceLabel || item.examTitle,
      });
    });
    const subjects = Array.from(grouped.entries()).map(([name, qs], idx) => ({
      id: `nb_sub_${idx}_${Date.now()}`,
      name,
      questions: qs,
    }));
    const filterTitleMap: Record<typeof nbFilter, string> = {
      all: 'همه سوالات ذخیره‌شده',
      noted: 'سوالات دارای نکته شخصی',
      review: 'سوالات مرور',
      noteworthy: 'سوالات نکته‌دار',
      careless: 'سوالات بی‌دقتی',
      hard: 'سوالات سخت',
      medium: 'سوالات متوسط',
      easy: 'سوالات آسان',
      wrong: 'غلط‌های آزمون‌های قبلی',
    };
    const virtualExam: LegalExam = {
      id: `notebook_${Date.now()}`,
      title: `مرور هوشمند دفترچه: ${filterTitleMap[nbFilter]}${nbSelectedGroup !== 'all' ? ` · ${nbSelectedGroup}` : ''}`,
      category: 'دفترچه نکات آزمونی',
      examType: 'مرور شخصی‌سازی‌شده',
      durationMin: Math.max(10, Math.round(playable.length * 1.5)),
      desc: 'ساخته‌شده از دفترچه نکات و برچسب‌های آزمونی شما',
      subjects,
    };
    setActiveTab('exams');
    startExam(virtualExam, mode);
  };

  const handleCopyAllNotebookNotes = async () => {
    if (!notebookVisibleItems.length) return;
    const diffFa: Record<ExamQuestionDifficulty, string> = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
    const flagFa: Record<ExamQuestionFlagTag, string> = { review: 'مرور', noteworthy: 'نکته‌دار', careless: 'بی‌دقتی' };
    const blocks = notebookVisibleItems.map((item, idx) => {
      const badges = [
        item.tag?.difficulty ? diffFa[item.tag.difficulty] : '',
        ...(item.tag?.tags || []).map((t) => flagFa[t]),
        item.isWrong ? 'غلط در آزمون' : '',
      ].filter(Boolean);
      const lines = [
        `${toFa(idx + 1)}. [${item.subjectName} · ${item.examTitle}${item.qNumber ? ` · سوال ${toFa(item.qNumber)}` : ''}]${badges.length ? ` (${badges.join(' · ')})` : ''}`,
        `سوال: ${item.q}`,
      ];
      if (item.hasFullQuestion && item.options[item.answer]) {
        lines.push(`پاسخ صحیح: گزینه ${toFa(item.answer + 1)}) ${item.options[item.answer]}`);
      }
      if (item.note) {
        lines.push(`★ نکته شخصی من: ${item.note}`);
      }
      if (item.exp) {
        lines.push(`تشریح: ${item.exp}`);
      }
      return lines.join('\n');
    });
    const payload = `دفترچه نکات آزمونی من (${toFa(notebookVisibleItems.length)} مورد)\n${'─'.repeat(32)}\n\n${blocks.join('\n\n────────────────\n\n')}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(`جزوه نکات (${toFa(notebookVisibleItems.length)} سوال) در حافظه کپی شد.`);
  };

  const startExam = (ex: LegalExam, mode: 'exam' | 'study' = 'study', jumpToSubjectId?: string) => {
    setActiveExam(ex);
    setActiveExamMode(mode);
    setRevealedQIds({});
    setExamAnswers({});
    setInspectedAttempt(null);
    setExamSecondsLeft((ex.durationMin || 30) * 60);
    if (jumpToSubjectId) {
      setTimeout(() => {
        document.getElementById(`sub-sec-${jumpToSubjectId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  };

  const startLessonPractice = (lessonName: string, mode: 'exam' | 'study' = 'study', onlyExamId?: string) => {
    const subjects: { id: string; name: string; questions: LegalExam['subjects'][number]['questions'] }[] = [];
    let totalQ = 0;
    for (const ex of visibleExams) {
      if (onlyExamId && ex.id !== onlyExamId) continue;
      for (const sb of ex.subjects) {
        if ((sb.name?.trim() || 'سایر دروس') !== lessonName || !sb.questions.length) continue;
        const taggedQs = sb.questions.map((q) => ({
          ...q,
          sourceLabel: q.sourceLabel || buildQuestionSourceLabel('', ex.examType, ex.year) || ex.title,
        }));
        totalQ += taggedQs.length;
        subjects.push({
          id: `ls_${ex.id}_${sb.id}`,
          name: `${ex.title}${ex.year ? ` (${toFa(ex.year)})` : ''}`,
          questions: taggedQs,
        });
      }
    }
    if (!subjects.length || !totalQ) return;
    const virtualExam: LegalExam = {
      id: `lesson_${Date.now()}`,
      title: `مطالعه درس به درس: ${lessonName}`,
      category: 'مطالعه درس به درس',
      examType: onlyExamId ? subjects[0].name : `تجمیع ${toFa(subjects.length)} آزمون`,
      durationMin: Math.max(15, Math.round(totalQ * 1.5)),
      desc: `تمام سوالات درس «${lessonName}» به ترتیب آزمون‌ها`,
      subjects,
    };
    startExam(virtualExam, mode);
  };

  const startChapterPractice = (topicName: string, kind: 'chapter' | 'subject' = 'chapter', mode: 'exam' | 'study' = 'study') => {
    const matchingQuestions = [];
    const base =
      selectedExamCat === 'all'
        ? visibleExams
        : visibleExams.filter((ex) => (ex.category?.trim() || ex.subjects[0]?.name || 'سایر آزمون‌ها') === selectedExamCat);
    for (const ex of base) {
      if (selectedExamType !== 'all' && (ex.examType || '') !== selectedExamType) continue;
      if (selectedExamYear !== 'all' && (ex.year || '') !== selectedExamYear) continue;
      for (const sb of ex.subjects) {
        for (const q of sb.questions) {
          const match = kind === 'chapter' ? q.chapter?.trim() === topicName : sb.name?.trim() === topicName;
          if (match) {
            matchingQuestions.push({
              ...q,
              sourceLabel: q.sourceLabel || buildQuestionSourceLabel('', ex.examType, ex.year) || undefined,
            });
          }
        }
      }
    }
    if (!matchingQuestions.length) return;
    const virtualExam: LegalExam = {
      id: `chap_${Date.now()}`,
      title: `آزمون مبحثی: ${topicName}`,
      category: selectedExamCat !== 'all' ? selectedExamCat : undefined,
      examType: 'مبحثی',
      durationMin: Math.max(10, matchingQuestions.length * 2),
      desc: `تمرین متمرکز سوالات سرفصل/مبحث «${topicName}»`,
      subjects: [{ id: `sub_chap_${Date.now()}`, name: topicName, questions: matchingQuestions }],
    };
    startExam(virtualExam, mode);
  };

  const submitExam = async () => {
    if (!activeExam) return;
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;
    const snapshot: ExamAttemptQuestionSnapshot[] = [];

    const subjectBreakdown = activeExam.subjects.map((sub) => {
      let c = 0;
      let w = 0;
      let bl = 0;
      for (const q of sub.questions) {
        const chosen = examAnswers[q.id];
        if (chosen === undefined) bl += 1;
        else if (chosen === q.answer) c += 1;
        else w += 1;
        snapshot.push({
          id: q.id,
          subjectName: sub.name,
          chapter: q.chapter,
          sourceLabel: q.sourceLabel,
          csvQuestionNum: q.csvQuestionNum,
          csvRowIndex: q.csvRowIndex,
          csvFileName: q.csvFileName,
          q: q.q,
          options: q.options,
          answer: q.answer,
          exp: q.exp,
        });
      }
      correctCount += c;
      wrongCount += w;
      blankCount += bl;
      const tot = sub.questions.length || 1;
      const pct = Math.max(0, Math.round(((c * 3 - w) / (tot * 3)) * 100));
      return { name: sub.name, correct: c, wrong: w, blank: bl, pct };
    });

    const totalQuestions = correctCount + wrongCount + blankCount;
    const scorePct =
      totalQuestions > 0
        ? Math.max(0, Math.round(((correctCount * 3 - wrongCount) / (totalQuestions * 3)) * 100))
        : 0;

    const attemptTagsSnapshot: Record<string, ExamQuestionTagState> = {};
    for (const qSnap of snapshot) {
      if (examTags[qSnap.id]) {
        attemptTagsSnapshot[qSnap.id] = examTags[qSnap.id];
      }
    }

    const result: ExamAttemptResult = {
      id: `res_${Date.now()}`,
      examId: activeExam.id,
      examTitle: activeExam.title,
      examCategory: activeExam.category,
      examYear: activeExam.year,
      examType: activeExam.examType,
      userId: user?.id,
      userEmail: user?.email,
      scorePct,
      correctCount,
      wrongCount,
      blankCount,
      totalQuestions,
      answers: { ...examAnswers },
      questionTags: attemptTagsSnapshot,
      questionsSnapshot: snapshot,
      subjectBreakdown,
      submittedAt: new Date().toISOString(),
    };

    setInspectedAttempt(result);
    setActiveExam(null);
    await recordExamAttempt(result);
    showToast(`آزمون تصحیح شد — نمره کل: ${toFa(scorePct)}٪`);
  };

  const handleToggleQuestionDifficulty = (
    questionId: string,
    diff: ExamQuestionDifficulty,
    meta: { examTitle?: string; subjectName?: string; qText?: string }
  ) => {
    const cur = examTags[questionId] || {};
    const nextDiff = cur.difficulty === diff ? undefined : diff;
    saveExamTag(questionId, {
      ...cur,
      difficulty: nextDiff,
      examTitle: meta.examTitle || cur.examTitle,
      subjectName: meta.subjectName || cur.subjectName,
      qPreview: (meta.qText || cur.qPreview || '').slice(0, 140),
    });
  };

  const handleToggleQuestionFlag = (
    questionId: string,
    flag: ExamQuestionFlagTag,
    meta: { examTitle?: string; subjectName?: string; qText?: string }
  ) => {
    const cur = examTags[questionId] || {};
    const prevTags = Array.isArray(cur.tags) ? cur.tags : [];
    const nextTags = prevTags.includes(flag) ? prevTags.filter((t) => t !== flag) : [...prevTags, flag];
    saveExamTag(questionId, {
      ...cur,
      tags: nextTags.length ? nextTags : undefined,
      examTitle: meta.examTitle || cur.examTitle,
      subjectName: meta.subjectName || cur.subjectName,
      qPreview: (meta.qText || cur.qPreview || '').slice(0, 140),
    });
  };

  const renderQuestionTagBar = (
    questionId: string,
    meta: { examTitle?: string; subjectName?: string; qText?: string }
  ) => {
    const cur = examTags[questionId] || {};
    const activeFlags = Array.isArray(cur.tags) ? cur.tags : [];
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface)]/85 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-[var(--ink-muted)] ml-1">سطح سوال:</span>
          {EXAM_DIFFICULTY_OPTIONS.map((opt) => {
            const active = cur.difficulty === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleToggleQuestionDifficulty(questionId, opt.id, meta)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
                  active
                    ? opt.activeCls
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/70 text-[var(--ink-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${active ? opt.dotCls : 'bg-slate-400/50'}`} />
                <span>{opt.label}</span>
                {active && <Check className="h-3 w-3" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-[var(--ink-muted)] ml-1">برچسب:</span>
          {EXAM_FLAG_OPTIONS.map((fl) => {
            const active = activeFlags.includes(fl.id);
            return (
              <button
                key={fl.id}
                type="button"
                onClick={() => handleToggleQuestionFlag(questionId, fl.id, meta)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
                  active
                    ? fl.activeCls
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/70 text-[var(--ink-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]'
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                    active ? 'border-current bg-current/10' : 'border-slate-400/50'
                  }`}
                >
                  {active && <Check className="h-2.5 w-2.5" />}
                </span>
                <span>{fl.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderQuestionNoteBox = (questionId: string) => {
    const saved = examNotes[questionId] || '';
    const draft = examNoteDrafts[questionId] !== undefined ? examNoteDrafts[questionId] : saved;
    const isDirty = examNoteDrafts[questionId] !== undefined && examNoteDrafts[questionId] !== saved;

    return (
      <div className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)]/80 p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-400">
            <Bookmark className="h-3.5 w-3.5" />
            <span>نکته شخصی من زیر این سوال (اختصاصی برای خودتان ذخیره می‌شود)</span>
          </span>
          {isDirty && (
            <button
              type="button"
              onClick={() => saveExamNote(questionId, draft)}
              className="rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
            >
              ذخیره نکته
            </button>
          )}
        </div>
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setExamNoteDrafts((p) => ({ ...p, [questionId]: e.target.value }))}
          onBlur={() => {
            if (isDirty) saveExamNote(questionId, draft);
          }}
          placeholder="نکته مهم، ماده قانونی مرتبط یا علت اشتباه در این تست را بنویسید..."
          className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
        />
      </div>
    );
  };

  const submitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!qaText.trim()) {
      showToast('متن پرسش خود را بنویسید.');
      return;
    }
    setQaSubmitting(true);
    try {
      const id = `q_${Date.now()}`;
      const item: QuestionReplyItem = {
        id,
        email: user.email || '',
        userName: user.email?.split('@')[0] || 'کاربر',
        subject: qaSubject,
        question: qaText.trim(),
        createdAt: formatJalaali(new Date()),
      };
      await setQuestions({ ...questions, [id]: item });
      setQaText('');
    } finally {
      setQaSubmitting(false);
    }
  };

  const sortedQuestions = useMemo(
    () =>
      Object.values(questions || {}).sort((a, b) => (b.id > a.id ? 1 : -1)),
    [questions]
  );

  const filteredSections = useMemo(() => {
    const list = planner.subjectSections || [];
    if (selectedSubjectFilter === 'all') return list;
    return list.filter((b) => b.subjectId === selectedSubjectFilter);
  }, [planner.subjectSections, selectedSubjectFilter]);

  const renderBlockCard = (b: StudyBlock, scope: 'day' | 'section', dayId: string | null) => {
    const checks = b.checks || [false, false, false];
    const items = b.items?.length === 3 ? b.items : CHECK_LABELS;
    const noteVal = noteDrafts[b.id] !== undefined ? noteDrafts[b.id] : b.notes || '';
    const dirty = noteDrafts[b.id] !== undefined && noteDrafts[b.id] !== (b.notes || '');
    const subjObj = (planner.subjects || EMPTY_PLANNER.subjects).find((s) => s.id === b.subjectId);
    const colorTheme = getSubjectColorTheme(b.subjectId, subjObj?.name, b.law);

    return (
      <div
        key={b.id}
        className={`rounded-xl border p-4 sm:p-5 transition-colors shadow-2xs ${colorTheme.card}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
              {subjObj && (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${colorTheme.badge}`}>
                  {subjObj.name}
                </span>
              )}
              <span className={colorTheme.accentText}>{b.law}</span>
              {b.spec && (
                <>
                  <span aria-hidden="true" className="text-[var(--ink-muted)]">·</span>
                  <span className="tabular-nums text-[var(--ink-muted)]">مواد {toFa(b.spec)}</span>
                </>
              )}
            </div>
            <h4 className="mt-1.5 text-base font-bold text-[var(--ink)]">{b.title}</h4>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={b.mastery || ''}
              onChange={(e) => handleMasteryChange(scope, dayId, b.id, e.target.value)}
              aria-label="وضعیت تسلط"
              className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] outline-none focus:border-teal-600"
            >
              {MASTERY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || 'وضعیت تسلط...'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleDeleteBlock(scope, dayId, b.id)}
              title="حذف این بخش"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-slate-400 hover:text-red-600 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 3-step Checklists */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {items.map((label, idx) => {
            const done = !!checks[idx];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleToggleCheck(scope, dayId, b.id, idx)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                  done
                    ? 'border-teal-600/40 bg-teal-700/10 text-teal-800 dark:text-teal-300'
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded ${
                    done
                      ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                      : 'border border-slate-400/50'
                  }`}
                >
                  {done && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notes & Errors */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-[var(--ink-muted)]">
              ایرادات، اشکالات و نکات کلیدی
            </label>
            {dirty && (
              <button
                type="button"
                onClick={() => handleSaveNotes(scope, dayId, b.id, noteVal, true)}
                className="rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
              >
                ذخیره یادداشت
              </button>
            )}
          </div>
          <textarea
            rows={2}
            value={noteVal}
            onChange={(e) => setNoteDrafts((p) => ({ ...p, [b.id]: e.target.value }))}
            onBlur={() => {
              if (noteDrafts[b.id] !== undefined && noteDrafts[b.id] !== (b.notes || '')) {
                handleSaveNotes(scope, dayId, b.id, noteDrafts[b.id], false);
              }
            }}
            placeholder="نکات مهم تستی، تبصره‌های استثنا یا اشکالات خود در این بخش را بنویسید..."
            className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
          />
        </div>

        {/* Attachments */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {(b.files || []).map((f, fIdx) => (
              <div
                key={f.id || fIdx}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs"
              >
                <button
                  type="button"
                  onClick={() => handleOpenAttachment(f)}
                  className="inline-flex items-center gap-1 font-medium text-teal-700 dark:text-teal-400 hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="max-w-[140px] truncate">{f.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(scope, dayId, b.id, fIdx)}
                  aria-label="حذف پیوست"
                  className="text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-teal-600/40">
            <Paperclip className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
            <span>{uploadingBlockId === b.id ? 'در حال آپلود...' : 'پیوست عکس یا PDF'}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              disabled={uploadingBlockId === b.id}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadFile(scope, dayId, b.id, f);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 animate-fade-up">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--hairline)] bg-slate-900 text-white">
        <img
          src={studentBannerImg}
          alt="باشگاه دانشجویان حقوق و برنامه مطالعاتی برائت"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-l from-slate-950/95 via-slate-950/85 to-slate-900/65"
        />
        <div className="relative z-10 flex flex-col justify-between gap-6 p-6 sm:p-10 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-bold text-teal-300">باشگاه داوطلبان وکالت، قضاوت و پژوهش</p>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              برنامه‌ریزی هوشمند، رصد پیشرفت و آزمون‌های حقوقی
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              پیگیری یک‌نگاه دروس، مدیریت برنامه ۹۰ روزه و درس‌محور، ثبت نکات و پیوست جزوات با همگام‌سازی ابری.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!user ? (
              <button
                type="button"
                onClick={openAuthModal}
                className="rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-teal-400 transition-colors"
              >
                ورود برای همگام‌سازی ابری
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-xs">
                <ProgressRing pct={overallSummary.pct} size={52} />
                <div>
                  <p className="text-xs text-slate-300">پیشرفت کل برنامه</p>
                  <p className="text-sm font-extrabold tabular-nums">
                    {toFa(overallSummary.doneChecks)} چک‌لیست از {toFa(overallSummary.totalBlocks)} مبحث
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'overview' as const, label: 'نمای یک‌نگاه دروس', icon: LayoutGrid, path: '/students' },
            { id: 'days' as const, label: 'برنامه روزانه', icon: CalendarDays, path: '/planner' },
            { id: 'sections' as const, label: 'برنامه درس‌محور', icon: BookOpen, path: '/planner' },
            { id: 'exams' as const, label: 'آزمون‌های آنلاین', icon: ClipboardCheck, path: '/exams' },
            { id: 'notes' as const, label: 'دفترچه نکات آزمونی', icon: StickyNote, path: '/students', badge: notebookCounts.all },
            { id: 'qa' as const, label: 'پرسش و پاسخ', icon: MessageSquare, path: '/students' },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id);
                  if (location.pathname !== t.path) navigate(t.path);
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                  active
                    ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                    : 'border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
                {'badge' in t && typeof t.badge === 'number' && t.badge > 0 && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                      active
                        ? 'bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-950'
                        : 'bg-teal-700/10 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300'
                    }`}
                  >
                    {toFa(t.badge)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={exportPlannerBackup}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          <Download className="h-3.5 w-3.5" />
          <span>خروجی پشتیبان JSON</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <section className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--ink)]">داشبورد یک‌نگاه دروس آزمون</h2>
              <p className="text-xs text-[var(--ink-muted)]">
                درصد پیشرفت هر درس بر اساس چک‌لیست مطالعه نص، تست و مرور محاسبه می‌شود.
              </p>
            </div>
            {!user && (
              <button
                type="button"
                onClick={openAuthModal}
                className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white dark:bg-teal-500 dark:text-slate-950"
              >
                ورود به حساب داوطلب
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subjectSummaries.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--ink)]">{sub.name}</h3>
                    <p className="mt-1 text-xs text-[var(--ink-muted)] tabular-nums">
                      {toFa(sub.blocksCount)} مبحث فعال · {toFa(sub.doneChecks)} از {toFa(sub.totalChecks)} گام
                    </p>
                  </div>
                  <ProgressRing pct={sub.pct} size={64} />
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div
                      className="h-full bg-teal-700 dark:bg-teal-400 transition-all duration-300"
                      style={{ width: `${sub.pct}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ink-muted)] tabular-nums">
                    <span>مسلط: {toFa(sub.masteredCount)} مبحث</span>
                    <span>دارای نکته: {toFa(sub.notedCount)} مبحث</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--hairline)] pt-3 text-[11px] text-[var(--ink-muted)]">
                  {sub.laws.map((l, i) => (
                    <span key={i} className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5">
                      {l.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 2 & 3: Daily & Subject-Based Planner */}
      {(activeTab === 'days' || activeTab === 'sections') && (
        <section className="mt-6 space-y-6">
          {/* Quick Add Block Form */}
          <form
            onSubmit={handleAddBlock}
            className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-extrabold text-[var(--ink)]">افزودن مبحث مطالعاتی جدید</h2>
              {activeTab === 'days' && (
                <button
                  type="button"
                  onClick={handleAddDay}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-700/30 bg-teal-700/10 px-3 py-1.5 text-xs font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-700/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>افزودن روز جدید</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                type="text"
                value={newBlockTitle}
                onChange={(e) => setNewBlockTitle(e.target.value)}
                placeholder="عنوان مبحث (مثلاً قواعد عمومی قراردادها)"
                className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600 lg:col-span-2"
              />
              <select
                value={newBlockSubjectId}
                onChange={(e) => setNewBlockSubjectId(e.target.value)}
                className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none"
              >
                {(planner.subjects || EMPTY_PLANNER.subjects).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={newBlockLaw}
                onChange={(e) => setNewBlockLaw(e.target.value)}
                className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none"
              >
                {(laws.length ? laws.map((l) => l.name) : ['قانون مدنی', 'آیین دادرسی مدنی', 'قانون تجارت', 'قانون مجازات اسلامی', 'آیین دادرسی کیفری']).map((ln) => (
                  <option key={ln} value={ln}>
                    {ln}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={newBlockSpec}
                  onChange={(e) => setNewBlockSpec(e.target.value)}
                  placeholder="1-30"
                  className="w-24 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-center text-[var(--ink)] outline-none"
                />
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                >
                  افزودن
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
              <span>مقصد ثبت:</span>
              <select
                value={newBlockTargetDayId}
                onChange={(e) => setNewBlockTargetDayId(e.target.value)}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs text-[var(--ink)]"
              >
                <option value="sections">برنامه درس‌محور (مباحث مستقل)</option>
                {(planner.days || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    روز {toFa(d.number)}
                  </option>
                ))}
              </select>
            </div>
          </form>

          {activeTab === 'days' ? (
            (planner.days || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] bg-[var(--surface)] p-10 text-center">
                <p className="text-sm font-bold text-[var(--ink)]">هنوز برنامه‌ای برای روزهای مطالعه ثبت نشده است.</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  از دکمه «افزودن روز جدید» استفاده کنید یا وارد حساب خود شوید تا برنامه تخصیص‌یافته همگام‌سازی شود.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(planner.days || []).map((day) => {
                  const isOpen = expandedDayIds[day.id] ?? day.open ?? true;
                  const doneCount = day.blocks.reduce(
                    (acc, b) => acc + (b.checks || []).filter(Boolean).length,
                    0
                  );
                  const totalChecks = day.blocks.length * 3;
                  return (
                    <div
                      key={day.id}
                      className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-muted)]/60 p-4 sm:p-5"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedDayIds((p) => ({ ...p, [day.id]: !isOpen }))}
                        className="flex w-full items-center justify-between text-right"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-xs font-extrabold text-white dark:bg-teal-500 dark:text-slate-950 tabular-nums">
                            {toFa(day.number)}
                          </span>
                          <div>
                            <h3 className="text-sm font-extrabold text-[var(--ink)]">
                              روز {toFa(day.number)} {day.group ? `— ${day.group}` : ''}
                            </h3>
                            <p className="text-xs text-[var(--ink-muted)] tabular-nums">
                              {toFa(day.blocks.length)} مبحث · {toFa(doneCount)} از {toFa(totalChecks)} گام انجام‌شده
                            </p>
                          </div>
                        </div>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-[var(--ink-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--ink-muted)]" />}
                      </button>

                      {isOpen && (
                        <div className="mt-4 space-y-3">
                          {day.blocks.length === 0 ? (
                            <p className="text-xs text-[var(--ink-muted)] py-2">
                              این روز هنوز مبحثی ندارد. از فرم بالا مبحثی را به این روز اضافه کنید.
                            </p>
                          ) : (
                            day.blocks.map((b) => renderBlockCard(b, 'day', day.id))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubjectFilter('all')}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold ${
                    selectedSubjectFilter === 'all'
                      ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                      : 'border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)]'
                  }`}
                >
                  همه دروس
                </button>
                {(planner.subjects || EMPTY_PLANNER.subjects).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSubjectFilter(s.id)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold ${
                      selectedSubjectFilter === s.id
                        ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                        : 'border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {filteredSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] bg-[var(--surface)] p-10 text-center text-xs text-[var(--ink-muted)]">
                  هنوز بخشی در برنامه درس‌محور این درس ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSections.map((b) => renderBlockCard(b, 'section', null))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Tab 4: Online Legal Exams */}
      {activeTab === 'exams' && (
        <section className="mt-6 space-y-6">
          {activeExam ? (
            <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hairline)] pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-[var(--ink)]">{activeExam.title}</h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {[
                      activeExamMode === 'study' ? 'مشاهده سوالات و پاسخ (پیوسته بین همه دروس)' : 'آزمون زمان‌دار (همه دروس به ترتیب با اسکرول)',
                      activeExam.category,
                      activeExam.examType,
                      activeExam.year ? `سال ${toFa(activeExam.year)}` : '',
                      activeExam.desc,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {activeExamMode === 'study' && (
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = activeExam.subjects.flatMap((sb) => sb.questions.map((q) => q.id));
                        const allOpen = allIds.length > 0 && allIds.every((id) => !!revealedQIds[id]);
                        if (allOpen) {
                          setRevealedQIds({});
                        } else {
                          const next: Record<string, boolean> = {};
                          allIds.forEach((id) => {
                            next[id] = true;
                          });
                          setRevealedQIds(next);
                        }
                      }}
                      className="rounded-xl border border-teal-700/30 bg-teal-700/10 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
                    >
                      {activeExam.subjects.flatMap((sb) => sb.questions).every((q) => !!revealedQIds[q.id])
                        ? 'بستن همه پاسخ‌ها'
                        : 'نمایش همه پاسخ‌ها'}
                    </button>
                  )}
                  {activeExamMode === 'exam' ? (
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3.5 py-2 text-xs font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                      <Clock className="h-4 w-4" />
                      <span>
                        {toFa(Math.floor(examSecondsLeft / 60))}:{toFa(String(examSecondsLeft % 60).padStart(2, '0'))}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveExamMode('exam')}
                      className="rounded-xl border border-[var(--hairline)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40"
                    >
                      تغییر به آزمون زمان‌دار
                    </button>
                  )}
                  {activeExamMode === 'exam' && (
                    <button
                      type="button"
                      onClick={() => setActiveExamMode('study')}
                      className="rounded-xl border border-[var(--hairline)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40"
                    >
                      مشاهده سوالات و پاسخ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveExam(null)}
                    className="rounded-xl border border-[var(--hairline)] px-3.5 py-2 text-xs font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    بازگشت
                  </button>
                  <button
                    type="button"
                    onClick={submitExam}
                    className="rounded-xl bg-teal-700 px-5 py-2 text-xs font-extrabold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                  >
                    پایان و ثبت کارنامه
                  </button>
                </div>
              </div>

              {activeExam.subjects.length > 1 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] pb-3">
                  <span className="text-[11px] font-bold text-[var(--ink-muted)] ml-1">ترتیب درس‌ها (یا اسکرول مستقیم به پایین):</span>
                  {activeExam.subjects.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => document.getElementById(`sub-sec-${sub.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] hover:border-teal-600/50"
                    >
                      {sub.name} ({toFa(sub.questions.length)})
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px] items-start">
                <div className="space-y-8 min-w-0">
                  {activeExam.subjects.map((sub, subIdx) => {
                    const prevCount = activeExam.subjects
                      .slice(0, subIdx)
                      .reduce((sum, s) => sum + s.questions.length, 0);
                    return (
                    <div key={sub.id} id={`sub-sec-${sub.id}`} className="space-y-4">
                      <h3 className="sticky top-0 z-10 border-r-2 border-teal-600 bg-[var(--surface)]/95 py-2 pr-3 text-base font-extrabold text-[var(--ink)] backdrop-blur-sm">
                        {sub.name} ({toFa(sub.questions.length)} سوال)
                      </h3>
                      {sub.questions.map((q, qIdx) => {
                        const picked = examAnswers[q.id];
                        const isRev = activeExamMode === 'study' && !!revealedQIds[q.id];
                        const srcNotice = formatQuestionSourceNotice(q.sourceLabel);
                        const isCopied = copiedQId === q.id;
                        const adminCsvRef = isAdmin ? formatAdminCsvQuestionRef(q, prevCount + qIdx + 1) : '';
                        return (
                          <div key={q.id} id={`q-card-${q.id}`} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)]/60 p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex flex-wrap items-center gap-2">
                                {q.chapter && (
                                  <span className="font-bold text-teal-700 dark:text-teal-400">
                                    سرفصل: {q.chapter}
                                  </span>
                                )}
                                {srcNotice && (
                                  <span className="rounded-lg bg-amber-500/15 px-2.5 py-0.5 font-extrabold text-amber-800 dark:text-amber-300">
                                    {srcNotice}
                                  </span>
                                )}
                                {isAdmin && adminCsvRef && (
                                  <span
                                    title={q.csvFileName ? `فایل منبع: ${q.csvFileName}` : 'شناسه سوال در فایل منبع (فقط قابل مشاهده برای مدیر)'}
                                    className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10.5px] font-bold text-indigo-800 dark:text-indigo-300 tabular-nums"
                                  >
                                    مدیر · {adminCsvRef}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyQuestion(q, sub.name, qIdx + 1)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] hover:border-teal-600/50"
                                title="کپی سوال، گزینه‌ها، جواب و نکته"
                              >
                                {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                <span>{isCopied ? 'کپی شد' : 'کپی سوال و جواب'}</span>
                              </button>
                            </div>
                            <p className="text-sm font-bold leading-7 text-[var(--ink)]">
                              {toFa(qIdx + 1)}. {q.q}
                            </p>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {q.options.map((opt, optIdx) => {
                                const selected = picked === optIdx;
                                const isRightOpt = q.answer === optIdx;
                                let btnCls =
                                  'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-prose)] hover:border-teal-600/40';
                                if (isRev) {
                                  if (isRightOpt) {
                                    btnCls =
                                      'border-emerald-600 bg-emerald-500/15 font-bold text-emerald-800 dark:text-emerald-300';
                                  } else if (selected) {
                                    btnCls = 'border-red-600 bg-red-500/15 font-bold text-red-800 dark:text-red-300';
                                  }
                                } else if (selected) {
                                  btnCls =
                                    'border-teal-600 bg-teal-700/10 font-bold text-teal-800 dark:text-teal-300';
                                }
                                return (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    onClick={() =>
                                      setExamAnswers((p) => {
                                        const copy = { ...p };
                                        if (copy[q.id] === optIdx) delete copy[q.id];
                                        else copy[q.id] = optIdx;
                                        return copy;
                                      })
                                    }
                                    className={`rounded-xl border px-3.5 py-2.5 text-right text-xs font-medium transition-colors ${btnCls}`}
                                  >
                                    <span className="ml-2 font-extrabold tabular-nums">{toFa(optIdx + 1)})</span>
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            {activeExamMode === 'study' && (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => setRevealedQIds((p) => ({ ...p, [q.id]: !p[q.id] }))}
                                  className="rounded-lg border border-teal-700/30 bg-teal-700/10 px-3 py-1.5 text-[11px] font-bold text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
                                >
                                  {isRev ? 'بستن پاسخ و تشریح' : 'مشاهده پاسخ صحیح و تشریح'}
                                </button>
                                {isRev && (
                                  <div className="mt-2 rounded-lg border border-emerald-600/25 bg-[var(--surface)] p-3 text-xs leading-6">
                                    <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                                      گزینه صحیح: {toFa(q.answer + 1)}) {q.options[q.answer]}
                                    </p>
                                    {q.exp && (
                                      <p className="mt-1 text-[var(--ink-prose)]">
                                        <span className="font-bold text-teal-700 dark:text-teal-400">تشریح: </span>
                                        {q.exp}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {renderQuestionTagBar(q.id, {
                              examTitle: activeExam.title,
                              subjectName: sub.name,
                              qText: q.q,
                            })}

                            {renderQuestionNoteBox(q.id)}
                          </div>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>

                {/* Independently scrollable question navigator sidebar */}
                <aside className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)]/70 p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto overscroll-contain">
                  <h4 className="text-xs font-extrabold text-[var(--ink)]">ناوبری سریع سوالات</h4>
                  <p className="mt-1 text-[11px] text-[var(--ink-muted)]">اسکرول جداگانه برای پرش به هر درس و سوال</p>
                  <div className="mt-3 space-y-3">
                    {activeExam.subjects.map((sub) => (
                      <div key={sub.id} className="space-y-1.5 border-t border-[var(--hairline)] pt-2 first:border-t-0 first:pt-0">
                        <button
                          type="button"
                          onClick={() => document.getElementById(`sub-sec-${sub.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="text-right text-[11px] font-extrabold text-teal-700 hover:underline dark:text-teal-400"
                        >
                          {sub.name} ({toFa(sub.questions.length)})
                        </button>
                        <div className="grid grid-cols-5 gap-1.5">
                          {sub.questions.map((q, qIdx) => {
                            const isAns = examAnswers[q.id] !== undefined;
                            const isRev = activeExamMode === 'study' && !!revealedQIds[q.id];
                            const qTag = examTags[q.id];
                            const hasTag = Boolean(qTag && (qTag.difficulty || (qTag.tags && qTag.tags.length > 0)));
                            return (
                              <button
                                key={q.id}
                                type="button"
                                onClick={() => document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                className={`relative h-7 rounded-lg border text-[11px] font-bold tabular-nums transition-colors ${
                                  isRev
                                    ? 'border-emerald-600 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                                    : isAns
                                      ? 'border-teal-600 bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                      : 'border-[var(--hairline-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-teal-600/50'
                                }`}
                              >
                                {toFa(qIdx + 1)}
                                {hasTag && (
                                  <span
                                    aria-hidden="true"
                                    className={`absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full ${
                                      qTag?.difficulty === 'hard'
                                        ? 'bg-rose-500'
                                        : qTag?.difficulty === 'medium'
                                          ? 'bg-amber-500'
                                          : qTag?.difficulty === 'easy'
                                            ? 'bg-emerald-500'
                                            : 'bg-violet-500'
                                    }`}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
          ) : (
            <>
              {/* Detailed Attempt Review (Right/Wrong per Question + Personal Notes) */}
              {inspectedAttempt && (
                <div className="rounded-2xl border border-teal-700/30 bg-[var(--surface)] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hairline)] pb-4">
                    <div>
                      <p className="text-xs font-bold text-teal-700 dark:text-teal-400">کارنامه و پاسخ‌برگ تشریحی</p>
                      <h3 className="text-lg font-extrabold text-[var(--ink)]">{inspectedAttempt.examTitle}</h3>
                      <p className="mt-1 text-xs text-[var(--ink-muted)] tabular-nums">
                        صحیح: {toFa(inspectedAttempt.correctCount)} · غلط: {toFa(inspectedAttempt.wrongCount)} · نزده:{' '}
                        {toFa(inspectedAttempt.blankCount)} · {new Date(inspectedAttempt.submittedAt).toLocaleDateString('fa-IR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <ProgressRing pct={inspectedAttempt.scorePct} size={68} />
                      <button
                        type="button"
                        onClick={() => setInspectedAttempt(null)}
                        className="rounded-xl border border-[var(--hairline)] px-3 py-1.5 text-xs font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      >
                        بستن کارنامه
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {inspectedAttempt.subjectBreakdown.map((sb, i) => (
                      <div key={i} className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs">
                        <div className="flex items-center justify-between font-bold text-[var(--ink)]">
                          <span>{sb.name}</span>
                          <span className="text-teal-700 dark:text-teal-400 tabular-nums">{toFa(sb.pct)}٪</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--ink-muted)] tabular-nums">
                          {toFa(sb.correct)} صحیح · {toFa(sb.wrong)} غلط · {toFa(sb.blank)} نزده
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Per-Question Answer Analysis + Personal Notes */}
                  {inspectedAttempt.questionsSnapshot && inspectedAttempt.questionsSnapshot.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <h4 className="text-sm font-extrabold text-[var(--ink)]">تحلیل پاسخ‌های شما در تک‌تک سوالات</h4>
                      {inspectedAttempt.questionsSnapshot.map((q, qIdx) => {
                        const chosen = inspectedAttempt.answers?.[q.id];
                        const isBlank = chosen === undefined;
                        const isCorrect = !isBlank && chosen === q.answer;
                        return (
                          <div
                            key={q.id}
                            className={`rounded-xl border p-4 ${
                              isCorrect
                                ? 'border-emerald-500/35 bg-emerald-500/5'
                                : isBlank
                                  ? 'border-amber-500/35 bg-amber-500/5'
                                  : 'border-red-500/35 bg-red-500/5'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="font-bold text-[var(--ink-muted)]">
                                  {q.subjectName} {q.chapter ? `· سرفصل: ${q.chapter}` : ''}
                                </span>
                                {q.sourceLabel && (
                                  <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 font-bold text-amber-800 dark:text-amber-300">
                                    {formatQuestionSourceNotice(q.sourceLabel)}
                                  </span>
                                )}
                                {isAdmin && (
                                  <span
                                    title={q.csvFileName ? `فایل منبع: ${q.csvFileName}` : 'شناسه سوال (فقط مدیر)'}
                                    className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10.5px] font-bold text-indigo-800 dark:text-indigo-300 tabular-nums"
                                  >
                                    مدیر · {formatAdminCsvQuestionRef(q, qIdx + 1)}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCopyQuestion(q, q.subjectName, qIdx + 1)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink)] hover:border-teal-600/50"
                                >
                                  {copiedQId === q.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                  <span>{copiedQId === q.id ? 'کپی شد' : 'کپی'}</span>
                                </button>
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-extrabold ${
                                    isCorrect
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : isBlank
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-red-700 dark:text-red-400'
                                  }`}
                                >
                                  {isCorrect ? (
                                    <>
                                      <CheckCircle2 className="h-4 w-4" />
                                      <span>پاسخ صحیح دادید</span>
                                    </>
                                  ) : isBlank ? (
                                    <>
                                      <MinusCircle className="h-4 w-4" />
                                      <span>نزده (بدون پاسخ)</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-4 w-4" />
                                      <span>پاسخ اشتباه زدید</span>
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>

                            <p className="text-sm font-bold leading-7 text-[var(--ink)]">
                              {toFa(qIdx + 1)}. {q.q}
                            </p>

                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {q.options.map((opt, optIdx) => {
                                const isUserPick = chosen === optIdx;
                                const isRightOpt = q.answer === optIdx;
                                let cls = 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-prose)]';
                                if (isRightOpt) {
                                  cls = 'border-emerald-600 bg-emerald-500/15 font-bold text-emerald-800 dark:text-emerald-300';
                                } else if (isUserPick && !isRightOpt) {
                                  cls = 'border-red-600 bg-red-500/15 font-bold text-red-800 dark:text-red-300';
                                }
                                return (
                                  <div key={optIdx} className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>
                                    <span className="ml-1.5 font-extrabold tabular-nums">{toFa(optIdx + 1)})</span>
                                    <span>{opt}</span>
                                    {isRightOpt && <span className="mr-2 text-[10px]">(گزینه صحیح)</span>}
                                    {isUserPick && !isRightOpt && <span className="mr-2 text-[10px]">(انتخاب شما)</span>}
                                  </div>
                                );
                              })}
                            </div>

                            {q.exp && (
                              <p className="mt-3 rounded-lg bg-[var(--surface)]/80 px-3 py-2 text-xs leading-6 text-[var(--ink-prose)]">
                                <span className="font-extrabold text-teal-700 dark:text-teal-400">پاسخ تشریحی: </span>
                                {q.exp}
                              </p>
                            )}

                            {renderQuestionTagBar(q.id, {
                              examTitle: inspectedAttempt.examTitle,
                              subjectName: q.subjectName,
                              qText: q.q,
                            })}

                            {renderQuestionNoteBox(q.id)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Dedicated Section Switcher: Exams vs Lesson-by-Lesson Study */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExamHubSection('exams')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${
                      examHubSection === 'exams'
                        ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                        : 'border border-[var(--hairline)] bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>آزمون‌های جامع و سنواتی ({toFa(visibleExams.length)})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamHubSection('lessons')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${
                      examHubSection === 'lessons'
                        ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                        : 'border border-[var(--hairline)] bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>مطالعه درس به درس سوالات ({toFa(lessonBankSummary.length)} درس)</span>
                  </button>
                </div>
                <p className="text-[11px] text-[var(--ink-muted)]">
                  {examHubSection === 'lessons'
                    ? 'تمام سوالات همه آزمون‌ها به تفکیک هر درس یکجا گردآوری شده‌اند'
                    : 'با ورود به هر آزمون، درس‌ها به ترتیب پشت سر هم با اسکرول نمایش داده می‌شوند'}
                </p>
              </div>

              {examHubSection === 'lessons' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
                    <div>
                      <h2 className="text-base font-extrabold text-[var(--ink)]">مطالعه درس به درس تمام آزمون‌ها</h2>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        سوالات مربوط به هر درس از تمامی آزمون‌های بارگذاری‌شده یکجا دسته‌بندی شده‌اند تا درس به درس مطالعه یا آزمون بدهید.
                      </p>
                    </div>
                    <input
                      type="text"
                      value={lessonSearch}
                      onChange={(e) => setLessonSearch(e.target.value)}
                      placeholder="جستجوی نام درس یا مبحث..."
                      className="w-full sm:w-64 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {lessonBankSummary
                      .filter((ls) => {
                        const q = lessonSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          ls.name.toLowerCase().includes(q) ||
                          Array.from(ls.chapters).some((c) => c.toLowerCase().includes(q)) ||
                          ls.exams.some((e) => e.examTitle.toLowerCase().includes(q))
                        );
                      })
                      .map((ls) => (
                        <div
                          key={ls.name}
                          className="flex flex-col justify-between rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-base font-extrabold text-[var(--ink)]">{ls.name}</h3>
                              <span className="rounded-lg bg-teal-700/10 px-2.5 py-1 text-xs font-extrabold text-teal-800 dark:text-teal-300 tabular-nums">
                                {toFa(ls.totalQ)} سوال · {toFa(ls.exams.length)} آزمون
                              </span>
                            </div>

                            <div className="mt-3 border-t border-[var(--hairline)] pt-3">
                              <p className="text-[11px] font-bold text-[var(--ink-muted)] mb-1.5">
                                آزمون‌های شامل این درس (کلیک برای مطالعه تک‌آزمون):
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {ls.exams.map((exRef) => (
                                  <button
                                    key={`${ls.name}_${exRef.examId}`}
                                    type="button"
                                    onClick={() => startLessonPractice(ls.name, 'study', exRef.examId)}
                                    className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] hover:border-teal-600/50"
                                  >
                                    {exRef.examTitle} ({toFa(exRef.qCount)})
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startLessonPractice(ls.name, 'study')}
                              className="flex-1 rounded-xl bg-teal-700 py-2.5 px-3 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                            >
                              مشاهده سوالات و پاسخ ({toFa(ls.totalQ)})
                            </button>
                            <button
                              type="button"
                              onClick={() => startLessonPractice(ls.name, 'exam')}
                              className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] py-2.5 px-3.5 text-xs font-bold text-[var(--ink)] hover:border-teal-600/50"
                            >
                              آزمون زمان‌دار
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Exam Categories Folder Navigation & Multi-Axis Filters */}
                  <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {selectedExamCat !== 'all' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedExamCat('all');
                              setSelectedExamYear('all');
                              setSelectedExamType('all');
                              setSelectedExamChapter('all');
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--ink)] hover:border-teal-600/40"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            <span>همه دسته‌های آزمون</span>
                          </button>
                        )}
                        <h2 className="text-base font-extrabold text-[var(--ink)]">
                          {selectedExamCat === 'all' ? 'دسته‌بندی آزمون‌های حقوقی' : selectedExamCat}
                        </h2>
                      </div>

                      <input
                        type="text"
                        value={examSearch}
                        onChange={(e) => setExamSearch(e.target.value)}
                        placeholder="جستجوی نام آزمون، درس یا سال..."
                        className="w-full sm:w-64 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                    </div>

                    {/* Top-Level Folders when browsing 'all' */}
                    {selectedExamCat === 'all' && examCategoriesSummary.length > 0 && !examSearch.trim() && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                        {examCategoriesSummary.map((cat) => (
                          <button
                            key={cat.name}
                            type="button"
                            onClick={() => {
                              setSelectedExamCat(cat.name);
                              setSelectedExamYear('all');
                              setSelectedExamType('all');
                              setSelectedExamChapter('all');
                            }}
                            className="flex items-start justify-between gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)]/60 p-4 text-right hover:border-teal-600/50 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]">
                                <FolderOpen className="h-4 w-4 text-teal-700 dark:text-teal-400 shrink-0" />
                                <span>{cat.name}</span>
                              </div>
                              <p className="mt-1.5 text-xs text-[var(--ink-muted)] tabular-nums">
                                {toFa(cat.examCount)} آزمون · {toFa(cat.qCount)} پرسش
                              </p>
                              <p className="mt-1 text-[11px] text-teal-700 dark:text-teal-400">
                                {cat.years.size > 0
                                  ? `تفکیک بر اساس سال (${toFa(cat.years.size)} دوره)`
                                  : cat.chapters.size > 0
                                    ? `تفکیک بر اساس ${toFa(cat.chapters.size)} مبحث`
                                    : 'مشاهده و شرکت در آزمون‌ها'}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Drill-Down Filters inside Category or when Searching */}
                    {(selectedExamCat !== 'all' || examSearch.trim() !== '') && (
                      <div className="space-y-3 border-t border-[var(--hairline)] pt-3">
                        {activeCategoryFacets.years.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[var(--ink-muted)] ml-1">سال:</span>
                            <button
                              type="button"
                              onClick={() => setSelectedExamYear('all')}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                                selectedExamYear === 'all'
                                  ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                  : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                              }`}
                            >
                              همه سال‌ها
                            </button>
                            {activeCategoryFacets.years.map((yr) => (
                              <button
                                key={yr}
                                type="button"
                                onClick={() => setSelectedExamYear(yr)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${
                                  selectedExamYear === yr
                                    ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                    : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                                }`}
                              >
                                {toFa(yr)}
                              </button>
                            ))}
                          </div>
                        )}

                        {activeCategoryFacets.types.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[var(--ink-muted)] ml-1">نوع آزمون:</span>
                            <button
                              type="button"
                              onClick={() => setSelectedExamType('all')}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                                selectedExamType === 'all'
                                  ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                  : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                              }`}
                            >
                              همه
                            </button>
                            {activeCategoryFacets.types.map((tp) => (
                              <button
                                key={tp}
                                type="button"
                                onClick={() => setSelectedExamType(tp)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                                  selectedExamType === tp
                                    ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                                    : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                                }`}
                              >
                                {tp}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Topic / Chapter Direct Practice */}
                        {activeCategoryFacets.chapters.length > 0 && (
                          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)]/50 p-3.5">
                            <p className="text-xs font-extrabold text-[var(--ink)] mb-2">
                              آزمون {activeCategoryFacets.topicKind === 'chapter' ? 'مبحثی و فصلی' : 'بر اساس بخش / درس'} (انتخاب مستقیم برای مطالعه و یادداشت):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {activeCategoryFacets.chapters.map((ch) => (
                                <button
                                  key={ch.name}
                                  type="button"
                                  onClick={() => startChapterPractice(ch.name, activeCategoryFacets.topicKind, 'study')}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-700/25 bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-teal-800 hover:border-teal-600 dark:text-teal-300"
                                >
                                  <span>{ch.name}</span>
                                  <span className="text-[11px] text-[var(--ink-muted)] tabular-nums">
                                    ({toFa(ch.count)} تست)
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Filtered Exams Grid */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {categoryScopedExams.length === 0 ? (
                      <div className="md:col-span-2 rounded-2xl border border-dashed border-[var(--hairline-strong)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--ink-muted)]">
                        آزمونی مطابق فیلتر انتخاب‌شده یافت نشد.
                      </div>
                    ) : (
                      categoryScopedExams.map((ex) => {
                        const qCount = ex.subjects.reduce((s, sub) => s + sub.questions.length, 0);
                        const headings = Array.from(
                          new Set([
                            ...ex.subjects.map((sb) => sb.name).filter(Boolean),
                            ...ex.subjects.flatMap((sb) => sb.questions.map((q) => q.chapter || '')).filter(Boolean),
                          ])
                        );
                        return (
                          <div
                            key={ex.id}
                            className="flex flex-col justify-between rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5"
                          >
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-base font-extrabold text-[var(--ink)]">{ex.title}</h3>
                                {isAdmin && ex.isPublished === false && (
                                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                    (مخفی برای کاربران)
                                  </span>
                                )}
                              </div>
                              {ex.desc && <p className="mt-1 text-xs leading-6 text-[var(--ink-muted)]">{ex.desc}</p>}
                              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)] tabular-nums">
                                {ex.category && <span>{ex.category}</span>}
                                {ex.examType && <span>· {ex.examType}</span>}
                                {ex.year && <span>· سال {toFa(ex.year)}</span>}
                                <span>· {toFa(qCount)} پرسش</span>
                                <span>· {toFa(ex.durationMin || 30)} دقیقه</span>
                              </div>
                              {headings.length > 0 && (
                                <div className="mt-3 border-t border-[var(--hairline)] pt-2.5">
                                  <p className="text-[11px] font-bold text-[var(--ink-muted)] mb-1.5">
                                    درس‌ها به ترتیب در این آزمون (کلیک برای پرش مستقیم):
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ex.subjects.filter((sb) => sb.questions.length > 0).map((sb) => (
                                      <button
                                        key={sb.id}
                                        type="button"
                                        onClick={() => startExam(ex, 'study', sb.id)}
                                        className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] hover:border-teal-600/50"
                                      >
                                        {sb.name} ({toFa(sb.questions.length)})
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="mt-5 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startExam(ex, 'study')}
                                className="flex-1 rounded-xl bg-teal-700 py-2.5 px-3 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                              >
                                مشاهده سوالات و پاسخ
                              </button>
                              <button
                                type="button"
                                onClick={() => startExam(ex, 'exam')}
                                className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] py-2.5 px-3.5 text-xs font-bold text-[var(--ink)] hover:border-teal-600/50"
                              >
                                آزمون زمان‌دار
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* Student Attempt History (Read-Only / Inspect Only — Delete is Strictly Admin-Only) */}
              {myExamHistory.length > 0 && (
                <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-extrabold text-[var(--ink)]">
                      سوابق آزمون‌های شما ({toFa(myExamHistory.length)} کارنامه ثبت‌شده)
                    </h3>
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      نتایج آزمون ثبت‌شده دائمی هستند و صرفاً توسط مدیر قابل حذف می‌باشند.
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--hairline)]">
                    {myExamHistory.map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                        <div>
                          <p className="font-bold text-[var(--ink)]">{h.examTitle}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular-nums">
                            نمره: {toFa(h.scorePct)}٪ · صحیح: {toFa(h.correctCount)} · غلط: {toFa(h.wrongCount)} ·{' '}
                            {new Date(h.submittedAt).toLocaleDateString('fa-IR')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInspectedAttempt(h)}
                          className="rounded-xl border border-teal-700/30 bg-teal-700/10 px-3.5 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
                        >
                          مشاهده درست/غلط‌ها و نکات من
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Tab 5: Questions & Replies */}
      {/* Tab 5: Exam Notes & Review Notebook (دفترچه نکات و مرور آزمونی) */}
      {activeTab === 'notes' && (
        <section className="mt-6 space-y-5">
          {/* Header & KPI Strip */}
          <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--ink)] flex items-center gap-2">
                  <StickyNote className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>دفترچه نکات و مرور آزمونی من</span>
                </h2>
                <p className="mt-1 text-xs leading-6 text-[var(--ink-muted)]">
                  تمام نکات شخصی که زیر سوالات نوشته‌اید همراه با متن دقیق همان سوال، سوالات تیک‌خورده (سخت · مرور · نکته‌دار · بی‌دقتی) و غلط‌های آزمون‌های قبلی به‌صورت یکجا و تفکیک‌شده.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!notebookVisibleItems.some((x) => x.hasFullQuestion)}
                  onClick={() => startNotebookPractice('study')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-45 dark:bg-teal-500 dark:text-slate-950"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>شروع مرور از این فیلتر ({toFa(notebookVisibleItems.filter((x) => x.hasFullQuestion).length)})</span>
                </button>
                <button
                  type="button"
                  disabled={!notebookVisibleItems.some((x) => x.hasFullQuestion)}
                  onClick={() => startNotebookPractice('exam')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/50 disabled:opacity-45"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>آزمون زمان‌دار از فیلتر</span>
                </button>
                <button
                  type="button"
                  disabled={notebookVisibleItems.length === 0}
                  onClick={handleCopyAllNotebookNotes}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--ink)] hover:border-teal-600/50 disabled:opacity-45"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>کپی یکجای جزوه</span>
                </button>
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setNbFilter('noted')}
                className={`rounded-xl border p-3 text-right transition-colors ${
                  nbFilter === 'noted'
                    ? 'border-teal-600 bg-teal-700/10 dark:bg-teal-500/15'
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/60 hover:border-teal-600/40'
                }`}
              >
                <p className="text-[11px] font-bold text-[var(--ink-muted)]">نکات نوشته‌شده من</p>
                <p className="mt-1 text-xl font-extrabold text-teal-700 dark:text-teal-400 tabular-nums">
                  {toFa(notebookCounts.noted)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setNbFilter('review')}
                className={`rounded-xl border p-3 text-right transition-colors ${
                  nbFilter === 'review'
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/60 hover:border-sky-500/40'
                }`}
              >
                <p className="text-[11px] font-bold text-[var(--ink-muted)]">نیاز به مرور</p>
                <p className="mt-1 text-xl font-extrabold text-sky-700 dark:text-sky-400 tabular-nums">
                  {toFa(notebookCounts.review)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setNbFilter('hard')}
                className={`rounded-xl border p-3 text-right transition-colors ${
                  nbFilter === 'hard'
                    ? 'border-rose-500 bg-rose-500/10'
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/60 hover:border-rose-500/40'
                }`}
              >
                <p className="text-[11px] font-bold text-[var(--ink-muted)]">سوالات سخت</p>
                <p className="mt-1 text-xl font-extrabold text-rose-700 dark:text-rose-400 tabular-nums">
                  {toFa(notebookCounts.hard)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setNbFilter('wrong')}
                className={`rounded-xl border p-3 text-right transition-colors ${
                  nbFilter === 'wrong'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-[var(--hairline)] bg-[var(--surface-muted)]/60 hover:border-amber-500/40'
                }`}
              >
                <p className="text-[11px] font-bold text-[var(--ink-muted)]">غلط‌های آزمون‌های قبلی</p>
                <p className="mt-1 text-xl font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">
                  {toFa(notebookCounts.wrong)}
                </p>
              </button>
            </div>

            {/* Filter Chips + Grouping Switcher + Search */}
            <div className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all' as const, label: `همه (${toFa(notebookCounts.all)})` },
                  { id: 'noted' as const, label: `دارای نکته من (${toFa(notebookCounts.noted)})` },
                  { id: 'review' as const, label: `مرور (${toFa(notebookCounts.review)})` },
                  { id: 'noteworthy' as const, label: `نکته‌دار (${toFa(notebookCounts.noteworthy)})` },
                  { id: 'careless' as const, label: `بی‌دقتی (${toFa(notebookCounts.careless)})` },
                  { id: 'hard' as const, label: `سخت (${toFa(notebookCounts.hard)})` },
                  { id: 'medium' as const, label: `متوسط (${toFa(notebookCounts.medium)})` },
                  { id: 'easy' as const, label: `آسان (${toFa(notebookCounts.easy)})` },
                  { id: 'wrong' as const, label: `غلط‌های قبلی (${toFa(notebookCounts.wrong)})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setNbFilter(f.id);
                      setNbSelectedGroup('all');
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                      nbFilter === f.id
                        ? 'border-teal-600 bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                        : 'border-[var(--hairline)] bg-[var(--surface-muted)]/70 text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNbGroupBy('subject');
                      setNbSelectedGroup('all');
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      nbGroupBy === 'subject'
                        ? 'bg-[var(--surface)] text-teal-700 shadow-2xs dark:text-teal-300'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>تفکیک بر اساس درس</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNbGroupBy('exam');
                      setNbSelectedGroup('all');
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      nbGroupBy === 'exam'
                        ? 'bg-[var(--surface)] text-teal-700 shadow-2xs dark:text-teal-300'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>تفکیک بر اساس آزمون</span>
                  </button>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
                  <input
                    type="text"
                    value={nbSearch}
                    onChange={(e) => setNbSearch(e.target.value)}
                    placeholder="جستجو در متن سوال یا نکات شخصی..."
                    className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] pr-9 pl-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              {/* Group Sub-Selector (Lessons or Exams) */}
              {notebookGroupOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setNbSelectedGroup('all')}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      nbSelectedGroup === 'all'
                        ? 'border-teal-600/60 bg-teal-700/15 text-teal-800 dark:text-teal-300'
                        : 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {nbGroupBy === 'subject' ? 'همه دروس' : 'همه آزمون‌ها'} ({toFa(notebookBaseFiltered.length)})
                  </button>
                  {notebookGroupOptions.map((g) => (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => setNbSelectedGroup(g.name)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        nbSelectedGroup === g.name
                          ? 'border-teal-600/60 bg-teal-700/15 text-teal-800 dark:text-teal-300'
                          : 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {g.name} ({toFa(g.count)})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notebook Cards List */}
          {notebookVisibleItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] bg-[var(--surface)] p-10 text-center">
              <StickyNote className="mx-auto h-9 w-9 text-teal-700/60 dark:text-teal-400/60" />
              <h3 className="mt-3 text-sm font-extrabold text-[var(--ink)]">
                {notebookEntries.length === 0
                  ? 'دفترچه نکات آزمونی شما هنوز خالی است'
                  : 'موردی با این فیلتر پیدا نشد'}
              </h3>
              <p className="mt-1.5 text-xs leading-6 text-[var(--ink-muted)] max-w-md mx-auto">
                {notebookEntries.length === 0
                  ? 'در بخش آزمون‌های آنلاین زیر هر سوال نکته شخصی بنویسید یا تیک سخت · مرور · نکته‌دار · بی‌دقتی بزنید تا به‌صورت خودکار اینجا دسته‌بندی شوند.'
                  : 'فیلتر فعال یا عبارت جستجو را تغییر دهید تا سایر سوالات ذخیره‌شده نمایش داده شوند.'}
              </p>
              {notebookEntries.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('exams');
                    navigate('/exams');
                  }}
                  className="mt-4 rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                >
                  رفتن به آزمون‌های آنلاین
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {notebookVisibleItems.map((item, idx) => {
                const subjTheme = getSubjectColorTheme(undefined, item.subjectName, item.subjectName);
                const isExpanded = Boolean(nbExpandedQIds[item.id]);
                const currentNoteDraft = examNoteDrafts[item.id] ?? item.note;
                const isDirty = currentNoteDraft.trim() !== item.note.trim();

                return (
                  <article
                    key={item.id}
                    className={`rounded-2xl border p-5 transition-colors ${subjTheme.card}`}
                  >
                    {/* Card Header: Subject + Exam + Question Number + Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--hairline)]">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className={`rounded-md px-2 py-0.5 font-extrabold ${subjTheme.badge}`}>
                          {item.subjectName}
                        </span>
                        <span className="rounded-md border border-[var(--hairline)] bg-[var(--surface)] px-2 py-0.5 text-[var(--ink)]">
                          {item.examTitle}
                          {item.qNumber ? ` · سوال ${toFa(item.qNumber)}` : ` · مورد ${toFa(idx + 1)}`}
                        </span>
                        {item.chapter && (
                          <span className="rounded-md bg-[var(--surface)]/80 px-2 py-0.5 text-[var(--ink-muted)]">
                            سرفصل: {item.chapter}
                          </span>
                        )}
                        {item.sourceLabel && (
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-300">
                            {formatQuestionSourceNotice(item.sourceLabel)}
                          </span>
                        )}
                        {item.isWrong && (
                          <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-rose-700 dark:text-rose-300">
                            غلط در آزمون{item.wrongCount > 1 ? ` (${toFa(item.wrongCount)} بار)` : ''}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {item.hasFullQuestion && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyQuestion(
                                {
                                  id: item.id,
                                  q: item.q,
                                  options: item.options,
                                  answer: item.answer,
                                  exp: item.exp,
                                  chapter: item.chapter,
                                  sourceLabel: item.sourceLabel,
                                },
                                item.subjectName,
                                item.qNumber
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          >
                            <Copy className="h-3 w-3" />
                            <span>{copiedQId === item.id ? 'کپی شد' : 'کپی'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Exact Question Stem */}
                    <div className="mt-3">
                      <p className="text-[11px] font-bold text-[var(--ink-muted)] mb-1">متن سوال مرتبط:</p>
                      <p className="text-sm font-bold leading-7 text-[var(--ink)]">{item.q}</p>
                    </div>

                    {/* Student's Personal Note Box (Prominent + Editable in place) */}
                    <div className="mt-3.5 rounded-xl border border-teal-600/35 bg-[var(--surface)] p-3.5 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <label
                          htmlFor={`nb-note-${item.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-800 dark:text-teal-300"
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                          <span>{item.note ? 'نکته شخصی من برای این سوال' : 'ثبت نکته شخصی برای این سوال'}</span>
                        </label>
                        {item.note && !isDirty && (
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            ذخیره‌شده در دفترچه شما
                          </span>
                        )}
                      </div>
                      <textarea
                        id={`nb-note-${item.id}`}
                        rows={item.note ? 3 : 2}
                        value={currentNoteDraft}
                        onChange={(e) =>
                          setExamNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="نکته حقوقی، مستند ماده یا دلیل اشتباه خود در این سوال را اینجا بنویسید..."
                        className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-muted)]/60 px-3 py-2 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] text-[var(--ink-muted)]">
                          نکات شخصی شما کاملاً محرمانه و فقط در حساب خودتان ذخیره می‌شود.
                        </span>
                        <div className="flex items-center gap-2">
                          {item.note && (
                            <button
                              type="button"
                              onClick={() => {
                                setExamNoteDrafts((prev) => ({ ...prev, [item.id]: '' }));
                                saveExamNote(item.id, '');
                              }}
                              className="rounded-lg border border-rose-500/25 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-500/10 dark:text-rose-400"
                            >
                              پاک کردن نکته
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => saveExamNote(item.id, currentNoteDraft)}
                            className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-colors ${
                              isDirty
                                ? 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950'
                                : 'border border-[var(--hairline-strong)] bg-[var(--surface-muted)] text-[var(--ink)] hover:border-teal-600/50'
                            }`}
                          >
                            ذخیره نکته
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Difficulty & Study Flags */}
                    {renderQuestionTagBar(item.id, {
                      examTitle: item.examTitle,
                      subjectName: item.subjectName,
                      qText: item.q,
                    })}

                    {/* Expandable Options & Explanation */}
                    {item.hasFullQuestion && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setNbExpandedQIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--ink)] hover:border-teal-600/50"
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span>{isExpanded ? 'بستن گزینه‌ها و پاسخ تشریحی' : 'مشاهده گزینه‌ها و پاسخ تشریحی'}</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3.5">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {item.options.filter(Boolean).map((opt, oi) => {
                                const isRight = oi === item.answer;
                                const isWrongPick = item.isWrong && item.lastWrongPicked === oi && !isRight;
                                return (
                                  <div
                                    key={oi}
                                    className={`rounded-lg border px-3 py-2 text-xs leading-6 ${
                                      isRight
                                        ? 'border-emerald-500/60 bg-emerald-500/10 font-bold text-emerald-900 dark:text-emerald-200'
                                        : isWrongPick
                                          ? 'border-rose-500/60 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                                          : 'border-[var(--hairline)] bg-[var(--surface-muted)]/50 text-[var(--ink-prose)]'
                                    }`}
                                  >
                                    <span className="ml-1.5 font-extrabold tabular-nums">{toFa(oi + 1)})</span>
                                    {opt}
                                    {isRight && <span className="mr-1.5 text-[10px] font-extrabold">✓ صحیح</span>}
                                    {isWrongPick && <span className="mr-1.5 text-[10px] font-extrabold">✕ انتخاب قبلی</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {item.exp && (
                              <div className="rounded-lg border border-teal-700/20 bg-teal-700/5 p-3 text-xs leading-6 text-[var(--ink-prose)]">
                                <span className="font-extrabold text-teal-800 dark:text-teal-300">پاسخ تشریحی: </span>
                                {item.exp}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 6: Q&A */}
      {activeTab === 'qa' && (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={submitQuestion}
            className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 lg:col-span-1 h-fit"
          >
            <h2 className="text-base font-extrabold text-[var(--ink)]">طرح پرسش حقوقی یا مشاوره آزمون</h2>
            <p className="mt-1 text-xs leading-6 text-[var(--ink-muted)]">
              پرسش شما برای هیئت علمی برائت ارسال و پاسخ آن در همین صفحه نمایش داده می‌شود.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">درس یا موضوع</label>
                <input
                  type="text"
                  value={qaSubject}
                  onChange={(e) => setQaSubject(e.target.value)}
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">متن پرسش</label>
                <textarea
                  rows={4}
                  value={qaText}
                  onChange={(e) => setQaText(e.target.value)}
                  placeholder="پرسش یا ابهام خود را با ذکر ماده قانونی بنویسید..."
                  className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-2 text-xs leading-6 text-[var(--ink)] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={qaSubmitting}
                className="w-full rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
              >
                {qaSubmitting ? 'در حال ارسال...' : 'ارسال پرسش'}
              </button>
            </div>
          </form>

          <div className="space-y-3 lg:col-span-2">
            {sortedQuestions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] bg-[var(--surface)] p-10 text-center text-xs text-[var(--ink-muted)]">
                هنوز پرسشی ثبت نشده است. اولین پرسش را مطرح کنید.
              </div>
            ) : (
              sortedQuestions.map((q) => (
                <div key={q.id} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                    <span className="font-bold text-teal-700 dark:text-teal-400">{q.subject || 'عمومی'}</span>
                    <span>{q.createdAt}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-7 text-[var(--ink)]">{q.question}</p>
                  {q.reply ? (
                    <div className="mt-3 rounded-xl border border-teal-700/20 bg-teal-700/5 p-3.5 text-xs leading-7 text-[var(--ink-prose)]">
                      <span className="font-extrabold text-teal-800 dark:text-teal-300">پاسخ برائت: </span>
                      {q.reply}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">در انتظار پاسخ کارشناس...</p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-3">
              <h3 className="text-sm font-bold text-[var(--ink)]">{previewAttachment.name}</h3>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              {previewAttachment.type?.includes('pdf') || previewAttachment.name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewAttachment.url}
                  title={previewAttachment.name}
                  className="h-[70vh] w-full rounded-xl border border-[var(--hairline)]"
                />
              ) : (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name}
                  className="max-h-[75vh] rounded-xl object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
