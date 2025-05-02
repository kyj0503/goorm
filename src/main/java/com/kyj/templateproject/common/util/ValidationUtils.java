package com.kyj.templateproject.common.util;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 입력값 검증을 위한 유틸리티 클래스
 */
public class ValidationUtils {
    
    private static final Pattern PASSWORD_PATTERN = 
            Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+])[A-Za-z\\d!@#$%^&*()_+]{8,}$");
    
    private static final Pattern USERNAME_PATTERN = 
            Pattern.compile("^[a-zA-Z0-9가-힣_-]{3,20}$");
    
    private static final Validator validator;
    
    static {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }
    
    private ValidationUtils() {
        // 유틸리티 클래스는 인스턴스화 방지
    }
    
    /**
     * 객체의 유효성 검증
     * @param object 검증할 객체
     * @param <T> 객체 타입
     * @return 유효성 검증 오류 메시지 목록
     */
    public static <T> Set<String> validate(T object) {
        Set<ConstraintViolation<T>> violations = validator.validate(object);
        return violations.stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.toSet());
    }
    
    /**
     * 비밀번호 강도 검증
     * - 최소 8자 이상
     * - 대문자, 소문자, 숫자, 특수문자 각각 1개 이상 포함
     */
    public static boolean isStrongPassword(String password) {
        return !StringUtils.isEmpty(password) && PASSWORD_PATTERN.matcher(password).matches();
    }
    
    /**
     * 이메일 형식 검증
     */
    public static boolean isValidEmail(String email) {
        return StringUtils.isValidEmail(email);
    }
    
    /**
     * 사용자명 형식 검증
     * - 3~20자
     * - 영문, 숫자, 한글, 언더스코어(_), 하이픈(-) 허용
     */
    public static boolean isValidUsername(String username) {
        return !StringUtils.isEmpty(username) && USERNAME_PATTERN.matcher(username).matches();
    }
    
    /**
     * 유효한 숫자 범위인지 검증
     */
    public static boolean isInRange(int value, int min, int max) {
        return value >= min && value <= max;
    }
    
    /**
     * 유효한 문자열 길이인지 검증
     */
    public static boolean isValidLength(String str, int minLength, int maxLength) {
        if (StringUtils.isEmpty(str)) {
            return minLength == 0;
        }
        int length = str.length();
        return length >= minLength && length <= maxLength;
    }
    
    /**
     * 두 문자열이 일치하는지 검증 (비밀번호 확인 등)
     */
    public static boolean isMatching(String str1, String str2) {
        if (str1 == null && str2 == null) {
            return true;
        }
        if (str1 == null || str2 == null) {
            return false;
        }
        return str1.equals(str2);
    }
    
    /**
     * 문자열에 특정 문자가 포함되어 있는지 검증
     */
    public static boolean containsChar(String str, char ch) {
        return !StringUtils.isEmpty(str) && str.indexOf(ch) >= 0;
    }
    
    /**
     * 문자열에 공백이 포함되어 있는지 검증
     */
    public static boolean containsWhitespace(String str) {
        return !StringUtils.isEmpty(str) && str.chars().anyMatch(Character::isWhitespace);
    }
} 