package com.example.demo.repository;

import com.example.demo.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

// repository == DAO

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    // 기본적인 CRUD 메서드를 자동 제공
}
