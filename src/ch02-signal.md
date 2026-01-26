# Reactive Values: signal()

Let's build our first primitive: a reactive value that knows when it's being read.

## The Interface

A signal is simple:

```typescript
interface Signal<T> {
  value: T  // Get or set the current value
}
```

But behind `value`, something interesting happens:
- **On read**: Record that "something is currently tracking me"
- **On write**: Notify all things that tracked me

## The Tracking Context

Before we implement `signal()`, we need a way for signals to know *who* is reading them.

Imagine you're a signal. Someone accesses your `.value`. How do you know if it's:
- A `computed()` that needs to re-run when you change?
- A `console.log()` that just wants your value once?

The answer: a global "context" that says "right now, this subscriber is listening."

```typescript
// The current subscriber that should be notified of reads
let currentSubscriber: (() => void) | null = null

// Temporarily set a subscriber during a function call
function track<T>(subscriber: () => void, fn: () => T): T {
  const previous = currentSubscriber
  currentSubscriber = subscriber
  try {
    return fn()
  } finally {
    currentSubscriber = previous
  }
}
```

This is a *dynamic scoping* pattern. While `fn()` executes, any signal reads will see `currentSubscriber`. After `fn()` returns (even if it throws), we restore the previous context.

## Implementing signal()

Now we can build `signal()`:

```typescript
function signal<T>(initialValue: T): Signal<T> {
  let value = initialValue
  const subscribers = new Set<() => void>()

  return {
    get value(): T {
      // If someone is tracking, remember them
      if (currentSubscriber !== null) {
        subscribers.add(currentSubscriber)
      }
      return value
    },

    set value(newValue: T) {
      if (value !== newValue) {
        value = newValue
        // Notify everyone who's tracking us
        subscribers.forEach(fn => fn())
      }
    }
  }
}
```

That's it. About 20 lines.

Let's trace through what happens:

```typescript
const count = signal(0)

// Outside any tracking context:
console.log(count.value)
// currentSubscriber is null, so nothing is recorded
// Just returns 0

// Later, with tracking:
track(() => console.log("count changed!"), () => {
  console.log(count.value)
  //          ↑ currentSubscriber is the "count changed!" function
  //            so it gets added to count's subscribers
})

count.value = 5
// Notifies all subscribers, logging "count changed!"
```

## Why This Design?

You might wonder: why use a getter/setter instead of `get()` and `set()` methods?

```typescript
// We could have done this:
const count = signal(0)
count.get()
count.set(5)

// Instead of this:
count.value
count.value = 5
```

The getter/setter design has two advantages:

1. **Familiarity**: It looks like a normal variable with `.value`
2. **Refactoring**: You can often wrap an existing value in `signal()` with minimal code changes

Both designs work. This is a stylistic choice.

## Testing Our Implementation

Let's verify it works:

```typescript
const name = signal("Alice")
const messages: string[] = []

// Manual tracking (computed() will do this automatically)
track(
  () => messages.push(`Name is now: ${name.value}`),
  () => {
    messages.push(`Initial: ${name.value}`)
  }
)

name.value = "Bob"
name.value = "Charlie"

console.log(messages)
// ["Initial: Alice", "Name is now: Bob", "Name is now: Charlie"]
```

## A Subtle Limitation

Our implementation works, but it hides a limitation: tracking is **one-shot**. We record dependencies during the `track()` call, but when the subscriber runs later, it doesn't re-run inside a tracking context. That means dependencies can't change.

```typescript
const showDetails = signal(true)
const name = signal("Alice")
const age = signal(30)

const render = () => {
  if (showDetails.value) {
    console.log(`${name.value} is ${age.value}`)
  } else {
    console.log("Details hidden")
  }
}

// Track once
track(render, render)

showDetails.value = false  // render runs, but doesn't re-track
name.value = "Bob"         // Still triggers render (stale dependency!)
```

The fix is to re-run subscribers **with tracking**, and to clear old dependencies before each run. We'll build that mechanism in the next chapter.

## The Code So Far

```typescript
let currentSubscriber: (() => void) | null = null

function track<T>(subscriber: () => void, fn: () => T): T {
  const previous = currentSubscriber
  currentSubscriber = subscriber
  try {
    return fn()
  } finally {
    currentSubscriber = previous
  }
}

interface Signal<T> {
  value: T
}

function signal<T>(initialValue: T): Signal<T> {
  let value = initialValue
  const subscribers = new Set<() => void>()

  return {
    get value(): T {
      if (currentSubscriber !== null) {
        subscribers.add(currentSubscriber)
      }
      return value
    },

    set value(newValue: T) {
      if (value !== newValue) {
        value = newValue
        subscribers.forEach(fn => fn())
      }
    }
  }
}
```

## Key Insights

1. **Signals are containers** that intercept reads and writes
2. **Dynamic scoping** (via `currentSubscriber`) lets signals discover who's reading them
3. **The subscriber set** remembers who to notify on change

Next, we'll look more closely at the tracking mechanism and how to handle stale dependencies.
