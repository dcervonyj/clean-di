import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, basename } from "node:path";

import ts from "typescript";

import type { Diagnostic } from "../diagnostics/codes.js";
import type { DiagnosticReporter } from "../diagnostics/report.js";
import { DEFAULT_HEADER } from "../config/defaultConfig.js";

import { parseDiFile } from "../analyzer/parseDiFile.js";
import { collectContexts } from "../analyzer/collectContexts.js";
import type { ContextDeclaration } from "../analyzer/collectContexts.js";
import { buildBeanScopeWithImports, resolveDefineConfigCall, type BeanScopeEntry } from "../analyzer/buildBeanScope.js";
import { resolveConstructor } from "../analyzer/resolveConstructor.js";
import { topoSort } from "../analyzer/topoSort.js";
import { validateExpose } from "../analyzer/validateExpose.js";
import { formatGenerated, type EmittedBean, type EmittedImport } from "./formatGenerated.js";
import { hashGeneratedFile } from "./hash.js";

export interface EmitInput {
  /** Absolute path to the .di.ts source. */
  readonly sourcePath: string;
  /** TS Program containing sourcePath. */
  readonly program: ts.Program;
  /** Diagnostic reporter (errors get added here; caller flushes). */
  readonly reporter: DiagnosticReporter;
  /** clean-di-codegen package version. */
  readonly generatorVersion: string;
  /**
   * When true, skip writing the generated file. Returns `stale: true` if the
   * existing file is missing or differs from what would be generated. Used by
   * `--check` mode (DESIGN §7.9).
   */
  readonly dryRun?: boolean;
}

export interface RunResult {
  /** True if the generated file was written (or rewritten). False if skipped by hash. */
  readonly wrote: boolean;
  /**
   * In dryRun mode: true if the file is missing or its content differs from
   * what would be generated. Always false in normal (write) mode.
   */
  readonly stale: boolean;
  /** All diagnostics raised. */
  readonly diagnostics: readonly Diagnostic[];
  /** Path of the generated file. */
  readonly outputPath: string;
}

/**
 * End-to-end orchestrator for a single .di.ts file (the MVP per DESIGN §11 v0.2).
 *
 * Pipeline:
 *   1. parseDiFile → 2. collectContexts → 3. for each context:
 *     a. buildBeanScopeWithImports → b. resolveConstructor per bean → c. topoSort →
 *     d. formatGenerated → write
 *
 * Returns `wrote: false` if the hash matches the existing file (DESIGN §7.9).
 */
