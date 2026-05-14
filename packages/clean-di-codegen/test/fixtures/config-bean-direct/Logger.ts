export class Logger {
  private readonly tag = "Logger";

  log(msg: string): void {
    void this.tag;
    console.log(msg);
  }
}
