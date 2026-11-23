export interface Law {
  id: number;
  name: string;
  sort: number;
}

export interface ArticleSection {
  h: string;
  v: string;
}

export interface Article {
  id: number;
  law_id: number;
  law: string;
  ord: number;
  num: string;
  num_text: string;
  text: string;
  path: string[];
  sections: ArticleSection[];
  norm?: string;
  tn?: string;
  pn?: string;
}

export interface Decision {
  number: string;
  year: string;
  date?: string;
  subject?: string;
  text: string;
}

export interface JournalArticle {
  id: string;
  title: string;
  category: string;
  author: string;
  date: string;
  abstract: string;
  content: string;
  coverImage?: string;
  coverCaption?: string;
  featured?: boolean;
  tags?: string[];
}

export interface DeadlineItem {
  id: string;
  title: string;
  law: string;
  daysIran: number;
  daysAbroad: number;
  cat: string;
  desc: string;
}

export interface CustomCalculator {
  id: string;
  title: string;
  type: 'percent' | 'daily' | 'fixed';
  rate: number;
  desc: string;
}

export interface AboutInfo {
  title: string;
  subtitle: string;
  mission: string;
  vision: string;
  team: { name: string; role: string; bio: string }[];
  services: string[];
  stats: { label: string; value: string }[];
}

export interface ContactInfo {
  phone: string;
  mobile: string;
  email: string;
  address: string;
  hours: string;
  telegram: string;
  instagram: string;
  whatsapp: string;
  mapNote: string;
}

export interface LegalCase {
  id: string;
  title: string;
  client: string;
  court: string;
  caseNumber: string;
  status: 'جاری' | 'نوبت رسیدگی' | 'مختومه' | 'تجدیدنظر';
  nextDate?: string;
  notes?: string;
  updatedAt?: string;
}

export interface ExamQuestion {
  id: string;
  q: string;
  options: string[];
  answer: number;
  exp?: string;
  chapter?: string;
  sourceLabel?: string;
  csvQuestionNum?: string;
  csvRowIndex?: number;
  csvFileName?: string;
}

export interface ExamSubject {
  id: string;
  name: string;
  questions: ExamQuestion[];
}

export type ExamScope = 'general' | 'subject';
export type ExamRunMode = 'timed' | 'prep';

export interface ExamSubjectFolder {
  id: string;
  name: string;
  desc?: string;
  order?: number;
  createdAt?: string;
}

export interface LegalExam {
  id: string;
  title: string;
  durationMin: number;
  desc?: string;
  category?: string;
  examType?: string;
  year?: string;
  examScope?: ExamScope;
  subjectGroup?: string;
  isPublished?: boolean;
  isPremium?: boolean;
  subjects: ExamSubject[];
  createdAt?: string;
}

export interface VipSubscriber {
  email: string;
  name?: string;
  plan?: string;
  expiresAt?: string;
  note?: string;
  active?: boolean;
  createdAt: string;
}

export interface VipSettings {
  subscribers: VipSubscriber[];
  upgradeMessage?: string;
  supportContact?: string;
}

export interface ExamAttemptQuestionSnapshot {
  id: string;
  subjectName: string;
  chapter?: string;
  sourceLabel?: string;
  csvQuestionNum?: string;
  csvRowIndex?: number;
  csvFileName?: string;
  q: string;
  options: string[];
  answer: number;
  exp?: string;
}

export type ExamQuestionDifficulty = 'easy' | 'medium' | 'hard';
export type ExamQuestionFlagTag = 'review' | 'noteworthy' | 'careless';

export interface ExamQuestionTagState {
  difficulty?: ExamQuestionDifficulty;
  tags?: ExamQuestionFlagTag[];
  examTitle?: string;
  subjectName?: string;
  qPreview?: string;
  updatedAt?: string;
}

export interface ExamPrepRecord {
  lastChoice: number;
  isCorrect: boolean;
  attempts: number;
  correctRuns: number;
  wrongRuns: number;
  updatedAt: number;
}

export interface ExamAttemptResult {
  id: string;
  examId: string;
  examTitle: string;
  examCategory?: string;
  examYear?: string;
  examType?: string;
  examScope?: ExamScope;
  subjectGroup?: string;
  mode?: ExamRunMode;
  userId?: string;
  userEmail?: string;
  scorePct: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  totalQuestions: number;
  answers?: Record<string, number>;
  questionTags?: Record<string, ExamQuestionTagState>;
  questionsSnapshot?: ExamAttemptQuestionSnapshot[];
  subjectBreakdown: { name: string; correct: number; wrong: number; blank: number; pct: number }[];
  submittedAt: string;
}

export interface QuestionReplyItem {
  id: string;
  email: string;
  userName?: string;
  question: string;
  subject?: string;
  reply?: string;
  repliedAt?: string;
  createdAt: string;
}

export interface SubjectLawRef {
  name: string;
  count: number;
  unit: string;
  topics?: string[];
  db?: string;
  min?: number;
  max?: number;
}

export interface StudySubject {
  id: string;
  name: string;
  laws: SubjectLawRef[];
}

export interface PlannerFileAttachment {
  id?: string;
  name: string;
  type?: string;
  path?: string;
  dataUrl?: string;
  size?: number;
}

export interface PlannerRefLink {
  title: string;
  page?: string;
  url?: string;
}

export interface StudyBlock {
  id: string;
  subjectId: string;
  law: string;
  spec: string;
  title: string;
  task?: string;
  items: string[];
  checks: boolean[];
  notes: string;
  mastery: string;
  refs?: PlannerRefLink[];
  files?: PlannerFileAttachment[];
  open?: boolean;
  src?: string;
  sectionLabel?: string;
  order?: number;
}

export interface StudyDay {
  id: string;
  number: number;
  group?: string;
  blocks: StudyBlock[];
  open?: boolean;
}

export interface PlannerMark {
  note: string;
  t: number;
}

export interface PlannerState {
  subjects: StudySubject[];
  days: StudyDay[];
  subjectSections?: StudyBlock[];
  marks?: Record<string, PlannerMark>;
  examNotes?: Record<string, string>;
  examNotesUpdatedAt?: Record<string, number>;
  examNotesDeletedAt?: Record<string, number>;
  examTags?: Record<string, ExamQuestionTagState>;
  examTagsDeletedAt?: Record<string, number>;
  examPrepHistory?: Record<string, ExamPrepRecord>;
  imports?: { id: string; name: string }[];
  _userEmail?: string;
  _lastAssignedAt?: string;
  _summary?: {
    totalBlocks: number;
    doneChecks: number;
    pct: number;
    updatedAt: string;
  };
}

export interface AssignedPlanEntry {
  updatedAt: string;
  mode: 'merge' | 'replace';
  planKind: 'json' | 'lib' | 'text' | 'subjectSplit';
  jsonState?: PlannerState;
  libIds?: string[];
  text?: string;
  subjectName?: string;
  lawName?: string;
  dbLaw?: string;
  fromNum?: number;
  toNum?: number;
  chunkSize?: number;
}
