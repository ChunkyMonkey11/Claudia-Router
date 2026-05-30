import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createServer } from "../src/server.js";
import type { ClaudiaConfig } from "../src/types.js";

test("returns Anthropic SSE events for streaming requests", async () => {
  const originalFetch = globalThis.fetch;
  const config: ClaudiaConfig = {
    port: 0,
    defaultBackend: "local",
    backends: {
      local: {
        baseUrl: "http://provider.test/v1",
        apiKeyEnv: "LOCAL_API_KEY",
        defaultModel: "test-model"
      }
    },
    modelMap: {},
    modelProfiles: {}
  };
  const server = createServer(config).listen(0);

  globalThis.fetch = async (input, init) => {
    if (String(input) === "http://provider.test/v1/chat/completions") {
      return new Response(
        JSON.stringify({
          model: "test-model",
          choices: [
            {
              message: {
                role: "assistant",
                content: "ok"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1
          }
        }),
        {
          status: 200
        }
      );
    }

    return originalFetch(input, init);
  };

  try {
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://localhost:${port}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 32,
        messages: [
          {
            role: "user",
            content: "Say ok"
          }
        ],
        stream: true
      })
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
    assert.match(body, /event: message_start/);
    assert.match(body, /"type":"text_delta","text":"ok"/);
    assert.match(body, /event: message_stop/);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("error messages include port number and actionable guidance", () => {
  // EADDRINUSE message template
  const addrInUseMsg = `Failed to start Claudia Router: port 8082 is already in use.
Stop the existing router or change the port in config.json.`;
  assert.ok(addrInUseMsg.includes("port"), "EADDRINUSE mentions port");
  assert.ok(addrInUseMsg.includes("already in use"), "EADDRINUSE mentions conflict");
  assert.ok(addrInUseMsg.includes("config.json"), "EADDRINUSE suggests fix");

  // EACCES message template
  const accesMsg = `Failed to start Claudia Router: permission denied on port 8082.
You need elevated privileges to bind to this port, or choose a port >= 1024.`;
  assert.ok(accesMsg.includes("permission"), "EACCES mentions permission");
  assert.ok(accesMsg.includes("choose a port >= 1024"), "EACCES suggests solution");
});
