import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  History,
  XCircle,
} from 'lucide-react';
import type {
  ExamPrepRecord,
  ExamQuestion,
  ExamQuestionDifficulty,
  ExamQuestionFlagTag,
  ExamQuestionTagState,
  ExamRunMode,
} from '../types';
import { toFa } from '../utils/legal';

const DIFFICULTY_OPTIONS: Array<{
  id: ExamQuestionDifficulty;
  label: string;
  activeCls: string;
  dotCls: string;
}> = [
  {
    id: 'easy',
    label: 'آسان',
    activeCls: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    dotCls: 'bg-emerald-500',
  },
  {
    id: 'medium',
    label: 'متوسط',
    activeCls: 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300',
    dotCls: 'bg-amber-500',
  },
  {
    id: 'hard',
    label: 'سخت',
    activeCls: 'border-rose-500/50 bg-rose-500/15 text-rose-800 dark:text-rose-300',
    dotCls: 'bg-rose-500',
  },
];

const FLAG_OPTIONS: Array<{
  id: ExamQuestionFlagTag;
  label: string;
  activeCls: string;
}> = [
  {
    id: 'review',
    label: 'مرور',
    activeCls: 'border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-300',
  },
  {
    id: 'noteworthy',
    label: 'نکته‌دار',
    activeCls: 'border-violet-500/50 bg-violet-500/15 text-violet-800 dark:text-violet-300',
  },
  {
    id: 'careless',
    label: 'بی‌دقتی',
    activeCls: 'border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-300',
  },
];

export interface ExamQuestionCardProps {
  question: ExamQuestion;
  displayIndex: number;
  subjectName: string;
  examTitle: string;
  mode: ExamRunMode;
  picked: number | undefined;
  isRevealed: boolean;
  prevPrepRecord?: ExamPrepRecord;
  tagState?: ExamQuestionTagState;
  savedNote: string;
  isCopied: boolean;
  isAdmin: boolean;
  adminCsvRef?: string;
  sourceNotice?: string;
  onPickOption: (questionId: string, optionIdx: number, correctIdx: number) => void;
  onToggleReveal: (questionId: string, currentlyRevealed: boolean) => void;
  onToggleDifficulty: (
    questionId: string,
    diff: ExamQuestionDifficulty,
    meta: { examTitle: string; subjectName: string; qText: string }
  ) => void;
  onToggleFlag: (
    questionId: string,
    flag: ExamQuestionFlagTag,
    meta: { examTitle: string; subjectName: string; qText: string }
  ) => void;
  onSaveNote: (questionId: string, note: string) => void;
  onCopy: (q: ExamQuestion, subjectName: string, displayIndex: number) => void;
}

