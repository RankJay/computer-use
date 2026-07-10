import type { ChangeEvent, ComponentProps, ReactElement } from "react";

import { Input } from "@/components/ui/input";
import { InputGroupInput } from "@/components/ui/input-group";
import { useDraftValue } from "@/features/settings/use-draft-value";

type SettingsDraftTextInputProps = {
  committedValue: string;
  onCommit: (value: string) => void;
  variant?: "input" | "input-group";
} & Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "onBlur">;

export function SettingsDraftTextInput({
  committedValue,
  onCommit,
  variant = "input",
  ...props
}: SettingsDraftTextInputProps): ReactElement {
  const [draft, setDraft] = useDraftValue(committedValue);

  const sharedProps = {
    ...props,
    value: draft,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    onBlur: () => {
      if (draft !== committedValue) {
        onCommit(draft);
      }
    },
  };

  if (variant === "input-group") {
    return <InputGroupInput {...sharedProps} />;
  }

  return <Input {...sharedProps} />;
}

type NumberFormat = "int" | "float";

type SettingsDraftNumberInputProps = {
  committedValue: number;
  onCommit: (value: number) => void;
  format?: NumberFormat;
  min?: number;
  variant?: "input" | "input-group";
} & Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "onBlur" | "type">;

function parseDraftNumber(raw: string, format: NumberFormat): number | null {
  if (raw.trim() === "") {
    return null;
  }

  const parsed = format === "float" ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isValidNumber(value: number, min?: number): boolean {
  if (min !== undefined && value < min) {
    return false;
  }
  return true;
}

export function SettingsDraftNumberInput({
  committedValue,
  onCommit,
  format = "int",
  min,
  variant = "input",
  ...props
}: SettingsDraftNumberInputProps): ReactElement {
  const [draft, setDraft] = useDraftValue(String(committedValue));

  const commitIfChanged = () => {
    const parsed = parseDraftNumber(draft, format);
    if (parsed === null || !isValidNumber(parsed, min)) {
      setDraft(String(committedValue));
      return;
    }
    if (parsed !== committedValue) {
      onCommit(parsed);
    }
  };

  const sharedProps = {
    ...props,
    type: "number" as const,
    value: draft,
    min,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    onBlur: commitIfChanged,
  };

  if (variant === "input-group") {
    return <InputGroupInput {...sharedProps} />;
  }

  return <Input {...sharedProps} />;
}
