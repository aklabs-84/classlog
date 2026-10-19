import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getSlideTemplateGroups, instantiateSlide, buildStarterSlides } from './templates';
import SlideStage from './SlideStage';

interface Props {
  onSelect: (templateId: string) => void;
  hideFeatured?: boolean;  // 기존 슬라이드에 배색만 입히는 화면에서는 메인 템플릿을 숨긴다
}

const cardStyle = {
  border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden',
  background: '#fff', padding: 0,
} as const;

export default function TemplateGallery({ onSelect, hideFeatured }: Props) {
  // 기존 4개 템플릿(색+구조 세트)은 그대로 카드 1장 = 템플릿 1개.
  // layoutGroup이 있는 새 템플릿들은 레이아웃 구조 하나에 테마색 4개가 묶여 있으므로
  // 카드 1장에 색상 스와치를 두고 고른 색상의 템플릿 id로 onSelect한다.
  const { flatTemplates, groups, featuredTemplates } = getSlideTemplateGroups();

  const [themeIdxByGroup, setThemeIdxByGroup] = useState<Record<string, number>>({});
  // 메인 템플릿을 누르면 그 템플릿의 모든 구성을 펼쳐 보여주는 화면으로 넘어간다
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = featuredTemplates.find(t => t.id === previewId);

  if (preview && !hideFeatured) {
    const slides = buildStarterSlides(preview, []);
    return (
      <div>
        <button
          onClick={() => setPreviewId(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, marginBottom: 12 }}
        >
          <ArrowLeft size={16} /> 다른 템플릿 보기
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{preview.name}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>이 템플릿으로 만들 수 있는 슬라이드 {slides.length}가지예요. 시작하면 전부 담겨 있어서, 필요한 것만 남기고 내용을 바꾸면 돼요.</div>
          </div>
          <button
            onClick={() => onSelect(preview.id)}
            style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            이 템플릿으로 시작하기
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 14 }}>
          {slides.map((sl, i) => (
            <div key={sl.id} style={cardStyle}>
              <div style={{ pointerEvents: 'none' }}><SlideStage slide={sl} editable={false} /></div>
              <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>{i + 1}. {preview.showcase![i].label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {!hideFeatured && featuredTemplates.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>추천 템플릿</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>누르면 이 템플릿으로 만들 수 있는 모든 슬라이드를 한눈에 볼 수 있어요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {featuredTemplates.map(t => (
              <button key={t.id} onClick={() => setPreviewId(t.id)} style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ background: t.swatch, pointerEvents: 'none' }}>
                  <SlideStage slide={instantiateSlide(t, 'title')} editable={false} />
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{t.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{!hideFeatured && featuredTemplates.length > 0 ? '기본 템플릿' : ''}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
      {flatTemplates.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer' }}
        >
          <div style={{ background: t.swatch, pointerEvents: 'none' }}>
            <SlideStage slide={instantiateSlide(t, 'title')} editable={false} />
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{t.description}</div>
          </div>
        </button>
      ))}

      {groups.map(g => {
        const idx = themeIdxByGroup[g.key] ?? 0;
        const current = g.variants[idx];
        const layoutName = current.name.split(' · ')[0];
        return (
          <div key={g.key} style={cardStyle}>
            <button
              onClick={() => onSelect(current.id)}
              style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <div style={{ background: current.swatch, pointerEvents: 'none' }}>
                <SlideStage slide={instantiateSlide(current, 'title')} editable={false} />
              </div>
            </button>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{layoutName}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{current.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {g.variants.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => setThemeIdxByGroup(s => ({ ...s, [g.key]: i }))}
                    title={v.themeName}
                    aria-label={v.themeName}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', background: v.swatch,
                      border: i === idx ? '2px solid #111827' : '2px solid #fff',
                      boxShadow: '0 0 0 1px #e5e7eb', cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>{current.themeName}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
