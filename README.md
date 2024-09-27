**Reatom is the ultimate logic and state manager for small widgets and huge SPAs.**
## Hello World
## Key features

- **simple** and powerful abstractions.
  <small>There are only three main primitives: `ctx`, `atom`, `action`. All other features and packages work on top of that.</small>
- **immutable** and reliable.
  <small>All pure computations processed with atomicity guarantees.</small>
- **explicit reactivity** without proxies.
  <small>We use the [atomization](https://www.reatom.dev/recipes/atomization) pattern to achieve [maximum](#how-performant-reatom-is) performance </small>
- perfect **effects management**.
  <small>Advanced [async package](https://www.reatom.dev/package/async) allows you to describe complex async flows, including caching, retrying and automatic cancellation with native `await` and `AbortController`.</small>
- nice **debugging** experience.
  <small>Each atom and action updates the ctx's [immutable cause (call) stack](https://www.reatom.dev/getting-started/debugging/). It helps a&nbsp;lot in debugging complex async flows. We also provide a [logger package](https://www.reatom.dev/package/logger) for that.</small>
- implicit **DI**.
  <small>An isolation layer is essential to ensure <strong>complete safety</strong> when running tests and using SSR. The `ctx` is such an isolation layer! We offer a [testing package](https://www.reatom.dev/package/testing) with various helpers for mocking.</small>
- actor-like **lifecycle hooks**
  <small>Learn more about [self-sufficient models](https://www.reatom.dev/handbook#lifecycle) to achieve true modularity.</small>
- **smallest bundle** size: [2 KB](https://bundlejs.com/?q=%40reatom%2Fcore) gzipped
  <small>With the power of base primitives, the whole ecosystem with <strong>A&nbsp;LOT</strong> of enterprise-level helpers takes only [~15KB](https://bundlejs.com/?q=%40reatom%2Fframework%2C%40reatom%2Fnpm-react%2C%40reatom%2Fpersist-web-storage%2C%40reatom%2Fundo%2C%40reatom%2Fform-web&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22use-sync-external-store%22%5D%7D%7D). Insane!</small>
- **the best TypeScript** experience
  <small>[Type inference](https://www.reatom.dev/recipes/typescript/)  is one of the main priorities for Reatom.</small>

[The core package](https://www.reatom.dev/core) includes most of these features and, due to its minimal overhead, can be used in any project, from small libraries to large applications.

Adopting our well-designed helper tools allows you to efficiently handle complex tasks with minimal code.
We aim to build a stable and balanced ecosystem that enhances DX and guarantees predictable maintenance for the long haul.

## Simple example

Let's define input state and compute a greeting from it.

### Install

```sh
npm i @reatom/core
```

[vanilla codesandbox](https://codesandbox.io/s/reatom-vanila-hello-world-6oo36v?file=/src/index.ts)

[react codesandbox](https://codesandbox.io/s/reatom-react-hello-world-fgt6jn?file=/src/model.ts)

### Simple example model

The concept is straightforward: to make a reactive variable, wrap an initial state with `atom`.
After that, you can change the state by calling the atom as a function.
Need reactive computable values? Use `atom` as well!

Use `actions` to encapsulate logic and batch atom updates.

Atom state changes should be immutable.
All side effects should be placed in `ctx.schedule`

```ts
import { action, atom } from '@reatom/core'

const initState = localStorage.getItem('name') ?? ''
export const inputAtom = atom(initState)

export const greetingAtom = atom((ctx) => {
  // `spy` dynamically reads the atom and subscribes to it
  const input = ctx.spy(inputAtom)
  return input ? `Hello, ${input}!` : ''
})

export const onSubmit = action((ctx) => {
  const input = ctx.get(inputAtom)
  ctx.schedule(() => {
    localStorage.setItem('name', input)
  })
})
```

### Simple example context

What is `ctx`?
It is Reatom's most powerful feature.
As the first argument in all Reatom functions, it provides enterprise-level capabilities with just three extra characters.

The context should be set up once for the entire application.
However, it can be set up multiple times if isolation is needed, such as in server-side rendering (SSR) or testing.

```ts
import { createCtx } from '@reatom/core'

const ctx = createCtx()
```

### Simple example view

```ts
import { inputAtom, greetingAtom, onSubmit } from './model'

ctx.subscribe(greetingAtom, (greeting) => {
  document.getElementById('greeting')!.innerText = greeting
})

document.getElementById('name').addEventListener('input', (event) => {
  inputAtom(ctx, event.currentTarget.value)
})
document.getElementById('save').addEventListener('click', () => {
  onSubmit(ctx)
})
```

Check out [@reatom/core docs](https://www.reatom.dev/core) for a detailed explanation of fundamental principles and features.

Do you use React.js? Check out [npm-react](https://www.reatom.dev/package/npm-react) package!

## Advanced example

The core package is highly effective on its own and can be used as a simple, feature-rich solution for state and logic management.
Continue reading this guide if you want to tackle more complex system logic with advanced libraries for further optimizations and UX improvements.

This example illustrates a real-world scenario that highlights the complexity of interactive UIs.
It features a simple search input with debouncing and autocomplete, using the [GitHub API](https://docs.github.com/en/rest/reference/search#search-issues-and-pull-requests) to fetch issues based on a query.

The GitHub API has [rate limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting), so we must minimize the number of requests and retry them if we reach the limit.
Additionally, let's cancel all previous requests if a new one is made.
It helps to avoid race conditions, where an earlier request resolves after a later one.

### Install framework

```sh
npm i @reatom/framework @reatom/npm-react
```

[codesandbox](https://codesandbox.io/s/reatom-react-search-component-l4pe8q?file=/src/App.tsx)

### Advanced example description

In this example, we will use the [@reatom/core](https://www.reatom.dev/core), [@reatom/async](https://www.reatom.dev/package/async) and [@reatom/hooks](https://www.reatom.dev/package/hooks) from the meta [@reatom/framework](https://www.reatom.dev/package/framework) package.
It simplifies imports and dependencies management.

`reatomAsync` is a simple decorator that wraps your async function and adds extra actions and atoms to track the async execution statuses.

`withDataAtom` adds the `dataAtom` property, which holds the latest result of the effect

`withCache` adds a middleware function that prevents unnecessary calls by caching results based on the identity of the passed arguments (a classic cache)

`withAbort` defines a concurrent request abort strategy by using `ctx.controller` ([AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)) from `reatomAsync.`

> Our solution for handling rate limits is based on `withRetry` and `onReject`

`sleep` is a built-in `debounce` alternative from `lodash`

> Take a look at a tiny [utils package](https://www.reatom.dev/package/utils). It contains the most popular helpers you might need.

`onUpdate` is a [hook](https://www.reatom.dev/package/hooks) that connects to the atom and calls the passed callback on every atom update.

### Advanced example model

```ts
import { atom, reatomAsync, withAbort, withDataAtom, withRetry, onUpdate, sleep, withCache } from "@reatom/framework"; // prettier-ignore
import * as api from './api'

const searchAtom = atom('', 'searchAtom')

const fetchIssues = reatomAsync(async (ctx, query: string) => {
  await sleep(350) // debounce
  const { items } = await api.fetchIssues(query, ctx.controller)
  return items
}, 'fetchIssues').pipe(
  withAbort({ strategy: 'last-in-win' }),
  withDataAtom([]),
  withCache({ length: 50, swr: false, paramsLength: 1 }),
  withRetry({
    onReject(ctx, error: any, retries) {
      // return delay in ms or -1 to prevent retries
      return error?.message.includes('rate limit')
        ? 100 * Math.min(500, retries ** 2)
        : -1
    },
  }),
)

// run fetchIssues on every searchAtom update
onUpdate(searchAtom, fetchIssues)
```

### Advanced example view

```tsx
import { useAtom } from '@reatom/npm-react'

export const Search = () => {
  const [search, setSearch] = useAtom(searchAtom)
  const [issues] = useAtom(fetchIssues.dataAtom)
  // you could pass a callback to `useAtom` to create a computed atom
  const [isLoading] = useAtom(
    (ctx) =>
      // even if there are no pending requests, we need to wait for retries
      // let do not show the limit error to make him think that everything is fine for a better UX
      ctx.spy(fetchIssues.pendingAtom) + ctx.spy(fetchIssues.retriesAtom) > 0,
  )

  return (
    <main>
      <input
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        placeholder="Search"
      />
      {isLoading && 'Loading...'}
      <ul>
        {issues.map(({ title }, i) => (
          <li key={i}>{title}</li>
        ))}
      </ul>
    </main>
  )
}
```

The logic definition consists of only about 15 lines of code and is entirely independent from the the view part (React in our case).  It makes it easy to test.
Imagine the line count in other libraries!
The most impressive part is that the overhead is [less than 4KB (gzip)](https://bundlejs.com/?q=%28import%29%40reatom%2Fframework%2C%28import%29%40reatom%2Fnpm-react&treeshake=%5B%7B%0A++atom%2CcreateCtx%2ConUpdate%2CreatomAsync%2Csleep%2CwithAbort%2CwithDataAtom%2CwithRetry%2C%7D%5D%2C%5B%7B+useAtom+%7D%5D&share=MYewdgzgLgBBCmBDATsAFgQSiAtjAvDItjgBQBE5ANDOQiulruQJQDcAUKJLAGbxR0ASQgQArvAgEYyJCQwQAnmGClESlTFLAoADxoBHCckUAuOFGQBLMAHMWBAHwwA3hxhEA7oiuwIAG3h4AAdSACYAVgAGdhgAejiYABN4ACMQMRV4dxhuaFcYX3gcKQBfaURvXyJgqwA6fkE0EXFJUiN4ExodXTruSxB-QOR2HNkoMWQwQqhiiE5SmnJG4VEJCFY62uD4UhzPXzQAEWJEJjIAbQBdFip9w4x05ChSFwtkYnhbM1p-dSgALQ2AEHMDkGClW73KBoABKAhMrxyHnA8IAVvAdNo9DROsgQMhzIgwIoaONrJIHG4PDT4olxpNpik-opCtMSjACTAAQBGGDYGDBWQAN3gYFg5KskmRNIZUxgeIJAH46jhJBBELZ4HUbMB-GIUhAKB9ZjB-FYcL5WDLaUqYDyolEYAAqGAAWWIaFVNlI0SiZIRUqkztdYRYNpp5l5nFpixykLuowSMkyMBWzTWkk503gopMcCQqEwJBgYmCSU%2BHHAAFVy59SPQi%2BcaOmWutRlxZJ8AMJ6UijMQIc6kVuZiB1CtQM4kFhAA&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22use-sync-external-store%22%5D%7D%7D). Amazing, right?
On top of that, you’re not limited to network cache. Reatom is powerful and expressive enough to manage any state.

Please take a look at the [tutorial](https://www.reatom.dev/getting-started/setup/) to get the most out of Reatom and its ecosystem.
If you're looking for a lightweight solution, check out the [core package documentation](https://www.reatom.dev/core).
Additionally, we offer a [testing package](https://www.reatom.dev/package/testing) for your convenience!

## Roadmap

- Finish [forms package](https://www.reatom.dev/package/form).
- Finish ~~[persist](https://www.reatom.dev/package/persist)~~, improve [url](https://www.reatom.dev/package/url/) package.
- Add adapters for the most popular ui frameworks: ~~[react](https://www.reatom.dev/package/npm-react)~~, angular, vue, ~~[svelte](https://www.reatom.dev/package/npm-svelte)~~, ~~[solid](https://www.reatom.dev/package/npm-solid-js/)~~.
- Port some components logic from reakit.io to make it fast, light and portable.
- Add the ability to make async transactions and elaborate optimistic-ui patterns.

## FAQ

### Why not X?

**Redux** is fantastic, and Reatom draws significant inspiration from it.
The principles of immutability, separating computations, and managing effects are excellent architectural design principles.
However, additional capabilities are often needed when building large applications or describing small features.
Some limitations are challenging to address, such as [batching](https://www.reatom.dev/core#ctxget-batch-api), [O(n) complexity](https://www.reatom.dev/recipes/atomization/#reducing-computational-complexity), and non-inspectable selectors that break [atomicity](https://www.reatom.dev/handbook#data-consistency).
Others are just [difficult to improve](https://github.com/reduxjs/reselect/discussions/491).
And boilerplate, of course. [The difference is significant](https://github.com/artalar/RTK-entities-basic-example/pull/1/files#diff-43162f68100a9b5eb2e58684c7b9a5dc7b004ba28fd8a4eb6461402ec3a3a6c6).
Reatom resolves these problems while offering many more features within a similar bundle size.

**MobX** adds a large bundle size, making it less suitable for small widgets, whereas Reatom is universal.
Additionally, MobX uses mutability and implicit reactivity, which can be helpful for simple scenarios but might be unclear and difficult to debug in more complex cases.
MobX lacks distinct concepts like `actions,` `events,` or `effects` to describe dependent effect sequences in an FRP style.
Furthermore, as highlighted in [this example](https://github.com/artalar/state-management-specification/blob/master/src/index.test.js#L60), it does not support atomicity.

**Effector** is quite opinionated.
It lacks first-class support for **lazy** reactive computations, and all connections are always [hot](https://luukgruijs.medium.com/understanding-hot-vs-cold-observables-62d04cf92e03).
While this can be more predictable, it is certainly not optimal.
Effector's hot connections make it unfriendly for factory creation, which prevents the use of [atomization](https://www.reatom.dev/recipes/atomization/) patterns necessary for efficient immutability handling.
Additionally, Effector's [bundle size is 2-3 times more significant](https://bundlejs.com/?q=effector&treeshake=%5B%7BcraeteStore%2CcreateEvent%2Ccombine%7D%5D) with [worse performance](https://github.com/artalar/reactive-computed-bench).

[Zustand](https://github.com/pmndrs/zustand), [nanostores](https://github.com/nanostores/nanostores), [xstate](https://xstate.js.org), and [many other](https://gist.github.com/artalar/e5e8a7274dfdfbe9d36c9e5ec22fc650) state managers do not offer the same exceptional combination of type  inference, features, bundle size, and performance that Reatom provides.

### Why immutability?

Immutable data is more predictable and easier to debug than mutable states and their wrappers.
Reatom is specifically designed to focus on [simple debugging of asynchronous chains](https://www.reatom.dev/getting-started/debugging/) and offers [patterns](https://www.reatom.dev/recipes/atomization/) to achieve [excellent performance](#how-performant-reatom-is).

### What LTS policy is used and what about bus factor?

Reatom is built for the long haul.
We dropped our first Long Term Support (LTS) version (v1) in [December 2019](https://github.com/artalar/reatom/releases/tag/v1.0).
In 2022, we introduced breaking changes with a new LTS (v3) version.
Don't worry — we've got you covered with this [Migration guide](https://www.reatom.dev/compat/core-v1#migration-guide).
We're not stopping our three years of solid support — it's ongoing with our [adapter package](https://www.reatom.dev/compat/core-v1).
We hope this proves how committed we are to our users.

Right now, our dev team consists of four people: [@artalar](https://github.com/artalar) and [@krulod](https://github.com/krulod) handle the core features, while [@BANOnotIT](https://github.com/BANOnotIT) and [@Akiyamka](https://github.com/Akiyamka) take care of documentation and issue management.
We also have [many contributors](https://github.com/artalar/reatom/graphs/contributors) working on different packages.

### What build target and browser support?

All our packages are set up using [Browserslist's "last 1 year" query](https://browsersl.ist/#q=last+1+year).
To support older environments, you must handle the transpilation by yourself.
Our builds come in two output formats: CJS (`exports.require`, `main`) and ESM (`exports.default`, `module`).
For more details, check out the `package.json` file.

### How performant Reatom is?

Check out this [benchmark](https://github.com/artalar/reactive-computed-bench) for complex computations across different state managers.
Remember that Reatom uses immutable data structures, operates in a separate context (DI-like), and maintains [atomicity](https://www.reatom.dev/handbook#data-consistency).
That means the Reatom test covers more features than other state manager tests.
Still, Reatom performs faster than MobX for mid-range numbers, which is pretty impressive.

Also, remember to check out our [atomization guide](https://www.reatom.dev/recipes/atomization).

### Limitations

No software is perfect, and Reatom is no exception. Here are some limitations you should be aware of:
- **Immutable Data**: While immutable data structures are great, they can impact performance. In critical situations, think carefully about your data structures. The good news is you [don't have to use normalization](https://www.reatom.dev/recipes/atomization).
- **Laziness**: Laziness is less obvious sometimes and might lead to missed updates. However, debugging a missing update is straightforward and often easier than dealing with hot observables' memory leaks and performance issues. We also have [hooks](https://www.reatom.dev/package/hooks) for hot linking.
- **Error Handling**: Currently, you can't subscribe to errors from any dependency, but we're working on it. In [reatomAsync](https://www.reatom.dev/package/async), passed effects are wrapped in an error handler, allowing you to manage errors, but you need to wrap them explicitly.
- **Asynchronous Transactions**: Asynchronous transactions are not supported yet, but they're in the works. This feature will simplify building optimistic UIs and improve UX significantly.
- **Ecosystem and Utilities**: While we have many utilities and a growing ecosystem, our goal is to provide well-designed logic primitives. Reatom sits between a library and a framework, embracing procedural programming with minimal extra API and semantic overhead. Our defaults, such as immutability, laziness, transactions, and the separation of pure computations and effects, are designed to help you write better code.

### Media

- [en twitter](https://twitter.com/ReatomJS)
- [en discord](https://discord.gg/EPAKK5SNFh)
- [en github discussion](https://github.com/artalar/reatom/discussions)
- [ru telegram](https://t.me/reatom_ru)
- [ru youtube](https://www.youtube.com/playlist?list=PLXObawgXpIfxERCN8Lqd89wdsXeUHm9XU)

### How to support the project?

https://www.patreon.com/artalar_dev

## Zen

- **Good primitive is more than a framework**
- Composition beats configuration
<!--
- General context explicit enough to be hidden
  - A feature semantic should be visible

-->

## Credits

Software development in the 2020s is tough, and we really appreciate all the [contributors](https://github.com/artalar/reatom/graphs/contributors) and free software maintainers who make our lives easier.

Special thanks to:

- [React](https://reactjs.org), [Redux](https://redux.js.org), [Effector](https://effector.dev/) and [$mol](https://github.com/hyoo-ru/mam_mol) for inspiration
- [microbundle](https://github.com/developit/microbundle) for handling all bundling complexity
- [Quokka](https://wallabyjs.com/oss/) and [uvu](https://github.com/lukeed/uvu) for incredible testing experience
- [TURBO](https://turbo.build) for simple monorepo management
- [Astro](https://astro.build) for best in class combine of performance and developer experience
- [Vercel](https://vercel.com/) for free hosting and perfect CI/CD (preview branches are <3)
