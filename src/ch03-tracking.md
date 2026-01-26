# Automatic Tracking

In the previous chapter, we built a signal that tracks its readers. But tracking was one-shot, so dependencies could go stale. Let's fix that and understand the tracking system more deeply.

## The Problem: Stale Dependencies

Consider this scenario:

```typescript
const showDetails = signal(true)
const name = signal("Alice")
const age = signal(30)

effect(() => {
  if (showDetails.value) {
    console.log(`${name.value} is ${age.value}`)
  } else {
    console.log("Details hidden")
  }
})
```

When `showDetails` is `true`, the effect reads all three signals. When `showDetails` is `false`, it only reads `showDetails`.

If the user sets `showDetails.value = false`, should changing `name` or `age` re-run the effect? Logically, no—the effect doesn't use them anymore.

But with our current implementation, the effect is still subscribed to `name` and `age` from the previous run. These are **stale dependencies**.

## The Solution: Dependency Sets

Instead of only signals tracking subscribers, we add the reverse link too:

**Subscribers track which signals they depend on.**

Before each run, we:
1. Save the old dependency set
2. Clear it
3. Run the function (which populates a new dependency set)
4. Unsubscribe from any signals that are no longer in the new set

```typescript
interface Subscriber {
  execute: () => void
  dependencies: Set<SignalInternal<any>>
}

interface SignalInternal<T> {
  value: T
  subscribers: Set<Subscriber>
}
```

## Revised Implementation

Let's rewrite our system with proper dependency tracking:

```typescript
// The currently executing subscriber (if any)
let activeSubscriber: Subscriber | null = null

interface Subscriber {
  execute: () => void
  dependencies: Set<SignalNode<any>>
}

interface SignalNode<T> {
  _value: T
  _subscribers: Set<Subscriber>
}

function signal<T>(initial: T): { value: T } {
  const node: SignalNode<T> = {
    _value: initial,
    _subscribers: new Set()
  }

  return {
    get value(): T {
      // Track this read
      if (activeSubscriber !== null) {
        node._subscribers.add(activeSubscriber)
        activeSubscriber.dependencies.add(node)
      }
      return node._value
    },

    set value(next: T) {
      if (node._value !== next) {
        node._value = next
        // Copy to avoid mutation during iteration
        const toNotify = [...node._subscribers]
        toNotify.forEach(sub => sub.execute())
      }
    }
  }
}
```

And a helper to run a function while tracking:

```typescript
function runWithTracking(subscriber: Subscriber, fn: () => void): void {
  // Clear old dependencies
  for (const dep of subscriber.dependencies) {
    dep._subscribers.delete(subscriber)
  }
  subscriber.dependencies.clear()

  // Run with tracking
  const previous = activeSubscriber
  activeSubscriber = subscriber
  try {
    fn()
  } finally {
    activeSubscriber = previous
  }
}
```

## Visualizing the Dependency Graph

Let's trace through our earlier example:

```typescript
const showDetails = signal(true)
const name = signal("Alice")
const age = signal(30)

// Create a subscriber
const sub: Subscriber = {
  execute: () => runWithTracking(sub, () => {
    if (showDetails.value) {
      console.log(`${name.value} is ${age.value}`)
    } else {
      console.log("Details hidden")
    }
  }),
  dependencies: new Set()
}

// First run (showDetails = true)
sub.execute()
```

After the first run:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ showDetails │     │    name     │     │     age     │
│ subscribers:│     │ subscribers:│     │ subscribers:│
│   [sub]     │     │   [sub]     │     │   [sub]     │
└─────────────┘     └─────────────┘     └─────────────┘
       ↑                   ↑                   ↑
       └───────────────────┼───────────────────┘
                           │
                    ┌──────┴──────┐
                    │     sub     │
                    │dependencies:│
                    │[showDetails,│
                    │ name, age]  │
                    └─────────────┘
```

Now, set `showDetails.value = false`:

```typescript
showDetails.value = false
// 1. sub.execute() is called
// 2. Old dependencies (showDetails, name, age) are cleared
// 3. Function runs, only reads showDetails
// 4. New dependencies: just [showDetails]
```

After the second run:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ showDetails │     │    name     │     │     age     │
│ subscribers:│     │ subscribers:│     │ subscribers:│
│   [sub]     │     │   (empty)   │     │   (empty)   │
└─────────────┘     └─────────────┘     └─────────────┘
       ↑
       │
┌──────┴──────┐
│     sub     │
│dependencies:│
│[showDetails]│
└─────────────┘
```

Now changing `name` or `age` won't trigger the subscriber—exactly what we want.

## The Cleanup Dance

This "clear then rebuild" pattern is sometimes called the **cleanup dance**:

1. **Before running**: Unsubscribe from all previous dependencies
2. **During running**: Subscribe to whatever is actually read
3. **After running**: Old subscriptions are gone, new ones are active

It's elegant because it handles all cases:
- New dependencies: automatically subscribed
- Removed dependencies: automatically unsubscribed
- Same dependencies: unsubscribed then resubscribed (harmless)

## Why Not Diff?

You might think: "Why not compute the difference between old and new dependencies?"

```typescript
// Hypothetical diffing approach
const oldDeps = [...subscriber.dependencies]
subscriber.dependencies.clear()
runFunction()
const newDeps = [...subscriber.dependencies]

for (const dep of oldDeps) {
  if (!newDeps.includes(dep)) {
    dep._subscribers.delete(subscriber)  // Removed
  }
}
for (const dep of newDeps) {
  if (!oldDeps.includes(dep)) {
    dep._subscribers.add(subscriber)  // Added
  }
}
```

This is more complex and not faster for typical cases (most reactive functions have few dependencies). The "clear and rebuild" approach is simpler and has predictable performance.

## Key Insights

1. **Bidirectional links**: Signals know their subscribers; subscribers know their dependencies
2. **Dynamic dependencies**: The dependency set can change on every run
3. **Cleanup before run**: Clear old subscriptions to prevent stale dependencies
4. **Automatic management**: No manual subscribe/unsubscribe calls needed

## The Code So Far

```typescript
let activeSubscriber: Subscriber | null = null

interface Subscriber {
  execute: () => void
  dependencies: Set<SignalNode<any>>
}

interface SignalNode<T> {
  _value: T
  _subscribers: Set<Subscriber>
}

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
        const toNotify = [...node._subscribers]
        toNotify.forEach(sub => sub.execute())
      }
    }
  }
}

function runWithTracking(subscriber: Subscriber, fn: () => void): void {
  for (const dep of subscriber.dependencies) {
    dep._subscribers.delete(subscriber)
  }
  subscriber.dependencies.clear()

  const previous = activeSubscriber
  activeSubscriber = subscriber
  try {
    fn()
  } finally {
    activeSubscriber = previous
  }
}
```

Next, we'll use this tracking system to build `computed()`.
