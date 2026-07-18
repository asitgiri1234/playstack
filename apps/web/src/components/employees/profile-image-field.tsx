'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Field, Input } from '@/components/ui/field';

/**
 * Profile image by URL, with a preview. No uploads — that needs storage, signed
 * URLs and a size/content policy, none of which belong in this phase.
 */
export function ProfileImageField({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  error?: string | undefined;
}): React.JSX.Element {
  const [broken, setBroken] = useState(false);

  return (
    <Field label="Profile image URL" error={error} hint="Leave empty for initials.">
      {({ id, describedBy, invalid }) => (
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-surface-sunken">
            {value !== null && value.length > 0 && !broken ? (
              // Plain <img>, not next/image: the source is an arbitrary external
              // URL, and next/image needs a configured remote-host allowlist,
              // which is a deployment decision rather than a Phase 4 one.
              <img
                src={value}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setBroken(true)}
                onLoad={() => setBroken(false)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-content-subtle">
                <ImageOff className="h-3.5 w-3.5" aria-hidden />
              </div>
            )}
          </div>
          <Input
            id={id}
            type="url"
            placeholder="https://…"
            aria-describedby={describedBy}
            invalid={invalid}
            disabled={disabled}
            value={value ?? ''}
            onChange={(e) => {
              setBroken(false);
              // Empty string → null: the API's profileImageSchema normalises
              // "" to null (cleared), and sending "" would be a lie about intent.
              onChange(e.target.value.length === 0 ? null : e.target.value);
            }}
          />
        </div>
      )}
    </Field>
  );
}
