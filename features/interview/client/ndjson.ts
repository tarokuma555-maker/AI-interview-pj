/** 少しずつ届く NDJSON(1行に1つの JSON)を、行ごとのオブジェクトに分ける */
export class NdjsonParser<T> {
  private buffer = "";

  push(chunk: string): T[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
  }

  flush(): T[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [JSON.parse(rest) as T] : [];
  }
}
