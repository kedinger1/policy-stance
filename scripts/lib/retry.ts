// Generic retry wrapper for transient network failures (dropped connections,
// ECONNABORTED, etc.) on operations that are safe to retry — i.e. idempotent
// reads, or writes where retrying just re-applies the same result.
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        console.log(`Retrying after error (attempt ${attempt + 1}/${retries}): ${message}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
