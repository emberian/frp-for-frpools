# Derived Values: computed()

Now we build `computed()`—a derived value that automatically recalculates when its dependencies change.

## The Interface

```typescript
const count = signal(0)
const doubled = computed(() => count.value * 2)

console.log(doubled.value)  // 0
count.value = 5
console.log(doubled.value)  // 10
```

A computed is like a signal, but:
- You can't set its value directly (it's derived)
- It re-runs its function when dependencies change
- It caches its result (doesn't recompute on every read)

## Computed = Signal + Subscriber

A computed is both a **signal** (others can depend on it) and a **subscriber** (it depends on other signals).

```
┌─────────────────────────────────────────────────────┐
│                      computed                       │
│  ┌─────────────────┐    ┌───────────────────────┐   │
│  │ As a Subscriber │    │ As a Signal           │   │
│  │ - has deps      │    │ - has value           │   │
│  │ - re-runs       │    │ - has subscribers     │   │
│  │   when deps     │    │ - notifies when       │   │
│  │   change        │    │   value changes       │   │
│  └─────────────────┘    └───────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

This duality is what makes the reactive graph composable. Computeds can depend on other computeds.

## First Attempt: Eager Evaluation

The simplest implementation recomputes eagerly when dependencies change:

```typescript
interface ReadonlySignal<T> {
  readonly value: T
}

function computed<T>(fn: () => T): ReadonlySignal<T> {
  // Internal signal to store the cached value
  const result = signal<T>(undefined as T)

  // Subscriber that recomputes
  const subscriber: Subscriber = {
    execute: () => {
      runWithTracking(subscriber, () => {
        result.value = fn()
      })
    },
    dependencies: new Set()
  }

  // Initial computation
  subscriber.execute()

  // Return read-only access
  return {
    get value(): T {
      return result.value
    }
  }
}
```

This works, but has a problem: if you create a computed but never read it, it still runs. And it re-runs every time dependencies change, even if nobody reads the result.

## Better: Lazy Evaluation

Production implementations use **lazy evaluation**: only compute when actually read.

```typescript
function computed<T>(fn: () => T): ReadonlySignal<T> {
  let cachedValue: T
  let isStale = true  // Needs recomputation

  const node: SignalNode<T> = {
    _value: undefined as T,
    _subscribers: new Set()
  }

  const subscriber: Subscriber = {
    execute: () => {
      // Don't recompute now—just mark as stale
      isStale = true
      // Notify our dependents that we *might* have changed
      const toNotify = [...node._subscribers]
      toNotify.forEach(sub => sub.execute())
    },
    dependencies: new Set()
  }

  return {
    get value(): T {
      // Track this read (we're also a signal!)
      if (activeSubscriber !== null) {
        node._subscribers.add(activeSubscriber)
        activeSubscriber.dependencies.add(node)
      }

      // Recompute only if stale
      if (isStale) {
        runWithTracking(subscriber, () => {
          cachedValue = fn()
        })
        isStale = false
      }

      return cachedValue
    }
  }
}
```

Now:
- The function only runs when `.value` is accessed
- Results are cached until dependencies change
- When a dependency changes, we just mark it stale (don't recompute yet)

## The Diamond Problem

Consider this dependency graph:

```typescript
const a = signal(1)
const b = computed(() => a.value * 2)
const c = computed(() => a.value * 3)
const d = computed(() => b.value + c.value)
```

```
        a
       / \
      b   c
       \ /
        d
```

When `a` changes, what happens?

1. `a` notifies `b` and `c`
2. `b` marks itself stale, notifies `d`
3. `d` marks itself stale
4. `c` marks itself stale, notifies `d`
5. `d` is already stale (harmless)

Later, when something reads `d.value`:
1. `d` sees it's stale, starts recomputing
2. Reads `b.value` → `b` recomputes (reads `a`)
3. Reads `c.value` → `c` recomputes (reads `a`)
4. Computes `b + c`, caches result

The lazy approach naturally handles the diamond: we don't compute anything until it's needed, and we only compute each node once.

## Avoiding Glitches

A **glitch** is when a subscriber sees an inconsistent intermediate state. Consider:

```typescript
const firstName = signal("Alice")
const lastName = signal("Smith")
const fullName = computed(() => firstName.value + " " + lastName.value)

effect(() => {
  console.log(fullName.value)
})
```

If we update both names:

```typescript
firstName.value = "Bob"    // Effect sees "Bob Smith"
lastName.value = "Jones"   // Effect sees "Bob Jones"
```

Two logs happen, which might be fine. But what if the updates should be atomic? We'll solve this with `batch()` in Chapter 6.

## Equality Checking

Our computed notifies dependents whenever a dependency changes, even if the derived value doesn't actually change. But what if the new value equals the old?

```typescript
const items = signal([1, 2, 3])
const count = computed(() => items.value.length)

items.value = [4, 5, 6]  // Different array, same length!
// Should count's dependents be notified?
```

We can add equality checking:

```typescript
function computed<T>(fn: () => T, equals = Object.is): ReadonlySignal<T> {
  let cachedValue: T
  let isStale = true

  // ... same as before ...

  return {
    get value(): T {
      if (activeSubscriber !== null) {
        node._subscribers.add(activeSubscriber)
        activeSubscriber.dependencies.add(node)
      }

      if (isStale) {
        const oldValue = cachedValue
        runWithTracking(subscriber, () => {
          cachedValue = fn()
        })
        isStale = false

        // Only notify if actually changed
        if (!equals(oldValue, cachedValue)) {
          const toNotify = [...node._subscribers]
          toNotify.forEach(sub => sub.execute())
        }
      }

      return cachedValue
    }
  }
}
```

Wait—this has a problem. We're notifying inside the getter, but we marked stale in `subscriber.execute()`. The timing is tricky.

For simplicity, let's keep our original design and note that production implementations handle this more carefully. The key insight is that **equality checking prevents unnecessary propagation**.

## Complete Implementation

```typescript
interface ReadonlySignal<T> {
  readonly value: T
}

function computed<T>(fn: () => T): ReadonlySignal<T> {
  let cachedValue: T
  let isStale = true

  const node: SignalNode<T> = {
    _value: undefined as T,
    _subscribers: new Set()
  }

  const subscriber: Subscriber = {
    execute: () => {
      isStale = true
      const toNotify = [...node._subscribers]
      toNotify.forEach(sub => sub.execute())
    },
    dependencies: new Set()
  }

  return {
    get value(): T {
      if (activeSubscriber !== null) {
        node._subscribers.add(activeSubscriber)
        activeSubscriber.dependencies.add(node)
      }

      if (isStale) {
        runWithTracking(subscriber, () => {
          cachedValue = fn()
        })
        isStale = false
      }

      return cachedValue
    }
  }
}
```

## Key Insights

1. **Computed is both signal and subscriber**: It participates on both sides of the reactive graph
2. **Lazy evaluation**: Only compute when read, cache until stale
3. **Mark then sweep**: On dependency change, mark stale immediately; recompute later
4. **Diamond handling**: Lazy evaluation naturally deduplicates work
5. **Composability**: Computeds can depend on computeds, building complex graphs

Next: `effect()` for side effects.