export const ExamQuestionCard: React.FC<ExamQuestionCardProps> = React.memo(
  ({
    question: q,
    displayIndex,
    subjectName,
    examTitle,
    mode,
    picked,
    isRevealed,
    prevPrepRecord,
    tagState,
    savedNote,
    isCopied,
    isAdmin,
    adminCsvRef,
    sourceNotice,
    onPickOption,
    onToggleReveal,
    onToggleDifficulty,
    onToggleFlag,
    onSaveNote,
    onCopy,
  }) => {
    const [noteDraft, setNoteDraft] = useState(savedNote);
    const [noteOpen, setNoteOpen] = useState(Boolean(savedNote));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
      if (!isFocused) {
        setNoteDraft(savedNote);
        if (savedNote) setNoteOpen(true);
      }
    }, [savedNote, isFocused]);

    const isPrep = mode === 'prep';
    const isAnswered = picked !== undefined;
    const isRev = isPrep && (isRevealed || isAnswered);
    const isPickedCorrect = isAnswered && picked === q.answer;
    const isPickedWrong = isAnswered && picked !== q.answer;
    const activeFlags = Array.isArray(tagState?.tags) ? tagState.tags : [];
    const isNoteDirty = noteDraft !== savedNote;
    const meta = { examTitle, subjectName, qText: q.q };

    return (
      <article
        id={`q-card-${q.id}`}
        className={`rounded-xl border p-4 transition-colors ${
          isPrep && isPickedCorrect
            ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
            : isPrep && isPickedWrong
              ? 'border-rose-500/40 bg-rose-500/[0.04]'
              : 'border-[var(--hairline)] bg-[var(--surface-muted)]/55'
        }`}
      >
        {/* Top Metadata Strip */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            {isPrep && isPickedCorrect && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-0.5 font-extrabold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>پاسخ صحیح</span>
              </span>
            )}
            {isPrep && isPickedWrong && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-0.5 font-extrabold text-rose-800 dark:text-rose-300">
                <XCircle className="h-3.5 w-3.5" />
                <span>نادرست · گزینه صحیح: {toFa(q.answer + 1)}</span>
              </span>
            )}
            {q.chapter && q.chapter !== subjectName && (
              <span className="font-bold text-teal-700 dark:text-teal-400">
                سرفصل: {q.chapter}
              </span>
            )}
            {sourceNotice && (
              <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 font-bold text-amber-800 dark:text-amber-300">
                {sourceNotice}
              </span>
            )}
            {isAdmin && adminCsvRef && (
              <span
                title={q.csvFileName ? `فایل منبع: ${q.csvFileName}` : 'شناسه سوال در فایل منبع (فقط مدیر)'}
                className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10.5px] font-bold text-indigo-800 dark:text-indigo-300 tabular-nums"
              >
                مدیر · {adminCsvRef}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onCopy(q, subjectName, displayIndex)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] hover:border-teal-600/50"
            title="کپی سوال، گزینه‌ها، جواب و نکته"
          >
            {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{isCopied ? 'کپی شد' : 'کپی'}</span>
          </button>
        </div>

        {/* Question Stem */}
        <p className="text-sm font-bold leading-7 text-[var(--ink)]">
          <span className="ml-1.5 text-teal-700 dark:text-teal-400 tabular-nums">{toFa(displayIndex)}.</span>
          {q.q}
        </p>

        {/* Options Grid */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {q.options.map((opt, optIdx) => {
            const selected = picked === optIdx;
            const isRightOpt = q.answer === optIdx;
            let btnCls =
              'border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-prose)] hover:border-teal-600/45';
            if (isRev) {
              if (isRightOpt) {
                btnCls = 'border-emerald-600 bg-emerald-500/15 font-bold text-emerald-900 dark:text-emerald-200';
              } else if (selected) {
                btnCls = 'border-rose-600 bg-rose-500/15 font-bold text-rose-900 dark:text-rose-200';
              }
            } else if (selected) {
              btnCls = 'border-teal-600 bg-teal-700/10 font-bold text-teal-800 dark:text-teal-300';
            }
            return (
              <button
                key={optIdx}
                type="button"
                onClick={() => onPickOption(q.id, optIdx, q.answer)}
                className={`flex items-start justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-right text-xs font-medium transition-colors ${btnCls}`}
              >
                <span>
                  <span className="ml-2 font-extrabold tabular-nums">{toFa(optIdx + 1)})</span>
                  {opt}
                </span>
                {isRev && isRightOpt && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                {isRev && selected && !isRightOpt && (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Prep Mode Feedback, Explanation & Previous Attempt History (ONLY shown AFTER answering or explicit reveal!) */}
        {isPrep && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleReveal(q.id, isRev)}
                className="rounded-lg border border-teal-700/25 bg-teal-700/10 px-3 py-1 text-[11px] font-bold text-teal-800 hover:bg-teal-700/20 dark:text-teal-300"
              >
                {isRev ? 'بستن پاسخ و بازنشانی' : 'مشاهده مستقیم پاسخ و تشریح'}
              </button>
            </div>

            {isRev && (
              <div className="space-y-2">
                {/* Previous session performance — strictly revealed AFTER user answers/reveals */}
                {prevPrepRecord && (
                  <div
                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-bold ${
                      prevPrepRecord.isCorrect
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200'
                        : 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <History className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      سابقه قبلی شما: دفعه قبل{' '}
                      {prevPrepRecord.isCorrect ? (
                        <strong className="text-emerald-700 dark:text-emerald-300">
                          درست زده بودید (گزینه {toFa(prevPrepRecord.lastChoice + 1)})
                        </strong>
                      ) : (
                        <strong className="text-rose-700 dark:text-rose-300">
                          غلط زده بودید (گزینه {toFa(prevPrepRecord.lastChoice + 1)})
                        </strong>
                      )}
                      {prevPrepRecord.attempts > 1
                        ? ` · مجموع ${toFa(prevPrepRecord.attempts)} بار تمرین (${toFa(prevPrepRecord.correctRuns)} درست · ${toFa(prevPrepRecord.wrongRuns)} غلط)`
                        : ''}
                    </span>
                  </div>
                )}

                <div className="rounded-lg border border-emerald-600/25 bg-[var(--surface)] p-3 text-xs leading-6">
                  <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                    گزینه صحیح: {toFa(q.answer + 1)}) {q.options[q.answer]}
                  </p>
                  {q.exp && (
                    <p className="mt-1 text-[var(--ink-prose)]">
                      <span className="font-bold text-teal-700 dark:text-teal-400">پاسخ تشریحی: </span>
                      {q.exp}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compact Difficulty, Review Flags & Note Trigger Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)]/85 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {DIFFICULTY_OPTIONS.map((opt) => {
              const active = tagState?.difficulty === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggleDifficulty(q.id, opt.id, meta)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${
                    active
                      ? opt.activeCls
                      : 'border-[var(--hairline)] bg-[var(--surface-muted)]/70 text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? opt.dotCls : 'bg-slate-400/50'}`} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
            <span className="mx-0.5 h-3.5 w-px bg-[var(--hairline)]" aria-hidden="true" />
            {FLAG_OPTIONS.map((fl) => {
              const active = activeFlags.includes(fl.id);
              return (
                <button
                  key={fl.id}
                  type="button"
                  onClick={() => onToggleFlag(q.id, fl.id, meta)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${
                    active
                      ? fl.activeCls
                      : 'border-[var(--hairline)] bg-[var(--surface-muted)]/70 text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  <span>{fl.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
              savedNote || noteOpen
                ? 'border-teal-600/40 bg-teal-700/10 text-teal-800 dark:text-teal-300'
                : 'border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Bookmark className="h-3 w-3" />
            <span>{savedNote ? 'نکته شخصی من (ثبت‌شده)' : noteOpen ? 'بستن نکته' : 'افزودن نکته'}</span>
          </button>
        </div>

        {/* Collapsible Personal Note Box (local state prevents parent re-renders on keystroke!) */}
        {noteOpen && (
          <div className="mt-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400">
                نکته شخصی شما (ذخیره و همگام‌سازی خودکار روی وب و اپلیکیشن)
              </span>
              {isNoteDirty && (
                <button
                  type="button"
                  onClick={() => onSaveNote(q.id, noteDraft)}
                  className="rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
                >
                  ذخیره نکته
                </button>
              )}
            </div>
            <textarea
              rows={2}
              value={noteDraft}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                setIsFocused(false);
                if (noteDraft !== savedNote) {
                  onSaveNote(q.id, noteDraft);
                }
              }}
              placeholder="نکته مهم، ماده قانونی مرتبط یا علت اشتباه در این تست را بنویسید..."
              className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs leading-6 text-[var(--ink)] outline-none focus:border-teal-600"
            />
          </div>
        )}
      </article>
    );
  }
);

ExamQuestionCard.displayName = 'ExamQuestionCard';
