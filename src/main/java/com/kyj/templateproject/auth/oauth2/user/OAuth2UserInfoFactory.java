package com.kyj.templateproject.auth.oauth2.user;

import com.kyj.templateproject.user.entity.User;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;

import java.util.Map;

public class OAuth2UserInfoFactory {

    public static OAuth2UserInfo getOAuth2UserInfo(String registrationId, Map<String, Object> attributes) {
        switch (registrationId.toLowerCase()) {
            case "github":
                return new GithubOAuth2UserInfo(attributes);
            case "google":
                return new GoogleOAuth2UserInfo(attributes);
            case "kakao":
                return new KakaoOAuth2UserInfo(attributes);
            default:
                throw new OAuth2AuthenticationException("지원하지 않는 로그인 제공자입니다: " + registrationId);
        }
    }
} 