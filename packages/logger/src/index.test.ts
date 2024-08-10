import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { action, atom, createCtx } from '@reatom/core'
import { mapPayloadAwaited, toAtom } from '@reatom/lens'
import { omit, sleep } from '@reatom/utils'
import { mockFn } from '@reatom/testing'

import { connectLogger, createLogBatched } from '.'

test.skip(`base`, async () => {
  const a1 = atom(0)
  const a2 = atom(0, `a2`)
  const ctx = createCtx()
  const log = mockFn()

  ctx.get(a1)
  ctx.get(a2)

  connectLogger(ctx, { log })

  ctx.get(() => {
    a1(ctx, 1)
    a2(ctx, 2)
  })

  // assert.equal(log.lastInput().changes, { '2.a2': 2 })

  ctx.get(() => {
    a2(ctx, 10)
    a2(ctx, 20)
  })

  // assert.equal(log.lastInput().changes, { '1.a2': 10, '2.a2': 20 })

  // padStart test
  ctx.get(() => {
    let i = 0
    while (i++ < 10) a2(ctx, i)
  })

  assert.equal(log.lastInput().changes, {
    '1.a2': 1,
    '2.a2': 2,
    '3.a2': 3,
    '4.a2': 4,
    '5.a2': 5,
    '6.a2': 6,
    '7.a2': 7,
    '8.a2': 8,
    '9.a2': 9,
    '10.a2': 10,
  })
  ;`👍` //?
})

test.skip(`cause`, async () => {
  // should correct calculate cause for complex async transactions
  const doAsync = action((ctx, v: number) => ctx.schedule(() => Promise.resolve(v)), `doAsync`)
  const asyncResAtom = doAsync.pipe(mapPayloadAwaited((ctx, v) => v, `asyncResAtom`))
  const resMapAtom = atom((ctx) => ctx.spy(asyncResAtom), 'resMapAtom')

  const ctx = createCtx()
  const log = mockFn()
  let i = 0

  ctx.subscribe(resMapAtom, () => {})

  connectLogger(ctx, {
    showCause: true,
    log: createLogBatched({ log, getTimeStamp: () => `${++i}`, debounce: 0 }),
  })

  doAsync(ctx, 123)
  await sleep(5)

  assert.equal(log.lastInput(), {
    '1.0.___timestamp___': '1',
    '1.1.doAsync': { params: [123], payload: new Promise(() => {}) },
    '1.1.___cause___': 'root',
    '2.0.___timestamp___': '2',
    '2.1.doAsync.asyncResAtom': { params: [123], payload: 123 },
    '2.1.___cause___': 'doAsync',
    '2.3.resMapAtom': [{ params: [123], payload: 123 }],
    '2.3.___cause___': 'doAsync.asyncResAtom <-- doAsync',
  })
  ;`👍` //?
})

test.skip(`should skip logs without state changes`, async () => {
  const a = atom(0, 'nAtom')
  const ctx = createCtx()
  const log = mockFn()
  let i = 0

  ctx.subscribe(a, () => {})

  connectLogger(ctx, {
    log: createLogBatched({ log, getTimeStamp: () => `${++i}`, debounce: 1 }),
  })

  a(ctx, 1)

  ctx.get(a)

  a(ctx, 1)

  assert.is(log.calls.length, 0)

  await sleep(1)

  assert.is(log.calls.length, 1)

  a(ctx, 1)

  assert.is(log.calls.length, 1)

  await 0

  assert.is(log.calls.length, 1)

  a(ctx, 2)

  ctx.get(() => {
    ctx.get(a)
  })

  ctx.get(() => {
    atom(0, 'nAtom1')(ctx, 1)
    ctx.get(a)
    atom(0, 'nAtom2')(ctx, 1)
    a(ctx, 3)
  })

  a(ctx, 3)

  assert.is(log.calls.length, 1)

  await sleep()

  assert.is(log.calls.length, 2)
  assert.equal(log.lastInput(), {
    '1.0.___timestamp___': '2',
    '1.1.nAtom': 2,
    '2.0.___timestamp___': '3',
    '2.1.nAtom1': 1,
    '2.3.nAtom2': 1,
    '2.4.nAtom': 3,
  })
  ;`👍` //?
})

test.run()
