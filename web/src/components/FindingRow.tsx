import { useId, useState } from 'react';
import type { Severity } from '../lib/severity';
import { Button } from './Button';
import { SeverityBadge } from './SeverityBadge';

export interface FindingView {
  severity: Severity;
  title: string;
  explanation: string;
  evidence?: string;
  fixPrompt?: string;
}

/**
 * One finding. Collapsed: severity + title. Expanded: explanation, evidence and the
 * "Copy fix prompt" button. Every string is rendered as text: scanned content can
 * never become HTML here.
 */
export function FindingRow({ finding }: { finding: FindingView }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelId = useId();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="border-b border-separator last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="sr-only">{open ? 'Hide details: ' : 'Show details: '}</span>
        <SeverityBadge severity={finding.severity} />
        <span className="flex-1 text-17 font-medium">{finding.title}</span>
        <span
          aria-hidden="true"
          className={`text-secondary transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      </button>
      <div id={panelId} hidden={!open} className="space-y-3 px-4 pb-4">
        <p className="text-15 text-secondary">{finding.explanation}</p>
        {finding.evidence !== undefined && (
          <p className="text-13">
            <span className="font-semibold">What we saw: </span>
            <code className="break-all rounded bg-bg px-1.5 py-0.5">{finding.evidence}</code>
          </p>
        )}
        {finding.fixPrompt !== undefined && (
          <div className="space-y-2">
            <pre className="whitespace-pre-wrap rounded-button bg-bg p-3 text-13">
              {finding.fixPrompt}
            </pre>
            <Button
              variant="secondary"
              onClick={() => {
                void copy(finding.fixPrompt ?? '');
              }}
            >
              {copied ? 'Copied' : 'Copy fix prompt'}
            </Button>
            <span role="status" className="sr-only">
              {copied ? 'Fix prompt copied' : ''}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}
