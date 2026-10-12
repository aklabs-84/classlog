import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// 선생님이 교실 화면(TV·빔프로젝터)에 띄워 학생에게 보여 주는 "학생용 사용 안내"
// 입장 방식에 따라 입장 단계가 달라지고, 뒤에는 기록·결과 제출 안내가 공통으로 이어진다

interface GuideStep {
  title: string;
  lines: string[];
  note?: string;
  showEntry?: boolean;
}

interface Props {
  entryCode?: string;
  entryMode?: string;
  onClose: () => void;
}

const ENTRY_URL = 'https://classlog-ai.vercel.app/classroom-entry';

const buildSteps = (mode: string): GuideStep[] => {
  const enter: GuideStep = {
    title: '1. 수업에 들어가요',
    lines: ['QR 코드를 카메라로 찍거나,', '인터넷 주소 창에 아래 주소를 쓰고 입장 코드를 넣어요.'],
    showEntry: true,
  };
  let entry: GuideStep[];
  if (mode === 'live_roster') {
    entry = [
      enter,
      { title: '2. 내 번호와 이름을 써요', lines: ['번호 칸에는 내 번호, 이름 칸에는 내 이름을 써요.', '다 썼으면 "제출하기"를 눌러요.'], note: '친구 것까지 쓰지 않아요. 잘못 썼다면 선생님께 말해요.' },
      { title: '3. 선생님이 확인할 때까지 기다려요', lines: ['"선생님이 수락하면 자동으로 넘어가요"가 보이면 성공이에요.', '화면을 끄지 말고 잠깐만 기다려요.'] },
      { title: '4. 내 이름을 눌러 들어가요', lines: ['명단에서 내 이름을 눌러요.', '처음이면 4자리 비밀번호(PIN)를 만들어요.', '다음부터는 같은 PIN을 넣어요.'], note: 'PIN은 친구에게 알려 주지 않아요. 나만 아는 숫자로 정해요.' },
    ];
  } else if (mode === 'common_named') {
    entry = [enter, { title: '2. 내 이름을 써요', lines: ['이름 칸에 내 이름을 쓰고 들어가요.', '비밀번호(PIN)는 없어요.'], note: '친구 이름을 쓰면 안 돼요.' }];
  } else if (mode === 'common_anon') {
    entry = [enter, { title: '2. 바로 들어가요', lines: ['입장 코드만 넣으면 바로 들어가요.', '이름은 쓰지 않아요.'] }];
  } else {
    entry = [
      enter,
      { title: '2. 내 이름을 눌러요', lines: ['명단에서 내 이름을 눌러요.', '처음이면 4자리 비밀번호(PIN)를 만들어요.', '다음부터는 같은 PIN을 넣어요.'], note: 'PIN은 친구에게 알려 주지 않아요. 나만 아는 숫자로 정해요.' },
    ];
  }
  const n = entry.length;
  return [
    ...entry,
    { title: `${n + 1}. 오늘 배운 것을 기록해요`, lines: ['아래 메뉴에서 "활동 기록"을 눌러요.', '오늘 주차를 고르고 ① 오늘 배운 것부터 차례로 써요.', '다 쓰면 "활동 기록 제출하기"를 눌러요.'], note: '쓰다가 멈춰도 "임시 저장"을 누르면 나중에 이어 쓸 수 있어요.' },
    { title: `${n + 2}. 만든 결과를 제출해요`, lines: ['아래 메뉴에서 "결과 제출"을 눌러요.', '주차를 고르고 링크·이미지·파일·글 중에서 알맞은 것을 넣어요.', '마지막에 "○주차 결과 제출"을 눌러요.'], note: '조별 수업이면 누가 제출할지 선생님 안내를 따라요.' },
  ];
};

const StudentGuideModal = ({ entryCode, entryMode, onClose }: Props) => {
  const steps = useMemo(() => buildSteps(entryMode || 'roster'), [entryMode]);
  const [idx, setIdx] = useState(0);
  const step = steps[idx];
  const last = idx === steps.length - 1;
  const url = entryCode ? `${ENTRY_URL}?code=${entryCode}` : ENTRY_URL;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(steps.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, steps.length]);

  return createPortal(
    <div role="dialog" aria-label="학생용 사용 안내" className="fixed inset-0 z-[10000] bg-white text-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <p className="text-base font-black text-indigo-600">학생용 사용 안내 · {idx + 1}/{steps.length}</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="p-2 rounded-xl text-gray-500 hover:bg-gray-100"><X size={26} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-[1fr_auto] items-start">
          <div>
            <h2 className="text-3xl md:text-5xl font-black leading-tight mb-6">{step.title}</h2>
            <ul className="space-y-3">
              {step.lines.map((l, i) => (
                <li key={i} className="text-xl md:text-3xl font-bold leading-snug text-gray-800">{l}</li>
              ))}
            </ul>
            {step.note && (
              <p className="mt-6 text-lg md:text-2xl font-bold leading-snug bg-amber-50 text-amber-900 rounded-2xl px-5 py-4">{step.note}</p>
            )}
          </div>
          {step.showEntry && (
            <div className="text-center bg-indigo-50 rounded-3xl p-6">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`}
                alt="학생 입장용 QR 코드"
                className="w-56 h-56 md:w-72 md:h-72 mx-auto bg-white p-3 rounded-2xl"
              />
              <p className="mt-4 text-base md:text-lg font-black text-indigo-700">classlog-ai.vercel.app/classroom-entry</p>
              {entryCode && (
                <>
                  <p className="mt-3 text-base font-black text-indigo-700">입장 코드</p>
                  <p className="text-4xl md:text-5xl font-black tracking-[0.2em] text-indigo-900">{entryCode}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-6 py-4 border-t border-gray-200 shrink-0">
        <button type="button" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
          className="flex items-center gap-1 px-6 py-3 rounded-2xl text-lg font-black bg-gray-100 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft size={22} />이전</button>
        <button type="button" onClick={() => (last ? onClose() : setIdx(idx + 1))}
          className="flex items-center gap-1 px-8 py-3 rounded-2xl text-lg font-black text-white bg-indigo-600 hover:bg-indigo-700">{last ? '닫기' : '다음'}{!last && <ChevronRight size={22} />}</button>
      </div>
    </div>,
    document.body,
  );
};

export default StudentGuideModal;
