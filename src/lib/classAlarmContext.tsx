import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { playAlarm } from './timerContext';

interface ClassAlarmRow {
  id: string;
  name: string;
  class_start_time: string | null;
  class_end_time: string | null;
  end_alarm_minutes: number[] | null;
  break_times: string[] | null;
  start_date: string | null;
  end_date: string | null;
  is_closed: boolean | null;
  is_archived: boolean | null;
  today_started_at: string | null;
  today_ended_at: string | null;
  schedule_mode: 'weekday' | 'dates' | null;
  class_days_of_week: number[] | null;
  class_specific_dates: string[] | null;
}

export interface ClassAlarmAlert {
  key: string;
  classId: string;
  className: string;
  type: 'class_end' | 'break' | 'attendance';
  minutesLeft: number;
}

const BREAK_ALARM_MINUTES = 5;

// 스마트폰/태블릿/노트북 어디서든(인앱 배너 · OS 알림) 동일한 문구가 보이도록 메시지를 한 곳에서 관리
export const getAlarmMessage = (alert: ClassAlarmAlert): { title: string; body: string } => ({
  title: alert.className,
  body:
    alert.type === 'break'
      ? `쉬는시간 ${alert.minutesLeft}분 전이에요! 잠시 정리할 시간입니다.`
      : alert.type === 'attendance'
        ? '수업 시작 시간이에요! 출석체크를 진행해주세요.'
        : `수업 종료 ${alert.minutesLeft}분 전! 활동 기록을 작성해주세요.`,
});

interface ClassAlarmContextValue {
  activeAlerts: ClassAlarmAlert[];
  dismissAlert: (key: string) => void;
}

const ClassAlarmContext = createContext<ClassAlarmContextValue | null>(null);

export const useClassAlarm = () => {
  const ctx = useContext(ClassAlarmContext);
  if (!ctx) throw new Error('useClassAlarm must be used within ClassAlarmProvider');
  return ctx;
};

const TRIGGERED_STORAGE_KEY = 'class_alarm_triggered';

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getTodayStr = () => toLocalDateStr(new Date());

