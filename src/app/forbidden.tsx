import Link from 'next/link';
import { StatusScreen } from '@/components/branding/StatusScreen';

export default function Forbidden() {
  return (
    <StatusScreen
      code="403"
      title="You do not have access to this"
      description="This record belongs to another student or venture. If you believe you should have access, contact the programme office."
      action={
        <Link href="/" className="text-primary text-sm font-medium hover:underline">
          Return to your dashboard
        </Link>
      }
    />
  );
}
