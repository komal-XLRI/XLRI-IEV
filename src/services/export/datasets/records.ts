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
} from '@/models';
import { containsPattern } from '@/lib/utils/regex';
import { dateRangeClause, resolveVentureScope, sortRows } from '@/services/reports/scope';
import { humanise } from '../filterLabels';
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