const loadTriggeredSet = (): Set<string> => {
  try {
    const raw = localStorage.getItem(TRIGGERED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: string[] = JSON.parse(raw);
    const today = getTodayStr();
    // 오늘 날짜가 아닌 키는 정리
    const valid = parsed.filter((k) => k.endsWith(today));
    return new Set(valid);
  } catch {
    return new Set();
  }
};

const saveTriggeredSet = (set: Set<string>) => {
  localStorage.setItem(TRIGGERED_STORAGE_KEY, JSON.stringify(Array.from(set)));
};

export const ClassAlarmProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassAlarmRow[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<ClassAlarmAlert[]>([]);
  const triggeredRef = useRef<Set<string>>(loadTriggeredSet());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalsRef = useRef<Map<string, number>>(new Map());

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }, []);

  const fetchClasses = useCallback(async () => {
    if (!user) {
      setClasses([]);
      return;
    }
    const { data } = await supabase
      .from('classes')
      .select('id, name, class_start_time, class_end_time, end_alarm_minutes, break_times, start_date, end_date, is_closed, is_archived, today_started_at, today_ended_at, schedule_mode, class_days_of_week, class_specific_dates')
      .eq('teacher_id', user.id)
      .eq('is_closed', false);
    setClasses((data || []).filter((c) => {
      if (c.is_archived) return false;
      const hasStartAlarm = !!c.class_start_time;
      const hasEndAlarm = !!c.class_end_time && (c.end_alarm_minutes || []).length > 0;
      const hasBreakAlarm = (c.break_times || []).length > 0;
      // 알람 소리 설정과 무관하게, 학기 자동 종료(end_date)·출석 세션 자동 종료(class_end_time)
      // 대상이 되는 클래스도 폴링 목록에 포함시켜야 함
      const needsAutoClose = !!c.end_date;
      const needsAutoSessionEnd = !!c.class_end_time;
      return hasStartAlarm || hasEndAlarm || hasBreakAlarm || needsAutoClose || needsAutoSessionEnd;
    }));
  }, [user]);

  useEffect(() => {
    fetchClasses();
    const refreshInterval = setInterval(fetchClasses, 5 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, [fetchClasses]);

  // 알람이 걸린 클래스가 있으면, 스마트폰/태블릿/노트북 등 기기 종류와 무관하게
  // 브라우저 표준 Notification API로 동일한 알림을 받을 수 있도록 권한을 미리 요청
  useEffect(() => {
    if (classes.length === 0) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [classes.length]);

  // 학기 종료(is_closed)·출석 세션 종료(today_ended_at) 자동 처리 — 동일 클래스에 대해
  // 다음 5분 주기 재조회 전까지 중복 write가 발생하지 않도록 처리 중 여부를 추적
  const autoProcessingRef = useRef<Set<string>>(new Set());

  const autoCloseClass = useCallback(async (classId: string) => {
    const key = `close_${classId}`;
    if (autoProcessingRef.current.has(key)) return;
    autoProcessingRef.current.add(key);
    try {
      await supabase.from('classes').update({ is_closed: true }).eq('id', classId);
      setClasses((prev) => prev.filter((c) => c.id !== classId));
    } finally {
      autoProcessingRef.current.delete(key);
    }
  }, []);

  const autoEndSession = useCallback(async (classId: string) => {
    const key = `end_${classId}`;
    if (autoProcessingRef.current.has(key)) return;
    autoProcessingRef.current.add(key);
    try {
      const now = new Date().toISOString();
      await supabase.from('classes').update({ today_ended_at: now }).eq('id', classId);
      setClasses((prev) => prev.map((c) => (c.id === classId ? { ...c, today_ended_at: now } : c)));
    } finally {
      autoProcessingRef.current.delete(key);
    }
  }, []);

  const dismissAlert = useCallback((key: string) => {
    const alert = activeAlerts.find((a) => a.key === key);

    setActiveAlerts((prev) => prev.filter((a) => a.key !== key));
    const intervalId = alarmIntervalsRef.current.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      alarmIntervalsRef.current.delete(key);
    }

    // 이 기기에서 정지했다는 사실을 서버에 기록 — PWA로 설치된 다른 기기나
    // 열려있는 다른 브라우저 탭도 동일한 알람을 함께 정지시키기 위함
    if (alert) {
      supabase
        .rpc('dismiss_class_alarm_owned', {
          p_trigger_key: alert.key,
          p_class_id: alert.classId,
          p_type: alert.type,
          p_minutes_left: alert.minutesLeft,
          p_class_name: alert.className,
        })
        .then(({ error }) => {
          if (error) console.error('[classAlarm] 기기 간 정지 동기화 실패', error);
        });
    }
  }, [activeAlerts]);

  // 알람이 울리는 중에만(불필요한 네트워크 요청 방지) 다른 기기에서 이미 정지시켰는지 주기적으로 확인
  useEffect(() => {
    if (activeAlerts.length === 0) return;

    const checkRemoteDismiss = async () => {
      const keys = activeAlerts.map((a) => a.key);
      const { data } = await supabase
        .from('class_alarm_triggers')
        .select('trigger_key')
        .in('trigger_key', keys)
        .not('dismissed_at', 'is', null);

      (data || []).forEach(({ trigger_key }) => {
        setActiveAlerts((prev) => prev.filter((a) => a.key !== trigger_key));
        const intervalId = alarmIntervalsRef.current.get(trigger_key);
        if (intervalId) {
          clearInterval(intervalId);
          alarmIntervalsRef.current.delete(trigger_key);
        }
      });
    };

    const pollId = window.setInterval(checkRemoteDismiss, 5000);
    return () => clearInterval(pollId);
  }, [activeAlerts]);

  useEffect(() => {
    const intervalsMap = alarmIntervalsRef.current;
    return () => {
      intervalsMap.forEach((intervalId) => clearInterval(intervalId));
      intervalsMap.clear();
    };
  }, []);

  useEffect(() => {
    // 백그라운드 탭에서는 setInterval이 스로틀링되어 "정확히 그 분"을 놓칠 수 있으므로
    // 목표 시각을 지난 뒤 일정 시간(분) 이내면 여전히 트리거되도록 허용 범위를 둔다
    const TRIGGER_TOLERANCE_MIN = 2;
    const isWithinTriggerWindow = (targetTotalMin: number, nowTotalMin: number) =>
      nowTotalMin >= targetTotalMin && nowTotalMin - targetTotalMin <= TRIGGER_TOLERANCE_MIN;

    // 쉬는시간·수업종료 알람은 "오늘 수업 시작"을 체크해야 작동하고,
    // "오늘 수업 종료"를 체크하면 그날은 더 이상 울리지 않음 (출석체크 알람은 이 조건과 무관하게 항상 작동)
    const isTimestampToday = (ts: string | null, todayStr: string) => !!ts && toLocalDateStr(new Date(ts)) === todayStr;
    const isSessionActiveToday = (cls: ClassAlarmRow, todayStr: string) =>
      isTimestampToday(cls.today_started_at, todayStr) && !isTimestampToday(cls.today_ended_at, todayStr);

    // 출석체크(수업시작) 알람 전용 — 요일/특정 날짜 지정 시 그 날짜에만 울리도록 필터링
    // (schedule_mode가 없으면 기존과 동일하게 기간 내 매일 울림)
    const isScheduledToday = (cls: ClassAlarmRow, todayStr: string, dayOfWeek: number) => {
      if (cls.schedule_mode === 'weekday') return (cls.class_days_of_week || []).includes(dayOfWeek);
      if (cls.schedule_mode === 'dates') return (cls.class_specific_dates || []).includes(todayStr);
      return true;
    };

    const checkAlarms = () => {
      if (classes.length === 0) return;
      const now = new Date();
      const todayStr = getTodayStr();
      const nowTotalMin = now.getHours() * 60 + now.getMinutes();
      const dayOfWeek = now.getDay();

      const triggerAlarm = (triggerKey: string, alert: ClassAlarmAlert) => {
        if (triggeredRef.current.has(triggerKey)) return;

        triggeredRef.current.add(triggerKey);
        saveTriggeredSet(triggeredRef.current);

        setActiveAlerts((prev) => [...prev, alert]);
        try {
          playAlarm(getAudioCtx());
        } catch {
          // AudioContext가 사용자 상호작용 전이라 재생이 막힐 수 있음 — 무시
        }
        // 앱이 백그라운드/다른 탭에 있어도(스마트폰·태블릿·노트북 공통) 동일한 문구로
        // OS 알림이 뜨도록 처리 — 인앱 배너와 같은 getAlarmMessage()를 사용해 문구를 통일
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const { title, body } = getAlarmMessage(alert);
            const notif = new Notification(title, {
              body,
              icon: '/favicon-192.png',
              badge: '/favicon-192.png',
              tag: triggerKey,
            });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch {
            // 알림 생성 실패(권한 변경 등)는 무시 — 인앱 배너로도 동일 문구가 표시됨
          }
        }
        const intervalId = window.setInterval(() => {
          try {
            playAlarm(getAudioCtx());
          } catch {
            // AudioContext가 사용자 상호작용 전이라 재생이 막힐 수 있음 — 무시
          }
        }, 2500);
        alarmIntervalsRef.current.set(triggerKey, intervalId);
      };

      classes.forEach((cls) => {
        if (cls.start_date && cls.start_date > todayStr) return;
        if (cls.end_date && cls.end_date < todayStr) return;

        if (cls.class_start_time && isScheduledToday(cls, todayStr, dayOfWeek)) {
          const [startH, startM] = cls.class_start_time.split(':').map((v) => parseInt(v, 10));
          const startTotalMin = startH * 60 + startM;
          if (isWithinTriggerWindow(startTotalMin, nowTotalMin)) {
            const triggerKey = `${cls.id}_start_${todayStr}`;
            triggerAlarm(triggerKey, { key: triggerKey, classId: cls.id, className: cls.name, type: 'attendance', minutesLeft: 0 });
          }
        }

        if (cls.class_end_time && isSessionActiveToday(cls, todayStr)) {
          const [endH, endM] = cls.class_end_time.split(':').map((v) => parseInt(v, 10));
          const endTotalMin = endH * 60 + endM;

          (cls.end_alarm_minutes || []).forEach((minutes) => {
            const targetTotalMin = endTotalMin - minutes;
            if (targetTotalMin < 0) return;
            if (!isWithinTriggerWindow(targetTotalMin, nowTotalMin)) return;

            const triggerKey = `${cls.id}_${minutes}_${todayStr}`;
            triggerAlarm(triggerKey, { key: triggerKey, classId: cls.id, className: cls.name, type: 'class_end', minutesLeft: minutes });
          });
        }

        if (!isSessionActiveToday(cls, todayStr)) return;

        (cls.break_times || []).forEach((breakTime) => {
          const [breakH, breakM] = breakTime.split(':').map((v) => parseInt(v, 10));
          const breakTotalMin = breakH * 60 + breakM;
          const targetTotalMin = breakTotalMin - BREAK_ALARM_MINUTES;
          if (targetTotalMin < 0) return;
          if (!isWithinTriggerWindow(targetTotalMin, nowTotalMin)) return;

          const triggerKey = `${cls.id}_break_${breakTime}_${todayStr}`;
          triggerAlarm(triggerKey, { key: triggerKey, classId: cls.id, className: cls.name, type: 'break', minutesLeft: BREAK_ALARM_MINUTES });
        });
      });

      // 자동 처리(알람 소리 설정 여부와 무관하게 항상 체크) ─────────────────
      classes.forEach((cls) => {
        // 1) 학기 종료: end_date의 class_end_time(없으면 그날 23:59:59)이 지나면 is_closed 자동 처리
        if (cls.end_date) {
          const cutoff = new Date(`${cls.end_date}T${cls.class_end_time || '23:59:59'}`);
          if (now >= cutoff) {
            autoCloseClass(cls.id);
          }
        }

        // 2) 출석 세션 종료: 오늘 수업을 시작했고 아직 안 끝났는데 class_end_time이 지나면 자동 종료
        if (cls.class_end_time && isSessionActiveToday(cls, todayStr)) {
          const [endH, endM] = cls.class_end_time.split(':').map((v) => parseInt(v, 10));
          const endTotalMin = endH * 60 + endM;
          if (nowTotalMin >= endTotalMin) {
            autoEndSession(cls.id);
          }
        }
      });
    };

    const interval = setInterval(checkAlarms, 20 * 1000);
    checkAlarms();

    // 탭이 백그라운드에 있는 동안 타이머가 스로틀링되어 알람을 놓쳤을 수 있으므로
    // 탭이 다시 보이는 시점에 즉시 한 번 더 확인
    const onVisibilityChange = () => {
      if (!document.hidden) checkAlarms();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [classes, getAudioCtx, autoCloseClass, autoEndSession]);

  return (
    <ClassAlarmContext.Provider value={{ activeAlerts, dismissAlert }}>
      {children}
    </ClassAlarmContext.Provider>
  );
};
