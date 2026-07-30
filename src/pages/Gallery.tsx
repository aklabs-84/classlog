import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Images, Upload, X, ChevronLeft, ChevronRight, Trash2,
  Crown, AlertCircle, Loader2, ImageOff, Plus, Check,
  BadgeCheck, Link, Video, HardDrive, ExternalLink, FolderOpen,
  RefreshCw, Unlink, Copy, Clapperboard
} from 'lucide-react';
import { useAuth, checkIsPro } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  fetchGalleryItems, uploadGalleryItem, deleteGalleryItem, countGalleryItems,
  addVideoLink, parseVideoUrl, isVerticalVideoUrl,
  getDriveFolderLink, setDriveFolderLink, removeDriveFolderLink,
  fetchDriveFolderItems, driveItemToGalleryItem,
  type GalleryItem, type VideoUrlInfo, type DriveFolderLink
} from '../lib/gallery';
import GalleryScreening from '../components/gallery/GalleryScreening';

const FREE_IMAGE_LIMIT = 100;
const DRIVE_SERVICE_ACCOUNT_EMAIL = 'saengilog-drive@saengilog-drive.iam.gserviceaccount.com';

interface Class {
  id: string;
  name: string;
  weekly_plan?: { week: number; topic: string }[];
}

// 영상 URL에서 표시 정보 추출 (기존 데이터 포함)
function getVideoInfo(fileUrl: string): VideoUrlInfo {
  const info = parseVideoUrl(fileUrl);
  if (info) return info;
  // 파싱 실패 시 direct로 처리
  return { platform: 'direct', embedUrl: fileUrl, thumbnailUrl: null, label: '영상' };
}

