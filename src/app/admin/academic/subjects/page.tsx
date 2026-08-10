import type { Metadata } from 'next';
import { Library } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { Badge } from '@/components/ui/Badge';
import { getSubjectFaculty, listSubjects, listTerms } from '@/services/academic/academicService';
import { listReviewersByRole } from '@/services/users/userService';
import { SubjectForm } from '@/components/admin/SubjectForm';
import { SubjectFacultyPicker } from '@/components/admin/SubjectFacultyPicker';
import { serialize } from '@/lib/utils/serialize';
import { ExportMenu } from '@/components/export/ExportMenu';
import { ImportPanel } from '@/components/import/ImportPanel';
import { subjectImport } from '@/services/import/specs';

export const metadata: Metadata = { title: 'Subjects' };
export const dynamic = 'force-dynamic';

export default async function AdminSubjectsPage() {
  const [subjects, terms, faculty] = await Promise.all([
    listSubjects(),
    listTerms(),
    listReviewersByRole('FACULTY'),
  ]);

  const rosters = await Promise.all(
    subjects.map(async (subject) => ({
      subjectId: subject._id.toString(),
      facultyIds: (await getSubjectFaculty(subject._id.toString())).map((a) =>
        a.facultyId._id.toString(),
      ),
    })),
  );
  const rosterBySubject = new Map(rosters.map((r) => [r.subjectId, r.facultyIds]));

  const termOptions = serialize(terms).map((t) => ({
    _id: t._id,
    name: t.name,
    termNumber: t.termNumber,
  }));
  const facultyOptions = serialize(faculty).map((f) => ({
    _id: f._id,
    name: f.name,
    email: f.email,
  }));

  const columns: DataColumn[] = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Name' },
    { key: 'term', header: 'Term', hideBelow: 'md' },
    { key: 'area', header: 'Area', hideBelow: 'lg', toggleable: true },
    { key: 'credits', header: 'Credits', align: 'right', hideBelow: 'sm' },
    { key: 'status', header: 'Status' },
    { key: 'faculty', header: 'Teaching faculty', sortable: false },
  ];

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="Programme subjects"
          description={`${subjects.length} subject(s). Teaching a subject does not grant Venture Activity review rights — those come from the venture assignment.`}
          icon={Library}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ImportPanel
                spec={subjectImport.key}
                title={subjectImport.title}
                description={subjectImport.description}
                columns={subjectImport.columns}
              />
              <ExportMenu dataset="subjects" />
              <SubjectForm terms={termOptions} />
            </div>
          }
        />

        <DataTable
          caption="Programme subjects"
          columns={columns}
          searchPlaceholder="Search code, name or area"
          emptyTitle="No subjects yet"
          emptyDescription="Run the seed script to load the programme list, import from CSV, or add one with the button above."
          rows={subjects.map((subject) => {
            const id = subject._id.toString();

            return {
              id,
              cells: [
                {
                  node: <span className="font-mono text-xs font-semibold">{subject.code}</span>,
                  sort: subject.code,
                  text: subject.code,
                },
                {
                  node: <span className="font-medium">{subject.name}</span>,
                  sort: subject.name,
                  text: subject.name,
                },
                textCell(subject.termId?.name),
                textCell(subject.area),
                textCell(subject.credits),
                {
                  node: (
                    <Badge tone={subject.status === 'ACTIVE' ? 'success' : 'muted'}>
                      {subject.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                  sort: subject.status,
                  text: subject.status,
                },
                {
                  node: (
                    <SubjectFacultyPicker
                      subjectId={id}
                      faculty={facultyOptions}
                      selectedIds={rosterBySubject.get(id) ?? []}
                    />
                  ),
                  text: (rosterBySubject.get(id) ?? [])
                    .map((facultyId) => facultyOptions.find((f) => f._id === facultyId)?.name ?? '')
                    .join(' '),
                },
              ],
            };
          })}
        />
      </Card>
    </>
  );
}
