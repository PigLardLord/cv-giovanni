import { mkdir, writeFile } from 'node:fs/promises';

export class NodeDirectoryWriter {
  constructor(directoryUrl) {
    this.directoryUrl = directoryUrl;
  }

  async write(filename, bytes) {
    await mkdir(this.directoryUrl, { recursive: true });
    await writeFile(new URL(filename, this.directoryUrl), bytes);
  }
}
