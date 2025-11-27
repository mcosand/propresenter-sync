import MicrosoftEntraID from "@auth/core/providers/microsoft-entra-id";
import { getUserDetails } from "@/services/msGraph";
import { ROUTES } from "@/config/routes.config";
import type { NextAuthConfig } from "next-auth";
import { JWT } from "next-auth/jwt";

async function refreshAccessToken(token: JWT) {
  try {
    const url = `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      scope: "https://graph.microsoft.com/.default"
    });

    const res = await fetch(url, {
      method: "POST",
      body: params
    });

    const data = await res.json();

    if (!res.ok) throw data;

    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken // fallback
    };
  } catch (error) {
    console.error("Refresh token failed", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authConfig = {
  // https://next-auth.js.org/configuration/options#providers
  providers: [
    // https://authjs.dev/getting-started/providers/microsoft-entra-id
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: `${ROUTES.EXTERNAL.MICROSOFT_LOGIN}/${process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER}/v2.0`,
      authorization: {
        // https://learn.microsoft.com/en-us/graph/permissions-overview
        params: {
          scope: "openid profile email User.Read offline_access",
        },
      },
    }),
  ],
  // https://next-auth.js.org/configuration/options#secret
  secret: process.env.AUTH_SECRET,
  // https://next-auth.js.org/configuration/options#session
  session: {
    strategy: "jwt",
    maxAge: 3600,
    updateAge: 900,
  },
  // https://next-auth.js.org/configuration/options#pages
  pages: {
    signIn: ROUTES.INTERNAL.SIGN_IN,
    signOut: ROUTES.INTERNAL.SIGN_IN,
    error: ROUTES.INTERNAL.SIGN_IN,
  },
  // https://next-auth.js.org/configuration/options#callbacks
  callbacks: {
    // https://next-auth.js.org/configuration/callbacks#jwt-callback
    async jwt({ token, account }) {

      if (account?.access_token) {
        try {
          token.userDetails = await getUserDetails(account.access_token);
        } catch (error) {
          console.error(
            "Failed to fetch user details from Microsoft Graph API",
            error
          );
        }
        return {
          ...token,
          accessToken: account.access_token!,
          accessTokenExpires: account.expires_at! * 1000,
          refreshToken: account.refresh_token!,
        };
      }
      
      if (Date.now() < (token.accessTokenExpires ?? 0)) {
        return token;
      }

      return await refreshAccessToken(token);
    },
    // https://next-auth.js.org/configuration/callbacks#session-callback
    async session({ session, token }) {
      if (token.userDetails) {
        session.user = { ...session.user, ...token.userDetails };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
