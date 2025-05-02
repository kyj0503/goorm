package com.kyj.templateproject.auth.oauth2.service;

import com.kyj.templateproject.auth.oauth2.user.OAuth2UserInfo;
import com.kyj.templateproject.auth.oauth2.user.OAuth2UserInfoFactory;
import com.kyj.templateproject.auth.security.CustomUserDetails;
import com.kyj.templateproject.user.entity.User;
import com.kyj.templateproject.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final UserRepository userRepository;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User oAuth2User = super.loadUser(userRequest);

        try {
            return processOAuth2User(userRequest, oAuth2User);
        } catch (AuthenticationException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new InternalAuthenticationServiceException(ex.getMessage(), ex.getCause());
        }
    }

    private OAuth2User processOAuth2User(OAuth2UserRequest oAuth2UserRequest, OAuth2User oAuth2User) {
        // OAuth2 제공자(provider) 추출 (github, google, kakao 등)
        String registrationId = oAuth2UserRequest.getClientRegistration().getRegistrationId();
        
        // OAuth2UserInfo 객체 생성
        OAuth2UserInfo oAuth2UserInfo = OAuth2UserInfoFactory.getOAuth2UserInfo(
                registrationId, oAuth2User.getAttributes());
        
        if (!StringUtils.hasText(oAuth2UserInfo.getEmail())) {
            throw new OAuth2AuthenticationException("이메일을 찾을 수 없습니다.");
        }

        // 이메일로 기존 사용자가 있는지 확인
        Optional<User> userOptional = userRepository.findByEmail(oAuth2UserInfo.getEmail());
        User user;

        if (userOptional.isPresent()) {
            user = userOptional.get();
            
            // 사용자가 다른 OAuth 제공자로 로그인하려고 하는 경우
            if (!user.getProvider().name().equalsIgnoreCase(registrationId)) {
                throw new OAuth2AuthenticationException(
                        "이미 " + user.getProvider() + " 계정으로 가입된 이메일입니다. " +
                                "해당 계정으로 로그인하세요.");
            }
            
            // 기존 사용자 정보 업데이트
            user = updateExistingUser(user, oAuth2UserInfo);
        } else {
            // 새 사용자 생성
            user = registerNewUser(oAuth2UserRequest, oAuth2UserInfo);
        }

        // CustomUserDetails가 OAuth2User를 구현하고 있으므로 그대로 반환 가능
        return CustomUserDetails.create(user, oAuth2User.getAttributes());
    }

    private User registerNewUser(OAuth2UserRequest oAuth2UserRequest, OAuth2UserInfo oAuth2UserInfo) {
        User.AuthProvider provider = User.AuthProvider.valueOf(
                oAuth2UserRequest.getClientRegistration().getRegistrationId().toUpperCase());
        
        User user = User.builder()
                .email(oAuth2UserInfo.getEmail())
                .username(oAuth2UserInfo.getName())
                .profileImage(oAuth2UserInfo.getImageUrl())
                .provider(provider)
                .providerId(oAuth2UserInfo.getId())
                .role(User.UserRole.USER)
                .active(true)
                .emailVerified(true)
                .build();

        return userRepository.save(user);
    }

    private User updateExistingUser(User existingUser, OAuth2UserInfo oAuth2UserInfo) {
        // 필요한 정보만 업데이트
        existingUser.setUsername(oAuth2UserInfo.getName());
        if (StringUtils.hasText(oAuth2UserInfo.getImageUrl())) {
            existingUser.setProfileImage(oAuth2UserInfo.getImageUrl());
        }
        
        return userRepository.save(existingUser);
    }
} 