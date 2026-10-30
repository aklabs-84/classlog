import JSZip from 'jszip';
import { buildXlsxBlob, type XCell } from './xlsxBuilder';
import type { ConsentRow } from './photoConsent';

export interface ConsentExportItem {
  name: string;
  stateLabel: string;
  row: ConsentRow | null;
  /** 학생 명단에 없는(삭제된·이름이 다른) 서명 */
  orphan?: boolean;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || '이름없음';
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ko-KR') : '');

async function signatureBlob(src: string): Promise<{ blob: Blob; ext: string } | null> {
  try {
    const res = await fetch(src); // data: 주소도 fetch로 읽힌다
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('svg') ? 'svg' : 'png';
    return { blob, ext };
  } catch { return null; }
}

// 동의 현황 엑셀 + 서명 이미지 폴더를 zip 하나로 만든다
export async function downloadConsentZip(className: string, items: ConsentExportItem[]): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('서명이미지')!;
  const head = ['번호', '학생 이름', '동의 상태', '수업 기록·보고', '홍보', '서명한 사람', '관계', '서명한 날짜', '철회', '서명 파일'];
  const rows: XCell[][] = [head.map(h => ({ value: h, style: 'header' as const }))];
  let n = 0;
  for (const it of items) {
    n++;
    const r = it.row;
    let file = '';
    if (r?.signature) {
      const sig = await signatureBlob(r.signature);
      if (sig) {
        file = `${String(n).padStart(2, '0')}_${safe(it.name)}.${sig.ext}`;
        folder.file(file, sig.blob);
      }
    }
    rows.push([
      { value: n, style: 'num' },
      { value: it.orphan ? `${it.name} (명단에 없음)` : it.name, style: 'cell' },
      { value: it.stateLabel, style: 'cell' },
      { value: r ? (r.consent_record ? '동의' : '미동의') : '', style: 'cell' },
      { value: r ? (r.consent_promo ? '동의' : '미동의') : '', style: 'cell' },
      { value: r?.signer_name ?? '', style: 'cell' },
      { value: r ? (r.signer_relation === 'guardian' ? '보호자' : '학생 본인') : '', style: 'cell' },
      { value: fmt(r?.signed_at), style: 'cell' },
      { value: r?.withdrawn_at ? `철회 (${fmt(r.withdrawn_at)})` : '', style: 'cell' },
      { value: file ? `서명이미지/${file}` : '', style: 'cell' },
    ]);
  }
  const xlsx = await buildXlsxBlob([{
    name: '동의 현황',
    colWidths: [6, 16, 14, 14, 10, 14, 10, 22, 22, 28],
    rows,
    freezeRows: 1,
    filterRow: 1,
  }]);
  zip.file(`${safe(className)}_동의현황.xlsx`, xlsx);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe(className)}_사진얼굴노출동의.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}
