---
title: Custom operator
description: How to create custom operators to improve your code and modularize it
---

All atoms and actions by default include the [pipe operator](/core#atompipe-api) for easy extending and composing.
You can create your own operators to enhance your code and make it more modular.

We assume that you've already read the [core](/core) docs.

## Prefix and types

Operator for the pipe function should starts with a verb.

```ts
import { Atom, CtxSpy } from '@reatom/core'

declare function mapState<T, Res>(
  mapper: Fn<[CtxSpy, T, undefined | T], Res>,
  name?: string,
): (anAtom: Atom<T>) => Atom<Res>
```

> [Real `mapState`](/package/lens#mapstate)

If an operator doesn't create a new atom and instead mutates the passed one, you should use the `with` prefix.

```ts
import { Atom, AtomState } from '@reatom/core'

declare function withStateHistory<T extends Atom>(
  length: string,
): (anAtom: T) => T & {
  stateHistoryAtom: Atom<AtomState<T>>
}
```

We use `T extends Atom` instead of the simpler `<T>(length: string): (anAtom: Atom<T>) => Atom<T> & {...}` to preserve all additional properties added by previous operators.

> [Real `historyAtom`](/package/undo)

## Example

[![codesandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/sandbox/reatom-custom-operator-example-mym3vo)

```ts
import { action, atom, Atom } from '@reatom/core'

// operator accepts an options by a first argument
// and returns function witch accepts target atom
export const delay =
  <T,>(ms: number) =>
  (anAtom: Atom<T>) => {
    // to improve debugability compute name of the new atom
    const name = `${anAtom.__reatom.name}.delay`
    // hide unnecessary meta by `_` prefix in name
    const update = action<T>(`${name}._update`)
    const updateTimeout = atom(-1, `${name}._updateTimeout`)

    return atom((ctx, prevState?: T) => {
      const state = ctx.spy(anAtom)
      // more about action spying: https://www.reatom.dev/core#action-api
      const updates = ctx.spy(update)

      // first call, no need to delay
      if (prevState === undefined) return state

      // update from the schedule below
      if (updates.length) return updates.at(-1)!.payload

      // do not forget to schedule all side effects!
      ctx.schedule(() => {
        clearTimeout(ctx.get(updateTimeout))
        const timeout = setTimeout(() => update(ctx, state), ms)
        updateTimeout(ctx, timeout)
      })

      return prevState
    }, name)
  }
```

> [Real `debounce`](https://www.reatom.dev/package/lens#debounce)
