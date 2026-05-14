import { Logger } from "./Logger";

/**
 * Structurally compatible with `Logger` (same shape plus a `private readonly
 * tag` for nominal identity, declared as a subclass so it's assignable to
 * `Logger`). Two beans of this type with no name fallback → CDI-002.
 */
export class BackupLogger extends Logger {
  private readonly backupTag = "backup-logger";
  override log(message: string): void {
    void message;
    void this.backupTag;
  }
}
