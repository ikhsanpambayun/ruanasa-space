import type { AuthProvider, User, UserRole } from '@prisma/client';

/**
 * Representasi user pada response auth peserta (API Spec v1.6 Section 3).
 */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  profile_picture: string | null;
  role: UserRole;
  auth_provider: AuthProvider;
}

/**
 * Representasi user pada response login admin (API Spec v1.6 Section 3.10).
 */
export interface AdminUserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Hasil login/registrasi yang membawa token akses di body (selain cookie).
 */
export interface SessionResponse<TUser> {
  token: string;
  user: TUser;
}

/**
 * Hasil login/registrasi peserta; `is_new_user` menandai akun yang baru dibuat.
 */
export interface ParticipantSessionResponse extends SessionResponse<UserResponse> {
  is_new_user: boolean;
}

/**
 * Memetakan baris database ke response user peserta (snake_case).
 *
 * @param user - Baris tabel users.
 * @returns Objek user untuk response API.
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone_number: user.phoneNumber,
    profile_picture: user.profilePicture,
    role: user.role,
    auth_provider: user.authProvider,
  };
}

/**
 * Memetakan baris database ke response user admin.
 *
 * @param user - Baris tabel users.
 * @returns Objek user admin untuk response API.
 */
export function toAdminUserResponse(user: User): AdminUserResponse {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
