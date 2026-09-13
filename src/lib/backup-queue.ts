export async function drainBackupQueue<T>(options: {
  list: () => Promise<T[]>;
  process: (item: T, completed: number) => Promise<void>;
  budgetMs?: number;
  now?: () => number;
}): Promise<{ completed: number; pending: boolean }> {
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? Infinity;
  let completed = 0;
  while (true) {
    if (now() - started >= budget) return { completed, pending: true };
    const batch = await options.list();
    if (!batch.length) return { completed, pending: false };
    for (const item of batch) {
      if (now() - started >= budget) return { completed, pending: true };
      await options.process(item, completed);
      completed++;
    }
  }
}
