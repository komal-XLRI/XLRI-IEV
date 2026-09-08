import type { Metadata } from 'next';
import { Video } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { getRecordingFolderLink, listRecordings } from '@/services/recordings/recordingService';
import { RecordingTable } from '@/components/recordings/RecordingTable';
import type { RecordingRow } from '@/components/recordings/recordingTableModel';
import { CreateRecordingForm } from '@/components/recordings/RecordingForm';
import { RecordingFolderBanner } from '@/components/recordings/RecordingFolderBanner';
import { EditRecordingFolderForm } from '@/components/recordings/RecordingFolderForm';
import { toDateInputValue } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Recordings' };
export const dynamic = 'force-dynamic';

export default async function AdminRecordingsPage() {
  const [recordings, folderLink] = await Promise.all([listRecordings(), getRecordingFolderLink()]);

  // The table is a client component, so ObjectIds and Dates are flattened to
  // the string shapes its inputs already use.
  const rows: RecordingRow[] = recordings.map((recording) => ({
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
  }));

  return (
    <>
      <RecordingFolderBanner
        link={folderLink}
        action={<EditRecordingFolderForm link={folderLink} />}
      />

      <Card>
        <CardHeader
          title="Recordings"
          description="Sessions and their Zoom and recording links. Faculty see this list; students do not."
          icon={Video}
          action={<CreateRecordingForm />}
        />

        <RecordingTable recordings={rows} />
      </Card>
    </>
  );
}
