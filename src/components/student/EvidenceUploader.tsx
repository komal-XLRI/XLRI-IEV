'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
  RotateCcw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FormMessage } from '@/components/ui/FormMessage';
import { cn } from '@/lib/utils/cn';
import { formatBytes, type EvidenceItem } from '@/components/venture/EvidenceList';
import {
  EVIDENCE_ACCEPT_ATTRIBUTE,
  EVIDENCE_FORMAT_GROUPS,
  MAX_EVIDENCE_FILES_PER_SUBMISSION,
  MAX_EVIDENCE_FILE_BYTES,
  evidenceMimeTypeFor,
} from '@/lib/constants/uploads';

interface SignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  resourceType: string;
  uploadUrl: string;
}

interface CloudinaryResponse {
  public_id: string;
  secure_url: string;
  version: number;
  signature: string;
  bytes: number;
}

/** A file on its way up. Uploaded files leave this list and join `evidence`. */
interface PendingUpload {
  id: string;
  file: File;
  mimeType: string;
  /** 0–100 for the transfer itself; the two API calls bracket it. */
  progress: number;
  status: 'uploading' | 'failed';
  error?: string;
}

function iconFor(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType === 'application/pdf') return FileText;
  return Paperclip;
}

function extensionLabel(fileName: string, mimeType: string): string {
  return (
    /\.([^.]+)$/.exec(fileName)?.[1]?.toUpperCase() ??
    mimeType.split('/').pop()?.toUpperCase() ??
    'FILE'
  );
}

/**
 * POSTs to Cloudinary with progress. `fetch` cannot report upload progress —
 * its request streams are not supported where it matters — so this is one of
 * the few places XHR is still the right tool.
 */
function postToCloudinary(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<CloudinaryResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as CloudinaryResponse);
        } catch {
          reject(new Error('Cloudinary returned a response we could not read'));
        }
        return;
      }
      reject(new Error('The file could not be uploaded. Please try again.'));
    };

    request.onerror = () => reject(new Error('Network error while uploading. Please try again.'));
    request.ontimeout = () => reject(new Error('The upload timed out. Please try again.'));

    request.send(form);
  });
}

/**
 * Signed direct upload, staged against the activity record:
 *
 *   ask our server for a signature → POST the file to Cloudinary → register
 *   the returned metadata with our server, which re-verifies the signature.
 *
 * The Cloudinary API secret never reaches the browser, and the server refuses
 * any callback whose public_id sits outside the folder it signed.
 *
 * Files land as drafts. `createSubmission` adopts them into the attempt it
 * creates, which is what allows evidence to be attached *before* submitting and
 * therefore what allows the server to insist on it.
 */
