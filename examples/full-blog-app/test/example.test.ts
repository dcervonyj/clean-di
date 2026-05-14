import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { blogContext } from "../src/blog/BlogContext.di.generated.js";
import type { BlogConfig } from "../src/blog/BlogConfig.js";
import { ListPostsUseCase } from "../src/blog/posts/ListPostsUseCase.js";
import { ListCommentsUseCase } from "../src/blog/comments/ListCommentsUseCase.js";
import { GetCurrentUserUseCase } from "../src/blog/users/GetCurrentUserUseCase.js";

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

afterAll(() => {
  blogContext.destroyAll();
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
