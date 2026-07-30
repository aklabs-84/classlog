import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth, checkIsPro, getBetaDaysLeft, checkIsBasicOrAbove, getAiMonthlyLimit, checkCanUseAi } from '../lib/auth';
import { useTheme } from '../hooks/useTheme';
import type { ThemeMode } from '../hooks/useTheme';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Camera,
  School,
  Globe,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Info,
  Check,
  X,
  Loader2,
  Upload,
  ExternalLink,
  ChevronUp,
  Copy,
  Crown,
  Zap,
  Sparkles,
  Mic,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react';

const Settings = () => {
  const { user, profile: authProfile, loading: authLoading, refreshProfile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // UI States
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  
  // Edit States
  const [editForm, setEditForm] = useState({
    full_name: '',
    school_name: '',
    school_code: '',
    avatar_url: ''
  });

  // 쿠폰 코드
  const [couponCode, setCouponCode]     = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMsg, setCouponMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 추천인 코드
  const [referralCount, setReferralCount] = useState<number>(0);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralMsg, setReferralMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [myReferralCode, setMyReferralCode] = useState('');
  const [refInput, setRefInput]           = useState('');
  const [refLoading, setRefLoading]       = useState(false);

  // Groq API Key (localStorage)
  const [groqKey, setGroqKey]           = useState('');
  const [groqKeySaved, setGroqKeySaved] = useState(false);
  const [showGroqKey, setShowGroqKey]   = useState(false);

  // 내 Gemini API Key (localStorage) — 무료 플랜 한도와 무관하게 AI 기능 사용
  const [geminiKey, setGeminiKey]           = useState('');
  const [geminiKeySaved, setGeminiKeySaved] = useState(false);
  const [showGeminiKey, setShowGeminiKey]   = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('groq_api_key') || '';
    setGroqKey(saved);
    const savedGemini = localStorage.getItem('gemini_api_key') || '';
    setGeminiKey(savedGemini);
  }, []);

  // 내 추천 코드 + 추천 횟수 로드
  useEffect(() => {
    if (!user || !authProfile) return;
    setMyReferralCode(authProfile.referral_code ?? '');
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', user.id)
      .then(({ count }) => setReferralCount(count ?? 0));
  }, [user, authProfile]);

  // 사이드바/배너에서 #referral 해시로 들어온 경우 해당 섹션으로 스크롤
  useEffect(() => {
    if (location.hash !== '#referral') return;
    const el = document.getElementById('referral-section');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const copyReferralCode = () => {
    if (!myReferralCode) return;
    const shareUrl = `${window.location.origin}/login?ref=${myReferralCode}`;
    navigator.clipboard.writeText(shareUrl);
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 2000);
  };

  const applyReferralCode = async () => {
    if (!refInput.trim()) return;
    setRefLoading(true);
    setReferralMsg(null);
    const { data } = await supabase.rpc('apply_referral_code', {
      p_code: refInput.trim().toUpperCase(),
    });
    setRefLoading(false);
    if (!data) {
      setReferralMsg({ type: 'err', text: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
      return;
    }
    const errMap: Record<string, string> = {
      PROFILE_NOT_FOUND: '프로필을 찾을 수 없습니다.',
      ALREADY_USED:      '이미 추천인 코드를 사용했습니다.',
      INVALID_CODE:      '유효하지 않은 추천 코드입니다.',
      SELF_REFERRAL:     '자기 자신의 코드는 사용할 수 없습니다.',
    };
    if (data.error) {
      setReferralMsg({ type: 'err', text: errMap[data.error] ?? '알 수 없는 오류입니다.' });
      return;
    }
    setReferralMsg({ type: 'ok', text: `🎉 추천 코드 적용! 양쪽 모두 ${data.bonus_days}일 베타가 지급되었습니다.` });
    setRefInput('');
    await refreshProfile();
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMsg(null);
    const { data, error } = await supabase.rpc('apply_beta_coupon', { p_code: couponCode.trim() });
    setCouponLoading(false);
    if (error || !data) {
      setCouponMsg({ type: 'err', text: '쿠폰 적용 중 오류가 발생했습니다.' });
      return;
    }
    const errMap: Record<string, string> = {
      NOT_AUTHENTICATED: '로그인이 필요합니다.',
      INVALID_CODE:      '유효하지 않은 코드입니다.',
      COUPON_EXPIRED:    '만료된 쿠폰입니다.',
      MAX_USES_REACHED:  '이미 최대 사용 횟수에 도달한 쿠폰입니다.',
      ALREADY_USED:      '이미 사용한 쿠폰입니다.',
    };
    if (data.error) {
      setCouponMsg({ type: 'err', text: errMap[data.error] ?? '알 수 없는 오류입니다.' });
      return;
    }
    const expDate = new Date(data.expires_at).toLocaleDateString('ko-KR');
    setCouponMsg({ type: 'ok', text: `🎉 ${data.duration_days}일 Pro 체험이 적용되었습니다! (${expDate}까지)` });
    setCouponCode('');
    if (user) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: `🎟 Pro 체험 쿠폰이 적용되었습니다!`,
        content: `${data.duration_days}일간 Pro 기능을 모두 사용하실 수 있습니다. (${expDate}까지)`,
        type: 'coupon_applied',
        link: '/settings',
      });
    }
    await refreshProfile();
  };

  const saveGroqKey = () => {
    if (groqKey.trim()) {
      localStorage.setItem('groq_api_key', groqKey.trim());
    } else {
      localStorage.removeItem('groq_api_key');
    }
    setGroqKeySaved(true);
    setTimeout(() => setGroqKeySaved(false), 2000);
  };

  const saveGeminiKey = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    setGeminiKeySaved(true);
    setTimeout(() => setGeminiKeySaved(false), 2000);
  };


  // 페이지 진입 시 항상 최신 프로필(플랜 포함) 로드
  useEffect(() => {
    refreshProfile();
  }, []);

  useEffect(() => {
    if (authProfile) {
      setProfile(authProfile);
      setEditForm({
        full_name: authProfile.full_name || '',
        school_name: authProfile.school_name || '',
        school_code: authProfile.school_code || '',
        avatar_url: authProfile.avatar_url || ''
      });
      setLoading(false);
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authProfile, authLoading]);

  // Image Optimization (Canvas API)
  const optimizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 400; // Profile image standard size
          let width = img.width;
          let height = img.height;

          // Maintain aspect ratio and resize
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas processing failed'));
            },
            'image/jpeg',
            0.8 // 80% Quality
          );
        };
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileSelect = () => {
    if (isEditing) fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Optimize image (Resize & Compression)
      const optimizedBlob = await optimizeImage(file);
      const fileExt = 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // 2. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, optimizedBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // 4. Update Edit Form
      setEditForm(prev => ({ ...prev, avatar_url: publicUrl }));
      
    } catch (error: any) {
      alert('이미지 업로드 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user?.id,
          full_name: editForm.full_name,
          school_name: editForm.school_name,
          school_code: editForm.school_code,
          avatar_url: editForm.avatar_url,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) throw error;
      
      await refreshProfile();
      setIsEditing(false);
      alert('프로필이 성공적으로 업데이트되었습니다.');
    } catch (error: any) {
      alert('저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };


  const sections = [
    { 
      id: 'profile', 
      title: '개인 프로필', 
      icon: User, 
      items: [
        { label: '이름', value: profile?.full_name || '미지정', key: 'full_name', isImage: false, readOnly: false },
        { label: '아바타 이미지', value: profile?.avatar_url ? '업로드됨' : '기본 이미지', key: 'avatar_url', isImage: true, readOnly: false },
      ]
    },
    { 
      id: 'workspace', 
      title: '워크스페이스 설정', 
      icon: School, 
      items: [
        { label: '소속 학교', value: profile?.school_name || '미지정', key: 'school_name', isImage: false, readOnly: false },
        { label: '역할', value: '선생님', key: 'role', isImage: false, readOnly: true },
      ]
    }
  ];

  const plan = profile?.plan ?? 'free';
  const betaDaysLeft = getBetaDaysLeft(profile);
  const isBetaActive = betaDaysLeft !== null;
  const isEffectivelyPro = checkIsPro(profile);
  const isProjectPro = isEffectivelyPro && !isBetaActive && !['pro', 'school', 'admin'].includes(plan);
  const aiUsedThisMonth = (() => {
    if (!profile?.ai_monthly_reset) return 0;
    const thisMonth = new Date().toISOString().slice(0, 7);
    return profile.ai_monthly_reset === thisMonth ? (profile.ai_monthly_count ?? 0) : 0;
  })();

  const isBasicOnly = checkIsBasicOrAbove(profile) && !checkIsPro(profile);
  const aiMonthlyLimit = getAiMonthlyLimit(profile);
  const hasByokKey = !!localStorage.getItem('gemini_api_key');

  const PLAN_LABEL: Record<string, string> = {
    free: '무료 플랜',
    basic: 'Basic 플랜',
    pro: 'Pro 플랜',
    school: 'School 플랜',
    admin: '관리자',
  };
  const PLAN_COLOR: Record<string, string> = {
    free: 'bg-gray-100 text-gray-600',
    basic: 'bg-blue-100 text-blue-700',
    pro: 'bg-amber-100 text-amber-700',
    school: 'bg-violet-100 text-violet-700',
    admin: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-10 pb-20"
    >
      {/* 플랜 현황 카드 */}
      <div className="layered-card rounded-3xl p-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              plan === 'admin'  ? 'bg-emerald-500' :
              plan === 'pro'    ? 'bg-amber-500' :
              plan === 'school' ? 'bg-violet-500' :
              plan === 'basic'  ? 'bg-blue-500' :
              isBetaActive      ? 'bg-blue-500' :
              isProjectPro      ? 'bg-amber-500' :
                                  'bg-gray-400'
            }`}>
              {plan === 'admin'  ? <ShieldCheck size={18} className="text-white" /> :
               plan === 'pro'    ? <Crown size={18} className="text-white" /> :
               plan === 'school' ? <GraduationCap size={18} className="text-white" /> :
               plan === 'basic'  ? <Crown size={18} className="text-white" /> :
               isProjectPro      ? <Crown size={18} className="text-white" /> :
                                   <User size={18} className="text-white" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-base text-amber-900">현재 플랜</span>
                {isBetaActive ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    🎟 Pro 체험중 (D-{betaDaysLeft})
                  </span>
                ) : isProjectPro ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    🏫 수업 Pro (기간제)
                  </span>
                ) : (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PLAN_COLOR[plan]}`}>
                    {PLAN_LABEL[plan]}
                  </span>
                )}
              </div>
              {isBetaActive ? (
                <p className="text-xs text-blue-600 mt-0.5">
                  베타 체험 기간 동안 Pro 기능을 모두 사용하실 수 있습니다
                </p>
              ) : isProjectPro ? (
                <p className="text-xs text-amber-600 mt-0.5">
                  학교 프로젝트 기간 동안 Pro 기능을 모두 사용하실 수 있습니다
                </p>
              ) : plan === 'pro' ? (
                <p className="text-xs text-amber-600 mt-0.5">
                  클래스 최대 10개 · 학생 최대 35명/반 · AI 세특 월 500회
                </p>
              ) : plan === 'basic' ? (
                <p className="text-xs text-blue-600 mt-0.5">
                  클래스 최대 5개 · 학생 최대 35명/반 · AI 세특 월 100회
                </p>
              ) : plan === 'free' ? (
                <p className="text-xs text-amber-600 mt-0.5">
                  클래스 최대 1개 · 학생 최대 20명/반 · AI 세특 월 20회 체험
                </p>
              ) : null}
            </div>
          </div>
          {!isEffectivelyPro && (
            <NavLink
              to="/pricing"
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <Zap size={14} /> 플랜 업그레이드
            </NavLink>
          )}
        </div>

        {checkCanUseAi(profile) ? (
          <div className="mt-4 pt-4 border-t border-amber-200 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-amber-600 mb-1">이번 달 AI 사용</p>
              {hasByokKey ? (
                <p className="text-sm font-black text-green-600">내 API 키 사용 중 · 무제한</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${Math.min((aiUsedThisMonth / aiMonthlyLimit) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-black text-amber-800 whitespace-nowrap">
                      {aiUsedThisMonth} / {aiMonthlyLimit}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-500 mt-1">매월 1일 자동 초기화</p>
                </>
              )}
            </div>
            {!isEffectivelyPro && (
              <div>
                <p className="text-xs font-bold text-amber-600 mb-2">{isBasicOnly ? 'Pro 플랜에서 더 가능한 것' : 'Basic / Pro 플랜에서 가능한 것'}</p>
                <div className="space-y-1">
                  {(isBasicOnly
                    ? ['AI 세특 월 500회 (Pro)', '클래스 최대 10개 (Pro)', '화이트보드 무제한 (Pro)', '일괄 AI 생성 (Pro)', 'NAISS 내보내기 (Pro)', '학교 프로젝트 생성 (Pro)']
                    : ['AI 세특 월 100회 (Basic)', 'AI 세특 월 500회 (Pro)', '클래스 최대 5개 (Basic)', '클래스 최대 10개 (Pro)', '수업 도구 전체 (Basic 이상)']
                  ).map(item => (
                    <div key={item} className="flex items-center gap-1.5 text-xs text-amber-700">
                      <Sparkles size={10} className="text-amber-400" /> {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-amber-200">
            <p className="text-xs font-bold text-amber-600 mb-2">Basic / Pro 플랜에서 가능한 것</p>
            <div className="space-y-1">
              {['AI 세특 월 100회 (Basic)', 'AI 세특 월 500회 (Pro)', '클래스 최대 3개 (Basic)', '수업 도구 전체 (Basic 이상)'].map(item => (
                <div key={item} className="flex items-center gap-1.5 text-xs text-amber-700">
                  <Sparkles size={10} className="text-amber-400" /> {item}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 쿠폰 / 베타 코드 입력 */}
      <div className="layered-card rounded-3xl p-6 border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-base text-blue-900">쿠폰 코드 입력</p>
            <p className="text-xs text-blue-500">이벤트·베타 쿠폰으로 Pro 기능을 체험하세요</p>
          </div>
        </div>

        {/* 현재 베타 활성 상태 */}
        {(() => {
          const days = getBetaDaysLeft(profile);
          return days !== null ? (
            <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-blue-100 rounded-2xl">
              <Check size={14} className="text-blue-600" />
              <p className="text-sm font-bold text-blue-700">
                Pro 체험 중 — <span className="font-black">D-{days}</span> 남았습니다
              </p>
            </div>
          ) : null;
        })()}

        <div className="flex gap-2">
          <input
            type="text"
            value={couponCode}
            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponMsg(null); }}
            onKeyDown={e => e.key === 'Enter' && applyCoupon()}
            placeholder="코드 입력 (예: BETA2026)"
            className="flex-1 px-4 py-3 rounded-2xl border border-blue-200 bg-white text-sm font-mono font-bold focus:outline-none focus:border-blue-400 placeholder:font-normal placeholder:text-gray-400 uppercase"
          />
          <button
            onClick={applyCoupon}
            disabled={couponLoading || !couponCode.trim()}
            className="px-5 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {couponLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            적용
          </button>
        </div>

        {couponMsg && (
          <p className={`mt-2.5 text-xs font-bold px-3 py-2 rounded-xl ${
            couponMsg.type === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
          }`}>
            {couponMsg.text}
          </p>
        )}
      </div>

      {/* 추천인 코드 */}
      <div id="referral-section" className="layered-card rounded-3xl p-6 border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 scroll-mt-24">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-base text-emerald-900">추천인 코드</p>
            <p className="text-xs text-emerald-600">친구에게 공유하면 양쪽 모두 7일 베타 혜택!</p>
          </div>
        </div>

        {/* 내 코드 표시 */}
        {myReferralCode ? (
          <div className="mb-5">
            <p className="text-[10px] font-black text-emerald-700/60 uppercase tracking-widest mb-2">내 추천 코드</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-white border-2 border-emerald-200 rounded-2xl font-mono font-black text-lg text-emerald-800 tracking-widest text-center select-all">
                {myReferralCode}
              </div>
              <button
                onClick={copyReferralCode}
                className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl transition-colors flex items-center gap-2 font-black text-sm whitespace-nowrap"
              >
                {referralCopied ? <Check size={14} /> : <Copy size={14} />}
                {referralCopied ? '링크 복사됨' : '초대 링크 복사'}
              </button>
            </div>
            {referralCount > 0 && (
              <p className="mt-2 text-xs text-emerald-600 font-bold">
                현재까지 <span className="font-black">{referralCount}명</span>이 내 코드로 가입했습니다 🎉
              </p>
            )}
          </div>
        ) : (
          <div className="mb-5 px-4 py-3 bg-white/60 rounded-2xl text-sm text-emerald-700">
            추천 코드를 불러오는 중...
          </div>
        )}

        {/* 추천인 코드 입력 (아직 미사용인 경우만) */}
        {!authProfile?.referred_by && (
          <div>
            <p className="text-[10px] font-black text-emerald-700/60 uppercase tracking-widest mb-2">추천인 코드 입력</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={refInput}
                onChange={e => { setRefInput(e.target.value.toUpperCase()); setReferralMsg(null); }}
                onKeyDown={e => e.key === 'Enter' && applyReferralCode()}
                placeholder="SANGXXXXXX"
                className="flex-1 px-4 py-3 rounded-2xl border border-emerald-200 bg-white text-sm font-mono font-bold focus:outline-none focus:border-emerald-400 placeholder:font-normal placeholder:text-gray-400 uppercase"
              />
              <button
                onClick={applyReferralCode}
                disabled={refLoading || !refInput.trim()}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {refLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                적용
              </button>
            </div>
            {referralMsg && (
              <p className={`mt-2.5 text-xs font-bold px-3 py-2 rounded-xl ${
                referralMsg.type === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
              }`}>
                {referralMsg.text}
              </p>
            )}
          </div>
        )}
        {authProfile?.referred_by && (
          <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
            <Check size={13} />
            이미 추천인 코드를 사용하셨습니다.
          </p>
        )}
      </div>

      <div className="px-2 flex items-center justify-between">
        <div>
          <p className="text-primary font-bold text-xs uppercase tracking-widest mb-3">System Preferences</p>
          <h1 className="text-2xl md:text-4xl font-extrabold font-manrope mb-4">설정</h1>
          <p className="text-on-surface-variant text-base leading-relaxed">
            계정 정보, 워크스페이스 및 개인화 설정을 관리하세요.
          </p>
        </div>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <button 
                onClick={() => setIsEditing(false)}
                className="px-6 py-3 rounded-xl border border-surface-container-highest font-bold text-sm hover:bg-surface-container transition-all flex items-center gap-2"
              >
                <X size={18} />
                취소
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || isUploading}
                className="px-8 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                변경사항 저장
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsEditing(true)}
              className="btn-gradient px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/10 active:scale-95"
            >
              프로필 수정
            </button>
          )}
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="surface-card p-5 md:p-10 shadow-ambient flex items-center gap-5 md:gap-10 relative overflow-hidden">
        <div className="relative group cursor-pointer" onClick={handleFileSelect}>
          <div className={`w-32 h-32 rounded-3xl overflow-hidden shadow-lg border-4 border-surface-container-high transition-transform ${isEditing ? 'hover:scale-105' : ''} bg-surface-container flex items-center justify-center relative`}>
            {loading ? (
              <div className="w-full h-full animate-pulse bg-surface-container-highest" />
            ) : (() => {
              const avatarUrl = isEditing ? editForm.avatar_url : profile?.avatar_url;
              const initial = (profile?.full_name || '?').charAt(0).toUpperCase();
              return avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="ProfileLarge"
                  className={`w-full h-full object-cover transition-all ${isUploading ? 'blur-sm opacity-50' : ''}`}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <span className="text-white text-4xl font-black">{initial}</span>
                </div>
              );
            })()}
            
            {isEditing && !isUploading && (
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                <Camera size={24} className="text-white mb-1" />
                <span className="text-[10px] text-white font-bold tracking-tight">사진 변경</span>
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Loader2 size={24} className="animate-spin text-white" />
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
        </div>

        <div className="flex-1 space-y-2">
          {loading ? (
            <div className="space-y-2">
              <div className="w-48 h-8 bg-surface-container animate-pulse rounded" />
              <div className="w-32 h-4 bg-surface-container animate-pulse rounded" />
            </div>
          ) : (
            <>
              <h2 className="text-3xl font-black font-manrope">
                {isEditing ? (
                  <input 
                    type="text" 
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                    className="bg-surface-container-low border-b-2 border-primary px-2 py-1 outline-none w-full max-w-xs font-bold focus:bg-surface-container transition-all"
                    placeholder="이름 입력"
                  />
                ) : (
                  profile?.full_name || '사용자'
                )} 
                {!isEditing && ' 선생님'}
              </h2>
              <p className="text-on-surface-variant font-medium">관리자 계정 • {profile?.role || '교사'}</p>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <span className={`px-3 py-1 font-bold text-[11px] rounded-lg tracking-widest uppercase shadow-sm transition-all hover:scale-105 ${
              plan === 'admin'  ? 'bg-emerald-100 text-emerald-700 shadow-emerald-100' :
              plan === 'pro'    ? 'bg-amber-100 text-amber-700 shadow-amber-100' :
              plan === 'school' ? 'bg-violet-100 text-violet-700 shadow-violet-100' :
              plan === 'basic'  ? 'bg-blue-100 text-blue-700 shadow-blue-100' :
              isBetaActive      ? 'bg-blue-100 text-blue-700 shadow-blue-100' :
              isProjectPro      ? 'bg-amber-100 text-amber-700 shadow-amber-100' :
                                  'bg-gray-100 text-gray-500'
            }`}>
              {plan === 'admin' ? 'ADMIN' : plan === 'pro' ? 'PRO' : plan === 'school' ? 'SCHOOL' : plan === 'basic' ? 'BASIC' : isBetaActive ? 'BETA' : isProjectPro ? 'PROJECT PRO' : 'FREE'}
            </span>
            <span className="px-3 py-1 bg-surface-container-highest text-on-surface-variant font-bold text-[11px] rounded-lg tracking-widest uppercase">ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.id} className="surface-card shadow-ambient overflow-hidden transition-all">
            <div className="px-5 md:px-10 py-4 md:py-6 border-b border-surface-container bg-surface-container-low/30 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-3">
                <section.icon size={22} className="text-primary" />
                {section.title}
              </h3>
            </div>
            <div className="divide-y divide-surface-container">
              {section.items.map((item, i) => (
                <div key={i} className="px-5 md:px-10 py-4 md:py-6 flex items-center justify-between hover:bg-surface-container-low/50 transition-colors group">
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{item.label}</p>
                    {isEditing && !item.readOnly ? (
                      item.isImage ? (
                        <button 
                          onClick={handleFileSelect}
                          className="flex items-center gap-2 text-sm font-bold text-primary hover:underline group-hover:translate-x-1 transition-all"
                        >
                          <Upload size={14} />
                          사진 업로드하기
                        </button>
                      ) : (
                        <input 
                          type="text" 
                          value={editForm[item.key as keyof typeof editForm]}
                          onChange={(e) => setEditForm({...editForm, [item.key]: e.target.value})}
                          className="w-full max-w-md bg-surface-container-low border-b border-primary/50 px-2 py-1 outline-none font-semibold focus:border-primary transition-all focus:bg-surface-container"
                        />
                      )
                    ) : (
                      <p className="text-base font-semibold">{item.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── AI 전사 설정 (Groq API Key) ── */}
      <div className="surface-card shadow-ambient overflow-hidden">
        <div className="px-5 md:px-10 py-4 md:py-6 border-b border-surface-container bg-surface-container-low/30 flex items-center gap-3">
          <Mic size={22} className="text-primary" />
          <div>
            <h3 className="text-lg font-bold">AI 전사 설정</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Groq API Key를 등록하면 Web Speech 대비 훨씬 높은 품질의 한국어 전사가 가능합니다
            </p>
          </div>
        </div>
        <div className="px-5 md:px-10 py-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/15">
            <KeyRound size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-on-surface-variant leading-relaxed">
              <span className="font-bold text-primary">Groq Whisper large-v3</span> 사용 — 무료 API Key 발급:{' '}
              <span className="font-mono text-primary">console.groq.com</span> 에서 가입 후 발급
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Groq API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqKey}
                  onChange={e => setGroqKey(e.target.value)}
                  placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 pr-10 bg-surface-container rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30"
                />
                <button
                  onClick={() => setShowGroqKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
                >
                  {showGroqKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                onClick={saveGroqKey}
                className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                  groqKeySaved
                    ? 'bg-green-100 text-green-700'
                    : 'bg-primary text-white hover:bg-primary/90 active:scale-95'
                }`}
              >
                {groqKeySaved ? <Check size={15} /> : <KeyRound size={15} />}
                {groqKeySaved ? '저장됨' : '저장'}
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant/60">
              키는 이 기기의 브라우저에만 저장됩니다. 등록 후 수업 도구 → 수업 전사에서 자동으로 적용됩니다.
            </p>
            {groqKey && !groqKey.startsWith('gsk_') && (
              <p className="text-[11px] text-amber-600 font-bold">
                Groq API Key는 보통 "gsk_"로 시작합니다. 키를 다시 확인해주세요.
              </p>
            )}
            {localStorage.getItem('groq_api_key') && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="text-[11px] text-green-600 font-bold">Groq Whisper 모드 활성화됨</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 내 Gemini API 키 (BYOK) ── */}
      <div className="surface-card shadow-ambient overflow-hidden">
        <div className="px-5 md:px-10 py-4 md:py-6 border-b border-surface-container bg-surface-container-low/30 flex items-center gap-3">
          <Sparkles size={22} className="text-primary" />
          <div>
            <h3 className="text-lg font-bold">내 Gemini API 키</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              내 API 키를 등록하면 플랜 월 사용 한도와 무관하게 AI 기능(및 AI가 포함된 Basic 전용 수업 도구)을 사용할 수 있습니다
            </p>
          </div>
        </div>
        <div className="px-5 md:px-10 py-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/15">
            <KeyRound size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-on-surface-variant leading-relaxed">
              <span className="font-bold text-primary">Google Gemini</span> 사용 — 무료 API Key 발급:{' '}
              <span className="font-mono text-primary">aistudio.google.com/apikey</span> 에서 발급
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Gemini API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIzaxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 pr-10 bg-surface-container rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30"
                />
                <button
                  onClick={() => setShowGeminiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
                >
                  {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                onClick={saveGeminiKey}
                className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                  geminiKeySaved
                    ? 'bg-green-100 text-green-700'
                    : 'bg-primary text-white hover:bg-primary/90 active:scale-95'
                }`}
              >
                {geminiKeySaved ? <Check size={15} /> : <KeyRound size={15} />}
                {geminiKeySaved ? '저장됨' : '저장'}
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant/60">
              키는 이 기기의 브라우저에만 저장되며, 등록 시 서버를 거치지 않고 브라우저에서 Gemini로 직접 호출됩니다. AI 호출 비용은 등록한 본인 Google 계정으로 청구됩니다.
            </p>
            {geminiKey && !geminiKey.startsWith('AIza') && (
              <p className="text-[11px] text-amber-600 font-bold">
                Gemini API Key는 보통 "AIza"로 시작합니다. 키를 다시 확인해주세요.
              </p>
            )}
            {localStorage.getItem('gemini_api_key') && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="text-[11px] text-green-600 font-bold">내 Gemini 키 모드 활성화됨 (한도 무제한)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between p-5 md:p-10 mt-6 md:mt-10 border-t border-surface-container-high relative flex-wrap gap-4">
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setShowLangModal(true)}
            className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-all font-bold text-sm group"
          >
            <Globe size={18} className="group-hover:rotate-12 transition-transform" />
            언어 설정
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className={`flex items-center gap-2 transition-all font-bold text-sm group ${showThemeMenu ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
              테마 설정
              <ChevronUp size={14} className={`transition-transform ${showThemeMenu ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showThemeMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full left-0 mb-4 w-40 glass rounded-2xl shadow-ambient p-2 border border-surface-container-highest z-50 overflow-hidden"
                >
                  <p className="px-3 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest border-b border-surface-container mb-1">Theme Mode</p>
                  {[
                    { id: 'system', label: '시스템 설정', icon: Monitor },
                    { id: 'light', label: '라이트 모드', icon: Sun },
                    { id: 'dark', label: '다크 모드', icon: Moon },
                  ].map((it) => (
                    <button
                      key={it.id}
                      onClick={() => {
                        setTheme(it.id as ThemeMode);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${theme === it.id ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[1.02]' : 'hover:bg-surface-container-high'}`}
                    >
                      <it.icon size={14} />
                      {it.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setShowInfoModal(true)}
            className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-all font-bold text-sm group"
          >
            <Info size={18} className="group-hover:scale-110 transition-transform" />
            시스템 정보
          </button>
        </div>
        
        <button 
          onClick={signOut}
          className="flex items-center gap-2 text-error font-extrabold text-sm hover:underline underline-offset-4 decoration-2 px-6 py-3 rounded-xl hover:bg-error-container/20 transition-all active:scale-95"
        >
          <LogOut size={18} />
          로그아웃하기
        </button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showLangModal && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLangModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md rounded-3xl bg-surface-container-lowest border border-surface-container-highest shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-8"
            >
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto text-primary">
                  <Globe size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-on-surface">언어 설정</h3>
                  <p className="text-on-surface-variant leading-relaxed">
                    현재 <strong className="text-on-surface">클래스로그(SaenggiLog)</strong>는 한국어(KO) 서비스를 기본으로 제공하고 있습니다.
                    추후 글로벌 서비스 확장을 통해 더 많은 언어를 지원할 예정입니다.
                  </p>
                </div>
                <button
                  onClick={() => setShowLangModal(false)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                >
                  확인했습니다
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showInfoModal && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInfoModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg rounded-3xl bg-surface-container-lowest border border-surface-container-highest shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-10"
            >
              <div className="space-y-8">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-primary rounded-[2rem] flex items-center justify-center text-white shadow-xl shadow-primary/20">
                    <Check size={40} strokeWidth={4} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-3xl font-black text-on-surface">클래스로그 SaenggiLog</h2>
                    <p className="text-on-surface-variant font-bold">Version 1.0.0 (Production Build)</p>
                  </div>
                </div>

                <div className="p-5 bg-surface-container rounded-2xl">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Developer</p>
                  <p className="font-bold text-on-surface">AKLABS</p>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    클래스로그는 AI 기술을 활용하여 교사의 업무 부담을 줄이고 학생들의 성장을 더 깊이 있게 관찰할 수 있도록 돕는 스마트 교육 솔루션입니다.
                  </p>
                  <a
                    href="https://litt.ly/aklabs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-5 bg-primary/5 border border-primary/20 rounded-2xl group hover:bg-primary/10 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                        <Globe size={20} />
                      </div>
                      <p className="font-black text-primary">아크랩스 공식 홈페이지 방문하기</p>
                    </div>
                    <ExternalLink size={18} className="text-primary group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </a>
                </div>

                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Settings;
