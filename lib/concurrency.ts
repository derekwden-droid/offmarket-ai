/**
 * Run an async mapper over `items` with a bounded number of in-flight tasks.
 *
 * Results are returned in the same order as the input, regardless of the order
 * in which individual tasks settle. A shared cursor feeds a fixed pool of
 * workers so that at most `limit` mappers run concurrently — this keeps batch
 * skip-trace / enrichment calls from overwhelming an upstream provider.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const workerCount = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Split `items` into contiguous chunks of at most `size`. Used to break a large
 * skip-trace batch into durable units of work so each chunk can be a separate
 * Inngest step (bounded memory, resumable, visible progress). A non-positive
 * size collapses to a single chunk.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return items.length > 0 ? [Array.from(items)] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
