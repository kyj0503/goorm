# 인증 시스템 명세서

## 1. 개요

이 문서는 TemplateProject의 인증 및 인가 시스템에 대한 기술적 명세를 제공합니다. 이 프로젝트는 JWT 기반 인증과 OAuth2 소셜 로그인을 지원합니다.

## 2. 아키텍처

### 2.1 인증 흐름

인증 과정은 다음과 같은 단계로 이루어집니다:

1. 클라이언트(웹 브라우저, 모바일 앱 등)가 서버에 요청을 보냅니다.
2. API 게이트웨이는 요청을 받아 Spring Security 필터 체인으로 전달합니다.
3. JwtAuthenticationFilter는 요청 헤더에서 JWT 토큰을 추출합니다.
4. 추출된 토큰은 검증되고, 유효한 경우 인증 객체가 생성됩니다.
5. 인증된 요청은 보호된 리소스에 접근할 수 있게 됩니다.
6. 인증되지 않은 요청은 401 Unauthorized 응답을 받습니다.

JWT 토큰이 만료된 경우, 클라이언트는 리프레시 토큰을 사용하여 새로운 액세스 토큰을 요청할 수 있습니다.

### 2.2 컴포넌트 구조

- **인증 관련 컴포넌트**:
  - `JwtTokenProvider`: 토큰 생성, 검증 및 관리
  - `JwtAuthenticationFilter`: 요청에서 JWT 토큰 추출 및 검증
  - `CustomUserDetailsService`: 사용자 정보 로드
  - `AuthController`: 인증 관련 API 엔드포인트 제공

- **OAuth2 관련 컴포넌트**:
  - `CustomOAuth2UserService`: OAuth2 사용자 정보 처리
  - `OAuth2AuthenticationSuccessHandler`: OAuth2 인증 성공 처리
  - `OAuth2UserInfo`: 소셜 로그인 제공자별 사용자 정보 추출

## 3. API 명세

### 3.1 로컬 인증 API

#### 회원가입

- **URL**: `/api/v1/auth/signup`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "username": "username"
  }
  ```
- **응답**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "userEmail": "user@example.com",
    "username": "username"
  }
  ```

#### 로그인

- **URL**: `/api/v1/auth/login`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **응답**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "userEmail": "user@example.com",
    "username": "username"
  }
  ```

#### 토큰 갱신

- **URL**: `/api/v1/auth/refresh`
- **Method**: `POST`
- **Request Param**: `refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6...`
- **응답**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "userEmail": "user@example.com",
    "username": "username"
  }
  ```

#### 로그아웃

- **URL**: `/api/v1/auth/logout`
- **Method**: `POST`
- **Request Param**: `refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6...`
- **응답**: 204 No Content

### 3.2 OAuth2 인증 API

#### OAuth2 로그인 초기화

- **URL**: `/oauth2/authorize/{provider}`
- **Method**: `GET`
- **Path Variable**: `provider` - 소셜 로그인 제공자 (github, google, kakao)
- **설명**: 해당 OAuth2 제공자의 인증 페이지로 리다이렉트

#### OAuth2 콜백 처리

- **URL**: `/oauth2/callback/{provider}`
- **Method**: `GET`
- **Path Variable**: `provider` - 소셜 로그인 제공자 (github, google, kakao)
- **설명**: OAuth2 인증 후 콜백 처리

## 4. JWT 토큰 구조

### 액세스 토큰

- **유형**: Bearer 토큰
- **만료 시간**: 1시간 (3600초)
- **페이로드**:
  ```json
  {
    "sub": "사용자ID",
    "iat": 발급시간(timestamp),
    "exp": 만료시간(timestamp)
  }
  ```

### 리프레시 토큰

- **유형**: Bearer 토큰
- **만료 시간**: 7일 (604800초)
- **페이로드**:
  ```json
  {
    "sub": "사용자ID", 
    "iat": 발급시간(timestamp),
    "exp": 만료시간(timestamp)
  }
  ```

## 5. 보안 고려사항

