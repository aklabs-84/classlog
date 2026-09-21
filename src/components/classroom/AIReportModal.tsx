import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download, Sparkles, Printer, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateDetailedReport } from '../../lib/gemini';
import { useAuth, isFreeCreditPlan } from '../../lib/auth';
import { creditPriceOf } from '../../lib/aiCredits';

interface AIReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  classId?: string;
  students: any[];
}

const AIReportModal = ({ isOpen, onClose, className, classId, students }: AIReportModalProps) => {
  const { profile } = useAuth();
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  // 모달을 열 때마다 처음 상태로 — 열자마자 AI가 실행되면 크레딧이 자동 차감되므로 버튼을 눌러야 시작한다.
  useEffect(() => {
    if (isOpen) { setStarted(false); setReport(''); setLoading(false); }
  }, [isOpen, className]);

  const handleStart = async () => {
    setStarted(true);
    setLoading(true);
    try {
      const allObservations = students.flatMap(s => s.all_observations || []);
      const result = await generateDetailedReport(className, allObservations, classId);
      setReport(result);
    } catch (error) {
      console.error('AI Report Error:', error);
      setReport('보고서 생성 중 오류가 발생했습니다. 학급 데이터가 너무 방대하거나 API 설정에 문제가 있을 수 있습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(report);
    alert('보고서 내용이 클립보드에 복사되었습니다.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-xl print:p-0 print:bg-white print:relative print:z-0" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl h-[85vh] glass rounded-[3.5rem] flex flex-col shadow-2xl border border-white/20 relative overflow-hidden print:shadow-none print:border-none print:h-auto print:rounded-none print:w-full print:static"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-tertiary print:hidden" />
        
        {/* Header */}
        <header className="p-10 flex items-center justify-between border-b border-surface-container shrink-0 print:pt-0">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-on-surface text-surface rounded-2xl flex items-center justify-center print:border print:border-neutral-200">
              <FileText size={28} />
            </div>
            <div>
              <h3 className="text-3xl font-black font-manrope">{className} 상세 분석 보고서</h3>
              <p className="text-sm font-bold text-on-surface-variant">학습 참여도 및 역량 발현 심층 분석</p>
            </div>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <button onClick={handleCopy} className="p-3.5 hover:bg-surface-container rounded-2xl transition-all" title="복사"><Copy size={20} /></button>
            <button onClick={handlePrint} className="p-3.5 hover:bg-surface-container rounded-2xl transition-all" title="인쇄"><Printer size={20} /></button>
            <button onClick={onClose} className="p-3.5 hover:bg-surface-container rounded-2xl transition-all"><X size={24} /></button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-surface-container/10 print:overflow-visible print:p-0 print:bg-transparent">
          {!started ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6 print:hidden text-center">
              <Sparkles size={40} className="text-primary" />
              <div className="space-y-2">
                <p className="text-xl font-black">AI 상세 분석 보고서를 만들까요?</p>
                <p className="text-sm font-bold text-on-surface-variant">학급의 모든 활동 기록을 분석해 보고서를 작성합니다.</p>
                {isFreeCreditPlan(profile) && (
                  <p className="text-sm font-black text-amber-600">무료 플랜: 생성할 때 {creditPriceOf('detailed_report')}크레딧이 차감됩니다.</p>
                )}
              </div>
              <button onClick={handleStart} className="px-8 py-3.5 bg-primary text-white rounded-2xl font-black hover:opacity-90 transition-all">보고서 만들기</button>
            </div>
          ) : loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-8 print:hidden">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <Sparkles size={40} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-xl font-black animate-bounce">AI가 데이터를 심층 분석 중입니다...</p>
                <p className="text-sm font-bold text-on-surface-variant italic">학생들의 모든 활동 기록을 기반으로 교육적 성과를 추출하고 있습니다.</p>
              </div>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="prose prose-on-surface max-w-none prose-headings:font-black prose-p:font-bold prose-li:font-bold prose-headings:tracking-tighter print:prose-neutral"
            >
              <ReactMarkdown>{report}</ReactMarkdown>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-8 border-t border-neutral-200 flex items-center justify-between bg-neutral-50 shrink-0 print:mt-10 print:bg-transparent print:border-t-2">
          <p className="text-xs font-bold text-on-surface-variant opacity-40 uppercase tracking-widest font-manrope">Powered by Gemini 3.1 Pro/Flash • Hybrid Intelligence Edition (2026)</p>
          <button 
             onClick={handlePrint} 
             className="px-8 py-4 btn-gradient rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all print:hidden"
          >
            <Download size={18} /> 보고서 PDF 내보내기
          </button>
        </footer>

        {/* Print Styles */}
        <style>{`
          @media print {
            @page {
              margin: 20mm;
              size: A4;
            }
            body > * {
              display: none !important;
            }
            #root > * {
              display: none !important;
            }
            .fixed.inset-0 {
              position: static !important;
              display: block !important;
              background: none !important;
              padding: 0 !important;
            }
            .glass {
              box-shadow: none !important;
              border: none !important;
              backdrop-filter: none !important;
              background: white !important;
            }
          }
        `}</style>
      </motion.div>
    </div>
  );
};

export default AIReportModal;
