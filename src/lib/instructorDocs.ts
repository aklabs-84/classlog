import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type DocKind = 'file' | 'consent' | 'signature' | 'contract_sign';
export type SubStatus = 'submitted' | 'approved' | 'rejected';

export interface DocRequirement {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  kind: DocKind;
  consent_text: string | null;
  form_path: string | null;
  form_name: string | null;
  contract_path: string | null;
  contract_name: string | null;
  required: boolean;
  sort_order: number;
}

export interface DocSubmission {
  id: string;
  requirement_id: string;
  project_id: string;
  instructor_id: string;
  status: SubStatus;
  file_path: string | null;
  file_name: string | null;
  consent_checked: boolean | null;
  signature_path: string | null;
  signed_pdf_path: string | null;
  signed_name: string | null;
  signed_at: string | null;
  review_note: string | null;
  submitted_at: string;
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  file: '파일 올리기',
  consent: '동의 체크',
  signature: '동의 서명',
  contract_sign: '계약서 서명',
};

export const DOC_BUCKET = 'instructor-docs';
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'hwp', 'hwpx', 'jpg', 'jpeg', 'png'];
export const DOC_ACCEPT = '.pdf,.hwp,.hwpx,.jpg,.jpeg,.png';

/** 확장자·용량 검사. 문제가 있으면 안내 문구, 없으면 null (HWP는 브라우저가 형식명을 몰라 확장자로 판단) */
export function validateDocFile(file: File, pdfOnly = false): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (pdfOnly && ext !== 'pdf') return 'PDF 파일만 올릴 수 있어요.';
  if (!ALLOWED_EXT.includes(ext)) return 'PDF, HWP, HWPX, JPG, PNG 파일만 올릴 수 있어요.';
  if (file.size > DOC_MAX_BYTES) return '파일 용량은 10MB 이하만 가능해요. PDF로 줄여서 올려 주세요.';
  return null;
}

/** 업로드 후 경로 반환. 경로 규칙: {프로젝트}/{폴더}/{이름} — 한글 파일명은 보관함 경로에 쓰지 않는다 */
export async function uploadDocFile(projectId: string, folder: string, tag: string, file: File | Blob, ext: string): Promise<string> {
  const path = `${projectId}/${folder}/${tag}-${Date.now()}.${ext.toLowerCase()}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

/** 비공개 파일을 잠깐 열 수 있는 주소로 바꿔 새 창으로 연다 */
export async function openDocFile(path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, '_blank', 'noopener');
  return true;
}

export async function fetchDocBytes(path: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).download(path);
  if (error || !data) throw error || new Error('download failed');
  return data.arrayBuffer();
}

/**
 * 서류 목록 + 제출 기록을 불러오고 실시간으로 따라간다.
 * mine=true 이면 내 제출만 (RLS가 어차피 본인 것만 주지만 의도를 분명히 함)
 */
export function useInstructorDocs(projectId: string | null | undefined, opts: { seed?: boolean } = {}) {
  const [reqs, setReqs] = useState<DocRequirement[]>([]);
  const [subs, setSubs] = useState<DocSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    const [r, s] = await Promise.all([
      supabase.from('instructor_doc_requirements').select('*').eq('project_id', projectId).order('sort_order').order('created_at'),
      supabase.from('instructor_doc_submissions').select('*').eq('project_id', projectId),
    ]);
    if (r.error || s.error) { setError(true); setLoading(false); return; }
    setError(false);
    setReqs((r.data || []) as DocRequirement[]);
    setSubs((s.data || []) as DocSubmission[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      if (opts.seed) await supabase.rpc('seed_default_instructor_docs', { p_project: projectId });
      if (!cancelled) await load();
    })();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load().catch(() => {}); }, 300);
    };
    const channel = supabase
      .channel(`idocs-${projectId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instructor_doc_requirements', filter: `project_id=eq.${projectId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instructor_doc_submissions', filter: `project_id=eq.${projectId}` }, refresh)
      .subscribe(status => setLive(status === 'SUBSCRIBED'));
    // 실시간이 꺼져 있어도 따라가도록 보조로 8초마다 다시 읽는다
    const poll = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 8000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, opts.seed, load]);

  return { reqs, subs, loading, error, live, reload: load };
}

/** 서류 하나의 상태 문구 */
export function subStatusLabel(s: DocSubmission | undefined): { text: string; tone: 'none' | 'wait' | 'ok' | 'bad' } {
  if (!s) return { text: '아직 안 냈어요', tone: 'none' };
  if (s.status === 'approved') return { text: '확인 완료', tone: 'ok' };
  if (s.status === 'rejected') return { text: '다시 내 주세요', tone: 'bad' };
  return { text: '검토 중', tone: 'wait' };
}

/** 계약서 PDF 마지막 장에 서명·이름·날짜를 찍은 새 PDF를 만든다 */
export async function stampSignatureOnPdf(pdfBytes: ArrayBuffer, signaturePng: Uint8Array, signerName: string): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const page = pages[pages.length - 1];
  const { width } = page.getSize();
  const img = await pdf.embedPng(signaturePng);
  const sigW = 160;
  const sigH = (img.height / img.width) * sigW;
  const x = width - sigW - 48;
  const y = 64;
  page.drawImage(img, { x, y: y + 14, width: sigW, height: sigH });
  page.drawLine({ start: { x, y: y + 12 }, end: { x: x + sigW, y: y + 12 }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  // 한글 글꼴을 PDF에 넣지 않으므로 날짜는 숫자만, 이름은 서명 이미지 옆 기록으로 DB에 남긴다
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  page.drawText(`Signed ${stamp}`, { x, y: y, size: 9, color: rgb(0.3, 0.3, 0.3) });
  void signerName;
  return pdf.save();
}
