import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { createTestCtx, mockFn, createMockStorage } from '@reatom/testing'
import { noop, sleep } from '@reatom/utils'
import { Ctx } from '@reatom/core'
import { reatomPersist } from '@reatom/persist'
import { onConnect } from '@reatom/hooks'

import { reatomAsync, withAbort, withDataAtom, withCache, AsyncCtx } from './'

const test = suite('withCache')

test('withCache', async () => {
  const fetchData = reatomAsync(async (ctx, { a, b }: { a: number; b: number }) => a).pipe(withDataAtom(0), withCache())
  const ctx = createTestCtx()

  await fetchData(ctx, { a: 400, b: 0 })

  const promise1 = fetchData(ctx, { a: 123, b: 0 })
  assert.is(ctx.get(fetchData.pendingAtom), 1)
  assert.is(ctx.get(fetchData.dataAtom), 400)

  assert.is(await promise1, 123)
  assert.is(ctx.get(fetchData.pendingAtom), 0)
  assert.is(ctx.get(fetchData.dataAtom), 123)

  const promise2 = fetchData(ctx, { b: 0, a: 123 })
  assert.is(ctx.get(fetchData.pendingAtom), 0)
  assert.is(ctx.get(fetchData.dataAtom), 123)
  assert.is(await promise2, 123)

  fetchData(ctx, { b: 0, a: 400 })
  assert.is(ctx.get(fetchData.pendingAtom), 0)
  assert.is(ctx.get(fetchData.dataAtom), 400)
  ;`👍` //?
})

test('withCache dataAtom mapper', async () => {
  let i = 0
  const fetchData = reatomAsync(async (ctx) => [++i]).pipe(
    withDataAtom(0, (ctx, [i]) => i),
    withCache(),
  )
  onConnect(fetchData.dataAtom, fetchData)

  const ctx = createTestCtx()

  await fetchData(ctx)
  assert.is(ctx.get(fetchData.dataAtom), 1)

  await fetchData(ctx)
  assert.is(ctx.get(fetchData.dataAtom), 2)
  ;`👍` //?
})

test('withCache swr true (default)', async () => {
  let i = 0
  const fetchData = reatomAsync((ctx) => Promise.resolve(++i)).pipe(withDataAtom(0), withCache())

  const ctx = createTestCtx()
  const track = ctx.subscribeTrack(fetchData.dataAtom)
  track.calls.length = 0

  await fetchData(ctx)
  assert.is(track.calls.length, 1)
  assert.is(ctx.get(fetchData.dataAtom), 1)

  await fetchData(ctx)
  assert.is(track.calls.length, 2)
  assert.is(ctx.get(fetchData.dataAtom), 2)

  fetchData(ctx)
  assert.is(track.calls.length, 2)
  assert.is(ctx.get(fetchData.dataAtom), 2)
  ;`👍` //?
})

test('withCache swr false', async () => {
  let i = 0
  const fetchData = reatomAsync(async (ctx, n) => {
    i++
    return n
  }).pipe(withDataAtom(0), withCache({ swr: false }))

  const ctx = createTestCtx()
  const track = ctx.subscribeTrack(fetchData.dataAtom)
  track.calls.length = 0

  await fetchData(ctx, 1)
  assert.is(i, 1)
  await fetchData(ctx, 1)
  assert.is(i, 1)
  assert.is(track.calls.length, 1)
  assert.is(ctx.get(fetchData.dataAtom), 1)

  await fetchData(ctx, 2)
  assert.is(i, 2)
  assert.is(track.calls.length, 2)
  assert.is(ctx.get(fetchData.dataAtom), 2)

  await fetchData(ctx, 1)
  assert.is(i, 2)
  assert.is(track.calls.length, 3)
  assert.is(ctx.get(fetchData.dataAtom), 1)
  ;`👍` //?
})

test('withCache parallel', async () => {
  let i = 0
  const effect = mockFn(() => new Promise((r) => setTimeout(r, 0, ++i)))
  const fetchData = reatomAsync(effect).pipe(withDataAtom(0), withCache())

  const ctx = createTestCtx()
  const track = ctx.subscribeTrack(fetchData.dataAtom)
  track.calls.length = 0

  const p1 = Promise.all([fetchData(ctx), fetchData(ctx)])
  assert.is(effect.calls.length, 1)
  assert.is(ctx.get(fetchData.pendingAtom), 1)
  assert.is(track.calls.length, 0)
  assert.equal(await p1, [1, 1])
  assert.equal(track.inputs(), [1])

  const p2 = Promise.all([fetchData(ctx), fetchData(ctx)])
  assert.is(effect.calls.length, 2)
  assert.equal(await p2, [2, 2])
  assert.equal(track.inputs(), [1, 2])
  ;`👍` //?
})

test('withCache withAbort vary params', async () => {
  const effect = mockFn(async (ctx: any, n: number) => {
    ctx.controller.signal.throwIfAborted()

    return n
  })
  const fetchData = reatomAsync(effect).pipe(withDataAtom(0), withCache(), withAbort())

  const ctx = createTestCtx()
  const track = ctx.subscribeTrack(fetchData.dataAtom)
  track.calls.length = 0

  const p1 = Promise.allSettled([fetchData(ctx, 1), fetchData(ctx, 2)])
  assert.is(track.calls.length, 0)
  assert.is(ctx.get(fetchData.dataAtom), 0)
  const res1 = await p1
  assert.is(res1[0].status, 'rejected')
  assert.equal(res1[1], { status: 'fulfilled', value: 2 })
  assert.is(track.calls.length, 1)
  assert.is(ctx.get(fetchData.dataAtom), 2)

  await fetchData(ctx, 1)
  assert.is(track.calls.length, 2)
  assert.is(ctx.get(fetchData.dataAtom), 1)

  fetchData(ctx, 2)
  assert.is(track.calls.length, 3)
  assert.is(ctx.get(fetchData.dataAtom), 2)
  ;`👍` //?
})

