import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, User, Trash2, Paperclip, FileText, Image as ImageIcon, FileCheck, Loader2, Maximize2, Minimize2, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatWithClassData, fileToGenerativePart, extractTextFromFiles } from '../../lib/gemini';
import CodeBlock from '../CodeBlock';

function normalizeMarkdown(text: string) {
  // AI가 표/문단 바로 뒤에 빈 줄 없이 제목(#)을 이어붙이면 헤딩으로 인식되지 않는 문제 보정
  let result = text.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  // "**'인용어'**로"처럼 볼드 종료(**) 앞이 구두점이고 뒤에 조사가 공백 없이 붙으면
  // CommonMark 강조 플랭킹 규칙상 닫힘으로 인식되지 않아 **가 그대로 노출되는 문제 보정
  result = result.replace(/(\*\*[^\n*]*[\p{P}])\*\*(?=[^\s\p{P}])/gu, '$1** ');
  return result;
}

const chatMdComponents: any = {
  h1: ({ children }: any) => <h1 className="text-lg font-black mb-3 mt-4 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-black mb-2 mt-4 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-black mb-2 mt-3 text-on-surface">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed text-sm font-bold text-on-surface">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm font-bold text-on-surface">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-xl">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) {
      return <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>;
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const codeClassName = child?.props?.className || '';
    const lang = codeClassName.replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">
      {children}
    </a>
  ),
  hr: () => <hr className="border-surface-container my-4" />,
  strong: ({ children }: any) => <strong className="font-black text-on-surface">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-3 rounded-xl border border-surface-container">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-surface-container px-3 py-2">{children}</td>
  ),
};

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  classId?: string;
  students: any[];
  focusStudentId?: string | null;
  onClearFocus?: () => void;
}

