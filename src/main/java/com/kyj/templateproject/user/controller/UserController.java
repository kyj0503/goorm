package com.kyj.templateproject.user.controller;

import com.kyj.templateproject.auth.security.CustomUserDetails;
import com.kyj.templateproject.user.dto.UserDto;
import com.kyj.templateproject.user.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * UserController는 회원가입, 로그인, 사용자 정보 관리 기능을 제공하는 REST 컨트롤러입니다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // 회원가입
    @PostMapping("/api/users/register")
    public ResponseEntity<String> register(@RequestBody UserDto.SignupRequest request) {
        userService.signup(request);
        return ResponseEntity.ok("회원가입이 완료되었습니다. 이메일 인증을 진행해주세요.");
    }

    // 로그인
    @PostMapping("/api/users/login")
    public ResponseEntity<UserDto.AuthResponse> login(@RequestBody UserDto.LoginRequest request) {
        UserDto.AuthResponse response = userService.login(request);
        return ResponseEntity.ok(response);
    }

    // 토큰 갱신
    @PostMapping("/api/users/token/refresh")
    public ResponseEntity<UserDto.AuthResponse> refreshToken(@RequestBody UserDto.TokenRefreshRequest request) {
        UserDto.AuthResponse response = userService.refreshToken(request.getRefreshToken());
        return ResponseEntity.ok(response);
    }

    // 내 정보 조회
    @GetMapping("/api/users/me")
    public ResponseEntity<UserDto.UserInfoResponse> getMyInfo(@AuthenticationPrincipal CustomUserDetails userDetails) {
        UserDto.UserInfoResponse userInfo = userService.getUserInfo(userDetails.getId());
        return ResponseEntity.ok(userInfo);
    }

    // 비밀번호 변경
    @PostMapping("/api/users/password")
    public ResponseEntity<String> changePassword(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestBody UserDto.PasswordChangeRequest request) {
        userService.changePassword(userDetails.getId(), request);
        return ResponseEntity.ok("비밀번호가 변경되었습니다.");
    }

    // 프로필 업데이트
    @PutMapping("/api/users/profile")
    public ResponseEntity<UserDto.UserInfoResponse> updateProfile(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestBody UserDto.ProfileUpdateRequest request) {
        UserDto.UserInfoResponse updatedInfo = userService.updateProfile(userDetails.getId(), request);
        return ResponseEntity.ok(updatedInfo);
    }
    
    /**
     * OAuth2 로그인 프로세스의 성공/실패 처리는 OAuth2AuthenticationSuccessHandler에서 처리되므로,
     * 이 엔드포인트는 주로 상태 확인 등의 용도로 사용됩니다.
     */
    @GetMapping("/api/oauth2/status")
    public String oauth2Status() {
        return "OAuth2 서비스가 정상적으로 실행 중입니다.";
    }
}
