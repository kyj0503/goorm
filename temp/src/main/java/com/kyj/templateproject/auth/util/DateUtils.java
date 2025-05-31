package com.kyj.templateproject.auth.util;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.Date;

/**
 * 날짜 및 시간 처리를 위한 유틸리티 클래스
 */
public class DateUtils {
    
    private static final ZoneId DEFAULT_ZONE_ID = ZoneId.systemDefault();
    
    // 기본 날짜 포맷
    public static final DateTimeFormatter DEFAULT_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    public static final DateTimeFormatter DEFAULT_TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");
    public static final DateTimeFormatter DEFAULT_DATETIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    
    private DateUtils() {
        // 유틸리티 클래스는 인스턴스화 방지
    }
    
    /**
     * 현재 날짜 반환 (LocalDate)
     */
    public static LocalDate getCurrentDate() {
        return LocalDate.now();
    }
    
    /**
     * 현재 시간 반환 (LocalTime)
     */
    public static LocalTime getCurrentTime() {
        return LocalTime.now();
    }
    
    /**
     * 현재 날짜와 시간 반환 (LocalDateTime)
     */
    public static LocalDateTime getCurrentDateTime() {
        return LocalDateTime.now();
    }
    
    /**
     * Date 객체를 LocalDateTime으로 변환
     */
    public static LocalDateTime convertToLocalDateTime(Date date) {
        return date.toInstant().atZone(DEFAULT_ZONE_ID).toLocalDateTime();
    }
    
    /**
     * LocalDateTime 객체를 Date로 변환
     */
    public static Date convertToDate(LocalDateTime localDateTime) {
        return Date.from(localDateTime.atZone(DEFAULT_ZONE_ID).toInstant());
    }
    
    /**
     * 문자열을 LocalDate로 변환
     */
    public static LocalDate parseLocalDate(String dateStr) {
        return LocalDate.parse(dateStr, DEFAULT_DATE_FORMATTER);
    }
    
    /**
     * 문자열을 LocalDateTime으로 변환
     */
    public static LocalDateTime parseLocalDateTime(String dateTimeStr) {
        return LocalDateTime.parse(dateTimeStr, DEFAULT_DATETIME_FORMATTER);
    }
    
    /**
     * LocalDate를 문자열로 변환
     */
    public static String formatLocalDate(LocalDate localDate) {
        return localDate.format(DEFAULT_DATE_FORMATTER);
    }
    
    /**
     * LocalDateTime을 문자열로 변환
     */
    public static String formatLocalDateTime(LocalDateTime localDateTime) {
        return localDateTime.format(DEFAULT_DATETIME_FORMATTER);
    }
    
    /**
     * 두 날짜 사이의 일수 계산
     */
    public static long daysBetween(LocalDate startDate, LocalDate endDate) {
        return Duration.between(startDate.atStartOfDay(), endDate.atStartOfDay()).toDays();
    }
    
    /**
     * 주어진 날짜에 일수 더하기
     */
    public static LocalDate plusDays(LocalDate date, long days) {
        return date.plusDays(days);
    }
    
    /**
     * 주어진 날짜와 시간에 시간 더하기
     */
    public static LocalDateTime plusHours(LocalDateTime dateTime, long hours) {
        return dateTime.plusHours(hours);
    }
    
    /**
     * 주어진 타임스탬프(밀리초)를 LocalDateTime으로 변환
     */
    public static LocalDateTime fromTimestamp(long timestamp) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timestamp), DEFAULT_ZONE_ID);
    }
    
    /**
     * 주어진 LocalDateTime을 타임스탬프(밀리초)로 변환
     */
    public static long toTimestamp(LocalDateTime localDateTime) {
        return localDateTime.atZone(DEFAULT_ZONE_ID).toInstant().toEpochMilli();
    }
} 