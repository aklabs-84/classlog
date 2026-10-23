import { useEffect, useRef } from 'react';
import type { ResumeData } from '../../lib/portfolioResume';
import type { ResumeClass } from './ResumeSheet';

/** 이력서 에디토리얼형(잡지형) 화면. 기준 시안: Docs/design-drafts/resume/resume-B-editorial.html */
interface Props {
  name: string;
  avatarUrl: string | null;
  intro: string;
  resume: ResumeData;
  classes: ResumeClass[];
}

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700;900&family=Space+Grotesk:wght@500;700&display=swap';

const Bullet = ({ text }: { text: string }) => {
  const i = text.indexOf(': ');
  return i > 0 && i < 22 ? <li><b>{text.slice(0, i)}</b>{text.slice(i)}</li> : <li>{text}</li>;
};

const ResumeSheetEditorial = ({ name: profileName, avatarUrl, intro, resume: r, classes }: Props) => {
  const name = r.name || profileName;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${name || '강사'} 이력서`;
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = FONT_HREF;
      document.head.appendChild(l);
    }
    return () => { document.title = prevTitle; };
  }, [name]);

  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.re-rv');
    if (!els || typeof IntersectionObserver === 'undefined') { els?.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.08 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [classes.length, r.experience.length]);

  const leadLines = r.lead.split('\n').map(s => s.trim()).filter(Boolean);
  const skills = r.skills.flatMap(s => s.items);
  const hasBottom = skills.length > 0 || r.tools.length > 0;

  return (
    <div className="re" ref={rootRef}>
      <style>{CSS}</style>
      <div className="re-bar"><button type="button" onClick={() => window.print()}>PDF로 저장</button></div>
      <div className="re-wrap">
        <header className="re-hero">
          <div>
            {r.title && <p className="re-k">{r.title}</p>}
            <h1>{name || '선생님'}</h1>
            {leadLines.length > 0 && (
              <p className="re-lead">
                {leadLines.map((l, i) => (
                  <span key={i} className={i === leadLines.length - 1 && leadLines.length > 1 ? 're-em' : undefined}>
                    {l}{i < leadLines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            )}
            {intro && <p className="re-intro">{intro}</p>}
            <p className="re-meta">
              {r.org && <b>{r.org}</b>}
              {r.phone && <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}>{r.phone}</a>}
              {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
            </p>
            {r.tags.length > 0 && <p className="re-tags">{r.tags.map(t => <span key={t}>{t}</span>)}</p>}
          </div>
          {avatarUrl
            ? <img src={avatarUrl} alt={name} />
            : <div className="re-noimg" aria-hidden="true">{(name || '?').slice(0, 1)}</div>}
        </header>

        {r.experience.length > 0 && (
          <section className="re-sec re-rv">
            <h2>Experience<small>경력 · 강의 실적</small></h2>
            <div>
              {r.experience.map((g, i) => (
                <div key={i} className="re-blk">
                  <h3>{g.title}{g.period && <span className="re-period">{g.period}</span>}</h3>
                  {g.org && <p className="re-o">{g.org}</p>}
                  <ul>{g.items.map((t, k) => <Bullet key={k} text={t} />)}</ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {r.projects.length > 0 && (
          <section className="re-sec re-rv">
            <h2>Projects<small>프로젝트</small></h2>
            <ul className="re-list">
              {r.projects.map((p, i) => (
                <li key={i} className="re-row"><b>{p.title}{p.desc && <em> {p.desc}</em>}</b><span>{p.period}</span></li>
              ))}
            </ul>
          </section>
        )}

        {hasBottom && (
          <section className="re-sec re-rv">
            <h2>Skills &amp; Tools<small>할 수 있는 일, 쓰는 도구</small></h2>
            <div className="re-grid">
              {skills.length > 0 && <div><h3>Skills</h3><ul>{skills.map(t => <li key={t}>{t}</li>)}</ul></div>}
              {r.tools.length > 0 && <div><h3>Tools</h3><ul>{r.tools.map(t => <li key={t}>{t}</li>)}</ul></div>}
            </div>
          </section>
        )}

        {r.education.length > 0 && (
          <section className="re-sec re-rv">
            <h2>Education<small>학력</small></h2>
            <div>{r.education.map((e, i) => (
              <div key={i} className="re-row"><b>{e.school} <em>{e.detail}</em></b><span>{e.period}</span></div>
            ))}</div>
          </section>
        )}

        {(r.awards.length > 0 || r.publications.length > 0) && (
          <section className="re-sec re-rv">
            <h2>Awards &amp; Books<small>수상 · 저서</small></h2>
            <div>
              {r.awards.map((a, i) => <div key={i} className="re-row"><b>{a.title}</b><span>{a.detail}</span></div>)}
              {r.publications.map((p, i) => <div key={i} className="re-row"><b>{p}</b><span /></div>)}
            </div>
          </section>
        )}

        {r.strengths.length > 0 && (
          <section className="re-sec re-rv">
            <h2>Strength<small>강점</small></h2>
            <ul className="re-list re-num">{r.strengths.map(t => <li key={t}>{t}</li>)}</ul>
          </section>
        )}

        {r.showClassHistory && classes.length > 0 && (
          <section className="re-sec re-rv">
            <h2>Classes<small>앱에서 진행한 수업</small></h2>
            <div>{classes.map(c => (
              <div key={c.id} className="re-row"><b>{c.name}</b><span>{[c.subject, c.period, `자료 ${c.materialCount}건`].filter(Boolean).join(' · ')}</span></div>
            ))}</div>
          </section>
        )}
      </div>
    </div>
  );
};

const CSS = `
.re{--bg:#f5efe4;--ink:#2a2118;--sub:#6e6150;--rule:#cdbfa6;--acc:#b5482a;
  background:#fff;color:var(--ink);min-height:100vh;font-family:'Pretendard Variable',Pretendard,sans-serif;line-height:1.75;font-size:17px;-webkit-font-smoothing:antialiased}
.re *{box-sizing:border-box;margin:0}
.re a{color:inherit;text-decoration:none}.re a:hover{color:var(--acc);text-decoration:underline}
.re-bar{max-width:1040px;margin:0 auto;padding:18px 24px;display:flex;justify-content:flex-end}
.re-bar button{font:inherit;font-size:14px;font-weight:700;color:var(--acc);background:none;border:0;border-bottom:2px solid var(--acc);padding:0 0 2px;cursor:pointer}
.re-wrap{max-width:1040px;margin:0 auto;padding:0 24px 90px}
.re-hero{display:grid;grid-template-columns:1fr 230px;gap:44px;align-items:end;padding:30px 0 40px;border-bottom:2px solid var(--ink)}
.re-k{font-family:'Space Grotesk',sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
.re h1{font-family:'Noto Serif KR',serif;font-weight:900;font-size:76px;letter-spacing:-.03em;line-height:1.05;margin:8px 0 14px}
.re-lead{font-family:'Noto Serif KR',serif;font-weight:700;font-size:21px;line-height:1.5;word-break:keep-all}
.re-em{color:var(--acc)}
.re-intro{margin-top:14px;color:var(--sub);font-size:15.5px;max-width:60ch;white-space:pre-wrap}
.re-meta{display:flex;flex-wrap:wrap;gap:6px 28px;margin-top:16px;font-size:15px}
.re-tags{margin-top:12px;font-size:14px;color:var(--sub)}.re-tags span+span::before{content:' / ';color:var(--rule)}
.re-hero img,.re-noimg{width:230px;height:300px;object-fit:cover;object-position:50% 12%}
.re-noimg{display:flex;align-items:center;justify-content:center;background:#f3f3f3;color:var(--sub);font-family:'Noto Serif KR',serif;font-size:96px;font-weight:900}
.re-sec{display:grid;grid-template-columns:210px 1fr;gap:40px;padding:36px 0;border-bottom:1px solid var(--rule)}
.re-sec>h2{font-family:'Noto Serif KR',serif;font-size:22px;line-height:1.3;align-self:start}
.re-sec>h2 small{display:block;font-family:'Pretendard Variable',Pretendard,sans-serif;font-weight:500;font-size:13px;color:var(--sub);margin-top:4px}
.re-blk{padding-bottom:22px;margin-bottom:22px;border-bottom:1px dotted var(--rule)}.re-blk:last-child{border:0;margin:0;padding:0}
.re-blk h3{font-family:'Noto Serif KR',serif;font-size:19px}
.re-period{font-family:'Space Grotesk',sans-serif;font-size:13px;color:var(--sub);font-weight:500;margin-left:10px}
.re-o{font-size:14.5px;font-weight:700;margin:2px 0 8px;color:var(--acc)}
.re-blk ul{list-style:none;padding:0}
.re-blk li{font-size:15.5px;padding:3px 0 3px 18px;position:relative;transition:transform .2s;word-break:break-word}
.re-blk li::before{content:'—';position:absolute;left:0;color:var(--rule)}
.re-blk li:hover{transform:translateX(4px)}.re-blk li b{color:var(--acc)}
.re-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:28px}
.re-grid h3{font-size:14px;font-family:'Space Grotesk',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);margin-bottom:6px}
.re-grid ul,.re-list{list-style:none;padding:0;font-size:15.5px}.re-grid li{padding:2px 0}
.re-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--rule);font-size:15.5px}.re-row:last-child{border:0}
.re-row span{color:var(--sub);font-size:14px;text-align:right}.re-row em{font-style:normal;font-weight:400;color:var(--sub)}
.re-num{counter-reset:n}
.re-num li{counter-increment:n;padding:9px 0;border-bottom:1px solid var(--rule);font-family:'Noto Serif KR',serif;font-weight:700;font-size:18px;display:flex;gap:14px}
.re-num li::before{content:counter(n,decimal-leading-zero);font-family:'Space Grotesk',sans-serif;color:var(--acc);font-size:14px;padding-top:4px}
.re-rv{opacity:0;transform:translateY(14px);transition:.6s}.re-rv.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.re-rv{opacity:1;transform:none;transition:none}}
@media (max-width:760px){
  .re h1{font-size:48px}.re-hero{grid-template-columns:1fr;gap:20px}
  .re-hero img,.re-noimg{width:140px;height:180px;order:-1;font-size:56px}
  .re-sec{grid-template-columns:1fr;gap:12px}.re-grid{grid-template-columns:1fr}
  .re-row{flex-direction:column;gap:0}.re-row span{text-align:left}
}
@page{size:A4;margin:16mm 14mm}
@media print{
  /* index.css 전역 규칙(body * {visibility:hidden})이 인쇄 화면을 숨겨 빈 PDF가 되던 문제 방지 (레슨 L060) */
  .re,.re *{visibility:visible}
  .re{background:#fff;font-size:10.5px;line-height:1.55;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .re-bar{display:none}
  .re-wrap{padding:2mm 6mm;max-width:none}
  .re h1{font-size:44px}
  .re-hero{padding:0 0 18px}.re-hero img,.re-noimg{width:120px;height:160px;font-size:48px}
  .re-sec{padding:16px 0;gap:24px;grid-template-columns:150px 1fr;break-inside:avoid}
  .re-sec>h2{font-size:15px}.re-sec>h2 small{font-size:10px}
  .re-rv{opacity:1;transform:none}
  .re-blk li,.re-row,.re-grid ul{font-size:10.5px}.re-num li{font-size:12px;padding:5px 0}
  .re-blk,.re-row{break-inside:avoid}
}
`;

export default ResumeSheetEditorial;
