# IEV Student Activity Tracking System — Claude Code Build Instructions

## 1. Objective

Build a production-ready **IEV Student Activity Tracking System** using the agreed MongoDB architecture.

The system tracks:

- 12 Venture Activities
- 8 Support Activities
- 3 Terms
- Subjects
- Expert Workshops
- Students
- Faculty
- Industry Mentors
- Student ventures
- Submissions
- Evidence
- Faculty + Mentor reviews
- Attempts and revisions
- Progress and reports

Use the **latest stable Next.js available at implementation time**, TypeScript, MongoDB/Mongoose and Cloudinary.

Do not convert the database to SQL/MySQL and do not add unnecessary collections.

---

## 2. Roles

Exactly four roles:

```text
ADMIN
STUDENT
FACULTY
MENTOR
```

### Admin

Admin can manage:

- Users
- Students
- Faculty
- Mentors
- Terms
- Subjects
- Subject sessions
- Support activities
- Venture activities
- Activity dates
- Maximum attempts
- Venture/support mappings
- Student venture assignments
- Reports
- Reviews and progress

### Student

Student can:

- Login using OTP
- View profile
- View venture
- View assigned faculty and mentor
- View venture timeline
- View start/end dates
- View maximum attempts
- Submit work
- Upload evidence
- View faculty feedback
- View mentor feedback
- Resubmit when revision is requested and attempts remain
- View support activities

### Faculty

Faculty can:

- View assigned students/ventures
- View submissions and evidence
- Perform Faculty reviews
- Approve
- Request revision/reject according to workflow
- Add comments
- View progress

Subject Faculty primarily teaches subjects. Being a Subject Faculty member does **not automatically make that person a Venture Activity reviewer**.

### Mentor

Mentor can:

- View assigned students/ventures
- View submissions/evidence
- Perform Mentor reviews
- Approve
- Request revision/reject
- Add comments
- View progress

---

# 3. Technology Stack

Use:

- Next.js latest stable
- App Router
- TypeScript
- React
- Tailwind CSS
- MongoDB
- Mongoose
- Zod
- Route Handlers / Server Actions
- Cloudinary
- OTP authentication
- Resend or configured email provider
- ESLint
- Prettier

Use a service/repository architecture where appropriate.

Before coding, inspect the existing repository and preserve any already-working foundation.

Do not blindly recreate existing database or infrastructure code.

---

# 4. Authentication

Authentication is OTP based.

Users contain:

```text
otpHash
otpExpiresAt
otpAttempts
otpLastSentAt
```

Never store plaintext OTP.

Flow:

```text
Request OTP
    ↓
Generate secure OTP
    ↓
Hash OTP
    ↓
Store hash + expiry
    ↓
Send email
    ↓
Verify OTP
    ↓
Create authenticated session
```

Implement:

- OTP expiry
- single-use OTP
- request rate limiting
- verification attempt limits
- server-side role authorization
- secure HTTP-only session/cookie strategy where applicable

Never trust a role supplied by the browser.

---

# 5. Final Database Architecture

## MODULE 1 — USER MANAGEMENT

### Collection: Users

```text
_id
name
email
phone
role
status

otpHash
otpExpiresAt
otpAttempts
otpLastSentAt

createdAt
updatedAt
```

Roles:

```text
ADMIN
STUDENT
FACULTY
MENTOR
```

---

### Collection: StudentProfiles

```text
_id
userId
rollNumber
batch
cluster
background
strengths
weakness
personalContext
createdAt
updatedAt
```

Do not duplicate name/email/phone from Users.

---

### Collection: FacultyProfiles

```text
_id
userId
designation
department
specialization
bio
createdAt
updatedAt
```

---

### Collection: MentorProfiles

```text
_id
userId
company
designation
industry
expertise
bio
createdAt
updatedAt
```

Relationships:

```text
User 1 → 1 StudentProfile
User 1 → 1 FacultyProfile
User 1 → 1 MentorProfile
```

depending on role.

---

# 6. MODULE 2 — ACADEMIC

## Collection: Terms

```text
_id
termNumber
name
startDate
endDate
status
createdAt
updatedAt
```

There are 3 Terms.

---

## Collection: Subjects

```text
_id
code
name
credits
area
termId
description
status
createdAt
updatedAt
```

Seed the provided programme subject list and keep it configurable from Admin.

---

## Collection: SubjectFacultyAssignments

```text
_id
subjectId
facultyId
createdAt
updatedAt
```

A subject can have one or more faculty members.

