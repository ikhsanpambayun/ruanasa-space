import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';

import { useAuthStore } from '@/stores/authStore';
import type { ApiErrorResponse } from '@/types/api';

import { API_BASE_URL, LOGIN_ROUTE } from './constants';

/**
 * Menyalin pesan error API (Bahasa Indonesia) ke toast, dengan fallback bila tidak tersedia.
 *
 * @param error - Error Axios dari response interceptor.
 * @param fallback - Pesan default.
 */
function showErrorToast(error: AxiosError<ApiErrorResponse>, fallback: string): void {
  toast.error(error.response?.data?.message ?? fallback);
}

/**
 * Menangani response error global sesuai TAD v1.6 Section 5.4.
 * 422 tidak ditampilkan di sini: error per-field di `response.data.errors` diproses oleh form.
 *
 * @param error - Error Axios dari response interceptor.
 * @returns Promise yang selalu reject dengan error asli agar caller tetap dapat menanganinya.
 */
function handleResponseError(error: AxiosError<ApiErrorResponse>): Promise<never> {
  if (typeof window === 'undefined') {
    return Promise.reject(error);
  }

  const status = error.response?.status;

  if (!error.response) {
    toast.error('Koneksi internet terputus');
  } else if (status === 401) {
    useAuthStore.getState().clearAuth();
    if (window.location.pathname !== LOGIN_ROUTE) {
      window.location.assign(LOGIN_ROUTE);
    }
  } else if (status === 403) {
    showErrorToast(error, 'Anda tidak memiliki akses ke halaman ini');
    window.location.assign('/');
  } else if (status === 429) {
    showErrorToast(error, 'Terlalu banyak permintaan. Coba lagi beberapa saat.');
  } else if (status !== undefined && status >= 500) {
    showErrorToast(error, 'Terjadi kesalahan pada server. Silakan coba lagi.');
  }

  return Promise.reject(error);
}

/**
 * Instance Axios untuk REST API. Cookie httpOnly dikirim otomatis (`withCredentials`);
 * header Bearer hanya dipasang sebagai fallback bila token tersedia di authStore.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use((response) => response, handleResponseError);
