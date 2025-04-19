# Simple Chat Application

이 프로젝트는 Spring Boot 백엔드와 React 프론트엔드를 사용한 실시간 채팅 애플리케이션입니다. WebSocket 통신을 사용하여 실시간 메시지 교환 기능을 제공하며, RESTful API를 통해 채팅방 관리 기능을 구현했습니다.

## 기술 스택

### 프론트엔드
- React (TypeScript)
- STOMP over WebSocket (@stomp/stompjs)
- SockJS
- React Router
- 환경 변수 관리 (Vite)

### 백엔드
- Spring Boot
- Spring Security (JWT 인증)
- WebSocket (STOMP)
- MongoDB (채팅 메시지 저장)
- Redis (채팅방 정보 저장)
- GitHub OAuth2 연동

## 주요 기능

- 사용자 인증 (GitHub OAuth2)
- 채팅방 생성, 조회, 삭제 (관리자 권한 필요)
- 채팅방 참여 및 나가기
- 실시간 메시지 교환
- 채팅 기록 조회 (페이징 처리)
- 사용자 상태 표시

## WebSocket API 명세서

### 1. 개요

이 애플리케이션은 STOMP(Simple Text Oriented Messaging Protocol) 프로토콜을 사용하여 WebSocket 통신을 구현합니다. SockJS는 웹소켓을 지원하지 않는 브라우저에서도 동작할 수 있도록 폴백(fallback) 메커니즘을 제공합니다.

### 2. 연결 설정

#### 연결 엔드포인트
```
WebSocket URL: http://[서버주소]/ws/chat
```

#### 연결 헤더
- `Authorization`: Bearer JWT 토큰 (필수)

#### 연결 예시 (JavaScript/TypeScript)
```typescript
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const client = new Client({
  webSocketFactory: () => new SockJS('http://localhost:8080/ws/chat'),
  connectHeaders: {
    Authorization: `Bearer ${token}`
  },
  onConnect: () => {
    console.log('Connected to WebSocket');
  },
  onDisconnect: () => {
    console.log('Disconnected from WebSocket');
  }
});

client.activate();
```

### 3. 구독 (Subscribe)

#### 채팅방 메시지 구독
특정 채팅방의 메시지를 구독하여 실시간으로 메시지를 수신합니다.

```typescript
// 구독 엔드포인트: /topic/chat/room/{roomId}
const subscription = client.subscribe(`/topic/chat/room/${roomId}`, (message) => {
  const receivedMessage = JSON.parse(message.body);
  console.log('Received:', receivedMessage);
});
```

#### 수신 메시지 형식
```typescript
{
  type: string;        // "ENTER", "TALK", "LEAVE" 중 하나
  roomId: string;      // 채팅방 ID
  sender: string;      // 발신자 이름
  message: string;     // 메시지 내용
  timestamp: string;   // ISO 8601 형식의 타임스탬프
}
```

### 4. 메시지 발행 (Publish)

#### 채팅 메시지 전송
```typescript
// 발행 엔드포인트: /app/chat/message
client.publish({
  destination: '/app/chat/message',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    type: 'TALK',                // "ENTER", "TALK", "LEAVE" 중 하나
    roomId: roomId,              // 채팅방 ID
    sender: username,            // 발신자 이름
    message: messageText,        // 메시지 내용
    timestamp: new Date().toISOString() // 타임스탬프
  })
});
```

#### 메시지 타입
- `ENTER`: 사용자가 채팅방에 입장했을 때
- `TALK`: 일반 채팅 메시지
- `LEAVE`: 사용자가 채팅방을 나갔을 때

### 5. 에러 처리

연결 및 메시지 전송 중 발생할 수 있는 오류에 대한 처리가 필요합니다.
클라이언트 구현에서는 다음과 같은 에러 처리를 고려해야 합니다:

1. **연결 실패**: 서버에 연결할 수 없는 경우 (네트워크 문제, 서버 다운 등)
2. **인증 실패**: 유효하지 않은 토큰으로 연결 시도
3. **구독 실패**: 존재하지 않는 채팅방 구독 시도
4. **메시지 전송 실패**: 메시지 형식 오류 또는 권한 문제

예시:
```typescript
client.onStompError = (frame) => {
  console.error('STOMP Error:', frame.headers['message']);
  // 에러 상태 처리 로직
};
```

### 6. 재연결 전략

