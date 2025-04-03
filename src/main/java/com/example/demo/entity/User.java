package com.example.demo.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "users") // h2 데이터베이스에서는 user를 예약어로 사용해서 user 그대로 사용하면 오류 발생.
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;         // PK(기본키)

    private String name;
    private String email;

    // 기본 생성자
    public User() {
    }

    // 필요하다면 사용자 정의 생성자(매개변수 있는 생성자) 추가 가능
    public User(String name, String email) {
        this.name = name;
        this.email = email;
    }

    // Getter/Setter 직접 구현

    public Long getId() {
        return id;
    }

    // ID는 자동 증가(PK)이므로 setter를 굳이 공개하지 않아도 되지만(설계 선택사항),
    // 예시로 작성
    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }
}
