package com.kyj.templateproject.auth.service;

import com.kyj.templateproject.auth.dto.LoginRequest;
import com.kyj.templateproject.auth.dto.SignupRequest;
import com.kyj.templateproject.auth.dto.TokenResponse;

public interface AuthService {
    
    /**
     * 사용자 로그인
     * @param loginRequest 로그인 요청 정보
     * @return 인증 토큰 정보
     */
    TokenResponse login(LoginRequest loginRequest);
    
    /**
     * 사용자 회원가입
     * @param signupRequest 회원가입 요청 정보
     * @return 인증 토큰 정보
     */
    TokenResponse signup(SignupRequest signupRequest);
    
    /**
     * 토큰 갱신
     * @param refreshToken 리프레시 토큰
     * @return 새로운 인증 토큰 정보
     */
    TokenResponse refreshToken(String refreshToken);
    
    /**
     * 로그아웃
     * @param refreshToken 리프레시 토큰
     */
    void logout(String refreshToken);
} 