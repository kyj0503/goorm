package com.kyj.templateproject.user.dto;

import com.kyj.templateproject.user.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class UserDto {

    // 회원가입 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SignupRequest {
        private String email;
        private String password;
        private String username;
    }

    // 로그인 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LoginRequest {
        private String email;
        private String password;
    }

    // 소셜 로그인 정보 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SocialLoginRequest {
        private String code;
        private String redirectUri;
    }

    // 인증 응답 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AuthResponse {
        private String accessToken;
        private String refreshToken;
        private String tokenType;
        private Long expiresIn;
        private UserInfoResponse userInfo;
    }

    // 토큰 갱신 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TokenRefreshRequest {
        private String refreshToken;
    }

    // 사용자 정보 응답 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserInfoResponse {
        private Long id;
        private String email;
        private String username;
        private String profileImage;
        private User.UserRole role;
        private User.AuthProvider provider;
        private boolean emailVerified;

        public static UserInfoResponse fromEntity(User user) {
            return UserInfoResponse.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .username(user.getUsername())
                    .profileImage(user.getProfileImage())
                    .role(user.getRole())
                    .provider(user.getProvider())
                    .emailVerified(user.isEmailVerified())
                    .build();
        }
    }

    // 비밀번호 변경 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PasswordChangeRequest {
        private String currentPassword;
        private String newPassword;
    }

    // 이메일 인증 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EmailVerificationRequest {
        private String token;
    }

    // 프로필 업데이트 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor 
    public static class ProfileUpdateRequest {
        private String username;
        private String profileImage;
    }
} 