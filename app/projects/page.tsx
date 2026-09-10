import type { Metadata } from 'next';
import AccessGate from '../../components/auth/access-gate';
import ProjectsPage from '../../components/projects/projects-page';

export const metadata: Metadata = {
  title: 'Projects | FullAluDoor',
  description: 'Project library for aluminium door and window fabrication.',
};

export default function ProjectsRoute() {
  return (
    <AccessGate>
      <ProjectsPage />
    </AccessGate>
  );
}
