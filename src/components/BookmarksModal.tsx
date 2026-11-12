import React from 'react';
import { Bookmark, X, Trash2, ExternalLink, Scale, Hash } from 'lucide-react';
import type { BookmarkItem } from '../types';
import { toPersianDigits } from '../utils/legalFormatter';

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: BookmarkItem[];
  onRemoveBookmark: (id: string) => void;
  onSelectArticle: (lawName?: string, num?: string) => void;
}

export const BookmarksModal: React.FC<BookmarksModalProps> = ({
  isOpen,
  onClose,
  bookmarks,
  onRemoveBookmark,
  onSelectArticle
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-500 fill-current" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              مواد و آرای نشان‌شده ({toPersianDigits(bookmarks.length)})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {bookmarks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>هنوز هیچ ماده یا رأی وحدت رویه‌ای را نشان نکرده‌اید.</p>
              <p className="mt-1 text-[11px]">با زدن دکمه نشان (☆) در کنار مواد، به آنها دسترسی سریع خواهید داشت.</p>
            </div>
          ) : (
            bookmarks.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {b.type === 'decision' ? (
                      <span className="px-2 py-0.5 rounded bg-teal-700 text-white font-bold text-[10px]">
                        رأی دیوان
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-semibold text-[10px]">
                        {b.lawName || 'ماده قانونی'}
                      </span>
                    )}
                    <span className="font-bold text-slate-900 dark:text-white">{b.title}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        onSelectArticle(b.lawName, b.num);
                        onClose();
                      }}
                      className="p-1 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60 rounded"
                      title="مشاهده در جستجو"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemoveBookmark(b.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded"
                      title="حذف از نشان‌شده‌ها"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {b.text}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
