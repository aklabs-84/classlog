import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import RichEditor from '../components/RichEditor';
import {
  MessageSquare, Bug, Megaphone, Lightbulb, BookOpen, MessageCircle,
  Send, Loader2, Plus, X, Trash2, Clock, ArrowLeft, Users, ChevronDown,
} from 'lucide-react';

// ── WebP 변환 + 리사이즈 (최대 1280px) ───────────────────────────────────────
const compressToWebP = (file: File, maxWidth = 1280, quality = 0.85): Promise<File> =>
  new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' })
          : file);
      }, 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

// ── 게시글 마크다운 렌더링용 컴포넌트 (자료실 에디터의 mdComponents를 간소화) ──────
const mdComponents: any = {
  h1: ({ children }: any) => <h1 className="text-xl font-black mb-3 mt-5 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-lg font-black mb-2 mt-4 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-base font-black mb-2 mt-3 text-on-surface">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 leading-relaxed text-sm font-medium text-on-surface">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-on-surface">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-xl">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) return <code className="bg-surface-container px-1.5 py-0.5 rounded text-sm font-mono text-primary">{children}</code>;
    return <code className={className}>{children}</code>;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">{children}</a>
  ),
  img: ({ src, alt }: any) => <img src={src} alt={alt} className="max-w-full rounded-xl my-3 shadow" />,
  hr: () => <hr className="border-surface-container my-5" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-3"><table className="w-full border-collapse text-sm">{children}</table></div>
  ),
  th: ({ children }: any) => <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-surface-container px-3 py-2">{children}</td>,
};

type Category = 'free' | 'bug' | 'request' | 'idea' | 'material';

const CATEGORIES: { key: Category; label: string; icon: any; color: string }[] = [
  { key: 'free', label: '자유', icon: MessageCircle, color: 'text-neutral-500 bg-neutral-100' },
  { key: 'bug', label: '버그신고', icon: Bug, color: 'text-red-500 bg-red-50' },
  { key: 'request', label: '요청사항', icon: Megaphone, color: 'text-amber-500 bg-amber-50' },
  { key: 'idea', label: '아이디어공유', icon: Lightbulb, color: 'text-primary bg-primary/10' },
  { key: 'material', label: '자료공유', icon: BookOpen, color: 'text-emerald-500 bg-emerald-50' },
];

const categoryMeta = (key: string) => CATEGORIES.find(c => c.key === key) ?? CATEGORIES[0];

