package com.kyj.templateproject.user.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

// 사용자(User) 정보를 표현하는 엔티티 클래스
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 이메일 (로그인에 사용, 유니크)
    @Column(nullable = false, unique = true)
    private String email;

    // 비밀번호 (소셜 로그인의 경우 null 가능)
    private String password;

    // 사용자 이름/닉네임
    @Column(nullable = false)
    private String username;

    // 프로필 이미지 URL
    private String profileImage;

    // 사용자 역할 (ADMIN, USER)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    // 소셜 로그인 제공자 (GITHUB, GOOGLE, KAKAO, LOCAL)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuthProvider provider;

    // 소셜 로그인 제공자 ID
    private String providerId;

    // 계정 활성화 여부
    @Column(nullable = false)
    private boolean active;

    // 이메일 인증 여부
    @Column(nullable = false)
    private boolean emailVerified;

    // 생성 시간
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // 업데이트 시간
    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    // 사용자 역할 enum
    public enum UserRole {
        ADMIN, USER
    }

    // 인증 제공자 enum
    public enum AuthProvider {
        LOCAL, GITHUB, GOOGLE, KAKAO
    }
}
