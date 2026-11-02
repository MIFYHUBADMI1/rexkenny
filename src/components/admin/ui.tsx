import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/admin/readiness";
import type { ReleaseStatus } from "@/lib/types";

/**
 * Presentational pieces for the dashboard. They render only what they are
 * handed; no component here produces a number, a status or a success message of
 * its own, because a fabricated metric in a shared component would be the
 * hardest kind of lie to find.
 */

export function Panel({
  title,
  description,
  children,
  aside,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-lg border border-charcoal bg-ink-raised p-5 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-paper">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-smoke">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  name,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={name} className="block text-sm font-medium text-mist">
        {label}
        {required ? <span className="ml-1 text-gold">*</span> : null}
      </label>
      <div id={`${name}-hint`}>{children}</div>
      {hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-smoke">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "mt-2 w-full rounded-md border border-ash bg-ink px-3 py-2 text-sm text-paper placeholder:text-smoke/70 focus:border-gold focus:outline-none";

export function TextInput({
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
  readOnly,
  disabled,
}: {
  name: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      placeholder={placeholder}
      defaultValue={defaultValue ?? ""}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      className={inputClass}
    />
  );
}

export function TextArea({
  name,
  defaultValue,
  rows = 4,
  placeholder,
}: {
  name: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      placeholder={placeholder}
      defaultValue={defaultValue ?? ""}
      className={`${inputClass} leading-relaxed`}
    />
  );
}

export function Select({
  name,
  options,
  defaultValue,
  required,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
}) {
  return (
    <select
      id={name}
      name={name}
      required={required}
      defaultValue={defaultValue ?? options[0]?.value ?? ""}
      className={inputClass}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={Boolean(defaultChecked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
      />
      <label htmlFor={name} className="min-w-0 text-sm text-mist">
        {label}
        {hint ? (
          <span className="mt-1 block text-xs leading-relaxed text-smoke">
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export function FormNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-charcoal bg-ink px-3 py-2.5 text-xs leading-relaxed text-smoke">
      {children}
    </p>
  );
}

const TONE: Record<string, string> = {
  draft: "text-smoke border-charcoal",
  "in-preparation": "text-mist border-ash",
  "metadata-review": "text-gold border-gold/40",
  "artwork-review": "text-gold border-gold/40",
  "ready-for-distribution": "text-gold border-gold",
  submitted: "text-mist border-mist/40",
  processing: "text-mist border-mist/40",
  scheduled: "text-paper border-paper/40",
  released: "text-gold border-gold bg-gold/10",
  rejected: "text-blood border-blood/50",
  "needs-correction": "text-blood border-blood/50",
};

export function StatusChip({ status }: { status: string }) {
  const tone = TONE[status] ?? "text-smoke border-charcoal";
  const label =
    STATUS_LABEL[status as ReleaseStatus] ??
    status.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] ${tone}`}
    >
      {label}
    </span>
  );
}

/**
 * A meter that reports a checklist result. The label always says what the
 * number is measured against, so it can never be read as audience data.
 */
export function ReadinessMeter({
  score,
  blockers,
  missing,
}: {
  score: number;
  blockers: number;
  missing: number;
}) {
  const width = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-mist">
          Readiness{" "}
          <span className="font-[family-name:var(--font-display)] text-xl font-bold text-paper">
            {width}%
          </span>
        </span>
        <span className="text-xs text-smoke">
          {blockers > 0
            ? `${blockers} blocking item${blockers === 1 ? "" : "s"}`
            : `${missing} item${missing === 1 ? "" : "s"} left`}
        </span>
      </div>
      <div
        role="img"
        aria-label={`Readiness ${width} out of 100`}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-charcoal"
      >
        <div
          className={`h-full rounded-full ${
            blockers > 0 ? "bg-blood" : width >= 90 ? "bg-gold" : "bg-mist"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function DataTable({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-charcoal">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-charcoal bg-ink-raised text-left">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-smoke"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
