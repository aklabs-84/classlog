import { useEffect, useRef } from 'react';
import type { ResumeData } from '../../lib/portfolioResume';
import ResumeSheetEditorial from './ResumeSheetEditorial';

/** 이력서 한 장 화면. 기준 문서: Docs/DESIGN-portfolio-resume.md */
export interface ResumeClass {
  id: string;
  name: string;
  subject: string | null;
  period: string;
  materialCount: number;
}

interface Props {
  name: string;
  avatarUrl: string | null;
  intro: string;
  resume: ResumeData;
  classes: ResumeClass[];
}

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap';

/** "제목: 설명" 모양이면 앞부분을 굵게 */
const Bullet = ({ text }: { text: string }) => {
  const i = text.indexOf(': ');
  return i > 0 && i < 22 ? <li><b>{text.slice(0, i)}</b>{text.slice(i)}</li> : <li>{text}</li>;
};

const ResumeSheetSidebar = ({ name: profileName, avatarUrl, intro, resume: r, classes }: Props) => {
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

  // 스크롤로 들어올 때 부드럽게 등장
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.rs-rv');
    if (!els || typeof IntersectionObserver === 'undefined') { els?.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.08 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [classes.length, r.experience.length]);

  const leadLines = r.lead.split('\n').map(s => s.trim()).filter(Boolean);
  const skills = r.skills.flatMap(s => s.items);
  const hasContact = !!(r.phone || r.email);

  return (
    <div className="rs" ref={rootRef}>
      <style>{CSS}</style>
      <div className="rs-bar"><div><button type="button" onClick={() => window.print()}>PDF로 저장</button></div></div>

      <article className="rs-sheet">
        <header className="rs-top">
          {avatarUrl
            ? <img src={avatarUrl} alt={name} />
            : <div className="rs-noimg" aria-hidden="true">{(name || '?').slice(0, 1)}</div>}
          <div>
            <h1>{name || '선생님'}</h1>
            {r.title && <p className="rs-title">{r.title}</p>}
            {leadLines.length > 0 && (
              <p className="rs-lead">
                {leadLines.map((l, i) => (
                  <span key={i} className={i === leadLines.length - 1 && leadLines.length > 1 ? 'rs-blue' : undefined}>
                    {l}{i < leadLines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            )}
            {intro && <p className="rs-intro">{intro}</p>}
            {r.tags.length > 0 && <p className="rs-tags">{r.tags.map(t => <span key={t}>{t}</span>)}</p>}
          </div>
        </header>

        <div className="rs-cols">
          <aside>
            {(r.org || hasContact) && (
              <section className="rs-rv">
                <h2>Contact</h2>
                {r.org && <p><b>{r.org}</b></p>}
                {r.phone && <p><a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}>{r.phone}</a></p>}
                {r.email && <p><a href={`mailto:${r.email}`}>{r.email}</a></p>}
              </section>
            )}
            {r.tools.length > 0 && (
              <section className="rs-rv"><h2>Tools</h2><ul>{r.tools.map(t => <li key={t}>· {t}</li>)}</ul></section>
            )}
            {skills.length > 0 && (
              <section className="rs-rv"><h2>Skills</h2><ul>{skills.map(t => <li key={t}>· {t}</li>)}</ul></section>
            )}
            {r.education.length > 0 && (
              <section className="rs-rv rs-edu"><h2>Education</h2>
                {r.education.map((e, i) => (
                  <p key={i} className="rs-mb"><b>{e.school}</b><span>{e.detail}</span><i>{e.period}</i></p>
                ))}
              </section>
            )}
            {r.awards.length > 0 && (
              <section className="rs-rv rs-aw"><h2>Awards</h2>
                {r.awards.map((a, i) => <p key={i} className="rs-mb"><b>{a.title}</b><span className="rs-small">{a.detail}</span></p>)}
              </section>
            )}
            {r.publications.length > 0 && (
              <section className="rs-rv rs-aw"><h2>Publications</h2>
                {r.publications.map((p, i) => <p key={i} className="rs-mb"><b>{p}</b></p>)}
              </section>
            )}
            {r.strengths.length > 0 && (
              <section className="rs-rv"><h2>Strength</h2><ul className="rs-st">{r.strengths.map(t => <li key={t}>{t}</li>)}</ul></section>
            )}
          </aside>

          <main>
            {r.experience.length > 0 && (
              <section className="rs-rv rs-g">
                <h2>Experience <span className="rs-sub">강의 및 출강 실적</span></h2>
                {r.experience.map((g, i) => (
                  <div key={i} className="rs-grp">
                    <h3>{g.title}{g.period && <span className="rs-period">{g.period}</span>}</h3>
                    {g.org && <p className="rs-org">{g.org}</p>}
                    <ul>{g.items.map((t, k) => <Bullet key={k} text={t} />)}</ul>
                  </div>
                ))}
              </section>
            )}
            {r.projects.length > 0 && (
              <section className="rs-rv rs-g">
                <h2>Projects</h2>
                <ul>
                  {r.projects.map((p, i) => (
                    <li key={i}><b>{p.title}</b>{p.period && <span className="rs-small"> · {p.period}</span>}{p.desc && <> — {p.desc}</>}</li>
                  ))}
                </ul>
              </section>
            )}
            {r.showClassHistory && classes.length > 0 && (
              <section className="rs-rv rs-g">
                <h2>Classes <span className="rs-sub">앱에서 진행한 수업</span></h2>
                <ul>
                  {classes.map(c => (
                    <li key={c.id}>
                      <b>{c.name}</b>
                      <span className="rs-small"> · {[c.subject, c.period, `자료 ${c.materialCount}건`].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </main>
        </div>
      </article>
    </div>
  );
};

const CSS = `
.rs{--ink:#14213d;--sub:#5b6785;--blue:#2447d6;--green:#0b7a4b;--paper:#fff;--bg:#eef0f5;--hair:#d6dae5;
  background:#fff;color:var(--ink);min-height:100vh;font-family:'Pretendard Variable',Pretendard,sans-serif;line-height:1.7;font-size:16px;-webkit-font-smoothing:antialiased}
.rs *{box-sizing:border-box;margin:0}
.rs a{color:inherit;text-decoration:none}.rs a:hover{color:var(--blue);text-decoration:underline}
.rs-bar{position:sticky;top:0;z-index:5;background:rgba(238,240,245,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--hair)}
.rs-bar div{max-width:960px;margin:auto;padding:12px 20px;display:flex;justify-content:flex-end}
.rs-bar button{font:inherit;font-size:14px;font-weight:700;color:var(--ink);background:none;border:0;border-bottom:2px solid var(--ink);padding:2px 0;cursor:pointer;transition:.2s}
.rs-bar button:hover{color:var(--blue);border-color:var(--blue)}
.rs-sheet{max-width:960px;margin:28px auto 60px;background:var(--paper);padding:56px 56px 64px;box-shadow:0 1px 0 var(--hair)}
.rs-top{display:grid;grid-template-columns:150px 1fr;gap:32px;align-items:center;padding-bottom:28px;border-bottom:3px solid var(--ink)}
.rs-top img,.rs-noimg{width:150px;height:150px;border-radius:12px;object-fit:cover;object-position:50% 14%}
.rs-noimg{display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--sub);font-size:56px;font-weight:800}
.rs h1{font-size:46px;letter-spacing:-.02em;line-height:1.1}
.rs-title{font-family:'Space Grotesk',sans-serif;font-size:14px;letter-spacing:.06em;color:var(--sub);margin:6px 0 14px;text-transform:uppercase}
.rs-lead{font-weight:700;font-size:17px}.rs-blue{color:var(--blue)}
.rs-intro{font-size:14.5px;color:var(--sub);margin-top:8px;white-space:pre-wrap}
.rs-tags{margin-top:12px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13.5px;font-weight:600}
.rs-tags span::before{content:'#';color:var(--blue)}
.rs-cols{display:grid;grid-template-columns:230px 1fr;margin-top:34px}
.rs aside{padding-right:28px;border-right:1px solid var(--hair)}
.rs main{padding-left:34px;min-width:0}
.rs h2{font-family:'Space Grotesk',sans-serif;font-size:15px;letter-spacing:.1em;text-transform:uppercase;padding-bottom:6px;border-bottom:2px solid var(--ink);margin:0 0 12px}
.rs section{margin-bottom:30px}
.rs aside p,.rs aside li{font-size:14px;line-height:1.6;word-break:break-word}
.rs aside ul{list-style:none;padding:0}.rs aside li{padding:2px 0}
.rs-small{font-size:13px;color:var(--sub);font-weight:400}
.rs-sub{text-transform:none;letter-spacing:0;font-family:inherit;font-size:13px;color:var(--sub);font-weight:400;margin-left:6px}
.rs-grp h3{font-size:17.5px;margin-top:20px}
.rs-grp:first-of-type h3{margin-top:0}
.rs-period{font-family:'Space Grotesk',sans-serif;font-size:13px;color:var(--green);font-weight:500;margin-left:10px}
.rs-org{font-size:14px;font-weight:700;color:var(--blue);margin:2px 0 6px}
.rs-g ul{list-style:none;padding:0}
.rs-g li{position:relative;padding:3px 0 3px 14px;font-size:14.5px;line-height:1.65;transition:background .2s;word-break:break-word}
.rs-g li::before{content:'·';position:absolute;left:2px;font-weight:900}
.rs-g li:hover{background:#f2f5ff}
.rs-edu b,.rs-aw b{display:block;font-size:14px}.rs-edu span{display:block;font-size:13.5px}
.rs-edu i{font-style:normal;font-family:'Space Grotesk',sans-serif;font-size:12.5px;color:#6b7694}
.rs-mb{margin-bottom:8px}
.rs-st li{border-bottom:1px solid var(--hair);padding:7px 0;font-weight:700;font-size:13.5px}
.rs-rv{opacity:0;transform:translateY(10px);transition:opacity .5s,transform .5s}.rs-rv.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.rs-rv{opacity:1;transform:none;transition:none}}
@media (max-width:720px){
  .rs-sheet{padding:28px 20px;margin:0}
  .rs-top{grid-template-columns:96px 1fr;gap:16px}.rs-top img,.rs-noimg{width:96px;height:96px;font-size:36px}
  .rs h1{font-size:34px}
  .rs-cols{grid-template-columns:1fr}
  .rs aside{border:0;padding:0}.rs main{padding:0;order:-1}
}
@page{size:A4;margin:16mm 14mm}
@media print{
  /* index.css 전역 규칙(body * {visibility:hidden})이 이력서까지 숨겨 빈 PDF가 되던 문제 방지 */
  .rs,.rs *{visibility:visible}
  .rs{background:#fff;font-size:11px;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .rs-bar{display:none}
  .rs-sheet{box-shadow:none;margin:0;max-width:none;padding:2mm 6mm}
  .rs-rv{opacity:1;transform:none}
  .rs-g li{font-size:10.5px;break-inside:avoid}
  .rs-grp,.rs aside section{break-inside:avoid}
  .rs h1{font-size:34px}
  .rs aside p,.rs aside li{font-size:11px;line-height:1.5}
  .rs aside li{padding:1px 0}
  .rs-edu b,.rs-aw b{font-size:11.5px}.rs-edu span{font-size:11px}.rs-edu i{font-size:10px}
  .rs aside section{margin-bottom:16px}
}
`;

/** 이력서 디자인(resume.design)에 따라 모양을 고른다. 기본은 사이드바형 */
const ResumeSheet = (props: Props) =>
  props.resume.design === 'editorial' ? <ResumeSheetEditorial {...props} /> : <ResumeSheetSidebar {...props} />;

export default ResumeSheet;
