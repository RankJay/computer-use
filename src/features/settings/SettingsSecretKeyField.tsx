import type { ChangeEvent, ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ancillaryErrorClass,
  outlineButtonClassName,
  primaryButtonClassName,
  settingBlockClass,
  settingDescriptionClass,
  settingHeadingClass,
  settingLeadClass,
  settingsFieldClassName,
} from "@/features/settings/settingsStyles";

export type SettingsSecretKeyFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly storageHint: string;
  readonly emptyPlaceholder: string;
  readonly apiKeyDraft: string;
  readonly hasStoredKey: boolean;
  readonly apiKeyError: string | null;
  readonly onDraftChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onRemove: () => void;
  readonly saveLabel: string;
  readonly removeLabel: string;
};

export function SettingsSecretKeyField(props: SettingsSecretKeyFieldProps): ReactElement {
  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    props.onDraftChange(e.currentTarget.value);
  }

  return (
    <div className={settingBlockClass}>
      <div className={settingLeadClass}>
        <Label htmlFor={props.id} className={settingHeadingClass}>
          {props.label}
        </Label>
        <p className={settingDescriptionClass}>Stored in {props.storageHint}. Paste to replace.</p>
      </div>
      <Input
        id={props.id}
        type="password"
        value={props.apiKeyDraft}
        onChange={handleChange}
        placeholder={props.hasStoredKey ? "Key on file — paste to replace" : props.emptyPlaceholder}
        autoComplete="off"
        className={settingsFieldClassName}
      />
      <div className="flex flex-col gap-2">
        {props.apiKeyError ? <p className={ancillaryErrorClass}>{props.apiKeyError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className={primaryButtonClassName} onClick={() => void props.onSave()}>
            {props.saveLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={outlineButtonClassName}
            onClick={() => void props.onRemove()}
          >
            {props.removeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
