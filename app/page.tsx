import { redirect } from 'next/navigation';

// The workspace is now project-scoped at /project/[projectId]. The application
// root sends authenticated (and unauthenticated) users to the dashboard.
export default function Home() {
  redirect('/dashboard');
  return null;
}
