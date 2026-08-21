import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  ActivitySupportMapping,
  FacultyProfile,
  MentorProfile,
  StudentProfile,
  StudentSupportActivity,
  StudentVenture,
  Subject,
  SubjectFacultyAssignment,
  SubjectSession,
  SupportActivity,
  Term,
  User,
  VentureActivity,
  VentureActivityAttendance,
  Workshop,
  WorkshopAttendance,
} from '@/models';
import { containsPattern } from '@/lib/utils/regex';
import type { AttendanceMark } from '@/lib/constants/status';
import { WORKSHOP_MODE_LABELS, WORKSHOP_TYPE_LABELS } from '@/lib/constants/workshops';
import { dateRangeClause, resolveVentureScope, sortRows } from '@/services/reports/scope';
import { humanise } from '../filterLabels';
import { getConsolidatedAttendance } from '@/services/ventures/attendanceService';
import { defineDataset, countSummary } from './types';
import type { ReportFilters } from '@/validators/reportFilters';

// ------------------------------------------------------------ People ----

interface DirectoryRow {
  name: string;
  email: string;
  phone: string | null;
  status: string;
  detailA: string | null;
  detailB: string | null;
  detailC: string | null;
  detailD: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

async function loadDirectory(
  role: 'STUDENT' | 'FACULTY' | 'MENTOR',
  filters: ReportFilters,
): Promise<DirectoryRow[]> {
  await connectToDatabase();

  const query: Record<string, unknown> = { role };
  if (filters.userStatus) query.status = filters.userStatus;
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    query.$or = [{ name: pattern }, { email: pattern }];
  }

  const createdAt = dateRangeClause(filters);
  if (createdAt) query.createdAt = createdAt;

  const users = await User.find(query)
    .select('name email phone status createdAt lastLoginAt')
    .sort({ name: 1 })
    .lean()
    .exec();

  if (users.length === 0) return [];

  const userIds = users.map((user) => user._id);

  const profiles =
    role === 'STUDENT'
      ? await StudentProfile.find({ userId: { $in: userIds } })
          .lean()
          .exec()
      : role === 'FACULTY'
        ? await FacultyProfile.find({ userId: { $in: userIds } })
            .lean()
            .exec()
        : await MentorProfile.find({ userId: { $in: userIds } })
            .lean()
            .exec();

  const byUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

  const rows = users
    .map((user) => {
      const profile = byUser.get(user._id.toString());

      const detail =
        role === 'STUDENT'
          ? {
              a: (profile as { rollNumber?: string } | undefined)?.rollNumber ?? null,
              b: (profile as { batch?: string } | undefined)?.batch ?? null,
              c: (profile as { cluster?: string } | undefined)?.cluster ?? null,
              d: (profile as { background?: string } | undefined)?.background ?? null,
            }
          : role === 'FACULTY'
            ? {
                a: (profile as { designation?: string } | undefined)?.designation ?? null,
                b: (profile as { department?: string } | undefined)?.department ?? null,
                c: (profile as { specialization?: string } | undefined)?.specialization ?? null,
                d: (profile as { bio?: string } | undefined)?.bio ?? null,
              }
            : {
                a: (profile as { company?: string } | undefined)?.company ?? null,
                b: (profile as { designation?: string } | undefined)?.designation ?? null,
                c: (profile as { industry?: string } | undefined)?.industry ?? null,
                d: (profile as { expertise?: string } | undefined)?.expertise ?? null,
              };

      return {
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        status: user.status,
        detailA: detail.a,
        detailB: detail.b,
        detailC: detail.c,
        detailD: detail.d,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
      };
    })
    .filter((row) => role !== 'STUDENT' || !filters.batch || row.detailB === filters.batch);

  return sortRows(rows, filters.sortBy, filters.sortDir, (a, b) => a.name.localeCompare(b.name));
}

function directoryColumns(labels: [string, string, string, string]) {
  return [
    { key: 'name', header: 'Name', value: (r: DirectoryRow) => r.name, width: 22 },
    { key: 'email', header: 'Email', value: (r: DirectoryRow) => r.email, width: 28 },
    { key: 'phone', header: 'Phone', value: (r: DirectoryRow) => r.phone, width: 14 },
    { key: 'detailA', header: labels[0], value: (r: DirectoryRow) => r.detailA, width: 16 },
    { key: 'detailB', header: labels[1], value: (r: DirectoryRow) => r.detailB, width: 16 },
    { key: 'detailC', header: labels[2], value: (r: DirectoryRow) => r.detailC, width: 18 },
    { key: 'detailD', header: labels[3], value: (r: DirectoryRow) => r.detailD, width: 26 },
    { key: 'status', header: 'Status', value: (r: DirectoryRow) => humanise(r.status), width: 10 },
    {
      key: 'createdAt',
      header: 'Created',
      type: 'date' as const,
      value: (r: DirectoryRow) => r.createdAt,
      width: 12,
    },
    {
      key: 'lastLoginAt',
      header: 'Last sign-in',
      type: 'datetime' as const,
      value: (r: DirectoryRow) => r.lastLoginAt,
      width: 18,
    },
  ];
}

export const studentsDataset = defineDataset<DirectoryRow>({
  key: 'students',
  title: 'Students',
  fileBase: 'students',
  roles: ['ADMIN'],
  defaultSortLabel: 'Name',
  columns: directoryColumns(['Roll number', 'Batch', 'Cluster', 'Background']),
  load: ({ filters }) => loadDirectory('STUDENT', filters),
  summarise: countSummary('Students'),
});

