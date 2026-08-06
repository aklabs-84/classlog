import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BellRing, X, ArrowRight } from 'lucide-react';
import { useClassAlarm, getAlarmMessage } from '../lib/classAlarmContext';

const FloatingClassAlarm = () => {
  const { activeAlerts, dismissAlert } = useClassAlarm();
  const navigate = useNavigate();

  const widget = (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: 340 }}>
      <AnimatePresence>
        {activeAlerts.map((alert) => {
          const { body: alertBody } = getAlarmMessage(alert);
          return (
          <motion.div
            key={alert.key}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="pointer-events-auto rounded-2xl shadow-2xl border border-white/30 backdrop-blur-xl overflow-hidden"
            style={{
              background:
                alert.type === 'break'
                  ? 'rgba(245,158,11,0.95)'
                  : alert.type === 'attendance'
                    ? 'rgba(37,99,235,0.95)'
                    : 'rgba(239,68,68,0.95)',
            }}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <motion.div
                  animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
                  transition={{ repeat: Infinity, duration: 1.4, repeatDelay: 1 }}
                  className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"
                >
                  <BellRing size={16} className="text-white" />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm leading-tight">{alert.className}</p>
                  <p className="text-white/90 text-xs font-bold mt-0.5">{alertBody}</p>
                </div>
                <button
                  onClick={() => dismissAlert(alert.key)}
                  className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/25 text-white/80 hover:text-white transition-all flex items-center justify-center shrink-0"
                  title="닫기"
                >
                  <X size={13} />
                </button>
              </div>
              <button
                onClick={() => {
                  dismissAlert(alert.key);
                  navigate(
                    alert.type === 'attendance'
                      ? `/classroom?id=${alert.classId}&tab=attendance`
                      : `/activity-log?classId=${alert.classId}`
                  );
                }}
                className={`mt-3 w-full py-2.5 rounded-xl bg-white font-black text-xs flex items-center justify-center gap-1.5 hover:bg-white/90 transition-all ${alert.type === 'break' ? 'text-amber-600' : alert.type === 'attendance' ? 'text-blue-600' : 'text-red-600'}`}
              >
                {alert.type === 'attendance' ? '지금 출석체크 하러 가기' : '지금 작성하러 가기'} <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  return createPortal(widget, document.body);
};

export default FloatingClassAlarm;
