import { ROUTES } from "@/config/routes.config";
import { SessionProvider } from "next-auth/react";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main aria-label="Authenticated layout">
      <SessionProvider>
      {children}
      </SessionProvider>
    </main>
  );
}
