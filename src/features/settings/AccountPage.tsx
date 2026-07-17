import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { SettingsPageHeader } from "@/features/settings/header";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { settingsGhostButtonClassName } from "@/features/settings/styles";
import { useAuthSession, useOpenSignIn, useSignOut } from "@/lib/auth/queries";
import type { AuthUser } from "@/lib/auth/types";

function AccountAvatar({ user }: { readonly user: AuthUser }): ReactElement {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt=""
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border"
        referrerPolicy="no-referrer"
      />
    );
  }

  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();
  return (
    <div
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-sm text-[#cdcdcd] ring-1 ring-border"
    >
      {initial}
    </div>
  );
}

function SignedInAccount({ user }: { readonly user: AuthUser }): ReactElement {
  const signOut = useSignOut();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Profile">
        <div className="flex items-center gap-4 px-4 py-3.5">
          <AccountAvatar user={user} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm text-foreground">{user.name || "Account"}</span>
            <span className="truncate text-[13px] leading-4 text-[#767676]">{user.email}</span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Session">
        <SettingsRow label="Sign out" description="Clear this device’s signed-in session.">
          <Button
            type="button"
            variant="ghost"
            disabled={signOut.isPending}
            className={settingsGhostButtonClassName}
            onClick={() => {
              signOut.mutate();
            }}
          >
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

function SignedOutAccount(): ReactElement {
  const openSignIn = useOpenSignIn();

  return (
    <SettingsSection title="Sign in">
      <SettingsRow
        label="Actuate account"
        description="Open the browser to sign in with Google, then return here via Open in Actuate."
      >
        <Button
          type="button"
          variant="ghost"
          className={settingsGhostButtonClassName}
          onClick={() => {
            void openSignIn();
          }}
        >
          Sign in
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}

function AccountBody(): ReactElement {
  const session = useAuthSession(true);

  if (session.isPending) {
    return (
      <SettingsSection title="Account">
        <div className="px-4 py-3.5 text-sm text-[#767676]">Loading account…</div>
      </SettingsSection>
    );
  }

  if (session.data) {
    return <SignedInAccount user={session.data} />;
  }

  return <SignedOutAccount />;
}

export default function AccountPageContent(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <SettingsPageHeader title="Account" backTo="/settings" />
      </div>
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-8 overflow-y-auto px-4 pb-4 scrollbar-none md:max-w-3xl">
        <AccountBody />
      </div>
    </div>
  );
}