---

## Collection: SubjectSessions

```text
_id
subjectId
facultyId
date
startTime
endTime
sessionType
supportActivityId
notes
createdAt
updatedAt
```

### Important Workshop Rule

Expert Workshops are one of the Support Activities.

They should be connected to the relevant academic SubjectSession.

Do **not** create a separate duplicate workshop scheduling system initially.

For example:

```text
SupportActivity A7 = Expert Workshops
             ↓
SubjectSession
             ↓
Subject
```

---

## Collection: SubjectAttendance

If attendance is enabled:

```text
_id
sessionId
studentId
status
markedAt
markedBy
remarks
```

Do not invent a mandatory workshop attendance rule because it has not been finalized.

---

# 7. MODULE 3 — VENTURE

## Collection: StudentVentures

This is the main student venture record.

```text
_id
studentId

ventureName
ventureTitle
industry
targetMarket
problemStatement
solution
fundingStatus

currentVentureActivityId

facultyId
mentorId

status

createdAt
updatedAt
```

Relationships:

```text
studentId → Users._id
facultyId → Users._id
mentorId → Users._id
currentVentureActivityId → VentureActivities._id
```

Initial rule:

```text
One primary venture per student
```

unless requirements later change.

---

# 8. Collection: VentureActivities

Master definition of the 12 Venture Activities.

Seed:

```text
V01 Idea Generation
V02 Problem Validation & Customer Discovery
V03 Market & Competitor Research
V04 Solution Concept Definition
V05 Prototype Building
V06 Customer Feedback & Iteration
V07 Business Model Design
V08 Costing, Pricing & Unit Economics
V09 MVP / Pilot Launch
V10 First Sale / First Revenue
V11 Legal Setup, Compliance & Accounts
V12 Scale-up Plan, Funding Readiness & Final Pitch
```

Fields:

```text
_id
activityCode
name
description
termId
order

startDate
endDate
durationDays

maxAttempts
evidenceRequired

status

createdAt
updatedAt
```

### Duration

Each activity needs:

```text
startDate
endDate
```

The programme guideline is approximately **12–15 days per Venture Activity**.

Do not hardcode exactly 12 or 15 days.

Calculate/display actual duration from configured dates.

Validate:

```text
endDate >= startDate
```

`durationDays` may be calculated from the dates and stored if useful for reporting.

---

# 9. Collection: ActivitySupportMappings

A Venture Activity can use multiple Support Activities, and one Support Activity can support multiple Venture Activities.

Therefore this is a **many-to-many** relationship.

Fields:

```text
_id
ventureActivityId
supportActivityId
createdAt
```

Example:

```text
V01
  ↓
A1, A2, A8
```

and:

```text
A1
  ↓
V01, V02, V03, ...
```

Add a unique compound index:

```text
ventureActivityId + supportActivityId
```

Do not put only a simple `supportActivityId` in VentureActivities.

---

# 10. Collection: StudentVentureActivities

This tracks the student's progress through each Venture Activity.

```text
_id

studentVentureId
ventureActivityId

facultyId
mentorId

reviewFacultyId
reviewMentorId

attemptNumber

status

facultyReviewStatus
mentorReviewStatus

startedAt
completedAt

createdAt
updatedAt
```

Suggested status:

```text
NOT_STARTED
IN_PROGRESS
UNDER_REVIEW
REVISION_REQUIRED
COMPLETED
MAX_ATTEMPTS_REACHED
```

Review status:

```text
PENDING
APPROVED
REVISION_REQUIRED
REJECTED
```

### Reviewer fields

`facultyId` and `mentorId` represent current assignment.

`reviewFacultyId` and `reviewMentorId` preserve the reviewer snapshot/context for the activity.

The immutable review history is stored separately in Reviews.

Do not create a `StudentActivityAssignments` collection.

---

# 11. MODULE 4 — SUPPORT ACTIVITIES

## Collection: SupportActivities

Exactly 8 Support Activities.

Seed the agreed framework:

```text
A1 Classroom Courses
A2 Idea Generation & Pitch
A3 Tinkering Exercises
A4 Weekend Internships
A5 Demo Sessions
A6 Market Immersion
A7 Expert Workshops
A8 Exposure Visits
```

Fields:

```text
_id
activityCode
name
description
order
scheduleType
createdAt
updatedAt
```

Possible schedule types:

```text
ACADEMIC_SESSION
INDEPENDENT
FIELD
WEEKEND
SPECIAL
```

For A7:

