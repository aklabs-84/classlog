import { useParams, Link, useNavigate } from 'react-router-dom';
import ResumeSheet from '../components/portfolio/ResumeSheet';
import { PORTFOLIO_SAMPLES, SAMPLE_START_KEY } from '../lib/portfolioSamples';

/** 강사 포트폴리오 샘플 미리보기 (저장·공개 없음, 검색 제외) */
const PortfolioSample = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const sample = PORTFOLIO_SAMPLES.find(s => s.id === id);
  if (!sample) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-on-surface-variant">
        <p>없는 샘플입니다.</p>
        <Link to="/" className="text-primary font-bold underline">처음으로</Link>
      </div>
    );
  }
  const start = () => {
    try { localStorage.setItem(SAMPLE_START_KEY, sample.id); } catch { /* 저장 불가 환경이면 이동만 */ }
    navigate('/teaching-tools?tool=portfolio');
  };
  return (
    <>
      <meta name="robots" content="noindex" />
      <div className="sample-start print:hidden" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', justifyContent: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid #d6dae5', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, color: '#5b6785' }}>예시 내용입니다. 마음에 들면 내 칸으로 가져가서 고쳐 쓰세요.</span>
        <button type="button" onClick={start} style={{ font: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', background: '#2447d6', border: 0, borderRadius: 8, padding: '10px 18px', cursor: 'pointer' }}>이 내용으로 시작하기</button>
      </div>
      <ResumeSheet name={sample.name} avatarUrl={null} intro={sample.intro} resume={sample.resume} classes={[]} />
      <div aria-hidden="true" className="print:hidden" style={{ height: 72 }} />
    </>
  );
};

export default PortfolioSample;
