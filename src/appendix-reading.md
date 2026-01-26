# Further Reading

## The Original Papers

**Functional Reactive Programming (FRP)** was introduced by Conal Elliott and Paul Hudak in 1997:

- [Functional Reactive Animation](http://conal.net/papers/icfp97/) (1997) - The original paper
- [Push-Pull Functional Reactive Programming](http://conal.net/papers/push-pull-frp/) (2009) - Conal Elliott's refinement

These are dense academic papers, but they contain the foundational ideas.

## Modern Implementations

### Preact Signals

The implementation that inspired much of this book:

- [Preact Signals](https://preactjs.com/guide/v10/signals/) - Official docs
- [signals-core source](https://github.com/preactjs/signals/tree/main/packages/core) - ~1000 lines, well-commented

### Solid.js

Solid's reactivity is similar but uses a different internal model:

- [Solid Reactivity](https://www.solidjs.com/guides/reactivity) - Official docs
- [Ryan Carniato's blog](https://dev.to/ryansolid) - Deep dives into reactive design

### Vue Reactivity

Vue's `@vue/reactivity` package can be used standalone:

- [Vue Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)
- [reactivity source](https://github.com/vuejs/core/tree/main/packages/reactivity)

### MobX

An older but influential implementation:

- [MobX Concepts](https://mobx.js.org/the-gist-of-mobx.html)

## Deep Dives

### On Glitch-Free Propagation

- [A Survey on Reactive Programming](https://www.researchgate.net/publication/233755674_A_Survey_on_Reactive_Programming) - Academic survey
- [Primitives for Reactive Programming](https://www.youtube.com/watch?v=4CT-E6y2xX4) - Ryan Carniato talk

### On the Signal Graph

- [Building a Reactive Library from Scratch](https://dev.to/ryansolid/building-a-reactive-library-from-scratch-1i0p) - Ryan Carniato's walkthrough
- [Fine-Grained Reactivity](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph) - Performance considerations

## Related Concepts

### Observables (RxJS)

Signals are not Observables. Key differences:

- Signals are pull-based cells with a current value; Observables are push-based streams of events
- Observables are often used for async data, but they can be synchronous too
- Signals auto-track dependencies; Observables use explicit operators

For comparison:

- [RxJS Introduction](https://rxjs.dev/guide/overview)
- [Signals vs Observables](https://www.builder.io/blog/signals-vs-observables)

### Incremental Computation

Academic work on efficiently updating computations:

- [Adapton](https://github.com/cuplv/adapton.rust) - Demand-driven incremental computation
- [Self-Adjusting Computation](https://www.cs.cmu.edu/~rwh/papers/sac/toplas07.pdf)

## Historical Context

The reactive model has appeared in many forms:

- **Spreadsheets** (1979) - VisiCalc, cells that update when dependencies change
- **Functional Reactive Programming** (1997) - Elliott & Hudak
- **Reactive Extensions (Rx)** (2009) - Microsoft's Observable pattern
- **Knockout.js** (2010) - Early JS reactivity with observables
- **Meteor Tracker** (2012) - Auto-tracking in JavaScript
- **MobX** (2015) - Transparent reactive state
- **Vue 3 Reactivity** (2020) - Proxy-based reactivity
- **Solid.js** (2021) - Compile-time + runtime reactivity
- **Preact Signals** (2022) - Minimal signals for any framework

## Books

- *Reactive Design Patterns* by Roland Kuhn - More about actor systems than FRP, but good background
- *Grokking Simplicity* by Eric Normand - Functional programming for practitioners

## Videos

- [Reactivity with Signals](https://www.youtube.com/watch?v=fD7QHNqQkFM) - Fireship
- [Fine-Grained Reactivity](https://www.youtube.com/watch?v=7PqCFqVJLhY) - SolidJS
- [Signals: Fine-grained Reactivity](https://www.youtube.com/watch?v=dJQHgCQwQgQ) - Theo explains

## Practice Projects

To solidify your understanding, try:

1. **Build a spreadsheet** - Cells are signals, formulas are computeds
2. **Reactive form validation** - Each field is a signal, validity is computed
3. **Undo/redo system** - Capture signal history in a stack
4. **Server state sync** - Signals that sync with a WebSocket
5. **Reactive DOM library** - Mini-framework using your signals implementation

## Community

- [Solid Discord](https://discord.com/invite/solidjs) - Active reactivity discussions
- [Preact Discord](https://discord.gg/preact)
- [/r/reactjs](https://reddit.com/r/reactjs) - Occasionally discusses signals

---

> "The best way to understand something is to build it yourself."
>
> You've now built a signals library from scratch. You understand the core ideas that power modern reactive frameworks. Go forth and build.
