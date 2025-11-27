"use server";

import { auth } from "@/auth";
import { SignOutForm } from "@/components/sign-out-form";

export default async function HomePage() {
  const session = await auth();
  const userName = session?.user?.name || "Unknown user";
  return (
    <>
      <h1>Hello, {userName}</h1>
      <SignOutForm />
    </>
  )
}
