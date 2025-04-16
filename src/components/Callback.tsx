import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Callback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (!code || !state) {
        console.error('Missing code or state');
        setError('GitHub 인증 정보가 없습니다.');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        console.log('GitHub 인증 코드로 로그인 시도:', code.substring(0, 5) + '...');
        const API_URL = import.meta.env.VITE_API_URL;
        const response = await fetch(`${API_URL}/api/users/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('Login failed:', errorData);
          throw new Error(`로그인에 실패했습니다: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.accessToken) {
          throw new Error('서버에서 액세스 토큰을 받지 못했습니다.');
        }
        
        console.log('토큰 및 사용자 정보 저장 성공');
        
        // 토큰과 사용자 정보 저장
        localStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        
        // 사용자 정보가 없는 경우 기본 정보 생성
        const userInfo = data.userInfo || {
          username: 'GitHub User',
          email: 'user@github.com'
        };
        localStorage.setItem('userInfo', JSON.stringify(userInfo));

        // JWT 토큰의 만료 시간 확인 및 출력 (디버깅용)
        try {
          const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
          console.log('토큰 만료 시간:', new Date(payload.exp * 1000).toLocaleString());
        } catch (e) {
          console.error('토큰 형식이 잘못되었습니다:', e);
        }

        navigate('/chat');
      } catch (error) {
        console.error('Error during login:', error);
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('로그인 중 오류가 발생했습니다.');
        }
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
      <p>잠시만 기다려주세요.</p>
    </div>
  );
};

export default Callback; 