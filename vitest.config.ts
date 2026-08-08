import { defineConfig } from 'vitest/config'

/**
 * Server tests only.
 *
 * The client is deliberately untested — that was the repo's standing position
 * and nothing here changes it. What earned a runner is the backend: an ordering
 * invariant enforced across move / delete / reorder, recursive cascade deletes,
 * and refusals that have to stay readable. Those are pure logic over a temp
 * SQLite file, so they are cheap to test and expensive to get wrong quietly.
 */
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
  },
})
