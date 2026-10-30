import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// 질문·건의함에 새 글/답변/삭제가 생기면 onChange를 호출 (내가 볼 수 있는 건의만 도착)
export function useSuggestionRealtime(onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const channel = supabase
      .channel(`suggestions-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_suggestions' }, () => ref.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
}
