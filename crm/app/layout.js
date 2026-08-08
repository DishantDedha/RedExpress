import './globals.css';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata = {
  title: {
    default: 'Red Express CRM',
    template: '%s · Red Express CRM',
  },
  description: 'Staff dashboard for the Red Express blood-donation platform.',
  // The dashboard is an internal tool showing personal data. It has no business in a search index.
  robots: { index: false, follow: false },
};

export const viewport = {
  // No maximum-scale and no user-scalable=no: pinch-zoom is how a low-vision staff member
  // reads a table, and taking it away is a WCAG 1.4.4 failure.
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-ink antialiased">
        {/* Toasts live above the router so a message survives the navigation that caused it —
            "Donor marked as unreachable" must still be readable on the page you land on. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
