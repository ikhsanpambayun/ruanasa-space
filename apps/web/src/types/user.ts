/**
 * Role pengguna sesuai payload JWT (`role: "admin" | "participant"`).
 */
export type UserRole = 'admin' | 'participant';

/**
 * Data pengguna minimal yang disimpan di authStore. Detail profil lengkap diambil dari API.
 */
export interface AuthUser {
  id: string;
  role: UserRole;
}
