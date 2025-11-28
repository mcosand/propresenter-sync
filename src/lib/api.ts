import { getToken } from "next-auth/jwt";
import { authConfig } from "@/config/auth.config";

export async function getAccessToken(req: Request) {
  // In development, use the non-secure cookie name.
  // When running behind an SSL-terminating reverse proxy, look for the secure cookie name
  let cookieName = 'authjs.session-token';
  if (req.headers.get('x-forwarded-proto') === 'https') {
    cookieName = `__Secure-${cookieName}`;
  }
  const jwt = await getToken({req, cookieName, secret: authConfig.secret });
  return jwt?.accessToken;
}