"use client";

import * as React from "react";
import {
  Bot,
  Save,
  Loader2,
  Send,
  Check,
  X,
  Pause,
  Play,
  Sparkles,
  MessageSquare,
  Mail,
  Inbox,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, ConversationState } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Select, Textarea } from "@/components/ui/field";
import { ErrorBoundary } from "@/components/error-boundary";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  loadAgentConfigAction,
  saveAgentConfigAction,
  loadOutreachQueueAction,
  startOutreachAction,
  approveDraftAction,
  rejectDraftAction,
  pauseConversationAction,
  type OutreachQueueDTO,
  type DraftDTO,
} from "@/app/dashboard/outreach/actions";

const CONFIG_KEY = ["agent-config"] as const;
const QUEUE_KEY = ["outreach-queue"] as const;

const TONES = ["Professional", "Friendly", "Direct", "Empathetic"];
const OBJECTIVES = ["Qualify budget", "Confirm ownership", "Gauge timeline", "Book a call"];
const DEFAULT_SCRIPT =
  "Hi {{ownerName}}, I'm reaching out about your property at {{address}} in {{city}}. We buy off-market homes as-is and can close fast. Would you consider a cash offer?";

const inputCls =
  "h-10 w-full rounded-lg border border-[#1F2937] bg-[#0B0F19] px-3 text-sm text-gray-100 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50";

const STATE_COLOR: Record<ConversationState, string> = {
  NEW: "#9CA3AF",
  CONTACTED: "#3B82F6",
  ENGAGED: "#3B82F6",
  QUALIFIED: "#10B981",
  COLD: "#F59E0B",
  OPTED_OUT: "#F43F5E",
};

export default function OutreachPage() {
  return (
    <ErrorBoundary fallbackTitle="The outreach workspace crashed">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <AgentConfigCard />
        </div>
        <div className="space-y-4 xl:col-span-3">
          <StartOutreachCard />
          <DraftsQueueCard />
        </div>
      </div>
    </ErrorBoundary>
  );
}

function AgentConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: loadAgentConfigAction,
    refetchOnWindowFocus: false,
  });

  const [tone, setTone] = React.useState("Professional");
  const [objectives, setObjectives] = React.useState<Set<string>>(
    new Set(["Qualify budget", "Confirm ownership"]),
  );
  const [sms, setSms] = React.useState(true);
  const [email, setEmail] = React.useState(false);
  const [temperature, setTemperature] = React.useState(0.6);
  const [persistence, setPersistence] = React.useState(3);
  const [dailyCap, setDailyCap] = React.useState(40);
  const [script, setScript] = React.useState(DEFAULT_SCRIPT);
  const [saving, setSaving] = React.useState(false);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    const config = configQuery.data;
    if (!config || seeded.current) return;
    seeded.current = true;
    setTone(config.tone);
    setObjectives(new Set(config.objectives));
    setSms(config.channels.includes("SMS"));
    setEmail(config.channels.includes("EMAIL"));
    setTemperature(config.thresholds.temperature);
    setPersistence(config.thresholds.persistence);
    setDailyCap(config.thresholds.dailyCap);
    setScript(config.scriptTemplate);
  }, [configQuery.data]);

  function toggleObjective(value: string) {
    setObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const channels: Channel[] = [];
    if (sms) channels.push("SMS");
    if (email) channels.push("EMAIL");
    const result = await saveAgentConfigAction({
      tone,
      objectives: Array.from(objectives),
      channels,
      scriptTemplate: script,
      thresholds: { temperature, persistence, dailyCap },
    });
    setSaving(false);
    if (result.ok) {
      toast({ title: "Agent configuration saved", description: "Used for every draft the agent proposes.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
    } else {
      toast({ title: "Couldn't save", description: result.error, variant: "error" });
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" style={{ color: "#10B981" }} />
          <h2 className="text-sm font-semibold text-gray-100">Agent Configuration</h2>
        </div>

        <div>
          <Label htmlFor="tone">Tone</Label>
          <Select id="tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Objectives</Label>
          <div className="flex flex-wrap gap-2">
            {OBJECTIVES.map((value) => {
              const active = objectives.has(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleObjective(value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-transparent text-[#04190F]"
                      : "border-[#1F2937] text-gray-400 hover:border-[#374151] hover:text-gray-200",
                  )}
                  style={active ? { backgroundColor: "#10B981" } : undefined}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Channels</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSms((v) => !v)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                sms ? "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-[#93C5FD]" : "border-[#1F2937] text-gray-400 hover:text-gray-200",
              )}
            >
              <MessageSquare className="h-4 w-4" /> SMS
            </button>
            <button
              type="button"
              onClick={() => setEmail((v) => !v)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                email ? "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-[#93C5FD]" : "border-[#1F2937] text-gray-400 hover:text-gray-200",
              )}
            >
              <Mail className="h-4 w-4" /> Email
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="temp">Temp</Label>
            <input id="temp" type="number" min={0} max={1} step={0.05} className={inputCls}
              value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="persist">Persistence</Label>
            <input id="persist" type="number" min={1} max={5} className={inputCls}
              value={persistence} onChange={(e) => setPersistence(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="cap">Daily cap</Label>
            <input id="cap" type="number" min={1} max={500} className={inputCls}
              value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <Label htmlFor="script">Opening script</Label>
          <Textarea id="script" value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />
          <p className="mt-1 text-[11px] text-gray-500">Tokens: {"{{ownerName}}"}, {"{{address}}"}, {"{{city}}"}, {"{{state}}"}</p>
        </div>

        <Button variant="primary" glow="emerald" className="w-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save configuration
        </Button>
      </CardContent>
    </Card>
  );
}

function StartOutreachCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queue = useQuery<OutreachQueueDTO>({
    queryKey: QUEUE_KEY,
    queryFn: loadOutreachQueueAction,
    refetchOnWindowFocus: false,
  });

  const [propertyId, setPropertyId] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("SMS");
  const [busy, setBusy] = React.useState(false);

  const startable = queue.data?.startable ?? [];

  async function start() {
    if (busy || !propertyId) return;
    setBusy(true);
    const result = await startOutreachAction({ propertyId, channel });
    setBusy(false);
    if (result.sent) {
      toast({ title: "Outreach sent", description: "Opening message delivered through the gate.", variant: "success" });
      setPropertyId("");
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    } else {
      toast({
        title: "Blocked by the gate",
        description: `${result.gateReason ? result.gateReason + " — " : ""}${result.detail}`,
        variant: "warning",
      });
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "#3B82F6" }} />
          <h2 className="text-sm font-semibold text-gray-100">Start outreach</h2>
          <span className="ml-auto text-xs text-gray-500">{startable.length} skip-traced ready</span>
        </div>
        <p className="text-xs text-gray-500">
          Sends the opening script to a skip-traced lead. Every send passes consent,
          suppression, DNC, quiet hours, and the kill switch.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Select a property…</option>
            {startable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}, {p.city} {p.state}
                {p.ownerName ? ` · ${p.ownerName}` : ""}
              </option>
            ))}
          </Select>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            <option value="SMS">SMS</option>
            <option value="EMAIL">EMAIL</option>
          </Select>
          <Button variant="secondary" onClick={start} disabled={busy || !propertyId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftsQueueCard() {
  const queue = useQuery<OutreachQueueDTO>({
    queryKey: QUEUE_KEY,
    queryFn: loadOutreachQueueAction,
    refetchOnWindowFocus: false,
  });

  const drafts = queue.data?.drafts ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4" style={{ color: "#10B981" }} />
          <h2 className="text-sm font-semibold text-gray-100">Drafts awaiting approval</h2>
          <span className="ml-auto text-xs text-gray-500">{drafts.length} pending</span>
        </div>

        {queue.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg border border-[#1F2937] bg-[#0B0F19]" />
        ) : drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#1F2937] px-3 py-8 text-center text-xs text-gray-600">
            No drafts yet. When a lead replies, the agent proposes a response here for
            your approval — it never sends on its own.
          </p>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <DraftRow key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DraftRow({ draft }: { draft: DraftDTO }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = React.useState(draft.body);
  const [busy, setBusy] = React.useState<"approve" | "reject" | "pause" | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
  }

  async function approve() {
    if (busy) return;
    setBusy("approve");
    const result = await approveDraftAction({ draftId: draft.id, editedBody: body });
    setBusy(null);
    if (result.sent) {
      toast({ title: "Sent", description: `Reply delivered; thread → ${draft.proposedState}.`, variant: "success" });
      refresh();
    } else {
      toast({ title: "Blocked by the gate", description: `${result.gateReason ? result.gateReason + " — " : ""}${result.detail}`, variant: "warning" });
    }
  }

  async function reject() {
    if (busy) return;
    setBusy("reject");
    await rejectDraftAction(draft.id);
    setBusy(null);
    toast({ title: "Draft rejected", variant: "success" });
    refresh();
  }

  async function togglePause() {
    if (busy) return;
    setBusy("pause");
    await pauseConversationAction(draft.conversationId, !draft.paused);
    setBusy(null);
    toast({ title: draft.paused ? "Conversation resumed" : "Conversation paused", variant: "success" });
    refresh();
  }

  return (
    <div className="rounded-lg border border-[#1F2937] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-200">
          {draft.ownerName ?? "Owner"} · {draft.address}, {draft.city} {draft.state}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {draft.qualified ? (
            <span className="rounded bg-[#10B981]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#6EE7B7]">QUALIFIED</span>
          ) : null}
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${STATE_COLOR[draft.proposedState]}22`, color: STATE_COLOR[draft.proposedState] }}>
            → {draft.proposedState}
          </span>
          <span className="rounded bg-[#1F2937] px-1.5 py-0.5 text-[10px] text-gray-400">{draft.channel}</span>
        </span>
      </div>

      {draft.reasoning ? (
        <p className="mb-2 text-[11px] italic text-gray-500">{draft.reasoning}</p>
      ) : null}

      <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[72px]" spellCheck={false} />

      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" glow="emerald" onClick={approve} disabled={busy !== null}>
          {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approve &amp; send
        </Button>
        <Button variant="destructive" onClick={reject} disabled={busy !== null}>
          {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Reject
        </Button>
        <button
          type="button"
          onClick={togglePause}
          disabled={busy !== null}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#1F2937] px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          {draft.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {draft.paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
