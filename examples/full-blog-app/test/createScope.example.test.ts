import { createScope } from "clean-di";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { BlogConfig } from "../src/blog/BlogConfig.js";
import { blogContext } from "../src/blog/BlogContext.di.generated.js";
import { ListPostsUseCase } from "../src/blog/posts/ListPostsUseCase.js";

// ---------------------------------------------------------------------------
// T-100: End-to-end coverage for `createScope` driven from a real example
// context. Pattern: get a parent container (the generated blogContext), then
// `createScope(parentExposed, factory)` to add per-request beans, and verify
// that scope destruction does not affect the parent.
// ---------------------------------------------------------------------------

// Minimal fetch stub so HttpPostsRepository can list posts.
function stubFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const data = url.endsWith("/posts") ? [{ id: 1, title: "t", body: "b" }] : null;

  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const config: BlogConfig = {
  apiBaseUrl: "https://api.example.com",
  authToken: "test-token",
};
const PARENT_KEY = "parent-for-scope";

beforeAll(() => {
  (globalThis as Record<string, unknown>)["fetch"] = stubFetch;
});

afterAll(async () => {
  await blogContext.destroy(PARENT_KEY);
});

describe("examples/full-blog-app — createScope (T-100)", () => {
  it("exposes parent beans plus child beans on the merged exposed bag", () => {
    const parentBeans = blogContext.get({ config, key: PARENT_KEY });

    const requestScope = createScope(parentBeans, () => {
      const requestId = "req-42";
      const traceId = "trace-abc";

      return {
        bag: { requestId, traceId },
        expose: { requestId, traceId },
      };
    });

    const exposed = requestScope.get({});

    // Parent beans pass through identity-shared.
    expect(exposed.listPosts).toBe(parentBeans.listPosts);
    expect(exposed.listPosts).toBeInstanceOf(ListPostsUseCase);
    // Scope beans are present.
    expect(exposed.requestId).toBe("req-42");
    expect(exposed.traceId).toBe("trace-abc");
  });

  it("destroying the scope does NOT destroy the parent", async () => {
    const parentBeans = blogContext.get({ config, key: PARENT_KEY });

    const requestScope = createScope(parentBeans, () => ({
      bag: { requestId: "req-99" },
      expose: { requestId: "req-99" },
    }));

    requestScope.get({});
    await requestScope.destroy();

    // Parent is still usable — same exposed bag reference.
    const stillAlive = blogContext.get({ config, key: PARENT_KEY });
    expect(stillAlive.listPosts).toBe(parentBeans.listPosts);
  });

  it("each scope key produces an independent child instance over the same parent", () => {
    const parentBeans = blogContext.get({ config, key: PARENT_KEY });

    let counter = 0;
    const requestScope = createScope(parentBeans, () => {
      counter += 1;
      const instanceId = counter;

      return {
        bag: { instanceId },
        expose: { instanceId },
      };
    });

    const a = requestScope.get({ key: "req-a" });
    const b = requestScope.get({ key: "req-b" });

    // Parent bean is identity-shared across scope instances.
    expect(a.listPosts).toBe(b.listPosts);
    // Scope beans differ per key.
    expect(a.instanceId).not.toBe(b.instanceId);
  });
});
