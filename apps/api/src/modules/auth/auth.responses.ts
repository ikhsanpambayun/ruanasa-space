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
 * Response verifikasi OTP untuk user baru: profil belum lengkap, perlu temp_token ke endpoint `complete`.
 * Alur email membawa `email`; alur WhatsApp membawa `phone_number`.
 */
export interface PendingProfileResponse {
  temp_token: string;
  email?: string;
  phone_number?: string;
  is_new_user: true;
  requires_profile: true;
}

/**
 * Response login Google untuk user baru: perlu nomor telepon, dilengkapi lewat `POST /auth/google/complete`.
 */
export interface PendingPhoneResponse {
  temp_token: string;
  name: string;
  email: string;
  is_new_user: true;
  requires_phone: true;
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
