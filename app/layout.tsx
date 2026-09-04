import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FullAluDoor | Fabrication workspace',
  description: 'Parametric aluminium door design and fabrication planning.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
