'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, Download, Printer, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FormMessage } from '@/components/ui/FormMessage';
import { useToast } from '@/components/ui/Toast';
import { getFeedbackQrAction, regenerateFeedbackTokenAction } from '@/app/actions/adminVentures';
import type { FeedbackQrResult } from '@/services/ventures/mentorFeedbackService';

function safeFileName(value: string): string {
  return (
    value
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'presentation'
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * One presentation's mentor-feedback QR. Admin only.
 *
 * The QR is fetched when the dialog opens rather than rendered for every row:
 * tokens are issued lazily, and the server decides — from the presentation as
 * it is now — whether a QR may exist at all.
 */
export function FeedbackQrModal({
  recordId,
  studentName,
  onClose,
}: {
  recordId: string | null;
  studentName: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<FeedbackQrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  // The parent remounts this dialog (via `key`) for each presentation, so every
  // open starts from empty state and only the fetch itself happens here.
  useEffect(() => {
    if (!recordId) return;
    startTransition(async () => {
      const response = await getFeedbackQrAction(recordId);
      if (response.ok) setResult(response.data);
      else setError(response.message);
    });
  }, [recordId]);

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => notify({ tone: 'error', title: 'Could not copy the link' }),
    );
  }

  function download(href: string, fileName: string) {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    anchor.click();
  }

  function downloadSvg(svg: string, base: string) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    download(url, `${base}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function print(data: Extract<FeedbackQrResult, { available: true }>) {
    const win = window.open('', '_blank', 'width=640,height=820');
    if (!win) {
      notify({ tone: 'error', title: 'Allow pop-ups to print the QR' });
      return;
    }
    const d = data.details;
    win.document.write(`<!doctype html><html><head><title>Mentor feedback QR</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#111}
      h1{font-size:20px;margin:0 0 4px}p{margin:2px 0;font-size:14px}
      .qr{width:320px;margin:24px auto}.small{color:#555;font-size:12px;word-break:break-all}</style>
      </head><body>
      <h1>${escapeHtml(d.studentName)}</h1>
      <p>${escapeHtml(d.ventureName)}</p>
      <p>${escapeHtml(d.stage)}</p>
      <div class="qr">${data.svg}</div>
      <p><strong>Scan to give mentor feedback</strong></p>
      <p class="small">${escapeHtml(data.url)}</p>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function regenerate() {
    if (!recordId) return;
    startTransition(async () => {
      const response = await regenerateFeedbackTokenAction(recordId);
      setConfirmRegenerate(false);
      if (response.ok) {
        setResult(response.data);
        notify({
          tone: 'success',
          title: 'New QR issued',
          description: 'The previous QR and link no longer work.',
        });
      } else {
        notify({
          tone: 'error',
          title: 'Could not regenerate the QR',
          description: response.message,
        });
      }
    });
  }

  const details = result?.details;

  return (
    <Modal
      open={recordId !== null}
      onClose={onClose}
      title={`Feedback QR — ${studentName}`}
      size="md"
    >
      {pending && !result ? <p className="type-secondary">Loading…</p> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {details ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div>
              <dt className="type-overline">Student / team</dt>
              <dd className="font-medium">{details.studentName}</dd>
            </div>
            <div>
              <dt className="type-overline">Venture</dt>
              <dd className="font-medium">{details.ventureName}</dd>
            </div>
            <div className="col-span-2">
              <dt className="type-overline">Stage</dt>
              <dd className="font-medium">{details.stage}</dd>
            </div>
            <div>
              <dt className="type-overline">Presentation</dt>
              <dd>
                <Badge tone={details.presentationReceived ? 'success' : 'warning'}>
                  {details.presentationReceived ? 'Received' : 'Pending'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="type-overline">Feedback form</dt>
              <dd>
                <Badge tone={details.formConfigured ? 'success' : 'warning'}>
                  {details.formConfigured ? 'Configured' : 'Not configured'}
                </Badge>
              </dd>
            </div>
          </dl>

          {result && !result.available ? (
            <FormMessage tone="error">{result.message}</FormMessage>
          ) : null}

          {result && result.available ? (
            <>
              <div
                className="mx-auto w-full max-w-64 rounded-lg bg-white p-3"
                // Generated on the server by the qrcode library from our own URL.
                dangerouslySetInnerHTML={{ __html: result.svg }}
              />
              <p className="type-caption text-center break-all">{result.url}</p>

              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => copyLink(result.url)}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    download(
                      result.pngDataUrl,
                      `feedback-qr-${safeFileName(details.studentName)}.png`,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  PNG
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadSvg(result.svg, `feedback-qr-${safeFileName(details.studentName)}`)
                  }
                >
                  <Download className="size-3.5" />
                  SVG
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => print(result)}>
                  <Printer className="size-3.5" />
                  Print
                </Button>
              </div>

              <div className="border-t pt-3">
                {confirmRegenerate ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-secondary flex-1">
                      The current QR and link will stop working. Feedback already received is kept.
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRegenerate(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={regenerate}
                    >
                      Regenerate
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRegenerate(true)}
                  >
                    <RefreshCw className="size-3.5" />
                    Regenerate QR
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
