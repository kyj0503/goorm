package com.kyj.templateproject.auth.oauth2.handler;

import com.kyj.templateproject.auth.entity.RefreshToken;
import com.kyj.templateproject.auth.repository.RefreshTokenRepository;
import com.kyj.templateproject.auth.security.JwtTokenProvider;
import com.kyj.templateproject.auth.security.CustomUserDetails;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenRepository refreshTokenRepository;

    @Value("${app.oauth2.redirectUri:http://localhost:3000/oauth2/redirect}")
    private String redirectUri;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException {
        String targetUrl = determineTargetUrl(authentication);
        if (response.isCommitted()) {
            log.debug("Response has already been committed. Unable to redirect to " + targetUrl);
            return;
        }
        getRedirectStrategy().sendRedirect(request, response, targetUrl);
    }

    protected String determineTargetUrl(Authentication authentication) {
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        Long userId = userDetails.getId();

        String token = tokenProvider.generateToken(authentication);
        String refreshToken = tokenProvider.generateRefreshToken(userId);

        // 리프레시 토큰 저장
        saveRefreshToken(userId, refreshToken);

        return UriComponentsBuilder.fromUriString(redirectUri)
                .queryParam("token", token)
                .queryParam("refreshToken", refreshToken)
                .build().toUriString();
    }
    
    // 리프레시 토큰 저장
    private void saveRefreshToken(Long userId, String refreshToken) {
        Optional<RefreshToken> tokenOpt = refreshTokenRepository.findByUserId(userId);
        
        if (tokenOpt.isPresent()) {
            // 기존 토큰 업데이트
            RefreshToken token = tokenOpt.get();
            token.updateToken(refreshToken);
            refreshTokenRepository.save(token);
        } else {
            // 새 토큰 저장
            RefreshToken token = RefreshToken.builder()
                    .userId(userId)
                    .token(refreshToken)
                    .expiryDate(LocalDateTime.now().plusDays(7)) // 7일 유효기간
                    .build();
            refreshTokenRepository.save(token);
        }
        log.info("소셜 로그인 사용자 리프레시 토큰 저장 완료: userId={}", userId);
    }
} 