1. **토큰 저장**: 
   - 액세스 토큰: 메모리 또는 sessionStorage (XSS 취약성 고려)
   - 리프레시 토큰: HttpOnly 쿠키 (CSRF 방어 필요)

2. **HTTPS 사용**: 모든 인증 관련 통신은 HTTPS 사용 필수

3. **토큰 취소**:
   - 리프레시 토큰은 DB에 저장되며, 로그아웃 시 DB에서 제거
   - 관리자가 필요시 특정 사용자의 모든 토큰 취소 가능

4. **비밀번호 정책**:
   - 최소 8자 이상
   - 최소 1개의 대문자, 1개의 소문자, 1개의 숫자, 1개의 특수문자 포함

## 6. 프로젝트 시크릿 관리

이 프로젝트에서는 다양한 민감한 정보(시크릿)가 요구되며, 이를 안전하게 관리해야 합니다.

### 6.1 필요한 시크릿 목록

| 시크릿 키 | 설명 | 권장 설정 |
|----------|------|----------|
| `app.jwt.secret` | JWT 토큰 서명용 비밀 키 | 최소 256비트 길이의 랜덤 문자열 |
| `app.jwt.expiration` | JWT 액세스 토큰 만료 시간(ms) | 3600000 (1시간) |
| `app.jwt.refresh-expiration` | JWT 리프레시 토큰 만료 시간(ms) | 604800000 (7일) |
| `spring.datasource.username` | 데이터베이스 사용자명 | - |
| `spring.datasource.password` | 데이터베이스 비밀번호 | - |
| `spring.security.oauth2.client.registration.github.client-id` | GitHub OAuth 클라이언트 ID | GitHub에서 발급 |
| `spring.security.oauth2.client.registration.github.client-secret` | GitHub OAuth 클라이언트 시크릿 | GitHub에서 발급 |
| `spring.security.oauth2.client.registration.google.client-id` | Google OAuth 클라이언트 ID | Google Cloud에서 발급 |
| `spring.security.oauth2.client.registration.google.client-secret` | Google OAuth 클라이언트 시크릿 | Google Cloud에서 발급 |
| `spring.security.oauth2.client.registration.kakao.client-id` | Kakao OAuth 클라이언트 ID | Kakao Developers에서 발급 |
| `spring.security.oauth2.client.registration.kakao.client-secret` | Kakao OAuth 클라이언트 시크릿 | Kakao Developers에서 발급 |

### 6.2 시크릿 관리 방안

1. **개발 환경**:
   - 로컬 개발 시에는 `application-dev.properties` 또는 환경 변수 사용
   - `.gitignore`에 시크릿이 포함된 파일 추가

2. **운영 환경**:
   - 환경 변수 또는 Kubernetes Secrets 사용
   - AWS Parameter Store/Secrets Manager, HashiCorp Vault 등의 시크릿 관리 서비스 활용
   - 주기적으로 시크릿 값 교체 (특히 OAuth 클라이언트 시크릿)

3. **시크릿 참조 방법**:
   ```properties
   # application.properties 예시
   app.jwt.secret=${JWT_SECRET:defaultSecretForDevOnly}
   app.jwt.expiration=${JWT_EXPIRATION:3600000}
   ```

4. **보안 가이드라인**:
   - 절대 시크릿을 소스 코드에 하드코딩하지 않음
   - 로그에 시크릿 값이 출력되지 않도록 주의
   - CI/CD 파이프라인에서 시크릿 관리에 주의 (암호화된 환경 변수 사용)

## 7. 디버깅 및 문제 해결

### 공통 오류 코드

| 오류 코드 | 설명 |
|------------|------------|
| 401 | 인증 실패 (자격 증명 불일치, 토큰 만료) |
| 403 | 권한 불충분 |
| 404 | 사용자를 찾을 수 없음 |
| 409 | 이메일 중복 |
| 422 | 입력값 검증 실패 |
| 500 | 서버 내부 오류 |

### 디버깅 방법

1. 토큰 내용 확인: https://jwt.io 에서 디코딩 가능
2. API 응답의 오류 메시지 확인
3. 서버 로그 확인 