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

interface ChatRoom {
  roomId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  participants: string[];
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
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  // 채팅방 관련 상태 추가
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [showCreateRoomForm, setShowCreateRoomForm] = useState(false);
  const [userRole, setUserRole] = useState<string>('USER');
  
  const clientRef = useRef<Client | null>(null);
  const subscriptionRef = useRef<any>(null); // 구독 참조 추가
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const receivedMsgIds = useRef<Set<string>>(new Set()); // 중복 메시지 처리를 위한 ID 저장소

  // 자동 스크롤을 위한 ref 추가
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 목록이 업데이트될 때 스크롤을 아래로 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 메시지 전송 후 스크롤 이동
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
        return true;
      } else {
        setServerStatus('offline');
        return false;
      }
    } catch (error) {
      console.error('서버 상태 확인 중 오류:', error);
      setServerStatus('offline');
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
  // handleReconnect 함수를 먼저 선언
  const handleReconnect = useCallback(() => {
    // 이미 진행 중인 재연결 타이머가 있으면 취소
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
    setConnectionError('서버에 다시 연결 중...');
    
    // 클라이언트가 존재하고 연결된 경우 정리
    if (clientRef.current) {
      // 구독 해제
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('재연결 중 구독 해제 오류 (무시됨):', e);
        }
        subscriptionRef.current = null;
      }
      
      // 클라이언트 비활성화
      if (clientRef.current.connected) {
        try {
          clientRef.current.deactivate();
        } catch (e) {
          console.warn('재연결 중 클라이언트 비활성화 오류 (무시됨):', e);
        }
      }
    }
    
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('액세스 토큰이 없습니다. 로그인 페이지로 이동합니다.');
      navigate('/');
      return;
    }
    
    if (!userInfo) {
      console.error('사용자 정보가 없습니다. 로그인 페이지로 이동합니다.');
      navigate('/');
      return;
    }

    // 잠시 지연 후 연결 시도 - 이전 연결이 완전히 종료될 시간 확보
    setTimeout(() => {
      connectWebSocket(token, userInfo.username);
    }, 1000);
  }, [navigate, userInfo]);

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
    if (clientRef.current) {
      try {
        // 기존 구독이 있으면 해제
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
          } catch (unsubError) {
            console.warn('구독 해제 중 오류 (무시됨):', unsubError);
          }
          subscriptionRef.current = null;
        }
        
        // 연결되어 있는 경우만 비활성화
        if (clientRef.current.connected) {
          await clientRef.current.deactivate();
        }
        console.log('이전 WebSocket 연결 정리 완료');
      } catch (error) {
        console.error('이전 WebSocket 연결 정리 중 오류:', error);
        // 오류가 발생해도 계속 진행
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
        
        // 클라이언트 참조 저장
        clientRef.current = client;
        
        // 잠시 지연 후 구독 설정 - 연결 완료 후 약간의 지연을 두어 안정화
        setTimeout(() => {
          // 기존 구독 해제
          if (subscriptionRef.current) {
            try {
              subscriptionRef.current.unsubscribe();
            } catch (e) {
              console.warn('기존 구독 해제 중 오류 (무시됨):', e);
            }
            subscriptionRef.current = null;
          }

          // 새 구독 설정
          try {
            // 연결 상태 한번 더 확인
            if (!client.connected) {
              console.warn('클라이언트가 연결되어 있지 않습니다. 구독을 건너뜁니다.');
              return;
            }
            
            // 채팅방 구독
            const subscription = client.subscribe(`${TOPIC_PREFIX}/chat/room/${roomId}`, (message) => {
              try {
                const newMessage: ChatMessage = JSON.parse(message.body);
                console.log('Received message:', newMessage);
                
                // ENTER 타입 메시지에 대한 추가 필터링
                if (newMessage.type === MessageType.ENTER) {
                  // 최근 30초 이내에 같은 사용자의 입장 메시지가 있으면 무시
                  const recentEnterMessages = messages.filter(m => 
                    m.type === MessageType.ENTER && 
                    m.sender === newMessage.sender &&
                    new Date(m.timestamp).getTime() > Date.now() - 30000
                  );
                  
                  if (recentEnterMessages.length > 0) {
                    console.log('중복 입장 메시지 무시:', newMessage.sender);
                    return;
                  }
                }
                
                // 메시지 중복 체크 (타임스탬프 + 내용을 이용한 간단한 해시)
                const msgId = `${newMessage.timestamp}-${newMessage.sender}-${newMessage.message}`;
                if (!receivedMsgIds.current.has(msgId)) {
                  receivedMsgIds.current.add(msgId);
                  setMessages((prev) => [...prev, newMessage]);
                  
                  // 주기적으로 오래된 메시지 ID 정리
                  cleanupReceivedMsgIds();
                } else {
                  console.log('중복 메시지 무시:', msgId);
                }
              } catch (error) {
                console.error('Error parsing message:', error);
              }
            });
            
            // 구독 참조 저장
            subscriptionRef.current = subscription;
            console.log('초기 채팅방 구독 완료:', roomId);
            
            // 이전 메시지 로드
            fetchPreviousMessages(roomId);
          } catch (e) {
            console.error('채팅방 구독 중 오류:', e);
            // 구독 오류 시 5초 후 재시도
            setTimeout(() => {
              if (client.connected) {
                console.log('구독 재시도...');
                // onConnect 콜백이 다시 호출되지 않게 직접 구독
                try {
                  const subscription = client.subscribe(`${TOPIC_PREFIX}/chat/room/${roomId}`, (message) => {
                    const newMessage: ChatMessage = JSON.parse(message.body);
                    console.log('Received message (retry):', newMessage);
                    setMessages((prev) => [...prev, newMessage]);
                  });
                  subscriptionRef.current = subscription;
                } catch (retryError) {
                  console.error('구독 재시도 실패:', retryError);
                }
              }
            }, 5000);
          }

          // ENTER 메시지 전송
          if (client.connected) {
            // enterFlag를 사용하여 중복 ENTER 메시지 방지
            const enterFlag = sessionStorage.getItem(`enter-${roomId}`);
            const currentTime = Date.now();
            
            // 첫 입장이거나 마지막 입장으로부터 10초 이상 지났을 때만 ENTER 메시지 전송
            if (!enterFlag || (currentTime - parseInt(enterFlag)) > 10000) {
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
                // 입장 시간 기록
                sessionStorage.setItem(`enter-${roomId}`, currentTime.toString());
              } catch (error) {
                console.error('Error sending ENTER message:', error);
              }
            } else {
              console.log('중복 ENTER 메시지 방지: 최근에 이미 입장 메시지를 보냈습니다.');
            }
          }
        }, 500); // 연결 후 500ms 지연
      },
      onDisconnect: () => {
        console.log('Disconnected from WebSocket');
        setIsConnected(false);
        
        // 이미 진행 중인 재연결 타이머가 있으면 취소
        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }

        // 구독 참조 정리
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
          } catch (e) {
            console.warn('연결 끊김 시 구독 해제 중 오류 (무시됨):', e);
          }
          subscriptionRef.current = null;
        }

        reconnectAttemptsRef.current++;
        
        // 강제로 클라이언트를 null로 설정하지 않고 참조는 유지
        // 재연결 시 이전 연결 상태를 감지하기 위함
      }
    });

    // 클라이언트 참조 저장 (연결 시도 시점에도 저장)
    clientRef.current = client;
    
    // 연결 시작
    client.activate();
  }, [navigate, roomId, TOPIC_PREFIX, APP_PREFIX, checkServerStatus, refreshToken]);

  // handleReconnect 의존성 배열 업데이트 - 순환참조 해결
  useEffect(() => {
    // 수명주기 관리를 위한 빈 useEffect
    // handleReconnect에서 connectWebSocket을 호출하고, connectWebSocket에서 handleReconnect 의존성 문제 해결
  }, [handleReconnect, connectWebSocket]);

  useEffect(() => {
    let hasConnected = false;
    
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
        } else if (storedUserInfo && !hasConnected) {
          try {
            const parsedUserInfo = JSON.parse(storedUserInfo);
            setUserInfo(parsedUserInfo);
            connectWebSocket(newToken, parsedUserInfo.username);
            hasConnected = true;
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
      
      if (!hasConnected) {
        connectWebSocket(token, defaultUserInfo.username);
        hasConnected = true;
      }
    } else {
      try {
        const parsedUserInfo = JSON.parse(storedUserInfo);
        setUserInfo(parsedUserInfo);
        
        if (!hasConnected) {
          connectWebSocket(token, parsedUserInfo.username);
          hasConnected = true;
        }
      } catch (error) {
        console.error('Error parsing user info:', error);
        const defaultUserInfo: UserInfo = {
          username: 'GitHub User',
          email: 'user@github.com'
        };
        setUserInfo(defaultUserInfo);
        
        if (!hasConnected) {
          connectWebSocket(token, defaultUserInfo.username);
          hasConnected = true;
        }
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
      
      // 세션 스토리지 정리
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('enter-')) {
          sessionStorage.removeItem(key);
        }
      });
    };
  }, [navigate, connectWebSocket, checkServerStatus, refreshToken]);

  // 룸 ID 변경 시 새로 구독 설정
  useEffect(() => {
    // 이미 연결되어 있고 토큰과 유저 정보가 있는 경우에만
    if (isConnected && clientRef.current && userInfo) {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      // 구독 설정 함수 - 지연 실행을 위해 별도 함수로 분리
      const setupSubscription = () => {
        if (!clientRef.current || !clientRef.current.connected) {
          console.log('STOMP 클라이언트가 연결되어 있지 않습니다. 재연결 시도...');
          handleReconnect();
          return;
        }

        try {
          const subscription = clientRef.current.subscribe(`${TOPIC_PREFIX}/chat/room/${roomId}`, (message) => {
            try {
              const newMessage: ChatMessage = JSON.parse(message.body);
              console.log('Received message:', newMessage);
              
              // ENTER 타입 메시지에 대한 추가 필터링
              if (newMessage.type === MessageType.ENTER) {
                // 최근 30초 이내에 같은 사용자의 입장 메시지가 있으면 무시
                const recentEnterMessages = messages.filter(m => 
                  m.type === MessageType.ENTER && 
                  m.sender === newMessage.sender &&
                  new Date(m.timestamp).getTime() > Date.now() - 30000
                );
                
                if (recentEnterMessages.length > 0) {
                  console.log('중복 입장 메시지 무시:', newMessage.sender);
                  return;
                }
              }
              
              // 메시지 중복 체크 (타임스탬프 + 내용을 이용한 간단한 해시)
              const msgId = `${newMessage.timestamp}-${newMessage.sender}-${newMessage.message}`;
              if (!receivedMsgIds.current.has(msgId)) {
                receivedMsgIds.current.add(msgId);
                setMessages((prev) => [...prev, newMessage]);
                
                // 주기적으로 오래된 메시지 ID 정리
                cleanupReceivedMsgIds();
              } else {
                console.log('중복 메시지 무시:', msgId);
              }
            } catch (error) {
              console.error('Error parsing message:', error);
            }
          });
          
          subscriptionRef.current = subscription;
          console.log('새 채팅방 구독 완료:', roomId);
          
          // 이전 메시지 로드
          fetchPreviousMessages(roomId);
          
          // 새 방 입장 메시지 전송
          if (clientRef.current.connected) {
            // enterFlag를 사용하여 중복 ENTER 메시지 방지
            const enterFlag = sessionStorage.getItem(`enter-${roomId}`);
            const currentTime = Date.now();
            
            // 첫 입장이거나 마지막 입장으로부터 10초 이상 지났을 때만 ENTER 메시지 전송
            if (!enterFlag || (currentTime - parseInt(enterFlag)) > 10000) {
              const enterMessage = {
                type: MessageType.ENTER,
                roomId,
                sender: userInfo.username,
                message: 'has joined the chat',
                timestamp: new Date().toISOString()
              };

              clientRef.current.publish({
                destination: `${APP_PREFIX}/chat/message`,
                headers: {
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(enterMessage)
              });
              
              // 입장 시간 기록
              sessionStorage.setItem(`enter-${roomId}`, currentTime.toString());
            } else {
              console.log('중복 ENTER 메시지 방지: 최근에 이미 입장 메시지를 보냈습니다.');
            }
            
            // 메시지 목록 초기화
            setMessages([]);
            receivedMsgIds.current.clear();
          }
        } catch (e) {
          console.error('새 채팅방 구독 중 오류:', e);
          // 오류 발생 시 잠시 후 재시도
          setTimeout(() => {
            console.log('구독 재시도 중...');
            if (clientRef.current && clientRef.current.connected) {
              setupSubscription();
            }
          }, 1000);
        }
      };

      // 기존 구독 해제 후 잠시 지연 시간을 둔 후 새 구독 설정
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
          console.log('룸 변경으로 인한 기존 구독 해제');
          
          // 구독 해제 후 100ms 지연 후 새 구독 설정
          setTimeout(setupSubscription, 100);
        } catch (e) {
          console.error('구독 해제 중 오류:', e);
          // 오류가 발생해도 새 구독 설정 시도
          setTimeout(setupSubscription, 100);
        }
      } else {
        // 기존 구독이 없는 경우 즉시 설정
        setupSubscription();
      }
    }
  }, [roomId, isConnected, TOPIC_PREFIX, APP_PREFIX, userInfo, handleReconnect]);

  // 이전 채팅 메시지 로드 함수
  const fetchPreviousMessages = useCallback(async (currentRoomId: string) => {
    try {
      setIsLoadingMessages(true);
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('이전 메시지 로드 실패: 인증 토큰이 없습니다.');
        return;
      }
      
      console.log(`채팅방 ${currentRoomId}의 이전 메시지 로드 중...`);
      
      // 페이징 처리된 채팅 메시지 조회 API 호출
      const response = await fetch(`${API_URL}/api/chat/rooms/${currentRoomId}/messages/paged?page=0&size=50`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error(`이전 메시지 로드 실패: ${response.status} ${response.statusText}`);
        return;
      }
      
      const data = await response.json();
      console.log('이전 메시지 로드 성공:', data);
      
      // 페이징 응답 구조에 따라 content 배열 접근 (Spring Data의 일반적인 페이징 응답 구조)
      const previousMessages = data.content || data;
      
      if (Array.isArray(previousMessages) && previousMessages.length > 0) {
        // 시간순으로 정렬 (오래된 메시지부터)
        const sortedMessages = [...previousMessages].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // 이미 로드된 각 메시지의 ID를 receivedMsgIds에 추가
        sortedMessages.forEach(msg => {
          const msgId = `${msg.timestamp}-${msg.sender}-${msg.message}`;
          receivedMsgIds.current.add(msgId);
        });
        
        // 메시지 목록 설정
        setMessages(sortedMessages);
        console.log(`${sortedMessages.length}개의 이전 메시지를 로드했습니다.`);
        
        // 메시지가 로드된 후 스크롤 이동
        setTimeout(scrollToBottom, 100);
      } else {
        console.log('이전 메시지가 없습니다.');
      }
    } catch (error) {
      console.error('이전 메시지 로드 중 오류:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [API_URL]);

  // 초기 구독 완료 후 이전 메시지 로드 추가
  useEffect(() => {
    // 채팅방 구독이 완료되고 연결 상태일 때만 이전 메시지 로드
    if (isConnected && roomId && subscriptionRef.current) {
      fetchPreviousMessages(roomId);
    }
  }, [isConnected, roomId, fetchPreviousMessages]);

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
      // 메시지 전송 후 스크롤 아래로 이동
      setTimeout(scrollToBottom, 100);
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
    
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      } catch (e) {
        console.error('로그아웃 중 구독 해제 오류:', e);
      }
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

  // 1. 중복 메시지 처리를 위한 참조 변수 개선
  // receivedMsgIds 세트를 시간 기반으로 정리하는 함수 추가
  const cleanupReceivedMsgIds = () => {
    // 1분(60000ms) 이상 된 메시지 ID는 제거
    const now = Date.now();
    const expiredIds: string[] = [];
    
    receivedMsgIds.current.forEach(id => {
      const [timestamp] = id.split('-');
      const msgTime = new Date(timestamp).getTime();
      
      if (now - msgTime > 60000) {
        expiredIds.push(id);
      }
    });
    
    expiredIds.forEach(id => {
      receivedMsgIds.current.delete(id);
    });
    
    // 정리 후에도 100개 이상이면 가장 오래된 것 삭제
    if (receivedMsgIds.current.size > 100) {
      const oldestIds = Array.from(receivedMsgIds.current).slice(0, receivedMsgIds.current.size - 100);
      oldestIds.forEach(id => {
        receivedMsgIds.current.delete(id);
      });
    }
  };

  // 채팅방 목록 로드 함수
  const fetchChatRooms = useCallback(async () => {
    try {
      setIsLoadingRooms(true);
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('채팅방 목록 로드 실패: 인증 토큰이 없습니다.');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/chat/rooms`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error(`채팅방 목록 로드 실패: ${response.status} ${response.statusText}`);
        return;
      }
      
      const data = await response.json();
      setChatRooms(data);
      console.log('채팅방 목록 로드 성공:', data);
    } catch (error) {
      console.error('채팅방 목록 로드 중 오류:', error);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [API_URL]);
  
  // 채팅방 생성 함수
  const createChatRoom = async () => {
    try {
      if (!newRoomName.trim()) {
        alert('채팅방 이름을 입력해주세요.');
        return;
      }
      
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('채팅방 생성 실패: 인증 토큰이 없습니다.');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/chat/rooms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newRoomName,
          description: newRoomDescription,
          createdBy: userInfo?.username
        })
      });
      
      if (!response.ok) {
        console.error(`채팅방 생성 실패: ${response.status} ${response.statusText}`);
        if (response.status === 403) {
          alert('채팅방 생성 권한이 없습니다. 관리자만 채팅방을 생성할 수 있습니다.');
        } else {
          alert('채팅방 생성에 실패했습니다.');
        }
        return;
      }
      
      const data = await response.json();
      console.log('채팅방 생성 성공:', data);
      
      // 폼 초기화 및 채팅방 목록 갱신
      setNewRoomName('');
      setNewRoomDescription('');
      setShowCreateRoomForm(false);
      fetchChatRooms();
    } catch (error) {
      console.error('채팅방 생성 중 오류:', error);
      alert('채팅방 생성 중 오류가 발생했습니다.');
    }
  };
  
  // 채팅방 삭제 함수
  const deleteChatRoom = async (targetRoomId: string) => {
    try {
      if (!confirm('정말로 이 채팅방을 삭제하시겠습니까?')) {
        return;
      }
      
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('채팅방 삭제 실패: 인증 토큰이 없습니다.');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/chat/rooms/${targetRoomId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error(`채팅방 삭제 실패: ${response.status} ${response.statusText}`);
        if (response.status === 403) {
          alert('채팅방 삭제 권한이 없습니다. 관리자만 채팅방을 삭제할 수 있습니다.');
        } else {
          alert('채팅방 삭제에 실패했습니다.');
        }
        return;
      }
      
      console.log('채팅방 삭제 성공');
      
      // 채팅방 목록 갱신
      fetchChatRooms();
      
      // 현재 접속 중인 채팅방이 삭제된 경우 첫 번째 채팅방으로 이동
      if (targetRoomId === roomId) {
        if (chatRooms.length > 1) {
          const newRoomId = chatRooms.find(room => room.roomId !== targetRoomId)?.roomId || '';
          setRoomId(newRoomId);
        } else {
          setRoomId('');
          setMessages([]);
        }
      }
    } catch (error) {
      console.error('채팅방 삭제 중 오류:', error);
      alert('채팅방 삭제 중 오류가 발생했습니다.');
    }
  };
  
  // 채팅방 입장 함수
  const enterChatRoom = async (roomId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('채팅방 입장 실패: 인증 토큰이 없습니다.');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error(`채팅방 입장 실패: ${response.status} ${response.statusText}`);
        alert('채팅방 입장에 실패했습니다.');
        return;
      }
      
      console.log('채팅방 입장 성공');
      
      // 채팅방 ID 변경 (useEffect에서 구독 처리)
      setRoomId(roomId);
      
      // 메시지 초기화
      setMessages([]);
    } catch (error) {
      console.error('채팅방 입장 중 오류:', error);
      alert('채팅방 입장 중 오류가 발생했습니다.');
    }
  };
  
  // 토큰에서 사용자 역할 추출
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = getTokenPayload(token);
      if (payload && payload.role) {
        setUserRole(payload.role);
      }
    }
  }, []);
  
  // 초기 로드 시 채팅방 목록 조회
  useEffect(() => {
    if (isConnected) {
      fetchChatRooms();
    }
  }, [isConnected, fetchChatRooms]);

  if (!userInfo) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
      
      {/* 채팅방 목록 및 관리 UI */}
      <div style={{ display: 'flex', marginBottom: '20px' }}>
        {/* 채팅방 목록 */}
        <div style={{ width: '30%', marginRight: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: '0' }}>채팅방 목록</h3>
            {userRole === 'ADMIN' && (
              <button
                onClick={() => setShowCreateRoomForm(!showCreateRoomForm)}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {showCreateRoomForm ? '취소' : '방 생성'}
              </button>
            )}
          </div>
          
          {/* 채팅방 생성 폼 */}
          {showCreateRoomForm && (
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="방 이름"
                style={{ width: '100%', padding: '5px', marginBottom: '5px' }}
              />
              <input
                type="text"
                value={newRoomDescription}
                onChange={(e) => setNewRoomDescription(e.target.value)}
                placeholder="방 설명"
                style={{ width: '100%', padding: '5px', marginBottom: '10px' }}
              />
              <button
                onClick={createChatRoom}
                style={{
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                생성하기
              </button>
            </div>
          )}
          
          {/* 채팅방 목록 */}
          <div style={{ 
            height: '300px', 
            overflowY: 'auto', 
            border: '1px solid #ccc', 
            borderRadius: '4px',
            backgroundColor: '#f5f5f5'
          }}>
            {isLoadingRooms ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>로딩 중...</div>
            ) : chatRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                채팅방이 없습니다.
              </div>
            ) : (
              chatRooms.map((room) => (
                <div 
                  key={room.roomId}
                  style={{ 
                    padding: '10px', 
                    borderBottom: '1px solid #ddd',
                    backgroundColor: room.roomId === roomId ? '#e6f7ff' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div 
                      style={{ flex: 1 }}
                      onClick={() => enterChatRoom(room.roomId)}
                    >
                      <div style={{ fontWeight: 'bold' }}>{room.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>{room.description}</div>
                      <div style={{ fontSize: '0.7rem', color: '#999' }}>
                        생성자: {room.createdBy} | 참여자: {room.participants?.length || 0}명
                      </div>
                    </div>
                    {userRole === 'ADMIN' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChatRoom(room.roomId);
                        }}
                        style={{
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.7rem'
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          
          <button
            onClick={fetchChatRooms}
            style={{
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              marginTop: '5px',
              width: '100%'
            }}
          >
            새로고침
          </button>
        </div>
        
        {/* 채팅 영역 */}
        <div style={{ width: '70%' }}>
          <h3>
            {chatRooms.find(room => room.roomId === roomId)?.name || roomId}
          </h3>
          <div
            style={{
              height: '400px',
              border: '1px solid #ccc',
              marginBottom: '20px',
              padding: '10px',
              overflowY: 'auto',
              textAlign: 'left',
              backgroundColor: '#fff'
            }}
          >
            {isLoadingMessages ? (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '180px' }}>
                메시지 로딩 중...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '180px' }}>
                메시지가 없습니다. 첫 메시지를 보내보세요!
              </div>
            ) : (
              messages.map((msg, index) => (
                <div 
                  key={index} 
                  style={{ 
                    marginBottom: '10px',
                    textAlign: 'left',
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: msg.sender === userInfo?.username ? '#e6f7ff' : '#f5f5f5',
                    alignSelf: 'flex-start',
                    maxWidth: '80%'
                  }}
                >
                  <strong>{msg.sender}: </strong>
                  {msg.message}
                  <small style={{ display: 'block', color: '#666', fontSize: '0.8em', marginTop: '4px' }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </small>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              style={{ width: '80%', padding: '8px', marginRight: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              disabled={!isConnected || !roomId}
            />
            <button
              onClick={sendMessage}
              disabled={!isConnected || !roomId}
              style={{ 
                padding: '8px 15px', 
                backgroundColor: (isConnected && roomId) ? '#007bff' : '#6c757d', 
                color: 'white', 
                border: 'none',
                borderRadius: '4px',
                cursor: (isConnected && roomId) ? 'pointer' : 'not-allowed'
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat; 