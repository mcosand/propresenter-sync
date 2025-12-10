import { NextResponse } from "next/server";
import { getGraphClient, getSiteId } from "@/services/graph-helper";
import { getAccessToken } from "@/lib/api";

const CHUNK_SIZE = 60 * 1024 * 1024; // 60MB per chunk

export async function POST(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Must authenticate" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const path = formData.get("path") as string | null;

    if (!file || !path) {
      return NextResponse.json({ error: "Missing file or path" }, { status: 400 });
    }

    const client = getGraphClient(accessToken);
    const siteId = await getSiteId(accessToken, process.env.SHAREPOINT_SITE_URL!);

    // Encode the file path
    const encodedPath = encodeURIComponent(path);

    // Get the upload session URL
    let uploadSessionUrl = req.cookies.get("uploadSession")?.value;
    if (!uploadSessionUrl) {
      uploadSessionUrl = await createUploadSession(client, siteId, path);
      return NextResponse.json({ uploadSessionUrl });
    }

    // Upload the chunk (for large files)
    const chunkArrayBuffer = await file.arrayBuffer();
    const chunkBuffer = Buffer.from(chunkArrayBuffer);
    const contentRange = `bytes 0-${chunkBuffer.length - 1}/${file.size}`;

    const response = await fetch(uploadSessionUrl, {
      method: "PUT",
      headers: {
        "Content-Range": contentRange,
      },
      body: chunkBuffer,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload chunk`);
    }

    console.log(`File upload complete!`);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("SharePoint upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper function to create an upload session
async function createUploadSession(client: any, siteId: string, path: string) {
  const encodedPath = encodeURIComponent(path);

  const uploadSession = await client
    .api(`/sites/${siteId}/drive/root:/${encodedPath}:/createUploadSession`)
    .post({
      item: {
        "@microsoft.graph.conflictBehavior": "replace", // Replace file if exists
        name: path.split("/").pop(), // File name
      },
    });

  // Return the upload URL for subsequent chunk uploads
  return uploadSession.uploadUrl;
}
