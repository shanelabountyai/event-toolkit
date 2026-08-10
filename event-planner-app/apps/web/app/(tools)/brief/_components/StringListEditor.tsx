"use client";

/** Add/remove editor for a plain `string[]` field (objectives, segments, constraints, pain points). */

import { useState } from "react";
import { Button, TextInput } from "@event-toolkit/ui";

export function StringListEditor({
  values,
  onChange,
  placeholder,
  addLabel = "Add",
  emptyLabel = "Nothing added yet.",
  inputId,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyLabel?: string;
  inputId?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {values.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {values.map((value, index) => (
            <li key={`${index}-${value}`} className="flex items-start gap-2">
              <TextInput
                value={value}
                aria-label={`Item ${index + 1}`}
                onChange={(e) => {
                  const next = [...values];
                  next[index] = e.target.value;
                  onChange(next);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => onChange(values.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <TextInput
          id={inputId}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={draft.trim() === ""}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