export async function emitGeneratedFile(input: EmitInput): Promise<RunResult> {
  const { sourcePath, program, reporter, generatorVersion } = input;
  const outputPath = computeOutputPath(sourcePath);
  const checker = program.getTypeChecker();

  const parsed = parseDiFile(program, sourcePath);
  const { contexts, diagnostics: shapeDiagnostics } = collectContexts(parsed);

  const allDiagnostics: Diagnostic[] = [...shapeDiagnostics];

  if (contexts.length === 0) {
    // No well-formed defineContext call. If shape diagnostics fired, surface
    // them through the reporter; otherwise treat as a no-op skip.
    for (const d of allDiagnostics) {
      reporter.add(d);
    }

    return { wrote: false, stale: false, diagnostics: allDiagnostics, outputPath };
  }

  // W3 MVP supports a single context per file. Take the first well-formed one.
  const context = contexts[0]!;
  const { scope: localScope, diagnostics: scopeDiagnostics } = buildBeanScopeWithImports(
    checker,
    context,
  );

  // Merge scope-resolution diagnostics (CDI-006, CDI-010) into the running list.
  allDiagnostics.push(...scopeDiagnostics);

  // Validate the `expose` whitelist (CDI-004) — every exposed name must exist
  // in the assembled scope.
  allDiagnostics.push(...validateExpose(context, localScope));

  // 3b: resolve each bean's constructor.
  const resolvedArgs = new Map<string, readonly (string | null)[]>();
  const constructorSigSnapshot: string[] = [];

  for (const [name, entry] of localScope) {
    if (entry.kind === "provide") {
      resolvedArgs.set(name, []);
      continue;
    }

    if (entry.kind === "config") {
      // Synthetic config bean (T-046) — no constructor to resolve; emits cfg.<name>.
      resolvedArgs.set(name, []);
      continue;
    }

    if (entry.classDeclaration === undefined) {
      // bean(SomethingNonClass) — collected as bean but couldn't resolve the class.
      // No constructor to resolve; treat as zero-arg fallback.
      resolvedArgs.set(name, []);
      continue;
    }

    const result = resolveConstructor({
      classDeclaration: entry.classDeclaration,
      scope: localScope,
      checker,
      ownerEntry: entry,
    });

    allDiagnostics.push(...result.diagnostics);
    resolvedArgs.set(name, result.args);
    constructorSigSnapshot.push(`${name}:${signatureSnapshot(entry, result.args)}`);
  }

  // 3c: topological sort.
  const graph = new Map<string, readonly string[]>();
  for (const [name, args] of resolvedArgs) {
    // Filter out null (optional-skipped) when building the dep graph.
    graph.set(
      name,
      args.filter((a): a is string => a !== null),
    );
  }

  const positions = new Map<string, { file: string; line: number; column: number }>();
  for (const [name, entry] of localScope) {
    const source = entry.source.getSourceFile();
    const { line, character } = source.getLineAndCharacterOfPosition(entry.source.getStart());
    positions.set(name, { file: source.fileName, line: line + 1, column: character + 1 });
  }

  const sorted = topoSort({ graph, positions });
  allDiagnostics.push(...sorted.diagnostics);

  if (sorted.order === null) {
    // Cycle — report and bail.
    for (const d of allDiagnostics) {
      reporter.add(d);
    }

    return { wrote: false, stale: false, diagnostics: allDiagnostics, outputPath };
  }

  // If we already collected non-cycle errors, still emit them but don't write.
  if (allDiagnostics.length > 0) {
    for (const d of allDiagnostics) {
      reporter.add(d);
    }

    return { wrote: false, stale: false, diagnostics: allDiagnostics, outputPath };
  }

  // 3d: format the generated file.
  const beans: EmittedBean[] = sorted.order.map((name) => {
    const entry = localScope.get(name)!;
    if (entry.kind === "provide") {
      return { name, rhs: emitProvideRhs(entry) };
    }
    if (entry.kind === "config") {
      return { name, rhs: `cfg.${name}` };
    }
    const args = resolvedArgs.get(name) ?? [];

    return { name, rhs: emitBeanRhs(entry, args) };
  });

  const imports = collectImports(parsed.sourceFile);
  const sourceFileContent = await readFile(sourcePath, "utf8");
  const hash = hashGeneratedFile({
    sourceFileContent,
    constructorSignatures: constructorSigSnapshot,
    generatorVersion,
  });

  const importedHooks = collectImportedLifecycleHooks(checker, context);

  // postConstruct order: imported configs depth-first, then parent (DESIGN §5.6).
  const postConstructSources: string[] = [
    ...importedHooks.postConstructSources,
    ...(context.postConstruct !== undefined ? [context.postConstruct.getText()] : []),
  ];
  // preDestroy order: parent first, then imports in LIFO order (DESIGN §5.6).
  const preDestroySources: string[] = [
    ...(context.preDestroy !== undefined ? [context.preDestroy.getText()] : []),
    ...importedHooks.preDestroySources,
  ];

  const generated = formatGenerated({
    sourcePath: basename(sourcePath),
    generatorVersion,
    hash,
    imports,
    configTypeName: context.configTypeName,
    contextExportName: context.exportName,
    beansInTopoOrder: beans,
    exposedKeys: context.expose,
    headerTemplate: DEFAULT_HEADER,
    postConstructSources,
    preDestroySources,
  });

  // dryRun: compare against committed file without writing (DESIGN §7.9 --check).
  if (input.dryRun === true) {
    if (!existsSync(outputPath)) {
      return { wrote: false, stale: true, diagnostics: [], outputPath };
    }
    const existing = await readFile(outputPath, "utf8");
    return { wrote: false, stale: existing !== generated, diagnostics: [], outputPath };
  }

  // Hash-based skip (DESIGN §7.9).
  if (existsSync(outputPath)) {
    const existing = await readFile(outputPath, "utf8");
    const existingHashMatch = existing.match(/Hash: sha256:([0-9a-f]+)/);
    if (existingHashMatch !== null && existingHashMatch[1] === hash) {
      return { wrote: false, stale: false, diagnostics: [], outputPath };
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, "utf8");

  return { wrote: true, stale: false, diagnostics: [], outputPath };
}

function computeOutputPath(sourcePath: string): string {
  // X.di.ts → X.di.generated.ts (adjacent mode — the only mode in v1)
  return sourcePath.replace(/\.di\.ts$/, ".di.generated.ts");
}

function emitProvideRhs(entry: BeanScopeEntry): string {
  // provide((cfg) => expr) — inline the body of the lambda. For W3 MVP we
  // textually copy the lambda body. The codegen WILL emit `cfg.xxx`-shaped
  // accesses verbatim because the source already uses them.
  const factory = entry.source.arguments[0];
  if (factory === undefined) {
    return "undefined";
  }

  // ArrowFunction → body
  if (ts.isArrowFunction(factory)) {
    if (ts.isBlock(factory.body)) {
      // Block body — wrap in IIFE.
      return `(() => ${factory.body.getText()})()`;
    }

    return factory.body.getText();
  }

  // FunctionExpression → call it
  if (ts.isFunctionExpression(factory)) {
    return `(${factory.getText()})(cfg)`;
  }

  // Fallback: assume it's a reference to a factory function — call it with cfg.
  return `${factory.getText()}(cfg)`;
}

function emitBeanRhs(entry: BeanScopeEntry, args: readonly (string | null)[]): string {
  const className = entry.classDeclaration?.name?.text ?? "unknown";
  const argList = args.map((a) => (a === null ? "undefined" : a)).join(", ");

  return `new ${className}(${argList})`;
}

function signatureSnapshot(entry: BeanScopeEntry, args: readonly (string | null)[]): string {
  const className = entry.classDeclaration?.name?.text ?? "unknown";

  return `${className}(${args.join(",")})`;
}

function collectImports(sourceFile: ts.SourceFile): readonly EmittedImport[] {
  // Strategy: re-emit every import declaration from the source EXCEPT
  // `clean-di` imports (the generated file imports from `clean-di/runtime`
  // instead). Then prepend the runtime import.
  const imports: EmittedImport[] = [
    { from: "clean-di/runtime", named: [{ name: "createContext" }] },
  ];

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) {
      continue;
    }
    const moduleSpecifier = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }
    if (moduleSpecifier.text === "clean-di" || moduleSpecifier.text === "clean-di/runtime") {
      continue;
    }

    const clause = stmt.importClause;
    if (clause === undefined) {
      continue;
    }

    const named: { name: string; alias?: string; typeOnly?: boolean }[] = [];

    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      const isTypeOnlyImport = clause.isTypeOnly;
      for (const element of clause.namedBindings.elements) {
        const name =
          element.propertyName !== undefined ? element.propertyName.text : element.name.text;
        const alias = element.propertyName !== undefined ? element.name.text : undefined;
        const typeOnly = isTypeOnlyImport || element.isTypeOnly;
        named.push({
          name,
          ...(alias !== undefined ? { alias } : {}),
          ...(typeOnly ? { typeOnly: true } : {}),
        });
      }
    }

    const defaultName = clause.name?.text;

    imports.push({
      from: moduleSpecifier.text,
      ...(defaultName !== undefined ? { defaultName } : {}),
      named,
    });
  }

  return imports;
}