```text
scheduleType = ACADEMIC_SESSION
```

because workshops happen with the relevant subject/class schedule.

---

## Collection: StudentSupportActivities

```text
_id

studentVentureId
supportActivityId

facultyId
mentorId

reviewFacultyId
reviewMentorId

attemptNumber
submittedAt

status

createdAt
updatedAt
```

Suggested statuses:

```text
PENDING
IN_PROGRESS
UNDER_REVIEW
COMPLETED
REVISION_REQUIRED
REJECTED
```

Keep this collection simple and flexible because some support activities may represent participation rather than a formal submission.

---

# 12. MODULE 5 — SUBMISSIONS

## Collection: VentureSubmissions

Multiple attempts must be preserved as separate submission documents.

```text
_id

studentVentureActivityId
submittedBy

attemptNumber
submissionType
remarks

submittedAt

createdAt
updatedAt
```

Submission types:

```text
INITIAL
REVISION
FINAL
```

Important:

If a student resubmits, create a new document.

Never overwrite the previous submission.

Add unique index:

```text
studentVentureActivityId + attemptNumber
```

---

# 13. MODULE 6 — REVIEWS

## Collection: Reviews

A single submission requires two independent reviewers:

```text
Faculty
Mentor
```

Fields:

```text
_id

submissionId
reviewerId
reviewerType

status
comments

reviewedAt

createdAt
updatedAt
```

Reviewer type:

```text
FACULTY
MENTOR
```

Status:

```text
APPROVED
REVISION_REQUIRED
REJECTED
```

Example:

```text
Submission S1
   |
   +---- Faculty Review
   |
   +---- Mentor Review
```

This means there will normally be two Review entries for a fully reviewed submission.

---

# 14. MODULE 7 — EVIDENCE

## Collection: Evidence

```text
_id

submissionId

fileName
fileUrl
publicId

fileType
resourceType
fileSize

uploadedBy
uploadedAt

createdAt
```

Use Cloudinary for actual file storage.

MongoDB stores only metadata and Cloudinary references.

Never store file binaries in MongoDB.

---

# 15. Final Collection List

The agreed initial database should contain:

```text
Users
StudentProfiles
FacultyProfiles
MentorProfiles

Terms
Subjects
SubjectFacultyAssignments
SubjectSessions
SubjectAttendance

StudentVentures
VentureActivities
ActivitySupportMappings
StudentVentureActivities

SupportActivities
StudentSupportActivities

VentureSubmissions
Reviews
Evidence
```

Optional future collections only if actually required:

```text
SupportSubmissions
AuditLogs
Notifications
```

Do not create them unnecessarily now.

---

# 16. Core Relationships

The main ER structure is:

```text
Users
 |
 +---- StudentProfiles
 |
 +---- FacultyProfiles
 |
 +---- MentorProfiles
 |
 +---- StudentVentures
          |
          +---- StudentVentureActivities
          |           |
          |           +---- VentureSubmissions
          |                       |
          |                       +---- Reviews
          |                       |
          |                       +---- Evidence
          |
          +---- Faculty
          |
          +---- Mentor

VentureActivities
       |
       +---- ActivitySupportMappings
                    |
                    +---- SupportActivities
                              |
                              +---- StudentSupportActivities

Terms
  |
  +---- Subjects
           |
           +---- SubjectFacultyAssignments
           |
           +---- SubjectSessions
                         |
                         +---- Expert Workshop Support Activity
```

---

# 17. Mandatory Dual Review Rule

This is one of the most important business rules.

A Venture Activity is complete only if:

```text
facultyReviewStatus === APPROVED
AND
mentorReviewStatus === APPROVED
```

Example:

```text
Faculty = APPROVED
Mentor = PENDING

Overall = UNDER_REVIEW
```

Example:

```text
Faculty = APPROVED
Mentor = APPROVED

Overall = COMPLETED
```

If either reviewer requests revision:

```text
Overall = REVISION_REQUIRED
```

Do not allow one reviewer to complete the activity alone.

---

# 18. Submission Attempt Rule

Each Venture Activity has:

```text
maxAttempts
```

Example:

```text
maxAttempts = 3
```

Allowed:

```text
Attempt 1
Attempt 2
Attempt 3
```

Attempt 4 must be blocked by the backend.

Never rely only on frontend validation.

Server must calculate/verify the next attempt.

When revision is requested:

```text
StudentVentureActivity.status = REVISION_REQUIRED
```

If attempts remain, student can submit again.

On resubmission:

```text
new VentureSubmission
new attemptNumber
new review records
```

