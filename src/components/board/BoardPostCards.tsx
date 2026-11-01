import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ExternalLink, Files, Heart, Play } from 'lucide-react';
import { agoLabel, authorLabel, postKey, postLatestAt, type BoardSection } from '../../lib/boardLive';
import { RecentBadge, freshCardClass } from './BoardLiveBits';

// 우리반 보드 카드 모양 — 앱 기본 색(보라+회색)만 쓴다.
// teacher: 선생님 클래스룸 보드(반듯한 칸 + 주차 번호 칩, 한 화면에 많이)
// student: 학생 보드(개인별·조별·이름만 보기에서는 1주차→3주차 성장 타임라인)

export type BoardCardVariant = 'teacher' | 'student';

type CardCtx = {
  now: number;
  freshKeys: Set<string>;
  onOpen: (post: any) => void;
  onOpenFile: (file: { url: string; name: string }) => void;
  /** 학생 보드 전용 */
  myId?: string;
  likes?: Record<string, boolean>;
  onLike?: (postId: string) => void;
};

const stackStyle = (multi: boolean): CSSProperties | undefined =>
  multi ? { boxShadow: '3px 3px 0 0 rgba(139,92,246,0.28), 6px 6px 0 0 rgba(139,92,246,0.12)', marginRight: 10, marginBottom: 12 } : undefined;

/** 제출 여러 개 안내 줄 — 앱 보라색, 카드 안쪽 여백(p-4)에 맞춤 */
const MultiStrip = ({ count }: { count: number }) => (
  <div className="-mx-4 -mb-4 mt-3 flex items-center justify-between gap-2 px-4 py-2.5 rounded-b-xl bg-primary/10 border-t border-primary/20 text-primary-dim text-[14px] font-bold">
    <span className="flex items-center gap-1.5"><Files size={15} /> 제출 {count}개 · 눌러서 모두 보기</span>
    <ChevronRight size={16} />
  </div>
);

const kindLabel = (post: any) => (post._type === 'obs' ? '활동 기록' : '결과');

/** 카드 본문: 제목 · 글 · 사진 · 링크 · 파일 버튼 (두 보기 공통) */
const CardBody = ({ post, ctx }: { post: any; ctx: CardCtx }) => {
  const isObs = post._type === 'obs';
  const text = isObs ? post.content : post.text_content;
  return (
    <>
      <p className="text-base font-bold leading-snug text-on-surface line-clamp-2">{isObs ? post.activity_name : post.title}</p>
      {text && <p className="mt-1 text-[15px] leading-relaxed text-on-surface-variant line-clamp-3">{text}</p>}
      {isObs && post.feeling && <p className="mt-1 text-[14px] text-on-surface-variant/80 line-clamp-2">“{post.feeling}”</p>}
      {!isObs && post.image_url && (
        <div className="relative mt-2">
          <img
            src={post.image_url}
            alt=""
            className="w-full rounded-lg object-contain bg-slate-50 dark:bg-slate-900/40 max-h-56"
            loading="lazy"
            onError={(e) => { if (post.image_original_url) (e.target as HTMLImageElement).src = post.image_original_url; }}
          />
          {post.image_urls?.length > 1 && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[13px] font-bold px-2 py-0.5 rounded-md">1/{post.image_urls.length}</span>
          )}
        </div>
      )}
      {!isObs && post.link_url && (
        <a
          href={post.link_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-primary-dim hover:underline"
        >
          <ExternalLink size={13} className="shrink-0" /><span className="truncate">{post.link_url}</span>
        </a>
      )}
      {!isObs && post.file_url && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.onOpenFile({ url: post.file_url, name: post.display_name || '파일' }); }}
          className="mt-3 w-full min-h-[40px] flex items-center gap-2 px-3 rounded-lg bg-primary/10 text-primary-dim text-[14px] font-bold hover:bg-primary/20 transition-colors text-left"
        >
          <Play size={14} className="shrink-0" />
          <span className="truncate">{post.display_name || '파일'}</span>
        </button>
      )}
    </>
  );
};

const LikeButton = ({ post, ctx }: { post: any; ctx: CardCtx }) => {
  if (!ctx.onLike) return null;
  const liked = !!ctx.likes?.[post.id];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); ctx.onLike!(post.id); }}
      className={`mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold px-2 py-1 rounded-lg transition-colors ${
        liked ? 'text-primary-dim bg-primary/10' : 'text-on-surface-variant hover:text-primary-dim hover:bg-primary/10'
      }`}
    >
      <Heart size={14} className={liked ? 'fill-current' : ''} />공감
    </button>
  );
};

const isMineOf = (post: any, ctx: CardCtx) =>
  !!ctx.myId && (post.student_id === ctx.myId || (post._memberIds || []).includes(ctx.myId));

