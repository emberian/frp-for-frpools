# The Problem with State

Before we build anything, let's understand *why* signals exist. What problem do they solve?

## State Synchronization is Hard

Consider a simple counter with a derived "doubled" value:

```typescript
let count = 0
let doubled = count * 2

count = 5
console.log(doubled) // Still 0! 😱
```

The problem is obvious: `doubled` was computed *once* when we defined it. Changing `count` doesn't magically re-run that computation.

## The Manual Solution

We could manually update `doubled` every time we change `count`:

```typescript
let count = 0
let doubled = count * 2

count = 5
doubled = count * 2  // Must remember to do this!
console.log(doubled) // 10 ✓
```

This works for two variables. Now imagine a real application:

```typescript
let firstName = "Alice"
let lastName = "Smith"
let fullName = firstName + " " + lastName
let greeting = "Hello, " + fullName + "!"
let titleCase = fullName.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
// ... and 50 more derived values
```

Every time `firstName` changes, you must manually update `fullName`, `greeting`, `titleCase`, and everything else that depends on them. Miss one and your UI shows stale data.

## The Observer Pattern (Partial Solution)

The traditional solution is the Observer pattern:

```typescript
class Observable<T> {
  private value: T
  private listeners: Set<(value: T) => void> = new Set()

  constructor(initial: T) {
    this.value = initial
  }

  get(): T {
    return this.value
  }

  set(newValue: T): void {
    this.value = newValue
    this.listeners.forEach(fn => fn(newValue))
  }

  subscribe(fn: (value: T) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
```

Now consumers can subscribe to changes:

```typescript
const count = new Observable(0)

// Subscribe to changes
count.subscribe(value => {
  console.log("count changed to", value)
})

count.set(5) // Logs: "count changed to 5"
```

This is better! Changes propagate automatically. But there's a problem with derived values:

```typescript
const count = new Observable(0)
const doubled = new Observable(0)

// Manual wiring required!
count.subscribe(value => {
  doubled.set(value * 2)
})

count.set(5) // doubled is now 10
```

We still have to *manually specify* that `doubled` depends on `count`. If we forget, or wire it wrong, bugs ensue.

## The Dream: Automatic Dependency Tracking

What if the system could *figure out* the dependencies automatically?

```typescript
const count = signal(0)
const doubled = computed(() => count.value * 2)
//                              ↑
//                  System detects this read!

count.value = 5
console.log(doubled.value) // 10, automatically!
```

Nobody told `doubled` that it depends on `count`. The system *inferred* it by watching what `computed()` read during execution.

This is the key insight behind signals: **track reads, not writes**.

## The Three Primitives

To achieve this, we need three things:

1. **signal(value)** — A container that knows when it's being read
2. **computed(fn)** — Runs a function and tracks what signals it reads
3. **effect(fn)** — Like computed, but for side effects (DOM updates, logging, etc.)

The next three chapters build each of these, one at a time.

## Key Insight

> The power of signals comes from automatic dependency tracking. By intercepting *reads* instead of requiring manual subscription, the system builds a dependency graph at runtime.

This is a fundamental shift from "tell the system what depends on what" to "let the system observe what depends on what."
