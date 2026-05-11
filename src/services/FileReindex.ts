export type FileReindexCallback = (filePath: string) => void;

export interface FileReindexServicePort {
  registerOnFileShouldBeReindexed(callback: FileReindexCallback): void;
  fileWasUpdated(filePath: string): void;
}

export class FileReindexService implements FileReindexServicePort {
  private onFileShouldBeReindexed: FileReindexCallback | undefined;

  registerOnFileShouldBeReindexed(callback: FileReindexCallback): void {
    this.onFileShouldBeReindexed = callback;
  }

  fileWasUpdated(filePath: string): void {
    this.onFileShouldBeReindexed?.(filePath);
  }
}