const AIChatModal = ({ isOpen, onClose, className, classId, students, focusStudentId, onClearFocus }: AIChatModalProps) => {
  const focusStudent = focusStudentId ? students.find(s => s.id === focusStudentId) : null;
  const [messages, setMessages] = useState<{id: string, role: 'user' | 'ai', text: string, hasFiles?: boolean, extractedPreview?: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [extractedData, setExtractedData] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedFiles]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const prevFocusRef = useRef<string | null | undefined>(focusStudentId);
  useEffect(() => {
    if (isOpen && prevFocusRef.current !== focusStudentId) {
      setMessages([]);
      setExtractedData(null);
    }
    prevFocusRef.current = focusStudentId;
  }, [focusStudentId, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || loading) return;

    const userMessage = input.trim() || (selectedFiles.length > 0 ? "첨부한 파일을 분석해줘." : "");
    const filesToUpload = [...selectedFiles];
    const userMsgId = crypto.randomUUID();

    setInput('');
    setSelectedFiles([]);
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: userMessage, hasFiles: filesToUpload.length > 0 }]);
    setLoading(true);

    try {
      const targetStudents = focusStudent ? [focusStudent] : students;
      const allObservations = targetStudents.flatMap(s =>
        (s.all_observations || []).map((o: any) => ({ ...o, student_name: s.name }))
      );
      const history = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
      
      // 1. 파일 처리 (Base64 변환)
      const fileParts = await Promise.all(
        filesToUpload.map(f => fileToGenerativePart(f))
      );

      // 2. 텍스트 추출 선행 (필요 시)
      let currentExtracted = extractedData;
      if (filesToUpload.length > 0) {
        setIsExtracting(true);
        const newExtracted = String(await extractTextFromFiles(fileParts) || "");
        currentExtracted = (currentExtracted ? currentExtracted + "\n\n" : "") + newExtracted;
        setExtractedData(currentExtracted);
        setMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, extractedPreview: newExtracted } : m));
        setIsExtracting(false);
      }

      // 3. AI 답변 생성
      const response = await chatWithClassData(className, allObservations, history, userMessage, fileParts, currentExtracted || "", classId, focusStudent?.name, students.length);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: response }]);
    } catch (error) {
      console.error('AI Chat Error:', error);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 파일 분석 또는 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }]);
      setIsExtracting(false);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[1000] flex items-center justify-center bg-on-surface/40 backdrop-blur-xl transition-all ${isMaximized ? 'p-0' : 'p-6'}`} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className={`w-full glass flex flex-col shadow-2xl border border-white/20 relative overflow-hidden transition-all ${isMaximized ? 'max-w-full h-full rounded-2xl' : 'max-w-2xl h-[80vh] rounded-[3rem]'}`}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] animate-shimmer" />
        
        {/* Header */}
        <header className="p-8 flex flex-col gap-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner">
                <Sparkles size={24} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black font-manrope">AI 에듀 어시스턴트</h3>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {className} 전용 고도화 지침 적용 중
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMaximized(v => !v)}
                className="p-3 hover:bg-surface-container rounded-2xl text-on-surface-variant transition-all active:scale-90"
                title={isMaximized ? '기본 크기로 보기' : '전체 화면으로 보기'}
              >
                {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
              <button
                onClick={() => { setMessages([]); setExtractedData(null); }}
                className="p-3 hover:bg-surface-container rounded-2xl text-on-surface-variant transition-all hover:text-error active:scale-90"
                title="대화 초기화"
              >
                <Trash2 size={20} />
              </button>
              <button onClick={onClose} className="p-3 hover:bg-surface-container rounded-2xl transition-all active:scale-90"><X size={24} /></button>
            </div>
          </div>

          {focusStudent && (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full w-fit">
              <span className="text-xs font-black text-primary-dim">🎯 {focusStudent.name} 학생에 집중 중</span>
              <button
                onClick={() => onClearFocus?.()}
                className="px-3 py-1 bg-primary text-white rounded-full text-[10px] font-black hover:bg-primary-dim transition-all"
              >
                전체 학급으로 전환
              </button>
            </div>
          )}
        </header>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8 bg-surface/30">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center space-y-8">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <Sparkles size={64} className="text-primary relative animate-bounce" />
              </div>
              <div className="text-center space-y-4 max-w-sm">
                <p className="text-2xl font-black text-on-surface">무엇을 도와드릴까요?</p>
                <div className="p-6 bg-white/50 backdrop-blur-md rounded-3xl border border-white/40 shadow-sm space-y-3">
                  <p className="text-xs font-bold text-on-surface-variant leading-relaxed">
                    "학생들의 활동 기록 이미지를 첨부해 보세요. AI가 자동으로 텍스트를 추출해 교육부 기재요령에 맞춰 분석해 드립니다. 추출된 원문은 첨부한 메시지 아래 '추출 내용 보기'에서 확인할 수 있어요."
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <span className="px-3 py-1 bg-primary/5 text-primary text-[10px] font-black rounded-full border border-primary/10">#세특작성</span>
                    <span className="px-3 py-1 bg-secondary/5 text-secondary text-[10px] font-black rounded-full border border-secondary/10">#활동기록분석</span>
                    <span className="px-3 py-1 bg-tertiary/5 text-tertiary text-[10px] font-black rounded-full border border-tertiary/10">#이미지인식</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center border-2 ${m.role === 'user' ? 'bg-surface-container-high border-white text-on-surface shadow-md' : 'bg-primary text-white border-primary/20 shadow-lg shadow-primary/20'}`}>
                  {m.role === 'user' ? <User size={22} /> : <Sparkles size={22} />}
                </div>
                <div className={`max-w-[85%] p-6 rounded-[2rem] text-sm font-bold leading-relaxed shadow-ambient ${m.role === 'user' ? 'bg-white rounded-tr-none text-on-surface' : 'bg-white border border-surface-container rounded-tl-none'}`}>
                  {m.hasFiles && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/10 text-primary">
                      <FileCheck size={16} />
                      <span className="text-[11px] font-black italic">파일 분석 요청이 포함되었습니다</span>
                    </div>
                  )}
                  <div className="prose prose-sm prose-stone max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMdComponents}>{normalizeMarkdown(m.text)}</ReactMarkdown>
                  </div>
                  {m.extractedPreview && (
                    <details className="mt-4 rounded-xl border border-primary/10 bg-primary/5 overflow-hidden">
                      <summary className="px-4 py-2.5 cursor-pointer font-black text-[11px] text-primary list-none flex items-center gap-2 select-none">
                        <ChevronDown size={14} className="shrink-0" />
                        첨부파일에서 추출한 내용 보기 (AI가 이 내용을 참고해 답변합니다)
                      </summary>
                      <div className="px-4 pb-4 pt-1 text-[11px] font-normal text-on-surface-variant whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                        {m.extractedPreview}
                      </div>
                    </details>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {(loading || isExtracting) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20"><Loader2 size={22} className="animate-spin" /></div>
              <div className="p-6 rounded-[2rem] rounded-tl-none bg-white shadow-ambient border border-surface-container flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs font-black text-primary/60 ml-2 italic">
                  {isExtracting ? "파일에서 데이터를 추출하는 중입니다..." : "데이터를 분석하고 있습니다..."}
                </span>
              </div>
            </motion.div>
          )}
        </div>

        {/* File Preview Area */}
        <AnimatePresence>
          {selectedFiles.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-8 py-4 bg-white/80 backdrop-blur-md border-t border-surface-container flex gap-3 overflow-x-auto custom-scrollbar"
            >
              {selectedFiles.map((file, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-3 bg-surface-container px-4 py-2.5 rounded-2xl border border-white shrink-0 shadow-sm transition-all hover:border-primary/30"
                >
                  {file.type.startsWith('image/') ? <ImageIcon size={16} className="text-primary" /> : <FileText size={16} className="text-secondary" />}
                  <span className="text-[11px] font-black max-w-[100px] truncate">{file.name}</span>
                  <button onClick={() => removeFile(idx)} className="p-1 hover:bg-error/10 hover:text-error rounded-full transition-colors">
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="p-8 border-t border-surface-container-high bg-neutral-100/50 backdrop-blur-md shrink-0">
          <form onSubmit={handleSend} className="relative group">
            <input 
              type="file" 
              ref={fileInputRef} 
              multiple 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,.pdf,.xlsx,.xls,.txt"
            />
            <div className="flex items-center gap-3 bg-white rounded-[2rem] border-2 border-transparent focus-within:border-primary/20 shadow-xl transition-all pr-3 pl-3 py-2">
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-on-surface-variant hover:bg-primary/10 hover:text-primary rounded-2xl transition-all active:scale-95"
                title="파일 첨부 (이미지, PDF, 엑셀)"
              >
                <Paperclip size={24} />
              </button>
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="질문을 입력하거나 파일을 첨부하세요..."
                className="flex-1 py-4 bg-transparent text-sm font-black focus:outline-none placeholder:text-neutral-400"
              />
              <button 
                type="submit" 
                disabled={(!input.trim() && selectedFiles.length === 0) || loading}
                className="p-4 bg-primary text-white rounded-[1.5rem] shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:pointer-events-none"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
          <div className="mt-4 flex items-center justify-between px-4">
             <p className="text-[10px] font-bold text-on-surface-variant/60 flex items-center gap-1.5 uppercase tracking-tighter">
               <span className="w-1 h-1 bg-primary/40 rounded-full" />
               Gemini 3.1 Pro + Flash-Lite 하이브리드 모드 가동 중
             </p>
             <p className="text-[10px] font-bold text-primary/60 italic">2026 Edu-Safe AI Engine v4.2</p>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default AIChatModal;
