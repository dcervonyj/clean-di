import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { BlogConfig } from "../src/blog/BlogConfig.js";
import { blogContext } from "../src/blog/BlogContext.di.generated.js";
import { ListCommentsUseCase } from "../src/blog/comments/ListCommentsUseCase.js";
import { ListPostsUseCase } from "../src/blog/posts/ListPostsUseCase.js";
import { GetCurrentUserUseCase } from "../src/blog/users/GetCurrentUserUseCase.js";
import { lifecycleObserver } from "../src/shared/lifecycleObserver.js";

// ---------------------------------------------------------------------------
// Minimal fetch stub — same data as the example's index.ts mock.
// ---------------------------------------------------------------------------
const MOCK_POSTS = [
  { id: 1, title: "Hello clean-di", body: "DI made simple." },
  { id: 2, title: "Modular wiring", body: "Sub-configs compose." },
];
const MOCK_COMMENTS = [{ id: 10, postId: 1, body: "Great post!" }];
const MOCK_USER = { id: 42, name: "Alice" };

function stubFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  let data: unknown = null;
  if (url.includes("/users/me")) data = MOCK_USER;
  else if (url.includes("/comments")) data = MOCK_COMMENTS;
  else if (url.endsWith("/posts")) data = MOCK_POSTS;
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

const KEY = "test";

beforeAll(() => {
  (globalThis as Record<string, unknown>)["fetch"] = stubFetch;
});

afterAll(async () => {
  await blogContext.destroyAll();
});

describe("examples/full-blog-app — blogContext", () => {
  it("resolves the listPosts use case", () => {
    const blog = blogContext.get({ config, key: KEY });
    expect(blog.listPosts).toBeInstanceOf(ListPostsUseCase);
  });

  it("resolves the listComments use case from imported sub-config", () => {
    const blog = blogContext.get({ config, key: KEY });
    expect(blog.listComments).toBeInstanceOf(ListCommentsUseCase);
  });

  it("resolves the getCurrentUser use case from imported sub-config", () => {
    const blog = blogContext.get({ config, key: KEY });
    expect(blog.getCurrentUser).toBeInstanceOf(GetCurrentUserUseCase);
  });

  it("listPosts.execute() returns posts from the mocked API", async () => {
    const blog = blogContext.get({ config, key: KEY });
    const posts = await blog.listPosts.execute();
    expect(posts).toHaveLength(2);
    expect(posts[0]!.title).toBe("Hello clean-di");
  });

  it("listComments.execute() returns comments for a post", async () => {
    const blog = blogContext.get({ config, key: KEY });
    const comments = await blog.listComments.execute(1);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe("Great post!");
  });

  it("getCurrentUser.execute() returns the current user", async () => {
    const blog = blogContext.get({ config, key: KEY });
    const user = await blog.getCurrentUser.execute();
    expect(user.name).toBe("Alice");
    expect(user.id).toBe(42);
  });

  it("same key returns the same cached instance", () => {
    const a = blogContext.get({ config, key: KEY });
    const b = blogContext.get({ config, key: KEY });
    expect(a.listPosts).toBe(b.listPosts);
  });
});

// ---------------------------------------------------------------------------
// T-100: End-to-end coverage for the async lifecycle path. The blog context
// uses an async `postConstruct` / `preDestroy` (yield-a-microtask warm-up and
// teardown) that records its observable side-effect on `lifecycleObserver`.
// These tests exercise the codegen + runtime async path the way an end user
// would: define async hooks in the .di.ts, regenerate, and use the container.
// ---------------------------------------------------------------------------
describe("examples/full-blog-app — async lifecycle (T-100)", () => {
  it("get() returns the exposed bag immediately; init() awaits async postConstruct", async () => {
    lifecycleObserver.reset();
    const key = "async-lifecycle-init";

    const blog = blogContext.get({ config, key });

    // The exposed beans are available synchronously.
    expect(blog.listPosts).toBeInstanceOf(ListPostsUseCase);
    // The async warm-up has not yet completed — it is scheduled but unawaited.
    expect(lifecycleObserver.warmedUp).toBe(false);

    await blogContext.init({ config, key });

    // After init(), the async postConstruct side-effect has happened.
    expect(lifecycleObserver.warmedUp).toBe(true);

    await blogContext.destroy(key);
  });

  it("without init(), the async postConstruct is still scheduled (eventually fires)", async () => {
    lifecycleObserver.reset();
    const key = "async-lifecycle-no-init";

    blogContext.get({ config, key });
    // Side-effect hasn't fired yet — postConstruct yielded a microtask.
    expect(lifecycleObserver.warmedUp).toBe(false);

    // Flush the microtask queue. The scheduled promise resolves and the
    // observable side-effect happens, even though we never called init().
    await Promise.resolve();
    expect(lifecycleObserver.warmedUp).toBe(true);

    await blogContext.destroy(key);
  });

  it("destroy() awaits the async preDestroy", async () => {
    lifecycleObserver.reset();
    const key = "async-lifecycle-destroy";

    blogContext.get({ config, key });
    await blogContext.init({ config, key });
    expect(lifecycleObserver.tornDown).toBe(false);

    await blogContext.destroy(key);

    // The async preDestroy yielded a microtask before flipping `tornDown`.
    // Because destroy() awaited the returned promise, the side-effect is
    // visible by the time destroy() resolves.
    expect(lifecycleObserver.tornDown).toBe(true);
  });
});
