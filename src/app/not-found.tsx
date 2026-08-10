import Link from 'next/link';
import { StatusScreen } from '@/components/branding/StatusScreen';

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist, or the record has been removed."
      action={
        <Link href="/" className="text-primary text-sm font-medium hover:underline">
          Return to your dashboard
        </Link>
      }
    />
  );
}
