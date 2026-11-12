import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedLookup } from "./net-safety";

describe("pinnedLookup", () => {
  const server = createServer((_req, res) => { res.statusCode = 204; res.end(); });
  let port = 0;
  beforeAll(async () => { await new Promise<void>((done) => server.listen(0, "127.0.0.1", done)); port = (server.address() as AddressInfo).port; });
  afterAll(async () => { await new Promise((done) => server.close(done)); });

  it("answers with a list when Node asks for all addresses", () => {
    const lookup = pinnedLookup({ address: "203.0.114.7", family: 4 });
    let got: unknown;
    lookup("example.test", { all: true }, ((_err: unknown, value: unknown) => { got = value; }) as never);
    expect(got).toEqual([{ address: "203.0.114.7", family: 4 }]);
  });

  it("answers with one address when Node asks for one", () => {
    const lookup = pinnedLookup({ address: "203.0.114.7", family: 4 });
    let got: unknown[] = [];
    lookup("example.test", {}, ((_err: unknown, address: unknown, family: unknown) => { got = [address, family]; }) as never);
    expect(got).toEqual(["203.0.114.7", 4]);
  });

  // The bug this guards: every uptime check failed because a real Node request rejected the lookup's answer.
  it("lets a real Node request connect to the pinned address, whatever the hostname says", async () => {
    const status = await new Promise<number | string>((resolve) => {
      const req = request({ host: "name-that-does-not-resolve.test", port, path: "/", method: "GET", lookup: pinnedLookup({ address: "127.0.0.1", family: 4 }) }, (res) => { resolve(res.statusCode ?? 0); res.destroy(); });
      req.on("error", (err) => resolve(err.message));
      req.end();
    });
    expect(status).toBe(204);
  });
});
