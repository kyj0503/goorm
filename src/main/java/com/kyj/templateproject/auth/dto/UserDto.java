package com.kyj.templateproject.auth.dto;

import com.kyj.templateproject.auth.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class UserDto {

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

    // 프로필 업데이트 요청 DTO
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor 
    public static class ProfileUpdateRequest {
        private String username;
        private String profileImage;
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
} 