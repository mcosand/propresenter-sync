import { Client } from '@microsoft/microsoft-graph-client';

export function getGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

export async function getSiteId(accessToken: string, siteUrl: string) {
  const client = getGraphClient(accessToken);
  const urlParts = new URL(siteUrl);
  const hostname = urlParts.hostname;
  const sitePath = urlParts.pathname;

  const site = await client
    .api(`/sites/${hostname}:${sitePath}`)
    .get();

  return site.id;
}