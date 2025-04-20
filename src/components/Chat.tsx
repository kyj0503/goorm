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
      
      // 서버 상태를 확인하기 위한 요청 시도
      try {
        const response = await fetch(`${API_URL}/actuator/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (response.ok) {
          setServerStatus('online');
          return true;
        }
      } catch (error) {
        console.log('액추에이터 엔드포인트 접근 오류 (무시됨):', error);
      }
      
      // 액추에이터 접근 실패하더라도 연결 시도를 위해 항상 true 반환
      console.log('액추에이터 확인 우회, 웹소켓 연결 시도 계속...');
      setServerStatus('online');
      return true;
    } catch (error) {
      console.error('서버 상태 확인 중 오류:', error);
      // 오류가 발생해도 연결 시도를 위해 true 반환
      setServerStatus('online');
      return true;
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

  // 순환 참조를 피하기 위해 함수 선언을 먼저하고 의존성 문제를 해결
  
  // 이전 채팅 메시지 로드 함수의 레퍼런스 생성
  const fetchPreviousMessagesRef = useRef<(roomIdParam: string) => void>(null);
  
  // WebSocket 연결 해제 함수 - 최상단에 선언
  const disconnectWebSocket = useCallback(() => {
    // 구독 해제
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (e) {
        console.warn('구독 해제 중 오류 (무시됨):', e);
      }
      subscriptionRef.current = null;
    }
    
    // 클라이언트 연결 해제
    if (clientRef.current && clientRef.current.connected) {
      try {
        clientRef.current.deactivate();
      } catch (e) {
        console.warn('클라이언트 비활성화 중 오류 (무시됨):', e);
      }
    }
    
    clientRef.current = null;
    setIsConnected(false);
  }, []);

  // WebSocket 연결 함수와 재연결 함수를 상호참조 문제를 해결하기 위한 선언
  const connectWebSocketRef = useRef<() => Promise<void>>(null);
  const handleReconnectRef = useRef<() => void>(null);
  const setupSubscriptionRef = useRef<() => void>(null);

  // 이전 채팅 메시지 로드 함수
  const fetchPreviousMessages = useCallback((roomIdParam: string) => {
    // UUID 형식 검증 (룸 ID가 유효한 UUID가 아니면 그냥 빈 배열 반환)
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomIdParam);
    if (roomIdParam === 'test-room' || !isValidUUID) {
      console.log(`${roomIdParam}는 유효한 채팅방 ID가 아닙니다. 이전 메시지 로드를 건너뜁니다.`);
      return;
    }
    
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('이전 메시지 로드 실패: 인증 토큰이 없습니다.');
      return;
    }
    
    // 서버에서 이전 메시지 가져오기
    setIsLoadingMessages(true);
    
    fetch(`${API_URL}/api/chat/messages/${roomIdParam}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('서버에서 받은 이전 메시지:', data);
      
      // 메시지를 시간순으로 정렬
      const sortedMessages = [...data].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // 화면에 표시할 메시지 설정
      setMessages(sortedMessages);
    })
    .catch(error => {
      console.error('이전 메시지 로드 중 오류:', error);
      setConnectionError('이전 메시지를 로드하는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    })
    .finally(() => {
      setIsLoadingMessages(false);
    });
  }, [API_URL]);

  // fetchPreviousMessages 레퍼런스 업데이트
  fetchPreviousMessagesRef.current = fetchPreviousMessages;

  // WebSocket 연결 함수
  const connectWebSocket = useCallback(async () => {
    disconnectWebSocket(); // 기존 연결이 있다면 해제

    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('WebSocket 연결 실패: 인증 토큰이 없습니다.');
      return;
    }

    try {
      // 소켓 클라이언트 생성
      const socket = new SockJS(`${API_URL}/ws`);
      clientRef.current = new Client({
        webSocketFactory: () => socket,
        connectHeaders: {
          Authorization: `Bearer ${token}`
        },
        reconnectDelay: INITIAL_RECONNECT_DELAY,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        debug: function(str) {
          // console.log('STOMP Debug:', str);
          return; // 디버그 로그 비활성화
        },
        onConnect: () => {
          setIsConnected(true);
          console.log('WebSocket 연결 성공!');
          reconnectAttemptsRef.current = 0;
          
          // 연결 성공 후 현재 방에 구독 설정
          if (roomId && setupSubscriptionRef.current) {
            setupSubscriptionRef.current();
          }
        },
        onDisconnect: () => {
          setIsConnected(false);
          console.log('WebSocket 연결이 끊어졌습니다.');
        },
        onStompError: (frame) => {
          console.error('STOMP 에러:', frame);
          setConnectionError(`STOMP 에러: ${frame.headers?.message || '알 수 없는 오류'}`);
        }
      });
      
      // 연결 시작
      console.log('WebSocket 연결 시도 중...');
      clientRef.current.activate();
      
    } catch (error) {
      console.error('WebSocket 연결 중 오류 발생:', error);
      setIsConnected(false);
      clientRef.current = null;
      
      // 유효하지 않은 roomId인 경우 에러 메시지만 표시하고 더 이상 재연결 시도하지 않음
      if (roomId) {
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId);
        if (roomId === 'test-room' || !isValidUUID) {
          reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // 유효하지 않은 ID의 경우 재연결 시도하지 않음
          console.log(`${roomId}는 유효한 채팅방 ID가 아닙니다. 메시지를 비웁니다.`);
          setMessages([]);
        }
      }
    }
  }, [disconnectWebSocket, roomId, API_URL]);

  // 함수 레퍼런스 업데이트
  connectWebSocketRef.current = connectWebSocket;

  // WebSocket 재연결 함수
  const handleReconnect = useCallback(() => {
    // 이미 진행 중인 재연결 타이머가 있으면 취소
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
    setConnectionError('서버에 다시 연결 중...');
    
    // 기존 연결 정리
    disconnectWebSocket();
    
    // 잠시 지연 후 재연결 시도
    setTimeout(() => {
      if (connectWebSocketRef.current) {
        connectWebSocketRef.current();
      }
    }, 1000);
  }, [disconnectWebSocket]);

  // 함수 레퍼런스 업데이트
  handleReconnectRef.current = handleReconnect;

  // 구독 설정 함수 정의
  const setupSubscription = useCallback(() => {
    if (!clientRef.current || !clientRef.current.connected) {
      console.log('WebSocket 클라이언트가 연결되어 있지 않습니다. 재연결 시도...');
      if (handleReconnectRef.current) {
        handleReconnectRef.current();
      }
      return;
    }

    try {
      // 기존 구독이 있으면 해제
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
          console.log('기존 구독 해제 완료');
        } catch (e) {
          console.error('구독 해제 중 오류:', e);
        }
      }
      
      console.log(`새 채팅방 ${roomId}에 구독 설정 중...`);

      // UUID 형식 검증
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId);
      
      // test-room이거나 유효하지 않은 UUID인 경우에도 메시지를 초기화하고 진행
      if (roomId === 'test-room' || !isValidUUID) {
        console.log(`${roomId}는 유효한 채팅방 ID가 아닙니다. 메시지만 비우고 구독은 시도하지 않습니다.`);
        setMessages([]);
        return;
      }
      
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      
      const subscription = clientRef.current.subscribe(`${TOPIC_PREFIX}/chat/room/${roomId}`, (message) => {
        try {
          const newMessage: ChatMessage = JSON.parse(message.body);
          console.log(`채팅방 ${roomId}에서 메시지 수신:`, newMessage);
          
          // ENTER 타입 메시지에 대한 추가 필터링
          if (newMessage.type === MessageType.ENTER) {
            setMessages(prevMessages => {
              const recentEnterMessages = prevMessages.filter(m => 
                m.type === MessageType.ENTER && 
                m.sender === newMessage.sender &&
                new Date(m.timestamp).getTime() > Date.now() - 30000
              );
              
              if (recentEnterMessages.length > 0) {
                console.log('중복 입장 메시지 무시:', newMessage.sender);
                return prevMessages;
              }
              
              // 메시지 중복 체크 (타임스탬프 + 내용을 이용한 간단한 해시)
              const msgId = `${newMessage.timestamp}-${newMessage.sender}-${newMessage.message}`;
              if (!receivedMsgIds.current.has(msgId)) {
                receivedMsgIds.current.add(msgId);
                // 주기적으로 오래된 메시지 ID 정리
                cleanupReceivedMsgIds();
                return [...prevMessages, newMessage];
              } else {
                console.log('중복 메시지 무시:', msgId);
                return prevMessages;
              }
            });
          } else {
            // 일반 메시지 처리
            const msgId = `${newMessage.timestamp}-${newMessage.sender}-${newMessage.message}`;
            if (!receivedMsgIds.current.has(msgId)) {
              receivedMsgIds.current.add(msgId);
              setMessages(prev => [...prev, newMessage]);
              // 주기적으로 오래된 메시지 ID 정리
              cleanupReceivedMsgIds();
            } else {
              console.log('중복 메시지 무시:', msgId);
            }
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });
      
      subscriptionRef.current = subscription;
      console.log('새 채팅방 구독 완료:', roomId);
      
      // 이전 메시지 로드
      if (fetchPreviousMessagesRef.current) {
        fetchPreviousMessagesRef.current(roomId);
      }
      
      // 새 방 입장 메시지 전송
      if (clientRef.current.connected && userInfo) {
        // enterFlag를 사용하여 중복 ENTER 메시지 방지
        const enterFlag = sessionStorage.getItem(`enter-${roomId}`);
        if (!enterFlag) {
          sessionStorage.setItem(`enter-${roomId}`, 'true');
          
          try {
            clientRef.current.publish({
              destination: `${APP_PREFIX}/chat/enter/${roomId}`,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: MessageType.ENTER,
                roomId: roomId,
                sender: userInfo?.username || 'Unknown User',
                message: `${userInfo?.username || 'Unknown User'}님이 입장하셨습니다.`,
                timestamp: new Date().toISOString()
              })
            });
            console.log('입장 메시지 전송 완료');
          } catch (e) {
            console.error('입장 메시지 전송 오류:', e);
          }
        }
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
  }, [roomId, TOPIC_PREFIX, APP_PREFIX, userInfo]);

  // 함수 레퍼런스 업데이트
  setupSubscriptionRef.current = setupSubscription;

  // 룸 ID 변경 시 새로 구독 설정
  useEffect(() => {
    console.log(`roomId 변경 감지: ${roomId}`);
    
    // roomId가 비어있거나 연결이 되어있지 않은 경우 리턴
    if (!roomId || !isConnected || !clientRef.current || !userInfo) {
      return;
    }
    
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // 구독 설정 호출 (약간의 지연시간을 줌)
    setTimeout(() => {
      if (setupSubscriptionRef.current) {
        setupSubscriptionRef.current();
      }
    }, 300);
    
  }, [roomId, isConnected, userInfo]);

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
  const enterChatRoom = async (newRoomId: string) => {
    try {
      console.log(`enterChatRoom 함수 호출됨: ${newRoomId}`);
      
      if (newRoomId === roomId) {
        console.log('이미 선택된 채팅방입니다.');
        return;
      }
      
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('채팅방 입장 실패: 인증 토큰이 없습니다.');
        return;
      }
      
      // 먼저 메시지 상태와 중복 메시지 필터 초기화
      setMessages([]);
      receivedMsgIds.current.clear();
      
      try {
        // 기존 구독이 있으면 먼저 해제
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
            console.log('채팅방 변경: 기존 구독 해제 완료');
          } catch (e) {
            console.warn('구독 해제 중 오류 (무시됨):', e);
          }
        }
        
        const response = await fetch(`${API_URL}/api/chat/rooms/${newRoomId}/join`, {
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
        
        console.log(`새 채팅방 ${newRoomId}에 입장 성공`);
        
        // 모든 작업이 성공적으로 완료된 후에 roomId 변경
        setRoomId(newRoomId);
      } catch (error) {
        console.error('채팅방 입장 중 오류:', error);
        alert('채팅방 입장 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('enterChatRoom 처리 중 오류:', error);
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

  // Restore the sendMessage function
  const sendMessage = useCallback(() => {
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
  }, [message, isConnected, userInfo, navigate]);

  // Restore sendMessageWithToken function
  const sendMessageWithToken = useCallback((token: string) => {
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
  }, [message, userInfo, isConnected, roomId, APP_PREFIX, scrollToBottom]);

  // Restore handleLogout function
  const handleLogout = useCallback(() => {
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
  }, [navigate]);

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