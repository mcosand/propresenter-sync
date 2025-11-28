"use server";

import { getAccessToken } from "@/lib/api";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'Must authenticate' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path") as string ?? '';

    if (!path) {
      return NextResponse.json({ error: 'No path provided' }, { status: 400 });
    }

    const client = getGraphClient(accessToken);
    const siteId = await getSiteId(accessToken, process.env.SHAREPOINT_SITE_URL!);

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const stream = await client
      .api(`/sites/${siteId}/drive/root:/${encodedPath}:/content`)
      .getStream();

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