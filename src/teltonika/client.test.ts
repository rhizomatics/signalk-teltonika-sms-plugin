import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { TeltonikaClient } from "./client";
import { TeltonikaApiError } from "./types";

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8");
  return text ? JSON.parse(text) : undefined;
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      res.writeHead(500);
      res.end(String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("login posts credentials and caches the returned token/expiry", async () => {
  let loginRequests = 0;
  await withServer(
    async (req, res) => {
      if (req.method === "POST" && req.url === "/api/login") {
        loginRequests++;
        const body = (await readBody(req)) as { username: string; password: string };
        assert.equal(body.username, "user");
        assert.equal(body.password, "pass");
        respondJson(res, 200, { success: true, data: { username: "user", token: "tok-1", expires: 299 } });
        return;
      }
      respondJson(res, 404, { success: false });
    },
    async (baseUrl) => {
      const client = new TeltonikaClient({ baseUrl, username: "user", password: "pass", allowSelfSignedCert: false });
      const token = await client.login();
      assert.equal(token, "tok-1");
      assert.equal(loginRequests, 1);
    },
  );
});

test("getModemIds logs in once, sends the bearer token, and caches results until refresh", async () => {
  let loginRequests = 0;
  let modemRequests = 0;
  await withServer(
    async (req, res) => {
      if (req.method === "POST" && req.url === "/api/login") {
        loginRequests++;
        respondJson(res, 200, { success: true, data: { username: "user", token: "tok-1", expires: 299 } });
        return;
      }
      if (req.method === "GET" && req.url === "/api/messages/storage/config") {
        modemRequests++;
        assert.equal(req.headers.authorization, "Bearer tok-1");
        respondJson(res, 200, { success: true, data: [{ modem_id: "1-1" }, { modem_id: "3-1" }, { modem_id: "1-1" }] });
        return;
      }
      respondJson(res, 404, { success: false });
    },
    async (baseUrl) => {
      const client = new TeltonikaClient({ baseUrl, username: "user", password: "pass", allowSelfSignedCert: false });
      const ids = await client.getModemIds();
      assert.deepEqual(ids, ["1-1", "3-1"]);
      assert.equal(loginRequests, 1);
      assert.equal(modemRequests, 1);

      await client.getModemIds();
      assert.equal(modemRequests, 1, "second call should use the cache");

      await client.getModemIds({ refresh: true });
      assert.equal(modemRequests, 2, "refresh:true should bypass the cache");
    },
  );
});

test("sendSms posts the expected body and succeeds", async () => {
  await withServer(
    async (req, res) => {
      if (req.method === "POST" && req.url === "/api/login") {
        respondJson(res, 200, { success: true, data: { username: "user", token: "tok-1", expires: 299 } });
        return;
      }
      if (req.method === "POST" && req.url === "/api/messages/actions/send") {
        const body = (await readBody(req)) as { data: { modem: string; number: string; message: string } };
        assert.deepEqual(body.data, { modem: "1-1", number: "+447123456789", message: "hello" });
        respondJson(res, 200, { success: true, data: { sms_used: 1 } });
        return;
      }
      respondJson(res, 404, { success: false });
    },
    async (baseUrl) => {
      const client = new TeltonikaClient({ baseUrl, username: "user", password: "pass", allowSelfSignedCert: false });
      await client.sendSms("1-1", "+447123456789", "hello");
    },
  );
});

test("sendSms throws TeltonikaApiError when the router reports failure", async () => {
  await withServer(
    async (req, res) => {
      if (req.method === "POST" && req.url === "/api/login") {
        respondJson(res, 200, { success: true, data: { username: "user", token: "tok-1", expires: 299 } });
        return;
      }
      if (req.method === "POST" && req.url === "/api/messages/actions/send") {
        respondJson(res, 200, { success: false, errors: [{ error: "modem busy" }] });
        return;
      }
      respondJson(res, 404, { success: false });
    },
    async (baseUrl) => {
      const client = new TeltonikaClient({ baseUrl, username: "user", password: "pass", allowSelfSignedCert: false });
      await assert.rejects(client.sendSms("1-1", "+447123456789", "hello"), (err: unknown) => {
        assert.ok(err instanceof TeltonikaApiError);
        assert.match(err.message, /modem busy/);
        return true;
      });
    },
  );
});

test("re-authenticates once when the router rejects the cached token as unauthorized", async () => {
  let loginRequests = 0;
  let sendAttempts = 0;
  await withServer(
    async (req, res) => {
      if (req.method === "POST" && req.url === "/api/login") {
        loginRequests++;
        respondJson(res, 200, { success: true, data: { username: "user", token: `tok-${loginRequests}`, expires: 299 } });
        return;
      }
      if (req.method === "POST" && req.url === "/api/messages/actions/send") {
        sendAttempts++;
        if (req.headers.authorization === "Bearer tok-1") {
          respondJson(res, 401, { success: false, errors: [{ error: "session expired" }] });
          return;
        }
        respondJson(res, 200, { success: true, data: { sms_used: 1 } });
        return;
      }
      respondJson(res, 404, { success: false });
    },
    async (baseUrl) => {
      const client = new TeltonikaClient({ baseUrl, username: "user", password: "pass", allowSelfSignedCert: false });
      await client.sendSms("1-1", "+447123456789", "hello");
      assert.equal(loginRequests, 2);
      assert.equal(sendAttempts, 2);
    },
  );
});

test("re-logs in once the cached token's reported expiry has passed", async () => {
  let now = 0;
  let loginRequests = 0;
  await withServer(
    async (req, res) => {
      if (req.method === "POST" && req.url === "/api/login") {
        loginRequests++;
        respondJson(res, 200, { success: true, data: { username: "user", token: `tok-${loginRequests}`, expires: 60 } });
        return;
      }
      if (req.method === "GET" && req.url === "/api/messages/storage/config") {
        respondJson(res, 200, { success: true, data: [{ modem_id: "1-1" }] });
        return;
      }
      respondJson(res, 404, { success: false });
    },
    async (baseUrl) => {
      const client = new TeltonikaClient({ baseUrl, username: "user", password: "pass", allowSelfSignedCert: false }, () => now);
      await client.getModemIds({ refresh: true });
      assert.equal(loginRequests, 1);

      now += 61_000;
      await client.getModemIds({ refresh: true });
      assert.equal(loginRequests, 2);
    },
  );
});
