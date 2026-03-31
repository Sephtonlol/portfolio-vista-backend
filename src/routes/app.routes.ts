import { Router } from "express";
import {
  editPassword,
  editProfile,
  login,
  register,
  user,
} from "../controllers/accounts.controller.js";
import { search, searchImages } from "../controllers/browser.controller.js";

const router = Router();

// account
router.post("/login", login);
router.post("/register", register);
router.get("/user", user);
router.patch("/user", editProfile);
router.patch("/edit-password", editPassword);

// browser
router.get("/browser/search/:q", search);
router.get("/browser/images/:q", searchImages);

export default router;
