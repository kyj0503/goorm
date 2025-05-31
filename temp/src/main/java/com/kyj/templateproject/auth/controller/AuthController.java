package com.kyj.templateproject.auth.controller;

import com.kyj.templateproject.auth.dto.LoginRequest;
import com.kyj.templateproject.auth.dto.SignupRequest;
import com.kyj.templateproject.auth.dto.TokenResponse;
import com.kyj.templateproject.auth.dto.UserDto;
import com.kyj.templateproject.auth.security.CustomUserDetails;
import com.kyj.templateproject.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // 로그인
    @PostMapping("/auth/login")
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest loginRequest) {
        TokenResponse tokenResponse = authService.login(loginRequest);
        return ResponseEntity.ok(tokenResponse);
    }

    // 회원가입
    @PostMapping("/auth/signup")
    public ResponseEntity<String> signup(@Valid @RequestBody SignupRequest signupRequest) {
        authService.signup(signupRequest);
        return ResponseEntity.ok("회원가입이 완료되었습니다.");
    }

    // 토큰 갱신
    @PostMapping("/auth/refresh")
    public ResponseEntity<TokenResponse> refreshToken(@RequestParam String refreshToken) {
        TokenResponse tokenResponse = authService.refreshToken(refreshToken);
        return ResponseEntity.ok(tokenResponse);
    }

    // 로그아웃
    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(@RequestParam String refreshToken) {
        authService.logout(refreshToken);
        return ResponseEntity.ok().build();
    }
    
    // 내 정보 조회
    @GetMapping("/users/me")
    public ResponseEntity<UserDto.UserInfoResponse> getMyInfo(@AuthenticationPrincipal CustomUserDetails userDetails) {
        UserDto.UserInfoResponse userInfo = authService.getUserInfo(userDetails.getId());
        return ResponseEntity.ok(userInfo);
    }

    // 비밀번호 변경
    @PostMapping("/users/password")
    public ResponseEntity<String> changePassword(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestBody UserDto.PasswordChangeRequest request) {
        authService.changePassword(userDetails.getId(), request);
        return ResponseEntity.ok("비밀번호가 변경되었습니다.");
    }

    // 프로필 업데이트
    @PutMapping("/users/profile")
    public ResponseEntity<UserDto.UserInfoResponse> updateProfile(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestBody UserDto.ProfileUpdateRequest request) {
        UserDto.UserInfoResponse updatedInfo = authService.updateProfile(userDetails.getId(), request);
        return ResponseEntity.ok(updatedInfo);
    }
    
    // OAuth2 상태 확인
    @GetMapping("/oauth2/status")
    public ResponseEntity<String> oauth2Status() {
        return ResponseEntity.ok("OAuth2 서비스가 정상적으로 실행 중입니다.");
    }
} 