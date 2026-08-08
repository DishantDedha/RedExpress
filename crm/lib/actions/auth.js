'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { clearSessionCookies } from '@/lib/session-cookies';

/**
 * Sign out.
 *
 * A server action rather than an onClick handler, so the topbar's sign-out control is a real
 * <form> submit: it works with JavaScript disabled, it is a button to a screen reader, and it
 * cannot be triggered by a stray GET (a link prefetch signing staff out mid-shift is a real
 * failure mode, not a hypothetical one).
 */
export async function logoutAction() {
  const store = await cookies();
  clearSessionCookies(store);
  redirect('/login?reason=signed-out');
}
