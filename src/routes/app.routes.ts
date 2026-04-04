import { Router } from "express";
import {
  editPassword,
  login,
  register,
  user,
} from "../controllers/accounts.controller.js";
import { search, searchImages } from "../controllers/browser.controller.js";

const router = Router();

// account
router.post("/auth/login", login);
router.post("/auth/register", register);
router.get("/auth/user", user);
router.patch("/auth/edit-password", editPassword);

// browser
router.get("/browser/search", search);
router.get("/browser/images", searchImages);

export default router;
