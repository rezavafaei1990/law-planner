import { createClient } from '@supabase/supabase-js';
import type { Law, Article, Decision } from '../types';

export const SUPABASE_URL = "https://xfmdpeeuzhuvqwoalfea.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ndrrbpAGh5VfuiVfETIE8g_IS-jfJD4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const IDB_NAME = 'LawPlannerCache';
const IDB_VER = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, val: T): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('store', 'readwrite');
    tx.objectStore('store').put(val, key);
  } catch {
    // Ignore cache write error
  }
}

export async function fetchAllLaws(): Promise<Law[]> {
  try {
    const cached = await idbGet<Law[]>('cached_laws');
    if (cached && cached.length > 0) {
      // Background revalidation
      revalidateLaws();
      return cached;
    }
    const res = await supabase.from('laws').select('id, name, sort').order('sort', { ascending: true });
    if (res.data) {
      await idbSet('cached_laws', res.data);
      return res.data;
    }
    return [];
  } catch (err) {
    console.warn('Supabase fetch laws failed, trying cache', err);
    return (await idbGet<Law[]>('cached_laws')) || [];
  }
}

async function revalidateLaws() {
  try {
    const res = await supabase.from('laws').select('id, name, sort').order('sort', { ascending: true });
    if (res.data) {
      await idbSet('cached_laws', res.data);
    }
  } catch {
    // ignore
  }
}

export async function fetchAllArticles(): Promise<Article[]> {
  try {
    const cached = await idbGet<Article[]>('cached_articles');
    if (cached && cached.length > 0) {
      return cached;
    }
    
    // Fetch in chunks
    const allArts: Article[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('articles')
        .select('id, law_id, ord, num, num_text, text, path, sections')
        .order('law_id', { ascending: true })
        .order('ord', { ascending: true })
        .range(from, from + 999);

      if (error || !data || data.length === 0) break;
      allArts.push(...(data as Article[]));
      if (data.length < 1000) break;
    }

    if (allArts.length > 0) {
      await idbSet('cached_articles', allArts);
    }
    return allArts;
  } catch (err) {
    console.warn('Supabase fetch articles failed', err);
    return (await idbGet<Article[]>('cached_articles')) || [];
  }
}

export async function fetchAllDecisions(): Promise<Decision[]> {
  try {
    const cached = await idbGet<Decision[]>('cached_decisions');
    if (cached && cached.length > 0) return cached;

    const { data } = await supabase
      .from('decisions')
      .select('number, year, date, subject, text')
      .order('year', { ascending: false })
      .order('number', { ascending: false })
      .limit(1000);

    if (data && data.length > 0) {
      await idbSet('cached_decisions', data);
      return data as Decision[];
    }
    return [];
  } catch (err) {
    console.warn('Supabase fetch decisions failed', err);
    return (await idbGet<Decision[]>('cached_decisions')) || [];
  }
}