export function EvidenceUploader({
  studentVentureActivityId,
  required,
  evidence,
  onEvidenceChange,
  onBusyChange,
  disabled = false,
}: {
  studentVentureActivityId: string;
  required: boolean;
  evidence: EvidenceItem[];
  onEvidenceChange: (next: EvidenceItem[]) => void;
  /** Lets the enclosing form hold its submit button while a transfer is live. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const busy = pending.some((item) => item.status === 'uploading');
  const total = evidence.length + pending.length;
  const remainingSlots = MAX_EVIDENCE_FILES_PER_SUBMISSION - total;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function update(id: string, patch: Partial<PendingUpload>) {
    setPending((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function runUpload(entry: PendingUpload) {
    const { file, mimeType } = entry;

    const signatureResponse = await fetch('/api/student/evidence/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentVentureActivityId,
        fileName: file.name,
        fileType: mimeType,
        fileSize: file.size,
      }),
    });

    if (!signatureResponse.ok) {
      const body = (await signatureResponse.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(body.error?.message ?? 'Could not authorise this upload');
    }

    const signed = (await signatureResponse.json()) as SignatureResponse;

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signed.apiKey);
    form.append('timestamp', String(signed.timestamp));
    form.append('signature', signed.signature);
    form.append('folder', signed.folder);
    form.append('public_id', signed.publicId);

    const uploaded = await postToCloudinary(signed.uploadUrl, form, (percent) =>
      update(entry.id, { progress: percent }),
    );

    const registerResponse = await fetch('/api/student/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentVentureActivityId,
        publicId: uploaded.public_id,
        fileName: file.name,
        fileUrl: uploaded.secure_url,
        fileType: mimeType,
        fileSize: uploaded.bytes || file.size,
        signature: uploaded.signature,
        version: uploaded.version,
      }),
    });

    if (!registerResponse.ok) {
      const body = (await registerResponse.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(body.error?.message ?? 'Could not record this file');
    }

    const { evidence: saved } = (await registerResponse.json()) as { evidence: EvidenceItem };
    return saved;
  }

  /** Uploads one queued entry, moving it into `evidence` or marking it failed. */
  async function process(entry: PendingUpload, current: EvidenceItem[]): Promise<EvidenceItem[]> {
    try {
      const saved = await runUpload(entry);
      setPending((items) => items.filter((item) => item.id !== entry.id));

      const next = [...current, saved];
      onEvidenceChange(next);
      return next;
    } catch (error) {
      // The entry stays in the list carrying its error, so it can be retried
      // without the student having to find the file again.
      update(entry.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Upload failed',
      });
      return current;
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || disabled) return;

    setRejected([]);

    const accepted: PendingUpload[] = [];
    const refused: string[] = [];
    let slots = remainingSlots;

    for (const file of Array.from(files)) {
      const mimeType = evidenceMimeTypeFor(file.name, file.type);

      if (!mimeType) {
        refused.push(`${file.name} — not an accepted file type`);
        continue;
      }
      if (file.size > MAX_EVIDENCE_FILE_BYTES) {
        refused.push(
          `${file.name} — ${formatBytes(file.size)}, over the ${formatBytes(MAX_EVIDENCE_FILE_BYTES)} limit`,
        );
        continue;
      }
      if (file.size === 0) {
        refused.push(`${file.name} — the file is empty`);
        continue;
      }
      if (slots <= 0) {
        refused.push(`${file.name} — only ${MAX_EVIDENCE_FILES_PER_SUBMISSION} files are allowed`);
        continue;
      }

      slots -= 1;
      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        mimeType,
        progress: 0,
        status: 'uploading',
      });
    }

    if (refused.length > 0) setRejected(refused);
    if (accepted.length === 0) return;

    setPending((current) => [...current, ...accepted]);

    // Sequential: the server caps how many files a submission may carry, and
    // parallel signature requests would race past that count.
    let latest = evidence;
    for (const entry of accepted) {
      latest = await process(entry, latest);
    }

    if (inputRef.current) inputRef.current.value = '';
  }

  async function retry(id: string) {
    const entry = pending.find((item) => item.id === id);
    if (!entry) return;

    update(id, { status: 'uploading', progress: 0, error: undefined });
    await process({ ...entry, status: 'uploading' }, evidence);
  }

  function discard(id: string) {
    setPending((current) => current.filter((item) => item.id !== id));
  }

  async function remove(item: EvidenceItem) {
    // Optimistic: the row disappears immediately and comes back if the server
    // refuses, rather than sitting there looking unresponsive.
    const previous = evidence;
    onEvidenceChange(evidence.filter((file) => file._id !== item._id));

    const response = await fetch(`/api/student/evidence/${item._id}`, { method: 'DELETE' });
    if (!response.ok) {
      onEvidenceChange(previous);
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      setRejected([body.error?.message ?? `Could not remove ${item.fileName}`]);
    }
  }

  const unmet = required && evidence.length === 0;

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className={cn(
        'rounded-card border p-4 transition-colors',
        unmet ? 'border-warning-border bg-warning-soft/35' : 'surface-sunken',
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={`${inputId}-heading`}
            className="flex items-center gap-2 text-[13.5px] font-medium"
          >
            Evidence
            {required ? (
              <Badge tone={evidence.length > 0 ? 'success' : 'warning'}>
                {evidence.length > 0 ? 'Attached' : 'Required'}
              </Badge>
            ) : (
              <Badge tone="muted">Optional</Badge>
            )}
          </h3>
          <p className="type-caption mt-0.5">
            {required
              ? 'Attach at least one file before submitting this activity.'
              : 'Attach supporting files if they help your reviewers.'}
          </p>
        </div>

        <span className="type-caption whitespace-nowrap">
          {total} of {MAX_EVIDENCE_FILES_PER_SUBMISSION}
        </span>
      </div>

      {rejected.length > 0 ? (
        <FormMessage tone="error" className="mb-3">
          <span className="block">These files were not added:</span>
          <ul className="mt-1 list-inside list-disc">
            {rejected.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </FormMessage>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={EVIDENCE_ACCEPT_ATTRIBUTE}
        className="sr-only"
        disabled={disabled || remainingSlots <= 0}
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {/* Drop target. The label keeps the native picker reachable by keyboard,
          which a div with an onClick would not. */}
      <div
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-control border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary-soft' : 'border-input-border bg-surface',
          (disabled || remainingSlots <= 0) && 'opacity-70',
        )}
      >
        <UploadCloud
          className={cn('mx-auto size-6', dragging ? 'text-primary' : 'text-muted-foreground')}
          aria-hidden="true"
        />

        <p className="mt-2 text-[13px] font-medium">
          {remainingSlots <= 0
            ? `All ${MAX_EVIDENCE_FILES_PER_SUBMISSION} files attached`
            : 'Drag and drop files here'}
        </p>

        {remainingSlots > 0 ? (
          <>
            <p className="type-caption mt-0.5">or</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="size-3.5" aria-hidden="true" />
              Choose files
            </Button>
          </>
        ) : null}

        <dl className="type-caption mx-auto mt-3 max-w-sm space-y-0.5">
          {EVIDENCE_FORMAT_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-wrap justify-center gap-x-1.5">
              <dt className="font-medium">{group.label}:</dt>
              <dd>{group.extensions.join(', ')}</dd>
            </div>
          ))}
          <p className="pt-1">Up to {formatBytes(MAX_EVIDENCE_FILE_BYTES)} per file.</p>
        </dl>
      </div>

      {total > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {evidence.map((file) => {
            const Icon = iconFor(file.fileType);

            return (
              <li
                key={file._id}
                className="surface-card rounded-control flex items-center gap-2.5 border px-3 py-2"
              >
                <span className="bg-success-soft text-success-soft-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{file.fileName}</span>
                  <span className="type-caption flex items-center gap-1">
                    <CheckCircle2 className="text-success size-3 shrink-0" aria-hidden="true" />
                    Attached · {formatBytes(file.fileSize)} ·{' '}
                    {extensionLabel(file.fileName, file.fileType)}
                  </span>
                </span>

                <a
                  href={file.fileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-subtle-foreground hover:text-primary rounded-md p-1.5 transition-colors"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Open {file.fileName} in a new tab</span>
                </a>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void remove(file)}
                  className="text-subtle-foreground hover:text-danger hover:bg-danger-soft disabled:hover:text-subtle-foreground rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Remove {file.fileName}</span>
                </button>
              </li>
            );
          })}

          {pending.map((item) => {
            const Icon = iconFor(item.mimeType);
            const failed = item.status === 'failed';

            return (
              <li
                key={item.id}
                className={cn(
                  'surface-card rounded-control border px-3 py-2',
                  failed && 'border-danger-border',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
                      failed
                        ? 'bg-danger-soft text-danger-soft-foreground'
                        : 'bg-primary-soft text-primary-soft-foreground',
                    )}
                  >
                    {failed ? (
                      <AlertCircle className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Icon className="size-3.5" aria-hidden="true" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{item.file.name}</span>
                    <span className={cn('type-caption', failed && 'text-danger')}>
                      {failed
                        ? item.error
                        : `Uploading… ${item.progress}% · ${formatBytes(item.file.size)}`}
                    </span>
                  </span>

                  {failed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void retry(item.id)}
                        className="text-primary hover:bg-primary-soft inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                      >
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => discard(item.id)}
                        className="text-subtle-foreground hover:text-danger rounded-md p-1.5 transition-colors"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">Discard {item.file.name}</span>
                      </button>
                    </>
                  ) : null}
                </div>

                {!failed ? (
                  <div
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${item.file.name}`}
                    className="bg-chart-track mt-2 h-1 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-primary h-full rounded-full transition-[width] duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Announced rather than shown: the submit button already carries the
          same state visually, and a second red banner for a form the student
          has not tried to submit yet reads as an error they have made. */}
      <p aria-live="polite" className="sr-only">
        {busy
          ? 'Uploading evidence'
          : `${evidence.length} evidence file${evidence.length === 1 ? '' : 's'} attached`}
      </p>
    </section>
  );
}
