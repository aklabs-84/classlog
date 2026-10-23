import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { ResumeData } from '../../lib/portfolioResume';

const inputCls = 'w-full px-3 py-2 rounded-xl border border-surface-container bg-surface-container-low/50 text-sm outline-none focus:border-primary/40';
const labelCls = 'block text-xs font-bold text-on-surface-variant mb-1';

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <label className="block">
    <span className={labelCls}>{label}</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
  </label>
);

/** 한 줄에 하나씩 적는 입력칸. 입력 중 줄바꿈이 사라지지 않도록 화면용 글자를 따로 들고 있는다 */
const LinesField = ({ label, value, onChange, placeholder, rows = 4 }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; rows?: number }) => {
  const [raw, setRaw] = useState(value.join('\n'));
  // 순서 이동·삭제처럼 바깥에서 값이 바뀐 경우에만 화면 글자를 맞춘다 (입력 중 빈 줄은 유지)
  const parsed = raw.split('\n').map(s => s.trim()).filter(Boolean).join('\n');
  if (parsed !== value.join('\n')) setRaw(value.join('\n'));
  return (
    <label className="block">
      <span className={labelCls}>{label} <span className="font-normal opacity-70">(한 줄에 하나씩)</span></span>
      <textarea
        value={raw}
        rows={rows}
        placeholder={placeholder}
        onChange={e => { setRaw(e.target.value); onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean)); }}
        className={`${inputCls} resize-y`}
      />
    </label>
  );
};

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="glass rounded-2xl p-4 border border-white/40 space-y-3">
    <div>
      <p className="font-black text-sm text-on-surface">{title}</p>
      {hint && <p className="text-xs text-on-surface-variant mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

/** 항목 목록 편집 공통: 추가 / 삭제 / 위·아래 이동 */
function ListEditor<T>({ items, onChange, makeEmpty, addLabel, render }: {
  items: T[]; onChange: (v: T[]) => void; makeEmpty: () => T; addLabel: string;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-surface-container p-3 space-y-2">
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"><ArrowUp size={14} /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="아래로" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"><ArrowDown size={14} /></button>
            <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="삭제" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
          </div>
          {render(item, patch => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))), i)}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, makeEmpty()])} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
        <Plus size={13} /> {addLabel}
      </button>
    </div>
  );
}

interface Props { value: ResumeData; onChange: (v: ResumeData) => void; }