Previous submissions and reviews remain unchanged.

If final attempt fails:

```text
MAX_ATTEMPTS_REACHED
```

---

# 19. Venture Activity Progression

The initial workflow is sequential.

Example:

```text
V01 COMPLETED
       ↓
V02 becomes available
       ↓
V02 COMPLETED
       ↓
V03 becomes available
```

Future activities should normally be locked until prerequisites are satisfied.

UI states:

```text
LOCKED
NOT_STARTED
IN_PROGRESS
UNDER_REVIEW
REVISION_REQUIRED
COMPLETED
MAX_ATTEMPTS_REACHED
```

Do not allow a student to manually mark an activity complete.

---

# 20. Date Logic

Every Venture Activity displays:

```text
Start Date
End Date
Duration
Maximum Attempts
```

Example:

```text
V05 Prototype Building

09 Nov 2026 → 27 Nov 2026
Maximum Attempts: 3
```

The 12–15 day duration is a planning guideline.

Do not reject an activity merely because its configured duration is outside 12–15 days unless Admin explicitly wants that validation.

---

# 21. Cloudinary

Use secure/signed upload flow.

```text
Student
   ↓
Authenticated upload endpoint
   ↓
Cloudinary
   ↓
secureUrl + publicId + metadata
   ↓
Evidence collection
```

Validate:

- authenticated user
- ownership
- file type
- file size
- related submission

Never expose Cloudinary secret credentials in client code.

Environment variables should include appropriate values such as:

```text
MONGODB_URI
AUTH_SECRET
RESEND_API_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Use the project's actual environment naming convention if one already exists.

---

# 22. Admin Dashboard

Create sections for:

### Dashboard

- Total students
- Total ventures
- Active ventures
- Completed activities
- Under review
- Revision required
- Max-attempt cases
- Faculty count
- Mentor count

### Students

- Search
- Filter
- Add
- Edit
- Import
- View venture
- Assign Faculty
- Assign Mentor

### Faculty

- Add/edit
- View assignments
- View pending reviews

### Mentors

- Add/edit
- View assignments
- View pending reviews

### Academic

- Terms
- Subjects
- Faculty assignments
- Subject sessions
- Workshop/session integration
- Attendance if enabled

### Venture Activities

- Add/edit
- Term
- Order
- Start date
- End date
- Maximum attempts
- Evidence requirement
- Support mappings

### Support Activities

- Add/edit
- Order
- Description
- Schedule type

### Reviews

- Pending
- Approved
- Revision required
- Filter by reviewer/student/activity

### Reports

- Student progress
- Venture progress
- Activity completion
- Review summary
- Attempts/revisions

---

# 23. Student Dashboard

Show:

```text
Student
Venture
Faculty
Mentor
Current Activity
Overall Progress
```

Example timeline:

```text
V01 ✓ Completed
V02 ✓ Completed
V03 Under Review
V04 Locked
V05 Locked
...
```

Activity page should show:

```text
Activity Name
Description
Term
Start Date
End Date
Duration
Maximum Attempts
Attempts Used
Attempts Remaining

Required Support Activities

Faculty Review
Mentor Review

Submission History
Evidence
Feedback
```

---

# 24. Faculty Review Screen

Show:

```text
Student
Venture
Activity
Attempt Number
Submission
Evidence
Previous feedback
```

Faculty can:

```text
Approve
Request Revision
Reject
```

and add comments.

Backend must verify that the logged-in Faculty is actually assigned to the student/activity.

---

# 25. Mentor Review Screen

Same structure as Faculty, but:

```text
reviewerType = MENTOR
```

Mentor cannot create Faculty reviews.

Faculty cannot create Mentor reviews.

---

# 26. Academic Subject Rule

Subjects and Venture Activities are separate concepts.

Subject Faculty teaches academic subjects.

A Subject Faculty member does not automatically become a Venture reviewer.

Venture review assignment is controlled through:

```text
StudentVenture.facultyId
StudentVenture.mentorId
```

and activity/review snapshot fields.

---

# 27. Support Activity Rule

Support Activities support Venture Activities.

Example:

```text
A1 + A2 + A8
       ↓
V01
```

Another:

```text
A3 + A5
       ↓
