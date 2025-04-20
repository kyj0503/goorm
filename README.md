# Simple Chat Application

이 프로젝트는 Spring Boot 백엔드와 React 프론트엔드를 사용한 실시간 채팅 애플리케이션입니다. WebSocket 통신을 사용하여 실시간 메시지 교환 기능을 제공하며, RESTful API를 통해 채팅방 관리 기능을 구현했습니다.

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

### 7. REST API 엔드포인트

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

## 라이선스

MIT
