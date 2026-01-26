# Batching Updates

Our reactive system has a problem: every signal change immediately notifies subscribers. This can cause wasteful intermediate updates.

## The Problem

```typescript
const firstName = signal("Alice")
const lastName = signal("Smith")
const fullName = computed(() => `${firstName.value} ${lastName.value}`)

effect(() => {
  console.log("Full name:", fullName.value)
})

// Update both names
firstName.value = "Bob"   // Effect runs: "Full name: Bob Smith"
lastName.value = "Jones"  // Effect runs: "Full name: Bob Jones"
```

The effect ran twice, but we only care about the final state. The "Bob Smith" log is wasted work—an intermediate state that was immediately superseded.

In a UI, this could mean:
- Flicker as intermediate states render briefly
- Wasted DOM operations
- Potential for users to see inconsistent data

## The Solution: Batching

We want a way to say "these updates are one logical unit":

```typescript
batch(() => {
  firstName.value = "Bob"
  lastName.value = "Jones"
})
// Effect runs once: "Full name: Bob Jones"
```

## Implementation Strategy

The idea:
1. During a batch, collect notifications instead of executing them
2. When the batch ends, execute each unique subscriber once

```typescript
let batchDepth = 0
const pendingSubscribers = new Set<Subscriber>()

function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      // Batch complete, flush pending notifications
      const toRun = [...pendingSubscribers]
      pendingSubscribers.clear()
      toRun.forEach(sub => sub.execute())
    }
  }
}
```

Now we need to modify our signal's setter to respect batching:

```typescript
function signal<T>(initial: T): { value: T } {
  const node: SignalNode<T> = {
    _value: initial,
    _subscribers: new Set()
  }

  return {
    get value(): T {
      if (activeSubscriber !== null) {
        node._subscribers.add(activeSubscriber)
        activeSubscriber.dependencies.add(node)
      }
      return node._value
    },

    set value(next: T) {
      if (node._value !== next) {
        node._value = next

        if (batchDepth > 0) {
          // Inside a batch: queue for later
          node._subscribers.forEach(sub => {
            pendingSubscribers.add(sub)
          })
        } else {
          // Not batched: notify immediately
          const toNotify = [...node._subscribers]
          toNotify.forEach(sub => sub.execute())
        }
      }
    }
  }
}
```

## Nested Batches

Our implementation handles nested batches naturally:

```typescript
batch(() => {
  firstName.value = "Bob"

  batch(() => {
    lastName.value = "Jones"
    // batchDepth is 2 here
  })
  // batchDepth is 1, so we don't flush yet

  middleName.value = "Q"
})
// batchDepth is 0, now flush all three changes
```

The `batchDepth` counter ensures we only flush when the outermost batch completes.

## Automatic Batching

Some frameworks batch automatically in certain contexts:
- React batches updates within event handlers
- Vue batches updates within the same "tick"

We could auto-batch effect executions:

```typescript
function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | void

  const subscriber: Subscriber = {
    execute: () => {
      // Auto-batch any signal changes made during this effect
      batch(() => {
        if (cleanup) cleanup()
        runWithTracking(subscriber, () => {
          cleanup = fn()
        })
      })
    },
    dependencies: new Set()
  }

  subscriber.execute()

  return () => {
    if (cleanup) cleanup()
    for (const dep of subscriber.dependencies) {
      dep._subscribers.delete(subscriber)
    }
    subscriber.dependencies.clear()
  }
}
```

Now signal changes within an effect don't trigger other effects until the current effect completes.

## The Execution Order Question

When we flush pending subscribers, what order do we run them in?

Our current implementation uses Set iteration order (insertion order in modern JS). But consider:

```typescript
const a = signal(1)
const b = computed(() => a.value * 2)
const c = computed(() => b.value * 3)

effect(() => console.log("b:", b.value))
effect(() => console.log("c:", c.value))

batch(() => {
  a.value = 2
})
```

If the `c` effect runs before the `b` effect... that's fine, because `computed` handles staleness. When `c` reads `b.value`, `b` recomputes first.

But what if effects could affect each other?

```typescript
const x = signal(1)
const y = signal(10)

effect(() => {
  if (x.value > 5) {
    y.value = 100  // Effect writing to a signal!
  }
})

effect(() => {
  console.log("y:", y.value)
})

batch(() => {
  x.value = 10
})
```

Now order matters. Production implementations often use topological sorting based on the dependency graph, or they prohibit effects from writing to signals (enforcing unidirectional data flow).

For our teaching implementation, we accept the simpler model and note that writing to signals inside effects can cause ordering issues.

## Complete Implementation

```typescript
let batchDepth = 0
const pendingSubscribers = new Set<Subscriber>()

function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      const toRun = [...pendingSubscribers]
      pendingSubscribers.clear()
      toRun.forEach(sub => sub.execute())
    }
  }
}

function notifySubscribers(subscribers: Set<Subscriber>): void {
  if (batchDepth > 0) {
    subscribers.forEach(sub => pendingSubscribers.add(sub))
  } else {
    const toNotify = [...subscribers]
    toNotify.forEach(sub => sub.execute())
  }
}

// Updated signal setter
set value(next: T) {
  if (node._value !== next) {
    node._value = next
    notifySubscribers(node._subscribers)
  }
}
```

## Key Insights

1. **Batching prevents intermediate states**: Multiple changes become one notification
2. **Depth tracking handles nesting**: Only flush when outermost batch completes
3. **Order can matter**: For complex cases, consider topological sorting
4. **Auto-batching is helpful**: Batch within effect executions to prevent cascades

## When to Use Batch

- When making multiple related changes
- When changes happen in a loop
- When you observe unwanted intermediate renders

```typescript
// Without batch: N notifications
for (const item of items) {
  updateSignal(item)
}

// With batch: 1 notification
batch(() => {
  for (const item of items) {
    updateSignal(item)
  }
})
```

Next: Common patterns and utilities built on these primitives.
