# full-blog-app example

Demonstrates the full clean-di feature set: sub-config modules, `provide()`,
lifecycle hooks, and multi-tenant (`key`-based) contexts.

## What it shows

| Feature | Where |
|---------|-------|
| Sub-config modules | `CommentsConfig.di.ts`, `UsersConfig.di.ts` |
| Top-level context with imports | `BlogContext.di.ts` |
| Explicit `provide()` for non-config beans | `logger: provide(() => new Logger("blog"))` |
| Synthetic config beans | `apiBaseUrl` and `authToken` auto-wired from `BlogConfig` |
| Name-fallback wiring | `apiBaseUrl: string` ↔ constructor param `apiBaseUrl: string` |
| `postConstruct` + `preDestroy` lifecycle | Hooks in `BlogContext.di.ts` |
| Multi-tenant via `key` | Separate scopes per tenant config key |

## Structure

```
src/
  blog/
    BlogConfig.ts              — config interface (apiBaseUrl, authToken)
    BlogContext.di.ts          — top-level context definition
    BlogContext.di.generated.ts— generated wiring (committed, do not edit)
    posts/
      Post.ts                  — domain type
      HttpPostsRepository.ts   — fetches posts
      ListPostsUseCase.ts
      CreatePostUseCase.ts
    comments/
      Comment.ts
      HttpCommentsRepository.ts
      ListCommentsUseCase.ts
      DeleteCommentUseCase.ts
      CommentsConfig.di.ts     — sub-config for comments domain
    users/
      User.ts
      HttpUsersRepository.ts
      GetCurrentUserUseCase.ts
      UsersConfig.di.ts        — sub-config for users domain
  shared/
    Logger.ts                  — simple tagged logger
  index.ts                     — demo entry point (mocked fetch)
```

## Key patterns

### Sub-config imports

```ts
// CommentsConfig.di.ts — no TConfig, just a reusable bean bundle
export const commentsConfig = defineConfig({
  beans: {
    commentsRepository: bean(HttpCommentsRepository),
    listComments: bean(ListCommentsUseCase),
    deleteComment: bean(DeleteCommentUseCase),
  },
});

// BlogContext.di.ts — imports sub-configs; their beans merge into scope
export const blogContext = defineContext<BlogConfig>()({
  imports: [commentsConfig, usersConfig],
  beans: { logger: provide(() => new Logger("blog")), ... },
  expose: ["listPosts", "createPost", "listComments", "deleteComment", "getCurrentUser"],
});
```

### Synthetic config beans

`defineContext<BlogConfig>()` automatically injects `apiBaseUrl: string` and
`authToken: string` into the scope — one bean per field of `BlogConfig`. Any
constructor param named `apiBaseUrl` is resolved automatically without an
explicit `provide()`.

### `provide()` for non-config values

Use `provide(() => value)` to inject values that aren't config fields:

```ts
logger: provide(() => new Logger("blog")),
```

The bean is named `logger`, so `logger: Logger` constructor params resolve to it.

### Lifecycle hooks

```ts
postConstruct: ({ logger }, cfg) => logger.info(`blog ready — ${cfg.apiBaseUrl}`),
preDestroy: ({ logger }, _cfg) => logger.info("blog destroyed"),
```

- **`postConstruct`** fires after the first `get()` call, once per key.
- **`preDestroy`** fires on `destroy(key)` / `destroyAll()`.

Imported sub-config hooks are called **before** the parent's `postConstruct`,
and **after** the parent's `preDestroy` (LIFO).

## Running

```sh
pnpm install   # from repo root
cd examples/full-blog-app
pnpm build     # compile TypeScript
node dist/index.js
```

Expected output:

```
[blog] blog ready — https://api.example.com
=== full-blog-app demo ===

[blog] listing posts
Posts (2):
  [1] Hello clean-di
  [2] Modular wiring
...
[blog] blog destroyed
done.
```

## Regenerating

```sh
node ../../packages/clean-di-codegen/dist/bin.js
```