네트워크 문제로 연결이 끊어진 경우 자동 재연결 전략을 구현해야 합니다.
프론트엔드에서는 지수 백오프(exponential backoff) 방식을 사용하여 재연결 시도 간격을 점진적으로 늘리는 것이 좋습니다.

```typescript
const client = new Client({
  // ... 기타 설정
  reconnectDelay: 1000,           // 초기 재연결 지연 시간 (1초)
  heartbeatIncoming: 4000,        // 서버로부터의 하트비트 간격
  heartbeatOutgoing: 4000         // 서버로 보내는 하트비트 간격
});
```

### 7. REST API 엔드포인트

WebSocket 외에도 채팅 관련 기능에 사용되는 REST API 엔드포인트는 다음과 같습니다:

#### 채팅방 관리
- `GET /api/chat/rooms`: 모든 채팅방 목록 조회
- `GET /api/chat/rooms/{roomId}`: 특정 채팅방 정보 조회
- `POST /api/chat/rooms`: 새 채팅방 생성 (ADMIN 권한 필요)
- `DELETE /api/chat/rooms/{roomId}`: 채팅방 삭제 (ADMIN 권한 필요)
- `POST /api/chat/rooms/{roomId}/join`: 채팅방 참여
- `POST /api/chat/rooms/{roomId}/leave`: 채팅방 나가기

#### 메시지 조회
- `GET /api/chat/rooms/{roomId}/messages`: 특정 채팅방의 모든 메시지 조회
- `GET /api/chat/rooms/{roomId}/messages/paged?page=0&size=50`: 페이징 처리된 메시지 조회
- `GET /api/chat/rooms/{roomId}/messages/after/{timestamp}`: 특정 시간 이후의 메시지 조회
- `GET /api/chat/users/{username}/messages`: 특정 사용자가 보낸 메시지 조회
- `GET /api/chat/messages/search?keyword={keyword}`: 키워드로 메시지 검색

### 8. 인증 및 권한

모든 WebSocket 연결과 API 요청은 JWT 토큰을 통한 인증이 필요합니다. 토큰은 Authorization 헤더에 Bearer 스키마로 포함되어야 합니다.

```
Authorization: Bearer [JWT 토큰]
```

JWT 토큰은 다음 정보를 포함합니다:
- `sub`: GitHub 사용자 ID
- `githubToken`: GitHub 액세스 토큰
- `userId`: 내부 사용자 ID
- `role`: 사용자 역할 (USER 또는 ADMIN)
- `iat`: 토큰 발행 시간
- `exp`: 토큰 만료 시간

### 9. 메시지 중복 처리

실시간 메시지 교환 시 네트워크 문제로 인한 중복 메시지를 처리하기 위해 클라이언트 측에서 메시지 ID(타임스탬프 + 발신자 + 내용의 조합)를 사용하여 중복을 필터링합니다.

```typescript
// 메시지 중복 체크 (타임스탬프 + 내용을 이용한 간단한 해시)
const msgId = `${newMessage.timestamp}-${newMessage.sender}-${newMessage.message}`;
if (!receivedMsgIds.has(msgId)) {
  receivedMsgIds.add(msgId);
  // 메시지 처리
} else {
  console.log('중복 메시지 무시');
}
```

## 설치 및 실행

### 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 다음과 같이 설정합니다:

```
VITE_API_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080/ws/chat
VITE_TOPIC_PREFIX=/topic
VITE_APP_PREFIX=/app
VITE_GITHUB_CLIENT_ID=your_github_client_id
```

### 설치
```bash
npm install
```

### 개발 모드 실행
```bash
npm run dev
```

### 빌드
```bash
npm run build
```

## 프로젝트 구조

```
simple-chat/
├── public/             # 정적 파일
├── src/                # 소스 코드
│   ├── assets/         # 이미지, 폰트 등 자산
│   ├── components/     # React 컴포넌트
│   │   ├── Chat.tsx    # 메인 채팅 컴포넌트
│   │   ├── GitHubLogin.tsx # GitHub 로그인 컴포넌트
│   │   └── Callback.tsx # OAuth 콜백 처리 컴포넌트
│   ├── App.tsx         # 메인 앱 컴포넌트
│   └── main.tsx        # 앱 엔트리 포인트
├── .env                # 환경 변수
├── package.json        # 의존성 및 스크립트
└── vite.config.ts      # Vite 설정
```

## 라이선스

MIT
