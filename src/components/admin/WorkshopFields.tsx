'use client';

import { useState } from 'react';
import { Mic, UserRound } from 'lucide-react';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import {
  WORKSHOP_MODES,
  WORKSHOP_MODE_LABELS,
  WORKSHOP_STATUSES,
  WORKSHOP_STATUS_LABELS,
  WORKSHOP_TYPES,
  WORKSHOP_TYPE_LABELS,
  requiresMeetingLink,
  requiresVenue,
  type WorkshopMode,
  type WorkshopType,
} from '@/lib/constants/workshops';

export interface WorkshopValues {
  _id?: string;
  title: string;
  description: string;
  workshopType: WorkshopType;
  date: string;
  startTime: string;
  endTime: string;
  mode: WorkshopMode;
  venue: string;
  meetingLink: string;
  hostName: string;
  hostDesignation: string;
  hostOrganisation: string;
  hostLinkedIn: string;
  speakerName: string;
  speakerDesignation: string;
  speakerOrganisation: string;
  speakerLinkedIn: string;
  maxParticipants: string;
  status: string;
}

export const EMPTY_WORKSHOP: WorkshopValues = {
  title: '',
  description: '',
  workshopType: 'FOUNDER_TALK',
  date: '',
  startTime: '',
  endTime: '',
  mode: 'OFFLINE',
  venue: '',
  meetingLink: '',
  hostName: '',
  hostDesignation: '',
  hostOrganisation: '',
  hostLinkedIn: '',
  speakerName: '',
  speakerDesignation: '',
  speakerOrganisation: '',
  speakerLinkedIn: '',
  maxParticipants: '',
  status: 'DRAFT',
};

/**
 * The workshop form body, shared by the create dialog and the edit dialog.
 *
 * Mode is client state for one reason only: which of venue / meeting link is
 * shown and marked required. The server re-derives the same rule from the
 * submitted mode, so a form driven from outside the browser gets the identical
 * answer — this is an affordance, not the validation.
 *
 * A hidden input carries whichever of the two is *not* on screen, so switching
 * mode and saving clears the field that no longer applies rather than leaving a
 * stale venue on a workshop that is now online-only.
 */
