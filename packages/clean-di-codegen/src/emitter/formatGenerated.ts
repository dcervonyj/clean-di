/**
 * A single import statement to emit at the top of the generated file.
 *
 * `named` carries every `{ A, B as C }` entry; `defaultName` carries the
 * optional default-import binding. Either may be present (or both, mirroring
 * `import Default, { Named } from "..."`).
 */
export interface EmittedImport {
  /** Module specifier, e.g., `"./HttpPostsRepository"` or `"clean-di/runtime"`. */
  readonly from: string;
  /** Default import name, if any. */
  readonly defaultName?: string;
  /** Named imports (possibly aliased, possibly `type`-only). */
  readonly named: readonly {
    readonly name: string;
    readonly alias?: string;
    readonly typeOnly?: boolean;
  }[];
}

/**
 * A single bean binding inside the `createContext(...)` builder.
 *
 * The emitter writes `const ${name} = ${rhs};`. The analyzer is responsible
 * for producing a syntactically valid `rhs` (e.g., `new Foo(a, b)` or an
 * inlined `provide(...)` expression).
 */
export interface EmittedBean {
  /** Variable name in the generated file. */
  readonly name: string;
  /**
   * Right-hand-side expression text. For `bean(Foo)` this is
   * `new Foo(...args)`; for `provide((cfg) => expr)` this is the inlined
   * `expr` (with `cfg.x` references replaced as appropriate by the analyzer).
   */
  readonly rhs: string;
}

/**
 * Everything `formatGenerated` needs to render a `.di.generated.ts` file.
 *
 * The orchestrator (T-042) assembles this from the analyzer outputs, then
 * passes the struct verbatim — keeping the formatter pure and easy to test.
 */
export interface FormatGeneratedInput {
  /** The source `.di.ts` path (relative). Used in the header. */
  readonly sourcePath: string;
  /** clean-di-codegen version string. Used in the header. */
  readonly generatorVersion: string;
  /** SHA-256 hex hash of the inputs (from emitter/hash.ts). Used in the header. */
  readonly hash: string;
  /** TS imports replicated from the source plus the runtime import. */
  readonly imports: readonly EmittedImport[];
  /** Name of the config TypeScript type referenced by `defineContext<TConfig>()`. */
  readonly configTypeName: string;
  /** The bean name on which the context is exported (e.g., `"postsContext"`). */
  readonly contextExportName: string;
  /** Beans in topological order (later beans may reference earlier names). */
  readonly beansInTopoOrder: readonly EmittedBean[];
  /** The exposed-keys whitelist from the context's `expose: [...]` list. */
  readonly exposedKeys: readonly string[];
  /** Header template (defaults to `DEFAULT_HEADER` from `config/defaultConfig.ts`). */
  readonly headerTemplate: string;
  /** Source text of the `postConstruct` arrow / function expression, or undefined. */
  readonly postConstructSource?: string;
  /** Source text of the `preDestroy` arrow / function expression, or undefined. */
  readonly preDestroySource?: string;
}

/**
 * Render the full text of a `.di.generated.ts` file.
 *
 * Output is hand-formatted (NOT via Prettier) to keep determinism — the
 * `.prettierignore` from T-006 skips this output. The exact shape mirrors
 * DESIGN §7.8: header comment block, imports, a single
 * `createContext<TConfig, Exposed>` call with `const` bindings in topo order,
 * `bag` and `expose` returns.
 */
export function formatGenerated(input: FormatGeneratedInput): string {
  const header = renderHeader(input);
  const importLines = input.imports.map(renderImport);
  const exposedTypeAnnotation = renderExposedTypeAnnotation(input);
  const beanLines = input.beansInTopoOrder.map((b) => `    const ${b.name} = ${b.rhs};`);
  const bagFields = input.beansInTopoOrder.map((b) => b.name).join(", ");
  const exposeFields = input.exposedKeys.join(", ");
  const hookLines = renderHookLines(input, bagFields);

  return [
    header,
    "",
    ...importLines,
    "",
    `export const ${input.contextExportName} = createContext<${input.configTypeName}, ${exposedTypeAnnotation}>(`,
    `  (cfg) => {`,
    ...beanLines,
    "",
    `    return {`,
    `      bag: { ${bagFields} },`,
    `      expose: { ${exposeFields} },`,
    ...hookLines,
    `    };`,
    `  },`,
    `);`,
    "",
  ].join("\n");
}

function renderHeader(input: FormatGeneratedInput): string {
  return input.headerTemplate
    .replaceAll("{source}", input.sourcePath)
    .replaceAll("{generator}", `clean-di-codegen ${input.generatorVersion}`)
    .replaceAll("{hash}", `sha256:${input.hash}`);
}

function renderImport(imp: EmittedImport): string {
  const parts: string[] = [];
  if (imp.defaultName !== undefined) {
    parts.push(imp.defaultName);
  }

  if (imp.named.length > 0) {
    const namedParts = imp.named
      .map((n) => {
        const inner = n.alias !== undefined ? `${n.name} as ${n.alias}` : n.name;

        return n.typeOnly === true ? `type ${inner}` : inner;
      })
      .join(", ");
    parts.push(`{ ${namedParts} }`);
  }

  return `import ${parts.join(", ")} from "${imp.from}";`;
}

/**
 * Render the optional `postConstruct` / `preDestroy` fields for the BuildResult
 * literal. The user's hook is authored as `(beans, cfg) => ...`, but the
 * `BuildResult` shape expects `(config: unknown) => void`. We wrap the user's
 * hook in a thin adapter that supplies the locally-built bean bag.
 */
function renderHookLines(input: FormatGeneratedInput, bagFields: string): readonly string[] {
  const lines: string[] = [];

  if (input.postConstructSource !== undefined) {
    lines.push(
      `      postConstruct: (cfg) => (${input.postConstructSource})({ ${bagFields} }, cfg),`,
    );
  }

  if (input.preDestroySource !== undefined) {
    lines.push(
      `      preDestroy: (cfg) => (${input.preDestroySource})({ ${bagFields} }, cfg),`,
    );
  }

  return lines;
}

function renderExposedTypeAnnotation(input: FormatGeneratedInput): string {
  if (input.exposedKeys.length === 0) {
    return "{}";
  }

  // W3 MVP: emit `unknown` placeholders. W4 will replace these with the
  // resolved class names once the analyzer wires up class symbols. The
  // `createContext` second generic is structural, so this still type-checks.
  return "{ " + input.exposedKeys.map((k) => `${k}: unknown`).join(", ") + " }";
}
