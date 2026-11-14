import "server-only";

/**
 * Wrapper around the Vercel REST API for managing custom domains.
 * Placeholder until custom-domain support is implemented.
 */

const VERCEL_API = "https://api.vercel.com";

function requestInit(): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

/** Attach a custom domain to the Vercel project. */
export async function addDomain(domain: string): Promise<unknown> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${teamQuery()}`,
    {
      ...requestInit(),
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
  );
  return res.json();
}

/** Remove a custom domain from the Vercel project. */
export async function removeDomain(domain: string): Promise<unknown> {
  const res = await fetch(
    `${VERCEL_API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}${teamQuery()}`,
    {
      ...requestInit(),
      method: "DELETE",
    },
  );
  return res.json();
}

/** Check a domain's verification/configuration status. */
export async function getDomainStatus(domain: string): Promise<unknown> {
  const res = await fetch(
    `${VERCEL_API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}${teamQuery()}`,
    requestInit(),
  );
  return res.json();
}
