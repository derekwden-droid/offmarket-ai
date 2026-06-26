"use client";

import * as React from "react";
import {
  Bot,
  Play,
  Pause,
  MessageSquare,
  Mail,
  Thermometer,
  Repeat,
  Gauge,
  Plus,
  Save,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Textarea, Select } from "@/components/ui/field";
import { ErrorBoundary } from "@/components/error-boundary";
import { LogConsole, type LogLine, type LogKind } from "@/components/dashboard/log-console";
import { useToast } from "@/components/ui/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel as PrismaChannel } from "@prisma/client";
import {
  loadAgentConfigAction,
  saveAgentConfigAction,
} from "@/app/dashboard/outreach/actions";
import { cn, formatNumber } from "@/lib/utils";

/*
 * The outreach agent runs as a client-side simulation: an interval-driven state
 * machine advances each synthetic conversation through outbound -> delivered ->
 * replied -> (qualified | cold) with probabilistic branching tuned by the
 * persistence and temperature controls. To go live, replace `step` with calls
 * to your messaging provider + /api route, and stream real events into the same
 * LogConsole. The config object below is already the shape you would persist.
 */

type Channel = "SMS" | "Email";
type Stage = "outbound" | "delivered" | "replied";

interface Conversation {
  id: string;
  name: string;
  channel: Channel;
  stage: Stage;
}

interface ScriptContext {
  ownerName: string;
  address: string;
  city: string;
}

const TONES = ["Professional", "Friendly", "Direct", "Empathetic"];
const OBJECTIVES = [
  "Qualify budget",
  "Confirm ownership",
  "Gauge timeline",
  "Book a call",
];
const TOKENS = ["{{ownerName}}", "{{address}}", "{{city}}"];
const NAMES = [
  "Maria Garcia",
  "James Smith",
  "Robert Johnson",
  "Linda Davis",
  "Carlos Hernandez",
  "Patricia Wilson",
];
const CITIES = ["Tampa", "Orlando", "Austin", "Atlanta", "Charlotte"];
const STREETS = ["Maple Ave", "Oak St", "Palm Dr", "Bayshore Rd", "Cypress Trail"];
const REPLIES = [
  "How much are you offering?",
  "I might be interested, tell me more.",
  "Is this a cash offer?",
  "Not selling right now, thanks.",
  "Can you call me this week?",
  "What's the catch?",
];

const DEFAULT_SCRIPT =
  "Hi {{ownerName}}, I'm reaching out about your property at {{address}} in {{city}}. We buy off-market homes as-is and can close fast. Would you consider a cash offer?";

const AGENT_CONFIG_KEY = ["agent-config"] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function makeContext(name: string): ScriptContext {
  const number = 100 + Math.floor(Math.random() * 9899);
  return {
    ownerName: name,
    address: `${number} ${pick(STREETS)}`,
    city: pick(CITIES),
  };
}

function renderScript(script: string, context: ScriptContext): string {
  return script
    .replaceAll("{{ownerName}}", context.ownerName)
    .replaceAll("{{address}}", context.address)
    .replaceAll("{{city}}", context.city);
}

