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
  - `AuthServiceImpl`: 인증 관련 비즈니스 로직 처리
  - `AuthController`: 인증 관련 API 엔드포인트 제공

- **OAuth2 관련 컴포넌트**:
  - `CustomOAuth2UserService`: OAuth2 사용자 정보 처리
  - `OAuth2AuthenticationSuccessHandler`: OAuth2 인증 성공 처리
  - `OAuth2UserInfo`: 소셜 로그인 제공자별 사용자 정보 추출

## 3. API 명세

### 3.1 로컬 인증 API

#### 회원가입

- **URL**: `/api/auth/signup`
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
  "회원가입이 완료되었습니다."
  ```

#### 로그인

- **URL**: `/api/auth/login`
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
    "expiresIn": 86400000
  }
  ```

#### 토큰 갱신

- **URL**: `/api/auth/refresh`
- **Method**: `POST`
- **Request Param**: `refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6...`
- **응답**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "tokenType": "Bearer",
    "expiresIn": 86400000
  }
  ```

#### 로그아웃

- **URL**: `/api/auth/logout`
- **Method**: `POST`
- **Request Param**: `refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6...`
- **응답**: 204 No Content

### 3.2 사용자 관리 API

#### 내 정보 조회

- **URL**: `/api/users/me`
- **Method**: `GET`
- **Headers**: `Authorization: Bearer {accessToken}`
- **응답**:
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "username": "username",
    "profileImage": "https://example.com/profile.jpg",
    "role": "USER",
    "provider": "LOCAL",
    "emailVerified": false
  }
  ```

#### 비밀번호 변경

- **URL**: `/api/users/password`
- **Method**: `POST`
- **Headers**: `Authorization: Bearer {accessToken}`
- **Request Body**:
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword123!"
  }
  ```
- **응답**: `비밀번호가 변경되었습니다.`

#### 프로필 업데이트

- **URL**: `/api/users/profile`
- **Method**: `PUT`
- **Headers**: `Authorization: Bearer {accessToken}`
- **Request Body**:
  ```json
  {
    "username": "newUsername",
    "profileImage": "https://example.com/new-profile.jpg"
  }
  ```
- **응답**:
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "username": "newUsername",
    "profileImage": "https://example.com/new-profile.jpg",
    "role": "USER",
    "provider": "LOCAL",
    "emailVerified": false
  }
  ```

### 3.3 OAuth2 인증 API

#### OAuth2 로그인 초기화

- **URL**: `/oauth2/authorize/{provider}`
- **Method**: `GET`
- **Path Variable**: `provider` - 소셜 로그인 제공자 (google, kakao)
- **설명**: 해당 OAuth2 제공자의 인증 페이지로 리다이렉트

#### OAuth2 콜백

- **리다이렉트 URI**: `/oauth2/callback/{provider}`
- **Method**: `GET`
- **Path Variable**: `provider` - 소셜 로그인 제공자 (google, kakao)
- **설명**: 소셜 로그인 성공 후, 설정된 프론트엔드 URI(`app.oauth2.redirectUri`)로 인증 토큰과 함께 리다이렉트됩니다.
- **리다이렉트 응답**:
  ```
  {app.oauth2.redirectUri}?token={accessToken}&refreshToken={refreshToken}
  ```

#### OAuth2 상태 확인

- **URL**: `/api/oauth2/status`
- **Method**: `GET`
- **응답**: `OAuth2 서비스가 정상적으로 실행 중입니다.`

## 4. JWT 토큰 구조

### 액세스 토큰

- **유형**: Bearer 토큰
- **만료 시간**: 1일 (86400000 밀리초)
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
- **만료 시간**: 7일 (604800000 밀리초)
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
   - 사용자가 로그인할 때마다 해당 사용자의 기존 리프레시 토큰은 갱신됨

4. **비밀번호 정책**:
   - 최소 8자 이상
   - 최소 1개의 대문자, 1개의 소문자, 1개의 숫자, 1개의 특수문자 포함

## 6. 프로젝트 시크릿 관리

이 프로젝트에서는 다양한 민감한 정보(시크릿)가 요구되며, 이를 안전하게 관리해야 합니다.

### 6.1 필요한 시크릿 목록

