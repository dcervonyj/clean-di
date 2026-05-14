import { Logger } from "./Logger";

/**
 * Structurally identical to `Logger` (same `log(message: string): void` shape
 * and a `private readonly tag` for nominal identity). Declared as `extends`
 * so it is assignable to `Logger` and therefore competes with the primary
 * `logger` bean during type-based resolution — forcing the name-fallback path.
 */
export class BackupLogger extends Logger {
  private readonly backupTag = "backup-logger";
  override log(message: string): void {
    void message;
    void this.backupTag;
  }
}
