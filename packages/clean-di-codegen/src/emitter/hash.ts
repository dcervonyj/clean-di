import { createHash } from "node:crypto";

/**
 * Hash format (DESIGN §7.9):
 *
 *   combinedHash = sha256(
 *     sha256(sourceFileContent) + " | " +
 *     sha256(constructorSignatures.join("\n")) + " | " +
 *     sha256(generatorVersion)
 *   )
 *
 * The two-level hash makes per-input partial-hash reporting trivial:
 * we compute each component's sha256 first, then combine them. The
 * separator " | " cannot occur inside any of the hex-digest inputs,
 * so concatenation is unambiguous.
 */

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
 * Per-input partial sha256 digests plus the final combined digest. Used by the
 * future `--debug-hash` CLI mode (T-055 / W5) to report which input changed
 * between two runs.
 */
export interface HashBreakdown {
  readonly sourceFileHash: string;
  readonly constructorSignaturesHash: string;
  readonly generatorVersionHash: string;
  readonly combinedHash: string;
}

const PARTIAL_SEPARATOR = " | ";

/**
 * Compute the SHA-256 hash of the inputs, returning a lowercase hex string.
 *
 * Uses the two-level scheme documented at the top of this file: each input is
 * hashed independently, then the three hex digests are concatenated with a
 * separator and hashed again. Changing any single input flips its partial
 * digest, which flips the combined digest.
 */
export function hashGeneratedFile(inputs: HashInputs): string {
  return hashGeneratedFileWithBreakdown(inputs).combinedHash;
}

/**
 * Compute the same combined hash as {@link hashGeneratedFile} and additionally
 * return the contributing per-input partial digests. The CLI's `--debug-hash`
 * mode prints these to tell a developer which input changed (e.g. "the
 * constructor signatures changed").
 */
export function hashGeneratedFileWithBreakdown(inputs: HashInputs): HashBreakdown {
  const sourceFileHash = sha256(inputs.sourceFileContent);
  const constructorSignaturesHash = sha256(inputs.constructorSignatures.join("\n"));
  const generatorVersionHash = sha256(inputs.generatorVersion);

  const combinedHash = sha256(
    [sourceFileHash, constructorSignaturesHash, generatorVersionHash].join(PARTIAL_SEPARATOR),
  );

  return {
    sourceFileHash,
    constructorSignaturesHash,
    generatorVersionHash,
    combinedHash,
  };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
