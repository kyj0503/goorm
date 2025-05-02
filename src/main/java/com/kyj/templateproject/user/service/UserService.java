package com.kyj.templateproject.user.service;

import com.kyj.templateproject.auth.entity.RefreshToken;
import com.kyj.templateproject.common.jwt.JwtTokenProvider;
import com.kyj.templateproject.auth.repository.RefreshTokenRepository;
import com.kyj.templateproject.auth.security.CustomUserDetails;
import com.kyj.templateproject.user.dto.UserDto;
import com.kyj.templateproject.user.entity.User;
import com.kyj.templateproject.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 사용자 관련 비즈니스 로직을 담당하는 서비스 클래스.
 * 회원가입, 로그인, 사용자 정보 관리 등의 기능을 제공합니다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenRepository refreshTokenRepository;

    /**
     * 회원가입 기능을 수행합니다.
     */
    public void signup(UserDto.SignupRequest request) {
        // 이메일 중복 확인
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("이미 가입된 이메일입니다.");
        }

        // 사용자명 중복 확인
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("이미 사용 중인 사용자 이름입니다.");
        }

        // 비밀번호 암호화
        String encodedPassword = passwordEncoder.encode(request.getPassword());

        // 새 사용자 생성
        User user = User.builder()
                .email(request.getEmail())
                .password(encodedPassword)
                .username(request.getUsername())
                .role(User.UserRole.USER)
                .provider(User.AuthProvider.LOCAL)
                .active(true)
                .emailVerified(false) // 이메일 인증 필요
                .build();

        userRepository.save(user);
    }

    /**
     * 로그인 기능을 수행합니다.
     */
    public UserDto.AuthResponse login(UserDto.LoginRequest request) {
        // 인증 시도
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail(),
                        request.getPassword()
                )
        );

        // 인증 성공 시 SecurityContext에 저장
        SecurityContextHolder.getContext().setAuthentication(authentication);

        // 토큰 생성
        return generateTokenResponse(authentication);
    }

    /**
     * 리프레시 토큰을 이용해 새 액세스 토큰을 발급합니다.
     */
    public UserDto.AuthResponse refreshToken(String refreshTokenValue) {
        // 리프레시 토큰 검증
        if (!tokenProvider.validateToken(refreshTokenValue)) {
            throw new RuntimeException("유효하지 않은 리프레시 토큰입니다.");
        }

        // DB에서 리프레시 토큰 조회
        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenValue)
                .orElseThrow(() -> new RuntimeException("토큰 정보가 존재하지 않습니다."));

        // 토큰 만료 확인
        if (refreshToken.isExpired()) {
            refreshTokenRepository.delete(refreshToken);
            throw new RuntimeException("만료된 리프레시 토큰입니다.");
        }

        // 사용자 정보 조회
        User user = refreshToken.getUser();

        // 새 액세스 토큰 발급
        String accessToken = tokenProvider.generateTokenFromUserId(user.getId());

        // 응답 생성
        return UserDto.AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenValue)
                .tokenType("Bearer")
                .expiresIn(86400000L)
                .userInfo(UserDto.UserInfoResponse.fromEntity(user))
                .build();
    }

    /**
     * 사용자 정보를 조회합니다.
     */
    public UserDto.UserInfoResponse getUserInfo(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다: " + userId));
        
        return UserDto.UserInfoResponse.fromEntity(user);
    }

    /**
     * 비밀번호를 변경합니다.
     */
    public void changePassword(Long userId, UserDto.PasswordChangeRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        
        // 현재 비밀번호 확인
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new RuntimeException("현재 비밀번호가 올바르지 않습니다.");
        }
        
        // 새 비밀번호 설정
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    /**
     * 프로필 정보를 업데이트합니다.
     */
    public UserDto.UserInfoResponse updateProfile(Long userId, UserDto.ProfileUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        
        // 사용자 이름이 변경되었고, 중복 확인이 필요한 경우
        if (request.getUsername() != null && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new RuntimeException("이미 사용 중인 사용자 이름입니다.");
            }
            user.setUsername(request.getUsername());
        }
        
        // 프로필 이미지 변경
        if (request.getProfileImage() != null) {
            user.setProfileImage(request.getProfileImage());
        }
        
        User updatedUser = userRepository.save(user);
        return UserDto.UserInfoResponse.fromEntity(updatedUser);
    }

    /**
     * 토큰 응답 정보를 생성합니다.
     */
    private UserDto.AuthResponse generateTokenResponse(Authentication authentication) {
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        String accessToken = tokenProvider.generateToken(authentication);

        // 리프레시 토큰 생성 및 저장
        User user = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));

        // 기존 리프레시 토큰 삭제
        refreshTokenRepository.findByUser(user).ifPresent(refreshTokenRepository::delete);

        // 새 리프레시 토큰 생성 (7일)
        String refreshTokenValue = tokenProvider.generateRefreshToken(user.getId());
        LocalDateTime expiryDate = LocalDateTime.now().plus(7, ChronoUnit.DAYS);

        RefreshToken refreshToken = RefreshToken.builder()
                .token(refreshTokenValue)
                .user(user)
                .expiryDate(expiryDate)
                .build();

        refreshTokenRepository.save(refreshToken);

        // 응답 생성
        return UserDto.AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenValue)
                .tokenType("Bearer")
                .expiresIn(86400000L) // 토큰 만료 시간 (밀리초)
                .userInfo(UserDto.UserInfoResponse.fromEntity(user))
                .build();
    }
}
