import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { listTerms } from '@/services/academic/academicService';
import { TermForm } from '@/components/admin/TermForm';
import { serialize } from '@/lib/utils/serialize';
import { TERM_SEED } from '@/lib/constants/subjects';
import { ExportMenu } from '@/components/export/ExportMenu';

export const metadata: Metadata = { title: 'Terms' };
export const dynamic = 'force-dynamic';

export default async function AdminTermsPage() {
  const terms = await listTerms();
  const byNumber = new Map(terms.map((t) => [t.termNumber, t]));

  return (
    <Card>
      <CardHeader
        title="Terms"
        description="The programme runs over exactly three terms. Each term's dates frame the venture activities assigned to it."
        action={<ExportMenu dataset="terms" />}
      />
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-3">
          {TERM_SEED.map((seed) => {
            const existing = byNumber.get(seed.termNumber);
            return (
              <TermForm
                key={seed.termNumber}
                termNumber={seed.termNumber}
                existing={existing ? serialize(existing) : null}
                fallbackName={seed.name}
              />
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
