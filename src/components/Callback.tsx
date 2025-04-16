import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Callback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (!code || !state) {
        console.error('Missing code or state');
        navigate('/');
        return;
      }

      try {
        const API_URL = import.meta.env.VITE_API_URL;
        const response = await fetch(`${API_URL}/api/users/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error('Login failed');
        }

        const data = await response.json();
        
        // 토큰과 사용자 정보 저장
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        // 사용자 정보가 없는 경우 기본 정보 생성
        const userInfo = data.userInfo || {
          username: 'GitHub User',
          email: 'user@github.com'
        };
        localStorage.setItem('userInfo', JSON.stringify(userInfo));

        navigate('/chat');
      } catch (error) {
        console.error('Error during login:', error);
        navigate('/');
      }
    };

    handleCallback();
  }, [navigate]);

  return <div>Processing login...</div>;
};

export default Callback; 