export const facultyDataset = defineDataset<DirectoryRow>({
  key: 'faculty',
  title: 'Faculty',
  fileBase: 'faculty',
  roles: ['ADMIN'],
  defaultSortLabel: 'Name',
  columns: directoryColumns(['Designation', 'Department', 'Specialization', 'Bio']),
  load: ({ filters }) => loadDirectory('FACULTY', filters),
  summarise: countSummary('Faculty'),
});

export const mentorsDataset = defineDataset<DirectoryRow>({
  key: 'mentors',
  title: 'Industry mentors',
  fileBase: 'mentors',
  roles: ['ADMIN'],
  defaultSortLabel: 'Name',
  columns: directoryColumns(['Company', 'Designation', 'Industry', 'Expertise']),
  load: ({ filters }) => loadDirectory('MENTOR', filters),
  summarise: countSummary('Mentors'),
});

// ---------------------------------------------------------- Ventures ----

interface VentureRow {
  ventureName: string;
  ventureTitle: string | null;
  studentName: string;
  studentEmail: string;
  rollNumber: string | null;
  industry: string | null;
  targetMarket: string | null;
  problemStatement: string | null;
  solution: string | null;
  fundingStatus: string | null;
  facultyName: string | null;
  mentorName: string | null;
  currentActivity: string | null;
  status: string;
  createdAt: Date;
}

export const venturesDataset = defineDataset<VentureRow>({
  key: 'ventures',
  title: 'Student ventures',
  fileBase: 'ventures',
  roles: ['ADMIN'],
  defaultSortLabel: 'Most recently created',
  columns: [
    { key: 'ventureName', header: 'Venture', value: (r) => r.ventureName, width: 22 },
    { key: 'ventureTitle', header: 'Tagline', value: (r) => r.ventureTitle, width: 26 },
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 20 },
    { key: 'rollNumber', header: 'Roll number', value: (r) => r.rollNumber, width: 12 },
    { key: 'studentEmail', header: 'Email', value: (r) => r.studentEmail, width: 26 },
    { key: 'industry', header: 'Industry', value: (r) => r.industry, width: 16 },
    { key: 'targetMarket', header: 'Target market', value: (r) => r.targetMarket, width: 22 },
    { key: 'problemStatement', header: 'Problem', value: (r) => r.problemStatement, width: 34 },
    { key: 'solution', header: 'Solution', value: (r) => r.solution, width: 34 },
    { key: 'fundingStatus', header: 'Funding', value: (r) => r.fundingStatus, width: 14 },
    { key: 'facultyName', header: 'Faculty', value: (r) => r.facultyName, width: 18 },
    { key: 'mentorName', header: 'Mentor', value: (r) => r.mentorName, width: 18 },
    {
      key: 'currentActivity',
      header: 'Current activity',
      value: (r) => r.currentActivity,
      width: 24,
    },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 12 },
    { key: 'createdAt', header: 'Created', type: 'date', value: (r) => r.createdAt, width: 12 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const scope = await resolveVentureScope(filters);
    const query: Record<string, unknown> = {};
    if (scope !== null) query._id = { $in: scope };

    const ventures = await StudentVenture.find(query)
      .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
        'studentId',
        'name email',
      )
      .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
      .populate<{ mentorId: { _id: unknown; name: string } | null }>('mentorId', 'name')
      .populate<{
        currentVentureActivityId: { _id: unknown; activityCode: string; name: string } | null;
      }>('currentVentureActivityId', 'activityCode name')
      .lean()
      .exec();

    const profiles = await StudentProfile.find({
      userId: {
        $in: ventures
          .map((v) => v.studentId?._id)
          .filter(Boolean)
          .map(String),
      },
    })
      .select('userId rollNumber')
      .lean()
      .exec();
    const rollByUser = new Map(profiles.map((p) => [p.userId.toString(), p.rollNumber]));

    const rows: VentureRow[] = ventures.map((venture) => ({
      ventureName: venture.ventureName,
      ventureTitle: venture.ventureTitle ?? null,
      studentName: venture.studentId?.name ?? 'Unknown',
      studentEmail: venture.studentId?.email ?? '',
      rollNumber: rollByUser.get(String(venture.studentId?._id ?? '')) ?? null,
      industry: venture.industry ?? null,
      targetMarket: venture.targetMarket ?? null,
      problemStatement: venture.problemStatement ?? null,
      solution: venture.solution ?? null,
      fundingStatus: venture.fundingStatus ?? null,
      facultyName: venture.facultyId?.name ?? null,
      mentorName: venture.mentorId?.name ?? null,
      currentActivity: venture.currentVentureActivityId
        ? `${venture.currentVentureActivityId.activityCode} ${venture.currentVentureActivityId.name}`
        : null,
      status: venture.status,
      createdAt: venture.createdAt,
    }));

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  },
  summarise: (rows) => [
    { label: 'Ventures', value: String(rows.length) },
    {
      label: 'Missing a reviewer',
      value: String(rows.filter((r) => !r.facultyName || !r.mentorName).length),
    },
  ],
});

// ------------------------------------------------ Activity masters ----

