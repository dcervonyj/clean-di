import { createHash } from "node:crypto";

/**
 * Inputs to the generated-file hash. Combining all three lets `--check` detect:
 *   - source `.di.ts` edits
 *   - downstream class-signature changes (a referenced class added a constructor param)
 *   - generator version bumps that change output format
 *
 * See DESIGN.md §7.9 for the rationale.
 */
export interface HashInputs {
  readonly sourceFileContent: string;
  /** Stable snapshot of each referenced class's constructor signature (parameter types as strings). */
  readonly constructorSignatures: readonly string[];
  /** The clean-di-codegen package version that produced the file. */
  readonly generatorVersion: string;
}

/**
 * Compute the SHA-256 hash of the inputs, returning a lowercase hex string.
 *
 * Inputs are concatenated with a separator that cannot appear inside the
 * source content, so reordering or boundary collisions cannot produce false
 * matches.
 */
export function hashGeneratedFile(inputs: HashInputs): string {
  const SEP = " ---clean-di-hash-sep--- ";
  const payload = [
    inputs.sourceFileContent,
    inputs.constructorSignatures.join(""),
    inputs.generatorVersion,
  ].join(SEP);

  return createHash("sha256").update(payload).digest("hex");
}
