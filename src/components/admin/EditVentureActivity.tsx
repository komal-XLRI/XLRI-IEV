'use client';

import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { setSupportMappingsAction, updateVentureActivityAction } from '@/app/actions/adminVentures';
import { durationInDays, toDateInputValue } from '@/lib/utils/dates';
import {
  VENTURE_ACTIVITY_GUIDELINE_MAX_DAYS,
  VENTURE_ACTIVITY_GUIDELINE_MIN_DAYS,
} from '@/lib/constants/activities';
import type { TermOption } from './VentureActivityForm';
import { useState } from 'react';

interface ActivityView {
  _id: string;
  activityCode: string;
  name: string;
  description: string;
  termId: string;
  order: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  maxAttempts: number;
  evidenceRequired: boolean;
  status: string;
}

export function EditVentureActivity({
  activity,
  terms,
  supportActivities,
  mappedSupportIds,
}: {
  activity: ActivityView;
  terms: TermOption[];
  supportActivities: Array<{ _id: string; activityCode: string; name: string }>;
  mappedSupportIds: string[];
}) {
  const [startDate, setStartDate] = useState(toDateInputValue(activity.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(activity.endDate));

  const liveDuration =
    startDate && endDate && new Date(endDate) >= new Date(startDate)
      ? durationInDays(new Date(startDate), new Date(endDate))
      : null;

  const outsideGuideline =
    liveDuration !== null &&
    (liveDuration < VENTURE_ACTIVITY_GUIDELINE_MIN_DAYS ||
      liveDuration > VENTURE_ACTIVITY_GUIDELINE_MAX_DAYS);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader title="Activity settings" />
        <CardBody>
          <ActionForm action={updateVentureActivityAction} successMessage="Saved.">
            {({ fieldErrors }) => (
              <div className="space-y-4">
                <input type="hidden" name="activityId" value={activity._id} />

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Code" htmlFor="activityCode">
                    <TextInput
                      id="activityCode"
                      value={activity.activityCode}
                      readOnly
                      disabled
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Order" htmlFor="order" required error={fieldErrors?.order}>
                    <TextInput
                      id="order"
                      name="order"
                      type="number"
                      min={1}
                      required
                      defaultValue={activity.order}
                    />
                  </Field>
                  <Field label="Term" htmlFor="termId" required error={fieldErrors?.termId}>
                    <Select id="termId" name="termId" required defaultValue={activity.termId}>
                      {terms.map((term) => (
                        <option key={term._id} value={term._id}>
                          {term.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="Name" htmlFor="name" required error={fieldErrors?.name}>
                  <TextInput id="name" name="name" required defaultValue={activity.name} />
                </Field>

                <Field label="Description" htmlFor="description">
                  <TextArea
                    id="description"
                    name="description"
                    rows={3}
                    defaultValue={activity.description}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Start date"
                    htmlFor="startDate"
                    required
                    error={fieldErrors?.startDate}
                  >
                    <TextInput
                      id="startDate"
                      name="startDate"
                      type="date"
                      required
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </Field>
                  <Field label="End date" htmlFor="endDate" required error={fieldErrors?.endDate}>
                    <TextInput
                      id="endDate"
                      name="endDate"
                      type="date"
                      required
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Duration"
                    hint={
                      outsideGuideline
                        ? `Outside the ${VENTURE_ACTIVITY_GUIDELINE_MIN_DAYS}–${VENTURE_ACTIVITY_GUIDELINE_MAX_DAYS} day guideline — allowed, not blocked.`
                        : 'Calculated from the dates.'
                    }
                  >
                    <TextInput
                      value={liveDuration !== null ? `${liveDuration} days` : '—'}
                      readOnly
                      disabled
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Maximum attempts"
                    htmlFor="maxAttempts"
                    required
                    hint="Attempt N+1 is refused by the server, not just the form."
                    error={fieldErrors?.maxAttempts}
                  >
                    <TextInput
                      id="maxAttempts"
                      name="maxAttempts"
                      type="number"
                      min={1}
                      max={10}
                      required
                      defaultValue={activity.maxAttempts}
                    />
                  </Field>
                  <Field label="Status" htmlFor="status">
                    <Select id="status" name="status" defaultValue={activity.status}>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </Select>
                  </Field>
                </div>

                <Checkbox
                  name="evidenceRequired"
                  label="Evidence required"
                  defaultChecked={activity.evidenceRequired}
                />

                <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
              </div>
            )}
          </ActionForm>
        </CardBody>
      </Card>

      <Card className="h-fit">
        <CardHeader
          title="Support activities"
          description="Which of the eight support activities feed this venture activity."
        />
        <CardBody>
          <ActionForm action={setSupportMappingsAction} successMessage="Mapping updated.">
            {() => (
              <div className="space-y-3">
                <input type="hidden" name="ventureActivityId" value={activity._id} />

                <ul className="space-y-1.5">
                  {supportActivities.map((support) => (
                    <li key={support._id}>
                      <Checkbox
                        name="supportActivityIds"
                        value={support._id}
                        defaultChecked={mappedSupportIds.includes(support._id)}
                        label={`${support.activityCode} · ${support.name}`}
                      />
                    </li>
                  ))}
                </ul>

                <SubmitButton pendingLabel="Saving…">Save mapping</SubmitButton>
              </div>
            )}
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
