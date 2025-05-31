package com.example.demo.controller;

import com.example.demo.dto.UserDTO;
import com.example.demo.service.UserService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Controller
@RequestMapping("/users") // SSR용 경로 예: /users/**
public class MvcUserController {

    private final UserService userService;

    public MvcUserController(UserService userService) {
        this.userService = userService;
    }

    /**
     * 1. 전체 사용자 목록 페이지
     *    GET /users
     */
    @GetMapping
    public String listUsers(Model model) {
        // 모든 사용자 조회
        List<UserDTO> users = userService.getAllUsers();
        // 모델에 담아서 View로 전달
        model.addAttribute("users", users);
        // "user/list" 템플릿 렌더링
        return "user/list";
    }

    /**
     * 2. 사용자 등록 폼 페이지
     *    GET /users/new
     */
    @GetMapping("/new")
    public String showCreateForm(Model model) {
        // 폼에서 사용할 빈 DTO 객체
        model.addAttribute("userForm", new UserDTO());
        return "user/form";
    }

    /**
     * 3. 사용자 등록 처리
     *    POST /users
     */
    @PostMapping
    public String createUser(UserDTO userForm) {
        // 폼에서 전달된 데이터(UserDTO)를 이용해 사용자 생성
        userService.createUser(userForm.getName(), userForm.getEmail());
        // 등록 후 목록 페이지로 리다이렉트
        return "redirect:/users";
    }

    /**
     * 4. 사용자 수정 폼 페이지
     *    GET /users/{id}/edit
     */
    @GetMapping("/{id}/edit")
    public String showEditForm(@PathVariable Long id, Model model) {
        UserDTO userDTO = userService.getUserById(id);
        // 수정 폼에 기존 사용자 정보 채워넣기
        model.addAttribute("userForm", userDTO);
        return "user/form";
    }

    /**
     * 5. 사용자 수정 처리
     *    POST /users/{id}
     *    (PUT 대신에 웹 폼에서는 보통 POST를 사용)
     */
    @PostMapping("/{id}")
    public String updateUser(@PathVariable Long id, UserDTO userForm) {
        userService.updateUser(id, userForm.getName(), userForm.getEmail());
        return "redirect:/users";
    }

    /**
     * 6. 사용자 삭제
     *    GET /users/{id}/delete
     *    (실제로는 DELETE 메서드를 쓰지만, 웹 폼/링크 한계상 GET or POST로 대체하는 경우 많음)
     */
    @GetMapping("/{id}/delete")
    public String deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return "redirect:/users";
    }
}
