import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, Mail, School, User,
  MessageSquare, Loader2, RefreshCw, Copy, Check, Crown, Users,
  Trash2, BookOpen, GraduationCap, ClipboardList, AlertTriangle,
  BarChart3, FileCheck, Megaphone, Bell, Download, Plus, Send,
  TrendingUp, Zap, Bug, Ticket, Calendar, ToggleLeft, ToggleRight,
  Shuffle, DollarSign, Cpu, Layers, X, ChevronRight, Activity,
  ArrowUpDown, LogIn, ChevronUp, ChevronDown, Calculator, Sparkles,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab =
  | 'dashboard' | 'requests' | 'users' | 'activity' | 'classes'
  | 'students' | 'observations' | 'results' | 'suggestions' | 'announcements' | 'bugs' | 'coupons' | 'refund_calc' | 'ai_cost' | 'video_guides'
  | 'waitlist' | 'training_requests';

interface TeacherActivityRow {
  id: string;
  full_name: string | null;
  email: string;
  plan: string;
  school_name: string | null;
  class_count: number;
  student_count: number;
  obs_count: number;
  ai_count: number;
  last_class_at: string | null;
  last_obs_at: string | null;
  last_ai_at: string | null;
  last_sign_in_at: string | null;
  last_active_at: string | null;
}

type AiCostView = 'daily' | 'weekly' | 'monthly';

interface AiCostRow {
  period: string;
  cost_usd: number;
  call_count: number;
}
interface AiFeatureRow {
  feature_name: string;
  cost_usd: number;
  call_count: number;
}
interface AiModelRow {
  model_name: string;
  cost_usd: number;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
}
interface AiUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  cost_usd: number;
  call_count: number;
}
interface AiCreditRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  plan: 'basic' | 'pro';
  cost_usd: number;
  budget_usd: number;
  pct: number;
}
interface AiDetailLog {
  created_at: string;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  cost_usd: number | null;
  feature_name: string | null;
  user_id?: string | null;
  _user_name?: string | null;
}
interface AiDetailModal {
  user_id?: string;
  user_name?: string;
  feature_name?: string;
  feature_label?: string;
}

type ReqFilter = 'all' | 'pending' | 'approved' | 'rejected';
type ObsFilter = 'all' | 'pending' | 'approved' | 'rejected';

interface Request {
  id: string; name: string; email: string; school_name: string;
  role: string; message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null; created_at: string;
}
interface ClassRow {
  id: string; name: string; subject: string | null;
  teacher_id: string; created_at: string;
  profiles: { full_name: string; email: string } | null;
  _studentCount?: number;
}
interface StudentRow {
  id: string; full_name: string; student_number: number | null;
  class_id: string; created_at: string;
  classes: { name: string; subject: string | null } | null;
}
interface ObservationRow {
  id: string; content: string; activity_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string; student_id: string; teacher_id: string;
  students: { full_name: string } | null;
  profiles: { full_name: string } | null;
}
interface ResultRow {
  id: string; student_id: string; week_number: number | null;
  status: string | null; created_at: string;
  teacher_feedback: string | null; rejection_feedback: string | null;
  students: { full_name: string } | null;
}
interface SuggestionRow {
  id: string; student_id: string; content: string;
  student_name: string | null; teacher_reply: string | null;
  replied_at: string | null; created_at: string; class_id: string;
}
interface AnnouncementRow {
  id: string; title: string; content: string; created_at: string;
}
interface CouponRow {
  id: string; code: string; duration_days: number;
  max_uses: number; used_count: number;
  expires_at: string | null; is_active: boolean;
  note: string | null; created_at: string;
}
interface WaitlistRow {
  id: string; email: string; name: string | null; phone: string | null;
  plan_interest: string; memo: string | null;
  notified_at: string | null; created_at: string;
}
interface TrainingRequestRow {
  id: string; name: string; phone: string; preferred_method: string;
  memo: string | null; notified_at: string | null; created_at: string;
}

interface DashboardStats {
  users: number; classes: number; students: number;
  observations: number; results: number; pendingSuggestions: number;
  pendingRequests: number;
  aiRanking: { full_name: string | null; email: string | null; call_count: number }[];
}
type DeleteTarget = { table: string; id: string; label: string } | null;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:  { label: '검토 대기', color: 'bg-amber-100 text-amber-700',    icon: Clock },
  approved: { label: '승인됨',    color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: '거절됨',    color: 'bg-red-100 text-red-600',          icon: XCircle },
};
const PLAN_OPTIONS = [
  { value: 'free',   label: '무료',   color: 'bg-gray-100 text-gray-600' },
  { value: 'basic',  label: 'Basic',  color: 'bg-blue-100 text-blue-700' },
  { value: 'pro',    label: 'Pro',    color: 'bg-amber-100 text-amber-700' },
  { value: 'admin',  label: '관리자', color: 'bg-emerald-100 text-emerald-700' },
];
const PLAN_OPTIONS_ALL = [
  ...PLAN_OPTIONS,
  { value: 'school', label: 'School', color: 'bg-violet-100 text-violet-700' },
];
const WAITLIST_PLAN_LABELS: Record<string, string> = {
  basic: 'Basic', pro: 'Pro', school: 'School', unsure: '미정',
};
const TRAINING_METHOD_LABELS: Record<string, string> = {
  video_call: '화상통화', visit: '방문', kakao: '카카오톡', material_only: '자료만',
};
const OBS_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: '대기', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-600' },
};
const TABS: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard',     label: '현황',      icon: BarChart3 },
  { id: 'requests',      label: '사용 신청',  icon: ShieldCheck },
  { id: 'waitlist',      label: '웨이팅리스트', icon: Sparkles },
  { id: 'training_requests', label: '교육신청', icon: GraduationCap },
  { id: 'users',         label: '사용자',     icon: Users },
  { id: 'activity',      label: '활동 현황',  icon: Activity },
  { id: 'classes',       label: '학급',       icon: BookOpen },
  { id: 'students',      label: '학생',       icon: GraduationCap },
  { id: 'observations',  label: '활동 기록',  icon: ClipboardList },
  { id: 'results',       label: '결과제출',   icon: FileCheck },
  { id: 'suggestions',   label: '질문·건의함', icon: Megaphone },
  { id: 'announcements', label: '공지사항',   icon: Bell },
  { id: 'bugs',          label: '버그신고',   icon: Bug },
  { id: 'coupons',       label: '쿠폰',       icon: Ticket },
  { id: 'refund_calc',   label: '환불 계산기', icon: Calculator },
  { id: 'ai_cost',       label: 'AI 비용',    icon: DollarSign },
  { id: 'video_guides',  label: '영상 가이드', icon: Layers },
];

// ── AI Feature Labels ──────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  seatuk_draft:           '세특 초안',
  seatuk_refine:          '세특 다듬기',
  seatuk_compress:        '세특 압축',
  achievement_suggest:    '성취도 추천',
  class_insight:          '학급 인사이트',
  detailed_report:        '심층 보고서',
  ai_chat:                'AI 채팅',
  file_extract:           '파일 추출',
  transcription_analysis: '수업 전사 분석',
  quiz_generator:         '퀴즈 생성',
  survey_generator:       '설문 문항 생성',
  survey_analysis:        '설문 분석',
  observation_review:     '활동기록 검토',
  student_analysis:       '학생 분석',
  lesson_plan_copilot:        '수업 기획 분석',
  observation_analyst_copilot: '관찰기록 분석',
  slide_deck_copilot:         '슬라이드 제작 코파일럿',
  material_copilot:           '자료 제작 코파일럿',
  quiz_copilot:               '퀴즈 제작 코파일럿',
  survey_copilot:             '설문 제작 코파일럿',
  idea_handoff_copilot:       '아이디어 기획 코파일럿',
  class_manager_copilot:      '학급 관리 코파일럿',
  app_guide_copilot:          '사용법 가이드 코파일럿',
};

// ── CSV Helper ─────────────────────────────────────────────────────────────────

const downloadCSV = (data: any[], filename: string) => {
  if (!data.length) { alert('내보낼 데이터가 없습니다.'); return; }
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h] ?? '';
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v);
    }).join(',')
  );
  const csv = '﻿' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ── 환불 일할 계산 ────────────────────────────────────────────────────────────
// 정책: 결제 후 7일 이내 미사용 시 전액 환불, 이후는 잔여일수 비율로 환불
const calcRefund = (startDate: string, periodMonths: number, amount: number, cancelDate: string) => {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(start);
  end.setMonth(end.getMonth() + periodMonths);
  const cancel = new Date(cancelDate + 'T00:00:00');
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay);
  const usedDays = Math.round((cancel.getTime() - start.getTime()) / msPerDay);

  if (usedDays < 0 || totalDays <= 0) {
    return { totalDays, usedDays: 0, remainingDays: totalDays, refund: 0, valid: false };
  }
  if (usedDays <= 7) {
    return { totalDays, usedDays, remainingDays: totalDays - usedDays, refund: amount, valid: true, fullRefund: true };
  }
  if (usedDays >= totalDays) {
    return { totalDays, usedDays, remainingDays: 0, refund: 0, valid: true, fullRefund: false };
  }
  const remainingDays = totalDays - usedDays;
  const refund = Math.round((amount * remainingDays) / totalDays / 10) * 10;
  return { totalDays, usedDays, remainingDays, refund, valid: true, fullRefund: false };
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) => (
  <div className={`rounded-2xl p-5 border ${color} flex items-center gap-4`}>
    <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
      <Icon size={20} />
    </div>
    <div>
      <p className="text-xs font-bold opacity-70 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  </div>
);

const PAGE_SIZE = 10;

const getPagerRange = (page: number, totalPages: number): (number | '...')[] => {
  const delta = 1;
  const range: (number | '...')[] = [];
  const start = Math.max(2, page - delta);
  const end = Math.min(totalPages - 1, page + delta);

  range.push(1);
  if (start > 2) range.push('...');
  for (let p = start; p <= end; p++) range.push(p);
  if (end < totalPages - 1) range.push('...');
  if (totalPages > 1) range.push(totalPages);

  return range;
};

