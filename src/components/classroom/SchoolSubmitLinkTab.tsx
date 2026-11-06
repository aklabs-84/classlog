import { useState, useEffect, useCallback } from 'react';
import { Loader2, Copy, Check, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { appConfirm, appToast } from '../../lib/appDialog';

type Props = { classes: { id: string; name: string }[] };
type Cfg = { id: string; name: string; entry_code: string | null; entry_mode: string; submit_link_enabled: boolean; result_review: boolean };
type Pending = { id: string; student_id: string; title: string | null; created_at: string; submission_group: string | null; class_id: string };

/** 학교 화면 > 수업 기록 > '결과 제출 링크': 모든 반의 제출 링크를 한 곳에서 켜고 끄고, 승인 대기 결과를 처리 */
const SchoolSubmitLinkTab = ({ classes }: Props) => {
  const [loading, setLoading] = useState(true);
  const [cfgs, setCfgs] = useState<Cfg[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openQr, setOpenQr] = useState<string | null>(null);
  const idKey = classes.map(c => c.id).join(',');

  const load = useCallback(async () => {
    const ids = idKey ? idKey.split(',') : [];
    if (ids.length === 0) { setLoading(false); return; }
    const { data: cs } = await supabase.from('classes')
      .select('id, name, entry_code, entry_mode, submit_link_enabled, result_review').in('id', ids);
    setCfgs((cs || []).map((c: any) => ({ ...c, submit_link_enabled: !!c.submit_link_enabled, result_review: !!c.result_review })));
    const { data: sts } = await supabase.from('students').select('id, full_name, class_id').in('class_id', ids);
    const stMap: Record<string, { name: string; class_id: string }> = {};
    (sts || []).forEach((s: any) => { stMap[s.id] = { name: s.full_name, class_id: s.class_id }; });
    setNames(Object.fromEntries(Object.entries(stMap).map(([k, v]) => [k, v.name])));
    const sids = Object.keys(stMap);
    if (sids.length > 0) {
      const { data: rs } = await supabase.from('student_results')
        .select('id, student_id, title, created_at, submission_group')
        .eq('status', 'pending').in('student_id', sids).order('created_at', { ascending: false }).limit(300);
      setPending((rs || []).map((r: any) => ({ ...r, class_id: stMap[r.student_id]?.class_id })));
    } else setPending([]);
    setLoading(false);
  }, [idKey]);

  useEffect(() => { load(); }, [load]);

  const save = async (id: string, patch: Partial<Cfg>) => {
    setBusyId(id);
    const { error } = await supabase.from('classes').update(patch).eq('id', id);
    setBusyId(null);
    if (error) { appToast('저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setCfgs(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const review = async (ids: string[], status: 'approved' | 'rejected') => {
    const { data, error } = await supabase.from('student_results').update({ status }).in('id', ids).select('id');
    if (error || !data || data.length === 0) { appToast('승인하지 못했어요. 권한을 확인해 주세요.'); return; }
    setPending(prev => prev.filter(r => !ids.includes(r.id)));
    appToast(status === 'approved' ? '승인했어요. 공유 페이지에 공개돼요.' : '반려했어요.');
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  if (cfgs.length === 0) return <p className="text-sm text-on-surface-variant py-10 text-center">반이 아직 없어요.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-on-surface-variant/70">
        학생이 이름만 입력하고 수업 결과만 올리는 링크예요. 반마다 켜고, 올라온 결과는 승인하면 결과 공유 페이지와 엑셀에 나와요.
      </p>
      <p className="text-xs leading-relaxed text-on-surface-variant bg-surface-container-low rounded-xl p-3">
        이 설정은 <b>전용 링크에만</b> 적용돼요. 새로 들어온 학생은 결과 내기 화면만 보여요. 반의 일반 입장 링크는 따로 열려 있고 이 설정과 상관없어요. 시험은 새 탭(시크릿 창)에서 해 보세요.
      </p>
      {cfgs.map(c => {
        const nameOnly = c.entry_mode === 'common_named';
        const link = `https://classlog-ai.vercel.app/classroom-entry?code=${c.entry_code}&mode=submit`;
        const mine = pending.filter(r => r.class_id === c.id);
        const groups: { key: string; ids: string[]; student_id: string; title: string | null; created_at: string }[] = [];
        mine.forEach(r => {
          const key = r.submission_group || r.id;
          const g = groups.find(x => x.key === key);
          if (g) g.ids.push(r.id); else groups.push({ key, ids: [r.id], student_id: r.student_id, title: r.title, created_at: r.created_at });
        });
        return (
          <div key={c.id} className="surface-card p-4 border border-surface-container-high space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black">{c.name}</h3>
              {groups.length > 0 && <span className="text-xs font-black px-2 py-1 rounded-full bg-red-50 text-red-600">승인 대기 {groups.length}</span>}
            </div>

            {!nameOnly ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs font-bold text-amber-800 leading-relaxed">이 반은 '이름만 입력' 입장 방식이 아니라서 링크를 쓸 수 없어요. 바꾸면 기존 번호/PIN 입장은 쓰이지 않아요.</p>
                <button disabled={busyId === c.id}
                  onClick={async () => { if (await appConfirm('입장 방식을 "이름만 입력"으로 바꿀까요?\n기존 PIN·번호 입장은 쓰이지 않게 돼요.')) save(c.id, { entry_mode: 'common_named' }); }}
                  className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-black disabled:opacity-50">이름만 입력 방식으로 바꾸기</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" className="w-5 h-5 accent-primary" disabled={busyId === c.id} checked={c.submit_link_enabled}
                      onChange={e => save(c.id, e.target.checked ? { submit_link_enabled: true, result_review: true } : { submit_link_enabled: false })} />
                    제출 링크 켜기
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" className="w-5 h-5 accent-primary" disabled={busyId === c.id} checked={c.result_review}
                      onChange={e => save(c.id, { result_review: e.target.checked })} />
                    확인한 뒤 공개
                  </label>
                </div>
                {c.submit_link_enabled && c.entry_code && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopiedId(c.id); setTimeout(() => setCopiedId(null), 2000); }, () => appToast('복사하지 못했어요.'))}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-black">
                        {copiedId === c.id ? <Check size={14} /> : <Copy size={14} />} {copiedId === c.id ? '복사됨' : '링크 복사'}
                      </button>
                      <button onClick={() => setOpenQr(openQr === c.id ? null : c.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-surface-container-high text-xs font-bold text-on-surface-variant">
                        QR 보기 <ChevronDown size={14} className={openQr === c.id ? 'rotate-180' : ''} />
                      </button>
                    </div>
                    {openQr === c.id && (
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`} alt="결과 제출 QR" className="w-40 h-40 rounded-lg border border-surface-container-high bg-white p-2" />
                    )}
                  </div>
                )}
              </>
            )}

            {groups.length > 0 && (
              <div className="space-y-2 pt-1">
                {groups.map(g => (
                  <div key={g.key} className="flex items-center gap-3 p-3 rounded-xl border border-surface-container-high">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{names[g.student_id] || '학생'}{g.ids.length > 1 ? ` · ${g.ids.length}건` : ''}</p>
                      <p className="text-xs text-on-surface-variant truncate">{g.title || '제목 없음'} · {new Date(g.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button onClick={() => review(g.ids, 'rejected')} className="px-3 py-2 rounded-lg border border-surface-container-high text-sm font-bold text-on-surface-variant">반려</button>
                    <button onClick={() => review(g.ids, 'approved')} className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-black">승인</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SchoolSubmitLinkTab;
