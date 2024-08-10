import { createTestCtx } from '@reatom/testing'
import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { atom, AtomMut } from '@reatom/core'
import { select } from './select'

const test = suite('select')

test('should not recompute the end atom if the source atom changed', () => {
  let track = 0
  const a = atom(0)
  const b = atom((ctx) => {
    track++
    return select(ctx, (ctx) => ctx.spy(a) % 3)
  })
  const ctx = createTestCtx()

  ctx.subscribeTrack(b)
  assert.is(ctx.get(b), 0)
  assert.is(track, 1)

  a(ctx, 3)
  a(ctx, 6)
  assert.is(ctx.get(b), 0)
  assert.is(track, 1)

  a(ctx, 10)
  assert.is(ctx.get(b), 1)
  assert.is(track, 2)
  ;`👍` //?
})

test('many selects should work', () => {
  const list = atom(new Array<{ value: AtomMut<number> }>())
  const target = atom((ctx) => {
    const length = select(ctx, (ctx) => ctx.spy(list).length)
    const sum = select(ctx, (ctx) => ctx.spy(list).reduce((acc, el) => acc + ctx.spy(el.value), 0))

    return { length, sum }
  })
  const ctx = createTestCtx()
  const track = ctx.subscribeTrack(target)

  assert.equal(ctx.get(target), { length: 0, sum: 0 })

  const value = atom(1)
  list(ctx, [{ value }])
  assert.equal(ctx.get(target), { length: 1, sum: 1 })
  assert.is(track.calls.length, 2)

  value(ctx, 2)
  assert.equal(ctx.get(target), { length: 1, sum: 2 })
  assert.is(track.calls.length, 3)

  list(ctx, [{ value }])
  assert.equal(ctx.get(target), { length: 1, sum: 2 })
  assert.is(track.calls.length, 3)
})

test('prevent select memoization errors', () => {
  const list = atom(new Array<AtomMut<{ name: string; value: number }>>())
  const sum = atom((ctx) => ctx.spy(list).reduce((acc, el) => acc + select(ctx, (ctx) => ctx.spy(el).value), 0))
  const ctx = createTestCtx()
  const track = ctx.subscribeTrack(sum)

  assert.is(track.calls.length, 1)
  assert.is(ctx.get(sum), 0)

  assert.throws(
    () => list(ctx, [atom({ name: 'a', value: 1 }), atom({ name: 'b', value: 2 })]),
    'Reatom error: multiple select with the same "toString" representation is not allowed',
  )
  // assert.is(track.calls.length, 2)
  // assert.is(ctx.get(sum), 3)
})

test.run()
