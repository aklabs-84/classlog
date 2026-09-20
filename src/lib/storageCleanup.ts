// 학급/학생을 통째로 삭제할 때 student_results가 참조하던 Storage 파일을 함께 지우기 위한 헬퍼.
// DB의 ON DELETE CASCADE는 행만 지우고 Storage 객체는 남기므로, 행을 지우기 전에 경로를 모아 두고
// 삭제가 성공한 뒤에 파일을 지운다(삭제가 실패했는데 파일만 사라지는 일을 막기 위해).
import { supabase } from './supabase';

const BUCKET = 'student-attachments';
const REMOVE_CHUNK = 100;

type ResultFileRow = { storage_path: string | null; storage_paths: string[] | null };

const toPaths = (rows: ResultFileRow[] | null): string[] =>
  Array.from(new Set((rows ?? []).flatMap(r => [r.storage_path, ...(r.storage_paths ?? [])]).filter((p): p is string => !!p)));

// 학급에 속한 모든 학생 결과물의 파일 경로
export async function collectClassResultPaths(classId: string): Promise<string[]> {
  const { data } = await supabase.from('student_results').select('storage_path, storage_paths').eq('class_id', classId);
  return toPaths(data as ResultFileRow[] | null);
}

// 지정한 학생들의 결과물 파일 경로
export async function collectStudentResultPaths(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const { data } = await supabase.from('student_results').select('storage_path, storage_paths').in('student_id', studentIds);
  return toPaths(data as ResultFileRow[] | null);
}

// 파일 삭제 실패는 사용자 흐름을 막지 않는다(고아 파일로 남을 뿐이므로 로그만 남김).
export async function removeStoragePaths(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + REMOVE_CHUNK));
    if (error) console.error('Storage cleanup failed:', error);
  }
}

// 익명 학생의 본인 파일 삭제 — Storage DELETE 정책이 교사 소유자 전용이므로 Edge Function이 대신 지운다.
// 실패해도 제출 흐름을 막지 않는다(고아 파일로 남을 뿐).
export async function removeStudentFiles(studentId: string, paths: string[]): Promise<void> {
  const list = Array.from(new Set(paths.filter(Boolean)));
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await supabase.functions.invoke('student-file-delete', {
      body: { student_id: studentId, paths: list.slice(i, i + 100) },
    });
    if (error) console.error('Student file cleanup failed:', error);
  }
}

// 교사별 저장 용량 쿼터(무료 300MB / Pro 10GB)를 넘으면 Storage INSERT 정책이 업로드를 거부한다.
export const STORAGE_QUOTA_ERROR = 'STORAGE_QUOTA_EXCEEDED';

export function toStorageUploadError(error: { message?: string; statusCode?: string | number }): Error {
  const msg = String(error?.message ?? '');
  const isQuota = /row-level security|violates|unauthorized/i.test(msg) || String(error?.statusCode) === '403';
  return isQuota ? new Error(STORAGE_QUOTA_ERROR) : (error as unknown as Error);
}

export const isStorageQuotaError = (e: unknown): boolean =>
  e instanceof Error && e.message === STORAGE_QUOTA_ERROR;
