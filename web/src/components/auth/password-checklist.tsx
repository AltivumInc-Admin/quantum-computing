"use client";

import { PASSWORD_CRITERIA, allCriteriaMet } from "@/lib/password-policy";
import { LiveStatus } from "../live-status";

function Row({ met, label }: { met: boolean; label: string }) {
  return (
    <li
      data-met={met ? "true" : "false"}
      aria-label={`${label}: ${met ? "met" : "not met"}`}
      className={`flex items-center gap-2 text-xs ${
        met ? "text-success-dark dark:text-success-light" : "text-danger-dark dark:text-danger-light"
      }`}
    >
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        {met ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </span>
      {label}
    </li>
  );
}

export function PasswordChecklist({
  password,
  confirm,
  id,
}: {
  password: string;
  confirm?: string;
  id?: string;
}) {
  const allMet = allCriteriaMet(password);
  const matchMet = confirm === undefined ? true : confirm.length > 0 && confirm === password;
  // Announce the milestone only on views where the criteria gate submission (sign-up
  // / reset pass `confirm`); on sign-in the checklist is purely informational. One
  // concise polite line at the gate-opening point, not a row per keystroke.
  const announcement =
    confirm !== undefined && allMet && matchMet ? "Password meets all requirements." : "";
  return (
    <>
      <ul id={id} className="mt-2 space-y-1">
        {PASSWORD_CRITERIA.map((c) => (
          <Row key={c.key} met={c.test(password)} label={c.label} />
        ))}
        {confirm !== undefined && (
          <Row met={confirm.length > 0 && confirm === password} label="Passwords match" />
        )}
      </ul>
      <LiveStatus>{announcement}</LiveStatus>
    </>
  );
}