| 시크릿 키 | 설명 | 권장 설정 |
|----------|------|----------|
| `app.jwt.secret` | JWT 토큰 서명용 비밀 키 | 최소 256비트 길이의 랜덤 문자열 |
| `app.jwt.expiration` | JWT 액세스 토큰 만료 시간(ms) | 86400000 (1일) |
| `app.jwt.refresh-expiration` | JWT 리프레시 토큰 만료 시간(ms) | 604800000 (7일) |
| `spring.datasource.username` | 데이터베이스 사용자명 | - |
| `spring.datasource.password` | 데이터베이스 비밀번호 | - |
| `spring.security.oauth2.client.registration.google.client-id` | Google OAuth 클라이언트 ID | Google Cloud Console에서 발급 |
| `spring.security.oauth2.client.registration.google.client-secret` | Google OAuth 클라이언트 시크릿 | Google Cloud Console에서 발급 |
| `spring.security.oauth2.client.registration.kakao.client-id` | Kakao OAuth 클라이언트 ID | Kakao Developers에서 발급 |
| `spring.security.oauth2.client.registration.kakao.client-secret` | Kakao OAuth 클라이언트 시크릿 | Kakao Developers에서 발급 |
| `app.oauth2.redirectUri` | OAuth2 인증 후 리다이렉트할 프론트엔드 URI | 기본값: http://localhost:3000/oauth2/redirect |

### 6.2 시크릿 관리 방안

1. **개발 환경**:
   - 로컬 개발 시에는 `application-dev.properties` 또는 환경 변수 사용
   - `.gitignore`에 시크릿이 포함된 파일 추가

2. **테스트 환경**:
   - `application-test.properties`에 테스트용 시크릿 사용
   - 실제 운영 시크릿과 분리하여 관리

3. **운영 환경**:
   - 환경 변수 또는 Spring Cloud Config Server 사용
   - AWS Secrets Manager, HashiCorp Vault 등의 시크릿 관리 서비스 활용
   - 주기적으로 시크릿 값 교체 (특히 OAuth 클라이언트 시크릿)

4. **시크릿 참조 방법**:
   ```properties
   # application.properties 예시
   app.jwt.secret=${JWT_SECRET:defaultSecretForDevOnly}
   app.jwt.expiration=${JWT_EXPIRATION:86400000}
   ```

## 7. 인증 시스템 사용 방법

### 7.1 로컬 인증 흐름

1. **회원가입**:
   - `/api/auth/signup` 엔드포인트에 이메일, 비밀번호, 사용자명 제공
   - 회원가입 완료 메시지 수신

2. **로그인**:
   - `/api/auth/login` 엔드포인트에 이메일, 비밀번호 제공
   - 액세스 토큰, 리프레시 토큰 수신

3. **인증된 요청 보내기**:
   - 요청 헤더에 `Authorization: Bearer {accessToken}` 포함
   - 보호된 리소스에 접근

4. **토큰 갱신**:
   - 액세스 토큰 만료 시 `/api/auth/refresh` 엔드포인트에 리프레시 토큰 제공
   - 새로운 액세스 토큰, 리프레시 토큰 수신

5. **로그아웃**:
   - `/api/auth/logout` 엔드포인트에 리프레시 토큰 제공
   - 토큰 무효화

### 7.2 OAuth2 인증 흐름

1. **소셜 로그인 시작**:
   - 사용자를 `/oauth2/authorize/{provider}` 엔드포인트로 리다이렉트
   - 소셜 로그인 제공자의 인증 페이지로 이동

2. **소셜 로그인 완료**:
   - 사용자가 소셜 로그인을 완료하면 `/oauth2/callback/{provider}`로 리다이렉트
   - 시스템은 사용자 정보를 처리하고 JWT 토큰 생성

3. **프론트엔드 리다이렉트**:
   - 설정된 프론트엔드 URI(`app.oauth2.redirectUri`)로 토큰과 함께 리다이렉트
   - 프론트엔드는 토큰을 저장하고 인증된 상태로 설정

4. **이후 인증 흐름**:
   - 로컬 인증과 동일하게 액세스 토큰을 사용하여 요청
   - 필요 시 리프레시 토큰으로 갱신

## 8. 디버깅 및 문제 해결

### 공통 오류 코드

| 오류 코드 | 설명 |
|------------|------------|
| 401 | 인증 실패 (자격 증명 불일치, 토큰 만료) |
| 403 | 권한 불충분 |
| 404 | 사용자를 찾을 수 없음 |
| 409 | 이메일 또는 사용자명 중복 |
| 422 | 입력값 검증 실패 |
| 500 | 서버 내부 오류 |

### 디버깅 방법

1. 토큰 내용 확인: https://jwt.io 에서 디코딩 가능
2. API 응답의 오류 메시지 확인
3. 서버 로그 확인 (특히 JWT 관련 오류 메시지)
4. OAuth2 상태 확인: `/api/oauth2/status` 엔드포인트 사용 