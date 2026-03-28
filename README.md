# Blog Auto Generator

AI 기반 블로그 글 자동 생성 및 네이버 블로그 포스팅 도구

## 기능

- AI(GPT)를 사용한 블로그 글 자동 생성
- 네이버 블로그 자동 포스팅
- 키워드 기반 주제 아이디어 추천
- SEO 최적화된 글 생성

## 설치

```bash
npm install
```

## 설정

1. `.env.example`을 `.env`로 복사:
```bash
cp .env.example .env
```

2. `.env` 파일에 API 키 설정:

### OpenAI API 키 발급
1. https://platform.openai.com 접속
2. API Keys 메뉴에서 새 키 생성
3. `OPENAI_API_KEY`에 입력

### 네이버 API 설정
1. https://developers.naver.com 접속
2. 애플리케이션 등록 > 블로그 API 선택
3. Client ID와 Secret 발급
4. OAuth 인증으로 Access Token 발급

## 사용법

### 글 생성 (미리보기)
```bash
npm run generate "오늘의 건강 팁"
```

### 글 생성 + 네이버 블로그 포스팅
```bash
npm run post "오늘의 건강 팁"
```

### 주제 아이디어 추천
```bash
node src/main.js --ideas "다이어트"
```

### 네이버 인증 URL 확인
```bash
node src/main.js --auth
```

## 프로젝트 구조

```
test-repo/
├── src/
│   ├── main.js          # 메인 실행 스크립트
│   ├── ai-generator.js  # AI 콘텐츠 생성
│   └── naver-blog.js    # 네이버 블로그 API
├── config/
├── .env.example         # 환경변수 예시
├── package.json
└── README.md
```

## 라이선스

MIT
