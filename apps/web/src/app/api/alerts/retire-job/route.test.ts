import { beforeEach, describe, expect, it, vi } from "vitest";
import { getJob, updateJob } from "@/lib/checkins";
import { retireToken } from "@/lib/alerts/job-links";
import { GET, POST } from "./route";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/checkins", () => ({ getJob: vi.fn(), updateJob: vi.fn() }));
vi.mock("@/lib/env", () => ({ appUrl: () => "https://spooky.example" }));

const U = "user-1";
const J = "0b8f2c1e-1111-4222-8333-944455556666";
const base = "https://spooky.example/api/alerts/retire-job";
const form = (t: string) => new Request(base, { method: "POST", body: new URLSearchParams({ u: U, j: J, t }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SP_MASTER_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.mocked(getJob).mockResolvedValue({ id: J, name: "Nightly <b>backup</b>", status: "down" } as never);
});

describe("retire-job link", () => {
  it("GET shows a confirm button and changes nothing", async () => {
    const r = await GET(new Request(`${base}?u=${U}&j=${J}&t=${retireToken(U, J)}`));
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain('<form method="post"');
    expect(html).toContain("Nightly &lt;b&gt;backup&lt;/b&gt;");
    expect(html).not.toContain("<b>backup</b>");
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("POST with the right token retires the job", async () => {
    const r = await POST(form(retireToken(U, J)));
    expect(r.status).toBe(200);
    expect(updateJob).toHaveBeenCalledWith(U, J, { retired: true }, "link:retire-job");
  });

  it("POST with a wrong token or another job's token changes nothing", async () => {
    expect((await POST(form("x"))).status).toBe(400);
    expect((await POST(form(retireToken(U, "0b8f2c1e-1111-4222-8333-000000000000")))).status).toBe(400);
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("a deleted job gets a plain page, not an error", async () => {
    vi.mocked(getJob).mockResolvedValue(null);
    expect((await GET(new Request(`${base}?u=${U}&j=${J}&t=${retireToken(U, J)}`))).status).toBe(404);
  });
});
