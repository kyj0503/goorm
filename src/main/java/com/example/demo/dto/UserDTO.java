package com.example.demo.dto;

public class UserDTO {

    private Long id;
    private String name;
    private String email;

    // 기본 생성자
    public UserDTO() {
    }

    // 필요한 경우, 매개변수 있는 생성자
    public UserDTO(Long id, String name, String email) {
        this.id   = id;
        this.name = name;
        this.email = email;
    }

    // Getter/Setter 직접 구현
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id= id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name= name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email= email;
    }
}
