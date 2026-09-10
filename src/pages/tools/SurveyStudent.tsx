import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Star, CheckCircle, ArrowRight, ChevronLeft, Send, GripVertical } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────
type QuestionType = 'multiple_choice' | 'yes_no' | 'star_rating' | 'short_text' | 'opinion_scale' | 'ranking';
type Step = 'pin' | 'name' | 'select-class' | 'survey' | 'done';

interface SurveyForm {
  id: string;
  title: string;
  pin_code: string;
  status: string;
  is_anonymous: boolean;
  redirect_url: string | null;
  class_id: string | null;
  school_project_id: string | null;
}

interface SchoolOption {
  id: string;
  name: string;
  school_name: string | null;
}

interface ClassOption {
  id: string;
  name: string;
}

interface SurveyQuestion {
  id: string;
  order_index: number;
  type: QuestionType;
  text: string;
  options: { label: string }[];
}

// ─── Question Renderers ─────────────────────────────────────────────────────────
function MultipleChoiceQuestion({
  question, onAnswer,
}: { question: SurveyQuestion; onAnswer: (v: unknown) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const colors = ['#EF4444', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899'];

  const handleSelect = (i: number) => {
    setSelected(i);
    setTimeout(() => onAnswer({ selected: i }), 350);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {question.options.map((opt, i) => (
        <motion.button key={i} whileTap={{ scale: 0.97 }}
          onClick={() => handleSelect(i)}
          style={{
            padding: '16px 20px', borderRadius: 14, border: `2.5px solid ${selected === i ? colors[i % colors.length] : '#E5E7EB'}`,
            background: selected === i ? `${colors[i % colors.length]}15` : '#fff',
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          }}
        >
          <span style={{ width: 28, height: 28, borderRadius: 8, background: selected === i ? colors[i % colors.length] : '#F3F4F6', color: selected === i ? '#fff' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', flexShrink: 0 }}>
            {String.fromCharCode(65 + i)}
          </span>
          <span style={{ fontSize: 15, color: '#374151', fontWeight: selected === i ? '600' : '400' }}>{opt.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

function YesNoQuestion({ onAnswer }: { onAnswer: (v: unknown) => void }) {
  const [selected, setSelected] = useState<boolean | null>(null);

  const handleSelect = (val: boolean) => {
    setSelected(val);
    setTimeout(() => onAnswer({ value: val }), 350);
  };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {[
        { label: '예', value: true, color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
        { label: '아니오', value: false, color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
      ].map(opt => (
        <motion.button key={String(opt.value)} whileTap={{ scale: 0.95 }}
          onClick={() => handleSelect(opt.value)}
          style={{
            flex: 1, padding: '32px 0', borderRadius: 16, fontSize: 20, fontWeight: 'bold',
            border: `2.5px solid ${selected === opt.value ? opt.color : '#E5E7EB'}`,
            background: selected === opt.value ? opt.bg : '#fff',
            color: selected === opt.value ? opt.color : '#9CA3AF',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </motion.button>
      ))}
    </div>
  );
}

function StarRatingQuestion({ onAnswer }: { onAnswer: (v: unknown) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const handleSelect = (r: number) => {
    setSelected(r);
    setTimeout(() => onAnswer({ rating: r }), 350);
  };

  const effective = hovered ?? selected ?? 0;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map(r => (
          <motion.button key={r} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
            onClick={() => handleSelect(r)}
            onMouseEnter={() => setHovered(r)}
            onMouseLeave={() => setHovered(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <Star size={44} fill={r <= effective ? '#F59E0B' : 'none'} color={r <= effective ? '#F59E0B' : '#D1D5DB'} strokeWidth={1.5} />
          </motion.button>
        ))}
      </div>
      {effective > 0 && (
        <p style={{ fontSize: 16, color: '#F59E0B', fontWeight: 'bold' }}>
          {['', '별로예요', '그저 그래요', '괜찮아요', '좋아요', '최고예요'][effective]}
        </p>
      )}
    </div>
  );
}

function ShortTextQuestion({ onAnswer }: { onAnswer: (v: unknown) => void }) {
  const [text, setText] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="여기에 입력하세요..."
        rows={4}
        autoFocus
        style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '14px', fontSize: 15, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6, transition: 'border-color 0.15s' }}
        onFocus={e => (e.target.style.borderColor = '#8B5CF6')}
        onBlur={e => (e.target.style.borderColor = '#E5E7EB')}
      />
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => { if (text.trim()) onAnswer({ text: text.trim() }); }}
        disabled={!text.trim()}
        style={{ padding: '14px', background: text.trim() ? '#8B5CF6' : '#E5E7EB', color: text.trim() ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 'bold', cursor: text.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Send size={16} /> 제출
      </motion.button>
    </div>
  );
}

function OpinionScaleQuestion({ question, onAnswer }: { question: SurveyQuestion; onAnswer: (v: unknown) => void }) {
  const maxVal = parseInt(question.options[2]?.label ?? '5', 10) || 5;
  const lowLabel = question.options[0]?.label ?? '전혀 그렇지 않다';
  const highLabel = question.options[1]?.label ?? '매우 그렇다';
  const [selected, setSelected] = useState<number | null>(null);
  const scale = Array.from({ length: maxVal }, (_, i) => i + 1);

  const handleSelect = (v: number) => {
    setSelected(v);
    setTimeout(() => onAnswer({ score: v }), 350);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: maxVal <= 5 ? 10 : 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {scale.map(v => {
          const isSelected = selected === v;
          const ratio = (v - 1) / (maxVal - 1);
          // 색상 보간: 빨강(낮음) → 초록(높음)
          const r = Math.round(239 - ratio * (239 - 16));
          const g = Math.round(68 + ratio * (185 - 68));
          const b = Math.round(68 + ratio * (129 - 68));
          const color = `rgb(${r},${g},${b})`;

          return (
            <motion.button key={v} whileTap={{ scale: 0.9 }}
              onClick={() => handleSelect(v)}
              style={{
                width: maxVal <= 5 ? 52 : 40, height: maxVal <= 5 ? 52 : 40,
                borderRadius: 12, fontSize: maxVal <= 5 ? 18 : 15, fontWeight: 'bold',
                border: `2.5px solid ${isSelected ? color : '#E5E7EB'}`,
                background: isSelected ? color : '#fff',
                color: isSelected ? '#fff' : '#374151',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {v}
            </motion.button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{lowLabel}</span>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{highLabel}</span>
      </div>
    </div>
  );
}

function RankingQuestion({ question, onAnswer }: { question: SurveyQuestion; onAnswer: (v: unknown) => void }) {
  const [items, setItems] = useState(
    question.options.map((opt, i) => ({ idx: i, label: opt.label }))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 4 }}>드래그해서 순서를 정해주세요 (1위가 위)</p>
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={setItems}
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {items.map((item, rank) => (
          <Reorder.Item
            key={item.idx}
            value={item}
            style={{ background: '#fff', border: `2px solid ${rank === 0 ? '#0EA5E9' : '#E5E7EB'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
            whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10 }}
          >
            <span style={{ fontSize: 13, fontWeight: 'bold', color: rank === 0 ? '#fff' : '#9CA3AF', minWidth: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rank === 0 ? '#0EA5E9' : '#F3F4F6', borderRadius: 8, flexShrink: 0 }}>
              {rank + 1}
            </span>
            <span style={{ flex: 1, fontSize: 15, color: '#374151', fontWeight: rank === 0 ? '600' : '400' }}>{item.label}</span>
            <GripVertical size={18} color="#D1D5DB" style={{ flexShrink: 0 }} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onAnswer({ order: items.map(it => it.idx) })}
        style={{ padding: '14px', background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        순위 제출
      </motion.button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function SurveyStudent() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const autoJoinName = (location.state as any)?.autoJoinName ?? '';
  const sessionStudentId = (location.state as any)?.studentId ?? null;
  const sessionClassId = (location.state as any)?.classId ?? null;

  const [step, setStep] = useState<Step>(pin ? 'name' : 'pin');
  const [pinInput, setPinInput] = useState(pin ?? '');
  const [nameInput, setNameInput] = useState(autoJoinName);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<SurveyForm | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  // 프로젝트 전체용 설문(학생 세션 없이 PIN만 입력해 들어온 경우) 학교/반 선택
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classPickerLoading, setClassPickerLoading] = useState(false);

  // PIN으로 설문 조회 (URL에 pin이 있으면 자동 로드)
  useEffect(() => {
    if (pin) loadFormByPin(pin);
  }, [pin]);

  const loadFormByPin = async (p: string) => {
    setLoading(true);
    const { data, error } = await supabase.from('survey_forms').select('*').eq('pin_code', p.trim()).single();
    if (error || !data) { setErrorMsg('설문을 찾을 수 없어요. PIN을 다시 확인해주세요.'); setLoading(false); return; }
    if (data.status !== 'open') { setErrorMsg('이 설문은 현재 진행 중이 아닙니다.'); setLoading(false); return; }
    setForm(data);
    const { data: qs } = await supabase.from('survey_questions').select('*').eq('form_id', data.id).order('order_index');
    setQuestions((qs ?? []).map((q: any) => ({ ...q, options: q.options ?? [] })));
    setLoading(false);
  };

  const handlePinSubmit = async () => {
    if (!pinInput.trim()) return;
    setErrorMsg('');
    await loadFormByPin(pinInput);
    if (form) setStep('name');
  };

  // 응답에 붙일 반 id를 결정: 학생 세션 > 개별 반 전용 설문(자동) > 학교/반 선택 필요 여부
  const needsClassPicker = !!form?.school_project_id && !sessionClassId;

  const handleNameSubmit = async () => {
    if (!form) return;
    if (!form.is_anonymous && !nameInput.trim()) { setErrorMsg('이름을 입력해주세요.'); return; }
    if (needsClassPicker) {
      setErrorMsg('');
      setLoading(true);
      const { data: schools } = await supabase
        .from('school_projects')
        .select('id, name, school_name')
        .eq('parent_project_id', form.school_project_id!)
        .order('name');
      setSchoolOptions(schools ?? []);
      setLoading(false);
      setStep('select-class');
      return;
    }
    await submitResponse(sessionClassId ?? form.class_id ?? null);
  };

  const handleSchoolSelect = async (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    setSelectedClassId('');
    setClassOptions([]);
    if (!schoolId) return;
    setClassPickerLoading(true);
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('school_project_id', schoolId)
      .order('name');
    setClassOptions(data ?? []);
    setClassPickerLoading(false);
  };

  const handleClassPickerSubmit = async () => {
    if (!selectedClassId) { setErrorMsg('반을 선택해주세요.'); return; }
    await submitResponse(selectedClassId);
  };

  const submitResponse = async (classId: string | null) => {
    if (!form) return;
    setLoading(true);
    const { data, error } = await supabase.from('survey_responses').insert({
      form_id: form.id,
      respondent_name: form.is_anonymous ? '익명' : nameInput.trim(),
      student_id: sessionStudentId,
      class_id: classId,
    }).select().single();
    if (error || !data) { setErrorMsg('참여 중 오류가 발생했습니다.'); setLoading(false); return; }
    setResponseId(data.id);
    setStep('survey');
    setLoading(false);
  };

  const handleAnswer = async (value: unknown) => {
    if (!responseId || !form) return;
    const q = questions[currentIdx];
    await supabase.from('survey_answers').insert({
      response_id: responseId,
      question_id: q.id,
      form_id: form.id,
      value,
    });
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(i => i + 1);
    } else {
      setStep('done');
      if (form.redirect_url) {
        setTimeout(() => window.open(form.redirect_url!, '_blank'), 1200);
      }
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #3B82F6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  // PIN 입력
  if (step === 'pin') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #EFF6FF, #F0FDF4)', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', textAlign: 'center' }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
        <h1 style={{ fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 6 }}>설문 참여</h1>
        <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24 }}>선생님께 받은 PIN 코드를 입력하세요</p>
        <input
          value={pinInput}
          onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
          placeholder="6자리 숫자"
          maxLength={6}
          style={{ width: '100%', textAlign: 'center', fontSize: 28, fontWeight: 'bold', letterSpacing: 8, padding: '14px', border: '2px solid #E5E7EB', borderRadius: 12, outline: 'none', color: '#111', fontFamily: 'monospace', boxSizing: 'border-box' }}
        />
        {errorMsg && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 8 }}>{errorMsg}</p>}
        <button onClick={handlePinSubmit} disabled={pinInput.length < 6}
          style={{ marginTop: 16, width: '100%', padding: '14px', background: pinInput.length === 6 ? '#3B82F6' : '#E5E7EB', color: pinInput.length === 6 ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 'bold', cursor: pinInput.length === 6 ? 'pointer' : 'default' }}
        >
          참여하기 <ArrowRight size={16} style={{ display: 'inline', marginLeft: 4 }} />
        </button>
      </motion.div>
    </div>
  );

  // 이름 입력
  if (step === 'name') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #EFF6FF, #F0FDF4)', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', textAlign: 'center' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 4 }}>{form?.title}</h1>
        <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24 }}>
          {form?.is_anonymous ? '익명으로 참여합니다' : '이름을 입력해주세요'}
        </p>
        {!form?.is_anonymous && (
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
            placeholder="이름"
            autoFocus
            style={{ width: '100%', textAlign: 'center', fontSize: 18, padding: '12px', border: '2px solid #E5E7EB', borderRadius: 12, outline: 'none', color: '#111', boxSizing: 'border-box', marginBottom: 4 }}
          />
        )}
        {errorMsg && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{errorMsg}</p>}
        <button onClick={handleNameSubmit}
          style={{ marginTop: 12, width: '100%', padding: '14px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}
        >
          시작하기 <ArrowRight size={16} style={{ display: 'inline', marginLeft: 4 }} />
        </button>
      </motion.div>
    </div>
  );

  // 학교 / 반 선택 (학생 세션 없이 프로젝트 전체용 설문에 PIN으로 바로 들어온 경우)
  if (step === 'select-class') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #EFF6FF, #F0FDF4)', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', textAlign: 'center' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 4 }}>{form?.title}</h1>
        <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24 }}>소속 학교와 반을 선택해주세요</p>

        <select
          value={selectedSchoolId}
          onChange={e => handleSchoolSelect(e.target.value)}
          style={{ width: '100%', fontSize: 15, padding: '12px', border: '2px solid #E5E7EB', borderRadius: 12, outline: 'none', color: '#111', marginBottom: 12, boxSizing: 'border-box', background: '#fff' }}
        >
          <option value="">학교 선택</option>
          {schoolOptions.map(s => (
            <option key={s.id} value={s.id}>{s.school_name || s.name}</option>
          ))}
        </select>

        <select
          value={selectedClassId}
          onChange={e => setSelectedClassId(e.target.value)}
          disabled={!selectedSchoolId || classPickerLoading}
          style={{ width: '100%', fontSize: 15, padding: '12px', border: '2px solid #E5E7EB', borderRadius: 12, outline: 'none', color: '#111', boxSizing: 'border-box', background: '#fff' }}
        >
          <option value="">{classPickerLoading ? '불러오는 중...' : '반 선택'}</option>
          {classOptions.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {errorMsg && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 8 }}>{errorMsg}</p>}
        <button onClick={handleClassPickerSubmit} disabled={!selectedClassId}
          style={{ marginTop: 16, width: '100%', padding: '14px', background: selectedClassId ? '#3B82F6' : '#E5E7EB', color: selectedClassId ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 'bold', cursor: selectedClassId ? 'pointer' : 'default' }}
        >
          시작하기 <ArrowRight size={16} style={{ display: 'inline', marginLeft: 4 }} />
        </button>
      </motion.div>
    </div>
  );

  // 설문 진행
  if (step === 'survey' && questions.length > 0) {
    const q = questions[currentIdx];
    const progress = ((currentIdx) / questions.length) * 100;

    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column' }}>
        {/* 진행 바 */}
        <div style={{ height: 4, background: '#E5E7EB' }}>
          <motion.div animate={{ width: `${progress}%` }} style={{ height: '100%', background: '#3B82F6', borderRadius: 2 }} />
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <AnimatePresence mode="wait">
            <motion.div key={currentIdx}
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
              style={{ width: '100%', maxWidth: 520 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                {currentIdx > 0 ? (
                  <button onClick={() => setCurrentIdx(i => i - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <ChevronLeft size={16} /> 이전
                  </button>
                ) : <div />}
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>{currentIdx + 1} / {questions.length}</span>
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 24, lineHeight: 1.4 }}>
                {q.text}
              </h2>

              {q.type === 'multiple_choice' && <MultipleChoiceQuestion question={q} onAnswer={handleAnswer} />}
              {q.type === 'yes_no' && <YesNoQuestion onAnswer={handleAnswer} />}
              {q.type === 'star_rating' && <StarRatingQuestion onAnswer={handleAnswer} />}
              {q.type === 'short_text' && <ShortTextQuestion onAnswer={handleAnswer} />}
              {q.type === 'opinion_scale' && <OpinionScaleQuestion question={q} onAnswer={handleAnswer} />}
              {q.type === 'ranking' && <RankingQuestion question={q} onAnswer={handleAnswer} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // 완료
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #ECFDF5, #EFF6FF)', padding: 24 }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}
        style={{ background: '#fff', borderRadius: 24, padding: 48, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', maxWidth: 360, width: '100%' }}
      >
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
          <CheckCircle size={64} color="#10B981" style={{ margin: '0 auto 16px' }} />
        </motion.div>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 8 }}>제출 완료!</h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>{form?.title}</p>
        <p style={{ fontSize: 13, color: '#9CA3AF' }}>응답해주셔서 감사합니다 😊</p>
        {form?.redirect_url && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 20, marginBottom: 8 }}>새 탭이 열리지 않았다면</p>
            <a
              href={form.redirect_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', padding: '10px 20px', background: '#EFF6FF', color: '#3B82F6', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 13, fontWeight: 'bold', textDecoration: 'none' }}
            >
              여기를 클릭하세요 →
            </a>
          </motion.div>
        )}
        <button onClick={() => navigate('/student-log')}
          style={{ marginTop: 20, padding: '12px 24px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}
        >
          학생 페이지로 돌아가기
        </button>
      </motion.div>
    </div>
  );
}
