/**
 * queue.test.ts – Unit tests for Queue<T>
 * Run with:  npx vitest run src/lib/queue.test.ts
 *
 * Covers: enqueue/dequeue FIFO order, empty-dequeue safety,
 * peek, size, isEmpty, toArray immutability.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Queue } from './queue';

describe('Queue<T>', () => {
  let q: Queue<number>;

  beforeEach(() => {
    q = new Queue<number>();
  });

  // ── isEmpty / size ─────────────────────────────────────────────────────────

  it('starts empty', () => {
    expect(q.isEmpty()).toBe(true);
    expect(q.size()).toBe(0);
  });

  it('is not empty after enqueue', () => {
    q.enqueue(1);
    expect(q.isEmpty()).toBe(false);
    expect(q.size()).toBe(1);
  });

  // ── FIFO order ─────────────────────────────────────────────────────────────

  it('dequeues in FIFO order (first in, first out)', () => {
    q.enqueue(10);
    q.enqueue(20);
    q.enqueue(30);

    expect(q.dequeue()).toBe(10); // oldest first
    expect(q.dequeue()).toBe(20);
    expect(q.dequeue()).toBe(30);
  });

  it('size decreases on dequeue', () => {
    q.enqueue(1);
    q.enqueue(2);
    expect(q.size()).toBe(2);
    q.dequeue();
    expect(q.size()).toBe(1);
    q.dequeue();
    expect(q.size()).toBe(0);
  });

  // ── Empty dequeue ──────────────────────────────────────────────────────────

  it('dequeue on empty queue returns undefined (no crash)', () => {
    const result = q.dequeue();
    expect(result).toBeUndefined();
    // Queue must still be usable after
    q.enqueue(42);
    expect(q.dequeue()).toBe(42);
  });

  // ── peek ──────────────────────────────────────────────────────────────────

  it('peek returns the front item without removing it', () => {
    q.enqueue(100);
    q.enqueue(200);
    expect(q.peek()).toBe(100); // still 100
    expect(q.size()).toBe(2);   // unchanged
  });

  it('peek on empty queue returns undefined', () => {
    expect(q.peek()).toBeUndefined();
  });

  // ── toArray ───────────────────────────────────────────────────────────────

  it('toArray returns items front-to-back', () => {
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    expect(q.toArray()).toEqual([1, 2, 3]);
  });

  it('toArray returns a copy — mutating it does not affect the queue', () => {
    q.enqueue(1);
    q.enqueue(2);
    const arr = q.toArray();
    arr.push(99); // mutate copy
    expect(q.size()).toBe(2); // queue unchanged
  });

  it('toArray on empty queue returns []', () => {
    expect(q.toArray()).toEqual([]);
  });

  // ── Interleaved enqueue / dequeue ─────────────────────────────────────────

  it('maintains FIFO after interleaved operations', () => {
    const sq = new Queue<string>();
    sq.enqueue('a');
    sq.enqueue('b');
    sq.dequeue(); // removes 'a'
    sq.enqueue('c');
    // queue is now: b, c
    expect(sq.dequeue()).toBe('b');
    expect(sq.dequeue()).toBe('c');
    expect(sq.isEmpty()).toBe(true);
  });
});
