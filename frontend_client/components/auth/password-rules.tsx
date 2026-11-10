"use client";

import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { passwordRules } from "@/lib/auth/password";

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul
      aria-label="Password requirements"
      className="text-muted-foreground mt-2 grid gap-1 text-[11px]"
    >
      {passwordRules(value).map((rule) => (
        <li key={rule.id} className="flex items-center gap-1.5">
          {rule.valid ? (
            <CircleCheckIcon
              className="text-success size-3.5 flex-none"
              aria-hidden="true"
            />
          ) : (
            <CircleIcon className="size-3.5 flex-none" aria-hidden="true" />
          )}
          <span className={rule.valid ? "text-foreground" : undefined}>
            {rule.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
