# 📝 클래스로그 (ClassLog) 

> **선생님을 위한 지능형 에디토리얼 수업 관리 & 생활기록부 워크스페이스**

![클래스로그 메인 이미지](https://raw.githubusercontent.com/aklabs-84/classlog/main/public/og-image.png)

클래스로그(ClassLog)는 2026년 최신 웹 트렌드와 AI 기술을 결합하여, 교사의 학급 관리 부담을 획기적으로 줄여주는 스마트 교육 솔루션입니다. 고품질의 벤토 그리드(Bento Grid) 레이아웃과 구글 Gemini AI를 통해 학생들의 성장을 보다 정교하게 기록하고 분석할 수 있습니다.

---

## ✨ 핵심 기능 (Key Features)

### 🏫 지능형 학급 관리 (Classroom Intelligence)
- **주차별 계획(Syllabus) 시스템**: 수업별 주차 주제와 자료 링크를 미리 등록하여 체계적으로 수업을 운영합니다.
- **실시간 학생 참여 모니터링**: 학생들의 활동 제출 현황을 대시보드에서 즉시 확인합니다.

### ✍️ AI 생활기록부 초안 지원 (AI Intelligence)
- **활동 분석 엔진**: 학생들의 성찰 일지를 분석하여 교육부 기재 요령에 맞는 세특/행특 문구 초안을 자동 생성합니다. (Gemini 1.5 Flash 기반)
- **맞춤형 분석 지침**: 각 학급별로 AI의 작성 스타일과 가이드를 자유롭게 설정할 수 있습니다.

### 📱 학생용 활동 성찰 로그 (Student Log)
- **간편한 활동 선택**: 선생님이 등록한 주차별 주제를 선택하여 손쉽게 본인의 학습 내용을 기록합니다.
- **수업 자료실 연동**: 과목 선생님이 공유한 참고 자료를 실시간으로 확인하고 학습에 활용합니다.

---

## 🛠 기술 스택 (Tech Stack)

### Layout & Design
- **Core:** React 18, Vite, TypeScript
- **Styling:** Tailwind CSS (V4+), Native CSS Nesting
- **Visuals:** Framer Motion (Glassmorphism 2.0 & Micro-animations)
- **Typography:** Manrope, Public Sans (Modern Editorial Font)

### Backend & Service
- **Database:** Supabase (PostgreSQL, Realtime, RLS Security)
- **AI Engine:** Google Gemini AI (Vertex AI Interface)
- **Deployment:** Vercel (Optimized for SPA)

---

## 🚀 빠른 시작 (Getting Started)

### 로컬 개발 환경 실행
```bash
git clone https://github.com/aklabs-84/classlog.git
cd classlog/scholar_metric_app
npm install
npm run dev
```

### 환경 변수 설정 (.env)
Vercel 배포 시 또는 로컬 실행 시 아래 환경 변수가 필요합니다.
```env
VITE_SUPABASE_URL=여기에_주소_입력
VITE_SUPABASE_ANON_KEY=여기에_키_입력
VITE_GEMINI_API_KEY=여기에_구글_제미나이_키_입력
```

---

## 🔗 프로젝트 파트너
본 프로젝트는 **AK Labs (아크랩스)** 와 함께 창의적인 교육 환경을 만들어가고 있습니다.

[![아크랩스](https://img.shields.io/badge/Partnership-AK_Labs-white?style=for-the-badge&logoColor=black)](https://litt.ly/aklabs)

---
© 2026 클래스로그(ClassLog). Built with passion for better education.
