import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Plus, Trash2, Edit3, X, ChevronDown,
  Play, Users, BarChart2, Copy, CheckCheck,
  Star, ToggleLeft, List, ArrowLeft, StopCircle,
  AlignLeft, SlidersHorizontal, Maximize2, ChevronLeft, ChevronRight, Minimize2,
  Download, Sparkles, GripVertical, RotateCcw, Link2, CopyPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, checkIsBasicOrAbove } from '../../lib/auth';
import { surveyAnalysisAI } from '../../lib/gemini';
import LimitToast, { useLimitToast } from '../../components/ui/LimitToast';

// ─── Types ─────────────────────────────────────────────────────────────────────
export type QuestionType = 'multiple_choice' | 'yes_no' | 'star_rating' | 'short_text' | 'opinion_scale' | 'ranking';
type FormStatus = 'draft' | 'open' | 'closed';
type View = 'list' | 'builder' | 'live';

interface SurveyForm {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  pin_code: string;
  status: FormStatus;
  is_anonymous: boolean;
  redirect_url: string | null;
  created_at: string;
}

export interface SurveyQuestion {
  id: string;
  form_id: string;
  order_index: number;
  type: QuestionType;
  text: string;
  options: { label: string }[];
}

export interface SurveyAnswer {
  id: string;
  response_id: string;
  question_id: string;
  form_id: string;
  value: Record<string, unknown>;
}

interface SurveyResponse {
  id: string;
  respondent_name: string;
  submitted_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

export const TYPE_META: Record<QuestionType, { icon: React.ReactNode; label: string; color: string }> = {
  multiple_choice: { icon: <List size={14} />, label: '객관식', color: '#3B82F6' },
  yes_no:          { icon: <ToggleLeft size={14} />, label: '예/아니오', color: '#10B981' },
  star_rating:     { icon: <Star size={14} />, label: '별점', color: '#F59E0B' },
  short_text:      { icon: <AlignLeft size={14} />, label: '단답형', color: '#8B5CF6' },
  opinion_scale:   { icon: <SlidersHorizontal size={14} />, label: '의견 척도', color: '#EC4899' },
  ranking:         { icon: <GripVertical size={14} />, label: '순위 매기기', color: '#0EA5E9' },
};

// ─── Result Charts ─────────────────────────────────────────────────────────────
export function MultipleChoiceChart({ question, answers }: { question: SurveyQuestion; answers: SurveyAnswer[] }) {
  const counts = question.options.map((_, i) => answers.filter(a => (a.value as any).selected === i).length);
  const total = counts.reduce((s, c) => s + c, 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {question.options.map((opt, i) => {
        const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#6B7280', minWidth: 20 }}>{String.fromCharCode(65 + i)}</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: '#374151' }}>{opt.label}</span>
              <div style={{ background: '#F3F4F6', borderRadius: 4, height: 20, position: 'relative', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: colors[i % colors.length], borderRadius: 4 }}
                />
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 'bold', color: '#374151', zIndex: 1 }}>
                  {pct}%
                </span>
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#9CA3AF', minWidth: 28, textAlign: 'right' }}>{counts[i]}명</span>
          </div>
        );
      })}
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>총 {total}명 응답</p>
    </div>
  );
}

export function YesNoChart({ answers }: { answers: SurveyAnswer[] }) {
  const yes = answers.filter(a => (a.value as any).value === true).length;
  const no = answers.filter(a => (a.value as any).value === false).length;
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
  const noPct = total > 0 ? Math.round((no / total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        { label: '예', count: yes, pct: yesPct, color: '#10B981' },
        { label: '아니오', count: no, pct: noPct, color: '#EF4444' },
      ].map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 'bold', color: item.color, minWidth: 48 }}>{item.label}</span>
          <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 4, height: 28, position: 'relative', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${item.pct}%` }}
              transition={{ duration: 0.5 }}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: item.color, borderRadius: 4, opacity: 0.85 }}
            />
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 'bold', color: '#374151', zIndex: 1 }}>
              {item.pct}%
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#9CA3AF', minWidth: 28, textAlign: 'right' }}>{item.count}명</span>
        </div>
      ))}
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>총 {total}명 응답</p>
    </div>
  );
}

export function StarRatingChart({ answers }: { answers: SurveyAnswer[] }) {
  const ratings = [1, 2, 3, 4, 5];
  const counts = ratings.map(r => answers.filter(a => (a.value as any).rating === r).length);
  const total = counts.reduce((s, c) => s + c, 0);
  const avg = total > 0 ? (counts.reduce((s, c, i) => s + c * (i + 1), 0) / total).toFixed(1) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 'bold', color: '#F59E0B' }}>{avg}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {ratings.map(r => (
            <Star key={r} size={16} fill={parseFloat(avg) >= r ? '#F59E0B' : 'none'} color="#F59E0B" />
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>/ 5점</span>
      </div>
      {ratings.map(r => {
        const pct = total > 0 ? Math.round((counts[r - 1] / total) * 100) : 0;
        return (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6B7280', minWidth: 16 }}>{r}★</span>
            <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 4, height: 16, position: 'relative', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5 }}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: '#F59E0B', borderRadius: 4 }}
              />
            </div>
            <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 28, textAlign: 'right' }}>{counts[r - 1]}명</span>
          </div>
        );
      })}
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>총 {total}명 응답</p>
    </div>
  );
}

// ─── Word Cloud ─────────────────────────────────────────────────────────────────
function buildWordFreq(answers: SurveyAnswer[]): { word: string; count: number }[] {
  const stopWords = new Set(['이', '그', '저', '것', '수', '을', '를', '이', '가', '은', '는', '에', '의', '로', '으로', '와', '과', '도', '만', '에서', '까지', '부터', '한', '하다', '있다', '없다', '되다', '것이', '같다', 'the', 'a', 'an', 'is', 'it', 'in', 'of', 'to', 'and', 'or']);
  const freq: Record<string, number> = {};
  answers.forEach(a => {
    const text = ((a.value as any).text ?? '') as string;
    text.split(/[\s,\.!?]+/).forEach(w => {
      const clean = w.trim().replace(/[^\w가-힣]/g, '');
      if (clean.length >= 2 && !stopWords.has(clean)) {
        freq[clean] = (freq[clean] ?? 0) + 1;
      }
    });
  });
  return Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 30);
}

export function ShortTextChart({ answers }: { answers: SurveyAnswer[] }) {
  const texts = answers.map(a => (a.value as any).text as string).filter(Boolean);
  const words = buildWordFreq(answers);
  const maxCount = words[0]?.count ?? 1;
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

  return (
    <div>
      {/* 워드 클라우드 */}
      {words.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 0', marginBottom: 12, borderBottom: '1px solid #F3F4F6' }}>
          {words.map((w, i) => {
            const size = 11 + Math.round((w.count / maxCount) * 16);
            return (
              <motion.span key={w.word} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.02 }}
                style={{ fontSize: size, fontWeight: w.count > 1 ? 'bold' : 'normal', color: colors[i % colors.length], padding: '2px 6px', background: `${colors[i % colors.length]}15`, borderRadius: 6, cursor: 'default' }}
              >
                {w.word} {w.count > 1 && <sup style={{ fontSize: 9 }}>{w.count}</sup>}
              </motion.span>
            );
          })}
        </div>
      )}
      {/* 응답 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {texts.length === 0
          ? <p style={{ fontSize: 13, color: '#9CA3AF' }}>아직 응답이 없습니다</p>
          : texts.map((t, i) => (
            <div key={i} style={{ fontSize: 13, color: '#374151', background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', borderLeft: `3px solid ${colors[i % colors.length]}` }}>
              {t}
            </div>
          ))
        }
      </div>
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>총 {texts.length}명 응답</p>
    </div>
  );
}

export function OpinionScaleChart({ question, answers }: { question: SurveyQuestion; answers: SurveyAnswer[] }) {
  const maxVal = parseInt((question.options[2]?.label ?? '5'), 10) || 5;
  const lowLabel = question.options[0]?.label ?? '전혀 그렇지 않다';
  const highLabel = question.options[1]?.label ?? '매우 그렇다';
  const scale = Array.from({ length: maxVal }, (_, i) => i + 1);
  const counts = scale.map(v => answers.filter(a => (a.value as any).score === v).length);
  const total = counts.reduce((s, c) => s + c, 0);
  const avg = total > 0 ? (counts.reduce((s, c, i) => s + c * (i + 1), 0) / total).toFixed(1) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 'bold', color: '#EC4899' }}>{avg}</span>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>/ {maxVal}점 평균</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {scale.map((v, i) => {
          const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
          const intensity = total > 0 ? counts[i] / Math.max(...counts, 1) : 0;
          return (
            <div key={v} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ height: 60, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(pct, counts[i] > 0 ? 8 : 0)}%` }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  style={{ width: '100%', background: `rgba(236,72,153,${0.2 + intensity * 0.8})`, borderRadius: '4px 4px 0 0', minHeight: counts[i] > 0 ? 4 : 0 }}
                />
              </div>
              <span style={{ fontSize: 11, fontWeight: 'bold', color: '#374151' }}>{v}</span>
              <span style={{ fontSize: 10, color: '#9CA3AF' }}>{counts[i]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{lowLabel}</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{highLabel}</span>
      </div>
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>총 {total}명 응답</p>
    </div>
  );
}

