'use client';

import { createContext, useContext } from 'react';

/**
 * Makes the signed-in staff member available to client components.
 *
 * The user object is fetched on the server (lib/session.js) and passed down through the
 * dashboard layout — it is the backend's own `publicUser` shape, so there is nothing here the
 * browser should not see, and critically no token. Client code that needs to know "am I an
 * ADMIN?" reads this; it never decodes a JWT, because it never has one.
 */

const SessionContext = createContext(null);

export function SessionProvider({ user, children }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/**
 * @returns {{id: string, name: string, email: string|null, role: 'STAFF'|'ADMIN', status: string}}
 */
export function useSession() {
  const user = useContext(SessionContext);
  if (!user) {
    // Every client component that asks for a session lives under the dashboard layout, which
    // has already redirected anonymous visitors. Reaching here means a provider is missing,
    // and failing loudly beats rendering a staff-only control with `user` undefined.
    throw new Error('useSession() was called outside SessionProvider.');
  }
  return user;
}