V05
```

The UI must support both directions:

### Venture Activity → required Support Activities

and:

### Support Activity → supported Venture Activities

This is why `ActivitySupportMappings` exists.

---

# 28. API / Server-Side Validation

Every mutation must validate:

1. Authentication
2. Role
3. Zod input schema
4. Resource ownership
5. Assignment
6. Activity state
7. Attempt limit
8. Review rules

Never trust:

```text
role
studentId
reviewerId
attemptNumber
status
```

from the client.

Calculate sensitive values on the server.

---

# 29. Mongoose Indexes

Recommended:

### Users

```text
email unique
role
```

### StudentProfiles

```text
userId unique
rollNumber unique
```

### StudentVentures

```text
studentId unique
facultyId
mentorId
```

### VentureActivities

```text
activityCode unique
termId
order
```

### ActivitySupportMappings

```text
ventureActivityId + supportActivityId unique
```

### StudentVentureActivities

```text
studentVentureId + ventureActivityId unique
```

### VentureSubmissions

```text
studentVentureActivityId + attemptNumber unique
```

### Reviews

```text
submissionId
reviewerId
reviewerType
```

### Evidence

```text
submissionId
```

---

# 30. Transaction Requirements

Use MongoDB transactions for critical multi-document state changes where supported.

For submission:

```text
Validate attempt
    ↓
Create VentureSubmission
    ↓
Update StudentVentureActivity
```

For final approval:

```text
Create Review
    ↓
Update review status
    ↓
Check Faculty + Mentor approval
    ↓
If both approved:
    StudentVentureActivity = COMPLETED
    ↓
Advance current venture activity
```

Do not advance progress after only one approval.

---

# 31. Project Structure

Use a scalable structure similar to:

```text
src/
  app/
    (auth)/
    admin/
    student/
    faculty/
    mentor/
    api/

  components/
    ui/
    forms/
    tables/
    dashboards/
    venture/
    academic/
    support/
    reviews/

  lib/
    db/
    auth/
    cloudinary/
    email/
    validation/
    permissions/
    constants/
    utils/

  models/
    User.ts
    StudentProfile.ts
    FacultyProfile.ts
    MentorProfile.ts
    Term.ts
    Subject.ts
    SubjectFacultyAssignment.ts
    SubjectSession.ts
    SubjectAttendance.ts
    StudentVenture.ts
    VentureActivity.ts
    ActivitySupportMapping.ts
    StudentVentureActivity.ts
    SupportActivity.ts
    StudentSupportActivity.ts
    VentureSubmission.ts
    Review.ts
    Evidence.ts

  services/
    auth/
    students/
    faculty/
    mentors/
    academic/
    ventures/
    support/
    submissions/
    reviews/
    reports/

  repositories/
  validators/
  types/
  config/

scripts/
  seed.ts
