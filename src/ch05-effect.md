# Side Effects: effect()

We have signals (reactive values) and computeds (derived values). Now we need a way to *do something* when values change: update the DOM, make API calls, log to console.

This is `effect()`.

## The Interface

```typescript
const count = signal(0)

const dispose = effect(() => {
  console.log("Count is:", count.value)
})
// Immediately logs: "Count is: 0"

count.value = 1  // Logs: "Count is: 1"
count.value = 2  // Logs: "Count is: 2"

dispose()  // Stop watching
count.value = 3  // (no log)
```

Effects:
- Run immediately when created
- Re-run when dependencies change
- Return a cleanup function

## Effects vs Computeds

| Computed | Effect |
|----------|--------|
| Returns a value | Returns nothing (side effect) |
| Lazy (runs when read) | Eager (runs immediately) |
| Pure function | Impure (side effects) |
| Others can depend on it | Terminal node in the graph |

Think of computeds as internal nodes in the reactive graph. Effects are the leaves—where reactivity meets the outside world.

```
   [signal] ──→ [computed] ──→ [computed] ──→ [effect → DOM]
       │                                           │
       └──────────→ [effect → console.log] ←───────┘
```

## Implementation

Effects are simpler than computeds—no caching, no lazy evaluation:

```typescript
function effect(fn: () => void): () => void {
  const subscriber: Subscriber = {
    execute: () => {
      runWithTracking(subscriber, fn)
    },
    dependencies: new Set()
  }

  // Run immediately
  subscriber.execute()

  // Return cleanup function
  return () => {
    // Unsubscribe from all dependencies
    for (const dep of subscriber.dependencies) {
      dep._subscribers.delete(subscriber)
    }
    subscriber.dependencies.clear()
  }
}
```

That's it. About 15 lines.

## Cleanup Functions

Sometimes effects create resources that need cleanup. For example:

```typescript
const url = signal("/api/data")

effect(() => {
  const controller = new AbortController()

  fetch(url.value, { signal: controller.signal })
    .then(r => r.json())
    .then(data => console.log(data))

  // Problem: when url changes, the old fetch is still in flight!
})
```

The solution: let effects return a cleanup function:

```typescript
function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | void

  const subscriber: Subscriber = {
    execute: () => {
      // Run previous cleanup
      if (cleanup) {
        cleanup()
      }
      runWithTracking(subscriber, () => {
        cleanup = fn()
      })
    },
    dependencies: new Set()
  }

  subscriber.execute()

  return () => {
    if (cleanup) {
      cleanup()
    }
    for (const dep of subscriber.dependencies) {
      dep._subscribers.delete(subscriber)
    }
    subscriber.dependencies.clear()
  }
}
```

Now:

```typescript
const url = signal("/api/data")

effect(() => {
  const controller = new AbortController()

  fetch(url.value, { signal: controller.signal })
    .then(r => r.json())
    .then(data => console.log(data))

  // Return cleanup function
  return () => controller.abort()
})

url.value = "/api/other"  // Old fetch aborted, new one started
```

## Nested Effects

What if an effect creates another effect?

```typescript
effect(() => {
  console.log("Outer effect")

  effect(() => {
    console.log("Inner effect")
  })
})
```

With our current implementation, this works but has a problem: every time the outer effect re-runs, it creates a *new* inner effect without cleaning up the old one. Memory leak!

The solution is effect scoping—inner effects should be cleaned up when their parent re-runs:

```typescript
function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | void
  const childDisposers: (() => void)[] = []

  const subscriber: Subscriber = {
    execute: () => {
      // Clean up children first
      childDisposers.forEach(dispose => dispose())
      childDisposers.length = 0

      // Then our own cleanup
      if (cleanup) {
        cleanup()
      }

      // Track child effects created during our execution
      const parentSubscriber = activeSubscriber
      // ... run with special handling for nested effects ...
    },
    dependencies: new Set()
  }

  // ... rest of implementation ...
}
```

This gets complex. For our teaching implementation, we'll keep it simple and note that production libraries handle nested effects more carefully.

## Common Patterns

### DOM Updates

```typescript
const count = signal(0)
const button = document.querySelector('button')!

effect(() => {
  button.textContent = `Clicked ${count.value} times`
})

button.addEventListener('click', () => {
  count.value++
})
```

### Conditional Logic

```typescript
const isLoggedIn = signal(false)
const user = signal<User | null>(null)

effect(() => {
  if (isLoggedIn.value && user.value) {
    console.log(`Welcome, ${user.value.name}!`)
  } else {
    console.log("Please log in")
  }
})
```

Remember: dependencies are tracked dynamically. When `isLoggedIn` is `false`, this effect doesn't depend on `user`.

### Debugging

```typescript
const debug = <T>(label: string, sig: { value: T }) => {
  effect(() => {
    console.log(`[${label}]`, sig.value)
  })
}

const count = signal(0)
debug("count", count)

count.value = 1  // Logs: [count] 1
```

## When Not to Use Effects

Effects are powerful but can lead to spaghetti code. Prefer:

- **Computeds** when you're deriving a value
- **Event handlers** for user interactions
- **Effects** only for synchronizing with external systems (DOM, network, localStorage)

```typescript
// Bad: using effect to derive a value
const count = signal(0)
let doubled = 0
effect(() => {
  doubled = count.value * 2  // Side effect: mutating external variable
})

// Good: using computed
const count = signal(0)
const doubled = computed(() => count.value * 2)
```

## Complete Implementation

```typescript
function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | void

  const subscriber: Subscriber = {
    execute: () => {
      if (cleanup) {
        cleanup()
      }
      runWithTracking(subscriber, () => {
        cleanup = fn()
      })
    },
    dependencies: new Set()
  }

  subscriber.execute()

  return () => {
    if (cleanup) {
      cleanup()
    }
    for (const dep of subscriber.dependencies) {
      dep._subscribers.delete(subscriber)
    }
    subscriber.dependencies.clear()
  }
}
```

## Key Insights

1. **Effects are eager**: They run immediately and on every dependency change
2. **Effects are terminal**: They're the edges of the reactive graph
3. **Cleanup is essential**: Effects should clean up their resources
4. **Use sparingly**: Effects are for external synchronization, not internal logic

Next: `batch()` for grouping updates.
