// RichEditor의 CalloutExtension이 `<div data-callout="...">`로 저장한 콜아웃을
// 마크다운 뷰어(자료 에디터 미리보기 외 학생/클래스룸 자료 뷰어)에서 공통으로 렌더링하기 위한 컴포넌트.
import { TeacherNote } from './teacherOnly';
import { StepCarousel } from './StepCarousel';

const CALLOUT_STYLES: Record<string, { icon: string; classes: string }> = {
  info: { icon: '💡', classes: 'bg-blue-50 border-blue-200 text-blue-900' },
  warning: { icon: '⚠️', classes: 'bg-amber-50 border-amber-200 text-amber-900' },
  tip: { icon: '✅', classes: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
  important: { icon: '❗', classes: 'bg-red-50 border-red-200 text-red-900' },
};

export const renderMaterialCallout = (props: any) => {
  const { children, ...rest } = props;
  const type = rest['data-callout'];
  if (type === 'teacher') return <TeacherNote>{children}</TeacherNote>;
  if (type === 'steps') return <StepCarousel>{children}</StepCarousel>;
  const style = type ? CALLOUT_STYLES[type] : undefined;
  if (!style) return <div {...rest}>{children}</div>;
  return (
    <div className={`mv-callout mv-c-${type} my-3 rounded-xl border-2 flex gap-3 px-4 py-3 ${style.classes}`}>
      <span className="shrink-0 text-lg leading-none mt-0.5">{style.icon}</span>
      <div className="flex-1 min-w-0 text-sm [&>p]:m-0 [&>p]:mb-2 [&>p:last-child]:mb-0">{children}</div>
    </div>
  );
};
