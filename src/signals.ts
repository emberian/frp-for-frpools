// =============================================================================
// FRP for FRPools - Complete Implementation
// A teaching implementation of fine-grained reactivity (signals from scratch)
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

export function createMachine<S extends string>(
  initial: S,
  transitions: { [K in S]?: S[] }
) {
  const state = signal<S>(initial)

  return {
    state: state as ReadonlySignal<S>,

    can(to: S): boolean {
      const allowed = transitions[state.value]
      return allowed?.includes(to) ?? false
    },

    transition(to: S): boolean {
      if (this.can(to)) {
        state.value = to
        return true
      }
      return false
    },

    reset() {
      state.value = initial
    }
  }
}
