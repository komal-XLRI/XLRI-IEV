import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, EmptyState } from '@/components/ui/Card';
import { getVentureByStudentId } from '@/services/ventures/studentVentureService';
import { MyVentureForm } from '@/components/student/MyVentureForm';
import { serialize } from '@/lib/utils/serialize';

export const metadata: Metadata = { title: 'My venture' };
export const dynamic = 'force-dynamic';

export default async function StudentVenturePage() {
  const user = await requireRole('STUDENT');
  const venture = await getVentureByStudentId(user.userId);

  if (!venture) {
    return (
      <>
        <PageHeader title="My venture" />
        <Card>
          <EmptyState
            title="No venture assigned yet"
            description="Your programme office will set this up for you."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My venture"
        description="Keep your venture narrative current — your reviewers see this alongside every submission."
      />
      <MyVentureForm
        venture={serialize({
          ventureName: venture.ventureName,
          ventureTitle: venture.ventureTitle ?? '',
          industry: venture.industry ?? '',
          targetMarket: venture.targetMarket ?? '',
          problemStatement: venture.problemStatement ?? '',
          solution: venture.solution ?? '',
          fundingStatus: venture.fundingStatus ?? '',
        })}
      />
    </>
  );
}
