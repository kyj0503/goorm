import { useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useNavigate } from 'react-router-dom';

// 환경 변수 불러오기
const API_URL = import.meta.env.VITE_API_URL;
const WS_URL = import.meta.env.VITE_WS_URL;
const TOPIC_PREFIX = import.meta.env.VITE_TOPIC_PREFIX;
const APP_PREFIX = import.meta.env.VITE_APP_PREFIX;

// 채팅 메시지 타입을 백엔드와 동일하게 정의
enum MessageType {
  ENTER = 'ENTER',
  TALK = 'TALK',
  LEAVE = 'LEAVE'
}

interface ChatMessage {
  type: string; // 문자열로 변경 (enum값 사용)
  roomId: string;
  sender: string;
  message: string;
  timestamp: string;
}

interface UserInfo {
  username: string;
  email: string;
}

// JWT 토큰에서 페이로드 추출
const getTokenPayload = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('JWT 토큰 디코딩 오류:', e);
    return null;
  }
};

const Chat = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [roomId, setRoomId] = useState('test-room');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;
  const receivedMsgIds = useRef<Set<string>>(new Set()); // 중복 메시지 처리를 위한 ID 저장소

  // 토큰 유효성 검사 - 권한 검사 제외
  const isTokenValid = (token: string) => {
    try {
      const payload = getTokenPayload(token);
      if (!payload) return false;
      
      // 만료 시간만 확인
      return payload.exp * 1000 > Date.now();
    } catch (e) {
      console.error('토큰 형식이 잘못되었습니다:', e);
      return false;
    }
  };

  // WebSocket 연결 함수를 useCallback으로 분리
  const connectWebSocket = useCallback((token: string, username: string) => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setConnectionError('서버 연결에 실패했습니다. 페이지를 새로고침 해주세요.');
      return;
    }

    // 토큰 유효성 검사
    if (!isTokenValid(token)) {
      console.error('유효하지 않은 토큰입니다. 로그인 페이지로 이동합니다.');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userInfo');
      navigate('/');
      return;
    }

    console.log('WebSocket 연결 시도...');
    console.log('WebSocket URL:', WS_URL);
    console.log('JWT 토큰 정보:', {
      발행시간: new Date(getTokenPayload(token)?.iat * 1000).toLocaleString(),
      만료시간: new Date(getTokenPayload(token)?.exp * 1000).toLocaleString()
    });

    // STOMP 클라이언트 설정
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: function(str) {
        console.log('STOMP Debug:', str);
      },
      onConnect: () => {
        console.log('Connected to WebSocket');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;
        
        // 채팅방 구독
        client.subscribe(`${TOPIC_PREFIX}/chat/room/${roomId}`, (message) => {
          try {
            const newMessage: ChatMessage = JSON.parse(message.body);
            console.log('Received message:', newMessage);
            
            // 메시지 중복 체크 (타임스탬프 + 내용을 이용한 간단한 해시)
            const msgId = `${newMessage.timestamp}-${newMessage.sender}-${newMessage.message}`;
            if (!receivedMsgIds.current.has(msgId)) {
              receivedMsgIds.current.add(msgId);
              setMessages((prev) => [...prev, newMessage]);
              
              // 메시지 ID 저장소 크기 제한 (메모리 관리)
              if (receivedMsgIds.current.size > 100) {
                const iterator = receivedMsgIds.current.values();
                const firstValue = iterator.next().value;
                if (firstValue) {
                  receivedMsgIds.current.delete(firstValue);
                }
              }
            } else {
              console.log('중복 메시지 무시:', msgId);
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        // ENTER 메시지 전송
        const enterMessage = {
          type: MessageType.ENTER,
          roomId,
          sender: username,
          message: 'has joined the chat',
          timestamp: new Date().toISOString()
        };

        try {
          client.publish({
            destination: `${APP_PREFIX}/chat/message`,
            body: JSON.stringify(enterMessage),
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          console.log('Sent ENTER message');
        } catch (error) {
          console.error('Error sending ENTER message:', error);
        }
      },
      onDisconnect: () => {
        console.log('Disconnected from WebSocket');
        setIsConnected(false);
        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setConnectionError('연결이 끊어졌습니다. 재연결을 시도합니다...');
        }
      },
      onStompError: (frame) => {
        console.error('STOMP Error:', frame);
        setIsConnected(false);
        reconnectAttemptsRef.current++;
        
        // 401 에러는 인증 오류, 로그인 페이지로 리디렉션
        if (frame.headers.message && frame.headers.message.includes('401')) {
          console.log('인증 오류: 로그인 페이지로 이동합니다.');
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('userInfo');
          navigate('/');
        } else if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setConnectionError('연결 오류가 발생했습니다. 재연결을 시도합니다...');
        }
      },
      onWebSocketError: (event) => {
        console.error('WebSocket Error:', event);
        setIsConnected(false);
        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setConnectionError('연결 오류가 발생했습니다. 재연결을 시도합니다...');
        } else {
          console.log('최대 재연결 시도 횟수 초과: 로그인 페이지로 이동합니다.');
          navigate('/');
        }
      }
    });

    clientRef.current = client;
    client.activate();
  }, [roomId, navigate]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedUserInfo = localStorage.getItem('userInfo');
    
    if (!token) {
      console.log('액세스 토큰이 없습니다. 로그인 페이지로 이동합니다.');
      navigate('/');
      return;
    }

    // 토큰 유효성 검사
    if (!isTokenValid(token)) {
      console.log('유효하지 않은 토큰입니다. 로그인 페이지로 이동합니다.');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userInfo');
      navigate('/');
      return;
    }

    // 사용자 정보가 없는 경우 기본 정보 사용
    if (!storedUserInfo) {
      const defaultUserInfo: UserInfo = {
        username: 'GitHub User',
        email: 'user@github.com'
      };
      setUserInfo(defaultUserInfo);
      connectWebSocket(token, defaultUserInfo.username);
    } else {
      try {
        const parsedUserInfo = JSON.parse(storedUserInfo);
        setUserInfo(parsedUserInfo);
        connectWebSocket(token, parsedUserInfo.username);
      } catch (error) {
        console.error('Error parsing user info:', error);
        const defaultUserInfo: UserInfo = {
          username: 'GitHub User',
          email: 'user@github.com'
        };
        setUserInfo(defaultUserInfo);
        connectWebSocket(token, defaultUserInfo.username);
      }
    }

    return () => {
      if (clientRef.current) {
        if (clientRef.current.connected) {
          try {
            // LEAVE 메시지 전송 (선택적)
            // 모든 리소스 정리를 위해 deactivate 호출
            clientRef.current.deactivate();
          } catch (err) {
            console.error('웹소켓 연결 종료 중 오류:', err);
          }
        }
      }
    };
  }, [navigate, connectWebSocket]);

  const sendMessage = () => {
    if (!message.trim() || !clientRef.current || !userInfo || !isConnected) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/');
      return;
    }

    // 토큰 유효성 검사
    if (!isTokenValid(token)) {
      console.log('유효하지 않은 토큰입니다. 로그인 페이지로 이동합니다.');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userInfo');
      navigate('/');
      return;
    }

    const chatMessage = {
      type: MessageType.TALK,
      roomId,
      sender: userInfo.username,
      message,
      timestamp: new Date().toISOString()
    };

    try {
      console.log('Sending message:', chatMessage);
      clientRef.current.publish({
        destination: `${APP_PREFIX}/chat/message`,
        body: JSON.stringify(chatMessage),
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setConnectionError('메시지 전송에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    // 로그아웃 시 WebSocket 연결 해제 및 로컬 스토리지 정보 삭제
    if (clientRef.current) {
      clientRef.current.deactivate();
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userInfo');
    navigate('/');
  };

  const handleReconnect = () => {
    const token = localStorage.getItem('accessToken');
    const storedUserInfo = localStorage.getItem('userInfo');

    if (!token || !storedUserInfo) {
      navigate('/');
      return;
    }

    try {
      reconnectAttemptsRef.current = 0;
      setConnectionError(null);
      
      // 기존 클라이언트가 있으면 정리
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
      
      // 사용자 정보 다시 로드
      const parsedUserInfo = JSON.parse(storedUserInfo);
      connectWebSocket(token, parsedUserInfo.username);
    } catch (error) {
      console.error('수동 재연결 중 오류:', error);
      setConnectionError('재연결 중 오류가 발생했습니다.');
    }
  };

  if (!userInfo) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Simple Chat</h1>
        <button 
          onClick={handleLogout}
          style={{ 
            backgroundColor: '#dc3545', 
            color: 'white', 
            border: 'none', 
            padding: '8px 15px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          로그아웃
        </button>
      </div>
      <p>Welcome, {userInfo.username}!</p>
      {connectionError && (
        <div>
          <p style={{ color: 'red' }}>{connectionError}</p>
          <button 
            onClick={handleReconnect}
            style={{ 
              backgroundColor: '#28a745', 
              color: 'white', 
              border: 'none', 
              padding: '5px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            수동 재연결 시도
          </button>
        </div>
      )}
      {!isConnected && !connectionError && (
        <p style={{ color: 'orange' }}>서버에 연결 중...</p>
      )}
      {isConnected && (
        <p style={{ color: 'green' }}>서버에 연결되었습니다 ✓</p>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
          style={{ marginRight: '10px', padding: '5px' }}
        />
      </div>

      <div
        style={{
          height: '400px',
          border: '1px solid #ccc',
          marginBottom: '20px',
          padding: '10px',
          overflowY: 'auto',
        }}
      >
        {messages.map((msg, index) => (
          <div key={index} style={{ marginBottom: '10px' }}>
            <strong>{msg.sender}: </strong>
            {msg.message}
            <small style={{ display: 'block', color: '#666' }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </small>
          </div>
        ))}
      </div>

      <div>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{ width: '80%', padding: '5px', marginRight: '10px' }}
          disabled={!isConnected}
        />
        <button
          onClick={sendMessage}
          disabled={!isConnected}
          style={{ 
            padding: '5px 15px', 
            backgroundColor: isConnected ? '#007bff' : '#6c757d', 
            color: 'white', 
            border: 'none',
            cursor: isConnected ? 'pointer' : 'not-allowed'
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat; 