interface VentureActivityRow {
  activityCode: string;
  name: string;
  description: string | null;
  termName: string | null;
  order: number;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  maxAttempts: number;
  evidenceRequired: boolean;
  supportActivities: string;
  status: string;
}

export const ventureActivitiesDataset = defineDataset<VentureActivityRow>({
  key: 'venture-activities',
  title: 'Venture activities',
  fileBase: 'venture-activities',
  roles: ['ADMIN'],
  defaultSortLabel: 'Activity order',
  columns: [
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'name', header: 'Name', value: (r) => r.name, width: 28 },
    { key: 'termName', header: 'Term', value: (r) => r.termName, width: 10 },
    {
      key: 'order',
      header: 'Order',
      type: 'number',
      align: 'right',
      value: (r) => r.order,
      width: 7,
    },
    { key: 'startDate', header: 'Start date', type: 'date', value: (r) => r.startDate, width: 12 },
    { key: 'endDate', header: 'End date', type: 'date', value: (r) => r.endDate, width: 12 },
    {
      key: 'durationDays',
      header: 'Duration (days)',
      type: 'number',
      align: 'right',
      value: (r) => r.durationDays,
      width: 13,
    },
    {
      key: 'maxAttempts',
      header: 'Max attempts',
      type: 'number',
      align: 'right',
      value: (r) => r.maxAttempts,
      width: 11,
    },
    {
      key: 'evidenceRequired',
      header: 'Evidence required',
      type: 'boolean',
      value: (r) => r.evidenceRequired,
      width: 15,
    },
    {
      key: 'supportActivities',
      header: 'Support activities',
      value: (r) => r.supportActivities,
      width: 20,
    },
    { key: 'description', header: 'Description', value: (r) => r.description, width: 44 },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 10 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const query: Record<string, unknown> = {};
    if (filters.termId) query.termId = filters.termId;
    if (filters.ventureActivityId) query._id = filters.ventureActivityId;
    if (filters.q)
      query.$or = [
        { name: containsPattern(filters.q) },
        { activityCode: containsPattern(filters.q) },
      ];

    const activities = await VentureActivity.find(query)
      .populate<{ termId: { _id: unknown; name: string } | null }>('termId', 'name')
      .sort({ order: 1 })
      .lean()
      .exec();

    const mappings = await ActivitySupportMapping.find({
      ventureActivityId: { $in: activities.map((a) => a._id) },
    })
      .lean()
      .exec();

    const supports = await SupportActivity.find().select('activityCode').lean().exec();
    const codeById = new Map(supports.map((s) => [s._id.toString(), s.activityCode]));

    const byActivity = new Map<string, string[]>();
    for (const mapping of mappings) {
      const key = mapping.ventureActivityId.toString();
      const code = codeById.get(mapping.supportActivityId.toString());
      if (!code) continue;
      (byActivity.get(key) ?? byActivity.set(key, []).get(key)!).push(code);
    }

    const rows: VentureActivityRow[] = activities.map((activity) => ({
      activityCode: activity.activityCode,
      name: activity.name,
      description: activity.description ?? null,
      termName: activity.termId?.name ?? null,
      order: activity.order,
      startDate: activity.startDate,
      endDate: activity.endDate,
      durationDays: activity.durationDays,
      maxAttempts: activity.maxAttempts,
      evidenceRequired: activity.evidenceRequired,
      supportActivities: (byActivity.get(activity._id.toString()) ?? []).sort().join(', '),
      status: activity.status,
    }));

    return sortRows(rows, filters.sortBy, filters.sortDir, (a, b) => a.order - b.order);
  },
  summarise: countSummary('Activities'),
});

interface SupportActivityRow {
  activityCode: string;
  name: string;
  description: string | null;
  order: number;
  scheduleType: string;
  ventureActivities: string;
}

export const supportActivitiesDataset = defineDataset<SupportActivityRow>({
  key: 'support-activities',
  title: 'Support activities',
  fileBase: 'support-activities',
  roles: ['ADMIN'],
  defaultSortLabel: 'Activity order',
  columns: [
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'name', header: 'Name', value: (r) => r.name, width: 26 },
    {
      key: 'order',
      header: 'Order',
      type: 'number',
      align: 'right',
      value: (r) => r.order,
      width: 7,
    },
    {
      key: 'scheduleType',
      header: 'Schedule type',
      value: (r) => humanise(r.scheduleType),
      width: 16,
    },
    { key: 'ventureActivities', header: 'Supports', value: (r) => r.ventureActivities, width: 24 },
    { key: 'description', header: 'Description', value: (r) => r.description, width: 48 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const query: Record<string, unknown> = {};
    if (filters.supportActivityId) query._id = filters.supportActivityId;

    const supports = await SupportActivity.find(query).sort({ order: 1 }).lean().exec();

    const mappings = await ActivitySupportMapping.find({
      supportActivityId: { $in: supports.map((s) => s._id) },
    })
      .lean()
      .exec();

    const activities = await VentureActivity.find().select('activityCode').lean().exec();
    const codeById = new Map(activities.map((a) => [a._id.toString(), a.activityCode]));

    const bySupport = new Map<string, string[]>();
    for (const mapping of mappings) {
      const key = mapping.supportActivityId.toString();
      const code = codeById.get(mapping.ventureActivityId.toString());
      if (!code) continue;
      (bySupport.get(key) ?? bySupport.set(key, []).get(key)!).push(code);
    }

    const rows: SupportActivityRow[] = supports.map((support) => ({
      activityCode: support.activityCode,
      name: support.name,
      description: support.description ?? null,
      order: support.order,
      scheduleType: support.scheduleType,
      ventureActivities: (bySupport.get(support._id.toString()) ?? []).sort().join(', '),
    }));

    return sortRows(rows, filters.sortBy, filters.sortDir, (a, b) => a.order - b.order);
  },
  summarise: countSummary('Support activities'),
});

