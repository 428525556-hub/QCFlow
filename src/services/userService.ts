import { getCurrentUser, getUserProfile, signOut, upsertUserProfile } from "@/src/api/userApi";

export const userService = {
  getCurrentUser,
  getUserProfile,
  upsertUserProfile,
  signOut
};