export default function Gallery() {
  const { user, profile } = useAuth();
  const isPro = checkIsPro(profile);

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageOffsetRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 영상 링크 모달
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoAddingLoading, setVideoAddingLoading] = useState(false);

  // 구글 드라이브 폴더 연동
  const [driveFolderLink, setDriveFolderLinkState] = useState<DriveFolderLink | null>(null);
  const [driveItems, setDriveItems] = useState<GalleryItem[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderUrlInput, setFolderUrlInput] = useState('');
  const [folderAddingLoading, setFolderAddingLoading] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [folderUrlCopied, setFolderUrlCopied] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [screeningOpen, setScreeningOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('classes')
      .select('id, name, weekly_plan')
      .eq('teacher_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = data ?? [];
        setClasses(list);
        // 기존 선택이 목록에 여전히 유효하면 유지, 아니면 첫 번째로 초기화
        setSelectedClassId(prev => {
          if (prev && list.some(c => c.id === prev)) return prev;
          return list[0]?.id ?? '';
        });
      });
  }, [user]);

  useEffect(() => {
    if (!user || isPro) return;
    countGalleryItems(user.id).then(setTotalCount);
  }, [user, isPro, items]);

  useEffect(() => {
    if (!user || !selectedClassId) { setItems([]); setHasMore(false); return; }
    setLoading(true);
    setError(null);
    pageOffsetRef.current = 0;
    fetchGalleryItems(user.id, selectedClassId, selectedWeek, 0)
      .then(({ items: page, hasMore: more }) => {
        setItems(page);
        setHasMore(more);
        pageOffsetRef.current = page.length;
      })
      .catch(() => setError('갤러리를 불러오는데 실패했습니다.'))
      .finally(() => setLoading(false));
  }, [user, selectedClassId, selectedWeek]);

  // 더 보기 — 페이지 단위로 다음 사진 묶음을 이어붙임 (업로드/삭제로 items가 변해도
  // pageOffsetRef는 서버 조회 기준 커서를 별도로 유지하므로 어긋나지 않음)
  const handleLoadMore = useCallback(async () => {
    if (!user || !selectedClassId || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: page, hasMore: more } = await fetchGalleryItems(
        user.id, selectedClassId, selectedWeek, pageOffsetRef.current
      );
      setItems(prev => [...prev, ...page]);
      setHasMore(more);
      pageOffsetRef.current += page.length;
    } catch {
      setError('추가 사진을 불러오는데 실패했습니다.');
    } finally {
      setLoadingMore(false);
    }
  }, [user, selectedClassId, selectedWeek, loadingMore]);

  // 구글 드라이브 폴더 연동 상태 + 목록 로드
  const loadDriveFolder = useCallback(async () => {
    if (!user || !selectedClassId || !isPro) { setDriveFolderLinkState(null); setDriveItems([]); return; }
    setDriveError(null);
    try {
      const link = await getDriveFolderLink(selectedClassId, selectedWeek);
      setDriveFolderLinkState(link);
      if (!link) { setDriveItems([]); return; }
      setDriveLoading(true);
      const apiItems = await fetchDriveFolderItems(link.folder_id);
      setDriveItems(apiItems.map(i => driveItemToGalleryItem(i, user.id, selectedClassId, selectedWeek)));
    } catch (e: any) {
      setDriveError(e?.message ?? '구글 드라이브 폴더를 불러오는데 실패했습니다.');
      setDriveItems([]);
    } finally {
      setDriveLoading(false);
    }
  }, [user, selectedClassId, selectedWeek, isPro]);

  useEffect(() => { loadDriveFolder(); }, [loadDriveFolder]);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const totalWeeks = selectedClass?.weekly_plan?.length ?? 0;
  const displayItems = [...items, ...driveItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const hasScreenableImage = displayItems.some(item => item.file_type === 'image');

  // 이미지 파일 업로드
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !user || !selectedClassId) return;
      setError(null);

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError('이미지 파일만 업로드할 수 있습니다. 영상은 링크로 추가해주세요.');
          continue;
        }
        if (!isPro && totalCount >= FREE_IMAGE_LIMIT) {
          setError(`무료 플랜은 전체 ${FREE_IMAGE_LIMIT}장까지 업로드할 수 있습니다. PRO로 업그레이드하세요.`);
          break;
        }

        setUploading(true);
        setUploadProgress(0);
        const interval = setInterval(() => {
          setUploadProgress(p => Math.min(p + 10, 85));
        }, 300);

        try {
          const item = await uploadGalleryItem(user.id, selectedClassId, selectedWeek, file);
          setItems(prev => [item, ...prev]);
          setTotalCount(c => c + 1);
        } catch (e: any) {
          setError(e?.message ?? '업로드에 실패했습니다.');
        } finally {
          clearInterval(interval);
          setUploadProgress(100);
          setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
          }, 400);
        }
      }
    },
    [user, selectedClassId, selectedWeek, isPro, totalCount]
  );

  // 영상 링크 추가
  const handleAddVideoLink = async () => {
    if (!user || !selectedClassId || !videoUrl.trim()) return;
    const info = parseVideoUrl(videoUrl);
    if (!info) {
      setError('올바른 URL 형식이 아닙니다. YouTube, 구글 드라이브, 직접 링크를 지원합니다.');
      return;
    }
    if (!isPro) {
      setError('영상 추가는 PRO 플랜 전용입니다.');
      return;
    }

    setVideoAddingLoading(true);
    try {
      const item = await addVideoLink(user.id, selectedClassId, selectedWeek, videoUrl);
      setItems(prev => [item, ...prev]);
      setVideoModalOpen(false);
      setVideoUrl('');
    } catch (e: any) {
      setError(e?.message ?? '영상 링크 추가에 실패했습니다.');
    } finally {
      setVideoAddingLoading(false);
    }
  };

  // 구글 드라이브 폴더 연결 (폴더 링크를 서비스 계정과 공유한 뒤 링크를 붙여넣는 방식)
  const handleConnectFolder = async () => {
    if (!user || !selectedClassId || !folderUrlInput.trim()) return;
    setDriveError(null);
    setFolderAddingLoading(true);
    try {
      await setDriveFolderLink(user.id, selectedClassId, selectedWeek, folderUrlInput);
      setFolderModalOpen(false);
      setFolderUrlInput('');
      await loadDriveFolder();
    } catch (e: any) {
      setDriveError(e?.message ?? '폴더 연결에 실패했습니다.');
    } finally {
      setFolderAddingLoading(false);
    }
  };

  const handleDisconnectFolder = async () => {
    if (!selectedClassId) return;
    try {
      await removeDriveFolderLink(selectedClassId, selectedWeek);
      setDriveFolderLinkState(null);
      setDriveItems([]);
    } catch {
      setDriveError('연결 해제에 실패했습니다.');
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDelete = async (id: string, fileUrl: string) => {
    try {
      await deleteGalleryItem(id, fileUrl);
      setItems(prev => prev.filter(i => i.id !== id));
      setTotalCount(c => c - 1);
      if (lightboxIndex !== null) setLightboxIndex(null);
    } catch {
      setError('삭제에 실패했습니다.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const videoUrlInfo = videoUrl ? parseVideoUrl(videoUrl) : null;
  const lightboxItem = lightboxIndex !== null ? displayItems[lightboxIndex] : null;

  return (
    <div className="min-h-screen p-6 font-manrope">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white shadow-md shadow-primary/20">
            <Images size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-on-surface tracking-tightest">수업 갤러리</h1>
            <p className="text-xs text-on-surface-variant font-medium">수업 장면 사진·영상을 클래스별로 기록합니다</p>
          </div>
        </div>
        {!isPro && (
          <div className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2 border border-on-surface/5">
            <span className="font-bold text-primary">{totalCount}</span>
            <span> / {FREE_IMAGE_LIMIT}장 사용</span>
          </div>
        )}
      </div>

      <PlanGuide isPro={isPro} totalCount={totalCount} />

      {/* 필터 바 */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={selectedClassId}
          onChange={e => { setSelectedClassId(e.target.value); setSelectedWeek(null); }}
          className="px-4 py-2.5 rounded-xl border border-on-surface/10 bg-white text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]"
        >
          <option value="">클래스 선택</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedWeek(null)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              selectedWeek === null
                ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                : 'border-on-surface/10 text-on-surface-variant hover:bg-white hover:text-on-surface'
            }`}
          >
            전체
          </button>
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              onClick={() => setSelectedWeek(w)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                selectedWeek === w
                  ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                  : 'border-on-surface/10 text-on-surface-variant hover:bg-white hover:text-on-surface'
              }`}
            >
              {w}주차
            </button>
          ))}
        </div>

        {/* 업로드 버튼 그룹 */}
        <div className="ml-auto flex gap-2">
          {/* 상영회 시작 */}
          <button
            onClick={() => setScreeningOpen(true)}
            disabled={!hasScreenableImage}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Clapperboard size={15} />
            상영회 시작
          </button>
          {/* 영상 링크 추가 */}
          {isPro && (
            <button
              onClick={() => { setVideoModalOpen(true); setError(null); }}
              disabled={!selectedClassId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <Link size={15} />
              영상 링크
            </button>
          )}
          {/* 구글 드라이브 폴더 연결 */}
          {isPro && !driveFolderLink && (
            <button
              onClick={() => { setFolderModalOpen(true); setDriveError(null); }}
              disabled={!selectedClassId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <FolderOpen size={15} />
              폴더 연결
            </button>
          )}
          {/* 사진 추가 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !selectedClassId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-primary/20 active:scale-95"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {uploading ? `업로드 중 ${uploadProgress}%` : '사진 추가'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* 연결된 구글 드라이브 폴더 상태 */}
      {isPro && driveFolderLink && (
        <div className="flex items-center gap-2.5 mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200/60 rounded-xl text-xs">
          <HardDrive size={15} className="text-blue-500 shrink-0" />
          <a
            href={driveFolderLink.folder_url}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-blue-700 hover:underline truncate"
          >
            연결된 폴더 열기
          </a>
          <span className="text-blue-400">·</span>
          <span className="text-blue-600/80 font-medium">
            {driveLoading ? '불러오는 중...' : `${driveItems.length}개 항목`}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(driveFolderLink.folder_url);
              setFolderUrlCopied(true);
              setTimeout(() => setFolderUrlCopied(false), 2000);
            }}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold"
          >
            {folderUrlCopied ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> URL 복사</>}
          </button>
          <button
            onClick={loadDriveFolder}
            disabled={driveLoading}
            className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold disabled:opacity-40"
          >
            <RefreshCw size={12} className={driveLoading ? 'animate-spin' : ''} /> 새로고침
          </button>
          <button
            onClick={handleDisconnectFolder}
            className="flex items-center gap-1 text-on-surface-variant hover:text-error font-bold"
          >
            <Unlink size={12} /> 연결 해제
          </button>
        </div>
      )}
      {driveError && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-error/5 border border-error/20 rounded-xl text-sm text-error font-medium">
          <AlertCircle size={16} className="shrink-0" />
          <span>{driveError}</span>
          <button onClick={() => setDriveError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* 에러 메시지 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 mb-4 px-4 py-3 bg-error/5 border border-error/20 rounded-xl text-sm text-error font-medium"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 드롭존 + 그리드 */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="min-h-[400px]"
      >
        {!selectedClassId ? (
          <EmptyState icon={<Images size={40} />} message="클래스를 선택해 갤러리를 확인하세요" />
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={32} className="animate-spin text-primary/40" />
          </div>
        ) : displayItems.length === 0 ? (
          <EmptyState
            icon={<ImageOff size={40} />}
            message="아직 업로드된 사진·영상이 없습니다"
            sub="사진 추가 버튼으로 사진을, 영상 링크 버튼으로 영상을 추가하세요"
            onUpload={() => fileInputRef.current?.click()}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {displayItems.map((item, idx) =>
                item.file_type === 'image' ? (
                  <GalleryCard
                    key={item.id}
                    item={item}
                    onClick={() => setLightboxIndex(idx)}
                    onDelete={() => setDeleteTarget(item.id)}
                  />
                ) : (
                  <VideoGalleryCard
                    key={item.id}
                    item={item}
                    onDelete={() => setDeleteTarget(item.id)}
                  />
                )
              )}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50 transition-all"
                >
                  {loadingMore ? <Loader2 size={15} className="animate-spin" /> : null}
                  더 보기
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 영상 링크 추가 모달 */}
      <AnimatePresence>
        {videoModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => { setVideoModalOpen(false); setVideoUrl(''); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full mx-4"
            >
              <h3 className="font-black text-on-surface mb-1 flex items-center gap-2">
                <Link size={18} className="text-primary" /> 영상 링크 추가
              </h3>
              <p className="text-xs text-on-surface-variant mb-1">
                YouTube, 구글 드라이브 공유 링크, 직접 URL을 지원합니다
              </p>
              {selectedClass && (
                <p className="text-xs font-bold text-primary mb-3">
                  추가 위치: {selectedClass.name}{selectedWeek != null ? ` · ${selectedWeek}주차` : ''}
                </p>
              )}

              <input
                type="url"
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text');
                  setVideoUrl(pasted);
                }}
                placeholder="https://youtube.com/watch?v=... 또는 drive.google.com/..."
                className="w-full px-4 py-3 rounded-xl border border-on-surface/15 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
                autoFocus
              />

              {/* URL 감지 결과 */}
              {videoUrl && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold mb-4 ${
                  videoUrlInfo
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    : 'bg-error/5 text-error border border-error/20'
                }`}>
                  {videoUrlInfo ? (
                    <>
                      {videoUrlInfo.platform === 'youtube' && <Video size={14} />}
                      {videoUrlInfo.platform === 'drive' && <HardDrive size={14} />}
                      {videoUrlInfo.platform === 'direct' && <ExternalLink size={14} />}
                      {videoUrlInfo.label} 링크 감지됨
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} /> 올바른 URL 형식이 아닙니다
                    </>
                  )}
                </div>
              )}

              {/* 안내 */}
              <div className="text-xs text-on-surface-variant/70 mb-5 space-y-1">
                <p>• 구글 드라이브: 공유 설정을 <strong>"링크가 있는 모든 사용자"</strong>로 변경하세요</p>
                <p>• YouTube: 비공개 영상은 재생되지 않습니다</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setVideoModalOpen(false); setVideoUrl(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low"
                >
                  취소
                </button>
                <button
                  onClick={handleAddVideoLink}
                  disabled={!videoUrlInfo || videoAddingLoading}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {videoAddingLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  추가
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 구글 드라이브 폴더 연결 모달 */}
      <AnimatePresence>
        {folderModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!folderAddingLoading) setFolderModalOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full mx-4"
            >
              <h3 className="font-black text-on-surface mb-1 flex items-center gap-2">
                <FolderOpen size={18} className="text-primary" /> 구글 드라이브 폴더 연결
              </h3>
              <p className="text-xs text-on-surface-variant mb-1">
                드라이브 폴더를 아래 계정과 공유(뷰어)한 뒤, 폴더 링크를 붙여넣으면 폴더 안 이미지·영상을 자동으로 불러와 갤러리에 표시합니다
              </p>
              {selectedClass && (
                <p className="text-xs font-bold text-primary mb-3">
                  연결 위치: {selectedClass.name}{selectedWeek != null ? ` · ${selectedWeek}주차` : ''}
                </p>
              )}

              <div className="mb-3 px-3 py-2 bg-surface-container-low rounded-lg">
                <p className="text-[11px] text-on-surface-variant mb-1">1. 이 계정을 폴더 공유(뷰어)에 추가하세요</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-primary flex-1 truncate">{DRIVE_SERVICE_ACCOUNT_EMAIL}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(DRIVE_SERVICE_ACCOUNT_EMAIL);
                      setEmailCopied(true);
                      setTimeout(() => setEmailCopied(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline shrink-0"
                  >
                    {emailCopied ? <><Check size={12} /> 복사되었습니다</> : '복사'}
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <label className="text-[11px] text-on-surface-variant mb-1 block">2. 폴더 링크를 붙여넣으세요</label>
                <input
                  type="text"
                  value={folderUrlInput}
                  onChange={e => setFolderUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full px-3 py-2.5 rounded-xl border border-on-surface/10 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="text-xs text-on-surface-variant/70 mb-5 space-y-1">
                <p>• 선택한 폴더 안 이미지·영상만 자동으로 표시되며, 다른 파일은 무시됩니다</p>
                <p>• 사진은 서버를 통해 비공개로 전달되지만, 영상은 재생을 위해 해당 파일을 "링크가 있는 모든 사용자"로 별도 공유해야 합니다</p>
                <p>• 이후 폴더에 새로 추가한 파일도 갤러리 새로고침 시 함께 표시됩니다</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFolderModalOpen(false)}
                  disabled={folderAddingLoading}
                  className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  onClick={handleConnectFolder}
                  disabled={folderAddingLoading || !folderUrlInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {folderAddingLoading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                  폴더 연결
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 삭제 확인 모달 */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4"
            >
              <h3 className="font-black text-on-surface mb-2">파일을 삭제할까요?</h3>
              <p className="text-sm text-on-surface-variant mb-5">삭제한 파일은 복구할 수 없습니다.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    const target = items.find(i => i.id === deleteTarget);
                    if (target) handleDelete(target.id, target.file_url);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-error text-white text-sm font-bold hover:bg-error/90"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 라이트박스 */}
      <AnimatePresence>
        {lightboxItem !== null && lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={() => setLightboxIndex(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
              onClick={() => setLightboxIndex(null)}
            >
              <X size={28} />
            </button>
            {lightboxItem.source !== 'drive' && (
              <button
                className="absolute top-4 left-4 text-white/70 hover:text-error"
                onClick={e => { e.stopPropagation(); setDeleteTarget(lightboxItem.id); }}
              >
                <Trash2 size={22} />
              </button>
            )}
            {lightboxIndex > 0 && (
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              >
                <ChevronLeft size={40} />
              </button>
            )}
            {lightboxIndex < displayItems.length - 1 && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              >
                <ChevronRight size={40} />
              </button>
            )}

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
              onClick={e => e.stopPropagation()}
            >
              {lightboxItem.file_type === 'image' ? (
                <img
                  src={lightboxItem.file_url}
                  alt={lightboxItem.file_name ?? ''}
                  className="max-w-full max-h-[80vh] rounded-xl object-contain"
                />
              ) : (
                <VideoPlayer fileUrl={lightboxItem.file_url} />
              )}
              {lightboxItem.caption && (
                <p className="text-white/80 text-sm font-medium">{lightboxItem.caption}</p>
              )}
              <p className="text-white/40 text-xs">
                {lightboxIndex + 1} / {displayItems.length}
                {lightboxItem.week_number != null && ` · ${lightboxItem.week_number}주차`}
                {lightboxItem.source === 'drive' && ' · 구글 드라이브'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 상영회 모드 */}
      {screeningOpen && hasScreenableImage && (
        <GalleryScreening
          items={displayItems}
          initialIndex={lightboxIndex ?? 0}
          onClose={() => setScreeningOpen(false)}
        />
      )}
    </div>
  );
}

// 영상 플레이어 (YouTube/Drive → iframe, 직접 URL → video)
function VideoPlayer({ fileUrl }: { fileUrl: string }) {
  const info = getVideoInfo(fileUrl);
  if (info.platform === 'direct') {
    return (
      <video
        src={info.embedUrl}
        controls
        autoPlay
        className="max-w-full max-h-[80vh] rounded-xl"
      />
    );
  }
  return (
    <iframe
      src={info.embedUrl}
      className="w-[80vw] max-w-[900px] aspect-video rounded-xl"
      allow="autoplay; fullscreen; picture-in-picture"
    />
  );
}

// 갤러리 카드 (이미지 전용)
function GalleryCard({
  item,
  onClick,
  onDelete,
}: {
  item: GalleryItem;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group relative aspect-square rounded-2xl overflow-hidden bg-surface-container-low border border-on-surface/5 cursor-pointer hover:shadow-lg transition-all duration-200"
      onClick={onClick}
    >
      <div className="relative w-full h-full">
        <img
          src={item.file_url}
          alt={item.file_name ?? ''}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {item.source === 'drive' && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-blue-600/80 text-white text-[10px] font-bold flex items-center gap-1">
            <HardDrive size={10} /> 드라이브
          </div>
        )}
      </div>

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />

      {item.source !== 'drive' && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-error transition-colors"
        >
          <Trash2 size={12} />
        </button>
      )}

      {item.week_number != null && (
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
          {item.week_number}주차
        </div>
      )}
    </motion.div>
  );
}

// 영상 카드 (16:9 / 9:16 원본 비율을 유지한 채 그리드 2칸 크기로 표시)
function VideoGalleryCard({
  item,
  onDelete,
}: {
  item: GalleryItem;
  onDelete: () => void;
}) {
  const info = getVideoInfo(item.file_url);
  const [directRatio, setDirectRatio] = useState<number | null>(null);
  const aspectStyle = info.platform === 'direct'
    ? { aspectRatio: directRatio ?? 16 / 9 }
    : { aspectRatio: isVerticalVideoUrl(item.file_url) ? 9 / 16 : 16 / 9 };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="col-span-2 relative self-start rounded-2xl overflow-hidden bg-black shadow-sm border border-on-surface/5"
    >
      {info.platform !== 'direct' ? (
        <iframe
          src={info.embedUrl}
          style={aspectStyle}
          className="w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          loading="lazy"
        />
      ) : (
        // aspect-ratio를 video 태그에 직접 주면 네이티브 컨트롤 바 높이 계산이 어긋나 하단이 잘리는
        // 브라우저 버그가 있어, 비율은 래퍼 div에 주고 video는 절대 위치로 100% 채움
        <div className="relative w-full bg-black" style={aspectStyle}>
          <video
            src={item.file_url}
            controls
            preload="metadata"
            className="absolute inset-0 w-full h-full"
            onLoadedMetadata={e => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setDirectRatio(v.videoWidth / v.videoHeight);
            }}
          />
        </div>
      )}

      {item.source === 'drive' && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-blue-600/80 text-white text-[10px] font-bold flex items-center gap-1">
          <HardDrive size={10} /> 드라이브
        </div>
      )}

      {item.source !== 'drive' && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-error transition-colors"
        >
          <Trash2 size={12} />
        </button>
      )}

      {item.week_number != null && (
        <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
          {item.week_number}주차
        </div>
      )}
    </motion.div>
  );
}

// 플랜 안내 카드
function PlanGuide({ isPro, totalCount }: { isPro: boolean; totalCount: number }) {
  const freeRows = [
    { label: '사진 업로드', free: `최대 ${FREE_IMAGE_LIMIT}장`, pro: '무제한', freeOk: true },
    { label: '영상 추가', free: '불가', pro: 'YouTube / 구글 드라이브 링크', freeOk: false },
    { label: '이미지 자동 최적화', free: 'WebP 변환 + 리사이즈', pro: 'WebP 변환 + 리사이즈', freeOk: true },
    { label: '드래그 & 드롭', free: '지원', pro: '지원', freeOk: true },
    { label: '라이트박스 뷰어', free: '지원', pro: '지원', freeOk: true },
  ];

  if (isPro) {
    return (
      <div className="flex items-center gap-2.5 mb-5 px-4 py-3 bg-emerald-50 border border-emerald-200/70 rounded-2xl">
        <BadgeCheck size={18} className="text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-700">PRO 플랜 이용 중 — 사진 무제한 + 영상 링크 추가 가능</p>
          <p className="text-xs text-emerald-600/80 mt-0.5">YouTube, 구글 드라이브 공유 링크로 영상을 갤러리에 추가하세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-on-surface/8 overflow-hidden bg-white shadow-sm">
      <div className="grid grid-cols-3 bg-surface-container-low/60">
        <div className="px-4 py-2.5 text-xs font-black text-on-surface-variant uppercase tracking-wider">기능</div>
        <div className="px-4 py-2.5 text-xs font-black text-on-surface-variant text-center border-l border-on-surface/5">
          무료 플랜
          <span className="ml-1.5 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {totalCount}/{FREE_IMAGE_LIMIT}장
          </span>
        </div>
        <div className="px-4 py-2.5 text-xs font-black text-amber-600 text-center border-l border-on-surface/5 bg-amber-50/60">
          <span className="flex items-center justify-center gap-1">
            <Crown size={11} /> PRO 플랜
          </span>
        </div>
      </div>

      {freeRows.map((row, i) => (
        <div
          key={row.label}
          className={`grid grid-cols-3 border-t border-on-surface/5 ${i % 2 === 1 ? 'bg-surface-container-low/30' : ''}`}
        >
          <div className="px-4 py-2.5 text-xs font-bold text-on-surface">{row.label}</div>
          <div className={`px-4 py-2.5 text-xs text-center border-l border-on-surface/5 font-medium flex items-center justify-center gap-1 ${row.freeOk ? 'text-on-surface-variant' : 'text-error/70'}`}>
            {row.freeOk
              ? <Check size={12} className="text-emerald-500 shrink-0" />
              : <X size={12} className="text-error/60 shrink-0" />}
            {row.free}
          </div>
          <div className="px-4 py-2.5 text-xs text-center border-l border-on-surface/5 font-medium text-amber-700 bg-amber-50/40 flex items-center justify-center gap-1">
            <Check size={12} className="text-amber-500 shrink-0" />
            {row.pro}
          </div>
        </div>
      ))}

      <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-xs text-amber-700 font-medium">PRO로 업그레이드하면 영상 링크 추가 + 사진 무제한이 가능합니다</p>
        <a
          href="mailto:aklabs84@naver.com?subject=클래스로그 Pro 플랜 업그레이드 문의"
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl transition-colors"
        >
          <Crown size={12} /> 업그레이드 문의
        </a>
      </div>
    </div>
  );
}

function EmptyState({
  icon, message, sub, onUpload,
}: {
  icon: React.ReactNode;
  message: string;
  sub?: string;
  onUpload?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-on-surface-variant">
      <div className="text-on-surface/20">{icon}</div>
      <div className="text-center">
        <p className="font-bold text-sm">{message}</p>
        {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
      </div>
      {onUpload && (
        <button
          onClick={onUpload}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-on-surface/20 text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-all"
        >
          <Upload size={16} /> 사진 업로드
        </button>
      )}
    </div>
  );
}
