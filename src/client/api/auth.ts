import { http } from "./http";

export interface SessionUser {
  email: string;
  name: string;
}

export const requestOtp = (email: string) =>
  http.post<{ ok: true }>("/api/auth/request-otp", { email });

export const verifyOtp = (email: string, code: string) =>
  http.post<{ ok: true; name: string; email: string }>("/api/auth/verify-otp", { email, code });

export const logout = () => http.post<{ ok: true }>("/api/auth/logout", {});

export const getSession = () => http.get<{ session: SessionUser | null }>("/api/auth/me");
