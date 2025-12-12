import { NextResponse } from "next/server";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { getAccessToken } from "@/lib/api";

export const CHUNK_SIZE = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const accessToken = await getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Must authenticate" }, { status: 401 });
  }
  if (!request.body) {
    return NextResponse.json({ error: 'No data' }, { status: 400 });
  }

  const siteId = await getSiteId(accessToken, process.env.SHAREPOINT_SITE_URL!);
  const client = getGraphClient(accessToken);

  const filename = decodeURIComponent(request.headers.get('X-Filename') ?? '');
  const size = Number(request.headers.get('X-Filesize') ?? 0);
  const offset = Number(request.headers.get('X-Fileoffset') ?? 0);
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  let uploadUrl = decodeURIComponent(request.headers.get('X-Upload-Url') ?? '');

  if (!uploadUrl) {
    const uploadSession = await client
      .api(`/sites/${siteId}/drive/root:/${filename}:/createUploadSession`)
      .post({
        item: {
          '@microsoft.graph.conflictBehavior': 'replace',
        },
      });
    uploadUrl = uploadSession.uploadUrl;
  }

    // Upload chunk
  const chunkEnd = offset + contentLength - 1;
  // Note: We don't know total size in streaming scenario, use * for unknown
  const contentRange = `bytes ${offset}-${chunkEnd}/${size}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': contentLength.toString(),
      'Content-Range': contentRange,
    },
    body: await request.arrayBuffer(),
  });

  if (chunkEnd < size - 1) {
    return NextResponse.json({
      success: true,
      complete: false,
      uploadUrl,
      offset: chunkEnd + 1,
    });
  }
  return NextResponse.json({
    success: true,
    complete: true,
  });
}