// ---------------------------------------------------------- Academic ----

interface SubjectRow {
  code: string;
  name: string;
  termName: string | null;
  credits: number;
  area: string | null;
  faculty: string;
  sessions: number;
  status: string;
  description: string | null;
}

export const subjectsDataset = defineDataset<SubjectRow>({
  key: 'subjects',
  title: 'Subjects',
  fileBase: 'subjects',
  roles: ['ADMIN'],
  defaultSortLabel: 'Subject code',
  columns: [
    { key: 'code', header: 'Code', value: (r) => r.code, width: 9 },
    { key: 'name', header: 'Name', value: (r) => r.name, width: 30 },
    { key: 'termName', header: 'Term', value: (r) => r.termName, width: 10 },
    {
      key: 'credits',
      header: 'Credits',
      type: 'number',
      align: 'right',
      value: (r) => r.credits,
      width: 8,
    },
    { key: 'area', header: 'Area', value: (r) => r.area, width: 18 },
    { key: 'faculty', header: 'Teaching faculty', value: (r) => r.faculty, width: 28 },
    {
      key: 'sessions',
      header: 'Sessions',
      type: 'number',
      align: 'right',
      value: (r) => r.sessions,
      width: 9,
    },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 10 },
    { key: 'description', header: 'Description', value: (r) => r.description, width: 40 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const query: Record<string, unknown> = {};
    if (filters.termId) query.termId = filters.termId;
    if (filters.subjectId) query._id = filters.subjectId;
    if (filters.q)
      query.$or = [{ name: containsPattern(filters.q) }, { code: containsPattern(filters.q) }];

    const subjects = await Subject.find(query)
      .populate<{ termId: { _id: unknown; name: string } | null }>('termId', 'name')
      .sort({ code: 1 })
      .lean()
      .exec();

    const subjectIds = subjects.map((subject) => subject._id);

    const [assignments, sessionCounts] = await Promise.all([
      SubjectFacultyAssignment.find({ subjectId: { $in: subjectIds } })
        .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
        .lean()
        .exec(),
      SubjectSession.aggregate<{ _id: unknown; count: number }>([
        { $match: { subjectId: { $in: subjectIds } } },
        { $group: { _id: '$subjectId', count: { $sum: 1 } } },
      ]).exec(),
    ]);

    const facultyBySubject = new Map<string, string[]>();
    for (const assignment of assignments) {
      const key = assignment.subjectId.toString();
      const name = assignment.facultyId?.name;
      if (!name) continue;
      (facultyBySubject.get(key) ?? facultyBySubject.set(key, []).get(key)!).push(name);
    }

    const countBySubject = new Map(sessionCounts.map((s) => [String(s._id), s.count]));

    const rows: SubjectRow[] = subjects.map((subject) => ({
      code: subject.code,
      name: subject.name,
      termName: subject.termId?.name ?? null,
      credits: subject.credits,
      area: subject.area ?? null,
      faculty: (facultyBySubject.get(subject._id.toString()) ?? []).sort().join(', '),
      sessions: countBySubject.get(subject._id.toString()) ?? 0,
      status: subject.status,
      description: subject.description ?? null,
    }));

    return sortRows(rows, filters.sortBy, filters.sortDir, (a, b) => a.code.localeCompare(b.code));
  },
  summarise: countSummary('Subjects'),
});

interface SessionRow {
  date: Date;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  facultyName: string;
  sessionType: string;
  supportActivity: string | null;
  topic: string | null;
  notes: string | null;
}

