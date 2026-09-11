# japanese-word

Next.js, TypeScript, Tailwind CSS, Supabase로 만든 일본어 학습 앱입니다. Day 01~20의 단어 1,000개, 예문, 발음 듣기, 단어장, 이메일 회원가입·로그인, 라이트·다크 테마를 제공합니다.

## 실행

Node.js 22.17 이상과 npm을 사용합니다.

```powershell
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>에 접속합니다. Supabase 설정 없이도 단어 학습과 브라우저 단어장을 사용할 수 있습니다.

```powershell
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start`는 빌드 후 실행합니다.

## 현재 연결된 프로젝트

- 프로젝트: japanese voca (도쿄 리전)
- 프로젝트 ID: vqssbwlqxfqsbidtgsek
- 로컬 연결 정보: .env.local (Git 제외)
- 적용 완료: create_saved_words 마이그레이션, 사용자별 RLS 정책

현재 프로젝트에는 단어장 테이블과 접근 정책이 적용되어 있습니다. 로컬 SQL 파일은 보관하지 않으므로 새 프로젝트를 연결할 때는 테이블과 접근 정책을 별도로 구성해야 합니다. 실행 중인 개발 서버는 환경변수를 반영하도록 다시 시작해 주세요.

## Supabase 처음 연결하기

1. [Supabase 대시보드](https://supabase.com/dashboard)에서 새 프로젝트를 만듭니다. 조직과 프로젝트 이름, DB 비밀번호, 리전을 설정하고 준비가 끝날 때까지 기다립니다.
2. 프로젝트의 **Connect**에서 **Project URL**과 공개용 **Publishable key**를 확인합니다.
3. 프로젝트 루트에 `.env.local`을 만들고 `.env.example`의 두 항목을 채웁니다. 이 파일은 Git에서 제외됩니다. 기존 `.env.local`이 있다면 덮어쓰지 말고 필요한 항목만 수정합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트참조.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_공개키
```

4. 새 프로젝트라면 아래 저장 방식에 맞는 `saved_words` 테이블과 사용자별 RLS 정책을 구성합니다. 현재 연결된 프로젝트에는 이미 적용되어 있습니다.
5. **Authentication → URL Configuration**에서 로컬 개발의 **Site URL**을 `http://localhost:3000`으로 설정하고 **Redirect URLs**에 `http://localhost:3000/login`을 추가합니다. 배포할 때는 실제 서비스 주소와 해당 주소의 `/login`도 설정합니다.
6. 이메일 가입을 사용할 수 있도록 이메일 인증 제공자 설정을 확인합니다. 이메일 확인이 켜져 있으면 가입 메일의 링크를 연 뒤 로그인합니다.
7. 개발 서버를 다시 시작합니다. 배포 환경에서는 두 환경변수를 설정한 후 다시 빌드해야 합니다.

`NEXT_PUBLIC_` 값은 브라우저에 공개됩니다. DB 비밀번호, secret key, `service_role` 키는 이 변수에 넣지 않습니다. 현재 기능에는 공개 키와 로그인 사용자의 세션만 필요합니다.