export function WorkshopFields({
  values = EMPTY_WORKSHOP,
  fieldErrors,
}: {
  values?: WorkshopValues;
  fieldErrors?: Record<string, string>;
}) {
  const [mode, setMode] = useState<WorkshopMode>(values.mode);

  const showVenue = requiresVenue(mode);
  const showLink = requiresMeetingLink(mode);

  return (
    <>
      <Field label="Workshop title" htmlFor="title" required error={fieldErrors?.title}>
        <TextInput
          id="title"
          name="title"
          required
          autoFocus
          maxLength={200}
          defaultValue={values.title}
          placeholder="Building a venture pitch that lands"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Type"
          htmlFor="workshopType"
          required
          error={fieldErrors?.workshopType}
          hint="What kind of session this is — separate from how it is attended."
        >
          <Select id="workshopType" name="workshopType" required defaultValue={values.workshopType}>
            {WORKSHOP_TYPES.map((option) => (
              <option key={option} value={option}>
                {WORKSHOP_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="status" error={fieldErrors?.status}>
          <Select id="status" name="status" defaultValue={values.status}>
            {WORKSHOP_STATUSES.map((option) => (
              <option key={option} value={option}>
                {WORKSHOP_STATUS_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description" error={fieldErrors?.description}>
        <TextArea
          id="description"
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={values.description}
          placeholder="What the session covers and who it is for."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" required error={fieldErrors?.date}>
          <TextInput id="date" name="date" type="date" required defaultValue={values.date} />
        </Field>
        <Field label="Start time" htmlFor="startTime" required error={fieldErrors?.startTime}>
          <TextInput
            id="startTime"
            name="startTime"
            type="time"
            required
            defaultValue={values.startTime}
          />
        </Field>
        <Field label="End time" htmlFor="endTime" required error={fieldErrors?.endTime}>
          <TextInput
            id="endTime"
            name="endTime"
            type="time"
            required
            defaultValue={values.endTime}
          />
        </Field>
      </div>

      <Field
        label="Mode"
        htmlFor="mode"
        required
        error={fieldErrors?.mode}
        hint={
          mode === 'HYBRID'
            ? 'Hybrid needs both a venue and a joining link.'
            : mode === 'ONLINE'
              ? 'Online workshops need a joining link.'
              : 'Offline workshops need a venue.'
        }
      >
        <Select
          id="mode"
          name="mode"
          required
          value={mode}
          onChange={(event) => setMode(event.target.value as WorkshopMode)}
        >
          {WORKSHOP_MODES.map((option) => (
            <option key={option} value={option}>
              {WORKSHOP_MODE_LABELS[option]}
            </option>
          ))}
        </Select>
      </Field>

      {/* Only the fields the chosen mode can actually use are on screen. The
          other is submitted empty so switching mode clears it server-side. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {showVenue ? (
          <Field
            label="Venue"
            htmlFor="venue"
            required
            error={fieldErrors?.venue}
            className={showLink ? undefined : 'sm:col-span-2'}
          >
            <TextInput
              id="venue"
              name="venue"
              required
              maxLength={300}
              defaultValue={values.venue}
              placeholder="XLRI Jamshedpur, Auditorium 2"
            />
          </Field>
        ) : (
          <input type="hidden" name="venue" value="" />
        )}

        {showLink ? (
          <Field
            label="Online meeting link"
            htmlFor="meetingLink"
            required
            error={fieldErrors?.meetingLink}
            className={showVenue ? undefined : 'sm:col-span-2'}
          >
            <TextInput
              id="meetingLink"
              name="meetingLink"
              type="url"
              required
              inputMode="url"
              maxLength={500}
              defaultValue={values.meetingLink}
              placeholder="https://teams.microsoft.com/…"
            />
          </Field>
        ) : (
          <input type="hidden" name="meetingLink" value="" />
        )}
      </div>

      <PersonBlock
        legend="Host"
        icon="host"
        prefix="host"
        values={values}
        fieldErrors={fieldErrors}
      />
      <PersonBlock
        legend="Speaker"
        icon="speaker"
        prefix="speaker"
        values={values}
        fieldErrors={fieldErrors}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Maximum participants"
          htmlFor="maxParticipants"
          hint="Leave blank for no cap."
          error={fieldErrors?.maxParticipants}
        >
          <TextInput
            id="maxParticipants"
            name="maxParticipants"
            type="number"
            min={1}
            max={100000}
            defaultValue={values.maxParticipants}
          />
        </Field>
      </div>
    </>
  );
}

/**
 * Host and speaker take the same four fields, so they are one component rather
 * than two near-identical blocks that drift apart on the next change.
 */
function PersonBlock({
  legend,
  icon,
  prefix,
  values,
  fieldErrors,
}: {
  legend: string;
  icon: 'host' | 'speaker';
  prefix: 'host' | 'speaker';
  values: WorkshopValues;
  fieldErrors?: Record<string, string>;
}) {
  const Icon = icon === 'host' ? UserRound : Mic;
  const nameKey = `${prefix}Name` as const;
  const designationKey = `${prefix}Designation` as const;
  const organisationKey = `${prefix}Organisation` as const;
  const linkedInKey = `${prefix}LinkedIn` as const;

  return (
    <fieldset className="border-border rounded-card border p-4">
      <legend className="type-overline px-1.5">
        <span className="inline-flex items-center gap-1.5">
          <Icon className="size-3" aria-hidden="true" />
          {legend}
        </span>
      </legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={nameKey} required error={fieldErrors?.[nameKey]}>
          <TextInput
            id={nameKey}
            name={nameKey}
            required
            maxLength={160}
            defaultValue={values[nameKey]}
          />
        </Field>

        <Field label="Designation" htmlFor={designationKey} error={fieldErrors?.[designationKey]}>
          <TextInput
            id={designationKey}
            name={designationKey}
            maxLength={160}
            defaultValue={values[designationKey]}
            placeholder="Founder & CEO"
          />
        </Field>

        <Field
          label="Organisation"
          htmlFor={organisationKey}
          error={fieldErrors?.[organisationKey]}
        >
          <TextInput
            id={organisationKey}
            name={organisationKey}
            maxLength={160}
            defaultValue={values[organisationKey]}
          />
        </Field>

        <Field
          label="LinkedIn profile"
          htmlFor={linkedInKey}
          error={fieldErrors?.[linkedInKey]}
          hint="Optional. Must be a linkedin.com URL."
        >
          <TextInput
            id={linkedInKey}
            name={linkedInKey}
            type="url"
            inputMode="url"
            maxLength={500}
            defaultValue={values[linkedInKey]}
            placeholder="https://www.linkedin.com/in/…"
          />
        </Field>
      </div>
    </fieldset>
  );
}
