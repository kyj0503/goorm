package com.kyj.templateproject.auth.util;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 문자열 처리를 위한 유틸리티 클래스
 */
public class StringUtils {
    
    // 정규 표현식 패턴
    private static final Pattern EMAIL_PATTERN = 
            Pattern.compile("^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$");
    private static final Pattern PHONE_PATTERN = 
            Pattern.compile("^\\d{3}-\\d{3,4}-\\d{4}$");
    
    private StringUtils() {
        // 유틸리티 클래스는 인스턴스화 방지
    }
    
    /**
     * 문자열이 null이거나 빈 문자열인지 확인
     */
    public static boolean isEmpty(String str) {
        return str == null || str.trim().isEmpty();
    }
    
    /**
     * 문자열이 null이 아니고 빈 문자열이 아닌지 확인
     */
    public static boolean isNotEmpty(String str) {
        return !isEmpty(str);
    }
    
    /**
     * 문자열이 유효한 이메일 형식인지 확인
     */
    public static boolean isValidEmail(String email) {
        if (isEmpty(email)) {
            return false;
        }
        return EMAIL_PATTERN.matcher(email).matches();
    }
    
    /**
     * 문자열이 유효한 전화번호 형식인지 확인
     */
    public static boolean isValidPhoneNumber(String phoneNumber) {
        if (isEmpty(phoneNumber)) {
            return false;
        }
        return PHONE_PATTERN.matcher(phoneNumber).matches();
    }
    
    /**
     * 첫 글자를 대문자로 변환
     */
    public static String capitalize(String str) {
        if (isEmpty(str)) {
            return str;
        }
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
    
    /**
     * 문자열을 주어진 최대 길이로 자르고 생략 부호(...) 추가
     */
    public static String truncate(String str, int maxLength) {
        if (isEmpty(str) || str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + "...";
    }
    
    /**
     * 주어진 문자열에서 검색 문자열을 바꾸기 문자열로 모두 치환
     */
    public static String replaceAll(String str, String search, String replacement) {
        if (isEmpty(str) || isEmpty(search)) {
            return str;
        }
        return str.replace(search, replacement);
    }
    
    /**
     * 랜덤 UUID 생성
     */
    public static String generateUuid() {
        return UUID.randomUUID().toString();
    }
    
    /**
     * 하이픈이 없는 랜덤 UUID 생성
     */
    public static String generateUuidWithoutHyphen() {
        return UUID.randomUUID().toString().replace("-", "");
    }
    
    /**
     * 문자열 배열을 구분자로 연결
     */
    public static String join(String[] array, String delimiter) {
        if (array == null || array.length == 0) {
            return "";
        }
        
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < array.length; i++) {
            sb.append(array[i]);
            if (i < array.length - 1) {
                sb.append(delimiter);
            }
        }
        return sb.toString();
    }
    
    /**
     * 문자열에서 HTML 태그 제거
     */
    public static String removeHtmlTags(String html) {
        if (isEmpty(html)) {
            return html;
        }
        return html.replaceAll("<[^>]*>", "");
    }
    
    /**
     * 문자열이 숫자인지 확인
     */
    public static boolean isNumeric(String str) {
        if (isEmpty(str)) {
            return false;
        }
        return str.matches("-?\\d+(\\.\\d+)?");
    }
}