package com.kyj.templateproject.auth.service;

import com.kyj.templateproject.auth.dto.LoginRequest;
import com.kyj.templateproject.auth.dto.SignupRequest;
import com.kyj.templateproject.auth.dto.TokenResponse;
import com.kyj.templateproject.auth.dto.UserDto;
import com.kyj.templateproject.auth.entity.RefreshToken;
import com.kyj.templateproject.auth.entity.User;
import com.kyj.templateproject.auth.repository.RefreshTokenRepository;
import com.kyj.templateproject.auth.repository.UserRepository;
import com.kyj.templateproject.auth.security.CustomUserDetails;
import com.kyj.templateproject.auth.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenRepository refreshTokenRepository;

    @Override
    public void signup(SignupRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("이미 가입된 이메일입니다.");
        }

        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("이미 사용 중인 사용자 이름입니다.");
        }

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .username(request.getUsername())
                .role(User.UserRole.USER)
                .provider(User.AuthProvider.LOCAL)
                .active(true)
                .emailVerified(false)
                .build();

        userRepository.save(user);
    }

    @Override
    public TokenResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        String accessToken = tokenProvider.generateToken(authentication);
        String refreshToken = tokenProvider.generateRefreshToken(userDetails.getId());

        saveRefreshToken(userDetails.getId(), refreshToken);

        return TokenResponse.builder()
                .tokenType("Bearer")
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(900000L)
                .build();
    }

    @Override
    public TokenResponse refreshToken(String refreshToken) {
        if (!tokenProvider.validateToken(refreshToken)) {
            throw new RuntimeException("유효하지 않은 리프레시 토큰입니다.");
        }

        Long userId = tokenProvider.getUserIdFromToken(refreshToken);
        RefreshToken storedToken = refreshTokenRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("로그아웃된 사용자입니다."));

        if (!storedToken.getToken().equals(refreshToken)) {
            throw new RuntimeException("토큰이 일치하지 않습니다.");
        }

        String newAccessToken = tokenProvider.generateTokenFromUserId(userId);
        String newRefreshToken = tokenProvider.generateRefreshToken(userId);

        storedToken.updateToken(newRefreshToken);
        refreshTokenRepository.save(storedToken);

        return TokenResponse.builder()
                .tokenType("Bearer")
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .expiresIn(900000L)
                .build();
    }

    @Override
    public void logout(String refreshToken) {
        if (!tokenProvider.validateToken(refreshToken)) {
            throw new RuntimeException("유효하지 않은 리프레시 토큰입니다.");
        }

        Long userId = tokenProvider.getUserIdFromToken(refreshToken);
        refreshTokenRepository.deleteByUserId(userId);
    }

    private void saveRefreshToken(Long userId, String refreshToken) {
        Optional<RefreshToken> tokenOpt = refreshTokenRepository.findByUserId(userId);
        
        if (tokenOpt.isPresent()) {
            RefreshToken token = tokenOpt.get();
            token.updateToken(refreshToken);
            refreshTokenRepository.save(token);
        } else {
            RefreshToken token = RefreshToken.builder()
                    .userId(userId)
                    .token(refreshToken)
                    .build();
            refreshTokenRepository.save(token);
        }
    }

    @Override
    public UserDto.UserInfoResponse getUserInfo(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다: " + userId));
        
        return UserDto.UserInfoResponse.fromEntity(user);
    }

    @Override
    public void changePassword(Long userId, UserDto.PasswordChangeRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new RuntimeException("현재 비밀번호가 올바르지 않습니다.");
        }
        
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    @Override
    public UserDto.UserInfoResponse updateProfile(Long userId, UserDto.ProfileUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        
        if (request.getUsername() != null && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new RuntimeException("이미 사용 중인 사용자 이름입니다.");
            }
            user.setUsername(request.getUsername());
        }
        
        if (request.getProfileImage() != null) {
            user.setProfileImage(request.getProfileImage());
        }
        
        User updatedUser = userRepository.save(user);
        return UserDto.UserInfoResponse.fromEntity(updatedUser);
    }
} 