export const sessionsDataset = defineDataset<SessionRow>({
  key: 'sessions',
  title: 'Subject sessions',
  description: 'Sessions linked to a support activity are how Expert Workshops are scheduled.',
  fileBase: 'subject-sessions',
  roles: ['ADMIN'],
  defaultSortLabel: 'Most recent first',
  columns: [
    { key: 'date', header: 'Date', type: 'date', value: (r) => r.date, width: 12 },
    { key: 'startTime', header: 'Start', value: (r) => r.startTime, width: 7 },
    { key: 'endTime', header: 'End', value: (r) => r.endTime, width: 7 },
    { key: 'subjectCode', header: 'Code', value: (r) => r.subjectCode, width: 9 },
    { key: 'subjectName', header: 'Subject', value: (r) => r.subjectName, width: 26 },
    { key: 'facultyName', header: 'Faculty', value: (r) => r.facultyName, width: 20 },
    { key: 'sessionType', header: 'Type', value: (r) => humanise(r.sessionType), width: 12 },
    {
      key: 'supportActivity',
      header: 'Support activity',
      value: (r) => r.supportActivity,
      width: 22,
    },
    { key: 'topic', header: 'Topic', value: (r) => r.topic, width: 26 },
    { key: 'notes', header: 'Notes', value: (r) => r.notes, width: 34 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const query: Record<string, unknown> = {};
    if (filters.subjectId) query.subjectId = filters.subjectId;
    if (filters.facultyId) query.facultyId = filters.facultyId;
    if (filters.supportActivityId) query.supportActivityId = filters.supportActivityId;

    const date = dateRangeClause(filters);
    if (date) query.date = date;

    const sessions = await SubjectSession.find(query)
      .populate<{
        subjectId: { _id: unknown; code: string; name: string; termId: unknown } | null;
      }>('subjectId', 'code name termId')
      .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
      .populate<{
        supportActivityId: { _id: unknown; activityCode: string; name: string } | null;
      }>('supportActivityId', 'activityCode name')
      .sort({ date: -1, startTime: 1 })
      .lean()
      .exec();

    // A term filter applies through the session's subject.
    const termFiltered = filters.termId
      ? sessions.filter(
          (session) => String(session.subjectId?.termId ?? '') === String(filters.termId),
        )
      : sessions;

    const rows: SessionRow[] = termFiltered.map((session) => ({
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      subjectCode: session.subjectId?.code ?? '',
      subjectName: session.subjectId?.name ?? '',
      facultyName: session.facultyId?.name ?? '',
      sessionType: session.sessionType,
      supportActivity: session.supportActivityId
        ? `${session.supportActivityId.activityCode} ${session.supportActivityId.name}`
        : null,
      topic: session.topic ?? null,
      notes: session.notes ?? null,
    }));

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
  },
  summarise: countSummary('Sessions'),
});

interface TermRow {
  termNumber: number;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  subjects: number;
  ventureActivities: number;
}

export const termsDataset = defineDataset<TermRow>({
  key: 'terms',
  title: 'Terms',
  fileBase: 'terms',
  roles: ['ADMIN'],
  defaultSortLabel: 'Term number',
  columns: [
    {
      key: 'termNumber',
      header: 'Term',
      type: 'number',
      align: 'right',
      value: (r) => r.termNumber,
      width: 7,
    },
    { key: 'name', header: 'Name', value: (r) => r.name, width: 16 },
    { key: 'startDate', header: 'Start date', type: 'date', value: (r) => r.startDate, width: 12 },
    { key: 'endDate', header: 'End date', type: 'date', value: (r) => r.endDate, width: 12 },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 12 },
    {
      key: 'subjects',
      header: 'Subjects',
      type: 'number',
      align: 'right',
      value: (r) => r.subjects,
      width: 9,
    },
    {
      key: 'ventureActivities',
      header: 'Venture activities',
      type: 'number',
      align: 'right',
      value: (r) => r.ventureActivities,
      width: 15,
    },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const terms = await Term.find(filters.termId ? { _id: filters.termId } : {})
      .sort({ termNumber: 1 })
      .lean()
      .exec();

    const [subjectCounts, activityCounts] = await Promise.all([
      Subject.aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: '$termId', count: { $sum: 1 } } },
      ]).exec(),
      VentureActivity.aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: '$termId', count: { $sum: 1 } } },
      ]).exec(),
    ]);

    const subjectsByTerm = new Map(subjectCounts.map((s) => [String(s._id), s.count]));
    const activitiesByTerm = new Map(activityCounts.map((a) => [String(a._id), a.count]));

    return terms.map((term) => ({
      termNumber: term.termNumber,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
      status: term.status,
      subjects: subjectsByTerm.get(term._id.toString()) ?? 0,
      ventureActivities: activitiesByTerm.get(term._id.toString()) ?? 0,
    }));
  },
  summarise: countSummary('Terms'),
});

// -------------------------------------------- Support participation ----

interface SupportParticipationRow {
  studentName: string;
  studentEmail: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  scheduleType: string;
  status: string;
  attemptNumber: number;
  submittedAt: Date | null;
  notes: string | null;
  facultyName: string | null;
  mentorName: string | null;
}

