import "server-only";

import { z } from "zod";
import type { DomainConnection, DnsRecord } from "@/lib/domains";

const API = "https://api.vercel.com";
const projectDomainSchema = z.object({
  name: z.string(),
  verified: z.boolean(),
  redirect: z.string().nullable().optional(),
  redirectStatusCode: z.number().nullable().optional(),
  gitBranch: z.string().nullable().optional(),
  customEnvironmentId: z.string().nullable().optional(),
  verification: z.array(z.object({
    type: z.string(), domain: z.string(), value: z.string(),
  })).optional(),
});
const configSchema = z.object({
  misconfigured: z.boolean(),
  recommendedIPv4: z.array(z.object({ rank: z.number(), value: z.array(z.ipv4()) })),
  recommendedCNAME: z.array(z.object({ rank: z.number(), value: z.string().min(1) })),
});

export class DomainApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("The domain service could not complete this request.");
    this.name = "DomainApiError";
  }
}

function projectPath(version: number) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) throw new DomainApiError(503, "not_configured");
  return `/v${version}/projects/${encodeURIComponent(projectId)}/domains`;
}

async function request(path: string, method = "GET", body?: object): Promise<unknown> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new DomainApiError(503, "not_configured");
  const url = new URL(`${API}${path}`);
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) {
      throw new DomainApiError(503, "unavailable");
    }
    throw error;
  }
  if (response.status === 204 && response.ok) return null;
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new DomainApiError(response.status, "invalid_response");
  }
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(data);
    throw new DomainApiError(response.status, parsed.success ? parsed.data.error.code : "request_failed");
  }
  return data;
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new DomainApiError(502, "invalid_response");
  return parsed.data;
}

export async function addDomain(domain: string, redirect?: string) {
  return parse(projectDomainSchema, await request(projectPath(10), "POST", {
    name: domain, ...(redirect ? { redirect, redirectStatusCode: 308 } : {}),
  }));
}

export async function getDomain(domain: string) {
  return parse(projectDomainSchema, await request(`${projectPath(9)}/${encodeURIComponent(domain)}`));
}

export async function getDomainConfig(domain: string) {
  return parse(configSchema, await request(`/v6/domains/${encodeURIComponent(domain)}/config`));
}

export async function verifyDomain(domain: string) {
  return parse(projectDomainSchema, await request(`${projectPath(9)}/${encodeURIComponent(domain)}/verify`, "POST"));
}

export async function removeDomain(domain: string): Promise<void> {
  try {
    await request(`${projectPath(9)}/${encodeURIComponent(domain)}`, "DELETE");
  } catch (error) {
    // A previous partial removal may already have detached this hostname.
    if (!(error instanceof DomainApiError && error.status === 404 && error.code === "not_found")) throw error;
  }
}

export async function ensureDomain(domain: string, redirect?: string): Promise<void> {
  let result: z.infer<typeof projectDomainSchema>;
  try {
    result = await addDomain(domain, redirect);
  } catch (error) {
    if (!(error instanceof DomainApiError && error.status === 400 &&
      ["domain_already_in_use", "domain_already_exists"].includes(error.code))) throw error;
    result = await getDomain(domain);
  }
  if ((result.redirect ?? null) !== (redirect ?? null) || result.gitBranch || result.customEnvironmentId ||
    (redirect && ![301, 308].includes(result.redirectStatusCode ?? 0))) {
    throw new DomainApiError(409, "conflicting_connection");
  }
}

async function findDomain(domain: string) {
  try {
    return await getDomain(domain);
  } catch (error) {
    if (error instanceof DomainApiError && error.status === 404 && error.code === "not_found") return null;
    throw error;
  }
}

export async function getDomainConnection(domain: string, verify = false): Promise<DomainConnection> {
  const names = [domain, `www.${domain}`];
  let verificationFailed = false;
  if (verify) {
    await Promise.all(names.map(async (name) => {
      try {
        await verifyDomain(name);
      } catch (error) {
        // Rejected ownership challenges still need fresh DNS instructions.
        if (!(error instanceof DomainApiError && error.status === 400)) throw error;
        verificationFailed = true;
      }
    }));
  }
  const [root, www, rootConfig, wwwConfig] = await Promise.all([
    findDomain(domain), findDomain(`www.${domain}`), getDomainConfig(domain), getDomainConfig(`www.${domain}`),
  ]);
  const records: DnsRecord[] = [];
  const ipv4 = [...rootConfig.recommendedIPv4].sort((a, b) => a.rank - b.rank)[0];
  const cname = [...wwwConfig.recommendedCNAME].sort((a, b) => a.rank - b.rank)[0];
  for (const value of ipv4?.value ?? []) records.push({ type: "A", name: domain, value });
  if (cname) records.push({ type: "CNAME", name: `www.${domain}`, value: cname.value });
  for (const result of [root, www]) {
    for (const record of result?.verification ?? []) {
      if (record.type === "TXT" && !records.some((item) => item.type === "TXT" &&
        item.name === record.domain && item.value === record.value)) {
        records.push({ type: "TXT", name: record.domain, value: record.value });
      }
    }
  }
  const incomplete = !root || !www || !ipv4?.value.length || !cname;
  const wrongTarget = Boolean(root?.redirect || root?.gitBranch || root?.customEnvironmentId ||
    www?.redirect !== domain || ![301, 308].includes(www?.redirectStatusCode ?? 0) ||
    www?.gitBranch || www?.customEnvironmentId);
  const verified = root?.verified && www?.verified;
  const connected = !incomplete && !wrongTarget && !verificationFailed && verified &&
    !rootConfig.misconfigured && !wwwConfig.misconfigured;
  return {
    status: connected ? "Connected" : incomplete || wrongTarget || verified ? "Needs attention" : "Pending",
    records,
    issue: incomplete ? "Connection setup is incomplete. Retry the connection to finish setup." :
      wrongTarget ? "A hostname points to a different destination. Contact your agency." :
      !verified ? "Ownership verification is pending. Add any TXT records below, then check again." :
      verificationFailed ? "Ownership could not be verified. Review the TXT records or contact your agency." :
      !connected ? "DNS records do not yet match. Update them below, then check again." : "",
  };
}
