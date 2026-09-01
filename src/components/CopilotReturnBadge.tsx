import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, ArrowRight } from 'lucide-react';
import { readCopilotReturn, clearCopilotReturn, type CopilotReturnInfo } from '../lib/copilotReturnState';

// AI 코파일럿 대화 중 딥링크로 다른 화면에 온 경우, 전 화면 어디서든 대화로 되돌아갈 수 있는 플로팅 배지.
// /ai-copilot 자체로 돌아오면 자동으로 사라진다(사용자가 X로 직접 닫아도 사라짐).
const CopilotReturnBadge = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [info, setInfo] = useState<CopilotReturnInfo | null>(null);

  useEffect(() => {
    if (location.pathname === '/ai-copilot') {
      clearCopilotReturn();
      setInfo(null);
      return;
    }
    setInfo(readCopilotReturn());
  }, [location.pathname]);

  if (!info) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9997] flex items-center gap-1 pl-2 pr-2 py-2 bg-on-surface text-white rounded-full shadow-xl">
      <button
        onClick={() => navigate('/ai-copilot')}
        className="flex items-center gap-2 pl-1 pr-2 group"
      >
        <img
          src={info.personaAvatar}
          alt={info.personaName}
          className="w-7 h-7 rounded-full object-cover border-2 shrink-0"
          style={{ borderColor: info.themeColor }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <span className="text-xs font-black whitespace-nowrap">{info.personaName}와의 대화로 돌아가기</span>
        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform shrink-0" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); clearCopilotReturn(); setInfo(null); }}
        className="p-1.5 rounded-full hover:bg-white/20 shrink-0"
        aria-label="닫기"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default CopilotReturnBadge;
