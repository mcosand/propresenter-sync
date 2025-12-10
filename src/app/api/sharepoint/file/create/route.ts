import { NextResponse } from "next/server";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { getAccessToken } from "@/lib/api";

export async function POST(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Must authenticate" }, { status: 401 });
  }

  try {
    const { path } = await req.json();
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

    // If file doesn't exist, initiate file creation by uploading a placeholder
    const response = await client
      .api(`/sites/${siteId}/drive/items/root/children`)
      .post({
        name: path.split("/").pop(), // Extract filename from path
        file: {}, // Empty file object (for placeholders)
      });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error creating file:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
