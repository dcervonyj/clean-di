export class Logger {
  private readonly scope: string;

  constructor(scope: string) {
    this.scope = scope;
  }

  info(message: string): void {
    console.log(`[${this.scope}] ${message}`);
  }
}
