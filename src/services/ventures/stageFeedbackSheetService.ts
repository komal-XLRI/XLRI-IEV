import 'server-only';
import type { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  StageFeedbackEntry,
  StageFeedbackSheet,
  StudentProfile,
  StudentVenture,
  StudentVentureActivity,
  User,
  VentureActivity,
} from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { readImportUpload } from '@/lib/import/readUpload';
import {
  FeedbackSheetFormatError,
  nameKey,
  parseFeedbackSheet,
  splitStudentCell,
} from '@/lib/feedbackSheet/parseFeedbackSheet';
import * as notify from '@/services/notifications/events';

export interface StageFeedbackSheetSummary {
  id: string;
  title: string;
  fileName: string;
  matchedOn: string;
  totalRows: number;
  matchedRows: number;
  matchedStudents: number;
  unmatched: Array<{ line: number; identifier: string; reason: string }>;
  uploadedAt: Date;
  uploadedByName: string | null;
  students: Array<{ studentId: string; name: string; rollNumber: string | null }>;
}

/**
 * Stores a feedback sheet against a stage and gives each matched student
 * their own row.
 *
 * Nothing is written unless at least one row matches a student: a sheet that
 * matched nobody is almost always the wrong file or the wrong column, and
 * saving it would only leave an empty upload to clean up.
 */
export async function uploadStageFeedbackSheet(input: {
  ventureActivityId: string;
  title: string;
  fileName: string;
  bytes: Uint8Array;
  actorId: string;
}): Promise<StageFeedbackSheetSummary> {
  await connectToDatabase();

  const activity = await VentureActivity.findById(input.ventureActivityId)
    .select('_id activityCode name')
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const { grid } = await readImportUpload(input.bytes);

  let parsed;
  try {
    parsed = parseFeedbackSheet(grid);
  } catch (error) {
    if (error instanceof FeedbackSheetFormatError) throw new ValidationError(error.message);
    throw error;
  }

  // Resolve every identifier in two queries rather than one per row.
  const rolls = [
    ...new Set(parsed.rows.flatMap((row) => (row.rollNumber ? [row.rollNumber] : []))),
  ];
  const emails = [...new Set(parsed.rows.flatMap((row) => (row.email ? [row.email] : [])))];

  const [profiles, users] = await Promise.all([
    StudentProfile.find({ rollNumber: { $in: rolls } })
      .select('userId rollNumber')
      .lean()
      .exec(),
    User.find({ email: { $in: emails }, role: 'STUDENT' })
      .select('_id email')
      .lean()
      .exec(),
  ]);

  const byRoll = new Map(profiles.map((p) => [p.rollNumber.toUpperCase(), p.userId.toString()]));
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u._id.toString()]));
  const resolveName = parsed.rows.some((row) => row.studentName)
    ? await nameResolver()
    : () => ({ studentId: null, reason: '' });

  const matched: Array<{
    studentId: string;
    line: number;
    fields: { label: string; value: string }[];
  }> = [];
  const unmatched: Array<{ line: number; identifier: string; reason: string }> = [];

  for (const row of parsed.rows) {
    let studentId =
      (row.rollNumber ? byRoll.get(row.rollNumber) : undefined) ??
      (row.email ? byEmail.get(row.email) : undefined) ??
      null;
    let reason = 'No student has this roll number or email';

    if (!studentId && row.studentName) {
      ({ studentId, reason } = resolveName(row.studentName));
    }

    if (studentId) matched.push({ studentId, line: row.line, fields: row.fields });
    else {
      unmatched.push({
        line: row.line,
        identifier: row.studentName ?? row.rollNumber ?? row.email ?? '',
        reason:
          row.studentName || row.rollNumber || row.email ? reason : 'The student cell is empty',
      });
    }
  }

  if (matched.length === 0) {
    throw new ValidationError(
      `None of the ${parsed.rows.length} rows matched a student. Check the "${parsed.matchedOn}" column holds students' names, roll numbers or emails.`,
    );
  }

  // The stage record, where a student has one, is what the notification links to.
  const studentIds = [...new Set(matched.map((m) => m.studentId))];
  const ventures = await StudentVenture.find({ studentId: { $in: studentIds } })
    .select('_id studentId')
    .lean()
    .exec();
  const records = await StudentVentureActivity.find({
    studentVentureId: { $in: ventures.map((v) => v._id) },
    ventureActivityId: activity._id,
  })
    .select('_id studentVentureId')
    .lean()
    .exec();

  const studentByVenture = new Map(ventures.map((v) => [v._id.toString(), v.studentId.toString()]));
  const recordByStudent = new Map(
    records.map((r) => [studentByVenture.get(r.studentVentureId.toString()), r._id.toString()]),
  );

  const sheet = await StageFeedbackSheet.create({
    ventureActivityId: activity._id,
    title: input.title,
    fileName: input.fileName,
    matchedOn: parsed.matchedOn,
    totalRows: parsed.rows.length,
    matchedRows: matched.length,
    matchedStudents: studentIds.length,
    unmatched,
    uploadedBy: input.actorId,
  });

  await StageFeedbackEntry.insertMany(
    matched.map((m) => ({
      sheetId: sheet._id,
      ventureActivityId: activity._id,
      studentId: m.studentId,
      recordId: recordByStudent.get(m.studentId) ?? null,
      line: m.line,
      fields: m.fields,
    })),
  );

  await notify.stageFeedbackSheetShared(
    studentIds.map((studentId) => ({
      studentId,
      recordId: recordByStudent.get(studentId) ?? null,
    })),
    `${activity.activityCode} · ${activity.name}`,
    input.title,
  );

  const [summary] = await summarise([sheet.toObject()]);
  return summary!;
}

