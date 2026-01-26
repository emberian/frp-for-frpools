# The Complete Implementation

Here's the full implementation in one file, ready to use.

## signals.ts

```typescript
// =============================================================================
// Signals from Scratch - Complete Implementation
// A teaching implementation of fine-grained reactivity
// =============================================================================

// -----------------------------------------------------------------------------
// Core Types
// -----------------------------------------------------------------------------

export interface Signal<T> {
  value: T
  peek(): T
}

export interface ReadonlySignal<T> {
  readonly value: T
  peek(): T
}

interface Subscriber {
  execute(): void
  dependencies: Set<SignalNode<any>>
}

interface SignalNode<T> {
  _value: T
  _subscribers: Set<Subscriber>
}

// -----------------------------------------------------------------------------
// Global State
// -----------------------------------------------------------------------------

let activeSubscriber: Subscriber | null = null
let batchDepth = 0
const pendingSubscribers = new Set<Subscriber>()

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

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

function notifySubscribers(subscribers: Set<Subscriber>): void {
  if (batchDepth > 0) {
    subscribers.forEach(sub => pendingSubscribers.add(sub))
  } else {
    const toNotify = [...subscribers]
    toNotify.forEach(sub => sub.execute())
  }
}

// -----------------------------------------------------------------------------
// signal()
// -----------------------------------------------------------------------------

export function signal<T>(initial: T): Signal<T> {
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
      if (!Object.is(node._value, next)) {
        node._value = next
        notifySubscribers(node._subscribers)
      }
    },

    peek(): T {
      return node._value
    }
  }
}

// -----------------------------------------------------------------------------
// computed()
// -----------------------------------------------------------------------------

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  let cachedValue: T
  let isStale = true

  const node: SignalNode<T> = {
    _value: undefined as T,
    _subscribers: new Set()
  }

  const subscriber: Subscriber = {
    execute(): void {
      isStale = true
      notifySubscribers(node._subscribers)
    },
    dependencies: new Set()
  }

  return {
    get value(): T {
      // Track this read
      if (activeSubscriber !== null) {
        node._subscribers.add(activeSubscriber)
        activeSubscriber.dependencies.add(node)
      }

      // Recompute if stale
      if (isStale) {
        runWithTracking(subscriber, () => {
          cachedValue = fn()
        })
        isStale = false
      }

      return cachedValue
    },

    peek(): T {
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

// -----------------------------------------------------------------------------
// effect()
// -----------------------------------------------------------------------------

export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | void

  const subscriber: Subscriber = {
    execute(): void {
      if (cleanup) {
        cleanup()
      }
      runWithTracking(subscriber, () => {
        cleanup = fn()
      })
    },
    dependencies: new Set()
  }

  // Run immediately
  subscriber.execute()

  // Return dispose function
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

// -----------------------------------------------------------------------------
// batch()
// -----------------------------------------------------------------------------

export function batch(fn: () => void): void {
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

// -----------------------------------------------------------------------------
// untracked()
// -----------------------------------------------------------------------------

export function untracked<T>(fn: () => T): T {
  const previous = activeSubscriber
  activeSubscriber = null
  try {
    return fn()
  } finally {
    activeSubscriber = previous
  }
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

export function select<T, U>(
  source: ReadonlySignal<T>,
  selector: (value: T) => U,
  equals: (a: U, b: U) => boolean = Object.is
): ReadonlySignal<U> {
  let previousSelected: U | undefined

  return computed(() => {
    const nextSelected = selector(source.value)
    if (previousSelected !== undefined && equals(previousSelected, nextSelected)) {
      return previousSelected
    }
    previousSelected = nextSelected
    return nextSelected
  })
}

export function writable<T>(initial: T): [ReadonlySignal<T>, (value: T) => void] {
  const sig = signal(initial)
  const readonly: ReadonlySignal<T> = {
    get value() { return sig.value },
    peek() { return sig.peek() }
  }
  return [readonly, (v: T) => { sig.value = v }]
}

export function debounced<T>(source: ReadonlySignal<T>, ms: number): ReadonlySignal<T> {
  const result = signal(source.peek())
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  effect(() => {
    const value = source.value
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      result.value = value
    }, ms)
  })

  return result
}

export function persisted<T>(key: string, initial: T): Signal<T> {
  let stored = initial
  try {
    const item = localStorage.getItem(key)
    if (item !== null) stored = JSON.parse(item)
  } catch { /* use initial */ }

  const sig = signal<T>(stored)

  effect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(sig.value))
    } catch { /* ignore */ }
  })

  return sig
}

export function createStore<T extends object, A>(
  initial: T,
  actionsFactory: (get: () => T, set: (partial: Partial<T>) => void) => A
) {
  const state = signal<T>(initial)
  const get = () => state.value
  const set = (partial: Partial<T>) => { state.value = { ...state.value, ...partial } }
  const actions = actionsFactory(get, set)

  return {
    state: state as ReadonlySignal<T>,
    actions,
    select<U>(selector: (s: T) => U): ReadonlySignal<U> {
      return computed(() => selector(state.value))
    }
  }
}
```

## Usage Example

```typescript
import { signal, computed, effect, batch } from './signals'

// Create reactive state
const count = signal(0)
const doubled = computed(() => count.value * 2)

// React to changes
const dispose = effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`)
})

// Make changes
count.value = 1  // Logs: Count: 1, Doubled: 2
count.value = 2  // Logs: Count: 2, Doubled: 4

// Batch multiple changes
batch(() => {
  count.value = 3
  count.value = 4
  count.value = 5
})
// Logs once: Count: 5, Doubled: 10

// Clean up
dispose()
count.value = 6  // No log
```

## Line Count

```
Core (signal, computed, effect, batch, untracked): ~120 lines
Utilities (select, writable, debounced, etc.):     ~50 lines
Total:                                             ~170 lines
```

That's it. The entire reactive system in under 200 lines of TypeScript.