export const supportParticipationDataset = defineDataset<SupportParticipationRow>({
  key: 'support-participation',
  title: 'Support activity participation',
  description:
    'Participation records. These carry no attempt limit and no dual-review requirement.',
  fileBase: 'support-participation',
  roles: ['ADMIN'],
  defaultSortLabel: 'Student, then activity order',
  columns: [
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 20 },
    { key: 'studentEmail', header: 'Email', value: (r) => r.studentEmail, width: 26 },
    { key: 'ventureName', header: 'Venture', value: (r) => r.ventureName, width: 20 },
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'activityName', header: 'Support activity', value: (r) => r.activityName, width: 24 },
    {
      key: 'scheduleType',
      header: 'Schedule type',
      value: (r) => humanise(r.scheduleType),
      width: 16,
    },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 16 },
    {
      key: 'attemptNumber',
      header: 'Updates',
      type: 'number',
      align: 'right',
      value: (r) => r.attemptNumber,
      width: 9,
    },
    {
      key: 'submittedAt',
      header: 'Last update',
      type: 'datetime',
      value: (r) => r.submittedAt,
      width: 18,
    },
    { key: 'facultyName', header: 'Faculty', value: (r) => r.facultyName, width: 18 },
    { key: 'mentorName', header: 'Mentor', value: (r) => r.mentorName, width: 18 },
    { key: 'notes', header: 'Notes', value: (r) => r.notes, width: 40 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const ventureScope = await resolveVentureScope(filters);

    const query: Record<string, unknown> = {};
    if (ventureScope !== null) query.studentVentureId = { $in: ventureScope };
    if (filters.supportActivityId) query.supportActivityId = filters.supportActivityId;
    if (filters.supportStatus) query.status = filters.supportStatus;

    const records = await StudentSupportActivity.find(query).lean().exec();
    if (records.length === 0) return [];

    const [supports, ventures] = await Promise.all([
      SupportActivity.find({ _id: { $in: records.map((r) => r.supportActivityId) } })
        .lean()
        .exec(),
      StudentVenture.find({ _id: { $in: records.map((r) => r.studentVentureId) } })
        .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
          'studentId',
          'name email',
        )
        .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
        .populate<{ mentorId: { _id: unknown; name: string } | null }>('mentorId', 'name')
        .lean()
        .exec(),
    ]);

    const supportById = new Map(supports.map((s) => [s._id.toString(), s]));
    const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));

    const rows = records
      .map((record): SupportParticipationRow | null => {
        const support = supportById.get(record.supportActivityId.toString());
        const venture = ventureById.get(record.studentVentureId.toString());
        if (!support || !venture) return null;

        return {
          studentName: venture.studentId?.name ?? 'Unknown',
          studentEmail: venture.studentId?.email ?? '',
          ventureName: venture.ventureName,
          activityCode: support.activityCode,
          activityName: support.name,
          scheduleType: support.scheduleType,
          status: record.status,
          attemptNumber: record.attemptNumber,
          submittedAt: record.submittedAt ?? null,
          notes: record.notes ?? null,
          facultyName: venture.facultyId?.name ?? null,
          mentorName: venture.mentorId?.name ?? null,
        };
      })
      .filter((row): row is SupportParticipationRow => row !== null);

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) =>
        a.studentName.localeCompare(b.studentName) || a.activityCode.localeCompare(b.activityCode),
    );
  },
  summarise: (rows) => [
    { label: 'Records', value: String(rows.length) },
    { label: 'Completed', value: String(rows.filter((r) => r.status === 'COMPLETED').length) },
  ],
});

// -------------------------------------------- Venture activity attendance ----

interface AttendanceExportRow {
  date: Date;
  studentName: string;
  rollNumber: string | null;
  batch: string | null;
  ventureName: string;
  activityCode: string;
  activityName: string;
  status: AttendanceMark;
  remarks: string | null;
  markedByName: string | null;
  markedAt: Date;
  /** Carried so rows can fall back to programme order; not a column. */
  order: number;
}

/**
 * The Venture Activity register, one line per mark.
 *
 * Flat rather than a student-per-row grid with a date per column: a grid cannot
 * carry a remark or a marked-by, and those two are the whole reason the record
 * exists rather than a boolean.
 */
export const ventureAttendanceDataset = defineDataset<AttendanceExportRow>({
  key: 'venture-attendance',
  title: 'Venture activity attendance',
  description:
    'Who attended each Venture Activity, on each date. Attendance gates nothing — an absence does not lock an activity, consume an attempt or affect a review.',
  fileBase: 'venture-attendance',
  roles: ['ADMIN'],
  defaultSortLabel: 'Date, then student',
  columns: [
    { key: 'date', header: 'Date', type: 'date', value: (r) => r.date, width: 13 },
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 22 },
    { key: 'rollNumber', header: 'Roll number', value: (r) => r.rollNumber, width: 14 },
    { key: 'batch', header: 'Batch', value: (r) => r.batch, width: 9 },
    { key: 'ventureName', header: 'Venture', value: (r) => r.ventureName, width: 22 },
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'activityName', header: 'Venture activity', value: (r) => r.activityName, width: 26 },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 10 },
    { key: 'remarks', header: 'Remarks', value: (r) => r.remarks, width: 32 },
    { key: 'markedByName', header: 'Marked by', value: (r) => r.markedByName, width: 20 },
    { key: 'markedAt', header: 'Marked at', type: 'datetime', value: (r) => r.markedAt, width: 18 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const ventureScope = await resolveVentureScope(filters);

    const query: Record<string, unknown> = {};
    if (ventureScope !== null) query.studentVentureId = { $in: ventureScope };
    if (filters.ventureActivityId) query.ventureActivityId = filters.ventureActivityId;
    if (filters.attendanceStatus) query.status = filters.attendanceStatus;

    const range = dateRangeClause(filters);
    if (range) query.date = range;

    const marks = await VentureActivityAttendance.find(query)
      .populate<{ markedBy: { name: string } | null }>('markedBy', 'name')
      .lean()
      .exec();

    if (marks.length === 0) return [];

    const [activities, ventures, profiles] = await Promise.all([
      VentureActivity.find({ _id: { $in: marks.map((m) => m.ventureActivityId) } })
        .select('activityCode name order')
        .lean()
        .exec(),
      StudentVenture.find({ _id: { $in: marks.map((m) => m.studentVentureId) } })
        .populate<{ studentId: { _id: unknown; name: string } | null }>('studentId', 'name')
        .lean()
        .exec(),
      StudentProfile.find().select('userId rollNumber batch').lean().exec(),
    ]);

    const activityById = new Map(activities.map((a) => [a._id.toString(), a]));
    const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));
    const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const rows = marks
      .map((mark) => {
        const activity = activityById.get(mark.ventureActivityId.toString());
        const venture = ventureById.get(mark.studentVentureId.toString());
        if (!activity || !venture) return null;

        const profile = venture.studentId?._id
          ? profileByUser.get(String(venture.studentId._id))
          : undefined;

        return {
          date: mark.date,
          studentName: venture.studentId?.name ?? 'Unknown student',
          rollNumber: profile?.rollNumber ?? null,
          batch: profile?.batch ?? null,
          ventureName: venture.ventureName,
          activityCode: activity.activityCode,
          activityName: activity.name,
          status: mark.status,
          remarks: mark.remarks ?? null,
          markedByName: mark.markedBy?.name ?? null,
          markedAt: mark.markedAt,
          order: activity.order,
        };
      })
      .filter((row): row is AttendanceExportRow => row !== null);

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) =>
        b.date.getTime() - a.date.getTime() ||
        a.order - b.order ||
        a.studentName.localeCompare(b.studentName),
    );
  },
  summarise: (rows) => {
    const present = rows.filter((r) => r.status === 'PRESENT').length;
    const dates = new Set(rows.map((r) => r.date.toISOString())).size;

    return [
      { label: 'Records', value: String(rows.length) },
      { label: 'Dates', value: String(dates) },
      { label: 'Present', value: String(present) },
      { label: 'Absent', value: String(rows.length - present) },
      {
        label: 'Attendance',
        value: rows.length === 0 ? '—' : `${Math.round((present / rows.length) * 100)}%`,
      },
    ];
  },
});

