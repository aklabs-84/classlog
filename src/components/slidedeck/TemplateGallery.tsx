import { useState } from 'react';
import { getSlideTemplateGroups, instantiateSlide } from './templates';
import SlideStage from './SlideStage';

interface Props {
  onSelect: (templateId: string) => void;
}

const cardStyle = {
  border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden',
  background: '#fff', padding: 0,
} as const;

export default function TemplateGallery({ onSelect }: Props) {
  // 기존 4개 템플릿(색+구조 세트)은 그대로 카드 1장 = 템플릿 1개.
  // layoutGroup이 있는 새 템플릿들은 레이아웃 구조 하나에 테마색 4개가 묶여 있으므로
  // 카드 1장에 색상 스와치를 두고 고른 색상의 템플릿 id로 onSelect한다.
  const { flatTemplates, groups } = getSlideTemplateGroups();

  const [themeIdxByGroup, setThemeIdxByGroup] = useState<Record<string, number>>({});

  return (
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
  );
}