공식 문서: [API 키](https://supabase.com/docs/guides/getting-started/api-keys), [리디렉션 URL 설정](https://supabase.com/docs/guides/auth/redirect-urls), [사용자별 RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 회원가입·로그인

`/signup`에서 이메일, 8자 이상의 비밀번호와 비밀번호 확인을 입력합니다. 가입 후 받은 메일의 인증 링크를 열어 주세요. 메일을 받지 못했다면 화면의 **인증 메일 다시 보내기** 버튼을 사용할 수 있습니다.

`/login`에서 이메일과 비밀번호로 로그인하면 `/learn`으로 이동합니다. 이미 로그인한 상태로 로그인·회원가입 화면에 들어가도 학습 화면으로 이동합니다. 로그인은 새로고침 후에도 유지되며, 헤더의 **로그아웃**으로 현재 기기의 세션을 종료합니다.

잘못된 로그인 정보, 이메일 인증 미완료, 요청 횟수 제한은 각각 한국어로 안내합니다. 비밀번호 보기·숨기기를 지원하고 요청 처리 중에는 중복 제출을 막습니다. 실제 이메일 수신부터 인증 완료까지의 흐름은 본인의 이메일 계정으로 확인해 주세요.

## 저장 방식

- 학습용 단어·예문은 `src/data/words/day01.json`~`day20.json`을 사용합니다.
- 비로그인 단어장은 기존과 같이 `localStorage`의 `japanese-word:saved`에 저장됩니다.
- 로그인 단어장은 Supabase `public.saved_words`에 저장됩니다. 같은 계정으로 다른 기기에서 접속해 읽을 수 있으며, 화면 재진입·창 포커스 시 다시 조회합니다. 실시간 구독은 사용하지 않습니다.
- 내 단어장의 **이 브라우저의 단어 가져오기** 버튼으로 비로그인 단어를 현재 계정에 추가할 수 있습니다. 중복은 무시하고 원래 브라우저 단어장은 유지합니다.
- 로그인 계정의 DB 요청이 실패하면 오류를 표시합니다. 저장이 확인되기 전에 다음 학습 카드로 넘어가지 않습니다.
- 로그아웃하면 브라우저 단어장으로 돌아가며 계정 단어장을 브라우저 단어장에 복사하지 않습니다.
- 학습 진도와 ‘알고 있어요’ 기록은 아직 DB에 저장하지 않습니다.

| 테이블 열 | 역할 |
| --- | --- |
| `user_id` | `auth.users.id` 참조. 계정 삭제 시 해당 단어장도 삭제 |
| `word_id` | JSON 단어의 기존 ID. 예: `day01-01` |
| `created_at` | 저장 시각 |

`(user_id, word_id)`를 기본 키로 사용해 중복을 막습니다. RLS는 로그인한 사용자가 자기 행만 조회·추가·삭제하도록 제한합니다. 비로그인 API 접근과 행 수정 권한은 부여하지 않습니다. 단어 ID는 날짜와 순번으로 만들어지므로 배포 후 JSON 순서를 바꾸면 기존 저장 단어가 달라질 수 있습니다. 데이터 순서는 유지해 주세요.

현재 인증은 브라우저에서 Supabase SDK로 처리하며 DB 접근 권한은 RLS에서 검사합니다. 서버 컴포넌트에서 로그인 사용자 데이터를 읽거나 서버 인증이 필요한 기능을 추가할 때는 쿠키 기반 SSR 클라이언트를 별도로 구성해야 합니다.

## 주요 구조

```text
src/
  app/                          # 홈, 학습, 단어장, 로그인·회원가입
  components/
    auth-provider.tsx           # 브라우저 인증 상태
    auth-menu.tsx               # 로그인 상태와 로그아웃
    auth-form.tsx               # 이메일 회원가입·로그인
    word-study.tsx              # 학습 카드와 단어장
  lib/
    use-saved-words.ts          # 계정·브라우저 단어장 전환
    supabase/client.ts          # 브라우저용 Supabase 클라이언트
    supabase/database.types.ts  # DB 스키마 타입
    supabase/saved-words.ts     # DB 조회·저장·삭제
.env.example                    # 공개 환경변수 양식
```

## 테마 및 VS Code

오른쪽 위 해·달 버튼으로 라이트·다크 모드를 전환합니다. 첫 방문은 기기 설정을 따르고 직접 고른 테마는 브라우저에 저장합니다. 색상은 `src/app/globals.css`에서 관리합니다.

VS Code에서 `Ctrl+Shift+B`는 프로덕션 빌드, 실행 및 디버그의 **japanese-word: 빌드 후 실행**은 빌드 후 서버 실행, **japanese-word: 개발 서버**는 개발 서버 실행입니다. `Shift+F5`로 종료합니다.
