import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, isAnonymousUser } from './lib/auth';
import { supabase } from './lib/supabase';
import { TimerProvider } from './lib/timerContext';
import { ClassAlarmProvider } from './lib/classAlarmContext';
import FloatingClassAlarm from './components/FloatingClassAlarm';
import ReferralNotice from './components/ui/ReferralNotice';

// Supabase가 redirect_to 미허용 시 루트(/)로 fallback하는 경우 대응
// 초대·복구 링크만 /set-password로 즉시 리다이렉트 (구글 OAuth 로그인도 해시에
// access_token을 실어 돌아올 수 있어, type=invite/recovery로 좁혀서 구분)
if (
  typeof window !== 'undefined' &&
  window.location.pathname === '/' &&
  window.location.hash.includes('access_token') &&
  (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery'))
) {
  window.history.replaceState({}, '', '/set-password' + window.location.hash);
}
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import IdeaRecord from './pages/IdeaRecord';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Admin from './pages/Admin';
import Classroom from './pages/Classroom';
import AIAssistant from './pages/AIAssistant';
import ActivityLog from './pages/ActivityLog';
import Settings from './pages/Settings';
import Export from './pages/Export';
import ClassroomEntry from './pages/ClassroomEntry';
import StudentLog from './pages/StudentLog';
import Archive from './pages/Archive';
import StudentView from './pages/StudentView';
import TeachingTools from './pages/TeachingTools';
import Whiteboard from './pages/tools/Whiteboard';
import StudentBoardViewer from './pages/tools/StudentBoardViewer';
import StudentJoin from './pages/tools/StudentJoin';
import SuggestionsPage from './pages/SuggestionsPage';
import QuizStudentView from './pages/QuizStudentView';
import ClassBoard from './pages/ClassBoard';
import ShareClassView from './pages/ShareClassView';
import SchoolShareView from './pages/SchoolShareView';
import SchoolProjectShareView from './pages/SchoolProjectShareView';
import ParentReportShareView from './pages/ParentReportShareView';
import SetPassword from './pages/SetPassword';
import SurveyStudent from './pages/tools/SurveyStudent';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Waitlist from './pages/Waitlist';
import Gallery from './pages/Gallery';
import VideoGuide from './pages/VideoGuide';
import Pricing from './pages/Pricing';
import SchoolIntroPage from './pages/SchoolIntroPage';
import Demo from './pages/Demo';
import InstallPromptBanner from './components/InstallPromptBanner';
import DemoTourOverlay from './components/DemoTourOverlay';
import DemoSpotlightTour from './components/DemoSpotlightTour';

// 선생님 전용 라우트 가드
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, profile } = useAuth();
  const isAnon = !loading && isAnonymousUser(user);

  // 익명 세션이 보호된 경로에 접근하면 즉시 파기 (방어 2중화)
  useEffect(() => {
    if (isAnon) supabase.auth.signOut();
  }, [isAnon]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-on-surface-variant font-manrope">인증 상태 확인 중...</p>
        </div>
      </div>
    );
  }

  // 미로그인 → 선생님 로그인 화면
  if (!user) return <Navigate to="/login" replace />;

  // 익명 유저(학생) → 학생 홈으로 (이중 감지: is_anonymous + app_metadata.provider)
  if (isAnonymousUser(user)) return <Navigate to="/student-log" replace />;

  // 프로필 없음 = 삭제된 계정 → 로그인으로 (auth.tsx에서 signOut 처리, 여기선 리다이렉트 방어)
  if (profile === null) return <Navigate to="/login" replace />;

  // 승인 취소된 계정 차단
  if (profile.is_approved === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5] px-4">
        <div className="max-w-md w-full text-center space-y-6 p-10 bg-white rounded-3xl shadow-xl border border-amber-100">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-3xl">🔒</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-amber-900">접근이 제한되었습니다</h2>
            <p className="text-sm text-amber-700 leading-relaxed">
              계정 승인이 취소되었습니다.<br />
              관리자에게 문의해 주세요.
            </p>
          </div>
          <a
            href="mailto:aklabs84@naver.com?subject=클래스로그 계정 문의"
            className="inline-block px-6 py-3 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors"
          >
            관리자에게 문의하기
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// 화이트보드 전용: 익명(학생) + 인증(선생님) 모두 허용, 완전 미로그인만 /wb-join으로
const WhiteboardRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-on-surface-variant font-manrope">인증 상태 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/wb-join" replace />;
  }

  return <>{children}</>;
};

