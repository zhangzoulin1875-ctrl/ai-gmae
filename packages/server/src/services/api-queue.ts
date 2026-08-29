/**
 * API Request Queue — ensures only 1 concurrent LLM API call at a time.
 * All requests are serialized through a FIFO queue.
 */

type QueueTask<T> = () => Promise<T>;

class APIRequestQueue {
  private queue: Array<{ task: QueueTask<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];
  private running = false;
  private totalProcessed = 0;
  private currentSize = 0;

  get size(): number {
    return this.currentSize;
  }

  get processed(): number {
    return this.totalProcessed;
  }

  get isBusy(): boolean {
    return this.running;
  }

  async enqueue<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.currentSize = this.queue.length;
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.currentSize = this.queue.length;
      try {
        const result = await item.task();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
      this.totalProcessed++;
    }

    this.running = false;
  }
}

// Singleton — shared across all requests
export const apiQueue = new APIRequestQueue();
