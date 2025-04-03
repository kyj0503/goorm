package com.example.demo.service;

import com.example.demo.entity.User;
import com.example.demo.dto.UserDTO;
import com.example.demo.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;

    // 생성자 주입 (Lombok의 @RequiredArgsConstructor 없이 직접 작성)
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // 회원 생성
    public UserDTO createUser(String name, String email) {
        User user = new User();
        user.setName(name);
        user.setEmail(email);

        User savedUser = userRepository.save(user);
        return new UserDTO(savedUser.getId(), savedUser.getName(), savedUser.getEmail());
    }

    // 회원 전체 조회
    public List<UserDTO> getAllUsers() {
        List<User> users = userRepository.findAll();
        return users.stream()
                .map(u -> new UserDTO(u.getId(), u.getName(), u.getEmail()))
                .toList();
    }

    // 단일 회원 조회
    public UserDTO getUserById(Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다. ID: " + id));
        return new UserDTO(user.getId(), user.getName(), user.getEmail());
    }

    // 회원 정보 수정
    public UserDTO updateUser(Long id, String name, String email) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다. ID: " + id));
        user.setName(name);
        user.setEmail(email);

        User updatedUser = userRepository.save(user);
        return new UserDTO(updatedUser.getId(), updatedUser.getName(), updatedUser.getEmail());
    }

    // 회원 삭제
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }
}