const Pager = ({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center flex-wrap gap-2 pt-4">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        이전
      </button>
      {getPagerRange(page, totalPages).map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-sm font-bold text-amber-400">
            ...
          </span>
        ) : (
          <button key={p} onClick={() => onChange(p)}
            className={`w-9 h-9 text-sm font-bold rounded-xl transition-colors ${page === p ? 'bg-amber-500 text-white shadow-md' : 'text-amber-700 border border-amber-200 hover:bg-amber-50'}`}>
            {p}
          </button>
        )
      )}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
        className="px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        다음
      </button>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const Admin = () => {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ── 탭 ─────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [page, setPage] = useState(1);

  // ── 대시보드 ───────────────────────────────────────────────────────────────
  const [dashStats, setDashStats]     = useState<DashboardStats | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // ── 사용 신청 ──────────────────────────────────────────────────────────────
  const [requests, setRequests]         = useState<Request[]>([]);
  const [reqFilter, setReqFilter]       = useState<ReqFilter>('all');
  const [reqLoading, setReqLoading]     = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteInputs, setNoteInputs]     = useState<Record<string, string>>({});
  const [planSelects, setPlanSelects]   = useState<Record<string, string>>({});
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const [reqPage, setReqPage]           = useState(1);

  // 승인 진행 상태 오버레이
  const [approvalProgress, setApprovalProgress] = useState<{
    step: 'db' | 'email' | 'done' | 'error'; name: string; email: string; message?: string;
  } | null>(null);

  // ── 사용자 ─────────────────────────────────────────────────────────────────
  const [users, setUsers]               = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [planUpdating, setPlanUpdating] = useState<string | null>(null);

  // ── 활동 현황 ────────────────────────────────────────────────────────────────
  const [teacherActivity, setTeacherActivity]     = useState<TeacherActivityRow[]>([]);
  const [activityLoading, setActivityLoading]     = useState(false);
  const [activitySort, setActivitySort]           = useState<{ key: keyof TeacherActivityRow | 'last_active_at'; dir: 'asc' | 'desc' }>({ key: 'last_active_at', dir: 'desc' });

  // ── 학급 ───────────────────────────────────────────────────────────────────
  const [classes, setClasses]           = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  // ── 학생 ───────────────────────────────────────────────────────────────────
  const [students, setStudents]         = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [classFilterId, setClassFilterId] = useState('all');

  // ── 관찰기록 ────────────────────────────────────────────────────────────────
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [obsLoading, setObsLoading]     = useState(false);
  const [obsFilter, setObsFilter]       = useState<ObsFilter>('all');

  // ── 결과제출 ────────────────────────────────────────────────────────────────
  const [results, setResults]           = useState<ResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resStatusFilter, setResStatusFilter] = useState('all');

  // ── 건의사항 ────────────────────────────────────────────────────────────────
  const [suggestions, setSuggestions]   = useState<SuggestionRow[]>([]);
  const [sugLoading, setSugLoading]     = useState(false);
  const [sugFilter, setSugFilter]       = useState<'all' | 'pending' | 'replied'>('all');

  useEffect(() => { setPage(1); }, [activeTab, classFilterId, obsFilter, resStatusFilter, sugFilter]);

  // ── 공지사항 ────────────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [annLoading, setAnnLoading]       = useState(false);
  const [annTitle, setAnnTitle]           = useState('');
  const [annContent, setAnnContent]       = useState('');
  const [annSaving, setAnnSaving]         = useState(false);

  // ── 사용자 삭제 ─────────────────────────────────────────────────────────────
  const [userDeleteConfirm, setUserDeleteConfirm] = useState<string | null>(null);
  const [userDeleting, setUserDeleting]           = useState<string | null>(null);

  // ── 버그신고 ────────────────────────────────────────────────────────────────
  const [bugs, setBugs]               = useState<any[]>([]);
  const [bugsLoading, setBugsLoading] = useState(false);

  // ── 웨이팅리스트 ────────────────────────────────────────────────────────────
  const [waitlist, setWaitlist]               = useState<WaitlistRow[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  // ── 교육신청 ────────────────────────────────────────────────────────────────
  const [trainingRequests, setTrainingRequests]             = useState<TrainingRequestRow[]>([]);
  const [trainingRequestsLoading, setTrainingRequestsLoading] = useState(false);

  // ── 쿠폰 ────────────────────────────────────────────────────────────────────
  const [coupons, setCoupons]             = useState<CouponRow[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponForm, setCouponForm]       = useState({
    code: '', duration_days: 30, max_uses: 0, expires_at: '', note: '',
  });
  const [couponSaving, setCouponSaving]   = useState(false);
  const [couponMsg, setCouponMsg]         = useState<string | null>(null);
  const [betaSetting, setBetaSetting]     = useState<{ userId: string; days: number } | null>(null);
  const [betaLoading, setBetaLoading]     = useState<string | null>(null);
  const [couponSend, setCouponSend]       = useState<{ userId: string; email: string; name: string } | null>(null);
  const [couponSendCode, setCouponSendCode] = useState('');
  const [couponSending, setCouponSending] = useState(false);
  const [couponSendMsg, setCouponSendMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── 환불 계산기 ──────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const [refundForm, setRefundForm] = useState({
    startDate: todayStr,
    periodMonths: 6,
    amount: 53400,
    cancelDate: todayStr,
  });

  // ── AI 비용 ─────────────────────────────────────────────────────────────────
  const [aiCostView, setAiCostView]         = useState<AiCostView>('daily');
  const [aiCostRows, setAiCostRows]         = useState<AiCostRow[]>([]);
  const [aiFeatureRows, setAiFeatureRows]   = useState<AiFeatureRow[]>([]);
  const [aiModelRows, setAiModelRows]       = useState<AiModelRow[]>([]);
  const [aiUserRows, setAiUserRows]         = useState<AiUserRow[]>([]);
  const [aiCreditRows, setAiCreditRows]     = useState<AiCreditRow[]>([]);
  const [aiCreditLoading, setAiCreditLoading] = useState(false);
  const [aiCostLoading, setAiCostLoading]   = useState(false);
  const [aiTotalUsd, setAiTotalUsd]         = useState(0);
  const [aiDetailModal, setAiDetailModal]   = useState<AiDetailModal | null>(null);
  const [aiDetailLogs, setAiDetailLogs]     = useState<AiDetailLog[]>([]);
  const [aiDetailLoading, setAiDetailLoading] = useState(false);
  const [aiUserPage, setAiUserPage]         = useState(0);

  // ── 공통 삭제 ──────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting]         = useState(false);

  // ── 탭 전환 시 로드 ────────────────────────────────────────────────────────
  // authLoading 또는 비관리자 상태에서는 fetch를 실행하지 않음

  useEffect(() => {
    if (authLoading || !profile?.is_admin) return;
    if (activeTab === 'dashboard')     fetchDashboard();
    if (activeTab === 'requests')      fetchRequests();
    if (activeTab === 'users')         fetchUsers();
    if (activeTab === 'activity')      fetchTeacherActivity();
    if (activeTab === 'classes')       fetchClasses();
    if (activeTab === 'students')    { fetchStudents(); fetchClasses(); }
    if (activeTab === 'observations')  fetchObservations();
    if (activeTab === 'results')       fetchResults();
    if (activeTab === 'suggestions')   fetchSuggestions();
    if (activeTab === 'announcements') fetchAnnouncements();
    if (activeTab === 'bugs')          fetchBugs();
    if (activeTab === 'coupons')       fetchCoupons();
    if (activeTab === 'ai_cost')       { fetchAiCost('daily'); fetchAiCreditUsage(); }
    if (activeTab === 'waitlist')      fetchWaitlist();
    if (activeTab === 'training_requests') fetchTrainingRequests();
  }, [activeTab, authLoading, profile]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchDashboard = async () => {
    setDashLoading(true);
    const [u, cl, st, ob, re, sg, rq] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('classes').select('id', { count: 'exact', head: true }),
      supabase.from('students').select('id', { count: 'exact', head: true }),
      supabase.from('observations').select('id', { count: 'exact', head: true }),
      supabase.from('student_results').select('id', { count: 'exact', head: true }),
      supabase.from('student_suggestions').select('id', { count: 'exact', head: true }).is('teacher_reply', null),
      supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    // 오늘 실제 AI 사용량 랭킹: ai_usage_logs는 플랜과 무관하게 모든 호출을 기록하므로
    // profiles.ai_monthly_count(월별, free 플랜 위주로만 병행 기록되는 daily count와 다름) 대신 이걸로 집계
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayLogs } = await supabase
      .from('ai_usage_logs')
      .select('user_id')
      .gte('created_at', todayStart.toISOString());

    const callCountMap: Record<string, number> = {};
    (todayLogs || []).forEach(r => {
      if (!r.user_id) return;
      callCountMap[r.user_id] = (callCountMap[r.user_id] ?? 0) + 1;
    });
    const topUserIds = Object.entries(callCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    let aiRanking: DashboardStats['aiRanking'] = [];
    if (topUserIds.length > 0) {
      const { data: rankedProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', topUserIds);
      aiRanking = topUserIds.map(id => {
        const p = rankedProfiles?.find(pr => pr.id === id);
        return { full_name: p?.full_name ?? null, email: p?.email ?? null, call_count: callCountMap[id] };
      });
    }

    setDashStats({
      users:            u.count ?? 0,
      classes:          cl.count ?? 0,
      students:         st.count ?? 0,
      observations:     ob.count ?? 0,
      results:          re.count ?? 0,
      pendingSuggestions: sg.count ?? 0,
      pendingRequests:  rq.count ?? 0,
      aiRanking,
    });
    setDashLoading(false);
  };

  const fetchRequests = async () => {
    setReqLoading(true);
    const { data } = await supabase.from('access_requests').select('*').order('created_at', { ascending: false });
    if (data) setRequests(data);
    setReqLoading(false);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    const [{ data, error }, { data: providerData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, plan, school_name, is_admin, ai_monthly_count, ai_monthly_reset, beta_expires_at')
        .order('full_name', { ascending: true }),
      supabase.rpc('get_user_auth_providers'),
    ]);
    if (error) console.error('[fetchUsers]', error.message);
    const providerMap: Record<string, string[]> = {};
    (providerData as { id: string; providers: string[] }[] | null)?.forEach(p => {
      providerMap[p.id] = p.providers;
    });
    if (data) setUsers(data.map(u => ({ ...u, providers: providerMap[u.id] ?? [] })));
    setUsersLoading(false);
  };

  const fetchCoupons = async () => {
    setCouponsLoading(true);
    const { data } = await supabase
      .from('beta_coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setCoupons(data);
    setCouponsLoading(false);
  };

  const generateCouponCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setCouponForm(f => ({ ...f, code }));
  };

  const createCoupon = async () => {
    if (!couponForm.code.trim()) { setCouponMsg('코드를 입력하세요.'); return; }
    setCouponSaving(true);
    setCouponMsg(null);
    const { error } = await supabase.from('beta_coupons').insert({
      code:          couponForm.code.trim().toUpperCase(),
      duration_days: couponForm.duration_days,
      max_uses:      couponForm.max_uses,
      expires_at:    couponForm.expires_at || null,
      note:          couponForm.note || null,
      created_by:    profile?.id,
    });
    if (error) {
      setCouponMsg(error.code === '23505' ? '이미 존재하는 코드입니다.' : error.message);
    } else {
      setCouponForm({ code: '', duration_days: 30, max_uses: 0, expires_at: '', note: '' });
      await fetchCoupons();
    }
    setCouponSaving(false);
  };

  const toggleCoupon = async (id: string, isActive: boolean) => {
    await supabase.from('beta_coupons').update({ is_active: !isActive }).eq('id', id);
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
  };

  const deleteCoupon = async (id: string) => {
    await supabase.from('beta_coupons').delete().eq('id', id);
    setCoupons(prev => prev.filter(c => c.id !== id));
  };

  const setBetaForUser = async (userId: string, days: number) => {
    setBetaLoading(userId);
    const { data } = await supabase.rpc('admin_set_beta', { p_user_id: userId, p_days: days });
    if (data?.success) {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, beta_expires_at: data.expires_at } : u
      ));
      if (days > 0) {
        const expDate = new Date(data.expires_at).toLocaleDateString('ko-KR');
        await supabase.from('notifications').insert({
          user_id: userId,
          title: `🎉 Pro 체험 액세스가 부여되었습니다!`,
          content: `${days}일간 Pro 기능을 모두 사용하실 수 있습니다. (${expDate}까지)`,
          type: 'beta_granted',
          link: '/settings',
        });
      } else {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: `Pro 체험이 종료되었습니다`,
          content: `베타 액세스가 관리자에 의해 해제되었습니다.`,
          type: 'beta_revoked',
          link: '/settings',
        });
      }
    }
    setBetaLoading(null);
    setBetaSetting(null);
  };

  const sendCouponEmail = async () => {
    if (!couponSend || !couponSendCode) return;
    setCouponSending(true);
    setCouponSendMsg(null);
    const coupon = coupons.find(c => c.code === couponSendCode);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/send-coupon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          to_email:      couponSend.email,
          to_name:       couponSend.name,
          coupon_code:   couponSendCode,
          duration_days: coupon?.duration_days ?? 30,
        }),
      });
      if (res.ok) {
        setCouponSendMsg({ type: 'ok', text: `${couponSend.email} 로 쿠폰 이메일을 발송했습니다.` });
        setTimeout(() => { setCouponSend(null); setCouponSendMsg(null); setCouponSendCode(''); }, 2500);
      } else {
        const d = await res.json();
        setCouponSendMsg({ type: 'err', text: d.error ?? '발송 실패' });
      }
    } catch {
      setCouponSendMsg({ type: 'err', text: '네트워크 오류' });
    }
    setCouponSending(false);
  };

  const fetchTeacherActivity = async () => {
    setActivityLoading(true);

    const { data: teachers } = await supabase
      .from('profiles')
      .select('id, full_name, email, plan, school_name')
      .eq('is_admin', false)
      .order('full_name');

    if (!teachers) { setActivityLoading(false); return; }

    const tids = teachers.map(t => t.id);

    const [
      { data: classData },
      { data: obsData },
      { data: aiData },
      { data: loginData },
    ] = await Promise.all([
      supabase.from('classes').select('id, teacher_id, created_at').in('teacher_id', tids),
      supabase.from('observations').select('teacher_id, created_at').in('teacher_id', tids).order('created_at', { ascending: false }),
      supabase.from('ai_usage_logs').select('user_id, created_at').in('user_id', tids).order('created_at', { ascending: false }),
      supabase.rpc('get_teacher_last_logins').then(r => r),
    ]);

    const loginMap: Record<string, string> = {};
    if (loginData) (loginData as { id: string; last_sign_in_at: string }[]).forEach(l => {
      loginMap[l.id] = l.last_sign_in_at;
    });

    const classIds = (classData || []).map(c => c.id);
    const { data: studentData } = classIds.length > 0
      ? await supabase.from('students').select('class_id').in('class_id', classIds)
      : { data: [] };

    const classMap: Record<string, { count: number; last: string | null }> = {};
    (classData || []).forEach(c => {
      if (!classMap[c.teacher_id]) classMap[c.teacher_id] = { count: 0, last: null };
      classMap[c.teacher_id].count++;
      if (!classMap[c.teacher_id].last || c.created_at > classMap[c.teacher_id].last!)
        classMap[c.teacher_id].last = c.created_at;
    });

    const classToTeacher: Record<string, string> = {};
    (classData || []).forEach(c => { classToTeacher[c.id] = c.teacher_id; });
    const studentMap: Record<string, number> = {};
    (studentData || []).forEach(s => {
      const tid = classToTeacher[s.class_id];
      if (tid) studentMap[tid] = (studentMap[tid] || 0) + 1;
    });

    const obsMap: Record<string, { count: number; last: string | null }> = {};
    (obsData || []).forEach(o => {
      if (!obsMap[o.teacher_id]) obsMap[o.teacher_id] = { count: 0, last: null };
      obsMap[o.teacher_id].count++;
      if (!obsMap[o.teacher_id].last) obsMap[o.teacher_id].last = o.created_at;
    });

    const aiMap: Record<string, { count: number; last: string | null }> = {};
    (aiData || []).forEach(a => {
      if (!aiMap[a.user_id]) aiMap[a.user_id] = { count: 0, last: null };
      aiMap[a.user_id].count++;
      if (!aiMap[a.user_id].last) aiMap[a.user_id].last = a.created_at;
    });

    const result: TeacherActivityRow[] = teachers.map(t => {
      const cls = classMap[t.id] || { count: 0, last: null };
      const obs = obsMap[t.id] || { count: 0, last: null };
      const ai  = aiMap[t.id]  || { count: 0, last: null };
      const signIn = loginMap[t.id] ?? null;
      const times = [cls.last, obs.last, ai.last, signIn].filter(Boolean) as string[];
      const last_active_at = times.length > 0 ? times.reduce((a, b) => a > b ? a : b) : null;
      return {
        ...t,
        class_count:     cls.count,
        student_count:   studentMap[t.id] || 0,
        obs_count:       obs.count,
        ai_count:        ai.count,
        last_class_at:   cls.last,
        last_obs_at:     obs.last,
        last_ai_at:      ai.last,
        last_sign_in_at: signIn,
        last_active_at,
      };
    });

    setTeacherActivity(result);
    setActivityLoading(false);
  };

  const fetchClasses = async () => {
    setClassesLoading(true);
    const { data: classData } = await supabase
      .from('classes').select('id, name, subject, teacher_id, created_at')
      .order('created_at', { ascending: false });
    if (!classData) { setClassesLoading(false); return; }

    const tids = [...new Set(classData.map(c => c.teacher_id))];
    const { data: tData } = await supabase.from('profiles').select('id, full_name, email').in('id', tids);
    const tMap = Object.fromEntries((tData || []).map(t => [t.id, t]));

    const { data: stuData } = await supabase.from('students').select('class_id');
    const cntMap: Record<string, number> = {};
    (stuData || []).forEach(s => { cntMap[s.class_id] = (cntMap[s.class_id] || 0) + 1; });

    setClasses(classData.map(c => ({
      ...c, profiles: tMap[c.teacher_id] ?? null, _studentCount: cntMap[c.id] || 0,
    })));
    setClassesLoading(false);
  };

  const fetchStudents = async () => {
    setStudentsLoading(true);
    const { data: sData } = await supabase.from('students')
      .select('id, full_name, student_number, class_id, created_at')
      .order('student_number', { ascending: true });
    if (!sData) { setStudentsLoading(false); return; }

    const cids = [...new Set(sData.map(s => s.class_id))];
    const { data: cData } = await supabase.from('classes').select('id, name, subject').in('id', cids);
    const cMap = Object.fromEntries((cData || []).map(c => [c.id, c]));
    setStudents(sData.map(s => ({ ...s, classes: cMap[s.class_id] ?? null })));
    setStudentsLoading(false);
  };

  const fetchObservations = async () => {
    setObsLoading(true);
    const { data: obsData } = await supabase.from('observations')
      .select('id, content, activity_name, status, created_at, student_id, teacher_id')
      .order('created_at', { ascending: false });
    if (!obsData) { setObsLoading(false); return; }

    const sids = [...new Set(obsData.map(o => o.student_id))];
    const pids = [...new Set(obsData.map(o => o.teacher_id))];
    const [{ data: sD }, { data: pD }] = await Promise.all([
      supabase.from('students').select('id, full_name').in('id', sids),
      supabase.from('profiles').select('id, full_name').in('id', pids),
    ]);
    const sMap = Object.fromEntries((sD || []).map(s => [s.id, s]));
    const pMap = Object.fromEntries((pD || []).map(p => [p.id, p]));
    setObservations(obsData.map(o => ({
      ...o, students: sMap[o.student_id] ?? null, profiles: pMap[o.teacher_id] ?? null,
    })));
    setObsLoading(false);
  };

  const fetchResults = async () => {
    setResultsLoading(true);
    const { data: rData } = await supabase.from('student_results')
      .select('id, student_id, week_number, status, created_at, teacher_feedback, rejection_feedback')
      .order('created_at', { ascending: false });
    if (!rData) { setResultsLoading(false); return; }

    const sids = [...new Set(rData.map(r => r.student_id))];
    const { data: sD } = await supabase.from('students').select('id, full_name').in('id', sids);
    const sMap = Object.fromEntries((sD || []).map(s => [s.id, s]));
    setResults(rData.map(r => ({ ...r, students: sMap[r.student_id] ?? null })));
    setResultsLoading(false);
  };

  const fetchSuggestions = async () => {
    setSugLoading(true);
    const { data } = await supabase.from('student_suggestions')
      .select('id, student_id, content, student_name, teacher_reply, replied_at, created_at, class_id')
      .order('created_at', { ascending: false });
    if (data) setSuggestions(data);
    setSugLoading(false);
  };

  const fetchAnnouncements = async () => {
    setAnnLoading(true);
    const { data } = await supabase.from('announcements')
      .select('id, title, content, created_at')
      .order('created_at', { ascending: false });
    if (data) setAnnouncements(data);
    setAnnLoading(false);
  };

  const fetchBugs = async () => {
    setBugsLoading(true);
    const { data } = await supabase.from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBugs(data);
    setBugsLoading(false);
  };

  const deleteUser = async (userId: string) => {
    setUserDeleting(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`삭제 실패: ${data.error}`);
        return;
      }
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setUserDeleting(null);
      setUserDeleteConfirm(null);
    }
  };

  const updateBugStatus = async (id: string, status: string) => {
    await supabase.from('bug_reports').update({ status }).eq('id', id);
    setBugs(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  };

  const fetchWaitlist = async () => {
    setWaitlistLoading(true);
    const { data } = await supabase.from('payment_waitlist')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setWaitlist(data);
    setWaitlistLoading(false);
  };

  const toggleWaitlistNotified = async (id: string, notified: boolean) => {
    const notified_at = notified ? new Date().toISOString() : null;
    await supabase.from('payment_waitlist').update({ notified_at }).eq('id', id);
    setWaitlist(prev => prev.map(w => w.id === id ? { ...w, notified_at } : w));
  };

  const fetchTrainingRequests = async () => {
    setTrainingRequestsLoading(true);
    const { data } = await supabase.from('training_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setTrainingRequests(data);
    setTrainingRequestsLoading(false);
  };

  const toggleTrainingRequestNotified = async (id: string, notified: boolean) => {
    const notified_at = notified ? new Date().toISOString() : null;
    await supabase.from('training_requests').update({ notified_at }).eq('id', id);
    setTrainingRequests(prev => prev.map(t => t.id === id ? { ...t, notified_at } : t));
  };

  const fetchAiCost = async (view: AiCostView = aiCostView) => {
    setAiCostLoading(true);
    try {
      const now = new Date();

      // 기간 시작일 계산
      let since: Date;
      if (view === 'daily') {
        since = new Date(now);
        since.setDate(since.getDate() - 6);
        since.setHours(0, 0, 0, 0);
      } else if (view === 'weekly') {
        since = new Date(now);
        since.setDate(since.getDate() - 7 * 7);
        since.setHours(0, 0, 0, 0);
      } else {
        since = new Date(now);
        since.setMonth(since.getMonth() - 5);
        since.setDate(1);
        since.setHours(0, 0, 0, 0);
      }

      const { data: raw, error: aiError } = await supabase
        .from('ai_usage_logs')
        .select('user_id, feature_name, model_name, input_tokens, output_tokens, thinking_tokens, cost_usd, created_at, class_id')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      if (aiError) { console.error('[Admin] ai_usage_logs fetch error:', aiError); return; }
      if (!raw) return;

      // 기간별 집계
      const periodMap: Record<string, { cost_usd: number; call_count: number }> = {};

      if (view === 'daily') {
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          periodMap[key] = { cost_usd: 0, call_count: 0 };
        }
        raw.forEach(r => {
          const key = r.created_at.split('T')[0];
          if (periodMap[key]) {
            periodMap[key].cost_usd  += r.cost_usd ?? 0;
            periodMap[key].call_count += 1;
          }
        });
      } else if (view === 'weekly') {
        for (let i = 7; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i * 7);
          const monday = new Date(d);
          monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          const key = monday.toISOString().split('T')[0];
          periodMap[key] = periodMap[key] ?? { cost_usd: 0, call_count: 0 };
        }
        raw.forEach(r => {
          const d = new Date(r.created_at);
          const monday = new Date(d);
          monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          const key = monday.toISOString().split('T')[0];
          if (periodMap[key]) {
            periodMap[key].cost_usd  += r.cost_usd ?? 0;
            periodMap[key].call_count += 1;
          }
        });
      } else {
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          periodMap[key] = { cost_usd: 0, call_count: 0 };
        }
        raw.forEach(r => {
          const d = new Date(r.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (periodMap[key]) {
            periodMap[key].cost_usd  += r.cost_usd ?? 0;
            periodMap[key].call_count += 1;
          }
        });
      }

      const costRows: AiCostRow[] = Object.entries(periodMap).map(([period, v]) => ({
        period, cost_usd: v.cost_usd, call_count: v.call_count,
      }));
      setAiCostRows(costRows);
      setAiTotalUsd(costRows.reduce((s, r) => s + r.cost_usd, 0));

      // 기능별 집계
      const featureMap: Record<string, { cost_usd: number; call_count: number }> = {};
      raw.forEach(r => {
        const k = r.feature_name ?? 'unknown';
        featureMap[k] = featureMap[k] ?? { cost_usd: 0, call_count: 0 };
        featureMap[k].cost_usd  += r.cost_usd ?? 0;
        featureMap[k].call_count += 1;
      });
      setAiFeatureRows(
        Object.entries(featureMap)
          .map(([feature_name, v]) => ({ feature_name, ...v }))
          .sort((a, b) => b.cost_usd - a.cost_usd)
      );

      // 모델별 집계
      const modelMap: Record<string, { cost_usd: number; call_count: number; input_tokens: number; output_tokens: number; thinking_tokens: number }> = {};
      raw.forEach(r => {
        const k = r.model_name ?? 'unknown';
        modelMap[k] = modelMap[k] ?? { cost_usd: 0, call_count: 0, input_tokens: 0, output_tokens: 0, thinking_tokens: 0 };
        modelMap[k].cost_usd      += r.cost_usd ?? 0;
        modelMap[k].call_count    += 1;
        modelMap[k].input_tokens  += r.input_tokens ?? 0;
        modelMap[k].output_tokens += r.output_tokens ?? 0;
        modelMap[k].thinking_tokens += r.thinking_tokens ?? 0;
      });
      setAiModelRows(
        Object.entries(modelMap)
          .map(([model_name, v]) => ({ model_name, ...v }))
          .sort((a, b) => b.cost_usd - a.cost_usd)
      );

      // 유저별 집계
      const userMap: Record<string, { cost_usd: number; call_count: number }> = {};
      raw.forEach(r => {
        const k = r.user_id ?? 'unknown';
        userMap[k] = userMap[k] ?? { cost_usd: 0, call_count: 0 };
        userMap[k].cost_usd  += r.cost_usd ?? 0;
        userMap[k].call_count += 1;
      });

      const userIds = Object.keys(userMap).filter(id => id !== 'unknown');
      let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name, email').in('id', userIds);
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
      }

      // 프로필 없는 user_id → class_id → 담당 선생님 매핑
      const noProfileIds = userIds.filter(id => !profileMap[id]);
      let teacherByUserId: Record<string, { full_name: string | null; email: string | null; teacher_id: string }> = {};
      if (noProfileIds.length > 0) {
        // 각 미확인 user_id의 가장 많이 사용된 class_id 추출
        const classResolutionMap: Record<string, string> = {};
        for (const uid of noProfileIds) {
          const classCounts: Record<string, number> = {};
          raw.filter(r => r.user_id === uid && r.class_id)
             .forEach(r => { classCounts[r.class_id!] = (classCounts[r.class_id!] || 0) + 1; });
          const topClass = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0];
          if (topClass) classResolutionMap[uid] = topClass[0];
        }

        const classIds = [...new Set(Object.values(classResolutionMap))];
        if (classIds.length > 0) {
          const { data: classes } = await supabase
            .from('classes').select('id, teacher_id').in('id', classIds);
          const classTeacherMap = Object.fromEntries((classes ?? []).map(c => [c.id, c.teacher_id]));

          const teacherIds = [...new Set(Object.values(classTeacherMap).filter(Boolean))] as string[];
          if (teacherIds.length > 0) {
            const { data: teacherProfiles } = await supabase
              .from('profiles').select('id, full_name, email').in('id', teacherIds);
            const teacherProfileMap = Object.fromEntries((teacherProfiles ?? []).map(p => [p.id, p]));

            for (const uid of noProfileIds) {
              const classId = classResolutionMap[uid];
              const teacherId = classId ? classTeacherMap[classId] : null;
              if (teacherId && teacherProfileMap[teacherId]) {
                teacherByUserId[uid] = { ...teacherProfileMap[teacherId], teacher_id: teacherId };
              }
            }
          }
        }
      }

      // 미확인 유저 비용을 담당 선생님 항목에 병합
      const mergedMap: Record<string, { cost_usd: number; call_count: number }> = {};
      for (const [uid, v] of Object.entries(userMap)) {
        const resolvedId = (!profileMap[uid] && teacherByUserId[uid])
          ? teacherByUserId[uid].teacher_id
          : uid;
        mergedMap[resolvedId] = mergedMap[resolvedId]
          ? { cost_usd: mergedMap[resolvedId].cost_usd + v.cost_usd, call_count: mergedMap[resolvedId].call_count + v.call_count }
          : { ...v };
      }

      setAiUserRows(
        Object.entries(mergedMap)
          .map(([user_id, v]) => ({
            user_id,
            full_name: profileMap[user_id]?.full_name || profileMap[user_id]?.email
                       || teacherByUserId[user_id]?.full_name || teacherByUserId[user_id]?.email || null,
            email:     profileMap[user_id]?.email || teacherByUserId[user_id]?.email || null,
            ...v,
          }))
          .sort((a, b) => b.cost_usd - a.cost_usd)
      );
      setAiUserPage(0);
    } finally {
      setAiCostLoading(false);
    }
  };

  // basic/pro 유저의 이번 달 실시간 크레딧 소진율 (api/gemini.ts의 PLAN_MONTHLY_BUDGET_USD와 동일한 기준)
  const AI_CREDIT_BUDGET_USD: Record<'basic' | 'pro', number> = { basic: 2, pro: 6 };

  const fetchAiCreditUsage = async () => {
    setAiCreditLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, plan, ai_monthly_cost_usd')
        .in('plan', ['basic', 'pro'])
        .gt('ai_monthly_cost_usd', 0);

      if (error) { console.error('[Admin] ai credit usage fetch error:', error); return; }

      const rows: AiCreditRow[] = (data ?? []).map(p => {
        const plan = p.plan as 'basic' | 'pro';
        const budget_usd = AI_CREDIT_BUDGET_USD[plan];
        const cost_usd = p.ai_monthly_cost_usd ?? 0;
        return {
          user_id: p.id,
          full_name: p.full_name,
          email: p.email,
          plan,
          cost_usd,
          budget_usd,
          pct: (cost_usd / budget_usd) * 100,
        };
      }).sort((a, b) => b.pct - a.pct);

      setAiCreditRows(rows);
    } finally {
      setAiCreditLoading(false);
    }
  };

  const openAiDetail = async (modal: AiDetailModal) => {
    setAiDetailModal(modal);
    setAiDetailLoading(true);
    setAiDetailLogs([]);

    const now = new Date();
    let since: Date;
    if (aiCostView === 'daily') {
      since = new Date(now); since.setDate(since.getDate() - 6); since.setHours(0, 0, 0, 0);
    } else if (aiCostView === 'weekly') {
      since = new Date(now); since.setDate(since.getDate() - 49); since.setHours(0, 0, 0, 0);
    } else {
      since = new Date(now); since.setMonth(since.getMonth() - 5); since.setDate(1); since.setHours(0, 0, 0, 0);
    }

    let query = supabase
      .from('ai_usage_logs')
      .select('created_at, model_name, input_tokens, output_tokens, thinking_tokens, cost_usd, feature_name, user_id')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (modal.user_id)     query = query.eq('user_id', modal.user_id);
    if (modal.feature_name) query = query.eq('feature_name', modal.feature_name);

    const { data } = await query;
    if (!data) { setAiDetailLoading(false); return; }

    if (modal.feature_name && !modal.user_id) {
      const userIds = [...new Set(data.map(d => d.user_id).filter(Boolean))] as string[];
      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name, email').in('id', userIds);
        nameMap = Object.fromEntries(
          (profiles ?? []).map(p => [p.id, p.full_name || p.email || p.id.slice(0, 8)])
        );
      }
      setAiDetailLogs(data.map(d => ({ ...d, _user_name: nameMap[d.user_id ?? ''] ?? null })));
    } else {
      setAiDetailLogs(data);
    }
    setAiDetailLoading(false);
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => {
    if (activeTab === 'dashboard')     fetchDashboard();
    if (activeTab === 'requests')      fetchRequests();
    if (activeTab === 'users')         fetchUsers();
    if (activeTab === 'activity')      fetchTeacherActivity();
    if (activeTab === 'classes')       fetchClasses();
    if (activeTab === 'students')    { fetchStudents(); fetchClasses(); }
    if (activeTab === 'observations')  fetchObservations();
    if (activeTab === 'results')       fetchResults();
    if (activeTab === 'suggestions')   fetchSuggestions();
    if (activeTab === 'announcements') fetchAnnouncements();
    if (activeTab === 'ai_cost')       fetchAiCost();
  };

  const deleteRequest = async (id: string) => {
    if (!window.confirm('이 신청 내역을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('access_requests').delete().eq('id', id);
    if (!error) setRequests(prev => prev.filter(r => r.id !== id));
  };

  const updateStatus = async (id: string, status: 'approved' | 'rejected', plan?: string) => {
    setActionLoading(id + status);
    const req = requests.find(r => r.id === id);

    if (status === 'approved' && req) {
      setApprovalProgress({ step: 'db', name: req.name, email: req.email });
    }

    const { error } = await supabase.from('access_requests')
      .update({ status, admin_note: noteInputs[id] || null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status, admin_note: noteInputs[id] || null } : r));

      // 프로필 is_approved 동기화
      if (req) {
        const isApproved = status === 'approved';
        await supabase.from('profiles')
          .update({ is_approved: isApproved })
          .eq('email', req.email);
      }

      if (status === 'approved' && req) {
        setApprovalProgress({ step: 'email', name: req.name, email: req.email });
        try {
          const { data: { session: adminSession } } = await supabase.auth.getSession();
          const res = await fetch('/api/invite-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(adminSession?.access_token ? { 'Authorization': `Bearer ${adminSession.access_token}` } : {}),
            },
            body: JSON.stringify({ email: req.email, name: req.name, plan: plan || 'free' }),
          });
          const resData = await res.json();
          if (!res.ok) {
            setApprovalProgress({
              step: 'error', name: req.name, email: req.email,
              message: `이메일 발송 실패: ${resData.error}`,
            });
          } else {
            setApprovalProgress({
              step: 'done', name: req.name, email: req.email,
              message: resData.type === 'reset' ? '(기존 계정 — 비밀번호 재설정 이메일 발송)' : undefined,
            });
            setTimeout(() => setApprovalProgress(null), 4000);
          }
        } catch {
          setApprovalProgress({
            step: 'error', name: req.name, email: req.email,
            message: '네트워크 오류로 이메일 발송 실패. 수동 처리 필요.',
          });
        }
      }
    } else if (error && status === 'approved' && req) {
      setApprovalProgress({ step: 'error', name: req.name, email: req.email, message: 'DB 업데이트 실패' });
    }

    setActionLoading(null);
  };

  const updateUserPlan = async (userId: string, plan: string) => {
    setPlanUpdating(userId);
    const { data, error } = await supabase.rpc('admin_update_plan', {
      p_user_id: userId,
      p_plan: plan,
    });
    if (error) {
      alert(`플랜 변경 실패: ${error.message}`);
    } else if (data?.error) {
      alert(`플랜 변경 실패: ${data.error}`);
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan, is_admin: plan === 'admin' } : u));
    }
    setPlanUpdating(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { data, error } = await supabase.from(deleteTarget.table).delete().eq('id', deleteTarget.id).select('id');
    if (error || !data || data.length === 0) {
      alert(`삭제 실패: ${error?.message || '삭제 권한이 없거나 이미 삭제된 항목입니다.'}`);
      setDeleting(false);
      return;
    }
    if (deleteTarget.table === 'classes')            setClasses(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'students')           setStudents(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'observations')       setObservations(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'student_results')    setResults(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'student_suggestions') setSuggestions(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'announcements')      setAnnouncements(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'payment_waitlist')   setWaitlist(p => p.filter(r => r.id !== deleteTarget.id));
    if (deleteTarget.table === 'training_requests')  setTrainingRequests(p => p.filter(r => r.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  };

  const createAnnouncement = async () => {
    if (!annTitle.trim() || !annContent.trim()) return;
    setAnnSaving(true);
    const title   = annTitle.trim();
    const content = annContent.trim();

    const { data, error } = await supabase.from('announcements')
      .insert({ title, content })
      .select().single();

    if (!error && data) {
      setAnnouncements(prev => [data, ...prev]);
      setAnnTitle(''); setAnnContent('');

      // Slack 알림 발송 (실패해도 공지 저장은 성공으로 처리)
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch('/api/slack?type=announcement', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ title, content }),
        }).catch(() => {});
      });
    } else {
      alert('공지사항 저장 실패. announcements 테이블이 생성되어 있는지 확인해주세요.');
    }
    setAnnSaving(false);
  };

  const copyEmail = (id: string, email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── CSV Export ─────────────────────────────────────────────────────────────

  const exportObservations = () => downloadCSV(
    observations.map(o => ({
      학생명: o.students?.full_name ?? '미확인',
      교사명: o.profiles?.full_name ?? '미확인',
      활동명: o.activity_name,
      내용: o.content,
      상태: OBS_STATUS[o.status]?.label ?? o.status,
      날짜: new Date(o.created_at).toLocaleDateString('ko-KR'),
    })),
    `활동기록_${new Date().toISOString().slice(0, 10)}.csv`
  );

  const exportResults = () => downloadCSV(
    results.map(r => ({
      학생명: r.students?.full_name ?? '미확인',
      주차: r.week_number ?? '',
      상태: r.status ?? '',
      교사피드백: r.teacher_feedback ?? '',
      날짜: new Date(r.created_at).toLocaleDateString('ko-KR'),
    })),
    `결과제출_${new Date().toISOString().slice(0, 10)}.csv`
  );

  const exportSuggestions = () => downloadCSV(
    suggestions.map(s => ({
      학생명: s.student_name ?? '미확인',
      내용: s.content,
      답변여부: s.teacher_reply ? '답변완료' : '미답변',
      교사답변: s.teacher_reply ?? '',
      날짜: new Date(s.created_at).toLocaleDateString('ko-KR'),
    })),
    `질문건의함_${new Date().toISOString().slice(0, 10)}.csv`
  );

  // 필터 변경 시 페이지 초기화
  useEffect(() => { setReqPage(1); }, [reqFilter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && deleteTarget) setDeleteTarget(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const REQ_PAGE_SIZE = 10;
  const filteredRequests = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter);
  const totalReqPages    = Math.ceil(filteredRequests.length / REQ_PAGE_SIZE);
  const pagedRequests    = filteredRequests.slice((reqPage - 1) * REQ_PAGE_SIZE, reqPage * REQ_PAGE_SIZE);
  const reqCounts = {
    all: requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };
  const classOptions = [{ id: 'all', name: '전체 학급' }, ...classes.map(c => ({ id: c.id, name: c.name }))];
  const filteredStudents = classFilterId === 'all' ? students : students.filter(s => s.class_id === classFilterId);
  const filteredObs  = obsFilter === 'all' ? observations : observations.filter(o => o.status === obsFilter);
  const filteredResults = resStatusFilter === 'all' ? results : results.filter(r => r.status === resStatusFilter);
  const filteredSuggestions = sugFilter === 'all'
    ? suggestions
    : sugFilter === 'pending'
    ? suggestions.filter(s => !s.teacher_reply)
    : suggestions.filter(s => !!s.teacher_reply);

  const resultStatuses = [...new Set(results.map(r => r.status).filter(Boolean))];

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  // 렌더 시점에서 관리자 권한 확인 — useEffect보다 먼저 실행되어 UI 노출 없음
  if (!profile?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="min-h-screen bg-[#FFFBF5] font-pretendard">

      {/* Header */}
      <div className="bg-white border-b border-amber-100">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-amber-900">관리자 패널</h1>
              <p className="text-xs text-amber-600/60">전체 데이터 관리 · 통계 · 공지</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors">
              <RefreshCw size={14} /> 새로고침
            </button>
            <button onClick={() => navigate('/dashboard')} className="px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
              대시보드로
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-6xl mx-auto px-6 pb-0 flex gap-0.5 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id ? 'border-amber-500 text-amber-700' : 'border-transparent text-amber-400 hover:text-amber-600'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <p className="font-black text-sm">정말 삭제할까요?</p>
                <p className="text-xs text-gray-500 mt-0.5">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl mb-5">
              <p className="text-sm font-bold text-red-700">{deleteTarget.label}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                취소
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} 삭제
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── 대시보드 ── */}
        {activeTab === 'dashboard' && (
          <>
            {dashLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            ) : dashStats ? (
              <div className="space-y-8">
                {/* 통계 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <StatCard label="전체 사용자" value={dashStats.users} icon={Users} color="bg-blue-50 border-blue-100 text-blue-700" />
                  <StatCard label="전체 학급"   value={dashStats.classes} icon={BookOpen} color="bg-violet-50 border-violet-100 text-violet-700" />
                  <StatCard label="전체 학생"   value={dashStats.students} icon={GraduationCap} color="bg-emerald-50 border-emerald-100 text-emerald-700" />
                  <StatCard label="활동 기록"    value={dashStats.observations} icon={ClipboardList} color="bg-amber-50 border-amber-100 text-amber-700" />
                  <StatCard label="결과제출"     value={dashStats.results} icon={FileCheck} color="bg-cyan-50 border-cyan-100 text-cyan-700" />
                  <StatCard label="미답변 건의"  value={dashStats.pendingSuggestions} icon={Megaphone} color="bg-rose-50 border-rose-100 text-rose-700" />
                  <StatCard label="대기 신청"    value={dashStats.pendingRequests} icon={Clock} color="bg-orange-50 border-orange-100 text-orange-700" />
                </div>

                {/* AI 사용량 랭킹 */}
                <div className="bg-white rounded-2xl border border-amber-100 p-6">
                  <h3 className="text-base font-black text-amber-900 flex items-center gap-2 mb-5">
                    <TrendingUp size={18} className="text-amber-500" />
                    오늘 AI 사용량 랭킹
                  </h3>
                  {dashStats.aiRanking.length === 0 ? (
                    <p className="text-sm text-amber-400 text-center py-6">오늘 AI를 사용한 사용자가 없습니다</p>
                  ) : (
                    <div className="space-y-3">
                      {dashStats.aiRanking.map((u, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-600'
                          }`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-amber-900 truncate">{u.full_name || u.email || '이름 없음'}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-24 h-2 bg-amber-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min((u.call_count / (dashStats.aiRanking[0]?.call_count || 1)) * 100, 100)}%` }} />
                            </div>
                            <span className="text-xs font-black text-amber-700 w-8 text-right">{u.call_count}</span>
                            <Zap size={11} className="text-amber-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ── 사용 신청 ── */}
        {activeTab === 'requests' && (
          <>
            <div className="flex gap-2 mb-6">
              {(['all', 'pending', 'approved', 'rejected'] as ReqFilter[]).map(f => (
                <button key={f} onClick={() => setReqFilter(f)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${reqFilter === f ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}`}>
                  {f === 'all' ? '전체' : STATUS_CFG[f].label}
                  <span className={`ml-2 text-xs ${reqFilter === f ? 'text-amber-100' : 'text-amber-400'}`}>{reqCounts[f]}</span>
                </button>
              ))}
            </div>
            {reqLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            : filteredRequests.length === 0 ? (
              <div className="text-center py-20 text-amber-400"><ShieldCheck size={40} className="mx-auto mb-3 opacity-40" /><p className="font-medium">신청 내역이 없습니다</p></div>
            ) : (
              <div className="space-y-4">
                {pagedRequests.map((req, i) => {
                  const sc = STATUS_CFG[req.status]; const StatusIcon = sc.icon;
                  return (
                    <motion.div key={req.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className="bg-white rounded-2xl border border-amber-100 p-6 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-start gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${sc.color}`}><StatusIcon size={12} />{sc.label}</span>
                            <span className="text-xs text-amber-400">{new Date(req.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            <button onClick={() => deleteRequest(req.id)} className="ml-auto p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div className="flex items-center gap-2 text-amber-800"><User size={14} className="text-amber-400 shrink-0" /><span className="font-bold">{req.name}</span></div>
                            <div className="flex items-center gap-2 text-amber-800"><School size={14} className="text-amber-400 shrink-0" /><span>{req.school_name}</span></div>
                            <div className="flex items-center gap-2 text-amber-700 col-span-2">
                              <Mail size={14} className="text-amber-400 shrink-0" /><span className="font-mono text-xs">{req.email}</span>
                              <button onClick={() => copyEmail(req.id, req.email)} className="ml-1 p-1 rounded-lg hover:bg-amber-50 text-amber-400 hover:text-amber-600 transition-colors">
                                {copiedId === req.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                          {req.message && <div className="flex gap-2 bg-amber-50 rounded-xl p-3 text-sm text-amber-700"><MessageSquare size={14} className="text-amber-400 shrink-0 mt-0.5" /><p className="leading-relaxed">{req.message}</p></div>}
                          {req.admin_note && <p className="text-xs text-amber-500 italic">메모: {req.admin_note}</p>}
                        </div>
                        {req.status === 'pending' ? (
                          <div className="flex flex-col gap-3 min-w-[200px]">
                            <textarea placeholder="관리자 메모 (선택)" rows={2} value={noteInputs[req.id] || ''}
                              onChange={e => setNoteInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                              className="w-full px-3 py-2 text-xs border border-amber-200 rounded-xl resize-none focus:outline-none focus:border-amber-400 bg-amber-50" />
                            <select
                              value={planSelects[req.id] || 'free'}
                              onChange={e => setPlanSelects(prev => ({ ...prev, [req.id]: e.target.value }))}
                              className="w-full px-3 py-2 text-xs border border-amber-200 rounded-xl focus:outline-none focus:border-amber-400 bg-amber-50 font-bold text-amber-800 cursor-pointer"
                            >
                              <option value="free">Free — AI 월 20회</option>
                              <option value="basic">Basic — AI $2 크레딧/월</option>
                              <option value="pro">Pro — AI $6 크레딧/월</option>
                              <option value="school">School — 열람 전용</option>
                            </select>
                            <div className="flex gap-2">
                              <button onClick={() => updateStatus(req.id, 'approved', planSelects[req.id] || 'free')} disabled={!!actionLoading}
                                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                                {actionLoading === req.id + 'approved' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} 승인
                              </button>
                              <button onClick={() => updateStatus(req.id, 'rejected')} disabled={!!actionLoading}
                                className="flex-1 py-2.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-600 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                                {actionLoading === req.id + 'rejected' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} 거절
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => updateStatus(req.id, 'pending' as any)} disabled={!!actionLoading}
                            className="py-2 px-4 text-xs font-bold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                            대기로 되돌리기
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* 페이징 */}
            {totalReqPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button onClick={() => setReqPage(p => Math.max(1, p - 1))} disabled={reqPage === 1}
                  className="px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  이전
                </button>
                {Array.from({ length: totalReqPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setReqPage(p)}
                    className={`w-9 h-9 text-sm font-bold rounded-xl transition-colors ${reqPage === p ? 'bg-amber-500 text-white shadow-md' : 'text-amber-700 border border-amber-200 hover:bg-amber-50'}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setReqPage(p => Math.min(totalReqPages, p + 1))} disabled={reqPage === totalReqPages}
                  className="px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  다음
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 사용자·플랜 ── */}
        {activeTab === 'users' && (
          usersLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
          : <div className="space-y-3">
            {users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(u => {
              const thisMonth = new Date().toISOString().slice(0, 7);
              const aiToday = u.ai_monthly_reset === thisMonth ? (u.ai_monthly_count ?? 0) : 0;
              const planInfo = PLAN_OPTIONS_ALL.find(p => p.value === u.plan) ?? PLAN_OPTIONS_ALL[0];
              const betaActive = u.beta_expires_at && new Date(u.beta_expires_at) > new Date();
              const betaDaysLeft = betaActive
                ? Math.ceil((new Date(u.beta_expires_at).getTime() - Date.now()) / 86400000)
                : 0;
              const isSettingBeta = betaSetting?.userId === u.id;
              return (
                <div key={u.id} className={`bg-white rounded-2xl border p-5 flex flex-col gap-3 transition-all ${userDeleteConfirm === u.id ? 'border-red-300 bg-red-50/30' : 'border-amber-100'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-black text-amber-900 text-sm">{u.full_name || '이름 없음'}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${planInfo.color}`}>{planInfo.label}</span>
                        {u.providers?.includes('google') && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-600 flex items-center gap-1">
                            <svg width="9" height="9" viewBox="0 0 18 18" className="shrink-0">
                              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.61z"/>
                              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
                              <path fill="#FBBC05" d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.99-2.33z"/>
                              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.98l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
                            </svg>
                            Google
                          </span>
                        )}
                        {betaActive && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                            <Ticket size={9} /> BETA D-{betaDaysLeft}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-amber-600/70 font-mono">{u.email}</p>
                      {u.school_name && <p className="text-xs text-amber-500 mt-0.5">{u.school_name}</p>}
                      {u.plan === 'free'  && <p className="text-xs text-gray-400 mt-1">이번 달 AI 사용: {aiToday} / 20회</p>}
                      {u.plan === 'basic' && <p className="text-xs text-blue-400 mt-1">이번 달 AI 사용: {aiToday} / 100회</p>}
                      {u.plan === 'pro'   && <p className="text-xs text-amber-400 mt-1">이번 달 AI 사용: {aiToday} / 500회</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {u.plan === 'admin'  ? <ShieldCheck size={14} className="text-emerald-500 shrink-0" /> :
                       u.plan === 'pro'    ? <Crown size={14} className="text-amber-400 shrink-0" /> :
                       u.plan === 'school' ? <GraduationCap size={14} className="text-violet-500 shrink-0" /> :
                       u.plan === 'basic'  ? <Crown size={14} className="text-blue-400 shrink-0" /> :
                                            <User size={14} className="text-gray-400 shrink-0" />}
                        <select value={u.plan ?? 'free'} onChange={e => updateUserPlan(u.id, e.target.value)} disabled={planUpdating === u.id}
                          className="text-sm font-bold border border-amber-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-amber-400 cursor-pointer disabled:opacity-50">
                          {PLAN_OPTIONS_ALL.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      {planUpdating === u.id && <Loader2 size={14} className="animate-spin text-amber-400" />}
                      {/* 베타 부여/철수 버튼 */}
                      <button
                        onClick={() => setBetaSetting(isSettingBeta ? null : { userId: u.id, days: 30 })}
                        className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                          betaActive
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title="베타 액세스 관리"
                      >
                        <Ticket size={13} />
                        {betaActive ? `D-${betaDaysLeft}` : '베타'}
                      </button>
                      {/* 쿠폰 이메일 발송 버튼 */}
                      <button
                        onClick={() => {
                          setCouponSend(couponSend?.userId === u.id ? null : { userId: u.id, email: u.email, name: u.full_name || u.email });
                          setCouponSendCode('');
                          setCouponSendMsg(null);
                        }}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                        title="쿠폰 이메일 발송"
                      >
                        <Ticket size={13} /> 발송
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => setUserDeleteConfirm(userDeleteConfirm === u.id ? null : u.id)}
                        className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="회원 탈퇴 처리"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* 베타 부여/철수 인라인 패널 */}
                  <AnimatePresence>
                    {isSettingBeta && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 border-t border-blue-100">
                          <p className="text-xs font-bold text-blue-700 mb-2">베타 Pro 액세스 설정</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {[1, 7, 14, 30, 90].map(d => (
                              <button
                                key={d}
                                onClick={() => setBetaSetting({ userId: u.id, days: d })}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                  betaSetting?.days === d
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                }`}
                              >
                                {d}일
                              </button>
                            ))}
                            <button
                              onClick={() => setBetaForUser(u.id, betaSetting?.days ?? 30)}
                              disabled={betaLoading === u.id}
                              className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {betaLoading === u.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              부여
                            </button>
                            {betaActive && (
                              <button
                                onClick={() => setBetaForUser(u.id, 0)}
                                disabled={betaLoading === u.id}
                                className="px-4 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 text-xs font-black rounded-xl flex items-center gap-1.5 transition-colors"
                              >
                                <XCircle size={12} /> 철수
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 쿠폰 이메일 발송 인라인 패널 */}
                  <AnimatePresence>
                    {couponSend?.userId === u.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 border-t border-indigo-100">
                          <p className="text-xs font-bold text-indigo-700 mb-2 flex items-center gap-1.5">
                            <Ticket size={12} /> 쿠폰 코드 이메일 발송 → <span className="font-mono">{couponSend?.email}</span>
                          </p>
                          {coupons.filter(c => c.is_active).length === 0 ? (
                            <p className="text-xs text-gray-400">활성화된 쿠폰이 없습니다. 쿠폰 탭에서 먼저 생성하세요.</p>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={couponSendCode}
                                onChange={e => setCouponSendCode(e.target.value)}
                                className="px-3 py-2 rounded-xl border border-indigo-200 text-sm font-mono font-bold bg-white focus:outline-none focus:border-indigo-400"
                              >
                                <option value="">쿠폰 선택</option>
                                {coupons.filter(c => c.is_active).map(c => (
                                  <option key={c.id} value={c.code}>
                                    {c.code} ({c.duration_days}일{c.max_uses > 0 ? ` / ${c.used_count}/${c.max_uses}` : ''})
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={sendCouponEmail}
                                disabled={couponSending || !couponSendCode}
                                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                {couponSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                이메일 발송
                              </button>
                            </div>
                          )}
                          {couponSendMsg && (
                            <p className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-xl ${
                              couponSendMsg.type === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                            }`}>{couponSendMsg.text}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 인라인 삭제 확인 */}
                  <AnimatePresence>
                    {userDeleteConfirm === u.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-red-200">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={14} className="text-red-500 shrink-0" />
                            <p className="text-xs font-bold text-red-700">
                              <span className="font-black">{u.full_name || u.email}</span> 계정을 완전히 삭제합니다.<br />
                              <span className="font-normal text-red-500">auth.users · profiles · 관련 데이터 모두 삭제됩니다. 되돌릴 수 없습니다.</span>
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => setUserDeleteConfirm(null)}
                              className="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => deleteUser(u.id)}
                              disabled={userDeleting === u.id}
                              className="px-3 py-1.5 text-xs font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl flex items-center gap-1.5 transition-colors"
                            >
                              {userDeleting === u.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Trash2 size={12} />}
                              삭제 확인
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
        {activeTab === 'users' && !usersLoading && (
          <Pager page={page} totalPages={Math.ceil(users.length / PAGE_SIZE)} onChange={setPage} />
        )}

        {/* ── 활동 현황 ── */}
        {activeTab === 'activity' && (() => {
          const PLAN_COLOR: Record<string, string> = {
            free: 'bg-gray-100 text-gray-600',
            basic: 'bg-blue-100 text-blue-700',
            pro: 'bg-amber-100 text-amber-700',
            school: 'bg-violet-100 text-violet-700',
            admin: 'bg-emerald-100 text-emerald-700',
          };
          const fmtDate = (s: string | null) => {
            if (!s) return '—';
            const d = new Date(s);
            const diff = Date.now() - d.getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1)   return '방금';
            if (mins < 60)  return `${mins}분 전`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24)   return `${hrs}시간 전`;
            const days = Math.floor(hrs / 24);
            if (days < 7)   return `${days}일 전`;
            return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
          };

          type SortKey = 'full_name' | 'class_count' | 'student_count' | 'obs_count' | 'ai_count' | 'last_active_at' | 'last_sign_in_at';
          const sortKey = activitySort.key as SortKey;
          const sorted = [...teacherActivity].sort((a, b) => {
            const av = a[sortKey] ?? '';
            const bv = b[sortKey] ?? '';
            return activitySort.dir === 'asc'
              ? av < bv ? -1 : av > bv ? 1 : 0
              : av > bv ? -1 : av < bv ? 1 : 0;
          });

          const toggleSort = (key: SortKey) => setActivitySort(prev =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
          );

          const activeThisWeek = teacherActivity.filter(t => {
            if (!t.last_active_at) return false;
            return Date.now() - new Date(t.last_active_at).getTime() < 7 * 86400000;
          }).length;
          const activeToday = teacherActivity.filter(t => {
            if (!t.last_active_at) return false;
            return Date.now() - new Date(t.last_active_at).getTime() < 86400000;
          }).length;

          const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
            <th className="text-left px-4 py-3 text-xs font-black text-amber-700 cursor-pointer select-none whitespace-nowrap"
              onClick={() => toggleSort(k)}>
              <span className="flex items-center gap-1">
                {label}
                <ArrowUpDown size={10} className={activitySort.key === k ? 'text-amber-500' : 'text-amber-200'} />
              </span>
            </th>
          );

          return (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: '전체 선생님', value: teacherActivity.length, color: 'bg-amber-50 border-amber-100 text-amber-700' },
                  { label: '오늘 활성', value: activeToday, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                  { label: '이번 주 활성', value: activeThisWeek, color: 'bg-blue-50 border-blue-100 text-blue-700' },
                  { label: '비활성 (30일+)', value: teacherActivity.filter(t => !t.last_active_at || Date.now() - new Date(t.last_active_at).getTime() > 30 * 86400000).length, color: 'bg-gray-50 border-gray-100 text-gray-600' },
                ].map(c => (
                  <div key={c.label} className={`rounded-2xl border p-4 ${c.color}`}>
                    <p className="text-xs font-bold opacity-70 uppercase tracking-wider mb-1">{c.label}</p>
                    <p className="text-2xl font-black">{c.value}</p>
                  </div>
                ))}
              </div>

              {activityLoading
                ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
                : teacherActivity.length === 0
                  ? <div className="text-center py-20 text-amber-400"><Activity size={40} className="mx-auto mb-3 opacity-40" /><p>등록된 선생님이 없습니다</p></div>
                  : (
                    <div className="overflow-x-auto rounded-2xl border border-amber-100">
                      <table className="w-full text-sm">
                        <thead className="bg-amber-50 border-b border-amber-100">
                          <tr>
                            <SortTh label="이름" k="full_name" />
                            <th className="text-left px-4 py-3 text-xs font-black text-amber-700">플랜</th>
                            <SortTh label="학급" k="class_count" />
                            <SortTh label="학생" k="student_count" />
                            <SortTh label="관찰기록" k="obs_count" />
                            <SortTh label="AI 사용" k="ai_count" />
                            <SortTh label="마지막 로그인" k="last_sign_in_at" />
                            <SortTh label="마지막 활동" k="last_active_at" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-50">
                          {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((t, i) => {
                            const isActive = t.last_active_at && Date.now() - new Date(t.last_active_at).getTime() < 7 * 86400000;
                            return (
                              <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                className="bg-white hover:bg-amber-50/40 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-bold text-amber-900 text-sm">{t.full_name ?? '이름 없음'}</div>
                                  <div className="text-xs text-amber-400">{t.email}</div>
                                  {t.school_name && <div className="text-xs text-amber-300">{t.school_name}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PLAN_COLOR[t.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {t.plan.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-amber-700">{t.class_count}</td>
                                <td className="px-4 py-3 text-center font-bold text-blue-600">{t.student_count}</td>
                                <td className="px-4 py-3 text-center font-bold text-emerald-600">{t.obs_count}</td>
                                <td className="px-4 py-3 text-center font-bold text-violet-600">{t.ai_count}</td>
                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                  <span className="flex items-center gap-1"><LogIn size={11} className="text-gray-300" />{fmtDate(t.last_sign_in_at)}</span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {fmtDate(t.last_active_at)}
                                  </span>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
              }
              {!activityLoading && teacherActivity.length > 0 && (
                <Pager page={page} totalPages={Math.ceil(teacherActivity.length / PAGE_SIZE)} onChange={setPage} />
              )}
            </>
          );
        })()}

        {/* ── 학급 ── */}
        {activeTab === 'classes' && (
          <>
            <p className="text-sm text-amber-700 font-bold mb-5">전체 학급 {classes.length}개</p>
            {classesLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            : classes.length === 0 ? <div className="text-center py-20 text-amber-400"><BookOpen size={40} className="mx-auto mb-3 opacity-40" /><p>생성된 학급이 없습니다</p></div>
            : <div className="space-y-3">
              {classes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((cls, i) => (
                <motion.div key={cls.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl border border-amber-100 p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <BookOpen size={18} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-black text-amber-900 text-sm">{cls.name}</span>
                      {cls.subject && <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200">{cls.subject}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-amber-500">
                      <span className="flex items-center gap-1"><User size={11} />{cls.profiles?.full_name ?? '교사 미확인'}</span>
                      <span className="flex items-center gap-1"><Users size={11} />학생 {cls._studentCount}명</span>
                      <span>{new Date(cls.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                  <button onClick={() => setDeleteTarget({ table: 'classes', id: cls.id, label: `학급: ${cls.name}` })}
                    className="shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              ))}
            </div>}
            {!classesLoading && classes.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(classes.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 학생 ── */}
        {activeTab === 'students' && (
          <>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <p className="text-sm text-amber-700 font-bold">전체 학생 {students.length}명</p>
              <select value={classFilterId} onChange={e => setClassFilterId(e.target.value)}
                className="text-sm font-bold border border-amber-200 rounded-xl px-3 py-2 bg-white focus:outline-none cursor-pointer">
                {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {studentsLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            : filteredStudents.length === 0 ? <div className="text-center py-20 text-amber-400"><GraduationCap size={40} className="mx-auto mb-3 opacity-40" /><p>학생이 없습니다</p></div>
            : <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-amber-50 border-b border-amber-100">
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">번호</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">이름</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">학급</th>
                  <th className="px-5 py-3" />
                </tr></thead>
                <tbody>
                  {filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((stu, i) => (
                    <motion.tr key={stu.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="border-b border-amber-50 last:border-0 hover:bg-amber-50/40 transition-colors">
                      <td className="px-5 py-3 text-amber-500 font-mono text-xs">{stu.student_number ?? '—'}</td>
                      <td className="px-5 py-3 font-bold text-amber-900">{stu.full_name}</td>
                      <td className="px-5 py-3 text-amber-600">{stu.classes?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setDeleteTarget({ table: 'students', id: stu.id, label: `학생: ${stu.full_name}` })}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>}
            {!studentsLoading && filteredStudents.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(filteredStudents.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 관찰기록 ── */}
        {activeTab === 'observations' && (
          <>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <p className="text-sm text-amber-700 font-bold">전체 {observations.length}건</p>
              <div className="flex items-center gap-2">
                {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
                  <button key={f} onClick={() => setObsFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${obsFilter === f ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}`}>
                    {f === 'all' ? '전체' : OBS_STATUS[f]?.label}
                  </button>
                ))}
                <button onClick={exportObservations} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold hover:bg-emerald-100 transition-colors">
                  <Download size={12} /> CSV
                </button>
              </div>
            </div>
            {obsLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            : filteredObs.length === 0 ? <div className="text-center py-20 text-amber-400"><ClipboardList size={40} className="mx-auto mb-3 opacity-40" /><p>활동 기록이 없습니다</p></div>
            : <div className="space-y-3">
              {filteredObs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((obs, i) => (
                <motion.div key={obs.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl border border-amber-100 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-amber-900 text-sm">{obs.students?.full_name ?? '미확인'}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${OBS_STATUS[obs.status]?.color ?? ''}`}>{OBS_STATUS[obs.status]?.label}</span>
                        <span className="text-[10px] text-amber-400 bg-amber-50 px-2 py-0.5 rounded-full">{obs.activity_name}</span>
                      </div>
                      <p className="text-xs text-amber-600 leading-relaxed line-clamp-2">{obs.content}</p>
                      <p className="text-[11px] text-amber-400">작성: {obs.profiles?.full_name ?? '미확인'} · {new Date(obs.created_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <button onClick={() => setDeleteTarget({ table: 'observations', id: obs.id, label: `활동 기록: ${obs.students?.full_name ?? '미확인'} — ${obs.activity_name}` })}
                      className="shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
                  </div>
                </motion.div>
              ))}
            </div>}
            {!obsLoading && filteredObs.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(filteredObs.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 결과제출 ── */}
        {activeTab === 'results' && (
          <>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <p className="text-sm text-amber-700 font-bold">전체 {results.length}건</p>
              <div className="flex items-center gap-2">
                <select value={resStatusFilter} onChange={e => setResStatusFilter(e.target.value)}
                  className="text-sm font-bold border border-amber-200 rounded-xl px-3 py-2 bg-white focus:outline-none cursor-pointer">
                  <option value="all">전체 상태</option>
                  {resultStatuses.map(s => <option key={s!} value={s!}>{s}</option>)}
                </select>
                <button onClick={exportResults} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold hover:bg-emerald-100 transition-colors">
                  <Download size={12} /> CSV
                </button>
              </div>
            </div>
            {resultsLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            : filteredResults.length === 0 ? <div className="text-center py-20 text-amber-400"><FileCheck size={40} className="mx-auto mb-3 opacity-40" /><p>결과제출이 없습니다</p></div>
            : <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-amber-50 border-b border-amber-100">
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">학생</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">주차</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">상태</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-amber-700">제출일</th>
                  <th className="px-5 py-3" />
                </tr></thead>
                <tbody>
                  {filteredResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r, i) => (
                    <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="border-b border-amber-50 last:border-0 hover:bg-amber-50/40 transition-colors">
                      <td className="px-5 py-3 font-bold text-amber-900">{r.students?.full_name ?? '미확인'}</td>
                      <td className="px-5 py-3 text-amber-600">{r.week_number ? `${r.week_number}주차` : '—'}</td>
                      <td className="px-5 py-3">
                        <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">{r.status ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3 text-amber-500 text-xs">{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setDeleteTarget({ table: 'student_results', id: r.id, label: `결과제출: ${r.students?.full_name ?? '미확인'} ${r.week_number ?? ''}주차` })}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>}
            {!resultsLoading && filteredResults.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(filteredResults.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 질문·건의함 ── */}
        {activeTab === 'suggestions' && (
          <>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <p className="text-sm text-amber-700 font-bold">전체 {suggestions.length}건</p>
              <div className="flex items-center gap-2">
                {(['all', 'pending', 'replied'] as const).map(f => (
                  <button key={f} onClick={() => setSugFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${sugFilter === f ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}`}>
                    {f === 'all' ? '전체' : f === 'pending' ? '미답변' : '답변완료'}
                  </button>
                ))}
                <button onClick={exportSuggestions} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold hover:bg-emerald-100 transition-colors">
                  <Download size={12} /> CSV
                </button>
              </div>
            </div>
            {sugLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            : filteredSuggestions.length === 0 ? <div className="text-center py-20 text-amber-400"><Megaphone size={40} className="mx-auto mb-3 opacity-40" /><p>등록된 질문·건의함 내용이 없습니다</p></div>
            : <div className="space-y-3">
              {filteredSuggestions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl border border-amber-100 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-amber-900 text-sm">{s.student_name ?? '미확인'}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.teacher_reply ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {s.teacher_reply ? '답변완료' : '미답변'}
                        </span>
                      </div>
                      <p className="text-sm text-amber-800 leading-relaxed">{s.content}</p>
                      {s.teacher_reply && (
                        <div className="flex gap-2 bg-emerald-50 rounded-xl p-3">
                          <Send size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-emerald-800 leading-relaxed">{s.teacher_reply}</p>
                        </div>
                      )}
                      <p className="text-[11px] text-amber-400">{new Date(s.created_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <button onClick={() => setDeleteTarget({ table: 'student_suggestions', id: s.id, label: `질문·건의함: ${s.student_name ?? '미확인'}` })}
                      className="shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
                  </div>
                </motion.div>
              ))}
            </div>}
            {!sugLoading && filteredSuggestions.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(filteredSuggestions.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 공지사항 ── */}
        {activeTab === 'announcements' && (
          <>
            {/* 작성 폼 */}
            <div className="bg-white rounded-2xl border border-amber-100 p-6 mb-6">
              <h3 className="text-base font-black text-amber-900 flex items-center gap-2 mb-4">
                <Plus size={18} className="text-amber-500" /> 새 공지사항
              </h3>
              <div className="space-y-3">
                <input type="text" value={annTitle} onChange={e => setAnnTitle(e.target.value)}
                  placeholder="공지 제목"
                  className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold focus:outline-none focus:border-amber-400" />
                <textarea value={annContent} onChange={e => setAnnContent(e.target.value)}
                  placeholder="공지 내용을 입력하세요..."
                  rows={4}
                  className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm resize-none focus:outline-none focus:border-amber-400" />
                <button onClick={createAnnouncement} disabled={annSaving || !annTitle.trim() || !annContent.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                  {annSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 공지 발송
                </button>
              </div>
            </div>

            {/* 목록 */}
            <p className="text-sm text-amber-700 font-bold mb-4">등록된 공지사항 {announcements.length}건</p>
            {annLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-400" size={28} /></div>
            : announcements.length === 0 ? <div className="text-center py-16 text-amber-400"><Bell size={40} className="mx-auto mb-3 opacity-40" /><p>등록된 공지사항이 없습니다</p></div>
            : <div className="space-y-3">
              {announcements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((ann, i) => (
                <motion.div key={ann.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl border border-amber-100 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="font-black text-amber-900">{ann.title}</p>
                      <p className="text-sm text-amber-700 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                      <p className="text-[11px] text-amber-400">{new Date(ann.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button onClick={() => setDeleteTarget({ table: 'announcements', id: ann.id, label: `공지: ${ann.title}` })}
                      className="shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
                  </div>
                </motion.div>
              ))}
            </div>}
            {!annLoading && announcements.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(announcements.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 버그 신고 탭 ── */}
        {activeTab === 'bugs' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-amber-700 font-bold">총 {bugs.length}건</p>
              <button onClick={fetchBugs} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                <RefreshCw size={13} /> 새로고침
              </button>
            </div>
            {bugsLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            ) : bugs.length === 0 ? (
              <div className="text-center py-20 text-amber-400">
                <Bug size={40} className="mx-auto mb-3 opacity-40" />
                <p>접수된 버그 신고가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-4">
                {bugs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((bug, i) => (
                  <motion.div key={bug.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-2xl border border-amber-100 p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            bug.status === 'open'     ? 'bg-red-100 text-red-600' :
                            bug.status === 'progress' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-emerald-100 text-emerald-700'
                          }`}>
                            {bug.status === 'open' ? '🔴 접수' : bug.status === 'progress' ? '🟡 처리중' : '✅ 완료'}
                          </span>
                          <span className="text-[10px] text-amber-400">{new Date(bug.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="font-black text-amber-900">{bug.title}</p>
                        <p className="text-sm text-amber-700 mt-1 leading-relaxed">{bug.description}</p>
                        {bug.page_url && (
                          <p className="text-[10px] text-amber-400 mt-1.5 font-mono truncate">📍 {bug.page_url}</p>
                        )}
                        <p className="text-[11px] text-amber-500 mt-1">신고자: {bug.user_name || '익명'} {bug.user_email ? `(${bug.user_email})` : ''}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {bug.status !== 'progress' && (
                          <button onClick={() => updateBugStatus(bug.id, 'progress')}
                            className="px-3 py-1.5 text-[10px] font-black bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-colors">
                            처리중
                          </button>
                        )}
                        {bug.status !== 'resolved' && (
                          <button onClick={() => updateBugStatus(bug.id, 'resolved')}
                            className="px-3 py-1.5 text-[10px] font-black bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-colors">
                            완료
                          </button>
                        )}
                        {bug.status !== 'open' && (
                          <button onClick={() => updateBugStatus(bug.id, 'open')}
                            className="px-3 py-1.5 text-[10px] font-black bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 transition-colors">
                            재오픈
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            {!bugsLoading && bugs.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(bugs.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 웨이팅리스트 ──────────────────────────────────────────────────── */}
        {activeTab === 'waitlist' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-amber-700 font-bold">총 {waitlist.length}건</p>
              <button onClick={fetchWaitlist} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                <RefreshCw size={13} /> 새로고침
              </button>
            </div>
            {waitlistLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            ) : waitlist.length === 0 ? (
              <div className="text-center py-20 text-amber-400">
                <Sparkles size={40} className="mx-auto mb-3 opacity-40" />
                <p>웨이팅리스트 신청이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-4">
                {waitlist.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((w, i) => (
                  <motion.div key={w.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-2xl border border-amber-100 p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            w.notified_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {w.notified_at ? '✅ 연락완료' : '🔴 대기'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-black">
                            {WAITLIST_PLAN_LABELS[w.plan_interest] || w.plan_interest}
                          </span>
                          <span className="text-[10px] text-amber-400">{new Date(w.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="font-black text-amber-900">{w.name || '(이름 미입력)'} · {w.email}</p>
                        {w.phone && <p className="text-[11px] text-amber-500 mt-0.5">{w.phone}</p>}
                        {w.memo && <p className="text-sm text-amber-700 mt-1 leading-relaxed">{w.memo}</p>}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => toggleWaitlistNotified(w.id, !w.notified_at)}
                          className={`px-3 py-1.5 text-[10px] font-black rounded-xl transition-colors ${
                            w.notified_at ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          }`}
                        >
                          {w.notified_at ? '연락취소' : '연락완료'}
                        </button>
                        <button onClick={() => setDeleteTarget({ table: 'payment_waitlist', id: w.id, label: `웨이팅리스트: ${w.name || w.email}` })}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            {!waitlistLoading && waitlist.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(waitlist.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 교육신청 ──────────────────────────────────────────────────────── */}
        {activeTab === 'training_requests' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-amber-700 font-bold">총 {trainingRequests.length}건</p>
              <button onClick={fetchTrainingRequests} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                <RefreshCw size={13} /> 새로고침
              </button>
            </div>
            {trainingRequestsLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-amber-400" size={32} /></div>
            ) : trainingRequests.length === 0 ? (
              <div className="text-center py-20 text-amber-400">
                <GraduationCap size={40} className="mx-auto mb-3 opacity-40" />
                <p>교육 신청 내역이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-4">
                {trainingRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-2xl border border-amber-100 p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            t.notified_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {t.notified_at ? '✅ 연락완료' : '🔴 대기'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-black">
                            {TRAINING_METHOD_LABELS[t.preferred_method] || t.preferred_method}
                          </span>
                          <span className="text-[10px] text-amber-400">{new Date(t.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="font-black text-amber-900">{t.name} · {t.phone}</p>
                        {t.memo && <p className="text-sm text-amber-700 mt-1 leading-relaxed">{t.memo}</p>}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => toggleTrainingRequestNotified(t.id, !t.notified_at)}
                          className={`px-3 py-1.5 text-[10px] font-black rounded-xl transition-colors ${
                            t.notified_at ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          }`}
                        >
                          {t.notified_at ? '연락취소' : '연락완료'}
                        </button>
                        <button onClick={() => setDeleteTarget({ table: 'training_requests', id: t.id, label: `교육신청: ${t.name}` })}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            {!trainingRequestsLoading && trainingRequests.length > 0 && (
              <Pager page={page} totalPages={Math.ceil(trainingRequests.length / PAGE_SIZE)} onChange={setPage} />
            )}
          </>
        )}

        {/* ── 쿠폰 관리 ─────────────────────────────────────────────────────── */}
        {activeTab === 'coupons' && (
          <div className="space-y-6">
            {/* 쿠폰 생성 폼 */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h3 className="font-black text-blue-900 mb-4 flex items-center gap-2">
                <Ticket size={16} className="text-blue-600" /> 새 쿠폰 생성
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="코드 (예: BETA2026)"
                    value={couponForm.code}
                    onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-blue-200 text-sm font-mono font-bold bg-white focus:outline-none focus:border-blue-400 uppercase"
                  />
                  <button
                    onClick={generateCouponCode}
                    title="랜덤 코드 생성"
                    className="p-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl transition-colors"
                  >
                    <Shuffle size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-blue-700 whitespace-nowrap">기간</label>
                  <div className="flex gap-1">
                    {[7, 14, 30, 90].map(d => (
                      <button key={d}
                        onClick={() => setCouponForm(f => ({ ...f, duration_days: d }))}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                          couponForm.duration_days === d
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'
                        }`}
                      >{d}일</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-blue-700 whitespace-nowrap">최대 사용</label>
                  <input
                    type="number" min={0}
                    value={couponForm.max_uses}
                    onChange={e => setCouponForm(f => ({ ...f, max_uses: Number(e.target.value) }))}
                    className="w-24 px-3 py-2 rounded-xl border border-blue-200 text-sm bg-white focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-xs text-blue-500">(0 = 무제한)</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-blue-700 whitespace-nowrap flex items-center gap-1">
                    <Calendar size={12} /> 만료일
                  </label>
                  <input
                    type="date"
                    value={couponForm.expires_at}
                    onChange={e => setCouponForm(f => ({ ...f, expires_at: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl border border-blue-200 text-sm bg-white focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="메모 (예: 2026 여름 교사 연수 배포용)"
                    value={couponForm.note}
                    onChange={e => setCouponForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-blue-200 text-sm bg-white focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              {couponMsg && (
                <p className="mt-2 text-xs font-bold text-red-600 bg-red-50 px-3 py-2 rounded-xl">{couponMsg}</p>
              )}
              <button
                onClick={createCoupon}
                disabled={couponSaving}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-black rounded-xl transition-colors disabled:opacity-50"
              >
                {couponSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                쿠폰 생성
              </button>
            </div>

            {/* 쿠폰 목록 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-amber-700">총 {coupons.length}개 쿠폰</p>
                <button onClick={fetchCoupons} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                  <RefreshCw size={13} /> 새로고침
                </button>
              </div>
              {couponsLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-400" size={28} /></div>
              ) : coupons.length === 0 ? (
                <div className="text-center py-16 text-amber-400">
                  <Ticket size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">생성된 쿠폰이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {coupons.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(c => {
                    const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                    const isFull = c.max_uses > 0 && c.used_count >= c.max_uses;
                    return (
                      <div key={c.id} className={`bg-white rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${!c.is_active ? 'opacity-50' : ''} ${isExpired || isFull ? 'border-red-200 bg-red-50/20' : 'border-amber-100'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono font-black text-blue-800 text-base tracking-widest">{c.code}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{c.duration_days}일</span>
                            {isExpired && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">만료됨</span>}
                            {isFull && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">소진됨</span>}
                            {!c.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">비활성</span>}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>사용 {c.used_count} / {c.max_uses === 0 ? '∞' : c.max_uses}</span>
                            {c.expires_at && <span className="flex items-center gap-1"><Calendar size={10} />{new Date(c.expires_at).toLocaleDateString('ko-KR')}</span>}
                            {c.note && <span className="text-gray-400 truncate">{c.note}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => toggleCoupon(c.id, c.is_active)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                              c.is_active
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {c.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            {c.is_active ? '활성' : '비활성'}
                          </button>
                          <button
                            onClick={() => deleteCoupon(c.id)}
                            className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            title="쿠폰 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!couponsLoading && coupons.length > 0 && (
                <Pager page={page} totalPages={Math.ceil(coupons.length / PAGE_SIZE)} onChange={setPage} />
              )}
            </div>
          </div>
        )}

        {/* ── 환불 계산기 ────────────────────────────────────────────────────── */}
        {activeTab === 'refund_calc' && (() => {
          const r = calcRefund(refundForm.startDate, refundForm.periodMonths, refundForm.amount, refundForm.cancelDate);
          return (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                <h3 className="font-black text-blue-900 mb-1 flex items-center gap-2">
                  <Calculator size={16} className="text-blue-600" /> 해지 환불액 계산기
                </h3>
                <p className="text-xs text-blue-700/70 mb-4">
                  결제 후 7일 이내면 전액 환불, 이후는 잔여 기간을 일할 계산합니다. (10원 단위 반올림)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-blue-700 block mb-1">결제일</label>
                    <input
                      type="date"
                      value={refundForm.startDate}
                      onChange={e => setRefundForm(f => ({ ...f, startDate: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm bg-white focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-blue-700 block mb-1">결제 기간</label>
                    <div className="flex gap-1">
                      {[3, 6, 12].map(m => (
                        <button key={m}
                          onClick={() => setRefundForm(f => ({ ...f, periodMonths: m }))}
                          className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                            refundForm.periodMonths === m
                              ? 'bg-blue-500 text-white'
                              : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'
                          }`}
                        >{m}개월</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-blue-700 block mb-1">결제 금액 (원)</label>
                    <input
                      type="number" min={0}
                      value={refundForm.amount}
                      onChange={e => setRefundForm(f => ({ ...f, amount: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm bg-white focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-blue-700 block mb-1">해지 요청일</label>
                    <input
                      type="date"
                      value={refundForm.cancelDate}
                      onChange={e => setRefundForm(f => ({ ...f, cancelDate: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm bg-white focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                {!r.valid ? (
                  <p className="mt-4 text-xs font-bold text-red-600 bg-red-50 px-3 py-2 rounded-xl">
                    해지 요청일이 결제일보다 빠릅니다. 날짜를 확인해 주세요.
                  </p>
                ) : (
                  <div className="mt-5 bg-white rounded-2xl border border-blue-200 p-5">
                    <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                      <div>
                        <p className="text-[11px] font-bold text-blue-400">총 기간</p>
                        <p className="text-sm font-black text-blue-900">{r.totalDays}일</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-blue-400">사용 기간</p>
                        <p className="text-sm font-black text-blue-900">{r.usedDays}일</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-blue-400">잔여 기간</p>
                        <p className="text-sm font-black text-blue-900">{r.remainingDays}일</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-blue-100">
                      <span className="text-xs font-bold text-blue-700">
                        {r.fullRefund ? '7일 이내 전액 환불 대상' : r.refund === 0 ? '환불 대상 아님 (기간 만료)' : '일할 계산 환불액'}
                      </span>
                      <span className="text-2xl font-black text-blue-900">{r.refund.toLocaleString()}원</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── AI 비용 ────────────────────────────────────────────────────────── */}
        {activeTab === 'ai_cost' && (
          <div className="space-y-6">
            {/* 뷰 전환 */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(['daily', 'weekly', 'monthly'] as AiCostView[]).map(v => (
                  <button key={v}
                    onClick={() => { setAiCostView(v); fetchAiCost(v); }}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                      aiCostView === v
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    {v === 'daily' ? '일별 (7일)' : v === 'weekly' ? '주별 (8주)' : '월별 (6개월)'}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchAiCost(aiCostView)}
                className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {aiCostLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-emerald-400" size={32} />
              </div>
            ) : (
              <>
                {/* 요약 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl p-5 bg-emerald-50 border border-emerald-100 col-span-2 sm:col-span-1">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">기간 합계</p>
                    <p className="text-3xl font-black text-emerald-900">
                      ${aiTotalUsd.toFixed(4)}
                    </p>
                    <p className="text-xs text-emerald-500 mt-1">
                      ≈ ₩{Math.round(aiTotalUsd * 1380).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl p-5 bg-blue-50 border border-blue-100">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">총 호출 수</p>
                    <p className="text-3xl font-black text-blue-900">
                      {aiCostRows.reduce((s, r) => s + r.call_count, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-blue-400 mt-1">API calls</p>
                  </div>
                  <div className="rounded-2xl p-5 bg-violet-50 border border-violet-100">
                    <p className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-1">평균 단가</p>
                    <p className="text-3xl font-black text-violet-900">
                      ${aiCostRows.reduce((s, r) => s + r.call_count, 0) > 0
                        ? (aiTotalUsd / aiCostRows.reduce((s, r) => s + r.call_count, 0)).toFixed(5)
                        : '0.00000'}
                    </p>
                    <p className="text-xs text-violet-400 mt-1">per call</p>
                  </div>
                </div>

                {/* 기간별 막대 차트 */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-5">
                    <TrendingUp size={16} className="text-emerald-500" />
                    {aiCostView === 'daily' ? '일별' : aiCostView === 'weekly' ? '주별' : '월별'} 비용 추이
                  </h3>
                  {aiCostRows.length === 0 || aiTotalUsd === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">아직 수집된 데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const maxCost = Math.max(...aiCostRows.map(r => r.cost_usd), 0.000001);
                        return aiCostRows.map(r => {
                          const pct = (r.cost_usd / maxCost) * 100;
                          const label = aiCostView === 'daily'
                            ? r.period.slice(5)
                            : aiCostView === 'weekly'
                            ? `${r.period.slice(5)} ~`
                            : r.period;
                          return (
                            <div key={r.period} className="flex items-center gap-3">
                              <span className="text-xs font-mono text-gray-500 w-16 shrink-0 text-right">{label}</span>
                              <div className="flex-1 h-6 bg-gray-50 rounded-lg overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-lg transition-all duration-500 flex items-center"
                                  style={{ width: `${Math.max(pct, r.cost_usd > 0 ? 2 : 0)}%` }}
                                />
                              </div>
                              <span className="text-xs font-black text-emerald-700 w-24 shrink-0 text-right">
                                ${r.cost_usd.toFixed(4)}
                              </span>
                              <span className="text-xs text-gray-400 w-14 shrink-0 text-right">{r.call_count}회</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* 요금제 크레딧 소진 현황 */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-1">
                    <AlertTriangle size={16} className="text-orange-500" />
                    요금제 크레딧 소진 현황 (이번 달)
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">
                    basic $2 / pro $6 예산 대비 실시간 소진율 · 100% 이상은 flash로 자동 전환, 300% 이상은 하드블록
                  </p>
                  {aiCreditLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="animate-spin text-orange-400" size={24} />
                    </div>
                  ) : aiCreditRows.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">이번 달 크레딧을 사용한 basic/pro 유저가 없습니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-2 pr-4 font-bold text-gray-500">이름</th>
                            <th className="text-left py-2 pr-4 font-bold text-gray-500">이메일</th>
                            <th className="text-left py-2 pr-4 font-bold text-gray-500">플랜</th>
                            <th className="text-right py-2 pr-4 font-bold text-gray-500">사용액 / 예산</th>
                            <th className="text-left py-2 pr-4 font-bold text-gray-500 w-32">소진율</th>
                            <th className="text-left py-2 font-bold text-gray-500">상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiCreditRows.map(r => {
                            const barPct = Math.min(r.pct, 100);
                            const status = r.pct >= 300
                              ? { label: '하드블록', color: 'text-red-700 bg-red-50', bar: 'bg-red-500', icon: <XCircle size={12} /> }
                              : r.pct >= 100
                              ? { label: 'flash 전환됨', color: 'text-amber-700 bg-amber-50', bar: 'bg-amber-500', icon: <Zap size={12} /> }
                              : { label: '정상', color: 'text-emerald-700 bg-emerald-50', bar: 'bg-emerald-500', icon: <CheckCircle2 size={12} /> };
                            return (
                              <tr key={r.user_id} className="border-b border-gray-50">
                                <td className="py-2.5 pr-4 font-bold text-gray-800">{r.full_name || '이름 없음'}</td>
                                <td className="py-2.5 pr-4 font-mono text-gray-500 text-[10px]">{r.email || r.user_id.slice(0, 8) + '…'}</td>
                                <td className="py-2.5 pr-4 text-gray-600">{r.plan === 'pro' ? 'Pro' : 'Basic'}</td>
                                <td className="py-2.5 pr-4 text-right font-black text-gray-700">
                                  ${r.cost_usd.toFixed(3)} / ${r.budget_usd}
                                </td>
                                <td className="py-2.5 pr-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${barPct}%` }} />
                                    </div>
                                    <span className="font-black text-gray-600">{r.pct.toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="py-2.5">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${status.color}`}>
                                    {status.icon}{status.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 유저별 비용 */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-4">
                    <Users size={16} className="text-blue-500" />
                    유저별 AI 비용
                  </h3>
                  {aiUserRows.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">데이터 없음</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-2 pr-4 font-bold text-gray-500 w-6">#</th>
                            <th className="text-left py-2 pr-4 font-bold text-gray-500">이름</th>
                            <th className="text-left py-2 pr-4 font-bold text-gray-500">이메일</th>
                            <th className="text-right py-2 pr-4 font-bold text-gray-500">호출 수</th>
                            <th className="text-right py-2 font-bold text-gray-500">비용 (USD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiUserRows.slice(aiUserPage * 10, aiUserPage * 10 + 10).map((r, i) => {
                            const globalIdx = aiUserPage * 10 + i;
                            const maxCost = aiUserRows[0]?.cost_usd ?? 0.000001;
                            const pct = (r.cost_usd / maxCost) * 100;
                            return (
                              <tr
                                key={r.user_id}
                                className="border-b border-gray-50 hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                onClick={() => openAiDetail({ user_id: r.user_id, user_name: r.full_name || r.email || r.user_id.slice(0, 8) })}
                              >
                                <td className="py-2.5 pr-4">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                                    globalIdx === 0 ? 'bg-amber-400 text-white' :
                                    globalIdx === 1 ? 'bg-gray-300 text-white' :
                                    globalIdx === 2 ? 'bg-amber-700 text-white' :
                                    'bg-gray-100 text-gray-500'
                                  }`}>{globalIdx + 1}</span>
                                </td>
                                <td className="py-2.5 pr-4 font-bold text-gray-800">
                                  <span className="group-hover:text-blue-700 transition-colors flex items-center gap-1">
                                    {r.full_name || r.email || '이름 없음'}
                                    <ChevronRight size={12} className="text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4 font-mono text-gray-500 text-[10px]">
                                  {r.email || r.user_id.slice(0, 8) + '…'}
                                </td>
                                <td className="py-2.5 pr-4 text-right text-gray-600 font-bold">
                                  {r.call_count.toLocaleString()}회
                                </td>
                                <td className="py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-20 h-1.5 bg-blue-50 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="font-black text-blue-700 w-20 text-right">
                                      ${r.cost_usd.toFixed(4)}
                                    </span>
                                    <span className="text-gray-400 w-16 text-right">
                                      ≈ ₩{Math.round(r.cost_usd * 1380).toLocaleString()}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200">
                            <td colSpan={3} className="pt-3 text-xs font-black text-gray-600">합계</td>
                            <td className="pt-3 text-right font-black text-gray-700">
                              {aiUserRows.reduce((s, r) => s + r.call_count, 0).toLocaleString()}회
                            </td>
                            <td className="pt-3 text-right">
                              <span className="font-black text-blue-700">${aiTotalUsd.toFixed(4)}</span>
                              <span className="text-gray-400 ml-2">≈ ₩{Math.round(aiTotalUsd * 1380).toLocaleString()}</span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                      {aiUserRows.length > 10 && (
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                          <span className="text-xs text-gray-400">
                            {aiUserPage * 10 + 1}–{Math.min(aiUserPage * 10 + 10, aiUserRows.length)} / 총 {aiUserRows.length}명
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={aiUserPage === 0}
                              onClick={() => setAiUserPage(p => p - 1)}
                              className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            >이전</button>
                            <button
                              disabled={(aiUserPage + 1) * 10 >= aiUserRows.length}
                              onClick={() => setAiUserPage(p => p + 1)}
                              className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            >다음</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 기능별 분석 */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-4">
                      <Layers size={16} className="text-amber-500" />
                      기능별 비용
                    </h3>
                    {aiFeatureRows.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">데이터 없음</p>
                    ) : (
                      <div className="space-y-2.5">
                        {(() => {
                          const maxCost = Math.max(...aiFeatureRows.map(r => r.cost_usd), 0.000001);
                          return aiFeatureRows.map(r => (
                            <div
                              key={r.feature_name}
                              className="cursor-pointer group rounded-xl p-2 -mx-2 hover:bg-amber-50 transition-colors"
                              onClick={() => openAiDetail({
                                feature_name: r.feature_name,
                                feature_label: FEATURE_LABELS[r.feature_name] ?? r.feature_name,
                              })}
                            >
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold text-gray-700 group-hover:text-amber-800 flex items-center gap-1 transition-colors">
                                  {FEATURE_LABELS[r.feature_name] ?? r.feature_name}
                                  <ChevronRight size={12} className="text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </span>
                                <span className="font-black text-amber-700">
                                  ${r.cost_usd.toFixed(4)} <span className="text-gray-400 font-normal">({r.call_count}회)</span>
                                </span>
                              </div>
                              <div className="h-2 bg-amber-50 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-400 rounded-full"
                                  style={{ width: `${(r.cost_usd / maxCost) * 100}%` }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>

                  {/* 모델별 분석 */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-4">
                      <Cpu size={16} className="text-violet-500" />
                      모델별 사용량
                    </h3>
                    {aiModelRows.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">데이터 없음</p>
                    ) : (
                      <div className="space-y-4">
                        {aiModelRows.map(r => (
                          <div key={r.model_name} className="rounded-xl bg-gray-50 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-black text-gray-800">{r.model_name}</span>
                              <span className="text-sm font-black text-violet-700">${r.cost_usd.toFixed(4)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                              <span>호출 횟수</span>
                              <span className="font-bold text-right text-gray-700">{r.call_count.toLocaleString()}회</span>
                              <span>입력 토큰</span>
                              <span className="font-bold text-right text-blue-600">{r.input_tokens.toLocaleString()}</span>
                              <span>출력 토큰</span>
                              <span className="font-bold text-right text-emerald-600">{r.output_tokens.toLocaleString()}</span>
                              <span>추론 토큰</span>
                              <span className="font-bold text-right text-violet-600">{r.thinking_tokens.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 text-center pt-1">
                          단가: Flash $0.30/$2.50/$3.50 · Pro $1.25/$10/$3.50 (per 1M tokens)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 영상 가이드 관리 ──────────────────────────────────────────────── */}
        {activeTab === 'video_guides' && (
          <VideoGuidesTab />
        )}

      </div>
    </div>

    {/* AI 상세 사용 내역 모달 */}
    <AnimatePresence>
      {aiDetailModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setAiDetailModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                  {aiDetailModal.user_name && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-black">
                      {aiDetailModal.user_name}
                    </span>
                  )}
                  {aiDetailModal.feature_label && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-black">
                      {aiDetailModal.feature_label}
                    </span>
                  )}
                  <span className="text-gray-600 font-bold">상세 AI 사용 내역</span>
                </h2>
                {!aiDetailLoading && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    총 {aiDetailLogs.length}건 ·{' '}
                    ${aiDetailLogs.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(4)} USD
                    {' '}≈ ₩{Math.round(aiDetailLogs.reduce((s, r) => s + (r.cost_usd ?? 0), 0) * 1380).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => setAiDetailModal(null)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="flex-1 overflow-y-auto">
              {aiDetailLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="animate-spin text-blue-400" size={28} />
                </div>
              ) : aiDetailLogs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <DollarSign size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">선택한 기간에 사용 내역이 없습니다.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold text-gray-500 whitespace-nowrap">일시</th>
                      {aiDetailModal.user_id && !aiDetailModal.feature_name && (
                        <th className="text-left px-4 py-3 font-bold text-gray-500 whitespace-nowrap">기능</th>
                      )}
                      {aiDetailModal.feature_name && !aiDetailModal.user_id && (
                        <th className="text-left px-4 py-3 font-bold text-gray-500 whitespace-nowrap">사용자</th>
                      )}
                      <th className="text-left px-4 py-3 font-bold text-gray-500 whitespace-nowrap">모델</th>
                      <th className="text-right px-4 py-3 font-bold text-gray-500 whitespace-nowrap">입력</th>
                      <th className="text-right px-4 py-3 font-bold text-gray-500 whitespace-nowrap">출력</th>
                      <th className="text-right px-4 py-3 font-bold text-gray-500 whitespace-nowrap">추론</th>
                      <th className="text-right px-4 py-3 font-bold text-gray-500 whitespace-nowrap">비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiDetailLogs.map((log, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-[10px]">
                          {new Date(log.created_at).toLocaleString('ko-KR', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        {aiDetailModal.user_id && !aiDetailModal.feature_name && (
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-bold text-[10px]">
                              {FEATURE_LABELS[log.feature_name ?? ''] ?? log.feature_name ?? '-'}
                            </span>
                          </td>
                        )}
                        {aiDetailModal.feature_name && !aiDetailModal.user_id && (
                          <td className="px-4 py-3 font-bold text-gray-700">
                            {log._user_name ?? '-'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-500 font-mono text-[10px] max-w-[140px] truncate">
                          {log.model_name ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600 font-bold">
                          {(log.input_tokens ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-bold">
                          {(log.output_tokens ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-violet-500 font-bold">
                          {(log.thinking_tokens ?? 0) > 0 ? (log.thinking_tokens ?? 0).toLocaleString() : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-gray-800 whitespace-nowrap">
                          ${(log.cost_usd ?? 0).toFixed(5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white border-t-2 border-gray-200">
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-3 font-black text-gray-700 text-xs"
                      >
                        합계 ({aiDetailLogs.length}건)
                      </td>
                      <td className="px-4 py-3 text-right font-black text-gray-800 whitespace-nowrap">
                        ${aiDetailLogs.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(5)}
                        <span className="text-gray-400 font-normal ml-1 text-[10px]">
                          ≈ ₩{Math.round(aiDetailLogs.reduce((s, r) => s + (r.cost_usd ?? 0), 0) * 1380).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* 승인 진행 오버레이 */}

    <AnimatePresence>
      {approvalProgress && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-8 right-8 z-[200] w-80 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden bg-white"
        >
          {/* 헤더 */}
          <div className={`px-5 py-3.5 flex items-center gap-2.5 ${
            approvalProgress.step === 'error' ? 'bg-red-500' :
            approvalProgress.step === 'done'  ? 'bg-emerald-500' : 'bg-amber-500'
          }`}>
            {approvalProgress.step === 'done' ? (
              <CheckCircle2 size={16} className="text-white" />
            ) : approvalProgress.step === 'error' ? (
              <XCircle size={16} className="text-white" />
            ) : (
              <Loader2 size={16} className="text-white animate-spin" />
            )}
            <p className="text-white font-black text-sm">
              {approvalProgress.step === 'done'  ? '승인 완료!' :
               approvalProgress.step === 'error' ? '오류 발생' : '승인 처리 중...'}
            </p>
          </div>

          {/* 스텝 목록 */}
          <div className="px-5 py-4 space-y-3">
            {/* Step 1: DB */}
            <div className="flex items-center gap-3">
              {approvalProgress.step === 'db' ? (
                <Loader2 size={15} className="text-amber-500 animate-spin shrink-0" />
              ) : (
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              )}
              <div>
                <p className={`text-xs font-bold ${approvalProgress.step === 'db' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  신청 DB 승인
                </p>
              </div>
            </div>

            {/* Step 2: Email */}
            <div className="flex items-center gap-3">
              {approvalProgress.step === 'db' ? (
                <div className="w-[15px] h-[15px] rounded-full border-2 border-gray-200 shrink-0" />
              ) : approvalProgress.step === 'email' ? (
                <Loader2 size={15} className="text-amber-500 animate-spin shrink-0" />
              ) : approvalProgress.step === 'error' ? (
                <XCircle size={15} className="text-red-400 shrink-0" />
              ) : (
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              )}
              <div>
                <p className={`text-xs font-bold ${
                  approvalProgress.step === 'db'    ? 'text-gray-300' :
                  approvalProgress.step === 'email' ? 'text-amber-600' :
                  approvalProgress.step === 'error' ? 'text-red-400' : 'text-emerald-600'
                }`}>
                  {approvalProgress.step === 'email' ? '승인 이메일 발송 중...' : '승인 이메일 발송'}
                </p>
              </div>
            </div>

            {/* 대상자 정보 */}
            <div className="pt-2 border-t border-gray-100 space-y-0.5">
              <p className="text-xs font-black text-gray-700">{approvalProgress.name} 선생님</p>
              <p className="text-[11px] text-gray-400 font-mono">{approvalProgress.email}</p>
              {approvalProgress.message && (
                <p className={`text-[11px] font-bold mt-1 ${
                  approvalProgress.step === 'error' ? 'text-red-500' : 'text-amber-600'
                }`}>{approvalProgress.message}</p>
              )}
            </div>

            {approvalProgress.step === 'error' && (
              <button
                onClick={() => setApprovalProgress(null)}
                className="w-full py-2 text-xs font-bold text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
              >
                닫기
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
};

// ── 영상 가이드 관리 탭 ────────────────────────────────────────────────────────

interface VideoGuideRow {
  id: string;
  title: string;
  description: string | null;
  url: string;
  category: string;
  order_num: number;
  is_active: boolean;
  created_at: string;
}

function VideoGuidesTab() {
  const [videos, setVideos] = useState<VideoGuideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', url: '', category: '시작하기' });
  const [error, setError] = useState<string | null>(null);

  const CATEGORIES = ['시작하기', '클래스룸', 'AI 기능', '수업 도구', '기타'];

  const fetchVideos = async () => {
    setLoading(true);
    const { data } = await supabase.from('video_guides').select('*').order('category').order('order_num');
    setVideos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchVideos(); }, []);

  const handleAdd = async () => {
    if (!form.title.trim() || !form.url.trim()) { setError('제목과 URL은 필수입니다.'); return; }
    setSaving(true);
    setError(null);
    const catVideos = videos.filter(v => v.category === form.category);
    const nextOrder = catVideos.length > 0 ? Math.max(...catVideos.map(v => v.order_num)) + 1 : 1;
    const { error: err } = await supabase.from('video_guides').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      url: form.url.trim(),
      category: form.category,
      order_num: nextOrder,
      is_active: true,
    });
    if (err) { setError(err.message); } else {
      setForm({ title: '', description: '', url: '', category: '시작하기' });
      await fetchVideos();
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, current: boolean) => {
    await supabase.from('video_guides').update({ is_active: !current }).eq('id', id);
    setVideos(prev => prev.map(v => v.id === id ? { ...v, is_active: !current } : v));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('video_guides').delete().eq('id', id);
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const video = videos.find(v => v.id === id);
    if (!video) return;

    const sameCat = [...videos]
      .filter(v => v.category === video.category)
      .sort((a, b) => a.order_num - b.order_num);

    const idx = sameCat.findIndex(v => v.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameCat.length) return;

    const aOrder = sameCat[idx].order_num;
    const bOrder = sameCat[swapIdx].order_num;
    const aId = sameCat[idx].id;
    const bId = sameCat[swapIdx].id;

    setVideos(prev => prev.map(v => {
      if (v.id === aId) return { ...v, order_num: bOrder };
      if (v.id === bId) return { ...v, order_num: aOrder };
      return v;
    }));

    setReordering(true);
    await Promise.all([
      supabase.from('video_guides').update({ order_num: bOrder }).eq('id', aId),
      supabase.from('video_guides').update({ order_num: aOrder }).eq('id', bId),
    ]);
    setReordering(false);
  };

  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    items: [...videos]
      .filter(v => v.category === cat)
      .sort((a, b) => a.order_num - b.order_num),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* 추가 폼 */}
      <div className="bg-white rounded-2xl border border-on-surface/8 p-5 shadow-sm space-y-4">
        <h3 className="font-black text-sm text-on-surface flex items-center gap-2">
          <Plus size={16} className="text-primary" /> 영상 추가
        </h3>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
            <AlertTriangle size={14} /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="제목 *"
            className="px-3 py-2.5 rounded-xl border border-on-surface/10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
            className="px-3 py-2.5 rounded-xl border border-on-surface/10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={form.url}
            onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
            placeholder="YouTube URL 또는 구글 드라이브 링크 *"
            className="px-3 py-2.5 rounded-xl border border-on-surface/10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 sm:col-span-2"
          />
          <input
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="설명 (선택)"
            className="px-3 py-2.5 rounded-xl border border-on-surface/10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 sm:col-span-2"
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 transition-all"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          추가
        </button>
      </div>

      {/* 목록 — 카테고리별 그룹 */}
      <div className="bg-white rounded-2xl border border-on-surface/8 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-on-surface/5 flex items-center justify-between">
          <h3 className="font-black text-sm text-on-surface flex items-center gap-2">
            등록된 영상 ({videos.length}개)
            {reordering && <Loader2 size={13} className="animate-spin text-primary/50" />}
          </h3>
          <button onClick={fetchVideos} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary/40" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant text-sm">
            등록된 영상이 없습니다
          </div>
        ) : (
          <div>
            {grouped.map(({ category, items }) => (
              <div key={category}>
                <div className="px-5 py-2 bg-surface-container/40 border-y border-on-surface/5 flex items-center gap-2">
                  <span className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider">{category}</span>
                  <span className="text-[10px] text-on-surface-variant/50">{items.length}개</span>
                </div>
                <div className="divide-y divide-on-surface/5">
                  {items.map((v, idx) => (
                    <div key={v.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-container/20 ${!v.is_active ? 'opacity-40' : ''}`}>
                      {/* 순서 이동 버튼 */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          onClick={() => handleMove(v.id, 'up')}
                          disabled={idx === 0 || reordering}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-on-surface-variant/40 hover:text-primary hover:bg-primary/8 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => handleMove(v.id, 'down')}
                          disabled={idx === items.length - 1 || reordering}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-on-surface-variant/40 hover:text-primary hover:bg-primary/8 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronDown size={13} />
                        </button>
                      </div>

                      {/* 순서 번호 */}
                      <span className="text-[11px] font-black text-on-surface-variant/30 w-5 text-center shrink-0">
                        {idx + 1}
                      </span>

                      {/* 영상 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface">{v.title}</p>
                        {v.description && <p className="text-xs text-on-surface-variant/60 mt-0.5">{v.description}</p>}
                        <p className="text-xs text-primary/50 mt-0.5 truncate font-mono">{v.url}</p>
                      </div>

                      {/* 액션 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggle(v.id, v.is_active)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-colors ${
                            v.is_active
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {v.is_active ? '공개' : '숨김'}
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;
