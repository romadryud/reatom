import {
  Action,
  ActionType,
  addToSetsMap,
  Atom,
  Cache,
  callSafety,
  createTransaction,
  delFromSetsMap,
  Fn,
  invalid,
  isAction,
  isAtom,
  isFunction,
  noop,
  Rec,
  Store,
  TransactionResult,
  Unsubscribe,
} from './internal'

type DepsDiff = [depsOld: Cache['deps'], depsNew: Cache['deps']]

function isTypesChange(...diff: DepsDiff): boolean {
  const stack: Array<DepsDiff> = []

  for (; diff !== undefined; diff = stack.pop()!) {
    const { 0: depsOld, 1: depsNew } = diff

    if (depsOld.length != depsNew.length) return true

    for (let i = 0; i < depsOld.length; i++) {
      if (depsOld[i].types != depsNew[i].types) return true

      stack.push([depsOld[i].deps, depsNew[i].deps])
    }
  }
  return false
}

export function createStore({
  snapshot = {},
}: { snapshot?: Record<string, any> } = {}): Store {
  const actionsReducers = new Map<ActionType, Set<Atom>>()
  const atomsCache = new WeakMap<Atom, Cache>()
  const atomsListeners = new Map<Atom, Set<Fn>>()
  const transactionListeners = new Set<Fn<[TransactionResult]>>()

  function addReducer(atom: Atom, cache: Cache) {
    cache.types.forEach((type) => addToSetsMap(actionsReducers, type, atom))
    cache.deps.forEach((dep) => addReducer(atom, dep))
  }
  function delReducer(atom: Atom, cache: Cache) {
    cache.types.forEach((type) => delFromSetsMap(actionsReducers, type, atom))
    cache.deps.forEach((dep) => delReducer(atom, dep))
  }

  function collectSnapshot(atom: Atom, result: Rec = {}) {
    const cache = getCache(atom)!

    result[atom.id] = cache.state
    cache.deps.forEach((dep) => collectSnapshot(dep.atom, result))

    return result
  }

  function mergePatch(atom: Atom, patch: Cache, changedAtoms: Array<Cache>) {
    const atomCache = getCache(atom)
    if (atomsListeners.has(atom)) {
      if (atomCache == undefined) {
        addReducer(atom, patch)
      } else if (
        atomCache.types != patch.types ||
        isTypesChange(atomCache.deps, patch.deps)
      ) {
        delReducer(atom, patch)
        addReducer(atom, patch)
      }
    }

    atomsCache.set(atom, patch)

    if (!Object.is(atomCache?.state, patch.state)) {
      changedAtoms.push(patch)
    }
  }

  const dispatch: Store['dispatch'] = (action: Action | Array<Action>) => {
    const actions = Array.isArray(action) ? action : [action]
    invalid(
      actions.length === 0 || actions.every(isAction) === false,
      `dispatch arguments`,
    )

    const patch = new Map<Atom, Cache>()
    const transaction = createTransaction(actions, patch, getCache, snapshot)
    const changedAtoms = new Array<Cache>()
    let error: Error | null = null

    try {
      actions.forEach(({ targets }) =>
        targets?.forEach((atom) => transaction.process(atom)),
      )
      actions.forEach(({ type }) =>
        actionsReducers.get(type)?.forEach((atom) => transaction.process(atom)),
      )

      patch.forEach((atomPatch, atom) =>
        mergePatch(atom, atomPatch, changedAtoms),
      )
    } catch (e) {
      error = e instanceof Error ? e : new Error(e)
    }

    const transactionResult: TransactionResult = { actions, error, patch }

    transactionListeners.forEach((cb) => callSafety(cb, transactionResult))

    if (error) throw error

    const effectsResults = transaction.effects.map(
      (cb) => new Promise((res) => res(cb(store))),
    )

    changedAtoms.forEach(({ atom, state }) =>
      atomsListeners.get(atom)?.forEach((cb) => callSafety(cb, state)),
    )

    return Promise.allSettled(effectsResults).then(noop, noop)
  }

  function getCache<T>(atom: Atom<T>): Cache<T> | undefined {
    return atomsCache.get(atom)
  }

  function getState<T>(): Record<string, any>
  function getState<T>(atom: Atom<T>): T
  function getState<T>(atom?: Atom<T>) {
    if (atom === undefined) {
      const result: Rec = {}

      atomsListeners.forEach((_, atom) => collectSnapshot(atom, result))

      return result
    }

    invalid(!isAtom(atom), `"getState" argument`)

    let atomCache = getCache(atom)

    if (atomCache === undefined) {
      dispatch({
        type: `init "${atom.id}" ~${Math.random().toString(36)}`,
        payload: null,
        targets: [atom],
      })

      atomCache = getCache(atom)!
    } else if (!atomsListeners.has(atom)) {
      dispatch({
        type: `invalidate "${atom.id}" ~${Math.random().toString(36)}`,
        payload: null,
        targets: [atom],
      })

      atomCache = getCache(atom)!
    }

    return atomCache.state
  }

  function subscribe<State>(
    atom: Fn<[transactionResult: TransactionResult]> | Atom<State>,
    cb?: Fn<[state: State]>,
  ): Unsubscribe {
    if (isAtom<State>(atom) && isFunction(cb)) {
      let listeners = atomsListeners.get(atom)

      if (listeners === undefined) {
        atomsListeners.set(atom, (listeners = new Set()))
      }

      listeners.add(cb)

      function unsubscribe() {
        listeners!.delete(cb as Fn)
        if (listeners!.size === 0) {
          atomsListeners.delete(atom as Atom)
          delReducer(atom as Atom, atomsCache.get(atom as Atom)!)
        }
      }

      const atomCache = getCache(atom)

      try {
        const state = getState(atom)

        if (Object.is(atomCache?.state, state)) {
          cb(state)
        }
      } catch (error) {
        unsubscribe()
        throw error
      }

      return unsubscribe
    }

    invalid(!isFunction(atom), `subscribe arguments`) as never

    transactionListeners.add(atom as Fn)

    return () => transactionListeners.delete(atom as Fn)
  }

  const store = {
    dispatch,
    getCache,
    getState,
    subscribe,
  }

  return store
}

export const defaultStore = createStore()
