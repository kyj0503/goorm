import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Callback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const handleCallback = async () => {
      // URL 파라미터 디버깅
      console.log('현재 URL:', window.location.href);
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      console.log('GitHub 콜백 파라미터:', { code: code?.substring(0, 5) + '...', state });

      if (!code || !state) {
        console.error('Missing code or state');
        setError('GitHub 인증 정보가 없습니다.');
        setLoading(false);
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        console.log('GitHub 인증 코드로 로그인 시도:', code.substring(0, 5) + '...');
        
        const API_URL = import.meta.env.VITE_API_URL;
        if (!API_URL) {
          console.error('API URL이 설정되지 않았습니다. 환경 변수를 확인하세요.');
          setError('API 설정이 올바르지 않습니다.');
          setLoading(false);
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        // CORS 프록시 사용 여부 확인 및 요청 URL 구성
        let requestUrl = `${API_URL}/api/users/login`;
        
        // GitHub Pages 환경에서 CORS 프록시 사용시 URL 조정
        if (import.meta.env.MODE === 'production' && API_URL.includes('corsproxy.io')) {
          console.log('CORS 프록시를 통해 요청합니다:', requestUrl);
        }

        console.log(`${requestUrl}으로 요청 전송 중...`);
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        console.log('서버 응답 상태:', response.status);
        const responseText = await response.text();
        
        try {
          // 응답이 JSON인지 확인
          const data = JSON.parse(responseText);
          
          if (!response.ok) {
            console.error('Login failed:', data);
            throw new Error(`로그인에 실패했습니다(${response.status}): ${data.message || '서버 오류'}`);
          }
          
          if (!data.accessToken) {
            throw new Error('서버에서 액세스 토큰을 받지 못했습니다.');
          }
          
          console.log('토큰 및 사용자 정보 저장 성공');
          
          // 토큰과 사용자 정보 저장
          localStorage.setItem('accessToken', data.accessToken);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }
          
          // 사용자 정보 저장
          const userInfo = data.userInfo || {
            username: 'GitHub User',
            email: 'user@github.com'
          };
          localStorage.setItem('userInfo', JSON.stringify(userInfo));

          // JWT 토큰의 만료 시간 확인 및 출력 (디버깅용)
          try {
            const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
            console.log('JWT 페이로드:', payload);
            console.log('토큰 만료 시간:', new Date(payload.exp * 1000).toLocaleString());
            // 권한 정보 확인
            if (payload.authorities) {
              console.log('사용자 권한:', payload.authorities);
            } else {
              console.warn('JWT 토큰에 권한 정보가 없습니다.');
            }
          } catch (e) {
            console.error('토큰 형식이 잘못되었습니다:', e);
          }

          setLoading(false);
          navigate('/chat');
        } catch (jsonError) {
          console.error('JSON 파싱 오류:', jsonError);
          console.error('원본 응답:', responseText);
          const errorMessage = jsonError instanceof Error ? jsonError.message : '알 수 없는 오류';
          throw new Error(`서버 응답 처리 오류: ${errorMessage}`);
        }
      } catch (error) {
        console.error('Error during login:', error);
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('로그인 중 오류가 발생했습니다.');
        }
        setLoading(false);
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <h2>로그인 오류</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <p>3초 후 로그인 페이지로 이동합니다...</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <h2>GitHub 로그인 처리 중...</h2>
      <p>{loading ? '잠시만 기다려주세요.' : '로그인 완료! 채팅 페이지로 이동합니다.'}</p>
      {loading && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ 
            width: '50px', 
            height: '50px', 
            border: '5px solid #f3f3f3',
            borderTop: '5px solid #3498db',
            borderRadius: '50%',
            margin: '0 auto',
            animation: 'spin 2s linear infinite',
          }}></div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default Callback; 