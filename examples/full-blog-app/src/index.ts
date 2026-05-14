/**
 * full-blog-app entry point.
 *
 * Demonstrates the `blogContext` with a mocked fetch (no real HTTP calls) so
 * the example runs in any environment — CI included.
 */

import { blogContext } from "./blog/BlogContext.di.generated.js";
import type { BlogConfig } from "./blog/BlogConfig.js";

// ---------------------------------------------------------------------------
// Mock fetch — replace global fetch with a minimal stub that returns canned data.
// ---------------------------------------------------------------------------
const MOCK_POSTS = [
  { id: 1, title: "Hello clean-di", body: "Dependency injection made simple." },
  { id: 2, title: "Modular wiring", body: "Sub-configs compose naturally." },
];
const MOCK_COMMENTS = [
  { id: 10, postId: 1, body: "Great post!" },
  { id: 11, postId: 1, body: "Very helpful, thanks." },
];
const MOCK_USER = { id: 42, name: "Alice" };

function makeMockFetch() {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    let data: unknown = null;
    if (url.endsWith("/posts") || url.includes("/posts?")) data = MOCK_POSTS;
    else if (url.includes("/comments")) data = MOCK_COMMENTS;
    else if (url.includes("/users/me")) data = MOCK_USER;
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

(globalThis as Record<string, unknown>)["fetch"] = makeMockFetch();

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const config: BlogConfig = {
  apiBaseUrl: "https://api.example.com",
  authToken: "mock-token-abc123",
};

const blog = blogContext.get({ config });

// ---------------------------------------------------------------------------
// Exercise the exposed use cases
// ---------------------------------------------------------------------------
async function run(): Promise<void> {
  console.log("=== full-blog-app demo ===\n");

  const posts = await blog.listPosts.execute();
  console.log(`Posts (${posts.length}):`);
  for (const p of posts) {
    console.log(`  [${p.id}] ${p.title}`);
  }

  console.log();

  const comments = await blog.listComments.execute(1);
  console.log(`Comments on post 1 (${comments.length}):`);
  for (const c of comments) {
    console.log(`  [${c.id}] ${c.body}`);
  }

  console.log();

  const user = await blog.getCurrentUser.execute();
  console.log(`Current user: ${user.name} (id=${user.id})`);

  // Teardown — triggers preDestroy hooks in LIFO order.
  blogContext.destroyAll();
  console.log("\ndone.");
}

run().catch((err: unknown) => {
  console.error(err);
  throw err;
});