/** 시안 C — 칸이 반듯한 카드. 왼쪽 주차 번호 칩이 길잡이 */
const GridCard = ({ post, ctx, hideAuthor, sectionKey, latest }: { post: any; ctx: CardCtx; hideAuthor: boolean; sectionKey: string; latest: boolean }) => {
  const multi = post._type === 'result' && post._submissions?.length > 1;
  const week = post.week_number;
  const mine = isMineOf(post, ctx);
  return (
    <motion.div
      key={`${sectionKey}-${postKey(post)}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => ctx.onOpen(post)}
      style={stackStyle(multi)}
      className={`break-inside-avoid mb-4 rounded-xl border bg-white dark:bg-slate-800 p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary ${
        mine ? 'border-primary/50' : 'border-slate-200 dark:border-slate-700'
      } ${freshCardClass(ctx.freshKeys.has(postKey(post)))}`}
    >
      <div className="flex gap-3">
        <div className={`shrink-0 w-[52px] h-[52px] rounded-xl flex flex-col items-center justify-center leading-none ${
          latest ? 'bg-primary text-white' : 'bg-primary/10 text-primary-dim'
        }`}>
          {week ? (<><b className="text-[22px] font-bold">{week}</b><span className="text-[11px] mt-0.5">주차</span></>) : <span className="text-[13px] font-bold">{kindLabel(post)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[13px] text-on-surface-variant truncate">
              {!hideAuthor && <span className="font-bold text-on-surface">{authorLabel(post)}{mine ? ' (나)' : ''} · </span>}
              {agoLabel(postLatestAt(post), ctx.now)}{week ? ` · ${kindLabel(post)}` : ''}
            </p>
            <RecentBadge post={post} now={ctx.now} />
          </div>
          <CardBody post={post} ctx={ctx} />
          <LikeButton post={post} ctx={ctx} />
        </div>
      </div>
      {multi && <MultiStrip count={post._submissions.length} />}
    </motion.div>
  );
};

/** 시안 D — 세로선 위에 주차가 쌓이는 성장 타임라인 */
const TimelineItem = ({ post, ctx, sectionKey, latest }: { post: any; ctx: CardCtx; sectionKey: string; latest: boolean }) => {
  const multi = post._type === 'result' && post._submissions?.length > 1;
  const week = post.week_number;
  return (
    <motion.div
      key={`${sectionKey}-${postKey(post)}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-4 last:mb-0"
    >
      <span className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full border-[3px] ${
        latest ? 'bg-primary border-primary-container' : 'bg-white dark:bg-slate-800 border-primary/40'
      }`} />
      <div className="flex items-center gap-2 mb-1.5">
        <p className={`text-[15px] font-bold ${latest ? 'text-primary-dim' : 'text-on-surface-variant'}`}>
          {week ? `${week}주차` : kindLabel(post)}
          <span className="ml-2 text-[13px] font-normal text-on-surface-variant">{agoLabel(postLatestAt(post), ctx.now)}{week ? ` · ${kindLabel(post)}` : ''}</span>
        </p>
        <RecentBadge post={post} now={ctx.now} />
      </div>
      <div
        onClick={() => ctx.onOpen(post)}
        style={stackStyle(multi)}
        className={`rounded-xl border bg-white dark:bg-slate-800 p-4 cursor-pointer transition-colors hover:border-primary ${
          isMineOf(post, ctx) ? 'border-primary/50' : 'border-slate-200 dark:border-slate-700'
        } ${freshCardClass(ctx.freshKeys.has(postKey(post)))}`}
      >
        <CardBody post={post} ctx={ctx} />
        <LikeButton post={post} ctx={ctx} />
        {multi && <MultiStrip count={post._submissions.length} />}
      </div>
    </motion.div>
  );
};

/** 섹션 하나의 카드 묶음. 학생 보드는 사람·조 묶음(제목 있음)일 때 타임라인, 전체 보기는 칸 카드 */
export const BoardSectionPosts = ({ section, variant, ctx }: { section: BoardSection; variant: BoardCardVariant; ctx: CardCtx }) => {
  const grouped = !!section.title;
  if (variant === 'student' && grouped) {
    return (
      <div className="relative pl-7 max-w-2xl">
        <span className="absolute left-2 top-2 bottom-2 w-0.5 bg-primary-container" />
        {section.posts.map((post, i) => (
          <TimelineItem key={`${section.key}-${postKey(post)}`} post={post} ctx={ctx} sectionKey={section.key} latest={i === 0} />
        ))}
      </div>
    );
  }
  return (
    <div className="@container">
      <div className="columns-1 @[36rem]:columns-2 @[56rem]:columns-3 @[76rem]:columns-4 gap-4">
        {section.posts.map((post, i) => (
          <GridCard key={`${section.key}-${postKey(post)}`} post={post} ctx={ctx} hideAuthor={grouped} sectionKey={section.key} latest={i === 0 && grouped} />
        ))}
      </div>
    </div>
  );
};
