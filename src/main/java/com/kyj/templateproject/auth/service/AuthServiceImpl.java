package com.kyj.templateproject.auth.service;

import com.kyj.templateproject.auth.dto.LoginRequest;
import com.kyj.templateproject.auth.dto.SignupRequest;
import com.kyj.templateproject.auth.dto.TokenResponse;
import com.kyj.templateproject.auth.security.CustomUserDetails;
import com.kyj.templateproject.common.jwt.JwtTokenProvider;
import com.kyj.templateproject.user.entity.User;
import com.kyj.templateproject.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    
    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    
    @Override
    @Transactional
    public TokenResponse login(LoginRequest loginRequest) {
        // 인증 시도 및 토큰 발급
        return authenticateAndGenerateTokens(loginRequest.getEmail(), loginRequest.getPassword());
    }
    
    @Override
    @Transactional
    public TokenResponse signup(SignupRequest signupRequest) {
        // 이메일 중복 체크
        if (userRepository.existsByEmail(signupRequest.getEmail())) {
            throw new RuntimeException("이미 사용중인 이메일입니다.");
        }
        
        // 새 사용자 생성
        User user = User.builder()
                .email(signupRequest.getEmail())
                .password(passwordEncoder.encode(signupRequest.getPassword()))
                .username(signupRequest.getUsername())
                .role(User.UserRole.USER)
                .provider(User.AuthProvider.LOCAL)
                .active(true)
                .emailVerified(false)
                .build();
        
        userRepository.save(user);
        
        // 자동 로그인 처리 및 토큰 발급
        return authenticateAndGenerateTokens(signupRequest.getEmail(), signupRequest.getPassword());
    }
    
    @Override
    @Transactional
    public TokenResponse refreshToken(String refreshToken) {
        // 리프레시 토큰 검증
        validateRefreshToken(refreshToken);
        
        // 토큰에서 사용자 ID 추출
        Long userId = jwtTokenProvider.getUserIdFromToken(refreshToken);
        
        // 사용자 정보 조회
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        
        // 새로운 액세스 토큰 발급
        CustomUserDetails userDetails = CustomUserDetails.create(user);
        Authentication authentication = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());
        
        String newAccessToken = jwtTokenProvider.generateToken(authentication);
        
        return createTokenResponse(newAccessToken, refreshToken, userDetails);
    }
    
    @Override
    @Transactional
    public void logout(String refreshToken) {
        // 리프레시 토큰 검증
        validateRefreshToken(refreshToken);
        
        // 로그아웃 처리 (추가 구현 필요)
    }
    
    /**
     * 리프레시 토큰 검증
     */
    private void validateRefreshToken(String refreshToken) {
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new RuntimeException("유효하지 않은 리프레시 토큰입니다.");
        }
    }
    
    /**
     * 사용자 인증 및 토큰 발급
     */
    private TokenResponse authenticateAndGenerateTokens(String email, String password) {
        // 인증 시도
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, password)
        );
        
        // 인증 정보 저장
        SecurityContextHolder.getContext().setAuthentication(authentication);
        
        // 사용자 정보 가져오기
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        
        // 토큰 생성
        String accessToken = jwtTokenProvider.generateToken(authentication);
        String refreshToken = jwtTokenProvider.generateRefreshToken(userDetails.getId());
        
        return createTokenResponse(accessToken, refreshToken, userDetails);
    }
    
    /**
     * 토큰 응답 객체 생성
     */
    private TokenResponse createTokenResponse(String accessToken, String refreshToken, CustomUserDetails userDetails) {
        return TokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(3600L) // 1시간
                .userEmail(userDetails.getUsername())
                .username(userDetails.getUsername())
                .build();
    }
} 