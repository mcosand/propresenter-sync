"use server";

import { authConfig } from "@/config/auth.config";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const token = await getToken({ req, secret: authConfig.secret });
  if (!token) {
    return NextResponse.json({ error: 'Must authenticate' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path") as string ?? '';

    if (!path) {
      return NextResponse.json({ error: 'No path provided' }, { status: 400 });
    }

    const accessToken = token.accessToken;
    const client = getGraphClient(accessToken);
    const siteId = await getSiteId(accessToken, process.env.SHAREPOINT_SITE_URL!);

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const stream = await client
      .api(`/sites/${siteId}/drive/root:/${encodedPath}:/content`)
      .getStream();


  // const webStream = Readable.toWeb(stream);

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${path.split('/').pop()}"`,
    },
  });
  } catch (error: any) {
    console.error('File download error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}