test('withCache withAbort same params', async () => {
  const effect = mockFn(async (ctx: AsyncCtx, n: number) => {
    ctx.controller.signal.throwIfAborted()
    return n
  })
  const fetchData = reatomAsync(effect).pipe(
    withDataAtom(0),
    withCache(/* default `{ignoreAbort: true}` */),
    withAbort(),
  )

  const ctx = createTestCtx()

  const p1 = Promise.allSettled([fetchData(ctx, 1), fetchData(ctx, 1)])
  assert.is(ctx.get(fetchData.dataAtom), 0)
  assert.is(effect.calls.length, 1)
  const res1 = await p1
  assert.equal(
    res1.map(({ status }) => status),
    ['rejected', 'fulfilled'],
  )
  assert.is(ctx.get(fetchData.dataAtom), 1)

  await fetchData(ctx, 1)
  assert.is(ctx.get(fetchData.dataAtom), 1)

  await fetchData(ctx, 2)
  assert.is(ctx.get(fetchData.dataAtom), 2)
  ;`👍` //?
})

test('withCache and action mocking', async () => {
  const effect = mockFn(async (ctx: any, n: number) => n)
  const fetchData = reatomAsync(effect).pipe(withDataAtom(0), withCache(), withAbort())
  const ctx = createTestCtx()

  ctx.mockAction(fetchData, async (ctx, n) => n * 10)

  fetchData(ctx, 1)
  assert.is(ctx.get(fetchData.pendingAtom), 1)
  await sleep()
  assert.is(ctx.get(fetchData.pendingAtom), 0)
  assert.is(ctx.get(fetchData.dataAtom), 10)

  fetchData(ctx, 1)
  assert.is(ctx.get(fetchData.pendingAtom), 0)
  assert.is(ctx.get(fetchData.dataAtom), 10)
  ;`👍` //?
})

test('withPersist', async () => {
  const mockStorage = createMockStorage()
  const withMock = reatomPersist(mockStorage)

  const effect = mockFn(async (ctx: Ctx, a: number, b: number) => a + b)
  const fetchData1 = reatomAsync(effect, 'fetchData').pipe(
    withDataAtom(0),
    withCache({ withPersist: withMock, swr: false }),
  )
  const fetchData2 = reatomAsync(effect, 'fetchData').pipe(
    withDataAtom(0),
    withCache({ withPersist: withMock, swr: false }),
  )

  const ctx = createTestCtx()

  const data2Track = ctx.subscribeTrack(fetchData2.dataAtom)
  data2Track.calls.length = 0

  await fetchData1(ctx, 1, 2)
  assert.is(data2Track.calls.length, 0)

  const effectCalls = effect.calls.length
  await fetchData2(ctx, 1, 2)
  assert.is(effect.calls.length, effectCalls)
  assert.is(data2Track.lastInput(), 3)
  ;`👍` //?
})

test('do not cache aborted promise', async () => {
  const effect = mockFn(async (ctx: AsyncCtx) => {
    await null
    ctx.controller.signal.throwIfAborted()
    return 1
  })
  const fetchData = reatomAsync(effect).pipe(withDataAtom(0), withCache({ ignoreAbort: false }))
  onConnect(fetchData.dataAtom, fetchData)
  const ctx = createTestCtx()

  ctx.subscribe(fetchData.dataAtom, noop)()
  const un = ctx.subscribe(fetchData.dataAtom, noop)
  await sleep()
  assert.is(effect.calls.length, 2)
  assert.is(ctx.get(fetchData.dataAtom), 1)

  un()
  ctx.subscribe(fetchData.dataAtom, noop)()
  ctx.subscribe(fetchData.dataAtom, noop)
  await sleep()
  assert.is(effect.calls.length, 4)
  assert.is(ctx.get(fetchData.dataAtom), 1)
  ;`👍` //?
})

test('should be able to manage cache manually', async () => {
  const effect = mockFn(async (ctx: any, n: number) => n)
  const fetchData = reatomAsync(effect).pipe(withDataAtom(0), withCache({ swr: false }))
  const ctx = createTestCtx()

  fetchData(ctx, 1)
  assert.is(effect.calls.length, 1)
  assert.is(ctx.get(fetchData.dataAtom), 0)
  await sleep()
  assert.is(ctx.get(fetchData.dataAtom), 1)

  fetchData.cacheAtom.setWithParams(ctx, [2], 2)
  fetchData(ctx, 2)
  assert.is(effect.calls.length, 1)
  assert.is(ctx.get(fetchData.dataAtom), 2)
  await sleep()
  assert.is(ctx.get(fetchData.dataAtom), 2)

  fetchData(ctx, 1)
  assert.is(effect.calls.length, 1)

  fetchData.cacheAtom.deleteWithParams(ctx, [1])
  fetchData(ctx, 1)
  assert.is(effect.calls.length, 2)
})

test.run()
