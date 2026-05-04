"use client";

import { useState } from "react";

interface CopyInviteButtonProps {
  inviteUrl: string;
  inviteCode: string;
}

export function CopyInviteButton({ inviteUrl, inviteCode }: CopyInviteButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy just the code
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
