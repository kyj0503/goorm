package com.kyj.templateproject.auth.service;

import com.kyj.templateproject.auth.dto.LoginRequest;
import com.kyj.templateproject.auth.dto.SignupRequest;
import com.kyj.templateproject.auth.dto.TokenResponse;
import com.kyj.templateproject.auth.dto.UserDto;

public interface AuthService {
    
    TokenResponse login(LoginRequest loginRequest);
    
    void signup(SignupRequest signupRequest);
    
    TokenResponse refreshToken(String refreshToken);
    
    void logout(String refreshToken);

    UserDto.UserInfoResponse getUserInfo(Long userId);
    
    void changePassword(Long userId, UserDto.PasswordChangeRequest request);
    
    UserDto.UserInfoResponse updateProfile(Long userId, UserDto.ProfileUpdateRequest request);
}