```

Adapt this to any existing project structure.

---

# 32. Development Phases

Implement in order.

## Phase 1 — Foundation

- Inspect repository
- MongoDB connection
- Environment validation
- Mongoose
- Error handling
- Logger
- Utilities
- ESLint
- Prettier
- TypeScript

## Phase 2 — Authentication

- Users
- OTP
- Email
- Sessions
- Role protection

## Phase 3 — Profiles

- StudentProfiles
- FacultyProfiles
- MentorProfiles

## Phase 4 — Academic

- Terms
- Subjects
- SubjectFacultyAssignments
- SubjectSessions
- Attendance if enabled

## Phase 5 — Support

- SupportActivities
- ActivitySupportMappings
- StudentSupportActivities

## Phase 6 — Venture

- StudentVentures
- VentureActivities
- StudentVentureActivities
- Dates
- Duration
- Maximum attempts

## Phase 7 — Submission

- VentureSubmissions
- Cloudinary
- Evidence

## Phase 8 — Reviews

- Faculty reviews
- Mentor reviews
- Dual approval
- Revision
- Attempt limits
- History

## Phase 9 — Dashboards

- Admin
- Student
- Faculty
- Mentor

## Phase 10 — Reports

- Student progress
- Venture progress
- Activity completion
- Review summaries
- Attempts/revisions

## Phase 11 — Testing and production hardening

---

# 33. Testing Requirements

Test at least:

## Authentication

- Valid OTP
- Invalid OTP
- Expired OTP
- Reused OTP
- Rate limit
- Role authorization

## Student

- Can see own venture
- Cannot see another student's private data
- Cannot review
- Cannot modify reviewer assignment
- Cannot exceed attempts

## Faculty

- Can review assigned student
- Cannot review unassigned student
- Cannot perform Mentor review

## Mentor

- Can review assigned student
- Cannot review unassigned student
- Cannot perform Faculty review

## Reviews

- Faculty approval alone = not completed
- Mentor approval alone = not completed
- Both approvals = completed
- Revision = revision required
- Review history preserved

## Attempts

For maxAttempts = 3:

```text
Attempt 1 → allowed
Attempt 2 → allowed
Attempt 3 → allowed
Attempt 4 → blocked
```

## Dates

- End date cannot be before start date
- Duration displays correctly

## Evidence

- Valid upload works
- Invalid file rejected
- Oversized file rejected
- Correct submission linkage
- Unauthorized upload rejected

## Progression

- Future activity locked
- Completed activity unlocks next activity according to configured progression rules

---

# 34. Seed Data

Seed:

## Terms

```text
Term 1
Term 2
Term 3
```

## Venture Activities

All 12 listed above.

## Support Activities

All 8 listed above.

## Subjects

Use the provided programme list, including:

### Term 1

```text
Design Thinkng (DT)
Economic Environment for Business-1 (EEB)
Entrepreneurship (ENT)
Entrepreneurs Marketing (EM)
Maths for Entrepreneurs (ME)
Individual Behavior and Understanding Self (IBUS)
Management Accounting (MA)
```

### Term 2

```text
Economic Environment for Business 2
Business Strategy (BS)
Business Law (BLA)
Go-To-Market Strategy (GTM)
Cost Accounting (CA)
Communication (CMM)
Innovation Management (INV)
```

### Term 3

```text
Building Organization and Talent
Financial Management and Valuation
Managing Marketing Operations
Managing Operations
Data Analytics & AI
Innovation-II
Digital Marketing
```

Keep all subjects editable from Admin.

---

# 35. Important Decisions — Do Not Change Without Requirement

Do NOT create:

```text
StudentActivityAssignments
```

Current Faculty/Mentor assignment is managed through StudentVenture and activity-level reviewer fields.

Do NOT create:

```text
StudentLogin
FacultyLogin
MentorLogin
```

Use Users.

Do NOT create a separate Workshop collection initially.

Expert Workshops are Support Activities and integrate with SubjectSessions.

Do NOT create a separate Attempt collection.

Use VentureSubmissions with `attemptNumber`.

Do NOT store files in MongoDB.

Use Cloudinary.

---

# 36. Acceptance Criteria

The system is complete when:

- OTP authentication works
- All four roles work
- 12 Venture Activities exist
- 8 Support Activities exist
- 3 Terms exist
- Subjects are manageable
- Expert Workshops integrate with SubjectSessions
- Venture activities have start/end dates
- Venture activities have maximum attempts
- Student-specific venture progress works
- Multiple submissions work
- Attempt limits are enforced server-side
- Cloudinary evidence uploads work
- Faculty reviews work
- Mentor reviews work
- Both approvals are mandatory
- Revision workflow works
- Review history is preserved
- Future activities are controlled by progression rules
- Admin dashboards work
- Student dashboard works
- Faculty dashboard works
- Mentor dashboard works
- Reports work
- TypeScript passes
- ESLint passes
- Production build passes
- Protected APIs are actually protected
- No secrets are exposed to the client

---

# 37. Final Claude Code Instructions

Do not build the entire system in one uncontrolled pass.

For each phase:

1. Inspect the existing code.
2. Identify files that need modification.
3. Implement the phase.
4. Run TypeScript checks.
5. Run ESLint.
6. Run relevant tests.
7. Fix issues.
8. Continue to the next phase.

Do not silently redesign the database.

The following architecture is final for the initial version:

```text
Users
StudentProfiles
FacultyProfiles
MentorProfiles

Terms
Subjects
SubjectFacultyAssignments
SubjectSessions
SubjectAttendance

StudentVentures
VentureActivities
ActivitySupportMappings
StudentVentureActivities

SupportActivities
StudentSupportActivities

VentureSubmissions
Reviews
Evidence
```

Critical rules:

```text
12 Venture Activities
8 Support Activities
3 Terms

Every Venture Activity:
- startDate
- endDate
- maxAttempts

Multiple submission attempts are allowed up to maxAttempts.

Faculty approval is mandatory.
Mentor approval is mandatory.

Both approvals are required for completion.

Review history must be preserved.

Current Faculty/Mentor assignments are managed through StudentVenture/activity records.

Do not create StudentActivityAssignments.

Expert Workshops are Support Activities integrated with SubjectSessions.

Cloudinary stores files.
MongoDB stores file metadata.

OTP authentication is used.
```

Prioritize correctness, maintainability, security, clean architecture and strict server-side enforcement of the business rules.
