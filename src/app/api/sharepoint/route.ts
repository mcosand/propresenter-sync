"use server";

import { authConfig } from "@/config/auth.config";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const token = await getToken({req: request, secret: authConfig.secret });
  console.log('server api', token);
  return NextResponse.json({okay: true});
}