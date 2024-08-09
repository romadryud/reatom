import { Action, Atom, AtomMut, AtomState, Ctx, Fn, Rec, action, atom } from '@reatom/core'
import { abortCauseContext } from '@reatom/effects'
import { getRootCause, withInit } from '@reatom/hooks'
import { noop } from '@reatom/utils'

export interface AtomUrlSettings {
  init: (ctx: Ctx) => URL
  sync: (ctx: Ctx, url: URL, replace?: boolean) => void
}

export interface UrlAtom extends Atom<URL> {
  (ctx: Ctx, url: URL, replace?: boolean): URL
  (ctx: Ctx, update: (url: URL, ctx: Ctx) => URL, replace?: boolean): URL

  go: Action<[path: string, replace?: boolean], URL>
  // TODO not documented yet, need more symbol matches, like in nanostores/router
  match: (path: string) => Atom<boolean>
  settingsAtom: AtomMut<AtomUrlSettings>
}

export interface SearchParamsAtom extends Atom<Rec<string>> {
  set: Action<[key: string, value: string, replace?: boolean], void>
  del: Action<[key: string, replace?: boolean], void>
  /** create AtomMut which will synced with the specified query parameter */
  lens<T = string>(key: string, parse?: (value?: string) => T, serialize?: (value: T) => undefined | string): AtomMut<T>
  /** create AtomMut which will synced with the specified query parameter */
  lens<T = string>(
    key: string,
    options: {
      parse?: (value?: string) => T
      serialize?: (value: T) => undefined | string
      replace?: boolean
    },
  ): AtomMut<T>
}

/** This is technical API for integrations usage. The update from this action will not be synced back to the source */
export const updateFromSource = action(
  (ctx, url: URL, replace?: boolean) => urlAtom(ctx, url, replace),
  'urlAtom.updateFromSource',
)

const browserSync = (url: URL, replace?: boolean) => {
  if (replace) history.replaceState({}, '', url.href)
  else history.pushState({}, '', url.href)
}
/**Browser settings allow handling of the "popstate" event and a link click. */
const createBrowserUrlAtomSettings = (shouldCatchLinkClick = true): AtomUrlSettings => ({
  init: (ctx: Ctx) => {
    // do not store causes for IO events
    ctx = { ...ctx, cause: getRootCause(ctx.cause) }
    // copied from https://github.com/nanostores/router
    const click = (event: MouseEvent) =>
      ctx.get(() => {
        let link:
          | undefined
          | (HTMLLinkElement & {
              origin: string
              download: string
              hash: string
              pathname: string
              search: string
            }) =
          // @ts-expect-error DOM typing is hard
          event.target.closest('a')
        if (
          link &&
          event.button === 0 && // Left mouse button
          link.target !== '_blank' && // Not for new tab
          link.origin === location.origin && // Not external link
          link.rel !== 'external' && // Not external link
          link.target !== '_self' && // Now manually disabled
          !link.download && // Not download link
          !event.altKey && // Not download link by user
          !event.metaKey && // Not open in new tab by user
          !event.ctrlKey && // Not open in new tab by user
          !event.shiftKey // Not open in new window by user
        ) {
          event.preventDefault()

          const { hash, href } = updateFromSource(ctx, new URL(link.href))
          history.pushState({}, '', href)

          if (location.hash !== hash) {
            ctx.schedule(() => {
              location.hash = hash
              if (href === '' || href === '#') {
                window.dispatchEvent(new HashChangeEvent('hashchange'))
              }
            })
          }
        }
      })

    globalThis.addEventListener('popstate', (event) => updateFromSource(ctx, new URL(location.href)))
    if (shouldCatchLinkClick) document.body.addEventListener('click', click)

    return new URL(location.href)
  },
  sync: (ctx, url, replace) => {
    ctx.schedule(() => browserSync(url, replace))
  },
})

const settingsAtom = atom<AtomUrlSettings>(createBrowserUrlAtomSettings(), 'urlAtom.settingAtom')

export const setupUrlAtomSettings = action(
  (ctx, init: (ctx: Ctx) => URL, sync: (ctx: Ctx, url: URL, replace?: boolean) => void = noop) => {
    settingsAtom(ctx, { init, sync })
  },
  'urlAtom.setupUrlAtomSettings',
)

export const setupUrlAtomBrowserSettings = action((ctx, shouldCatchLinkClick: boolean) => {
  settingsAtom(ctx, createBrowserUrlAtomSettings(shouldCatchLinkClick))
}, 'urlAtom.setupUrlAtomBrowserSettings')

