# Common Patterns

Now that we have the core primitives, let's build some useful patterns on top of them.

## Untracked Reads

Sometimes you want to read a signal's value without creating a dependency:

```typescript
function untracked<T>(fn: () => T): T {
  const previous = activeSubscriber
  activeSubscriber = null
  try {
    return fn()
  } finally {
    activeSubscriber = previous
  }
}

// Also, signals can have a peek method
interface Signal<T> {
  value: T
  peek(): T  // Read without tracking
}
```

Usage:

```typescript
const count = signal(0)
const name = signal("Alice")

effect(() => {
  // This effect only depends on `name`
  const currentCount = untracked(() => count.value)
  console.log(`${name.value} has count ${currentCount}`)
})

count.value = 5  // Effect doesn't re-run
name.value = "Bob"  // Effect re-runs, sees count = 5
```

Why would you want this?
- Performance: avoid unnecessary re-runs
- Intentional snapshotting: capture a value at a specific moment
- Breaking cycles: when effects read values they also write

## Select (Derived Slice)

Often you want to derive just part of a larger signal:

```typescript
function select<T, U>(
  source: ReadonlySignal<T>,
  selector: (value: T) => U,
  equals: (a: U, b: U) => boolean = Object.is
): ReadonlySignal<U> {
  let previousSelected: U | undefined

  return computed(() => {
    const nextSelected = selector(source.value)

    // Return previous if equal (prevents downstream updates)
    if (previousSelected !== undefined && equals(previousSelected, nextSelected)) {
      return previousSelected
    }

    previousSelected = nextSelected
    return nextSelected
  })
}
```

Usage:

```typescript
const state = signal({
  user: { name: "Alice", age: 30 },
  theme: "dark",
  counter: 0
})

const userName = select(state, s => s.user.name)
const theme = select(state, s => s.theme)

effect(() => {
  console.log("User name:", userName.value)
})

// This doesn't trigger the effect!
state.value = { ...state.value, counter: 1 }

// This does
state.value = { ...state.value, user: { ...state.value.user, name: "Bob" }}
```

## Debounce

Delay updates until input settles:

```typescript
function debounced<T>(
  source: ReadonlySignal<T>,
  ms: number
): ReadonlySignal<T> {
  const result = signal(source.value)
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  effect(() => {
    const value = source.value

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      result.value = value
    }, ms)
  })

  return result
}
```

Usage:

```typescript
const searchInput = signal("")
const debouncedSearch = debounced(searchInput, 300)

effect(() => {
  if (debouncedSearch.value) {
    fetchSearchResults(debouncedSearch.value)
  }
})

// Rapid typing...
searchInput.value = "h"
searchInput.value = "he"
searchInput.value = "hel"
searchInput.value = "hell"
searchInput.value = "hello"
// Only one fetch after 300ms of no changes
```

## Writable / Readonly Split

Expose read-only access while keeping write access private:

```typescript
function writable<T>(initial: T): [ReadonlySignal<T>, (value: T) => void] {
  const sig = signal(initial)

  const readonly: ReadonlySignal<T> = {
    get value() {
      return sig.value
    }
  }

  const setter = (value: T) => {
    sig.value = value
  }

  return [readonly, setter]
}
```

Usage:

```typescript
// In a module
const [count, setCount] = writable(0)

export { count }  // Others can read
// setCount stays private

// In another module
import { count } from './counter'
count.value  // OK
count.value = 5  // Type error! (readonly)
```

## Persisted (localStorage)

Sync a signal with localStorage:

```typescript
function persisted<T>(key: string, initial: T): Signal<T> {
  // Load from storage
  let stored = initial
  try {
    const item = localStorage.getItem(key)
    if (item !== null) {
      stored = JSON.parse(item)
    }
  } catch {
    // Use initial on error
  }

  const sig = signal<T>(stored)

  // Save on change
  effect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(sig.value))
    } catch {
      // Ignore storage errors
    }
  })

  return sig
}
```

Usage:

```typescript
const theme = persisted("theme", "dark")
theme.value = "light"  // Saved to localStorage

// On page reload, theme.value is "light"
```

## Store with Actions

A pattern for grouping related state and mutations:

```typescript
function createStore<T extends object, A>(
  initial: T,
  actionsFactory: (
    get: () => T,
    set: (partial: Partial<T>) => void
  ) => A
) {
  const state = signal<T>(initial)

  const get = () => state.value
  const set = (partial: Partial<T>) => {
    state.value = { ...state.value, ...partial }
  }

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

Usage:

```typescript
const counterStore = createStore(
  { count: 0, step: 1 },
  (get, set) => ({
    increment() {
      set({ count: get().count + get().step })
    },
    decrement() {
      set({ count: get().count - get().step })
    },
    setStep(step: number) {
      set({ step })
    }
  })
)

effect(() => {
  console.log("Count:", counterStore.state.value.count)
})

counterStore.actions.increment()  // Count: 1
counterStore.actions.setStep(5)
counterStore.actions.increment()  // Count: 6
```

## State Machine

A typed state machine using signals:

```typescript
type Transitions<S extends string> = {
  [K in S]?: S[]
}

function createMachine<S extends string>(
  initial: S,
  transitions: Transitions<S>
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
```

Usage:

```typescript
const fetchMachine = createMachine('idle', {
  idle: ['loading'],
  loading: ['success', 'error'],
  success: ['idle', 'loading'],
  error: ['idle', 'loading']
})

effect(() => {
  const state = fetchMachine.state.value
  if (state === 'loading') showSpinner()
  if (state === 'error') showError()
  if (state === 'success') showData()
})

fetchMachine.transition('loading')  // OK
fetchMachine.transition('success')  // OK
fetchMachine.transition('idle')     // OK
fetchMachine.transition('error')    // false - can't go idle -> error
```

## Combining Signals

Create a signal from multiple sources:

```typescript
function combine<T extends Record<string, ReadonlySignal<any>>>(
  signals: T
): ReadonlySignal<{ [K in keyof T]: T[K] extends ReadonlySignal<infer U> ? U : never }> {
  return computed(() => {
    const result: any = {}
    for (const key in signals) {
      result[key] = signals[key].value
    }
    return result
  })
}
```

Usage:

```typescript
const firstName = signal("Alice")
const lastName = signal("Smith")
const age = signal(30)

const person = combine({ firstName, lastName, age })

effect(() => {
  console.log(person.value)
  // { firstName: "Alice", lastName: "Smith", age: 30 }
})
```

## Key Insights

These patterns show that with just `signal`, `computed`, `effect`, and `batch`, you can build:

1. **Access control** (writable/readonly)
2. **Performance optimizations** (untracked, select, debounce)
3. **Persistence** (localStorage sync)
4. **Architectural patterns** (stores, state machines)
5. **Composition** (combining signals)

The primitives are simple, but they compose into powerful abstractions.
