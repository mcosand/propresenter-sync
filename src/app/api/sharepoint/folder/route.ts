"use server";

import { getAccessToken } from "@/lib/api";
import { ApiSharepointFile } from "@/models/api";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { NextResponse } from "next/server";

let driveId: string | undefined;

async function getDriveId(accessToken: string) {
  if (!driveId) {
    const client = getGraphClient(accessToken);
    const siteId = await getSiteId(accessToken, process.env.SHAREPOINT_SITE_URL!);

    const result = await client
      .api(`/sites/${siteId}/drives`)
      // .select('name,folder,file,size,lastModifiedDateTime')
      .get();
    driveId = result.value[0].id;
  }
  return driveId;
}

export async function GET(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'Must authenticate' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);

    const path = searchParams.get("path") as string || '';
    const client = getGraphClient(accessToken);
    const apiPath = path
      ? `/drives/${await getDriveId(accessToken)}/root:/${path}:/children`
      : `/drives/${await getDriveId(accessToken)}/root/children`;


    const result = await client
      .api(apiPath)
      .select('name,folder,file,size,lastModifiedDateTime')
      .get();
    const children = result.value.map((item: any) => ({
      name: item.name,
      kind: item.folder ? 'folder' : 'file',
      size: item.size,
      modified: new Date(item.lastModifiedDateTime).getTime(),
      path: path ? `${path}/${item.name}` : item.name,
    })) satisfies ApiSharepointFile[];

    return NextResponse.json<{ children: ApiSharepointFile[] }>({ children });
  } catch (error: any) {
    console.error('Folder GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}