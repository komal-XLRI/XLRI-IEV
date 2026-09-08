import type { Metadata } from 'next';
import { Video } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { requireRole } from '@/lib/auth/currentUser';
import { getRecordingFolderLink, listRecordings } from '@/services/recordings/recordingService';
import { RECORDING_COLUMNS, recordingCells } from '@/components/recordings/recordingTableModel';
import { RecordingFolderBanner } from '@/components/recordings/RecordingFolderBanner';
import { toDateInputValue } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Recordings' };
export const dynamic = 'force-dynamic';

/** The same register the programme office keeps, read-only. */
export default async function FacultyRecordingsPage() {
  await requireRole('FACULTY');

  const [recordings, folderLink] = await Promise.all([listRecordings(), getRecordingFolderLink()]);

  return (
    <>
      <RecordingFolderBanner link={folderLink} />

      <Card>
        <CardHeader
          title="Recordings"
          description="Sessions and their Zoom and recording links. Use the passcode beside a recording to open it."
          icon={Video}
        />

        <DataTable
          caption="Recordings"
          columns={RECORDING_COLUMNS}
          searchPlaceholder="Search event, batch, venue or links"
          emptyTitle="Nothing in the register yet"
          emptyDescription="When the programme office adds a session, it appears here."
          rows={recordings.map((recording, index) => ({
            id: recording._id.toString(),
            cells: recordingCells(
              {
                _id: recording._id.toString(),
                event: recording.event,
                date: toDateInputValue(recording.date),
                timings: recording.timings ?? '',
                batch: recording.batch ?? '',
                venue: recording.venue ?? '',
                zoomLink: recording.zoomLink ?? '',
                meetingId: recording.meetingId ?? '',
                passcode: recording.passcode ?? '',
                recordingLink: recording.recordingLink ?? '',
                recordingPasscode: recording.recordingPasscode ?? '',
              },
              index,
            ),
          }))}
        />
      </Card>
    </>
  );
}
