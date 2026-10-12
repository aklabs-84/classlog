import { createContext, useContext, type ReactNode } from 'react';

// "강사용 쪽지" — 자료 에디터에서 콜아웃 종류를 "강사용"으로 고르면 `<div data-callout="teacher">`로 저장된다.
// 강사 화면(teacherTools)에서만 보이고, 학생 화면·발표 화면·인쇄에서는 아무것도 그리지 않는다.
// 기본값이 false(숨김)라서 Provider가 없는 화면은 자동으로 학생 화면처럼 동작한다.
export const TeacherViewContext = createContext(false);

// 쪽지 안에서는 학생 입력칸([ ], ___, 빈 표 칸)을 만들지 않는다 — 강사 화면과 학생 화면의 입력칸 순번이 어긋나지 않게
export const InTeacherNoteContext = createContext(false);

export const TeacherNote = ({ children }: { children: ReactNode }) => {
  const isTeacherView = useContext(TeacherViewContext);
  if (!isTeacherView) return null;
  return (
    <InTeacherNoteContext.Provider value>
      <div data-teacher-note className="my-4 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/70 px-4 py-3 text-violet-950">
        <p className="mb-2 text-xs font-black tracking-wide text-violet-700">🧑‍🏫 강사용 쪽지 · 학생 화면에는 보이지 않아요</p>
        <div className="text-sm [&>p]:m-0 [&>p]:mb-2 [&>p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2">{children}</div>
      </div>
    </InTeacherNoteContext.Provider>
  );
};
