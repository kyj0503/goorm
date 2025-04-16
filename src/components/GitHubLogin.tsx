import { useState } from 'react';

interface GitHubLoginProps {
  onLogin: (token: string) => void;
}

const GitHubLogin = ({ onLogin }: GitHubLoginProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGitHubLogin = () => {
    setIsLoading(true);
    // GitHub OAuth 인증 URL로 리다이렉트
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = encodeURIComponent(import.meta.env.VITE_REDIRECT_URI);
    const scope = encodeURIComponent('read:user user:email');
    const state = Math.random().toString(36).substring(2);
    
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Simple Chat</h1>
      <p>GitHub 계정으로 로그인하여 채팅을 시작하세요.</p>
      <button
        onClick={handleGitHubLogin}
        disabled={isLoading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#24292e',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px',
        }}
      >
        {isLoading ? '로그인 중...' : 'GitHub로 로그인'}
      </button>
    </div>
  );
};

export default GitHubLogin; 