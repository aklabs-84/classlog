import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { Download, Loader2, X, Image as ImageIcon, FileText, Link2, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type DownloadKind = 'image' | 'text' | 'link' | 'file';

interface Props {
  /** 지금 보드에 보이는(주차·종류 필터가 적용된) 게시물 */
  posts: any[];
  /** 지금 선택된 주차 ('all' 이면 전체) */
  weekFilter: number | 'all';
}

const KINDS: { key: DownloadKind; label: string; hint: string; Icon: typeof ImageIcon }[] = [
  { key: 'image', label: '이미지', hint: '그림 파일을 압축 파일(zip)로', Icon: ImageIcon },
  { key: 'file', label: '파일', hint: '올린 파일을 압축 파일(zip)로', Icon: Paperclip },
  { key: 'text', label: '텍스트', hint: '글 내용을 표 파일(엑셀로 열림)로', Icon: FileText },
  { key: 'link', label: '링크', hint: '주소 목록을 표 파일(엑셀로 열림)로', Icon: Link2 },
];

const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const extOf = (path: string, fallback: string) => {
  const m = (path || '').split('?')[0].match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : fallback;
};
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** 보드 게시물에서 낱개 제출 기록(student_results 행)을 모은다. 같은 기록이 겹쳐 담겨 있어도 한 번만 센다. */
function collectRows(posts: any[]): { row: any; studentName: string }[] {
  const seen = new Set<string>();
  const out: { row: any; studentName: string }[] = [];
  posts.forEach((p) => {
    if (p._type !== 'result') return;
    const subs: any[] = p._submissions || [p];
    subs.forEach((s) => {
      const rows: any[] = s._group || [s];
      rows.forEach((r) => {
        if (!r?.id || seen.has(r.id)) return;
        seen.add(r.id);
        out.push({ row: r, studentName: p.student_name || '학생' });
      });
    });
  });
  return out;
}

function pathsOf(row: any): string[] {
  if (row.storage_paths && row.storage_paths.length > 0) return row.storage_paths;
  return row.storage_path ? [row.storage_path] : [];
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function BoardDownloadButton({ posts, weekFilter }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DownloadKind | null>(null);
  const [error, setError] = useState('');

  const rows = useMemo(() => collectRows(posts), [posts]);
  const byKind = useMemo(() => {
    const pick = (t: string) => rows.filter((x) => x.row.result_type === t);
    return {
      image: pick('image').filter((x) => pathsOf(x.row).length > 0),
      file: pick('file').filter((x) => pathsOf(x.row).length > 0),
      text: pick('text').filter((x) => x.row.text_content),
      link: pick('link').filter((x) => x.row.link_url),
    };
  }, [rows]);
  const count = (k: DownloadKind) =>
    k === 'image' ? byKind.image.reduce((n, x) => n + pathsOf(x.row).length, 0) : byKind[k].length;

  const weekLabel = weekFilter === 'all' ? '전체주차' : `${weekFilter}주차`;
  const prefixOf = (row: any) => (row.week_number ? `${row.week_number}주차` : '주차없음');

  const run = async (kind: DownloadKind) => {
    setBusy(kind);
    setError('');
    try {
      const kindLabel = KINDS.find((k) => k.key === kind)!.label;
      if (kind === 'text' || kind === 'link') {
        const head = kind === 'text' ? ['주차', '학생', '제목', '내용', '제출 시각'] : ['주차', '학생', '제목', '주소', '제출 시각'];
        const lines = [head.map(csvCell).join(',')];
        byKind[kind]
          .slice()
          .sort((a, b) => (a.row.week_number ?? 999) - (b.row.week_number ?? 999) || a.studentName.localeCompare(b.studentName, 'ko'))
          .forEach(({ row, studentName }) => {
            const when = new Date(row.created_at).toLocaleString('ko-KR');
            lines.push([prefixOf(row), studentName, row.title || '', kind === 'text' ? row.text_content : row.link_url, when].map(csvCell).join(','));
          });
        // 맨 앞 BOM: 엑셀에서 한글이 깨지지 않게
        save(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${weekLabel}_${kindLabel}.csv`);
      } else {
        const items: { path: string; name: string }[] = [];
        byKind[kind].forEach(({ row, studentName }) => {
          const title = safe(row.title || (kind === 'file' ? String(row.display_name || '').replace(/\.[^.]+$/, '') : ''));
          pathsOf(row).forEach((p, i, arr) => {
            const ext = extOf(p, kind === 'image' ? 'png' : 'dat');
            const base = [prefixOf(row), safe(studentName), title].filter(Boolean).join('_') + (arr.length > 1 ? `_사진${i + 1}` : '');
            items.push({ path: p, name: `${base}.${ext}` });
          });
        });
        // 같은 이름이 둘 이상이면 _1, _2 …를 붙여 서로 덮어쓰지 않게
        const total: Record<string, number> = {};
        items.forEach((it) => { total[it.name] = (total[it.name] || 0) + 1; });
        const used: Record<string, number> = {};
        const zip = new JSZip();
        let ok = 0;
        for (const it of items) {
          let name = it.name;
          if (total[it.name] > 1) {
            used[it.name] = (used[it.name] || 0) + 1;
            name = it.name.replace(/(\.[^.]+)$/, `_${used[it.name]}$1`);
          }
          const url = supabase.storage.from('student-attachments').getPublicUrl(it.path).data.publicUrl;
          const res = await fetch(url);
          if (!res.ok) continue;
          zip.file(name, await res.blob());
          ok++;
        }
        if (ok === 0) throw new Error('empty');
        save(await zip.generateAsync({ type: 'blob' }), `${weekLabel}_${kindLabel}.zip`);
      }
    } catch {
      setError('내려받지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        onClick={() => { setError(''); setOpen(true); }}
        className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-700 rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> 내려받기
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">무엇을 내려받을까요?</h3>
                <p className="mt-1 text-xs text-slate-500">지금 보고 있는 <b>{weekLabel}</b> 제출물이에요.</p>
              </div>
              <button onClick={() => setOpen(false)} disabled={!!busy} className="p-1 text-slate-400 hover:text-slate-600" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {KINDS.map(({ key, label, hint, Icon }) => {
                const n = count(key);
                return (
                  <button
                    key={key}
                    disabled={n === 0 || !!busy}
                    onClick={() => run(key)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
                  >
                    <Icon className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-800">{label} <span className="text-slate-400 font-medium">{n}개</span></span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </span>
                    {busy === key && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
                  </button>
                );
              })}
            </div>
            {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}
            <p className="mt-3 text-[11px] text-slate-400">같은 주차에 여러 번 올린 것도 모두 포함돼요.</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
