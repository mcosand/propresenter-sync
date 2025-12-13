import { NextResponse } from "next/server";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { getAccessToken } from "@/lib/api";

export async function POST(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Must authenticate" }, { status: 401 });
  }

  try {
    const { path } = await req.json() as { path: string };
    if (!path) {
      return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }

    // Get the Graph client and Site ID
    const client = getGraphClient(accessToken);
    const siteId = await getSiteId(accessToken, process.env.SHAREPOINT_SITE_URL!);

    // Check if the file already exists
    const encodedPath = encodeURIComponent(path);
    const fileExistsResponse = await client
    
      .api(`/sites/${siteId}/drive/root:/${encodedPath}`)
      .get()
      .catch(() => null);

    if (fileExistsResponse) {
      // File already exists, no need to create it
      return NextResponse.json({ message: "File already exists." });
    }

    const pathParts = path.split('/');
    const filePart = pathParts.pop()!;

    console.log('creating', pathParts, filePart);
    // If file doesn't exist, initiate file creation by uploading a placeholder
    const response = await client
      .api(`/sites/${siteId}/drive/root:/${pathParts.join('/')}/${encodeURIComponent(filePart)}:/content`)
      .put(new ArrayBuffer(0));

    return NextResponse.json(response);
  } catch (error: any) {
    if (error.code === 'nameAlreadyExists') {
      return NextResponse.json({ message: "File already exists"});
    }
    console.log('here error', error.message, error);
    console.error("Error creating file:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