type Post = {
  id: string;
  author_id: string;
  category: Category;
  title: string;
  content: string;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
  comments: { count: number }[];
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const Community = () => {
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [writeOpen, setWriteOpen] = useState(false);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('community_posts')
      .select('*, author:profiles(full_name, avatar_url), comments:community_comments(count)')
      .order('created_at', { ascending: false });
    if (!error && data) setPosts(data as unknown as Post[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const openPost = async (post: Post) => {
    setSelectedPost(post);
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from('community_comments')
      .select('*, author:profiles(full_name, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    if (!error && data) setComments(data as unknown as Comment[]);
    setCommentsLoading(false);
  };

  const handleSendComment = async () => {
    if (!user || !selectedPost || !commentText.trim()) return;
    setCommentSending(true);
    const { data, error } = await supabase
      .from('community_comments')
      .insert({ post_id: selectedPost.id, author_id: user.id, content: commentText.trim() })
      .select('*, author:profiles(full_name, avatar_url)')
      .single();
    if (!error && data) {
      setComments(prev => [...prev, data as unknown as Comment]);
      setCommentText('');
      setPosts(prev => prev.map(p => p.id === selectedPost.id
        ? { ...p, comments: [{ count: (p.comments?.[0]?.count ?? 0) + 1 }] }
        : p));
    }
    setCommentSending(false);
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('이 글을 삭제하시겠습니까? 삭제하면 되돌릴 수 없습니다.')) return;
    setDeletingId(id);
    const { error } = await supabase.from('community_posts').delete().eq('id', id);
    if (!error) {
      setPosts(prev => prev.filter(p => p.id !== id));
      if (selectedPost?.id === id) setSelectedPost(null);
    }
    setDeletingId(null);
  };

  const handleSendReply = async (parentId: string) => {
    if (!user || !selectedPost || !replyText.trim()) return;
    setReplySending(true);
    const { data, error } = await supabase
      .from('community_comments')
      .insert({ post_id: selectedPost.id, author_id: user.id, parent_id: parentId, content: replyText.trim() })
      .select('*, author:profiles(full_name, avatar_url)')
      .single();
    if (!error && data) {
      setComments(prev => [...prev, data as unknown as Comment]);
      setReplyText('');
      setReplyingTo(null);
      setPosts(prev => prev.map(p => p.id === selectedPost.id
        ? { ...p, comments: [{ count: (p.comments?.[0]?.count ?? 0) + 1 }] }
        : p));
    }
    setReplySending(false);
  };

  const handleDeleteComment = async (id: string) => {
    const { error } = await supabase.from('community_comments').delete().eq('id', id);
    if (!error) {
      const removedCount = comments.filter(c => c.id === id || c.parent_id === id).length;
      setComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
      if (selectedPost) {
        setPosts(prev => prev.map(p => p.id === selectedPost.id
          ? { ...p, comments: [{ count: Math.max(0, (p.comments?.[0]?.count ?? removedCount) - removedCount) }] }
          : p));
      }
    }
  };

  const visiblePosts = filter === 'all' ? posts : posts.filter(p => p.category === filter);

  if (selectedPost) {
    const meta = categoryMeta(selectedPost.category);
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-3xl mx-auto">
        <button
          onClick={() => setSelectedPost(null)}
          className="flex items-center gap-2 text-sm font-black text-on-surface-variant/60 hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} /> 목록으로
        </button>

        <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md ${meta.color}`}>
              <meta.icon size={11} /> {meta.label}
            </span>
            <span className="ml-auto text-[11px] text-on-surface-variant font-bold flex items-center gap-1">
              <Clock size={11} />{formatDate(selectedPost.created_at)}
            </span>
          </div>
          <h1 className="text-xl font-black text-on-surface mb-2">{selectedPost.title}</h1>
          <p className="text-sm font-bold text-on-surface-variant/60 mb-4">
            {selectedPost.author?.full_name || '탈퇴한 사용자'}
          </p>
          <div className="text-sm text-on-surface leading-relaxed">
            <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {selectedPost.content}
            </ReactMarkdown>
          </div>
          {(user?.id === selectedPost.author_id || profile?.is_admin) && (
            <button
              onClick={() => handleDeletePost(selectedPost.id)}
              disabled={deletingId === selectedPost.id}
              className="mt-4 flex items-center gap-1.5 text-[11px] font-black text-neutral-300 hover:text-rose-500 transition-colors"
            >
              {deletingId === selectedPost.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} 삭제
            </button>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-6">
          <p className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-widest mb-4">
            댓글 {comments.length}
          </p>
          {commentsLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-on-surface-variant/40 font-bold py-4 text-center">첫 댓글을 남겨보세요.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {comments.filter(c => !c.parent_id).map(c => (
                <div key={c.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-black">
                      {(c.author?.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-on-surface">{c.author?.full_name || '탈퇴한 사용자'}</span>
                        <span className="text-[10px] text-on-surface-variant/40 font-bold">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-on-surface/90 mt-0.5 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                      <button
                        onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(''); }}
                        className="mt-1 text-[11px] font-black text-on-surface-variant/50 hover:text-primary transition-colors"
                      >
                        답글
                      </button>
                    </div>
                    {(user?.id === c.author_id || profile?.is_admin) && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="shrink-0 text-neutral-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="pl-11 mt-3 space-y-3">
                    {comments.filter(r => r.parent_id === c.id).map(r => (
                      <div key={r.id} className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0 text-[11px] font-black">
                          {(r.author?.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-on-surface">{r.author?.full_name || '탈퇴한 사용자'}</span>
                            <span className="text-[10px] text-on-surface-variant/40 font-bold">{formatDate(r.created_at)}</span>
                          </div>
                          <p className="text-sm font-medium text-on-surface/90 mt-0.5 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                        </div>
                        {(user?.id === r.author_id || profile?.is_admin) && (
                          <button
                            onClick={() => handleDeleteComment(r.id)}
                            className="shrink-0 text-neutral-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}

                    {replyingTo === c.id && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !replySending) handleSendReply(c.id); }}
                          placeholder="답글을 입력하세요..."
                          maxLength={500}
                          className="flex-1 px-3.5 py-2 bg-surface-container rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                        <button
                          onClick={() => handleSendReply(c.id)}
                          disabled={replySending || !replyText.trim()}
                          className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-40 transition-all shrink-0"
                        >
                          {replySending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-3 border-t border-neutral-100">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !commentSending) handleSendComment(); }}
              placeholder="댓글을 입력하세요..."
              maxLength={500}
              className="flex-1 px-4 py-2.5 bg-surface-container rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button
              onClick={handleSendComment}
              disabled={commentSending || !commentText.trim()}
              className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 transition-all shrink-0"
            >
              {commentSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black">커뮤니티</h1>
            <p className="text-sm text-on-surface-variant font-bold mt-0.5">
              버그신고, 요청사항, 아이디어와 수업 사례를 함께 나눠보세요.
            </p>
          </div>
        </div>
        <button
          onClick={() => setWriteOpen(true)}
          className="flex items-center gap-2 px-5 py-3 btn-gradient rounded-2xl font-black text-sm shadow-md shadow-primary/20 active:scale-95 transition-all"
        >
          <Plus size={16} /> 글쓰기
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${filter === 'all' ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary'}`}
        >
          전체
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${filter === c.key ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary'}`}
          >
            <c.icon size={12} /> {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 size={36} className="animate-spin text-primary" />
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-30">
          <MessageSquare size={56} />
          <p className="font-black text-lg">아직 등록된 글이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {visiblePosts.map(p => {
              const meta = categoryMeta(p.category);
              return (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onClick={() => openPost(p)}
                  className="w-full text-left bg-white rounded-2xl border border-neutral-100 shadow-sm hover:border-primary/20 hover:shadow-md transition-all p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md ${meta.color}`}>
                      <meta.icon size={10} /> {meta.label}
                    </span>
                    <span className="ml-auto text-[11px] text-on-surface-variant font-bold flex items-center gap-1">
                      <Clock size={10} />{formatDate(p.created_at)}
                    </span>
                  </div>
                  <p className="font-black text-on-surface text-sm mb-1 truncate">{p.title}</p>
                  <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/60 font-bold">
                    <span>{p.author?.full_name || '탈퇴한 사용자'}</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={10} /> {p.comments?.[0]?.count ?? 0}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <WritePostModal
        isOpen={writeOpen}
        onClose={() => setWriteOpen(false)}
        onCreated={(post) => { setPosts(prev => [post, ...prev]); setWriteOpen(false); }}
      />
    </div>
  );
};

const WritePostModal = ({ isOpen, onClose, onCreated }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (post: Post) => void;
}) => {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState<Category>('free');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const reset = () => { setCategory('free'); setTitle(''); setContent(''); setCategoryMenuOpen(false); };

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [categoryMenuOpen]);

  const handleUploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('로그인 필요');
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기가 너무 큽니다. 50MB 이하 이미지만 업로드 가능합니다.');
      throw new Error('파일 크기 초과');
    }
    setUploading(true);
    try {
      const compressed = await compressToWebP(file);
      if (compressed.size > 20 * 1024 * 1024) {
        alert('변환 후에도 20MB를 초과합니다. 더 작은 이미지를 사용해주세요.');
        throw new Error('파일 크기 초과');
      }
      const path = `community/${user.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
      if (error) throw error;
      const { data } = supabase.storage.from('student-attachments').getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !title.trim() || !content.trim()) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('community_posts')
      .insert({ author_id: user.id, category, title: title.trim(), content: content.trim() })
      .select('*, author:profiles(full_name, avatar_url), comments:community_comments(count)')
      .single();
    if (!error && data) {
      if (category === 'bug') {
        fetch('/api/slack?type=bug-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            user_name: profile?.full_name || '익명',
            user_email: profile?.email || user?.email || '',
            title: title.trim(),
            description: content.trim(),
            page_url: window.location.origin + '/community',
          }),
        }).catch(() => {});
      }
      onCreated(data as unknown as Post);
      reset();
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col bg-white">
      <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-8 py-3 sm:py-4 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0">
          <X size={18} className="text-gray-400" />
        </button>
        <p className="font-black text-base text-gray-900 truncate flex-1 min-w-0 sm:flex-none sm:min-w-fit">새 글 작성</p>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <div className="relative" ref={categoryMenuRef}>
            <button
              type="button"
              onClick={() => setCategoryMenuOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${categoryMeta(category).color} hover:opacity-80`}
            >
              {(() => { const Icon = categoryMeta(category).icon; return <Icon size={13} />; })()}
              <span className="hidden sm:inline">{categoryMeta(category).label}</span>
              <ChevronDown size={12} className={`transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {categoryMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-30">
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => { setCategory(c.key); setCategoryMenuOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-black text-left transition-colors ${category === c.key ? 'text-primary bg-primary/5' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <c.icon size={13} /> {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || uploading || !title.trim() || !content.trim()}
            className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 btn-gradient disabled:opacity-40 text-white font-black text-xs sm:text-sm rounded-xl transition-all active:scale-95 shrink-0"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span className="sm:hidden">{loading ? '등록 중' : '등록'}</span>
            <span className="hidden sm:inline">{loading ? '등록 중...' : '등록하기'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            className="w-full px-1 py-2 text-xl font-black outline-none border-b border-transparent focus:border-primary/20 transition-all mb-4"
            maxLength={80}
          />
          <RichEditor
            value={content}
            onChange={setContent}
            onUploadImage={handleUploadImage}
            onUploadingChange={setUploading}
            uploading={uploading}
            minHeight="calc(100vh - 260px)"
            stickyToolbar
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Community;