const ResumeEditor = ({ value: r, onChange }: Props) => {
  const set = <K extends keyof ResumeData>(key: K, v: ResumeData[K]) => onChange({ ...r, [key]: v });

  return (
    <div className="space-y-6">
      <Section title="프로필" hint="이력서 맨 위에 나오는 부분입니다. 사진은 설정 화면에 등록한 프로필 사진이 자동으로 들어갑니다. ">
        <Field label="이름 (비우면 설정의 이름 사용)" value={r.name} onChange={v => set('name', v)} />
        <Field label="직함" value={r.title} onChange={v => set('title', v)} placeholder="예: AI & SW Convergence Expert" />
        <Field label="소속" value={r.org} onChange={v => set('org', v)} placeholder="예: 아크랩스(AKLABS) 대표" />
        <label className="block">
          <span className={labelCls}>한 줄 소개 <span className="font-normal opacity-70">(굵게 보이는 문구, 줄바꿈 가능)</span></span>
          <textarea value={r.lead} rows={2} onChange={e => set('lead', e.target.value)} className={`${inputCls} resize-y`} />
        </label>
        <LinesField label="해시태그" value={r.tags} onChange={v => set('tags', v)} placeholder={'SW 교육\nAI활용교육'} rows={3} />
      </Section>

      <Section title="연락처" hint="기본은 숨김입니다. 아래 스위치를 켜야만 공개 페이지에 전화번호·이메일이 보입니다. 꺼 두면 서버에서 아예 내려 보내지 않습니다.">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="전화번호" value={r.phone} onChange={v => set('phone', v)} placeholder="010-0000-0000" />
          <Field label="이메일" value={r.email} onChange={v => set('email', v)} placeholder="name@example.com" />
        </div>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={r.showContact} onChange={e => set('showContact', e.target.checked)} className="accent-primary w-4 h-4" />
          <span className="text-sm font-bold text-on-surface">공개 페이지에 연락처 보이기</span>
        </label>
      </Section>

      <Section title="경력 · 강의 실적" hint="기관이나 주제별로 묶어서 적습니다. 묶음 안의 내용은 한 줄에 하나씩 적습니다.">
        <ListEditor
          items={r.experience}
          onChange={v => set('experience', v)}
          makeEmpty={() => ({ title: '', org: '', period: '', items: [] })}
          addLabel="경력 묶음 추가"
          render={(g, up) => (
            <>
              <Field label="묶음 제목" value={g.title} onChange={v => up({ title: v })} placeholder="예: 대학교 및 고등교육기관 출강" />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="기관 이름들 (파란 줄로 표시)" value={g.org} onChange={v => up({ org: v })} placeholder="예: 청운대학교 · 우송대학교" />
                <Field label="기간 (선택)" value={g.period} onChange={v => up({ period: v })} placeholder="예: 2023 ~ 현재" />
              </div>
              <LinesField label="내용" value={g.items} onChange={v => up({ items: v })} rows={5} />
            </>
          )}
        />
      </Section>

      <Section title="프로젝트">
        <ListEditor
          items={r.projects}
          onChange={v => set('projects', v)}
          makeEmpty={() => ({ title: '', period: '', desc: '' })}
          addLabel="프로젝트 추가"
          render={(p, up) => (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="프로젝트·기관 이름" value={p.title} onChange={v => up({ title: v })} />
                <Field label="기간 (선택)" value={p.period} onChange={v => up({ period: v })} />
              </div>
              <Field label="한 줄 설명" value={p.desc} onChange={v => up({ desc: v })} />
            </>
          )}
        />
      </Section>

      <Section title="보유 역량 · 사용 도구" hint="왼쪽 칸에 나옵니다.">
        <ListEditor
          items={r.skills}
          onChange={v => set('skills', v)}
          makeEmpty={() => ({ title: '', items: [] })}
          addLabel="역량 묶음 추가"
          render={(s, up) => (
            <>
              <Field label="묶음 이름 (선택, 화면에는 표시되지 않고 정리용)" value={s.title} onChange={v => up({ title: v })} />
              <LinesField label="역량" value={s.items} onChange={v => up({ items: v })} rows={4} />
            </>
          )}
        />
        <LinesField label="사용 도구" value={r.tools} onChange={v => set('tools', v)} rows={4} />
      </Section>

      <Section title="학력">
        <ListEditor
          items={r.education}
          onChange={v => set('education', v)}
          makeEmpty={() => ({ school: '', detail: '', period: '' })}
          addLabel="학력 추가"
          render={(e, up) => (
            <>
              <Field label="학교" value={e.school} onChange={v => up({ school: v })} />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="전공·학위" value={e.detail} onChange={v => up({ detail: v })} />
                <Field label="기간" value={e.period} onChange={v => up({ period: v })} placeholder="2021.03 – 2023.02" />
              </div>
            </>
          )}
        />
      </Section>

      <Section title="수상 · 출판 · 저술">
        <p className="text-xs font-bold text-on-surface-variant">수상</p>
        <ListEditor
          items={r.awards}
          onChange={v => set('awards', v)}
          makeEmpty={() => ({ title: '', detail: '' })}
          addLabel="수상 추가"
          render={(a, up) => (
            <>
              <Field label="수상명" value={a.title} onChange={v => up({ title: v })} />
              <Field label="연도 · 수여 기관" value={a.detail} onChange={v => up({ detail: v })} />
            </>
          )}
        />
        <LinesField label="출판·저술" value={r.publications} onChange={v => set('publications', v)} rows={3} placeholder="《책 제목》 집필" />
      </Section>

      <Section title="강점">
        <LinesField label="강점" value={r.strengths} onChange={v => set('strengths', v)} rows={5} />
      </Section>

      <Section title="화면 옵션">
        <div>
          <p className="text-sm font-bold text-on-surface mb-2">이력서 모양</p>
          <div className="flex flex-wrap gap-2">
            {([['sidebar', '문서형 (왼쪽 칸)'], ['editorial', '잡지형 (큰 제목)']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => set('design', v)}
                className={`px-3 py-2 rounded-lg border text-xs font-bold ${r.design === v ? 'border-primary bg-primary/10 text-primary' : 'border-surface-container text-on-surface-variant'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={r.showClassHistory} onChange={e => set('showClassHistory', e.target.checked)} className="accent-primary w-4 h-4" />
          <span className="text-sm font-bold text-on-surface">이력서 아래에 "앱에서 진행한 수업" 목록 함께 보이기</span>
        </label>
      </Section>
    </div>
  );
};

export default ResumeEditor;
