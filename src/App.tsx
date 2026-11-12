import React, { useState, useEffect, useCallback } from 'react';
import type { TabType, Law, Article, Decision, StudyDay, Subject, BookmarkItem } from './types';
import { Header } from './components/Header';
import { SearchTab } from './components/SearchTab';
import { PlannerTab } from './components/PlannerTab';
import { PrecedentsTab } from './components/PrecedentsTab';
import { DeadlinesTab } from './components/DeadlinesTab';
import { SubjectsTab } from './components/SubjectsTab';
import { AdminTab } from './components/AdminTab';
import { BookmarksModal } from './components/BookmarksModal';
import { AiImportModal } from './components/AiImportModal';

import { INITIAL_LAWS, INITIAL_ARTICLES, INITIAL_DECISIONS } from './data/sampleLaws';
import { DEFAULT_SUBJECTS, BUILT_IN_CURRICULA } from './data/defaultPlans';
import { fetchAllLaws, fetchAllArticles, fetchAllDecisions } from './services/supabase';

export default function App() {
  // Sync tab with URL hash or default to 'search'
  const getInitialTab = (): TabType => {
    const hash = window.location.hash.replace('#', '');
    if (['search', 'planner', 'precedents', 'deadlines', 'subjects', 'admin'].includes(hash)) {
      return hash as TabType;
    }
    return 'search';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme_mode');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme_mode', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme_mode', 'light');
    }
  }, [isDark]);

  // Data states
  const [laws, setLaws] = useState<Law[]>(INITIAL_LAWS);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [decisions, setDecisions] = useState<Decision[]>(INITIAL_DECISIONS);
  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem('law_subjects');
    return saved ? JSON.parse(saved) : DEFAULT_SUBJECTS;
  });

  // Planner states
  const [activeCurriculumKey, setActiveCurriculumKey] = useState<string>('civil');
  const [days, setDays] = useState<StudyDay[]>(() => {
    const saved = localStorage.getItem('law_planner_days_civil');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return BUILT_IN_CURRICULA.civil.days;
  });

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => {
    const saved = localStorage.getItem('law_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });

  // Modals
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isAiImportOpen, setIsAiImportOpen] = useState(false);

  // Search parameters for programmatic navigation
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [searchInitialLawId, setSearchInitialLawId] = useState<number | null>(null);

  // Cloud sync status
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Hash change handler
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['search', 'planner', 'precedents', 'deadlines', 'subjects', 'admin'].includes(hash)) {
        setActiveTab(hash as TabType);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load from Supabase on mount
  const loadCloudData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [cloudLaws, cloudArts, cloudDecs] = await Promise.all([
        fetchAllLaws(),
        fetchAllArticles(),
        fetchAllDecisions()
      ]);

      if (cloudLaws && cloudLaws.length > 0) {
        setLaws((prev) => {
          const merged = [...cloudLaws];
          // Ensure we don't drop laws
          return merged;
        });
      }

      if (cloudArts && cloudArts.length > 0) {
        setArticles(cloudArts);
      }

      if (cloudDecs && cloudDecs.length > 0) {
        setDecisions(cloudDecs);
      }

      setIsCloudSynced(true);
    } catch (e) {
      console.warn('Could not sync with Supabase, using local cached data', e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadCloudData();
  }, [loadCloudData]);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem(`law_planner_days_${activeCurriculumKey}`, JSON.stringify(days));
  }, [days, activeCurriculumKey]);

  useEffect(() => {
    localStorage.setItem('law_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem('law_subjects', JSON.stringify(subjects));
  }, [subjects]);

  // Curriculum Switcher
  const handleSelectCurriculum = (key: string) => {
    setActiveCurriculumKey(key);
    const saved = localStorage.getItem(`law_planner_days_${key}`);
    if (saved) {
      try {
        setDays(JSON.parse(saved));
        return;
      } catch {
        // fallback
      }
    }
    const curr = BUILT_IN_CURRICULA[key];
    if (curr) {
      setDays(curr.days);
    }
  };

  // Toggle bookmark
  const handleToggleBookmark = (item: {
    id: string;
    type: 'article' | 'decision';
    title: string;
    text: string;
    lawName?: string;
    num?: string;
    path?: string[];
  }) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.id === item.id);
      if (exists) {
        return prev.filter((b) => b.id !== item.id);
      }
      return [
        {
          ...item,
          savedAt: new Date().toISOString()
        },
        ...prev
      ];
    });
  };

  const handleRemoveBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  // Jump from Planner / Subject to Search
  const handleViewArticlesInSearch = (lawName: string, artRange: string) => {
    const matchedLaw = laws.find((l) => l.name.includes(lawName) || lawName.includes(l.name));
    if (matchedLaw) {
      setSearchInitialLawId(matchedLaw.id);
    }
    setSearchInitialQuery(artRange ? `ماده ${artRange.split('-')[0].trim()}` : lawName);
    handleTabChange('search');
  };

  const handleSelectLawForSearch = (lawName: string) => {
    const matchedLaw = laws.find((l) => l.name === lawName);
    if (matchedLaw) {
      setSearchInitialLawId(matchedLaw.id);
    } else {
      setSearchInitialLawId('all' as any);
    }
    setSearchInitialQuery(lawName);
    handleTabChange('search');
  };

  // Update day in planner
  const handleUpdateDay = (updatedDay: StudyDay) => {
    setDays((prev) => prev.map((d) => (d.id === updatedDay.id ? updatedDay : d)));
  };

  // Add custom day
  const handleAddDay = () => {
    const newNum = days.length + 1;
    const newDay: StudyDay = {
      id: `custom-day-${Date.now()}`,
      number: newNum,
      group: 'روزهای تکمیلی و مرور شخصی',
      blocks: [
        {
          id: `blk-custom-${Date.now()}`,
          subjectId: 'custom',
          subjectName: 'مرور و تست شخصی',
          title: `مبحث مطالعاتی روز ${newNum}`,
          desc: 'مطالعه نص مواد، بررسی جزوه و حل ۲۰ تست',
          checks: [false, false, false, false, false, false, false],
          mood: null
        }
      ],
      isCustom: true
    };
    setDays((prev) => [...prev, newDay]);
  };

  // AI Import plan
  const handleImportAiPlan = (importedDays: StudyDay[], subName: string) => {
    setDays((prev) => [...prev, ...importedDays]);
  };

  // Add new article in admin
  const handleAddArticle = (newArt: Article) => {
    setArticles((prev) => [newArt, ...prev]);
  };

  // Add new subject
  const handleAddSubject = (newSub: Subject) => {
    setSubjects((prev) => [...prev, newSub]);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        bookmarksCount={bookmarks.length}
        onOpenBookmarks={() => setIsBookmarksOpen(true)}
        onOpenAiImporter={() => setIsAiImportOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        isCloudSynced={isCloudSynced}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'search' && (
          <SearchTab
            laws={laws}
            articles={articles}
            decisions={decisions}
            bookmarks={bookmarks.map((b) => b.id)}
            onToggleBookmark={handleToggleBookmark}
            initialQuery={searchInitialQuery}
            initialLawId={searchInitialLawId}
          />
        )}

        {activeTab === 'planner' && (
          <PlannerTab
            days={days}
            onUpdateDay={handleUpdateDay}
            onAddDay={handleAddDay}
            onViewArticlesInSearch={handleViewArticlesInSearch}
            onOpenAiImporter={() => setIsAiImportOpen(true)}
            activeCurriculumKey={activeCurriculumKey}
            onSelectCurriculum={handleSelectCurriculum}
          />
        )}

        {activeTab === 'precedents' && (
          <PrecedentsTab
            decisions={decisions}
            bookmarks={bookmarks.map((b) => b.id)}
            onToggleBookmark={handleToggleBookmark}
          />
        )}

        {activeTab === 'deadlines' && <DeadlinesTab />}

        {activeTab === 'subjects' && (
          <SubjectsTab
            subjects={subjects}
            onAddSubject={handleAddSubject}
            onSelectLawForSearch={handleSelectLawForSearch}
          />
        )}

        {activeTab === 'admin' && (
          <AdminTab
            laws={laws}
            articles={articles}
            onAddArticle={handleAddArticle}
            onRefreshData={loadCloudData}
            isSyncing={isSyncing}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <BookmarksModal
        isOpen={isBookmarksOpen}
        onClose={() => setIsBookmarksOpen(false)}
        bookmarks={bookmarks}
        onRemoveBookmark={handleRemoveBookmark}
        onSelectArticle={(lawName, num) => {
          if (lawName) {
            const l = laws.find((x) => x.name === lawName);
            if (l) setSearchInitialLawId(l.id);
          }
          if (num) {
            setSearchInitialQuery(`ماده ${num}`);
          }
          handleTabChange('search');
        }}
      />

      <AiImportModal
        isOpen={isAiImportOpen}
        onClose={() => setIsAiImportOpen(false)}
        onImportPlan={handleImportAiPlan}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 py-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-300">پایگاه حقوقی دادبان</span>
            <span className="mx-2">·</span>
            <span>سامانه همراه مطالعه آزمون وکالت، قضاوت و پژوهش‌های حقوقی</span>
          </div>
          <div className="text-[11px] text-slate-400">
            برگرفته و بازطراحی شده بر اساس استانداردهای مدرن فرانت‌اند و طراحی حقوقی
          </div>
        </div>
      </footer>
    </div>
  );
}