interface LifecycleHooks {
  readonly postConstructSources: readonly string[];
  readonly preDestroySources: readonly string[];
}

/**
 * Walk the context's `imports` depth-first and collect the `postConstruct` /
 * `preDestroy` hook source texts from every imported `defineConfig` spec in
 * DESIGN §5.6 order.
 *
 * Returns ONLY the imported hooks; the caller appends/prepends the top-level
 * context's own hook:
 *   - postConstruct order: imported-depth-first THEN self
 *   - preDestroy order: self THEN imported-LIFO (= reverse of postConstruct)
 *
 * Diamond imports are deduplicated by `ts.CallExpression` identity — the same
 * `defineConfig` call node contributes its hooks exactly once.
 */
function collectImportedLifecycleHooks(
  checker: ts.TypeChecker,
  context: ContextDeclaration,
): LifecycleHooks {
  const postConstructSources: string[] = [];
  const preDestroySources: string[] = [];
  const visitedConfigs = new Set<ts.CallExpression>();

  function walkImportExpr(importExpr: ts.Expression): void {
    const configCall = resolveDefineConfigCall(checker, importExpr);
    if (configCall === null || visitedConfigs.has(configCall)) return;
    visitedConfigs.add(configCall);

    const spec = configCall.arguments[0];
    if (spec === undefined || !ts.isObjectLiteralExpression(spec)) return;

    // Depth-first: recurse into nested imports before collecting this spec's hooks.
    for (const nestedImport of extractImportsFromSpec(spec)) {
      walkImportExpr(nestedImport);
    }

    const postConstruct = extractHookFromSpec(spec, "postConstruct");
    if (postConstruct !== undefined) {
      postConstructSources.push(postConstruct.getText());
    }

    const preDestroy = extractHookFromSpec(spec, "preDestroy");
    if (preDestroy !== undefined) {
      // Collect in same order as postConstruct; reverse at the end.
      preDestroySources.push(preDestroy.getText());
    }
  }

  for (const importExpr of context.imports) {
    walkImportExpr(importExpr);
  }

  // preDestroy is the LIFO reversal of the postConstruct traversal order.
  preDestroySources.reverse();

  return { postConstructSources, preDestroySources };
}

/** Extract the `imports: [...]` elements from a defineConfig spec literal. */
function extractImportsFromSpec(spec: ts.ObjectLiteralExpression): readonly ts.Expression[] {
  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text !== "imports") continue;
    if (!ts.isArrayLiteralExpression(prop.initializer)) return [];
    return [...prop.initializer.elements];
  }
  return [];
}

/** Extract a `postConstruct` or `preDestroy` expression from a defineConfig spec literal. */
function extractHookFromSpec(
  spec: ts.ObjectLiteralExpression,
  key: "postConstruct" | "preDestroy",
): ts.Expression | undefined {
  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text !== key) continue;
    return prop.initializer;
  }
  return undefined;
}
