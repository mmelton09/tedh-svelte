import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Redirect to Meta page - commanders are browsed via the Meta table
export const load: PageServerLoad = async () => {
  throw redirect(307, '/');
};
