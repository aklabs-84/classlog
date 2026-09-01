import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Bell, X, ChevronDown, ChevronUp } from 'lucide-react';

const DISMISSED_KEY = 'dismissed_announcement_id';

const AnnouncementBanner = () => {
  const { user } = useAuth();
  const [ann, setAnn]         = useState<{ id: string; title: string; content: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, content, starts_at, ends_at')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return;

      if (data) {
        const dismissedId = localStorage.getItem(DISMISSED_KEY);
        if (dismissedId !== data.id) {
          setAnn(data);
          setVisible(true);
        }
      }
    })();
  }, [user]);

  const dismiss = () => {
    if (ann) localStorage.setItem(DISMISSED_KEY, ann.id);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && ann && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="bg-amber-500 text-white px-4 md:px-8">
            {/* 헤더 행 */}
            <div className="flex items-center gap-3 py-2.5">
              <Bell size={14} className="shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider opacity-80">공지사항</span>
              <span className="font-black text-sm flex-1 truncate">{ann.title}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  title={expanded ? '접기' : '내용 보기'}
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={dismiss}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  title="닫기"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 확장 내용 */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-3 pt-1 text-sm text-amber-100 leading-relaxed whitespace-pre-wrap border-t border-white/20 pt-2">
                    {ann.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnnouncementBanner;
