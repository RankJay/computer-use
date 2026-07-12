import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useDeleteChat } from "@/lib/chats/queries";
import type { ChatSummary } from "@/lib/chats/types";

type ChatRowProps = {
  chat: ChatSummary;
};

export function ChatRow({ chat }: ChatRowProps): ReactElement {
  const deleteChat = useDeleteChat();

  return (
    <div className="group flex items-center gap-3 px-4 py-3.5">
      <Link to={`/chat/${chat.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-foreground">{chat.title}</span>
        <span className="text-[13px] leading-4 text-[#767676]">
          {formatDistanceToNow(chat.updatedAt, { addSuffix: true })}
        </span>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${chat.title}`}
        disabled={deleteChat.isPending}
        className="shrink-0 text-[#3F3F3F] opacity-0 transition-[color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:opacity-100 hover:bg-transparent hover:text-[#9c9c9c] focus-visible:opacity-100 active:scale-[0.95] active:text-[#aeaeae] motion-reduce:transition-none"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteChat.mutate(chat.id);
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