export function RankingChart({ question, answers }: { question: SurveyQuestion; answers: SurveyAnswer[] }) {
  const n = question.options.length;
  if (n === 0) return null;
  const scores = question.options.map((_, optIdx) =>
    answers.reduce((total, a) => {
      const order = (a.value as any).order as number[] | undefined;
      if (!order) return total;
      const rank = order.indexOf(optIdx);
      if (rank === -1) return total;
      return total + (n - rank);
    }, 0)
  );
  const maxScore = Math.max(...scores, 1);
  const sorted = question.options
    .map((opt, i) => ({ label: opt.label, score: scores[i], idx: i }))
    .sort((a, b) => b.score - a.score);
  const colors = ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#E0F2FE', '#F0F9FF', '#ECFEFF', '#CFFAFE'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((item, rank) => {
        const pct = Math.round((item.score / maxScore) * 100);
        return (
          <div key={item.idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 'bold', color: rank === 0 ? '#0EA5E9' : '#9CA3AF', minWidth: 28 }}>
              {rank + 1}위
            </span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, color: '#374151' }}>{item.label}</span>
              <div style={{ background: '#F3F4F6', borderRadius: 4, height: 20, position: 'relative', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, delay: rank * 0.05 }}
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: colors[rank % colors.length] || '#0EA5E9', borderRadius: 4 }}
                />
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 'bold', color: '#374151', zIndex: 1 }}>
                  {item.score}점
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>총 {answers.length}명 응답 (1위={n}점, 2위={n - 1}점...)</p>
    </div>
  );
}

