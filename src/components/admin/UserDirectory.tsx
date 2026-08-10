'use client';

import { useState, useTransition } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { RecordDialog } from './RecordDialog';
import { createUserAction, setUserStatusAction } from '@/app/actions/adminUsers';
import { formatDate } from '@/lib/utils/dates';
import type { Role } from '@/lib/constants/roles';

export interface DirectoryUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  createdAt: string;
  detail?: string;
  batch?: string;
}

const STATUS_TONE = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
  SUSPENDED: 'danger',
} as const;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

const ROLE_NOUN: Record<Exclude<Role, 'ADMIN'>, string> = {
  STUDENT: 'student',
  FACULTY: 'faculty member',
  MENTOR: 'mentor',
};

/**
 * Deactivation runs through a confirmation rather than a bare submit button.
 *
 * It is the one destructive control in the directory — an inactive account
 * cannot sign in — and it previously sat one stray click away in a dense table
 * row. The Server Action is called directly with the same FormData the form
 * used to post, so the server contract is unchanged.
 */
function StatusAction({ user, role }: { user: DirectoryUser; role: Exclude<Role, 'ADMIN'> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const deactivating = user.status === 'ACTIVE';
  const nextStatus = deactivating ? 'INACTIVE' : 'ACTIVE';

  function apply() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('userId', user._id);
      formData.set('status', nextStatus);

      const result = await setUserStatusAction(null, formData);
      setConfirming(false);

      notify(
        result.ok
          ? {
              tone: 'success',
              title: deactivating ? 'Account deactivated' : 'Account activated',
              description: `${user.name} can ${deactivating ? 'no longer' : 'now'} sign in.`,
            }
          : { tone: 'error', title: 'Could not update the account', description: result.message },
      );
    });
  }

  return (
    <>
      <Button
        variant={deactivating ? 'secondary' : 'primary'}
        size="sm"
        disabled={pending}
        onClick={() => (deactivating ? setConfirming(true) : apply())}
      >
        {deactivating ? 'Deactivate' : 'Activate'}
      </Button>

      <ConfirmDialog
        open={confirming}
        busy={pending}
        onClose={() => setConfirming(false)}
        onConfirm={apply}
        title={`Deactivate ${user.name}?`}
        confirmLabel="Deactivate"
        message={
          <>
            <p>
              This {ROLE_NOUN[role]} will no longer be able to sign in. Their records, submissions
              and review history are kept and nothing is deleted.
            </p>
            <p className="text-muted-foreground mt-2">
              You can reactivate the account at any time.
            </p>
          </>
        }
      />
    </>
  );
}

export function UserDirectory({
  role,
  users,
  detailLabel,
}: {
  role: Exclude<Role, 'ADMIN'>;
  users: DirectoryUser[];
  detailLabel: string;
}) {
  const columns: DataColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'detail', header: detailLabel, hideBelow: 'md' },
    { key: 'phone', header: 'Phone', hideBelow: 'lg', toggleable: true },
    { key: 'created', header: 'Added', hideBelow: 'xl', toggleable: true },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions', align: 'right', sortable: false },
  ];

  const rows: DataRow[] = users.map((user) => ({
    id: user._id,
    cells: [
      { node: <span className="font-medium">{user.name}</span>, sort: user.name, text: user.name },
      {
        node: <span className="text-muted-foreground">{user.email}</span>,
        sort: user.email,
        text: user.email,
      },
      textCell(user.detail),
      textCell(user.phone),
      {
        node: <span className="text-muted-foreground">{formatDate(user.createdAt)}</span>,
        sort: user.createdAt,
        text: formatDate(user.createdAt),
      },
      {
        node: (
          <Badge tone={STATUS_TONE[user.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
            {STATUS_LABEL[user.status] ?? user.status}
          </Badge>
        ),
        sort: user.status,
        text: STATUS_LABEL[user.status] ?? user.status,
      },
      { node: <StatusAction user={user} role={role} /> },
    ],
  }));

  const noun = ROLE_NOUN[role];

  return (
    <Card>
      <CardHeader
        title="Directory"
        description={`${users.length} ${users.length === 1 ? 'record' : 'records'}`}
        action={
          <RecordDialog
            action={createUserAction}
            triggerLabel={`Add ${role === 'FACULTY' ? 'faculty' : noun}`}
            title={`Add a ${noun}`}
            description="The account is created immediately and can sign in with an emailed one-time code."
            submitLabel="Create account"
            successMessage="Account created"
          >
            {({ fieldErrors }) => (
              <>
                <input type="hidden" name="role" value={role} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="name" required error={fieldErrors?.name}>
                    <TextInput id="name" name="name" required autoFocus />
                  </Field>
                  <Field
                    label="Email"
                    htmlFor="email"
                    required
                    error={fieldErrors?.email}
                    hint="Sign-in codes are sent here."
                  >
                    <TextInput id="email" name="email" type="email" required />
                  </Field>
                  <Field label="Phone" htmlFor="phone" error={fieldErrors?.phone}>
                    <TextInput id="phone" name="phone" />
                  </Field>
                  <Field label="Status" htmlFor="status">
                    <Select id="status" name="status" defaultValue="ACTIVE">
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </Select>
                  </Field>
                </div>

                {role === 'STUDENT' ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      label="Roll number"
                      htmlFor="rollNumber"
                      required
                      error={fieldErrors?.['profile.rollNumber']}
                    >
                      <TextInput id="rollNumber" name="rollNumber" required />
                    </Field>
                    <Field
                      label="Batch"
                      htmlFor="batch"
                      required
                      error={fieldErrors?.['profile.batch']}
                    >
                      <TextInput id="batch" name="batch" required placeholder="2026" />
                    </Field>
                    <Field label="Cluster" htmlFor="cluster">
                      <TextInput id="cluster" name="cluster" />
                    </Field>
                  </div>
                ) : null}

                {role === 'FACULTY' ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Designation" htmlFor="designation">
                      <TextInput id="designation" name="designation" />
                    </Field>
                    <Field label="Department" htmlFor="department">
                      <TextInput id="department" name="department" />
                    </Field>
                    <Field label="Specialization" htmlFor="specialization">
                      <TextInput id="specialization" name="specialization" />
                    </Field>
                  </div>
                ) : null}

                {role === 'MENTOR' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Company" htmlFor="company">
                      <TextInput id="company" name="company" />
                    </Field>
                    <Field label="Designation" htmlFor="designation">
                      <TextInput id="designation" name="designation" />
                    </Field>
                    <Field label="Industry" htmlFor="industry">
                      <TextInput id="industry" name="industry" />
                    </Field>
                    <Field label="Expertise" htmlFor="expertise">
                      <TextInput id="expertise" name="expertise" />
                    </Field>
                  </div>
                ) : null}

                {role !== 'STUDENT' ? (
                  <Field label="Bio" htmlFor="bio">
                    <TextArea id="bio" name="bio" rows={3} />
                  </Field>
                ) : null}
              </>
            )}
          </RecordDialog>
        }
      />

      <DataTable
        caption={`${role.toLowerCase()} directory`}
        columns={columns}
        rows={rows}
        searchPlaceholder="Search name, email or roll number"
        emptyTitle={`No ${noun}s yet`}
        emptyDescription={`Add the first ${noun} with the button above, or import a batch from CSV.`}
      />
    </Card>
  );
}
