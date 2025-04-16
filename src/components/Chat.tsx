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

// 백오프 관련 상수
const INITIAL_RECONNECT_DELAY = 1000; // 초기 재연결 지연 시간 (1초)
const MAX_RECONNECT_DELAY = 30000; // 최대 재연결 지연 시간 (30초)
const RECONNECT_BACKOFF_FACTOR = 1.5; // 재연결 지연 시간 증가 팩터
const MAX_RECONNECT_ATTEMPTS = 5; // 최대 재연결 시도 횟수

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
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [hasServerError, setHasServerError] = useState(false);
  
  const clientRef = useRef<Client | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const receivedMsgIds = useRef<Set<string>>(new Set()); // 중복 메시지 처리를 위한 ID 저장소

  // 토큰 유효성 검사 - 만료 시간 및 형식 확인
  const isTokenValid = (token: string) => {
    try {
      const payload = getTokenPayload(token);
      if (!payload) return false;
      
      // 만료 시간 확인
      return payload.exp * 1000 > Date.now();
    } catch (e) {
      console.error('토큰 형식이 잘못되었습니다:', e);
      return false;
    }
  };

  // 서버 상태 확인 함수
  const checkServerStatus = useCallback(async () => {
    try {
      setServerStatus('checking');
      const response = await fetch(`${API_URL}/actuator/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        setServerStatus('online');
        setHasServerError(false);
        return true;
      } else {
        setServerStatus('offline');
        setHasServerError(true);
        return false;
      }
    } catch (error) {
      console.error('서버 상태 확인 중 오류:', error);
      setServerStatus('offline');
      setHasServerError(true);
      return false;
    }
  }, [API_URL]);

  // 토큰 갱신 함수
  const refreshToken = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        throw new Error('리프레시 토큰이 없습니다.');
      }

      const response = await fetch(`${API_URL}/api/users/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('토큰 갱신에 실패했습니다.');
      }

      const data = await response.json();
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        console.log('토큰이 성공적으로 갱신되었습니다.');
        return data.accessToken;
      } else {
        throw new Error('새 액세스 토큰을 받지 못했습니다.');
      }
    } catch (error) {
      console.error('토큰 갱신 오류:', error);
      // 갱신 실패 시 로그아웃 처리
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userInfo');
      navigate('/');
      return null;
    }
  }, [API_URL, navigate]);

  // WebSocket 연결 함수를 useCallback으로 분리 - 지수 백오프 적용
  const connectWebSocket = useCallback(async (token: string, username: string) => {
    // 먼저 서버 상태 확인
    const isServerOnline = await checkServerStatus();
    if (!isServerOnline) {
      setConnectionError('서버가 오프라인 상태입니다. 잠시 후 다시 시도해주세요.');
      // 30초 후 서버 상태 재확인
      setTimeout(checkServerStatus, 30000);
      return;
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionError('서버 연결에 실패했습니다. 페이지를 새로고침 해주세요.');
      return;
    }

    // 토큰 유효성 검사
    if (!isTokenValid(token)) {
      console.log('토큰이 만료되었습니다. 리프레시 토큰으로 갱신을 시도합니다.');
      const newToken = await refreshToken();
      if (!newToken) {
        console.error('토큰 갱신에 실패했습니다. 로그인 페이지로 이동합니다.');
        navigate('/');
        return;
      }
      token = newToken;
    }

    console.log('WebSocket 연결 시도...');
    console.log('WebSocket URL:', WS_URL);
    console.log('JWT 토큰 정보:', {
      발행시간: new Date(getTokenPayload(token)?.iat * 1000).toLocaleString(),
      만료시간: new Date(getTokenPayload(token)?.exp * 1000).toLocaleString()
    });

    // 이전 연결 정리
    if (clientRef.current && clientRef.current.connected) {
      try {
        await clientRef.current.deactivate();
        console.log('이전 WebSocket 연결 정리 완료');
      } catch (error) {
        console.error('이전 WebSocket 연결 정리 중 오류:', error);
      }
    }

    // 지수 백오프를 사용한 재연결 지연 시간 계산
    const reconnectDelay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_FACTOR, reconnectAttemptsRef.current),
      MAX_RECONNECT_DELAY
    );

    // STOMP 클라이언트 설정
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      reconnectDelay: reconnectDelay,
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
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(enterMessage)
          });
          console.log('Sent ENTER message');
        } catch (error) {
          console.error('Error sending ENTER message:', error);
        }
      },
      onDisconnect: () => {
        console.log('Disconnected from WebSocket');
        setIsConnected(false);
        
        // 이미 진행 중인 재연결 타이머가 있으면 취소
        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const nextDelay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_FACTOR, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY
          );
          
          setConnectionError(`연결이 끊어졌습니다. ${Math.round(nextDelay / 1000)}초 후 재연결을 시도합니다...`);
          
          // 백오프 시간 후 재연결 시도
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (userInfo) {
              const currentToken = localStorage.getItem('accessToken');
              if (currentToken) {
                connectWebSocket(currentToken, userInfo.username);
              }
            }
          }, nextDelay);
        } else {
          setConnectionError('최대 재연결 시도 횟수를 초과했습니다. 페이지를 새로고침해 주세요.');
        }
      },
      onStompError: (frame) => {
        console.error('STOMP Error:', frame);
        setIsConnected(false);
        
        // 401 에러는 인증 오류, 토큰 갱신 시도
        if (frame.headers.message && frame.headers.message.includes('401')) {
          console.log('인증 오류: 토큰 갱신을 시도합니다.');
          refreshToken().then(newToken => {
            if (newToken && userInfo) {
              connectWebSocket(newToken, userInfo.username);
            }
          });
        } else if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          setConnectionError('연결 오류가 발생했습니다. 재연결을 시도합니다...');
        }
      },
      onWebSocketError: (event) => {
        console.error('WebSocket Error:', event);
        setIsConnected(false);
        // 서버 상태 확인
        checkServerStatus();
      }
    });

    clientRef.current = client;
    client.activate();
  }, [roomId, navigate, checkServerStatus, refreshToken]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedUserInfo = localStorage.getItem('userInfo');
    
    if (!token) {
      console.log('액세스 토큰이 없습니다. 로그인 페이지로 이동합니다.');
      navigate('/');
      return;
    }

    // 서버 상태 먼저 확인
    checkServerStatus();

    // 토큰 유효성 검사
    if (!isTokenValid(token)) {
      console.log('유효하지 않은 토큰입니다. 리프레시를 시도합니다.');
      refreshToken().then(newToken => {
        if (!newToken) {
          navigate('/');
        } else if (storedUserInfo) {
          try {
            const parsedUserInfo = JSON.parse(storedUserInfo);
            setUserInfo(parsedUserInfo);
            connectWebSocket(newToken, parsedUserInfo.username);
          } catch (error) {
            console.error('사용자 정보 파싱 오류:', error);
            navigate('/');
          }
        }
      });
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
      // 컴포넌트 언마운트 시 실행되는 cleanup 함수
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (clientRef.current) {
        try {
          // 연결된 상태에서만 deactivate 호출
          if (clientRef.current.connected) {
            clientRef.current.deactivate();
          }
        } catch (err) {
          console.error('웹소켓 연결 종료 중 오류:', err);
        }
      }
    };
  }, [navigate, connectWebSocket, checkServerStatus, refreshToken]);

  const sendMessage = () => {
    if (!message.trim() || !clientRef.current || !userInfo) return;
    
    // 연결 상태 확인
    if (!isConnected) {
      setConnectionError('메시지를 보낼 수 없습니다. 연결이 끊어졌습니다.');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/');
      return;
    }

    // 토큰 유효성 검사
    if (!isTokenValid(token)) {
      console.log('토큰이 만료되었습니다. 갱신을 시도합니다.');
      refreshToken().then(newToken => {
        if (newToken) {
          sendMessageWithToken(newToken);
        }
      });
      return;
    }

    sendMessageWithToken(token);
  };

  const sendMessageWithToken = (token: string) => {
    if (!message.trim() || !clientRef.current || !userInfo || !isConnected) return;

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
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(chatMessage)
      });
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setConnectionError('메시지 전송에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    // 로그아웃 시 WebSocket 연결 해제 및 로컬 스토리지 정보 삭제
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (clientRef.current) {
      try {
        if (clientRef.current.connected) {
          clientRef.current.deactivate();
        }
      } catch (error) {
        console.error('로그아웃 중 WebSocket 연결 해제 오류:', error);
      }
    }
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userInfo');
    navigate('/');
  };

  const handleReconnect = () => {
    reconnectAttemptsRef.current = 0;
    setConnectionError('서버에 다시 연결 중...');
    
    const token = localStorage.getItem('accessToken');
    if (!token || !userInfo) {
      navigate('/');
      return;
    }

    connectWebSocket(token, userInfo.username);
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
      
      {/* 서버 상태 표시 */}
      <div style={{ marginBottom: '10px' }}>
        <span>서버 상태: </span>
        {serverStatus === 'checking' && <span style={{ color: 'orange' }}>확인 중...</span>}
        {serverStatus === 'online' && <span style={{ color: 'green' }}>온라인 ✓</span>}
        {serverStatus === 'offline' && <span style={{ color: 'red' }}>오프라인 ✗</span>}
      </div>
      
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
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', marginTop: '180px' }}>
            메시지가 없습니다. 첫 메시지를 보내보세요!
          </div>
        )}
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