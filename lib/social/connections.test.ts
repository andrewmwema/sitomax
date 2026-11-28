import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), create: vi.fn(), list: vi.fn(), connect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }) }));
vi.mock("@/lib/agency", () => ({ getAgencySettings: async () => ({ name: "Agency", logoUrl: "https://agency.test/logo.png" }) }));
vi.mock("./provider", async (original) => {
  const actual = await original<typeof import("./provider")>();
  return { ...actual, getSocialProvider: () => ({ createProfile: mocks.create, listConnectedAccounts: mocks.list, getConnectUrl: mocks.connect }) };
});
import { connectSocialAccount, socialAccess, syncSocialAccount } from "./connections";
import { SocialProviderError } from "./provider";
import { encryptProfileId } from "./encryption";

const accountId = "70000000-0000-4000-8000-000000000011";
const profileId = "70000000-0000-4000-8000-000000000012";
const username = `sitomax_${profileId.replaceAll("-", "")}`;
let owner = true;
let profile: { id: string; encrypted_provider_profile_id: string | null; requested_at: string };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SOCIAL_PROFILE_ENCRYPTION_KEY", "ab".repeat(32));
  owner = true;
  profile = { id: profileId, encrypted_provider_profile_id: null, requested_at: new Date().toISOString() };
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: accountId, name: "Client" }, error: null }) }) }) });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "is_super_admin") return { data: false, error: null };
    if (name === "is_account_owner") return { data: owner, error: null };
    if (name === "social_connection_profile") return { data: profile, error: null };
    return { data: true, error: null };
  });
  afterEach(() => vi.unstubAllEnvs());
  mocks.create.mockResolvedValue({ data: { providerProfileId: username } });
  mocks.list.mockResolvedValue({ data: [], raw: {} });
  mocks.connect.mockResolvedValue({ data: { url: "https://app.upload-post.com/connect?token=private" }, raw: {} });
});

describe("tenant social connection orchestration", () => {
  it("denies non-owners before reserving mappings or making provider calls", async () => {
    owner = false;
    await expect(connectSocialAccount(accountId)).rejects.toThrow("Only account owners");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain("social_connection_profile");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("checks input before accessing tenant data", async () => {
    await expect(socialAccess("not-a-uuid")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recovers a conflicting remote creation and saves only encrypted mapping", async () => {
    mocks.create.mockRejectedValue(new SocialProviderError("conflict", 409));
    await connectSocialAccount(accountId);
    expect(mocks.list).toHaveBeenCalledWith(username);
    const saved = mocks.rpc.mock.calls.find(([name]) => name === "save_social_profile_mapping")?.[1];
    expect(saved).toMatchObject({ p_profile_id: profileId });
    expect(saved.p_ciphertext).not.toContain(username);
    expect(mocks.connect).toHaveBeenCalledWith(username, expect.objectContaining({
      platforms: ["facebook", "instagram", "google_business", "linkedin"], title: "Connect your social accounts to Agency",
      redirectUrl: expect.stringContaining(`/social/connected?account=${accountId}`),
    }));
  });

  it("reuses existing mappings, while minting a new URL every time", async () => {
    profile.encrypted_provider_profile_id = encryptProfileId(username, `${accountId}:${profileId}`);
    await connectSocialAccount(accountId);
    await connectSocialAccount(accountId);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it("saves complete account snapshots and reports persistence failures", async () => {
    profile.encrypted_provider_profile_id = encryptProfileId(username, `${accountId}:${profileId}`);
    await syncSocialAccount(accountId);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_social_accounts", {
      p_profile_id: profileId, p_started_at: profile.requested_at, p_accounts: [],
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "is_super_admin" || name === "is_account_owner") return { data: true, error: null };
      if (name === "social_connection_profile") return { data: profile, error: null };
      return { data: null, error: { code: "failure" } };
    });
    await expect(syncSocialAccount(accountId)).rejects.toThrow("could not be saved");
  });
});
