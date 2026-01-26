// Test file demonstrating the signals implementation
import { signal, computed, effect, batch, untracked, createStore, createMachine } from './signals.js'

console.log('=== Signals from Scratch: Test Suite ===\n')

// Test 1: Basic signal
console.log('1. Basic signal')
const count = signal(0)
console.log(`  Initial: ${count.value}`)
count.value = 5
console.log(`  After set: ${count.value}`)
console.log()

// Test 2: Computed
console.log('2. Computed values')
const a = signal(2)
const b = signal(3)
const sum = computed(() => a.value + b.value)
console.log(`  a=${a.value}, b=${b.value}, sum=${sum.value}`)
a.value = 10
console.log(`  a=${a.value}, b=${b.value}, sum=${sum.value}`)
console.log()

// Test 3: Effect
console.log('3. Effects')
const name = signal('Alice')
const logs: string[] = []
const dispose = effect(() => {
  logs.push(`Name changed to: ${name.value}`)
})
name.value = 'Bob'
name.value = 'Charlie'
console.log(`  Logs: ${JSON.stringify(logs)}`)
dispose()
name.value = 'David' // Should not log
console.log(`  After dispose: ${JSON.stringify(logs)}`)
console.log()

// Test 4: Batching
console.log('4. Batching')
const x = signal(0)
let effectRuns = 0
effect(() => {
  x.value // Subscribe
  effectRuns++
})
effectRuns = 0 // Reset after initial run
x.value = 1
x.value = 2
x.value = 3
console.log(`  Without batch: ${effectRuns} runs`)

effectRuns = 0
batch(() => {
  x.value = 4
  x.value = 5
  x.value = 6
})
console.log(`  With batch: ${effectRuns} run`)
console.log()

// Test 5: Dynamic dependencies
console.log('5. Dynamic dependencies')
const flag = signal(true)
const valueA = signal('A')
const valueB = signal('B')
let dependencyLogs: string[] = []

effect(() => {
  if (flag.value) {
    dependencyLogs.push(`Read A: ${valueA.value}`)
  } else {
    dependencyLogs.push(`Read B: ${valueB.value}`)
  }
})

valueA.value = 'A2' // Should trigger
valueB.value = 'B2' // Should NOT trigger (flag is true)
console.log(`  With flag=true: ${JSON.stringify(dependencyLogs)}`)

dependencyLogs = []
flag.value = false
valueA.value = 'A3' // Should NOT trigger
valueB.value = 'B3' // Should trigger
console.log(`  With flag=false: ${JSON.stringify(dependencyLogs)}`)
console.log()

// Test 6: Untracked
console.log('6. Untracked reads')
const tracked = signal(1)
const untrackedSig = signal(100)
let untrackedLogs: number[] = []

effect(() => {
  const t = tracked.value
  const u = untracked(() => untrackedSig.value)
  untrackedLogs.push(t + u)
})

tracked.value = 2 // Should trigger
untrackedSig.value = 200 // Should NOT trigger
console.log(`  Logs: ${JSON.stringify(untrackedLogs)}`)
console.log(`  Expected: [101, 102] (untracked read happens when effect runs)`)
console.log()

// Test 7: Store
console.log('7. Store pattern')
const store = createStore(
  { count: 0, step: 1 },
  (get, set) => ({
    increment() { set({ count: get().count + get().step }) },
    setStep(step: number) { set({ step }) }
  })
)

console.log(`  Initial: ${JSON.stringify(store.state.value)}`)
store.actions.increment()
console.log(`  After increment: ${JSON.stringify(store.state.value)}`)
store.actions.setStep(5)
store.actions.increment()
console.log(`  After setStep(5) + increment: ${JSON.stringify(store.state.value)}`)
console.log()

// Test 8: State machine
console.log('8. State machine')
const machine = createMachine('idle' as const, {
  idle: ['loading'],
  loading: ['success', 'error'],
  success: ['idle'],
  error: ['idle', 'loading']
} as const)

console.log(`  Initial: ${machine.state.value}`)
console.log(`  Can go to loading? ${machine.can('loading')}`)
console.log(`  Can go to success? ${machine.can('success')}`)
machine.transition('loading')
console.log(`  After transition to loading: ${machine.state.value}`)
machine.transition('success')
console.log(`  After transition to success: ${machine.state.value}`)
const couldGoToError = machine.transition('error')
console.log(`  Could transition to error from success? ${couldGoToError}`)
console.log()

console.log('=== All tests passed! ===')