async function summarise(
  sheets: Array<{
    _id: Types.ObjectId;
    title: string;
    fileName: string;
    matchedOn: string;
    totalRows: number;
    matchedRows: number;
    matchedStudents: number;
    unmatched: Array<{ line: number; identifier: string; reason?: string }>;
    createdAt: Date;
    uploadedBy: Types.ObjectId;
  }>,
): Promise<StageFeedbackSheetSummary[]> {
  if (sheets.length === 0) return [];

  const entries = await StageFeedbackEntry.find({ sheetId: { $in: sheets.map((s) => s._id) } })
    .select('sheetId studentId')
    .lean()
    .exec();

  const userIds = [
    ...new Set([
      ...entries.map((e) => e.studentId.toString()),
      ...sheets.map((s) => s.uploadedBy.toString()),
    ]),
  ];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select('_id name')
      .lean()
      .exec(),
    StudentProfile.find({ userId: { $in: userIds } })
      .select('userId rollNumber')
      .lean()
      .exec(),
  ]);
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const rollById = new Map(profiles.map((p) => [p.userId.toString(), p.rollNumber]));

  return sheets.map((sheet) => {
    const id = sheet._id.toString();
    const studentIds = [
      ...new Set(
        entries.filter((e) => e.sheetId.toString() === id).map((e) => e.studentId.toString()),
      ),
    ];

    return {
      id,
      title: sheet.title,
      fileName: sheet.fileName,
      matchedOn: sheet.matchedOn,
      totalRows: sheet.totalRows,
      matchedRows: sheet.matchedRows,
      matchedStudents: sheet.matchedStudents,
      unmatched: sheet.unmatched.map((u) => ({
        line: u.line,
        identifier: u.identifier,
        reason: u.reason ?? '',
      })),
      uploadedAt: sheet.createdAt,
      uploadedByName: nameById.get(sheet.uploadedBy.toString()) ?? null,
      students: studentIds
        .map((studentId) => ({
          studentId,
          name: nameById.get(studentId) ?? 'Removed student',
          rollNumber: rollById.get(studentId) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

/**
 * Matches a student cell such as "Kushagra Garg - Dhanush" to a student.
 *
 * The name is tried first. When two students share it, the startup name after
 * the dash settles which one; when the name matches nobody — a typo, a
 * nickname — the startup name alone is tried, since each startup belongs to
 * one student. Anything still ambiguous is left unmatched rather than guessed:
 * showing one student another's feedback is worse than showing none.
 */
async function nameResolver() {
  const [students, ventures] = await Promise.all([
    User.find({ role: 'STUDENT' }).select('_id name').lean().exec(),
    StudentVenture.find().select('studentId ventureName').lean().exec(),
  ]);

  const byName = new Map<string, string[]>();
  for (const student of students) {
    const key = nameKey(student.name);
    byName.set(key, [...(byName.get(key) ?? []), student._id.toString()]);
  }
  const byVenture = new Map<string, string[]>();
  const ventureOf = new Map<string, string>();
  for (const venture of ventures) {
    const key = nameKey(venture.ventureName);
    const studentId = venture.studentId.toString();
    byVenture.set(key, [...(byVenture.get(key) ?? []), studentId]);
    ventureOf.set(studentId, key);
  }

  return (cell: string): { studentId: string | null; reason: string } => {
    const { name, venture } = splitStudentCell(cell);
    const ventureKey = venture ? nameKey(venture) : null;
    const named = byName.get(nameKey(name)) ?? byName.get(nameKey(cell)) ?? [];

    if (named.length === 1) return { studentId: named[0]!, reason: '' };

    if (named.length > 1) {
      const narrowed = ventureKey ? named.filter((id) => ventureOf.get(id) === ventureKey) : [];
      return narrowed.length === 1
        ? { studentId: narrowed[0]!, reason: '' }
        : {
            studentId: null,
            reason: `${named.length} students are called "${name}"; add the startup name after a dash to tell them apart`,
          };
    }

    const byStartup = ventureKey ? (byVenture.get(ventureKey) ?? []) : [];
    if (byStartup.length === 1) return { studentId: byStartup[0]!, reason: '' };

    return {
      studentId: null,
      reason: venture
        ? 'No student has this name, and no startup has this name'
        : 'No student has this name',
    };
  };
}

/** Every sheet uploaded for a stage, newest first. */
export async function listStageFeedbackSheets(
  ventureActivityId: string,
): Promise<StageFeedbackSheetSummary[]> {
  await connectToDatabase();
  const sheets = await StageFeedbackSheet.find({ ventureActivityId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  return summarise(sheets);
}

/** Removes a sheet and every student's row from it. Returns the stage it belonged to. */
export async function deleteStageFeedbackSheet(sheetId: string): Promise<string> {
  await connectToDatabase();
  const sheet = await StageFeedbackSheet.findById(sheetId)
    .select('ventureActivityId')
    .lean()
    .exec();
  if (!sheet) throw new NotFoundError('Feedback sheet not found');

  await StageFeedbackEntry.deleteMany({ sheetId: sheet._id }).exec();
  await StageFeedbackSheet.deleteOne({ _id: sheet._id }).exec();
  return sheet.ventureActivityId.toString();
}

export interface StudentSheetFeedback {
  entryId: string;
  sheetId: string;
  sheetTitle: string;
  sharedAt: Date;
  fields: Array<{ label: string; value: string }>;
}

/**
 * One student's rows on one stage.
 *
 * Filtered on `studentId` — the caller passes the signed-in student's own id,
 * never one taken from the request, so nobody else's row can come back.
 */
export async function getStudentSheetFeedback(
  studentId: string,
  ventureActivityId: string,
): Promise<StudentSheetFeedback[]> {
  await connectToDatabase();

  const entries = await StageFeedbackEntry.find({ studentId, ventureActivityId })
    // Newest sheet first (ids grow with time), then in sheet order. Not by the
    // entry's own createdAt: rows saved together can differ by a millisecond,
    // which reversed them.
    .sort({ sheetId: -1, line: 1 })
    .lean()
    .exec();
  if (entries.length === 0) return [];

  const sheets = await StageFeedbackSheet.find({ _id: { $in: entries.map((e) => e.sheetId) } })
    .select('_id title createdAt')
    .lean()
    .exec();
  const sheetById = new Map(sheets.map((s) => [s._id.toString(), s]));

  return entries.flatMap((entry) => {
    const sheet = sheetById.get(entry.sheetId.toString());
    if (!sheet) return [];
    return [
      {
        entryId: entry._id.toString(),
        sheetId: entry.sheetId.toString(),
        sheetTitle: sheet.title,
        sharedAt: sheet.createdAt,
        fields: entry.fields.map((f) => ({ label: f.label, value: f.value })),
      },
    ];
  });
}
