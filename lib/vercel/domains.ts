import "server-only";

import { z } from "zod";
import type { DomainConnection, DnsRecord } from "@/lib/domains";

const API = "https://api.vercel.com";
const verificationSchema = z.array(z.object({
  type: z.string(), domain: z.string().min(1), value: z.string().min(1),
}));
const projectDomainSchema = z.object({
  name: z.string(),
  verified: z.boolean(),
  redirect: z.string().nullable().optional(),
  redirectStatusCode: z.number().nullable().optional(),
  gitBranch: z.string().nullable().optional(),
  customEnvironmentId: z.string().nullable().optional(),
  verification: verificationSchema.optional(),
});
const configSchema = z.object({
  misconfigured: z.boolean(),
  recommendedIPv4: z.array(z.object({ rank: z.number(), value: z.array(z.ipv4()) })),
  recommendedCNAME: z.array(z.object({ rank: z.number(), value: z.string().min(1) })),
});

export class DomainApiError extends Error {
  constructor(public readonly status: number, public readonly code: string,
    public readonly verification: z.infer<typeof verificationSchema> = []) {
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
    const parsed = z.object({ error: z.object({ code: z.string(), verification: z.unknown().optional() }) }).safeParse(data);
    throw new DomainApiError(response.status, parsed.success ? parsed.data.error.code : "request_failed",
      verificationSchema.safeParse(parsed.success ? parsed.data.error.verification : undefined).data ?? []);
  }
  return data;
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new DomainApiError(502, "invalid_response");
  return parsed.data;
}

async function postDomain(domain: string, redirect?: string) {
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

function isMissingDomain(error: unknown): error is DomainApiError {
  return error instanceof DomainApiError && error.status === 404 &&
    ["not_found", "domain_not_found", "project_domain_not_found", "invalid_response", "request_failed"].includes(error.code);
}

function matchesTarget(result: z.infer<typeof projectDomainSchema>, redirect?: string) {
  return (result.redirect ?? null) === (redirect ?? null) && !result.gitBranch && !result.customEnvironmentId &&
    (!redirect || [301, 308].includes(result.redirectStatusCode ?? 0));
}

export async function addDomain(domain: string, redirect?: string) {
  let result: z.infer<typeof projectDomainSchema>;
  try {
    result = await postDomain(domain, redirect);
  } catch (error) {
    if (!(error instanceof DomainApiError && [400, 409].includes(error.status) &&
      ["domain_already_in_use", "domain_already_exists", "domain_taken"].includes(error.code))) throw error;
    const existing = await findDomain(domain);
    if (!existing) throw new DomainApiError(409, "domain_in_use_elsewhere", error.verification);
    result = existing;
  }
  if (!matchesTarget(result, redirect)) {
    throw new DomainApiError(409, "conflicting_connection");
  }
  return result;
}

async function findDomain(domain: string) {
  try {
    return await getDomain(domain);
  } catch (error) {
    if (isMissingDomain(error)) return null;
    throw error;
  }
}

type ConnectionOptions = { verify?: boolean; repair?: boolean };

async function checkHostname(name: string, redirect: string | undefined, options: ConnectionOptions) {
  let projectDomain = await findDomain(name);
  let conflict: DomainApiError | undefined;
  let repaired = false;
  async function repair() {
    repaired = true;
    try {
      return await addDomain(name, redirect);
    } catch (error) {
      if (!(error instanceof DomainApiError && error.code === "domain_in_use_elsewhere")) throw error;
      conflict = error;
      return null;
    }
  }
  if (!projectDomain && options.repair) projectDomain = await repair();
  if (options.verify && projectDomain && !projectDomain.verified && matchesTarget(projectDomain, redirect)) {
    try {
      const verified = await verifyDomain(name);
      projectDomain = { ...verified, verification: verified.verification ?? projectDomain.verification };
    } catch (error) {
      // A rejected challenge still needs DNS instructions. A detach during the check gets one repair attempt.
      if (isMissingDomain(error)) projectDomain = options.repair && !repaired ? await repair() : null;
      else if (!(error instanceof DomainApiError && error.status === 400)) throw error;
    }
  }
  const config = await getDomainConfig(name).catch((error: unknown) => {
    // A detached hostname may have no project DNS recommendations. Keep any TXT challenge visible.
    if (!projectDomain && isMissingDomain(error)) return null;
    throw error;
  });
  return { projectDomain, conflict, config };
}

export async function getDomainConnection(domain: string, options: ConnectionOptions = {}): Promise<DomainConnection> {
  const names = [domain, `www.${domain}`];
  const results = await Promise.all(names.map((name, index) => checkHostname(name, index ? domain : undefined, options)));
  const [{ projectDomain: root, config: rootConfig }, { projectDomain: www, config: wwwConfig }] = results;
  const records: DnsRecord[] = [];
  const ipv4 = [...(rootConfig?.recommendedIPv4 ?? [])].sort((a, b) => a.rank - b.rank)[0];
  const cname = [...(wwwConfig?.recommendedCNAME ?? [])].sort((a, b) => a.rank - b.rank)[0];
  for (const value of ipv4?.value ?? []) records.push({ type: "A", name: domain, value });
  if (cname) records.push({ type: "CNAME", name: `www.${domain}`, value: cname.value });
  for (const { projectDomain, conflict } of results) {
    for (const record of (projectDomain?.verified ? [] : projectDomain?.verification ?? conflict?.verification ?? [])) {
      if (record.type === "TXT" && !records.some((item) => item.type === "TXT" &&
        item.name === record.domain && item.value === record.value)) {
        records.push({ type: "TXT", name: record.domain, value: record.value });
      }
    }
  }
  const incomplete = !root || !www || !ipv4?.value.length || !cname;
  const wrongTarget = (root && !matchesTarget(root)) || (www && !matchesTarget(www, domain));
  const verified = root?.verified && www?.verified;
  const connected = !incomplete && !wrongTarget && verified &&
    rootConfig?.misconfigured === false && wwwConfig?.misconfigured === false;
  const inUseElsewhere = results.some(({ conflict }) => Boolean(conflict));
  const hasTxt = records.some(({ type }) => type === "TXT");
  return {
    status: connected ? "Connected" : incomplete || wrongTarget || verified ? "Needs attention" : "Pending",
    records,
    acceptableRecords: [
      ...results.flatMap(({ config }, index) => [
        ...(config?.recommendedIPv4 ?? []).flatMap((record) => record.value.map((value): DnsRecord => ({
          type: "A", name: names[index], value,
        }))),
        ...(config?.recommendedCNAME ?? []).map((record): DnsRecord => ({ type: "CNAME", name: names[index], value: record.value })),
      ]),
    ],
    issue: inUseElsewhere ? (hasTxt
      ? "This domain is in use elsewhere. Add the exact TXT name and value from the DNS instructions at your provider, then check again. If it is still blocked, ask the current project owner to release the domain."
      : "This domain is in use elsewhere. Ask the current project owner to release it, then retry. If a TXT ownership challenge becomes available, add its exact name and value at your DNS provider and check again.") :
      incomplete ? "Connection setup is incomplete. Retry the connection to finish setup." :
      wrongTarget ? "A hostname points to a different destination. Contact your agency." :
      !verified ? "Ownership verification is pending. Add any TXT records shown in the DNS instructions using the exact name and value, then check again." :
      !connected ? "DNS records do not yet match. Update them below, then check again." : "",
  };
}
