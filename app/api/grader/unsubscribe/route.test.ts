import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
import { unsubscribeUrl } from "@/lib/grader/unsubscribe";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GRADER_UNSUBSCRIBE_SECRET", "x".repeat(32));
  mocks.rpc.mockResolvedValue(true);
});
describe("grader unsubscribe", () => {
  it("does not unsubscribe on link preview and accepts a signed confirmation", async () => {
    const url = unsubscribeUrl("96b28c25-ec84-4b9d-847e-1270aec46fd4");
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("grader_unsubscribe", { p_unlock: "96b28c25-ec84-4b9d-847e-1270aec46fd4" });
  });
  it("rejects altered tokens", async () => {
    const url = new URL(unsubscribeUrl("96b28c25-ec84-4b9d-847e-1270aec46fd4"));
    url.searchParams.set("token", url.searchParams.get("token")!.replace("96b28c25", "96b28c26"));
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
