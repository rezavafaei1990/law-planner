import React, { useState, useEffect } from 'react';
import { Phone, Mail, MapPin, Clock, Send, CheckCircle2 } from 'lucide-react';
import { useBaraat } from '../context/BaraatContext';
import { updateDocumentSeo } from '../utils/seo';

export const AboutContactPage: React.FC<{ section: 'about' | 'contact' }> = ({ section }) => {
  const { about, contact, questions, setQuestions, user, showToast } = useBaraat();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (section === 'about') {
      updateDocumentSeo({
        title: 'درباره گروه حقوقی برائت | معرفی، سوابق و خدمات تخصصی',
        description: about.mission,
        canonicalPath: '/about',
      });
    } else {
      updateDocumentSeo({
        title: 'تماس و درخواست مشاوره حقوقی | گروه حقوقی برائت',
        description: 'راه‌های ارتباطی و ثبت درخواست مشاوره با وکلای گروه حقوقی برائت.',
        canonicalPath: '/contact',
      });
    }
  }, [section, about.mission]);

  const submitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    const id = `q_${Date.now()}`;
    const next = {
      ...questions,
      [id]: {
        id,
        email: email.trim() || 'مهمان',
        userName: name.trim() || 'کاربر سامانه',
        subject: subject.trim() || 'درخواست مشاوره',
        question: msg.trim(),
        createdAt: new Date().toISOString(),
      },
    };
    await setQuestions(next);
    setMsg('');
    setSubject('');
    setSent(true);
    showToast('پیام شما با موفقیت ثبت شد.');
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 space-y-12">
      {/* About Institutional Overview */}
      <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
        <p className="text-xs font-bold text-teal-700 dark:text-teal-400">معرفی رسمی</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[var(--ink)]">{about.title}</h1>
        <p className="mt-2 text-base text-[var(--ink-muted)]">{about.subtitle}</p>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)] p-5">
            <h2 className="text-sm font-extrabold text-[var(--ink)]">مأموریت ما</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-prose)]">{about.mission}</p>
          </div>
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-muted)] p-5">
            <h2 className="text-sm font-extrabold text-[var(--ink)]">چشم‌انداز</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-prose)]">{about.vision}</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-[var(--hairline)] pt-6 sm:grid-cols-4 tabular-nums">
          {(about.stats || []).map((st, idx) => (
            <div key={idx}>
              <div className="text-xl font-extrabold text-teal-800 dark:text-teal-300">{st.value}</div>
              <div className="mt-1 text-xs text-[var(--ink-muted)]">{st.label}</div>
            </div>
          ))}
        </div>

        {(about.team || []).length > 0 && (
          <div className="mt-8 border-t border-[var(--hairline)] pt-6">
            <h2 className="text-base font-extrabold text-[var(--ink)]">تیم و کارگروه‌های تخصصی</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {about.team.map((m, idx) => (
                <div key={idx} className="rounded-xl border border-[var(--hairline)] p-4">
                  <div className="text-sm font-bold text-[var(--ink)]">{m.name}</div>
                  <div className="text-xs font-semibold text-teal-700 dark:text-teal-400">{m.role}</div>
                  <p className="mt-2 text-xs leading-6 text-[var(--ink-muted)]">{m.bio}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Contact & Inquiry Section */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-8 lg:col-span-5 space-y-5">
          <h2 className="text-xl font-extrabold text-[var(--ink)]">اطلاعات تماس و دفتر مرکزی</h2>
          <p className="text-xs leading-6 text-[var(--ink-muted)]">{contact.mapNote}</p>

          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Phone className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <div>
                <div className="text-xs text-[var(--ink-muted)]">تلفن و همراه</div>
                <div className="font-bold text-[var(--ink)] tabular-nums">{contact.phone} · {contact.mobile}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <div>
                <div className="text-xs text-[var(--ink-muted)]">ایمیل رسمی</div>
                <div className="font-bold text-[var(--ink)]" dir="ltr">{contact.email}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <div>
                <div className="text-xs text-[var(--ink-muted)]">نشانی</div>
                <div className="font-bold text-[var(--ink)]">{contact.address}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <div>
                <div className="text-xs text-[var(--ink-muted)]">ساعات پاسخگویی</div>
                <div className="font-bold text-[var(--ink)]">{contact.hours}</div>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={submitInquiry} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-8 lg:col-span-7 space-y-4">
          <h2 className="text-xl font-extrabold text-[var(--ink)]">ارسال پرسش حقوقی یا درخواست مشاوره</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">نام و نام خانوادگی</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">ایمیل یا شماره تماس</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">موضوع</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً مشاوره قرارداد یا دعوای ملکی" className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">شرح پرسش</label>
            <textarea required rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} className="w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-muted)] p-3.5 text-sm text-[var(--ink)]" />
          </div>
          {sent && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>پرسش شما برای کارگروه حقوقی ارسال و ثبت شد.</span>
            </div>
          )}
          <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-xs font-bold text-white hover:bg-teal-800">
            <Send className="h-4 w-4" />
            <span>ثبت و ارسال پیام</span>
          </button>
        </form>
      </section>
    </div>
  );
};