// 루트 경로: 로그인 상태면 /dashboard, 아니면 랜딩
const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-on-surface-variant font-manrope">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 익명 유저(학생)는 미로그인으로 취급 — 선생님만 대시보드로
  if (user && !isAnonymousUser(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Landing />;
};

const Help = () => <div className="p-10 font-manrope text-2xl font-bold">Help Center (Coming Soon)</div>;

const IdleWarningModal = () => {
  const { showIdleWarning, idleSecondsLeft, dismissIdleWarning, signOut } = useAuth();
  if (!showIdleWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center space-y-5">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-gray-900 font-manrope">자리를 비우셨나요?</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            30분간 활동이 없어<br />
            보안을 위해 자동 로그아웃됩니다.
          </p>
        </div>
        <div className="text-4xl font-black text-amber-500 font-manrope tabular-nums">
          {idleSecondsLeft}초
        </div>
        <div className="flex gap-3">
          <button
            onClick={signOut}
            className="flex-1 py-3 text-sm font-bold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            로그아웃
          </button>
          <button
            onClick={dismissIdleWarning}
            className="flex-1 py-3 text-sm font-bold text-white bg-primary rounded-xl hover:opacity-90 transition-opacity"
          >
            계속 사용하기
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <TimerProvider>
      <ClassAlarmProvider>
      <IdleWarningModal />
      <ReferralNotice />
      <InstallPromptBanner />
      <div className="relative min-h-screen bg-surface">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
          <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-accent/5 rounded-full blur-[100px]" />
        </div>

        <BrowserRouter>
          <FloatingClassAlarm />
          <DemoTourOverlay />
          <DemoSpotlightTour />
          <div className="relative z-10">
            <Routes>
              {/* 공개 라우트 */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="/classroom-entry" element={<ClassroomEntry />} />
              <Route path="/student-log" element={<StudentLog />} />
              <Route path="/quiz/:pin" element={<QuizStudentView />} />
              <Route path="/quiz" element={<QuizStudentView />} />
              <Route path="/survey/:pin" element={<SurveyStudent />} />
              <Route path="/survey" element={<SurveyStudent />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/video-guide" element={<VideoGuide />} />
              <Route path="/sb/:boardId" element={<StudentBoardViewer />} />
              <Route path="/wb-join" element={<StudentJoin />} />
              <Route path="/share/:classId" element={<ShareClassView />} />
              <Route path="/school-share/:schoolId" element={<SchoolShareView />} />
              <Route path="/school-project/:shareToken" element={<SchoolProjectShareView />} />
              <Route path="/report/:shareToken" element={<ParentReportShareView />} />
              <Route path="/school-intro" element={<SchoolIntroPage />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/waitlist" element={<Waitlist />} />

              {/* 관리자 라우트 */}
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />

              {/* 보드 */}
              <Route path="/board/:classId" element={<ProtectedRoute><ClassBoard /></ProtectedRoute>} />

              {/* 화이트보드 (전체 화면, 레이아웃 없음) — 익명(학생)+인증(선생님) 모두 허용 */}
              <Route path="/whiteboard/:boardId" element={<WhiteboardRoute><Whiteboard /></WhiteboardRoute>} />

              {/* 보호된 레이아웃 라우트 (/dashboard 아래) */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<IdeaRecord />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="classes" element={<Dashboard />} />
                <Route path="classroom" element={<Classroom />} />
                <Route path="student-view/:id" element={<StudentView />} />
                <Route path="ai-assistant" element={<AIAssistant />} />
                <Route path="export" element={<Export />} />
                <Route path="archive" element={<Archive />} />
                <Route path="activity-log" element={<ActivityLog />} />
                <Route path="teaching-tools" element={<TeachingTools />} />
                <Route path="gallery" element={<Gallery />} />
                <Route path="suggestions" element={<SuggestionsPage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="help" element={<Help />} />
                <Route path="pricing" element={<Pricing />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </div>
      </ClassAlarmProvider>
      </TimerProvider>
    </AuthProvider>
  );
}

export default App;
