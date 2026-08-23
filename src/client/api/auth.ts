import { http } from "./http";

export interface SessionUser {
  email: string;
  name: string;
}

// Login itself happens inside the chat (request_login_code / verify_login_code
// tools); these just reflect and clear the resulting session for the header.
export const getSession = () => http.get<{ session: SessionUser | null }>("/api/auth/me");

export const logout = () => http.post<{ ok: true }>("/api/auth/logout", {});