// ------------------------------------- Consolidated attendance (long form) ----

interface ConsolidatedExportRow {
  studentName: string;
  rollNumber: string | null;
  batch: string | null;
  ventureName: string;
  activityCode: string;
  activityName: string;
  sessions: number;
  present: number;
  absent: number;
  unmarked: number;
  attendanceRate: number | null;
  studentAttendanceRate: number | null;
  order: number;
}

/**
 * The consolidated grid, one line per student per activity.
 *
 * The screen shows a matrix; a spreadsheet gets the same numbers long-form,
 * because `columns` here is a fixed list and the activities are not — a grid
 * export would silently truncate or misalign the day a thirteenth activity is
 * added. Long form also pivots, which is what a grid in Excel is usually
 * wanted for anyway.
 *
 * Fed by the same service call as the page, so the export cannot disagree with
 * what was on screen when it was taken.
 */
export const ventureAttendanceConsolidatedDataset = defineDataset<ConsolidatedExportRow>({
  key: 'venture-attendance-consolidated',
  title: 'Consolidated venture attendance',
  description:
    'Every student against every Venture Activity: present, absent, and the register dates they were never marked on.',
  fileBase: 'venture-attendance-consolidated',
  roles: ['ADMIN'],
  defaultSortLabel: 'Roll number, then programme order',
  columns: [
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 22 },
    { key: 'rollNumber', header: 'Roll number', value: (r) => r.rollNumber, width: 14 },
    { key: 'batch', header: 'Batch', value: (r) => r.batch, width: 9 },
    { key: 'ventureName', header: 'Venture', value: (r) => r.ventureName, width: 22 },
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'activityName', header: 'Venture activity', value: (r) => r.activityName, width: 26 },
    {
      key: 'sessions',
      header: 'Register dates',
      type: 'number',
      value: (r) => r.sessions,
      width: 14,
    },
    { key: 'present', header: 'Present', type: 'number', value: (r) => r.present, width: 9 },
    { key: 'absent', header: 'Absent', type: 'number', value: (r) => r.absent, width: 9 },
    // Named "Not marked" rather than "Missing": the gap is in the register, and
    // saying otherwise reads as an accusation against the student.
    { key: 'unmarked', header: 'Not marked', type: 'number', value: (r) => r.unmarked, width: 12 },
    {
      key: 'attendanceRate',
      header: 'Attendance',
      type: 'percent',
      value: (r) => r.attendanceRate,
      width: 12,
    },
    {
      key: 'studentAttendanceRate',
      header: 'Student overall',
      type: 'percent',
      value: (r) => r.studentAttendanceRate,
      width: 14,
    },
  ],
  load: async ({ filters }) => {
    const consolidated = await getConsolidatedAttendance(filters);

    const activityById = new Map(consolidated.columns.map((column) => [column._id, column]));

    const rows = consolidated.rows.flatMap((student) =>
      student.cells
        // Somebody who is not on an activity has no line for it, rather than a
        // line of zeroes that reads like a perfect absence record.
        .filter((cell) => cell.assigned)
        .map((cell) => {
          const activity = activityById.get(cell.ventureActivityId);

          return {
            studentName: student.studentName,
            rollNumber: student.rollNumber || null,
            batch: student.batch || null,
            ventureName: student.ventureName,
            activityCode: activity?.activityCode ?? '',
            activityName: activity?.name ?? '',
            sessions: activity?.sessions ?? 0,
            present: cell.present,
            absent: cell.absent,
            unmarked: cell.unmarked,
            attendanceRate: cell.attendanceRate,
            studentAttendanceRate: student.attendanceRate,
            order: activity?.order ?? 0,
          };
        }),
    );

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) =>
        (a.rollNumber ?? '').localeCompare(b.rollNumber ?? '') ||
        a.studentName.localeCompare(b.studentName) ||
        a.order - b.order,
    );
  },
  summarise: (rows) => {
    const present = rows.reduce((sum, row) => sum + row.present, 0);
    const absent = rows.reduce((sum, row) => sum + row.absent, 0);
    const students = new Set(rows.map((row) => `${row.rollNumber}:${row.studentName}`)).size;

    return [
      { label: 'Students', value: String(students) },
      { label: 'Present', value: String(present) },
      { label: 'Absent', value: String(absent) },
      { label: 'Not marked', value: String(rows.reduce((sum, row) => sum + row.unmarked, 0)) },
      {
        label: 'Attendance',
        value:
          present + absent === 0 ? '—' : `${Math.round((present / (present + absent)) * 100)}%`,
      },
    ];
  },
});