export default function OutreachPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = React.useState(false);
  const seededRef = React.useRef(false);

  const configQuery = useQuery({
    queryKey: AGENT_CONFIG_KEY,
    queryFn: loadAgentConfigAction,
    refetchOnWindowFocus: false,
  });

  const [tone, setTone] = React.useState("Professional");
  const [objectives, setObjectives] = React.useState<Set<string>>(
    new Set(["Qualify budget", "Confirm ownership"]),
  );
  const [sms, setSms] = React.useState(true);
  const [email, setEmail] = React.useState(true);
  const [temperature, setTemperature] = React.useState(0.6);
  const [persistence, setPersistence] = React.useState(3);
  const [dailyCap, setDailyCap] = React.useState(40);
  const [script, setScript] = React.useState(DEFAULT_SCRIPT);

  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [running, setRunning] = React.useState(false);
  const [metrics, setMetrics] = React.useState({
    contacted: 0,
    replies: 0,
    qualified: 0,
    cold: 0,
  });

  const scriptRef = React.useRef<HTMLTextAreaElement>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = React.useRef<() => void>(() => {});
  const activeRef = React.useRef<Conversation[]>([]);
  const contactedRef = React.useRef(0);
  const repliesRef = React.useRef(0);
  const qualifiedRef = React.useRef(0);
  const coldRef = React.useRef(0);
  const capRef = React.useRef(40);
  const persistenceRef = React.useRef(3);
  const scriptValueRef = React.useRef(DEFAULT_SCRIPT);
  const channelsRef = React.useRef<Channel[]>(["SMS", "Email"]);

  React.useEffect(() => {
    scriptValueRef.current = script;
  }, [script]);
  React.useEffect(() => {
    persistenceRef.current = persistence;
  }, [persistence]);

  const pushLog = React.useCallback((kind: LogKind, text: string) => {
    setLogs((previous) => {
      const next = [
        ...previous,
        { id: crypto.randomUUID(), kind, text, ts: timestamp() },
      ];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, []);

  const stopAgent = React.useCallback(
    (completed: boolean) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setRunning(false);
      if (completed) {
        pushLog(
          "success",
          `Agent paused — ${qualifiedRef.current} qualified, ${coldRef.current} cold from ${contactedRef.current} contacted.`,
        );
        toast({
          title: "Daily cap reached",
          description: `${qualifiedRef.current} leads qualified.`,
          variant: "success",
        });
      }
    },
    [pushLog, toast],
  );

  const pickChannel = React.useCallback((): Channel | null => {
    const channels = channelsRef.current;
    if (channels.length === 0) return null;
    return pick(channels);
  }, []);

  const step = React.useCallback(() => {
    if (
      contactedRef.current < capRef.current &&
      activeRef.current.length < 4 &&
      Math.random() < 0.7
    ) {
      const channel = pickChannel();
      if (channel) {
        const name = pick(NAMES);
        const context = makeContext(name);
        activeRef.current.push({
          id: crypto.randomUUID(),
          name,
          channel,
          stage: "outbound",
        });
        contactedRef.current += 1;
        pushLog(
          "data",
          `[${channel}] → ${name}: ${renderScript(scriptValueRef.current, context)}`,
        );
      }
    }

    const stillActive: Conversation[] = [];
    for (const convo of activeRef.current) {
      const roll = Math.random();

      if (convo.stage === "outbound") {
        pushLog("info", `[${convo.channel}] delivered to ${convo.name}`);
        convo.stage = "delivered";
        stillActive.push(convo);
        continue;
      }

      if (convo.stage === "delivered") {
        const replyProb = 0.35 + persistenceRef.current * 0.08;
        if (roll < replyProb) {
          repliesRef.current += 1;
          pushLog("inbound", `[${convo.channel}] ← ${convo.name}: ${pick(REPLIES)}`);
          convo.stage = "replied";
          stillActive.push(convo);
        } else if (roll > 0.86) {
          coldRef.current += 1;
          pushLog("error", `${convo.name} went cold — no response.`);
        } else {
          stillActive.push(convo);
        }
        continue;
      }

      // replied
      if (roll < 0.5) {
        qualifiedRef.current += 1;
        pushLog("success", `${convo.name} qualified — motivated seller.`);
      } else if (roll > 0.78) {
        coldRef.current += 1;
        pushLog("error", `${convo.name} disqualified — not interested.`);
      } else {
        stillActive.push(convo);
      }
    }
    activeRef.current = stillActive;

    setMetrics({
      contacted: contactedRef.current,
      replies: repliesRef.current,
      qualified: qualifiedRef.current,
      cold: coldRef.current,
    });

    if (contactedRef.current >= capRef.current && activeRef.current.length === 0) {
      stopAgent(true);
    }
  }, [pickChannel, pushLog, stopAgent]);

  React.useEffect(() => {
    stepRef.current = step;
  }, [step]);

  React.useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Seed the controls from the saved configuration on first load.
  React.useEffect(() => {
    const config = configQuery.data;
    if (!config || seededRef.current) return;
    seededRef.current = true;
    setTone(config.tone);
    setObjectives(new Set(config.objectives));
    setSms(config.channels.includes("SMS"));
    setEmail(config.channels.includes("EMAIL"));
    setTemperature(config.thresholds.temperature);
    setPersistence(config.thresholds.persistence);
    setDailyCap(config.thresholds.dailyCap);
    setScript(config.scriptTemplate);
  }, [configQuery.data]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const channels: PrismaChannel[] = [];
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
      toast({
        title: "Configuration saved",
        description: "Agent settings persisted to the database.",
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: AGENT_CONFIG_KEY });
    } else {
      toast({
        title: "Couldn't save configuration",
        description: result.error,
        variant: "error",
      });
    }
  }

  function deploy() {
    if (intervalRef.current) return;

    const channels: Channel[] = [];
    if (sms) channels.push("SMS");
    if (email) channels.push("Email");
    if (channels.length === 0) {
      toast({
        title: "No channel enabled",
        description: "Enable SMS or Email before deploying the agent.",
        variant: "warning",
      });
      return;
    }

    channelsRef.current = channels;
    capRef.current = dailyCap;
    activeRef.current = [];
    contactedRef.current = 0;
    repliesRef.current = 0;
    qualifiedRef.current = 0;
    coldRef.current = 0;

    setMetrics({ contacted: 0, replies: 0, qualified: 0, cold: 0 });
    setLogs([]);
    setRunning(true);

    pushLog(
      "info",
      `Agent deployed — tone=${tone}, channels=${channels.join("+")}, cap=${dailyCap}, temp=${temperature.toFixed(2)}, persistence=${persistence}.`,
    );
    if (objectives.size > 0) {
      pushLog("info", `Objectives: ${Array.from(objectives).join(", ")}.`);
    }

    intervalRef.current = setInterval(() => stepRef.current(), 360);
  }

  function toggleObjective(value: string) {
    setObjectives((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function insertToken(token: string) {
    const element = scriptRef.current;
    if (!element) {
      setScript((previous) => `${previous} ${token}`);
      return;
    }
    const start = element.selectionStart ?? script.length;
    const end = element.selectionEnd ?? script.length;
    const next = script.slice(0, start) + token + script.slice(end);
    setScript(next);
    requestAnimationFrame(() => {
      element.focus();
      const cursor = start + token.length;
      element.setSelectionRange(cursor, cursor);
    });
  }

  const metricCards = [
    { label: "Contacted", value: metrics.contacted, accent: "#3B82F6" },
    { label: "Replies", value: metrics.replies, accent: "#F59E0B" },
    { label: "Qualified", value: metrics.qualified, accent: "#10B981" },
    { label: "Cold", value: metrics.cold, accent: "#F43F5E" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" style={{ color: "#10B981" }} />
            <h2 className="text-sm font-semibold text-gray-100">
              Agent Configuration
            </h2>
          </div>

          <div>
            <Label htmlFor="tone">Tone</Label>
            <Select
              id="tone"
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              disabled={running}
            >
              {TONES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
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
                    disabled={running}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                      active
                        ? "border-transparent text-[#04190F]"
                        : "border-[#1F2937] text-gray-400 hover:border-[#374151] hover:text-gray-200",
                    )}
                    style={
                      active
                        ? { backgroundColor: "#10B981" }
                        : undefined
                    }
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
                onClick={() => setSms((value) => !value)}
                disabled={running}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                  sms
                    ? "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-[#93C5FD]"
                    : "border-[#1F2937] text-gray-400 hover:text-gray-200",
                )}
              >
                <MessageSquare className="h-4 w-4" />
                SMS
              </button>
              <button
                type="button"
                onClick={() => setEmail((value) => !value)}
                disabled={running}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                  email
                    ? "border-[#3B82F6]/50 bg-[#3B82F6]/10 text-[#93C5FD]"
                    : "border-[#1F2937] text-gray-400 hover:text-gray-200",
                )}
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-[#1F2937] p-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <Thermometer className="h-3.5 w-3.5" />
                  Temperature
                </span>
                <span className="font-mono text-xs text-gray-300">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                disabled={running}
                className="w-full accent-[#3B82F6]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <Repeat className="h-3.5 w-3.5" />
                  Persistence
                </span>
                <span className="font-mono text-xs text-gray-300">
                  {persistence}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={persistence}
                onChange={(event) => setPersistence(Number(event.target.value))}
                disabled={running}
                className="w-full accent-[#10B981]"
              />
            </div>

            <div>
              <Label htmlFor="cap">
                <span className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5" />
                  Daily cap
                </span>
              </Label>
              <input
                id="cap"
                type="number"
                min={1}
                max={500}
                value={dailyCap}
                onChange={(event) =>
                  setDailyCap(
                    Math.min(Math.max(Number(event.target.value) || 1, 1), 500),
                  )
                }
                disabled={running}
                className="h-10 w-full rounded-lg border border-[#1F2937] bg-[#0B0F19] px-3 text-sm text-gray-100 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="mb-0">Opening script</Label>
              <div className="flex gap-1">
                {TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertToken(token)}
                    disabled={running}
                    className="flex items-center gap-0.5 rounded-md border border-[#1F2937] px-1.5 py-0.5 font-mono text-[10px] text-gray-400 transition-colors hover:border-[#374151] hover:text-gray-200 disabled:opacity-50"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {token.replace(/[{}]/g, "")}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              ref={scriptRef}
              value={script}
              onChange={(event) => setScript(event.target.value)}
              disabled={running}
              spellCheck={false}
            />
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save configuration
          </Button>

          {running ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => stopAgent(false)}
            >
              <Pause className="h-4 w-4" />
              Pause agent
            </Button>
          ) : (
            <Button
              variant="primary"
              glow="emerald"
              className="w-full"
              onClick={deploy}
            >
              <Play className="h-4 w-4" />
              Deploy agent
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 xl:col-span-3">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metricCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {card.label}
                </p>
                <p
                  className="mt-1.5 text-2xl font-semibold tracking-tight"
                  style={{ color: card.accent }}
                >
                  {formatNumber(card.value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <ErrorBoundary fallbackTitle="The monitor crashed">
          <LogConsole
            lines={logs}
            running={running}
            emptyHint="Deploy the agent to begin the conversation stream…"
            className="h-[560px]"
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
