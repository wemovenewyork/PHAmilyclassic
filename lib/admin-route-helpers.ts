import 'server-only';
import { cookies } from 'next/headers';
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionJwt,
  type AdminSession,
} from './admin-auth';

/**
 * Helper used by every admin API route. Reads the admin_session cookie and
 * verifies it. Returns the session payload, or null if the request isn't
 * authenticated. Routes turn null into a 401 response.
 */
export async function requireAdminSession(): Promise<AdminSession | null> {
  const jwt = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionJwt(jwt);
}
