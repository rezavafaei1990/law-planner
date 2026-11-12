import React from 'react';
import { 
  Search, 
  Calendar, 
  Scale, 
  Clock, 
  BookOpen, 
  Bookmark, 
  Moon, 
  Sun, 
  Database,
  CloudCheck,
  Sparkles
} from 'lucide-react';
import type { TabType } from '../types';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  bookmarksCount: number;
  onOpenBookmarks: () => void;
  onOpenAiImporter: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isCloudSynced: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  bookmarksCount,
  onOpenBookmarks,
  onOpenAiImporter,
  isDark,
  onToggleTheme,
  isCloudSynced
}) => {
  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'search', label: 'جستجوی قوانین', icon: <Search className="w-4 h-4" /> },
    { id: 'planner', label: 'برنامه‌ریز لایتنر', icon: <Calendar className="w-4 h-4" /> },
    { id: 'precedents', label: 'آرای وحدت رویه', icon: <Scale className="w-4 h-4" /> },
    { id: 'deadlines', label: 'مواعد قانونی', icon: <Clock className="w-4 h-4" /> },
    { id: 'subjects', label: 'دروس و منابع', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'admin', label: 'مدیریت پایگاه', icon: <Database className="w-4 h-4" /> }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-700 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-sm shadow-teal-500/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">دادبان</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                همراه جامع حقوقی
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              جستجوی مواد، آرای دیوان و برنامه‌ریزی آزمون وکالت
            </p>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* AI Importer CTA */}
          <button
            onClick={onOpenAiImporter}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 transition-colors"
            title="ایمپورت یا ساخت هوشمند برنامه مطالعه"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>برنامه هوشمند</span>
          </button>

          {/* Bookmarks Drawer Trigger */}
          <button
            onClick={onOpenBookmarks}
            className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="مواد و آرای نشان‌شده"
          >
            <Bookmark className="w-4 h-4" />
            {bookmarksCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {bookmarksCount}
              </span>
            )}
          </button>

          {/* Cloud Sync indicator */}
          <div 
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400"
            title={isCloudSynced ? 'متصل به پایگاه ابری' : 'حالت آفلاین محلی'}
          >
            <CloudCheck className={`w-4 h-4 ${isCloudSynced ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
          </div>

          {/* Theme Switcher */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isDark ? 'حالت روشن' : 'حالت تیره'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Secondary Navigation Row */}
      <div className="lg:hidden flex items-center gap-1 px-4 py-2 overflow-x-auto border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
