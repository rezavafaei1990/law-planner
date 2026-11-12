export interface Law {
  id: number;
  name: string;
  sort: number;
  count?: number;
  unit?: string;
  description?: string;
}

export interface Article {
  id: number;
  law_id: number;
  law_name?: string;
  ord: number;
  num: string;
  num_text?: string;
  text: string;
  path: string[];
  sections?: string[];
}

export interface Decision {
  number: string;
  year: string;
  date?: string;
  subject: string;
  text: string;
  category?: string;
}

export interface StudyBlock {
  id: string;
  subjectId: string;
  subjectName: string;
  lawName?: string;
  artRange?: string; // e.g. "1-10" or "218"
  artFrom?: number;
  artTo?: number;
  title: string;
  desc?: string;
  notes?: string;
  checks: boolean[]; // 7 Leitner stages
  mood?: 'good' | 'mid' | 'bad' | null;
}

export interface StudyDay {
  id: string;
  number: number;
  group?: string; // Stage / Week name
  blocks: StudyBlock[];
  notes?: string;
  isCustom?: boolean;
}

export interface Subject {
  id: string;
  name: string;
  laws: {
    name: string;
    count?: number;
    unit?: string;
    db?: string;
  }[];
}

export interface BookmarkItem {
  id: string;
  type: 'article' | 'decision';
  title: string;
  lawName?: string;
  num?: string;
  text: string;
  path?: string[];
  savedAt: string;
}

export type TabType = 'search' | 'planner' | 'precedents' | 'deadlines' | 'subjects' | 'admin';