// ─── Presentation Mode ──────────────────────────────────────────────────────────
function PresentationMode({
  questions, answers, responderCount, formTitle, onClose,
}: {
  questions: SurveyQuestion[];
  answers: SurveyAnswer[];
  responderCount: number;
  formTitle: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const q = questions[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setIdx(i => Math.min(i + 1, questions.length - 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [questions.length, onClose]);

  if (!q) return null;
  const qAnswers = answers.filter(a => a.question_id === q.id);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#64748B' }}>{formTitle}</span>
          <span style={{ fontSize: 11, color: '#475569', background: '#1e293b', padding: '2px 8px', borderRadius: 20 }}>
            {idx + 1} / {questions.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8' }}>
            <Users size={14} />
            <span style={{ fontSize: 14, fontWeight: 'bold' }}>{responderCount}명 참여</span>
          </div>
          <button onClick={onClose} style={{ background: '#1e293b', border: 'none', color: '#94A3B8', cursor: 'pointer', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <Minimize2 size={14} /> 나가기
          </button>
        </div>
      </div>

      {/* 질문 + 차트 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 80px', overflow: 'auto' }}>
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ width: '100%', maxWidth: 720 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: TYPE_META[q.type].color, background: `${TYPE_META[q.type].color}20`, padding: '3px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                {TYPE_META[q.type].icon} {TYPE_META[q.type].label}
              </span>
              <span style={{ fontSize: 13, color: '#475569' }}>{qAnswers.length}명 응답</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 'bold', color: '#F1F5F9', marginBottom: 32, lineHeight: 1.4 }}>{q.text}</h2>
            <div style={{ background: '#1e293b', borderRadius: 16, padding: 28 }}>
              {q.type === 'multiple_choice' && <MultipleChoiceChart question={q} answers={qAnswers} />}
              {q.type === 'yes_no' && <YesNoChart answers={qAnswers} />}
              {q.type === 'star_rating' && <StarRatingChart answers={qAnswers} />}
              {q.type === 'short_text' && <ShortTextChart answers={qAnswers} />}
              {q.type === 'opinion_scale' && <OpinionScaleChart question={q} answers={qAnswers} />}
              {q.type === 'ranking' && <RankingChart question={q} answers={qAnswers} />}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 네비 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: 20, borderTop: '1px solid #1e293b' }}>
        <button onClick={() => setIdx(i => Math.max(i - 1, 0))} disabled={idx === 0}
          style={{ padding: '10px 20px', background: idx === 0 ? '#1e293b' : '#334155', border: 'none', borderRadius: 10, color: idx === 0 ? '#475569' : '#F1F5F9', cursor: idx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ChevronLeft size={16} /> 이전
        </button>
        {questions.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ width: 10, height: 10, borderRadius: '50%', border: 'none', background: i === idx ? '#3B82F6' : '#334155', cursor: 'pointer', padding: 0 }}
          />
        ))}
        <button onClick={() => setIdx(i => Math.min(i + 1, questions.length - 1))} disabled={idx === questions.length - 1}
          style={{ padding: '10px 20px', background: idx === questions.length - 1 ? '#1e293b' : '#334155', border: 'none', borderRadius: 10, color: idx === questions.length - 1 ? '#475569' : '#F1F5F9', cursor: idx === questions.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          다음 <ChevronRight size={16} />
        </button>
      </div>

      {/* ESC 힌트 */}
      <p style={{ textAlign: 'center', fontSize: 11, color: '#334155', paddingBottom: 12 }}>ESC 또는 ← → 키로 탐색</p>
    </div>
  );
}

// ─── Question Editor Modal ──────────────────────────────────────────────────────
interface QuestionEditorProps {
  initial: Partial<SurveyQuestion>;
  onSave: (q: Partial<SurveyQuestion>) => void;
  onClose: () => void;
}
function QuestionEditor({ initial, onSave, onClose }: QuestionEditorProps) {
  const [type, setType] = useState<QuestionType>(initial.type ?? 'multiple_choice');
  const [text, setText] = useState(initial.text ?? '');
  const [options, setOptions] = useState<{ label: string }[]>(
    initial.options?.length ? initial.options : [{ label: '' }, { label: '' }]
  );
  // opinion_scale 전용
  const [lowLabel, setLowLabel] = useState(initial.type === 'opinion_scale' ? (initial.options?.[0]?.label ?? '전혀 그렇지 않다') : '전혀 그렇지 않다');
  const [highLabel, setHighLabel] = useState(initial.type === 'opinion_scale' ? (initial.options?.[1]?.label ?? '매우 그렇다') : '매우 그렇다');
  const [maxVal, setMaxVal] = useState<5 | 10>(initial.type === 'opinion_scale' ? ((parseInt(initial.options?.[2]?.label ?? '5') as 5 | 10) || 5) : 5);

  const addOption = () => options.length < 6 && setOptions([...options, { label: '' }]);
  const removeOption = (i: number) => options.length > 2 && setOptions(options.filter((_, idx) => idx !== i));
  const updateOption = (i: number, label: string) => setOptions(options.map((o, idx) => idx === i ? { label } : o));

  const handleSave = () => {
    if (!text.trim()) return;
    let finalOptions: { label: string }[] = [];
    if (type === 'multiple_choice' || type === 'ranking') finalOptions = options.filter(o => o.label.trim());
    if (type === 'opinion_scale') finalOptions = [{ label: lowLabel }, { label: highLabel }, { label: String(maxVal) }];
    onSave({ ...initial, type, text: text.trim(), options: finalOptions });
  };

  const ROW1: QuestionType[] = ['multiple_choice', 'yes_no', 'star_rating'];
  const ROW2: QuestionType[] = ['short_text', 'opinion_scale', 'ranking'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto', padding: 16 }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#111' }}>질문 편집</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={20} /></button>
        </div>

        {/* 타입 선택 — 2행 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {ROW1.map(t => (
              <button key={t} onClick={() => setType(t)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 'bold', border: `2px solid ${type === t ? TYPE_META[t].color : '#E5E7EB'}`, background: type === t ? `${TYPE_META[t].color}15` : '#fff', color: type === t ? TYPE_META[t].color : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}
              >
                {TYPE_META[t].icon} {TYPE_META[t].label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ROW2.map(t => (
              <button key={t} onClick={() => setType(t)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 'bold', border: `2px solid ${type === t ? TYPE_META[t].color : '#E5E7EB'}`, background: type === t ? `${TYPE_META[t].color}15` : '#fff', color: type === t ? TYPE_META[t].color : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}
              >
                {TYPE_META[t].icon} {TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* 질문 텍스트 */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="질문을 입력하세요"
          rows={2}
          style={{ width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        {/* 타입별 옵션 */}
        {type === 'multiple_choice' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 'bold' }}>선택지</p>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9CA3AF', minWidth: 20 }}>{String.fromCharCode(65 + i)}</span>
                <input value={opt.label} onChange={e => updateOption(i, e.target.value)} placeholder={`선택지 ${i + 1}`}
                  style={{ flex: 1, border: '1.5px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none' }} />
                {options.length > 2 && <button onClick={() => removeOption(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><X size={14} /></button>}
              </div>
            ))}
            {options.length < 6 && (
              <button onClick={addOption} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                <Plus size={14} /> 선택지 추가
              </button>
            )}
          </div>
        )}

        {type === 'yes_no' && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            {['예', '아니오'].map((l, i) => (
              <div key={i} style={{ flex: 1, padding: '12px', border: `2px solid ${i === 0 ? '#10B981' : '#EF4444'}`, borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: 'bold', color: i === 0 ? '#10B981' : '#EF4444' }}>{l}</div>
            ))}
          </div>
        )}

        {type === 'star_rating' && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {[1,2,3,4,5].map(r => <Star key={r} size={28} color="#F59E0B" fill="#F59E0B" />)}
          </div>
        )}

        {type === 'short_text' && (
          <div style={{ marginTop: 16, padding: 12, background: '#F5F3FF', borderRadius: 8, fontSize: 13, color: '#7C3AED' }}>
            학생이 직접 텍스트를 입력합니다. 결과는 워드클라우드로 시각화됩니다.
          </div>
        )}

        {type === 'ranking' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 'bold' }}>순위 항목 (학생이 순서를 직접 정합니다)</p>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GripVertical size={14} color="#9CA3AF" />
                <input value={opt.label} onChange={e => updateOption(i, e.target.value)} placeholder={`항목 ${i + 1}`}
                  style={{ flex: 1, border: '1.5px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none' }} />
                {options.length > 2 && <button onClick={() => removeOption(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><X size={14} /></button>}
              </div>
            ))}
            {options.length < 8 && (
              <button onClick={addOption} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0EA5E9', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                <Plus size={14} /> 항목 추가
              </button>
            )}
          </div>
        )}

        {type === 'opinion_scale' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>낮은 쪽 레이블</p>
                <input value={lowLabel} onChange={e => setLowLabel(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>높은 쪽 레이블</p>
                <input value={highLabel} onChange={e => setHighLabel(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <p style={{ fontSize: 12, color: '#6B7280' }}>척도 범위:</p>
              {([5, 10] as const).map(v => (
                <button key={v} onClick={() => setMaxVal(v)}
                  style={{ padding: '4px 12px', borderRadius: 6, border: `2px solid ${maxVal === v ? '#EC4899' : '#E5E7EB'}`, background: maxVal === v ? '#FCE7F3' : '#fff', color: maxVal === v ? '#EC4899' : '#6B7280', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
                >
                  1 ~ {v}
                </button>
              ))}
            </div>
            {/* 미리보기 */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Array.from({ length: maxVal }, (_, i) => i + 1).map(v => (
                <div key={v} style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', color: '#374151' }}>{v}</div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSave} disabled={!text.trim()}
          style={{ marginTop: 24, width: '100%', padding: '12px', background: text.trim() ? '#3B82F6' : '#E5E7EB', color: text.trim() ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: text.trim() ? 'pointer' : 'default' }}
        >
          저장
        </button>
      </motion.div>
    </div>
  );
}

const FREE_SURVEY_LIMIT = 1;

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function SurveyTool() {
  const { user, profile } = useAuth();
  const { limitToastMessage, showLimitToast } = useLimitToast();

  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);

  const [surveyForms, setSurveyForms] = useState<SurveyForm[]>([]);
  const [selectedForm, setSelectedForm] = useState<SurveyForm | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [responderCount, setResponderCount] = useState(0);

  const [view, setView] = useState<View>('list');
  const [editingQuestion, setEditingQuestion] = useState<Partial<SurveyQuestion> | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingForm, setCopyingForm] = useState<SurveyForm | null>(null);
  const [copyTargetClassId, setCopyTargetClassId] = useState<string>('');
  const [isCopying, setIsCopying] = useState(false);
  const [formTitle, setFormTitle] = useState('새 설문');
  const [redirectUrlInput, setRedirectUrlInput] = useState('');
  const [presentMode, setPresentMode] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, { result: string; loading: boolean }>>({});
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [expandedResponderId, setExpandedResponderId] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── 초기 로드 ──────────────────────────────────────────────────────────────
  useEffect(() => { if (user) fetchClasses(); }, [user?.id]);

  const fetchClasses = async () => {
    const { data: ownData } = await supabase.from('classes').select('id, name, class_type')
      .eq('teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
    let assignedData: any[] = [];
    try {
      const { data } = await supabase.from('classes').select('id, name, class_type')
        .eq('assigned_teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
      assignedData = data || [];
    } catch (_e) {}
    const seen = new Set<string>();
    const combined = [...(ownData || []), ...assignedData].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (combined.length > 0) { setClasses(combined); setSelectedClass(combined[0]); fetchForms(combined[0].id); }
  };

  const fetchForms = async (classId: string) => {
    const { data } = await supabase.from('survey_forms').select('*')
      .eq('teacher_id', user!.id).eq('class_id', classId).order('created_at', { ascending: false });
    if (data) setSurveyForms(data);
  };

  const fetchQuestions = async (formId: string) => {
    const { data } = await supabase.from('survey_questions').select('*')
      .eq('form_id', formId).order('order_index');
    if (data) setQuestions(data.map(q => ({ ...q, options: q.options ?? [] })));
  };

  const fetchAnswers = async (formId: string) => {
    const [answersResult, responsesResult] = await Promise.all([
      supabase.from('survey_answers').select('*').eq('form_id', formId),
      supabase.from('survey_responses')
        .select('id, respondent_name, submitted_at')
        .eq('form_id', formId).order('submitted_at', { ascending: true }),
    ]);
    if (answersResult.data) setAnswers(answersResult.data);
    if (responsesResult.data) {
      setResponses(responsesResult.data);
      setResponderCount(responsesResult.data.length);
    }
  };

  // ── 클래스 선택 ────────────────────────────────────────────────────────────
  const handleSelectClass = async (cls: any) => {
    setSelectedClass(cls);
    setClassDropdownOpen(false);
    await fetchForms(cls.id);
  };

  // ── 새 설문 생성 ───────────────────────────────────────────────────────────
  const handleCreateForm = async () => {
    if (!selectedClass || !user) return;
    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('survey_forms')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if ((count ?? 0) >= FREE_SURVEY_LIMIT) {
        showLimitToast(`무료 플랜은 설문을 최대 ${FREE_SURVEY_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
        return;
      }
    }
    const pin = generatePin();
    const { data, error } = await supabase.from('survey_forms').insert({
      teacher_id: user.id, class_id: selectedClass.id,
      title: '새 설문', pin_code: pin, status: 'draft',
    }).select().single();
    if (error || !data) return;
    setSurveyForms(prev => [data, ...prev]);
    openBuilder(data);
  };

  // ── 설문 편집 ──────────────────────────────────────────────────────────────
  const openBuilder = async (form: SurveyForm) => {
    setSelectedForm(form);
    setFormTitle(form.title);
    setRedirectUrlInput(form.redirect_url ?? '');
    await fetchQuestions(form.id);
    setView('builder');
  };

  const handleSaveTitle = async () => {
    if (!selectedForm) return;
    await supabase.from('survey_forms').update({ title: formTitle }).eq('id', selectedForm.id);
    setSelectedForm(prev => prev ? { ...prev, title: formTitle } : null);
    setSurveyForms(prev => prev.map(f => f.id === selectedForm.id ? { ...f, title: formTitle } : f));
  };

  const handleSaveRedirectUrl = async () => {
    if (!selectedForm) return;
    const url = redirectUrlInput.trim() || null;
    await supabase.from('survey_forms').update({ redirect_url: url }).eq('id', selectedForm.id);
    setSelectedForm(prev => prev ? { ...prev, redirect_url: url } : null);
  };

  const handleReorderQuestions = (newOrder: SurveyQuestion[]) => {
    setQuestions(newOrder);
    newOrder.forEach((q, i) => {
      if (q.order_index !== i) {
        supabase.from('survey_questions').update({ order_index: i }).eq('id', q.id);
      }
    });
  };

  const handleSaveQuestion = async (q: Partial<SurveyQuestion>) => {
    if (!selectedForm) return;
    setSaving(true);
    if (q.id) {
      await supabase.from('survey_questions').update({ type: q.type, text: q.text, options: q.options }).eq('id', q.id);
      setQuestions(prev => prev.map(old => old.id === q.id ? { ...old, ...q } as SurveyQuestion : old));
    } else {
      const { data } = await supabase.from('survey_questions').insert({
        form_id: selectedForm.id, type: q.type, text: q.text,
        options: q.options, order_index: questions.length,
      }).select().single();
      if (data) setQuestions(prev => [...prev, { ...data, options: data.options ?? [] }]);
    }
    setSaving(false);
    setEditingQuestion(null);
  };

  const handleDeleteQuestion = async (id: string) => {
    await supabase.from('survey_questions').delete().eq('id', id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  // ── 설문 시작/종료 ─────────────────────────────────────────────────────────
  const handleOpenSurvey = async () => {
    if (!selectedForm) return;
    await supabase.from('survey_forms').update({ status: 'open' }).eq('id', selectedForm.id);
    const updated = { ...selectedForm, status: 'open' as FormStatus };
    setSelectedForm(updated);
    setSurveyForms(prev => prev.map(f => f.id === selectedForm.id ? updated : f));
    await fetchAnswers(selectedForm.id);
    subscribeRealtime(selectedForm.id);
    setView('live');
  };

  const handleCloseSurvey = async () => {
    if (!selectedForm) return;
    await supabase.from('survey_forms').update({ status: 'closed' }).eq('id', selectedForm.id);
    const updated = { ...selectedForm, status: 'closed' as FormStatus };
    setSelectedForm(updated);
    setSurveyForms(prev => prev.map(f => f.id === selectedForm.id ? updated : f));
    channelRef.current?.unsubscribe();
  };

  // ── 기존 설문 결과 보기 ─────────────────────────────────────────────────────
  const openLive = async (form: SurveyForm) => {
    setSelectedForm(form);
    setFormTitle(form.title);
    await fetchQuestions(form.id);
    await fetchAnswers(form.id);
    if (form.status === 'open') subscribeRealtime(form.id);
    setView('live');
  };

  // ── Realtime 구독 ──────────────────────────────────────────────────────────
  const subscribeRealtime = useCallback((formId: string) => {
    channelRef.current?.unsubscribe();
    channelRef.current = supabase.channel(`survey-${formId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_answers', filter: `form_id=eq.${formId}` },
        payload => setAnswers(prev => [...prev, payload.new as SurveyAnswer])
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_responses', filter: `form_id=eq.${formId}` },
        payload => {
          setResponderCount(prev => prev + 1);
          setResponses(prev => [...prev, payload.new as SurveyResponse]);
        }
      )
      .subscribe();
  }, []);

  useEffect(() => () => { channelRef.current?.unsubscribe(); }, []);

  // ── Gemini AI 단답형 분석 ──────────────────────────────────────────────────
  const analyzeShortText = async (questionId: string, qAnswers: SurveyAnswer[]) => {
    const texts = qAnswers.map(a => (a.value as any).text as string).filter(Boolean);
    if (texts.length === 0) return;
    setAiAnalysis(prev => ({ ...prev, [questionId]: { result: '', loading: true } }));
    try {
      const prompt = `다음은 학생들의 설문 단답형 응답 ${texts.length}개입니다:\n\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n위 응답들을 분석하여 다음 형식으로 정리해주세요:\n\n**핵심 키워드**: (3~5개)\n**전반적 요약**: (2~3문장으로 학생들의 전반적 의견 요약)\n**주요 패턴**: (눈에 띄는 공통 의견이나 특이점)\n\n교사에게 유용하고 간결하게 작성해주세요.`;
      const { response } = await surveyAnalysisAI.generateContent(prompt);
      setAiAnalysis(prev => ({ ...prev, [questionId]: { result: response.text(), loading: false } }));
    } catch (err: any) {
      setAiAnalysis(prev => ({ ...prev, [questionId]: { result: err?.message || '분석 중 오류가 발생했습니다.', loading: false } }));
    }
  };

  // ── CSV 내보내기 ───────────────────────────────────────────────────────────
  const downloadCSV = async () => {
    if (!selectedForm || questions.length === 0) return;
    const { data: responses } = await supabase
      .from('survey_responses').select('id, respondent_name, submitted_at')
      .eq('form_id', selectedForm.id).order('submitted_at');
    if (!responses || responses.length === 0) { alert('아직 응답이 없습니다.'); return; }

    const headers = ['응답자', '제출시간', ...questions.map((q, i) => `Q${i + 1}: ${q.text}`)];
    const rows = responses.map(resp => {
      const respAnswers = answers.filter(a => a.response_id === resp.id);
      const cells = questions.map(q => {
        const ans = respAnswers.find(a => a.question_id === q.id);
        if (!ans) return '';
        const v = ans.value as any;
        if (q.type === 'multiple_choice') return q.options[v.selected]?.label ?? '';
        if (q.type === 'yes_no') return v.value ? '예' : '아니오';
        if (q.type === 'star_rating') return `${v.rating}점`;
        if (q.type === 'short_text') return v.text ?? '';
        if (q.type === 'opinion_scale') return `${v.score}점`;
        if (q.type === 'ranking') return ((v.order as number[]) ?? []).map((idx: number) => q.options[idx]?.label).join(' > ');
        return '';
      });
      return [resp.respondent_name, new Date(resp.submitted_at).toLocaleString('ko-KR'), ...cells];
    });

    const esc = (val: string) => (val.includes(',') || val.includes('"') || val.includes('\n')) ? `"${val.replace(/"/g, '""')}"` : val;
    const csv = [headers, ...rows].map(row => row.map(String).map(esc).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${selectedForm.title}_결과.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── PIN 복사 ───────────────────────────────────────────────────────────────
  const copyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── 설문 삭제 ─────────────────────────────────────────────────────────────
  const handleDeleteForm = async (formId: string) => {
    if (!confirm('이 설문을 삭제할까요?')) return;
    await supabase.from('survey_forms').delete().eq('id', formId);
    setSurveyForms(prev => prev.filter(f => f.id !== formId));
  };

  // ── 설문 복사 ─────────────────────────────────────────────────────────────
  const handleConfirmCopy = async () => {
    if (!copyingForm || !copyTargetClassId || !user) return;
    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('survey_forms')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if ((count ?? 0) >= FREE_SURVEY_LIMIT) {
        showLimitToast(`무료 플랜은 설문을 최대 ${FREE_SURVEY_LIMIT}개까지 만들 수 있습니다. Basic 플랜으로 업그레이드하면 무제한으로 만들 수 있어요.`);
        return;
      }
    }
    setIsCopying(true);
    const pin = generatePin();
    const { data: newForm, error } = await supabase.from('survey_forms').insert({
      teacher_id: user.id,
      class_id: copyTargetClassId,
      title: `${copyingForm.title} (복사)`,
      pin_code: pin,
      status: 'draft',
      is_anonymous: copyingForm.is_anonymous,
      redirect_url: copyingForm.redirect_url,
    }).select().single();
    if (error || !newForm) { setIsCopying(false); alert('복사 중 오류가 발생했습니다.'); return; }

    const { data: srcQuestions } = await supabase.from('survey_questions')
      .select('*').eq('form_id', copyingForm.id).order('order_index');
    if (srcQuestions && srcQuestions.length > 0) {
      await supabase.from('survey_questions').insert(
        srcQuestions.map(q => ({
          form_id: newForm.id,
          order_index: q.order_index,
          type: q.type,
          text: q.text,
          options: q.options,
        }))
      );
    }

    if (copyTargetClassId === selectedClass?.id) {
      setSurveyForms(prev => [newForm, ...prev]);
    }
    setIsCopying(false);
    setCopyingForm(null);
    setCopyTargetClassId('');
    alert(`"${newForm.title}" 설문이 복사되었습니다.`);
  };

  // ── 결과 초기화 ───────────────────────────────────────────────────────────
  const handleResetResults = async () => {
    if (!selectedForm) return;
    if (!confirm(`"${selectedForm.title}" 설문의 모든 응답을 초기화할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;

    const { error: answersError } = await supabase
      .from('survey_answers').delete().eq('form_id', selectedForm.id);
    const { error: responsesError } = await supabase
      .from('survey_responses').delete().eq('form_id', selectedForm.id);

    if (answersError || responsesError) {
      alert('초기화 중 오류가 발생했습니다. Supabase에 DELETE 정책이 설정되어 있는지 확인하세요.');
      return;
    }

    setAnswers([]);
    setResponses([]);
    setResponderCount(0);
    setAiAnalysis({});
    setExpandedResponderId(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  // ── 설문 목록 ──────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <LimitToast message={limitToastMessage} />
      {/* 클래스 선택 */}
      <div style={{ marginBottom: 20, position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setClassDropdownOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 14, fontWeight: 'bold', color: '#374151', cursor: 'pointer' }}
        >
          {selectedClass?.name ?? '클래스 선택'} <ChevronDown size={15} />
        </button>
        {classDropdownOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 180 }}>
            {classes.map(cls => (
              <button key={cls.id} onClick={() => handleSelectClass(cls)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: '#374151', background: selectedClass?.id === cls.id ? '#EFF6FF' : 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {cls.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', color: '#111' }}>설문 목록</h2>
        <button onClick={handleCreateForm}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
        >
          <Plus size={15} /> 새 설문
        </button>
      </div>

      {surveyForms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <BarChart2 size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>아직 설문이 없습니다</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>위에서 새 설문을 만들어보세요</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {surveyForms.map(form => (
            <div key={form.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 'bold', color: '#111' }}>{form.title}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: form.status === 'open' ? '#D1FAE5' : form.status === 'draft' ? '#F3F4F6' : '#FEE2E2',
                    color: form.status === 'open' ? '#065F46' : form.status === 'draft' ? '#6B7280' : '#991B1B',
                  }}>
                    {form.status === 'open' ? '진행 중' : form.status === 'draft' ? '초안' : '종료'}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>PIN: {form.pin_code}</span>
              </div>
              <div className="sm:justify-end" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* draft / closed → 설문 시작 버튼 */}
                {form.status !== 'open' && (
                  <button
                    onClick={async () => {
                      setSelectedForm(form);
                      setFormTitle(form.title);
                      await fetchQuestions(form.id);
                      // 질문이 없으면 빌더로, 있으면 바로 시작
                      const { data: qs } = await supabase.from('survey_questions').select('id').eq('form_id', form.id).limit(1);
                      if (!qs || qs.length === 0) {
                        setView('builder');
                      } else {
                        await supabase.from('survey_forms').update({ status: 'open' }).eq('id', form.id);
                        setSurveyForms(prev => prev.map(f => f.id === form.id ? { ...f, status: 'open' as FormStatus } : f));
                        await fetchAnswers(form.id);
                        subscribeRealtime(form.id);
                        setView('live');
                      }
                    }}
                    style={{ padding: '6px 14px', background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    <Play size={14} /> 시작
                  </button>
                )}
                {/* open → 결과/종료 */}
                {form.status === 'open' && (
                  <button onClick={() => openLive(form)}
                    style={{ padding: '6px 12px', background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#065F46', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    <BarChart2 size={14} /> 결과
                  </button>
                )}
                <button onClick={() => openBuilder(form)} title="편집"
                  style={{ padding: '6px 10px', background: '#F3F4F6', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#374151', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  <Edit3 size={14} /> 편집
                </button>
                <button onClick={() => { setCopyingForm(form); setCopyTargetClassId(''); }} title="다른 클래스로 복사"
                  style={{ padding: '6px 10px', background: '#F0FDF4', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#065F46', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  <CopyPlus size={14} /> 복사
                </button>
                <button onClick={() => handleDeleteForm(form.id)} title="삭제"
                  style={{ padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 다른 클래스로 복사 모달 ─────────────────────────────────────────── */}
      {copyingForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#111' }}>다른 클래스로 복사</h3>
              <button onClick={() => setCopyingForm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              <span style={{ fontWeight: 'bold', color: '#111' }}>"{copyingForm.title}"</span> 설문의 질문 구성을 복사할 클래스를 선택하세요.
              <br /><span style={{ fontSize: 12, color: '#9CA3AF' }}>응답 데이터는 복사되지 않으며, 새 PIN이 발급됩니다.</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {classes.filter(cls => cls.id !== copyingForm.class_id).map(cls => (
                <button key={cls.id} onClick={() => setCopyTargetClassId(cls.id)}
                  style={{ padding: '12px 16px', borderRadius: 10, border: `2px solid ${copyTargetClassId === cls.id ? '#3B82F6' : '#E5E7EB'}`, background: copyTargetClassId === cls.id ? '#EFF6FF' : '#fff', color: '#374151', fontSize: 14, fontWeight: copyTargetClassId === cls.id ? 'bold' : 'normal', cursor: 'pointer', textAlign: 'left' }}
                >
                  {cls.name}
                </button>
              ))}
              {classes.filter(cls => cls.id !== copyingForm.class_id).length === 0 && (
                <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>복사할 수 있는 다른 클래스가 없습니다.</p>
              )}
            </div>
            <button onClick={handleConfirmCopy} disabled={!copyTargetClassId || isCopying}
              style={{ width: '100%', padding: '12px', background: copyTargetClassId && !isCopying ? '#3B82F6' : '#E5E7EB', color: copyTargetClassId && !isCopying ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: copyTargetClassId && !isCopying ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <CopyPlus size={15} /> {isCopying ? '복사 중...' : '복사하기'}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );

  // ── 설문 빌더 ──────────────────────────────────────────────────────────────
  if (view === 'builder') return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <ArrowLeft size={16} /> 목록
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
            style={{ flex: 1, fontSize: 18, fontWeight: 'bold', color: '#111', border: 'none', borderBottom: '2px solid #3B82F6', outline: 'none', background: 'transparent', padding: '2px 0' }}
          />
        </div>
        <button onClick={handleOpenSurvey} disabled={questions.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: questions.length > 0 ? '#10B981' : '#E5E7EB', color: questions.length > 0 ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: questions.length > 0 ? 'pointer' : 'default' }}
        >
          <Play size={14} /> 설문 시작
        </button>
      </div>

      {/* 질문 목록 — 드래그로 순서 변경 */}
      <Reorder.Group
        axis="y"
        values={questions}
        onReorder={handleReorderQuestions}
        style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {questions.map((q, i) => (
          <Reorder.Item
            key={q.id}
            value={q}
            style={{ background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'default', touchAction: 'none' }}
            whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, borderColor: '#93C5FD' }}
          >
            <GripVertical size={16} color="#D1D5DB" style={{ marginTop: 3, cursor: 'grab', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#9CA3AF', minWidth: 20, paddingTop: 2 }}>Q{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 'bold', color: TYPE_META[q.type].color, background: `${TYPE_META[q.type].color}15`, padding: '2px 7px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {TYPE_META[q.type].icon} {TYPE_META[q.type].label}
                </span>
              </div>
              <p style={{ fontSize: 14, color: '#374151' }}>{q.text}</p>
              {q.type === 'multiple_choice' && q.options.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {q.options.map((opt, j) => (
                    <span key={j} style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 6 }}>
                      {String.fromCharCode(65 + j)}. {opt.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => setEditingQuestion(q)} style={{ padding: 6, background: '#F3F4F6', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151' }}><Edit3 size={13} /></button>
              <button onClick={() => handleDeleteQuestion(q.id)} style={{ padding: 6, background: '#FEF2F2', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#EF4444' }}><Trash2 size={13} /></button>
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      <button onClick={() => setEditingQuestion({ form_id: selectedForm?.id, type: 'multiple_choice', text: '', options: [{ label: '' }, { label: '' }] })}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#EFF6FF', color: '#3B82F6', border: '1.5px dashed #93C5FD', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
      >
        <Plus size={15} /> 질문 추가
      </button>

      {/* 설문 완료 후 이동 URL */}
      <div style={{ marginTop: 20, padding: '16px 18px', background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Link2 size={14} color="#6B7280" />
          <p style={{ fontSize: 13, fontWeight: 'bold', color: '#374151' }}>설문 완료 후 이동할 URL <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 'normal' }}>(선택)</span></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={redirectUrlInput}
            onChange={e => setRedirectUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveRedirectUrl()}
            placeholder="https://example.com"
            style={{ flex: 1, border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            onFocus={e => (e.target.style.borderColor = '#3B82F6')}
            onBlur={e => (e.target.style.borderColor = '#E5E7EB')}
          />
          <button
            onClick={handleSaveRedirectUrl}
            style={{ padding: '8px 14px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
          >
            저장
          </button>
          {redirectUrlInput && (
            <button
              onClick={() => { setRedirectUrlInput(''); handleSaveRedirectUrl(); }}
              title="URL 제거"
              style={{ padding: '8px', background: '#FEF2F2', color: '#EF4444', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {selectedForm?.redirect_url && (
          <p style={{ fontSize: 11, color: '#10B981', marginTop: 6 }}>
            ✓ 저장됨: {selectedForm.redirect_url}
          </p>
        )}
        <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
          학생이 모든 질문에 응답하면 이 URL이 새 탭에서 열립니다.
        </p>
      </div>

      {editingQuestion && (
        <QuestionEditor
          initial={editingQuestion}
          onSave={handleSaveQuestion}
          onClose={() => setEditingQuestion(null)}
        />
      )}
      {saving && <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#374151', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12 }}>저장 중...</div>}
    </div>
  );

  // ── 실시간 결과 ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      {presentMode && (
        <PresentationMode
          questions={questions}
          answers={answers}
          responderCount={responderCount}
          formTitle={selectedForm?.title ?? ''}
          onClose={() => setPresentMode(false)}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3" style={{ marginBottom: 20 }}>
        <div className="flex items-center gap-3 sm:flex-1" style={{ minWidth: 0 }}>
          <button onClick={() => { setView('list'); channelRef.current?.unsubscribe(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, flexShrink: 0 }}
          >
            <ArrowLeft size={16} /> 목록
          </button>
          <h2 className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 'bold', color: '#111' }}>{selectedForm?.title}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadCSV}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#F0FDF4', color: '#10B981', border: '1px solid #A7F3D0', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Download size={14} /> CSV
          </button>
          <button onClick={handleResetResults} disabled={responderCount === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: responderCount > 0 ? '#FFF7ED' : '#F9FAFB', color: responderCount > 0 ? '#EA580C' : '#9CA3AF', border: `1px solid ${responderCount > 0 ? '#FED7AA' : '#E5E7EB'}`, borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: responderCount > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <RotateCcw size={14} /> 초기화
          </button>
          <button onClick={() => setPresentMode(true)} disabled={questions.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#1e1e2e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: questions.length > 0 ? 'pointer' : 'default', opacity: questions.length > 0 ? 1 : 0.4, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Maximize2 size={14} /> 발표 모드
          </button>
          {selectedForm?.status === 'open' ? (
            <button onClick={handleCloseSurvey}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <StopCircle size={14} /> 설문 종료
            </button>
          ) : (
            <button onClick={handleOpenSurvey}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <Play size={14} /> 다시 열기
            </button>
          )}
        </div>
      </div>

      {/* PIN + 참여자 수 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5" style={{ background: 'linear-gradient(135deg, #1e1e2e, #2d2d44)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>학생 참여 코드</p>
          <div className="flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 'bold', color: '#fff', letterSpacing: 6, fontFamily: 'monospace' }}>
              {selectedForm?.pin_code}
            </span>
            <button onClick={() => copyPin(selectedForm?.pin_code ?? '')}
              style={{ padding: '6px 10px', background: copied ? '#10B981' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {copied ? <><CheckCheck size={13} /> 복사됨</> : <><Copy size={13} /> 복사</>}
            </button>
          </div>
          <p className="break-all" style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
            {window.location.origin}/survey/{selectedForm?.pin_code} 에 접속하세요
          </p>
        </div>
        <div className="flex items-center justify-center sm:justify-start gap-6" style={{ flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}>
              <Users size={18} />
              <span style={{ fontSize: 32, fontWeight: 'bold' }}>{responderCount}</span>
            </div>
            <p style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>참여자</p>
          </div>
          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', background: selectedForm?.status === 'open' ? '#D1FAE5' : '#FEE2E2', color: selectedForm?.status === 'open' ? '#065F46' : '#991B1B' }}>
            {selectedForm?.status === 'open' ? '● 진행 중' : '■ 종료'}
          </span>
        </div>
      </div>

      {/* 질문별 결과 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {questions.map((q, i) => {
          const qAnswers = answers.filter(a => a.question_id === q.id);
          const ai = aiAnalysis[q.id];
          return (
            <div key={q.id} style={{ background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 14, padding: '18px 20px' }}>
              <div className="flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Q{i + 1}</span>
                <span style={{ fontSize: 11, fontWeight: 'bold', color: TYPE_META[q.type].color, background: `${TYPE_META[q.type].color}15`, padding: '2px 7px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                  {TYPE_META[q.type].icon} {TYPE_META[q.type].label}
                </span>
                <p className="basis-full sm:basis-0 sm:flex-1 min-w-0" style={{ fontSize: 14, fontWeight: 'bold', color: '#374151' }}>{q.text}</p>
                {q.type === 'short_text' && (
                  <button
                    onClick={() => analyzeShortText(q.id, qAnswers)}
                    disabled={ai?.loading || qAnswers.length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: ai ? '#EDE9FE' : '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, cursor: qAnswers.length > 0 && !ai?.loading ? 'pointer' : 'default', color: '#7C3AED', fontSize: 11, fontWeight: 'bold', flexShrink: 0, whiteSpace: 'nowrap', opacity: qAnswers.length === 0 ? 0.5 : 1 }}
                  >
                    <Sparkles size={12} /> {ai?.loading ? '분석 중...' : 'AI 분석'}
                  </button>
                )}
              </div>
              {q.type === 'multiple_choice' && <MultipleChoiceChart question={q} answers={qAnswers} />}
              {q.type === 'yes_no' && <YesNoChart answers={qAnswers} />}
              {q.type === 'star_rating' && <StarRatingChart answers={qAnswers} />}
              {q.type === 'short_text' && <ShortTextChart answers={qAnswers} />}
              {q.type === 'opinion_scale' && <OpinionScaleChart question={q} answers={qAnswers} />}
              {q.type === 'ranking' && <RankingChart question={q} answers={qAnswers} />}
              {q.type === 'short_text' && ai && !ai.loading && ai.result && (
                <div style={{ marginTop: 14, padding: '14px 16px', background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', borderRadius: 10, borderLeft: '3px solid #7C3AED' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Sparkles size={13} color="#7C3AED" />
                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#7C3AED' }}>AI 분석 결과</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ai.result}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 응답자 목록 (비익명 설문만) ───────────────────────────────────── */}
      {!selectedForm?.is_anonymous && responses.length > 0 && (
        <div style={{ marginTop: 24, background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={15} color="#6B7280" />
            <span style={{ fontSize: 14, fontWeight: 'bold', color: '#374151' }}>응답자 목록</span>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>({responses.length}명)</span>
          </div>
          <div>
            {responses.map((resp, idx) => {
              const respAnswers = answers.filter(a => a.response_id === resp.id);
              const isExpanded = expandedResponderId === resp.id;
              const time = new Date(resp.submitted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

              const formatAnswer = (q: SurveyQuestion, ans: SurveyAnswer | undefined): string => {
                if (!ans) return '—';
                const v = ans.value as any;
                if (q.type === 'multiple_choice') return q.options[v.selected]?.label ?? '—';
                if (q.type === 'yes_no') return v.value ? '예' : '아니오';
                if (q.type === 'star_rating') return `${'★'.repeat(v.rating)}${'☆'.repeat(5 - v.rating)} (${v.rating}점)`;
                if (q.type === 'short_text') return v.text ?? '—';
                if (q.type === 'opinion_scale') return `${v.score}점`;
                if (q.type === 'ranking') return ((v.order as number[]) ?? []).map((i: number) => q.options[i]?.label).filter(Boolean).join(' > ');
                return '—';
              };

              return (
                <div key={resp.id} style={{ borderBottom: idx < responses.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                  <button
                    onClick={() => setExpandedResponderId(isExpanded ? null : resp.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: isExpanded ? '#F0F9FF' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#E0F2FE', color: '#0369A1', fontSize: 11, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {idx + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 'bold', color: '#111' }}>{resp.respondent_name}</span>
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>{time}</span>
                    <ChevronDown size={14} color="#9CA3AF" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </button>
                  {isExpanded && (
                    <div style={{ padding: '8px 20px 16px 56px', display: 'flex', flexDirection: 'column', gap: 10, background: '#F8FAFC' }}>
                      {questions.map((q, qi) => {
                        const ans = respAnswers.find(a => a.question_id === q.id);
                        return (
                          <div key={q.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 24, paddingTop: 2 }}>Q{qi + 1}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{q.text}</p>
                              <p style={{ fontSize: 13, fontWeight: 'bold', color: '#111' }}>{formatAnswer(q, ans)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
