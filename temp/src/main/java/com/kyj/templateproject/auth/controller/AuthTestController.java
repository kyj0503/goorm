package com.kyj.templateproject.auth.controller;

import com.kyj.templateproject.auth.dto.LoginRequest;
import com.kyj.templateproject.auth.dto.SignupRequest;
import com.kyj.templateproject.auth.dto.TokenResponse;
import com.kyj.templateproject.auth.repository.RefreshTokenRepository;
import com.kyj.templateproject.auth.repository.UserRepository;
import com.kyj.templateproject.auth.service.AuthService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 인증 흐름 테스트를 위한 컨트롤러 (개발 환경에서만 활성화)
 */
@RestController
@RequestMapping("/api/test")
@RequiredArgsConstructor
@Profile("dev") // 개발 환경에서만 활성화
public class AuthTestController {

    private final AuthService authService;
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;

    /**
     * 자체 로그인 테스트 - 회원가입 > 로그인 > 토큰 발급 프로세스
     */
    @PostMapping("/auth/flow/local")
    public ResponseEntity<AuthFlowResponse> testLocalAuthFlow(@RequestBody TestUserRequest request) {
        // 1. 회원가입
        SignupRequest signupRequest = new SignupRequest();
        signupRequest.setEmail(request.getEmail());
        signupRequest.setPassword(request.getPassword());
        signupRequest.setUsername(request.getUsername());
        
        try {
            authService.signup(signupRequest);
        } catch (Exception e) {
            // 이미 가입된 사용자인 경우 무시
        }
        
        // 2. 로그인
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail(request.getEmail());
        loginRequest.setPassword(request.getPassword());
        
        TokenResponse tokenResponse = authService.login(loginRequest);
        
        // 3. 리프레시 토큰 조회 확인
        boolean hasRefreshToken = userRepository.findByEmail(request.getEmail())
                .map(user -> refreshTokenRepository.findByUserId(user.getId()).isPresent())
                .orElse(false);
        
        return ResponseEntity.ok(new AuthFlowResponse(
                tokenResponse.getAccessToken(),
                tokenResponse.getRefreshToken(),
                hasRefreshToken
        ));
    }
    
    /**
     * 리프레시 토큰으로 액세스 토큰 갱신 테스트
     */
    @PostMapping("/auth/flow/refresh")
    public ResponseEntity<AuthFlowResponse> testRefreshTokenFlow(@RequestParam String refreshToken) {
        TokenResponse tokenResponse = authService.refreshToken(refreshToken);
        
        return ResponseEntity.ok(new AuthFlowResponse(
                tokenResponse.getAccessToken(),
                tokenResponse.getRefreshToken(),
                true
        ));
    }
    
    @Data
    static class TestUserRequest {
        private String email;
        private String password;
        private String username;
    }
    
    @Data
    static class AuthFlowResponse {
        private final String accessToken;
        private final String refreshToken;
        private final boolean refreshTokenSaved;
    }
} 