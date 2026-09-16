import { ExternalLink, FileImage, FileText, FileVideo, Paperclip } from 'lucide-react';

export interface EvidenceItem {
  _id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

/**
 * Where a reader opens an evidence file.
 *
 * Not the Cloudinary URL on the record: that one is refused for PDFs and can
 * be read by anyone who has ever seen it. This route authorises the reader and
 * hands them a link that expires. Everything that links to evidence goes
 * through here, so there is one answer rather than one per screen.
 */
export function evidenceHref(evidenceId: string): string {
  return `/api/evidence/${evidenceId}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A glanceable cue for what kind of file this is, before it is opened. */
function iconFor(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType === 'application/pdf') return FileText;
  return Paperclip;
}

/** Files live in Cloudinary; MongoDB only holds this metadata. */
export function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {evidence.map((file) => {
        const Icon = iconFor(file.fileType);

        return (
          <li key={file._id}>
            <a
              href={evidenceHref(file._id)}
              target="_blank"
              rel="noreferrer noopener"
              className="surface-sunken hover:border-primary group rounded-control flex items-center gap-2.5 border px-3 py-2 transition-colors"
            >
              <span className="bg-primary-soft text-primary-soft-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md">
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{file.fileName}</span>
                <span className="type-caption block">
                  {formatBytes(file.fileSize)} · {file.fileType.split('/').pop()?.toUpperCase()}
                </span>
              </span>
              <ExternalLink
                // Visible at rest, not revealed on hover: "opens in a new tab"
                // is information, and a pointer-only cue is no cue at all on a
                // touch screen.
                className="text-subtle-foreground group-hover:text-primary size-3.5 shrink-0 transition-colors"
                aria-hidden="true"
              />
              <span className="sr-only">Opens in a new tab</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
