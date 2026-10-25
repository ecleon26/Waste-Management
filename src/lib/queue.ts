/**
 * Queue<T> – Generic FIFO (First In, First Out) Queue
 *
 * Core data structure for this project.
 * Every pending pickup request enters at the BACK (enqueue) and
 * is served from the FRONT (dequeue) — fair, first-come-first-served.
 *
 * The Planner view builds ONE Queue<PickupRequest> per time slot per day.
 *
 * Time complexities:
 *   enqueue  – O(1)  : Array.push appends to the tail in constant time
 *   dequeue  – O(n)  : Array.shift removes from the head — shifts all elements
 *   peek     – O(1)  : direct index access to items[0]
 *   isEmpty  – O(1)  : compare .length to 0
 *   size     – O(1)  : return .length
 *   toArray  – O(n)  : spread creates a shallow copy of all n elements
 *
 * Why Array.shift instead of a linked list?
 *   For a neighborhood-scale queue (≤ 100 requests per slot) the O(n)
 *   shift is measured in microseconds — a linked list would be premature
 *   optimization with worse cache performance.
 */
export class Queue<T> {
  private items: T[] = [];

  /** Add an item to the BACK of the queue. O(1) */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /**
   * Remove and return the FRONT item.
   * Returns undefined on an empty queue — never throws. O(n).
   */
  dequeue(): T | undefined {
    return this.items.shift();
  }

  /** Inspect the front item without removing it. O(1) */
  peek(): T | undefined {
    return this.items[0];
  }

  /** True when there are no items. O(1) */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Number of items currently in the queue. O(1) */
  size(): number {
    return this.items.length;
  }

  /**
   * Return a shallow copy of all items, front → back.
   * Index 0 is the next item to be processed.
   * O(n) — safe to call frequently; does not mutate the queue.
   */
  toArray(): T[] {
    return [...this.items];
  }
}
