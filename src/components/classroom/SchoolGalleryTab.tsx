import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Camera, Download, Star, Copy, Check, Loader2, Link2, Power, RefreshCw, Trash2, Eye, EyeOff, CheckCircle2, X } from 'lucide-react';
import JSZip from 'jszip';
import PhotoConsentPanel from './PhotoConsentPanel';
import { supabase } from '../../lib/supabase';
import { deleteGalleryItem, type GalleryItem } from '../../lib/gallery';
import {
  getUploadKey, createOrRotateUploadKey, setUploadKeyActive, setReviewStatus, setFeatured, buildUploadLink,
  type UploadKey, type ReviewStatus,
} from '../../lib/galleryAssistant';

interface Props {
  userId: string;
  classes: { id: string; name: string }[];
}

const STATUS_LABEL: Record<ReviewStatus, string> = { pending: '확인 대기', approved: '사용 가능', hidden: '숨김' };
const STATUS_CLASS: Record<ReviewStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  hidden: 'bg-gray-200 text-gray-600',
};
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

const SchoolGalleryTab = ({ userId, classes }: Props) => {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [key, setKey] = useState<UploadKey | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | ReviewStatus>('all');
  const [viewing, setViewing] = useState<GalleryItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { if (!classId && classes[0]) setClassId(classes[0].id); }, [classes, classId]);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError('');
    try {
      const [k, res] = await Promise.all([
        getUploadKey(classId),
        supabase.from('class_gallery_items').select('*').eq('class_id', classId).order('created_at', { ascending: false }).limit(300),
      ]);
      if (res.error) throw res.error;
      setKey(k);
      setItems((res.data ?? []) as GalleryItem[]);
    } catch {
      setError('불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch { setError('처리하지 못했습니다. 다시 시도해주세요.'); } finally { setBusy(false); }
  };

  const link = key ? buildUploadLink(key.token) : '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* noop */ }
  };

  const review = (id: string, status: ReviewStatus) => run(async () => {
    await setReviewStatus([id], status);
    setItems(prev => prev.map(i => (i.id === id ? { ...i, review_status: status } : i)));
  });
  const approveAllPending = () => run(async () => {
    const ids = items.filter(i => i.review_status === 'pending').map(i => i.id);
    await setReviewStatus(ids, 'approved');
    setItems(prev => prev.map(i => (i.review_status === 'pending' ? { ...i, review_status: 'approved' } : i)));
  });
  const remove = (item: GalleryItem) => {
    if (!window.confirm('이 사진을 삭제할까요? 되돌릴 수 없습니다.')) return;
    run(async () => {
      await deleteGalleryItem(item.id, item.file_url);
      setItems(prev => prev.filter(i => i.id !== item.id));
      setViewing(neighbor(item));
    });
  };

  const toggleFeatured = (item: GalleryItem) => run(async () => {
    const next = !item.is_featured;
    await setFeatured(item.id, next);
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, is_featured: next } : i)));
    setViewing(v => (v && v.id === item.id ? { ...v, is_featured: next } : v));
  });

  // "사용 가능" 사진만 zip으로 (날짜별 폴더)
  const [zipping, setZipping] = useState(false);
  const downloadZip = async () => {
    const targets = items.filter(i => i.file_type === 'image' && (i.review_status ?? 'approved') === 'approved');
    if (targets.length === 0) { setError('내려받을 "사용 가능" 사진이 없어요.'); return; }
    setZipping(true);
    setError('');
    try {
      const zip = new JSZip();
      let n = 0;
      for (const it of targets) {
        const res = await fetch(it.file_url);
        if (!res.ok) continue;
        const d = new Date(it.created_at);
        const folder = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const ext = (it.file_url.split('.').pop() || 'webp').split('?')[0];
        n++;
        zip.file(`${folder}/${String(n).padStart(3, '0')}${it.is_featured ? '_대표' : ''}.${ext}`, await res.blob());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${classes.find(c => c.id === classId)?.name ?? '갤러리'}_사진.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('압축 파일을 만들지 못했어요. 다시 시도해주세요.');
    } finally {
      setZipping(false);
    }
  };

  const pendingCount = items.filter(i => i.review_status === 'pending').length;
  const shown = items.filter(i => filter === 'all' || (i.review_status ?? 'approved') === filter);
  const groups = useMemo(() => {
    const m = new Map<string, GalleryItem[]>();
    shown.forEach(i => { const k = dayKey(i.created_at); m.set(k, [...(m.get(k) ?? []), i]); });
    return [...m.entries()];
  }, [shown]);

  const flat = useMemo(() => groups.flatMap(([, l]) => l), [groups]);
  const neighbor = (item: GalleryItem) => {
    const i = flat.findIndex(x => x.id === item.id);
    return flat[i + 1] ?? flat[i - 1] ?? null;
  };
  const cur = viewing ? items.find(i => i.id === viewing.id) ?? viewing : null;
  const curIdx = cur ? flat.findIndex(x => x.id === cur.id) : -1;
  const go = useCallback((d: number) => {
    setViewing(v => {
      if (!v) return v;
      const i = flat.findIndex(x => x.id === v.id);
      return flat[i + d] ?? v;
    });
  }, [flat]);
  useEffect(() => {
    if (!viewing) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') setViewing(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [viewing, go]);
  const touchX = useRef<number | null>(null);


  if (classes.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">반이 있어야 사진을 모을 수 있어요. 먼저 반을 추가해주세요.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={classId} onChange={e => setClassId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={load} className="p-2 text-gray-500 hover:text-gray-800" aria-label="새로고침"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {classId && <PhotoConsentPanel userId={userId} classId={classId} />}

      {/* 보조강사 올리기 링크 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-indigo-600" />
          <p className="text-sm font-bold text-gray-900">보조강사 사진 올리기 링크</p>
          {key && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${key.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
              {key.is_active ? '켜짐' : '꺼짐'}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">링크를 받은 사람은 사진을 올릴 수만 있고, 올린 사진을 보거나 지울 수는 없어요. 카톡으로 보조강사에게 보내 주세요.</p>
        {!key ? (
          <button disabled={busy} onClick={() => run(async () => setKey(await createOrRotateUploadKey(userId, classId)))}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg px-3 py-2 disabled:opacity-60">
            <Link2 className="w-4 h-4" /> 올리기 링크 만들기
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={e => e.currentTarget.select()} className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-600 bg-gray-50" />
              <button onClick={copyLink} className="inline-flex items-center gap-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button disabled={busy} onClick={() => run(async () => { await setUploadKeyActive(key.id, !key.is_active); setKey({ ...key, is_active: !key.is_active }); })}
                className="inline-flex items-center gap-1 text-xs font-semibold border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-700">
                <Power className="w-3.5 h-3.5" /> {key.is_active ? '링크 끄기' : '링크 켜기'}
              </button>
              <button disabled={busy} onClick={() => { if (window.confirm('새 링크를 만들면 지금 링크는 바로 못 쓰게 됩니다. 계속할까요?')) run(async () => setKey(await createOrRotateUploadKey(userId, classId))); }}
                className="inline-flex items-center gap-1 text-xs font-semibold border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-700">
                <RefreshCw className="w-3.5 h-3.5" /> 새 링크로 바꾸기
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* 검토 + 사진 목록 */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'approved', 'hidden'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${filter === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'}`}>
            {f === 'all' ? `전체 ${items.length}` : `${STATUS_LABEL[f]} ${items.filter(i => (i.review_status ?? 'approved') === f).length}`}
          </button>
        ))}
        <button disabled={zipping} onClick={downloadZip} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1.5 disabled:opacity-60">
          {zipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} 사용 가능 사진 내려받기
        </button>
        {pendingCount > 0 && (
          <button disabled={busy} onClick={approveAllPending} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2.5 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> 대기 {pendingCount}장 모두 사용 가능으로
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">아직 사진이 없어요.</p>
      ) : (
        groups.map(([day, list]) => (
          <section key={day} className="space-y-2">
            <h3 className="text-sm font-bold text-gray-800">{day} <span className="text-gray-400 font-normal">· {list.length}장</span></h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {list.map(item => {
                const st = (item.review_status ?? 'approved') as ReviewStatus;
                return (
                  <button key={item.id} onClick={() => setViewing(item)} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                    {item.file_type === 'image'
                      ? <img src={item.file_url} alt="" loading="lazy" className={`w-full h-full object-cover ${st === 'hidden' ? 'opacity-40' : ''}`} />
                      : <span className="text-xs font-bold text-gray-600">🎬 영상</span>}
                    {item.is_featured && <Star className="absolute top-1 right-1 w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow" />}
                    {st !== 'approved' && <span className={`absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_CLASS[st]}`}>{STATUS_LABEL[st]}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {cur && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4" onClick={() => setViewing(null)}
          onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}>
          <button className="absolute top-4 right-4 text-white" aria-label="닫기"><X className="w-6 h-6" /></button>
          {curIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); go(-1); }} aria-label="이전 사진" className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"><ChevronLeft className="w-7 h-7" /></button>
          )}
          {curIdx >= 0 && curIdx < flat.length - 1 && (
            <button onClick={e => { e.stopPropagation(); go(1); }} aria-label="다음 사진" className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"><ChevronRight className="w-7 h-7" /></button>
          )}
          {cur.file_type === 'video' ? (
            <div className="bg-white/10 rounded-2xl px-8 py-10 text-center text-white" onClick={e => e.stopPropagation()}>
              <p className="text-lg font-bold mb-1">🎬 영상 링크 ({cur.file_name ?? '영상'})</p>
              <a href={cur.file_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 bg-white text-gray-900 rounded-xl px-5 py-3 text-sm font-bold">영상 열기</a>
            </div>
          ) : (
            <img src={cur.file_url} alt="" className="max-h-[70vh] max-w-full rounded-lg" onClick={e => e.stopPropagation()} />
          )}
          <div className="mt-3 text-center text-white text-sm" onClick={e => e.stopPropagation()}>
            {curIdx >= 0 && <span className="text-white/60">{curIdx + 1} / {flat.length} · </span>}
            {cur.uploader_name ? `${cur.uploader_name} 보조강사 · ` : ''}{new Date(cur.created_at).toLocaleString('ko-KR')}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2" onClick={e => e.stopPropagation()}>
            <button disabled={busy} onClick={() => { const n = neighbor(cur); review(cur.id, 'approved'); if (n) setViewing(n); }} className="inline-flex items-center gap-1 bg-emerald-600 text-white text-sm font-semibold rounded-lg px-3 py-2"><Eye className="w-4 h-4" /> 사용 가능</button>
            <button disabled={busy} onClick={() => { const n = neighbor(cur); review(cur.id, 'hidden'); if (n) setViewing(n); }} className="inline-flex items-center gap-1 bg-gray-600 text-white text-sm font-semibold rounded-lg px-3 py-2"><EyeOff className="w-4 h-4" /> 숨김</button>
            <button disabled={busy} onClick={() => toggleFeatured(cur)} className="inline-flex items-center gap-1 bg-yellow-500 text-white text-sm font-semibold rounded-lg px-3 py-2"><Star className={`w-4 h-4 ${cur.is_featured ? 'fill-white' : ''}`} /> 대표</button>
            <button disabled={busy} onClick={() => remove(cur)} className="inline-flex items-center gap-1 bg-rose-600 text-white text-sm font-semibold rounded-lg px-3 py-2"><Trash2 className="w-4 h-4" /> 삭제</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolGalleryTab;
