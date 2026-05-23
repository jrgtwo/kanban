import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { RootLayout } from './layouts/RootLayout'
import { ProjectsIndex } from './routes/ProjectsIndex'
import { ProjectBoard } from './routes/ProjectBoard'

const rootRoute = createRootRoute({
  component: () => (
    <RootLayout>
      <Outlet />
    </RootLayout>
  ),
  notFoundComponent: () => (
    <div className="px-12 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-ink-mute">
        404 — off the page
      </p>
      <h1 className="font-display mt-4 text-6xl">Lost in the margins.</h1>
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProjectsIndex,
})

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId',
  component: ProjectBoard,
})

const routeTree = rootRoute.addChildren([indexRoute, projectRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
