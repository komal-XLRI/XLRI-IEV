'use client';

import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { updateMyVentureAction } from '@/app/actions/studentActions';

interface VentureView {
  ventureName: string;
  ventureTitle: string;
  industry: string;
  targetMarket: string;
  problemStatement: string;
  solution: string;
  fundingStatus: string;
}

/**
 * Students edit their own venture narrative only. Reviewer assignment and
 * activity status are not editable here — those are Admin and server concerns.
 */
export function MyVentureForm({ venture }: { venture: VentureView }) {
  return (
    <Card>
      <CardHeader title="Venture details" />
      <CardBody>
        <ActionForm action={updateMyVentureAction} successMessage="Saved.">
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Venture name"
                  htmlFor="ventureName"
                  required
                  error={fieldErrors?.ventureName}
                >
                  <TextInput
                    id="ventureName"
                    name="ventureName"
                    required
                    defaultValue={venture.ventureName}
                  />
                </Field>
                <Field label="Tagline" htmlFor="ventureTitle">
                  <TextInput
                    id="ventureTitle"
                    name="ventureTitle"
                    defaultValue={venture.ventureTitle}
                  />
                </Field>
                <Field label="Industry" htmlFor="industry">
                  <TextInput id="industry" name="industry" defaultValue={venture.industry} />
                </Field>
                <Field label="Target market" htmlFor="targetMarket">
                  <TextInput
                    id="targetMarket"
                    name="targetMarket"
                    defaultValue={venture.targetMarket}
                  />
                </Field>
              </div>

              <Field label="Problem statement" htmlFor="problemStatement">
                <TextArea
                  id="problemStatement"
                  name="problemStatement"
                  rows={4}
                  defaultValue={venture.problemStatement}
                />
              </Field>

              <Field label="Solution" htmlFor="solution">
                <TextArea id="solution" name="solution" rows={4} defaultValue={venture.solution} />
              </Field>

              <Field label="Funding status" htmlFor="fundingStatus">
                <TextInput
                  id="fundingStatus"
                  name="fundingStatus"
                  defaultValue={venture.fundingStatus}
                />
              </Field>

              <SubmitButton pendingLabel="Saving…">Save venture</SubmitButton>
            </div>
          )}
        </ActionForm>
      </CardBody>
    </Card>
  );
}
