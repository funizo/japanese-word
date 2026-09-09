# japanese-word

Next.js, TypeScript, Tailwind CSS, Supabase를 바탕으로 만든 일본어 학습 앱의 초기 틀입니다.

모바일에서는 세로로, 넓은 화면에서는 두 열로 표시되는 홈 화면과 공통 헤더·푸터를 구성했습니다. 단어 카드는 고정된 디자인 예시이며, 메뉴·로그인·단어 CRUD·학습 기록은 아직 구현하지 않았습니다.

## 화면 테마

화면 오른쪽 위의 해·달 버튼으로 라이트 모드와 다크 모드를 전환할 수 있습니다. 처음 방문할 때는 기기의 테마를 따르며, 직접 선택한 모드는 브라우저에 저장되어 새로고침이나 재방문 후에도 유지됩니다. 브라우저 저장 공간이 차단되어 있으면 현재 화면에서만 선택이 적용됩니다.

테마는 `next-themes`로 관리하며, 다크 모드 색상은 `src/app/globals.css`의 `:root[data-theme="dark"]`에서 변경할 수 있습니다.

## 실행

Node.js 22 LTS 이상과 npm을 사용합니다.

```powershell
cd C:\japanese-word
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>에 접속합니다. 패키지가 이미 설치되어 있으면 `npm install`은 생략해도 됩니다.

```powershell
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start`는 프로덕션 빌드를 완료한 뒤 실행합니다.

## VS Code 빌드 및 실행

VS Code에서 프로젝트 폴더인 `C:\japanese-word`를 열면 `.vscode/launch.json`과 `.vscode/tasks.json` 설정을 사용할 수 있습니다.

- `Ctrl+Shift+B`: 프로덕션 빌드만 실행합니다.
- 실행 및 디버그에서 `japanese-word: 빌드 후 실행`을 선택하고 `F5`: 빌드 성공 후 프로덕션 서버를 실행합니다.
- 실행 및 디버그에서 `japanese-word: 개발 서버`를 선택하고 `F5`: 변경사항을 자동 반영하는 개발 서버를 실행합니다.
- 서버 주소가 출력되면 기본 브라우저가 열립니다. `Shift+F5`로 디버깅을 종료합니다.

Windows 셸 실행 정책의 영향을 줄이도록 설치된 Next.js CLI를 Node.js로 직접 호출합니다. 빌드와 실행 동작은 현재 `npm run build`, `npm start`, `npm run dev` 스크립트와 동일합니다.

## Supabase 연결 준비

현재 홈 화면은 Supabase 환경변수 없이 실행됩니다. 실제 Supabase 프로젝트나 데이터베이스 테이블은 생성하지 않았습니다. 연결 정보가 준비되면 다음과 같이 설정합니다.

1. `.env.example`을 `.env.local`로 복사합니다.
2. Supabase 프로젝트의 연결 정보에서 프로젝트 URL과 공개용 publishable key를 확인하여 두 변수에 입력합니다.
3. 개발 서버를 다시 시작합니다.

```powershell
Copy-Item .env.example .env.local
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트참조.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=프로젝트의_공개용_키
```

`src/lib/supabase/client.ts`의 `getSupabaseClient()`는 실제 데이터 기능을 추가할 때 클라이언트 컴포넌트의 이벤트 핸들러 또는 `useEffect` 안에서 호출합니다. 호출 시점에 초기화하므로 현재 화면에서는 네트워크 요청을 보내지 않습니다. 서버 컴포넌트에서는 사용하지 않습니다.

`NEXT_PUBLIC_` 환경변수는 브라우저에 공개됩니다. secret key와 `service_role` 키를 넣지 마세요. 테이블과 데이터 기능을 추가할 때 데이터 접근에 맞는 RLS 정책도 함께 구성하세요. 인증을 추가할 때는 `@supabase/ssr` 기반 브라우저·서버 클라이언트와 세션 갱신 설정을 함께 추가하면 됩니다.

공식 설정 참고: [Supabase Next.js 시작 안내](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Supabase SSR 클라이언트](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## 주요 구조

```text
src/
  app/
    globals.css                 # 공통 색상, 글꼴, Tailwind 테마
    layout.tsx                  # 한국어 문서, 메타데이터, 모바일 뷰포트
    page.tsx                    # 홈 화면
  components/
    layout/app-shell.tsx        # 공통 헤더, 본문, 푸터
    word-preview.tsx            # 단어 카드 디자인 예시
  lib/
    supabase/client.ts          # 브라우저용 Supabase 연결 유틸
.env.example                    # 환경변수 양식
```

추후 메뉴는 `src/app`에 경로를 추가하고, 공통 레이아웃은 `AppShell`에서 확장할 수 있습니다. 현재는 외부 폰트나 이미지 요청 없이 운영체제의 한국어·일본어 글꼴을 사용합니다.