const _urlAtom = atom(null as any as URL, 'urlAtom')
export const urlAtom: UrlAtom = Object.assign(
  (ctx: Ctx, update: URL | Fn<[URL, Ctx], URL>, replace = false) =>
    _urlAtom(ctx, (url, urlCtx) => {
      abortCauseContext.set(urlCtx.cause, new AbortController())
      const newUrl = typeof update === 'function' ? update(url, urlCtx) : update

      if (url !== newUrl && ctx.cause.proto !== updateFromSource.__reatom) {
        urlCtx.get(settingsAtom).sync(urlCtx, newUrl, replace)
      }

      return newUrl
    }),
  _urlAtom,
  {
    settingsAtom,
    go: action((ctx, path, replace?: boolean) => urlAtom(ctx, (url) => new URL(path, url), replace), 'urlAtom.go'),
    match: (path: string) => atom((ctx) => ctx.spy(urlAtom).pathname.startsWith(path), `urlAtom.match#${path}`),
  },
).pipe(withInit((ctx) => ctx.get(settingsAtom).init(ctx)))

export const searchParamsAtom: SearchParamsAtom = Object.assign(
  atom((ctx) => Object.fromEntries(ctx.spy(urlAtom).searchParams), 'searchParamsAtom'),
  {
    set: action((ctx, key, value, replace) => {
      const url = ctx.get(urlAtom)
      const newUrl = new URL(url)
      newUrl.searchParams.set(key, value)
      urlAtom(ctx, newUrl, replace)
    }, 'searchParamsAtom._set') satisfies SearchParamsAtom['set'],
    del: action((ctx, key, replace) => {
      const url = ctx.get(urlAtom)
      const newUrl = new URL(url.href)
      newUrl.searchParams.delete(key)
      urlAtom(ctx, newUrl, replace)
    }, 'searchParamsAtom._del') satisfies SearchParamsAtom['del'],
    lens: ((key, ...a: Parameters<typeof getSearchParamsOptions>) =>
      atom(getSearchParamsOptions(...a).parse(), `searchParamsAtom#${a[0]}`).pipe(
        // TODO
        // @ts-expect-error
        withSearchParamsPersist(key, ...a),
      )) satisfies SearchParamsAtom['lens'],
  },
)

const getSearchParamsOptions = (
  ...a:
    | [parse?: (value?: string) => unknown, serialize?: (value: unknown) => undefined | string]
    | [
        options: {
          parse?: (value?: string) => unknown
          serialize?: (value: unknown) => undefined | string
          replace?: boolean
        },
      ]
) => {
  const {
    parse = (value = '') => String(value),
    serialize = (value: any) => (value === init ? undefined : String(value)),
    replace,
  } = typeof a[0] === 'object'
    ? a[0]
    : {
        parse: a[0],
        serialize: a[1],
        replace: undefined,
      }
  const init = parse()
  return {
    parse,
    serialize,
    replace,
  }
}

export function withSearchParamsPersist<T = string>(
  key: string,
  parse?: (value?: string) => T,
  serialize?: (value: T) => undefined | string,
): <A extends Atom<T>>(theAtom: A) => A
export function withSearchParamsPersist<T = string>(
  key: string,
  options: {
    parse?: (value?: string) => T
    serialize?: (value: T) => undefined | string
    replace?: boolean
  },
): <A extends Atom<T>>(theAtom: A) => A
export function withSearchParamsPersist(
  key: string,
  ...a:
    | [parse?: (value?: string) => unknown, serialize?: (value: unknown) => undefined | string]
    | [
        options: {
          parse?: (value?: string) => unknown
          serialize?: (value: unknown) => undefined | string
          replace?: boolean
        },
      ]
) {
  const { parse, serialize, replace } = getSearchParamsOptions(...a)

  return (theAtom: Atom) => {
    const { computer, initState } = theAtom.__reatom
    theAtom.pipe(
      withInit((ctx, init) => {
        const sp = ctx.get(searchParamsAtom)
        return key in sp ? parse(sp[key]) : init(ctx)
      }),
    )
    theAtom.__reatom.computer = (ctx, state) => {
      ctx.spy(searchParamsAtom, (next, prev) => {
        if (key in next) {
          if (!prev || prev[key] !== next[key]) {
            state = parse(next[key])
          }
        } else {
          if (prev && key in prev) {
            state = initState(ctx)
          }
        }
      })
      return computer ? computer(ctx, state) : state
    }
    theAtom.onChange((ctx, state) => {
      const value = serialize(state)
      if (value === undefined) {
        searchParamsAtom.del(ctx, key, replace)
      } else {
        searchParamsAtom.set(ctx, key, value, replace)
      }
      ctx.get(theAtom)
    })

    return theAtom
  }
}