// -------------------------------------------------- Workshop attendance ----

interface WorkshopAttendanceExportRow {
  date: Date;
  workshopTitle: string;
  workshopType: string;
  mode: string;
  studentName: string;
  rollNumber: string | null;
  batch: string | null;
  email: string;
  status: AttendanceMark;
  remarks: string | null;
  markedByName: string | null;
  markedAt: Date;
}

/**
 * The workshop register, one line per mark.
 *
 * No date column of its own beyond the workshop's: a workshop happens once, so
 * its date and the mark's date are the same fact and printing both would
 * invite them to disagree.
 */
export const workshopAttendanceDataset = defineDataset<WorkshopAttendanceExportRow>({
  key: 'workshop-attendance',
  title: 'Workshop attendance',
  description:
    'Who attended each workshop, with the remark and who recorded it. Attendance gates nothing.',
  fileBase: 'workshop-attendance',
  roles: ['ADMIN'],
  defaultSortLabel: 'Workshop date, then student',
  columns: [
    { key: 'date', header: 'Date', type: 'date', value: (r) => r.date, width: 13 },
    { key: 'workshopTitle', header: 'Workshop', value: (r) => r.workshopTitle, width: 30 },
    { key: 'workshopType', header: 'Type', value: (r) => r.workshopType, width: 18 },
    { key: 'mode', header: 'Mode', value: (r) => r.mode, width: 10 },
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 22 },
    { key: 'rollNumber', header: 'Roll number', value: (r) => r.rollNumber, width: 14 },
    { key: 'batch', header: 'Batch', value: (r) => r.batch, width: 9 },
    { key: 'email', header: 'Email', value: (r) => r.email, width: 26 },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 10 },
    { key: 'remarks', header: 'Remarks', value: (r) => r.remarks, width: 32 },
    { key: 'markedByName', header: 'Marked by', value: (r) => r.markedByName, width: 20 },
    { key: 'markedAt', header: 'Marked at', type: 'datetime', value: (r) => r.markedAt, width: 18 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    const workshopQuery: Record<string, unknown> = {};
    if (filters.workshopId) workshopQuery._id = filters.workshopId;
    if (filters.workshopType) workshopQuery.workshopType = filters.workshopType;
    if (filters.workshopMode) workshopQuery.mode = filters.workshopMode;
    if (filters.workshopStatus) workshopQuery.status = filters.workshopStatus;
    if (filters.q) workshopQuery.title = containsPattern(filters.q);

    const range = dateRangeClause(filters);
    if (range) workshopQuery.date = range;

    const workshops = await Workshop.find(workshopQuery)
      .select('title workshopType mode date')
      .lean()
      .exec();

    if (workshops.length === 0) return [];

    const markQuery: Record<string, unknown> = {
      workshopId: { $in: workshops.map((workshop) => workshop._id) },
    };
    if (filters.attendanceStatus) markQuery.status = filters.attendanceStatus;
    if (filters.studentId) markQuery.studentId = filters.studentId;

    const marks = await WorkshopAttendance.find(markQuery)
      .populate<{ markedBy: { name: string } | null }>('markedBy', 'name')
      .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
        'studentId',
        'name email',
      )
      .lean()
      .exec();

    if (marks.length === 0) return [];

    const profiles = await StudentProfile.find().select('userId rollNumber batch').lean().exec();

    const workshopById = new Map(workshops.map((workshop) => [workshop._id.toString(), workshop]));
    const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

    const rows = marks
      .map((mark) => {
        const workshop = workshopById.get(mark.workshopId.toString());
        const student = mark.studentId;
        if (!workshop || !student) return null;

        const profile = profileByUser.get(String(student._id));

        return {
          date: workshop.date,
          workshopTitle: workshop.title,
          workshopType: WORKSHOP_TYPE_LABELS[workshop.workshopType],
          mode: WORKSHOP_MODE_LABELS[workshop.mode],
          studentName: student.name,
          rollNumber: profile?.rollNumber ?? null,
          batch: profile?.batch ?? null,
          email: student.email,
          status: mark.status,
          remarks: mark.remarks ?? null,
          markedByName: mark.markedBy?.name ?? null,
          markedAt: mark.markedAt,
        };
      })
      .filter((row): row is WorkshopAttendanceExportRow => row !== null);

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) => b.date.getTime() - a.date.getTime() || a.studentName.localeCompare(b.studentName),
    );
  },
  summarise: (rows) => {
    const present = rows.filter((r) => r.status === 'PRESENT').length;
    const workshops = new Set(rows.map((r) => r.workshopTitle)).size;

    return [
      { label: 'Records', value: String(rows.length) },
      { label: 'Workshops', value: String(workshops) },
      { label: 'Present', value: String(present) },
      { label: 'Absent', value: String(rows.length - present) },
      {
        label: 'Attendance',
        value: rows.length === 0 ? '—' : `${Math.round((present / rows.length) * 100)}%`,
      },
    ];
  },
});
