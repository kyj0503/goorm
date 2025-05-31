import { useState, useEffect } from 'react';

interface GitHubLoginProps {
  // 미사용 프롭스 제거
  // onLogin: (token: string) => void;
}

const GitHubLogin = ({}: GitHubLoginProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [clientInfo, setClientInfo] = useState({ id: '', redirectUri: '' });

  useEffect(() => {
    // 환경 변수 확인 및 로깅
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_REDIRECT_URI;
    
    console.log('GitHub 클라이언트 설정 정보:', { 
      clientId: clientId ? `${clientId.substring(0, 5)}...` : '설정되지 않음',
      redirectUri: redirectUri || '설정되지 않음'
    });
    
    setClientInfo({
      id: clientId || '',
      redirectUri: redirectUri || ''
    });
  }, []);

  const handleGitHubLogin = () => {
    setIsLoading(true);
    
    // GitHub OAuth 인증 URL로 리다이렉트
    const clientId = clientInfo.id;
    const redirectUri = encodeURIComponent(clientInfo.redirectUri);
    
    if (!clientId || !redirectUri) {
      console.error('GitHub 로그인에 필요한 환경 변수가 설정되지 않았습니다.');
      alert('GitHub 로그인 설정이 잘못되었습니다. 관리자에게 문의하세요.');
      setIsLoading(false);
      return;
    }
    
    const scope = encodeURIComponent('read:user user:email');
    const state = Math.random().toString(36).substring(2);
    
    console.log('GitHub 로그인 시도:', {
      clientId: `${clientId.substring(0, 5)}...`,
      redirectUri,
      mode: import.meta.env.MODE
    });
    
    // URL을 구성하고 로그에 출력
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    console.log('GitHub 인증 URL:', githubAuthUrl);
    
    window.location.href = githubAuthUrl;
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Simple Chat</h1>
      <p>GitHub 계정으로 로그인하여 채팅을 시작하세요.</p>
      <button
        onClick={handleGitHubLogin}
        disabled={isLoading || !clientInfo.id}
        style={{
          padding: '10px 20px',
          backgroundColor: '#24292e',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: !clientInfo.id ? 'not-allowed' : 'pointer',
          fontSize: '16px',
        }}
      >
        {isLoading ? '로그인 중...' : 'GitHub로 로그인'}
      </button>
      {!clientInfo.id && (
        <p style={{ color: 'red', marginTop: '10px' }}>
          환경 변수 설정이 필요합니다. (.env 파일의 VITE_GITHUB_CLIENT_ID 확인)
        </p>
      )}
    </div>
  );
};

export default GitHubLogin; 