import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { createTestCtx } from '@reatom/testing'
import { atom } from '@reatom/core'
import { onConnect } from '@reatom/hooks'
import { isDeepEqual, jsonClone, sleep } from '@reatom/utils'

import { reatomAsync, withAbort, withDataAtom } from './'

describe('optimistic update', () => {
  /*
    The case: we have a list of items and we want to update one of them.
    We want to update the list immediately, but we want to rollback the update
    if the server returns an error.

    Also, we use `onConnect` to fetch the list from the server every 5 seconds
    and we don't want to call subscriptions extra times so we use `isDeepEqual`
    in `withDataAtom` to prevent new reference stream if nothing really changed.
  */

  //#region BACKEND IMITATION
  let mock = [{ id: 1, value: 1 }]
  const api = {
    getData: async () => jsonClone(mock),
    putData: async (id: number, value: number) => {
      const item = mock.find((item) => item.id === id)
      if (item) item.value = value
      await sleep()
    },
  }
  //#endregion

  // this is short for test purposes, use ~5000 in real code
  const INTERVAL = 5

  const getData = reatomAsync.from(api.getData).pipe(
    // add `dataAtom` and map the effect payload into it
    // try to prevent new reference stream if nothing really changed
    withDataAtom([], (ctx, payload, state) => (isDeepEqual(payload, state) ? state : payload)),
  )
  const putData = reatomAsync.from(api.putData)
  putData.onCall((ctx, promise, params) => {
    const [id, value] = params
    const oldList = ctx.get(getData.dataAtom)
    // optimistic update
    const newList = getData.dataAtom(ctx, (state) => state.map((item) => (item.id === id ? { ...item, value } : item)))
    // rollback on error
    promise.catch((error) => {
      if (ctx.get(getData.dataAtom) === newList) {
        getData.dataAtom(ctx, oldList)
      } else {
        // TODO looks like user changed data again
        // need to notify user about the conflict.
      }
      throw error
    })
  })

  onConnect(getData.dataAtom, async (ctx) => {
    while (ctx.isConnected()) {
      await getData(ctx)
      await sleep(INTERVAL)
    }
  })

  test('optimistic update', async () => {
    const ctx = createTestCtx()
    const effectTrack = ctx.subscribeTrack(getData.onFulfill)
    const dataTrack = ctx.subscribeTrack(getData.dataAtom)

    // every subscription calls passed callback immediately
    assert.is(effectTrack.calls.length, 1)
    assert.is(dataTrack.calls.length, 1)
    assert.equal(dataTrack.lastInput(), [])

    // `onConnect` calls `fetchData`, wait it and check changes
    await sleep()
    assert.is(dataTrack.calls.length, 2)
    assert.equal(dataTrack.lastInput(), [{ id: 1, value: 1 }])

    // call `updateData` and check changes
    putData(ctx, 1, 2)
    assert.is(dataTrack.calls.length, 3)
    assert.equal(dataTrack.lastInput(), [{ id: 1, value: 2 }])

    // wait for `fetchData` and check changes
    assert.is(effectTrack.calls.length, 2)
    await sleep(INTERVAL)
    // the effect is called again, but dataAtom is not updated
    assert.is(effectTrack.calls.length, 3)
    assert.is(dataTrack.calls.length, 3)

    // cleanup test
    dataTrack.unsubscribe()
    ;`👍` //?
  })
})

describe('concurrent pooling', () => {
  /*
    The case: we have a long-running task and we want to pool it's progress
    every 5 seconds. We want to abort the previous pooling if the new one
    was started. The problem with the most tooling for async management is that no causes tracking
    and we can't abort some step of the previous pooling if the new one was started.
    Reatom handle it perfectly, because `ctx` is immutable and could be traced when needed.
  */

  //#region BACKEND IMITATION
  const tasks = new Map<number, number>()
  const api = {
    async createTask() {
      return Math.random()
    },
    async poolTask(taskId: number) {
      await sleep(5)
      const progress = (tasks.get(taskId) ?? -10) + 10
      tasks.set(taskId, progress)

      return progress
    },
  }
  //#endregion

  const createTask = reatomAsync.from(api.createTask)
  const poolTask = reatomAsync.from(api.poolTask)

  const progressAtom = atom(0)

  const search = reatomAsync(async (ctx) => {
    const taskId = await createTask(ctx)

    while (true) {
      const progress = await poolTask(ctx, taskId)
      progressAtom(ctx, progress)

      if (progress === 100) return
    }
  }).pipe(withAbort({ strategy: 'last-in-win' }))

  test('concurrent pooling', async () => {
    const ctx = createTestCtx()
    const track = ctx.subscribeTrack(progressAtom)

    const promise1 = search(ctx)
    await sleep(15)
    const promise2 = search(ctx)

    await Promise.allSettled([promise1, promise2])

    assert.is(ctx.get(progressAtom), 100)

    const expectedProgress = [0, 10, /* start again */ 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

    // assert.equal(track.inputs(), expectedProgress)
    ;`👍` //?
  })
})

test.run()

// uvu have no own describe
function describe(name: string, fn: () => any) {
  fn()
}
