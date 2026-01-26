# FRP for FRPools

A literate program for understanding functional reactive programming.

*(Signals from Scratch)*

## What You'll Build

By the end of this book, you'll have built a complete signals library from scratch—about 170 lines of TypeScript that provide:

- **`signal(value)`** — A reactive container that notifies dependents when it changes
- **`computed(fn)`** — A derived value that automatically recalculates
- **`effect(fn)`** — A side effect that re-runs when its dependencies change
- **`batch(fn)`** — A way to group multiple updates into one notification

This is the same mental model used by Preact Signals, Solid.js, Vue's reactivity system, and many others. Once you understand these ~170 lines, you understand all of them.

## Why Build It Yourself?

There's a particular kind of understanding that only comes from building something yourself. You can *use* a GPS without knowing how satellites work, but if you want to *reason* about its behavior—why it's slow in tunnels, why it drifts near tall buildings—you need the underlying model.

The same applies here. Signals libraries are small (Preact's signals-core is ~1kloc), but they encode subtle ideas:

1. **How does `computed()` know what it depends on?** (Nobody told it!)
2. **Why doesn't changing a signal inside a loop cause infinite re-renders?**
3. **What happens if a computed value reads another computed value?**

These questions have elegant answers. This book will show you.

## Prerequisites

- Comfortable reading TypeScript
- Basic understanding of closures and higher-order functions
- Curiosity about how things work

## How to Read This Book

Each chapter introduces one concept and implements it. Code builds on previous chapters—by the end, you'll have a working system.

The code is intentionally simple. Production libraries add optimizations (weak references, lazy evaluation, memory pooling) that obscure the core ideas. We skip those. Clarity over performance.

Let's begin.
