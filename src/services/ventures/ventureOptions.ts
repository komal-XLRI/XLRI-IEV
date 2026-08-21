import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentVenture } from '@/models';

/**
 * Ventures as filter options.
 *
 * Its own module rather than a function on the attendance service: the list is
 * "every venture, named by its student", which has nothing to do with
 * attendance and will be wanted by the next screen that filters by venture.
 */
export async function listAttendanceVentureOptions() {
  await connectToDatabase();

  const ventures = await StudentVenture.find()
    .select('ventureName studentId')
    .populate<{ studentId: { name: string } | null }>('studentId', 'name')
    .lean()
    .exec();

  return ventures
    .map((venture) => ({
      _id: venture._id.toString(),
      ventureName: venture.ventureName,
      studentName: venture.studentId?.name ?? 'Unknown student',
    }))
    .sort((a, b) => a.ventureName.localeCompare(b.ventureName));
}
