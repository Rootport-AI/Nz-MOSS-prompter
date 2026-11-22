import { useEffect, useRef, useState } from "react";

interface TagListInputProps {
  id: string;
  values: string[];
  resetKey: string;
  placeholder?: string;
  onChange: (next: string[]) => void;
}

function parseCommaList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Controlled comma-separated string array input that preserves user typing
 * (trailing commas, spaces, Japanese IME composition) while focused, and
 * normalizes display on blur or when resetKey changes.
 */
export function TagListInput({
  id,
  values,
  resetKey,
  placeholder,
  onChange,
}: TagListInputProps) {
  const [draft, setDraft] = useState(() => values.join(", "));
  const focusedRef = useRef(false);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(values.join(", "));
    }
  }, [values, resetKey]);

  useEffect(() => {
    setDraft(values.join(", "));
    focusedRef.current = false;
  }, [resetKey]);

  return (
    <input
      id={id}
      className="field"
      type="text"
      value={draft}
      placeholder={placeholder}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        const nextRaw = e.currentTarget.value;
        setDraft(nextRaw);
        onChange(parseCommaList(nextRaw));
      }}
      onChange={(e) => {
        const nextRaw = e.target.value;
        setDraft(nextRaw);
        if (!composingRef.current) {
          onChange(parseCommaList(nextRaw));
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        const parsed = parseCommaList(draft);
        onChange(parsed);
        setDraft(parsed.join(", "));
      }}
    />
  );
}
