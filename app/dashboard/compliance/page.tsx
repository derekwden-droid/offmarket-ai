"use client";

import * as React from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Power,
  Save,
  Loader2,
  Ban,
  Trash2,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Clock,
  Send,
  Plus,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, SuppressionReason } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { ErrorBoundary } from "@/components/error-boundary";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  loadComplianceOverviewAction,
  saveComplianceConfigAction,
  addSuppressionAction,
  removeSuppressionAction,
  recordConsentAction,
  evaluateSendAction,
  type ComplianceOverviewDTO,
  type ComplianceConfigDTO,
} from "@/app/dashboard/compliance/actions";
import type { ComplianceDecision } from "@/lib/compliance/decision";

const COMPLIANCE_KEY = ["compliance-overview"] as const;

const inputCls =
  "h-10 w-full rounded-lg border border-[#1F2937] bg-[#0B0F19] px-3 text-sm text-gray-100 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50";

const REASONS: SuppressionReason[] = ["STOP", "DNC", "BOUNCE", "MANUAL"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ConfigFormState {
  sendingEnabled: boolean;
  businessName: string;
  physicalAddress: string;
  supportEmail: string;
  smsFromNumber: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  dailyCapPerRecipient: number;
  consentTextVersion: string;
}

const DEFAULT_CONFIG: ConfigFormState = {
  sendingEnabled: false,
  businessName: "",
  physicalAddress: "",
  supportEmail: "",
  smsFromNumber: "",
  quietHoursStart: 8,
  quietHoursEnd: 20,
  dailyCapPerRecipient: 3,
  consentTextVersion: "v1",
};

function fromDTO(dto: ComplianceConfigDTO): ConfigFormState {
  return {
    sendingEnabled: dto.sendingEnabled,
    businessName: dto.businessName,
    physicalAddress: dto.physicalAddress,
    supportEmail: dto.supportEmail,
    smsFromNumber: dto.smsFromNumber ?? "",
    quietHoursStart: dto.quietHoursStart,
    quietHoursEnd: dto.quietHoursEnd,
    dailyCapPerRecipient: dto.dailyCapPerRecipient,
    consentTextVersion: dto.consentTextVersion,
  };
}

export default function CompliancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const overview = useQuery<ComplianceOverviewDTO>({
    queryKey: COMPLIANCE_KEY,
    queryFn: loadComplianceOverviewAction,
    refetchOnWindowFocus: false,
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: COMPLIANCE_KEY });
  }, [queryClient]);

  if (overview.isLoading) return <ComplianceSkeleton />;
  if (overview.isError || !overview.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-gray-400">
          Couldn&apos;t load the compliance backbone.{" "}
          <button className="text-[#3B82F6] underline" onClick={refresh}>
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="The compliance workspace crashed">
      <div className="space-y-4">
        <GateBanner config={overview.data.config} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ConfigCard data={overview.data.config} onSaved={refresh} />
          <GateTesterCard />
        </div>
        <SuppressionCard
          rows={overview.data.suppressions}
          onChanged={refresh}
        />
        <ConsentCard rows={overview.data.consent} onRecorded={refresh} />
      </div>
    </ErrorBoundary>
  );
}

function GateBanner({ config }: { config: ComplianceConfigDTO | null }) {
  const live = config?.sendingEnabled ?? false;
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          {live ? (
            <ShieldCheck className="h-6 w-6" style={{ color: "#10B981" }} />
          ) : (
            <ShieldAlert className="h-6 w-6" style={{ color: "#F59E0B" }} />
          )}
          <div>
            <h1 className="text-sm font-semibold text-gray-100">
              Compliance backbone {live ? "armed" : "holding"}
            </h1>
            <p className="text-xs text-gray-500">
              {live
                ? "Sending is enabled. Every send is gated by consent, suppression, DNC, and quiet hours."
                : "Global kill switch is OFF — no outbound is dispatched until you enable sending below."}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            live ? "bg-[#10B981]/15 text-[#6EE7B7]" : "bg-[#F59E0B]/15 text-[#FCD34D]",
          )}
        >
          {live ? "SENDING ENABLED" : "SENDING DISABLED"}
        </span>
      </CardContent>
    </Card>
  );
}

function ConfigCard({
  data,
  onSaved,
}: {
  data: ComplianceConfigDTO | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<ConfigFormState>(
    data ? fromDTO(data) : DEFAULT_CONFIG,
  );
  const [saving, setSaving] = React.useState(false);
  const seeded = React.useRef(Boolean(data));

  React.useEffect(() => {
    if (data && !seeded.current) {
      seeded.current = true;
      setForm(fromDTO(data));
    }
  }, [data]);

  function set<K extends keyof ConfigFormState>(key: K, value: ConfigFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const result = await saveComplianceConfigAction({
      ...form,
      smsFromNumber: form.smsFromNumber.trim(),
    });
    setSaving(false);
    if (result.ok) {
      toast({
        title: "Compliance config saved",
        description: form.sendingEnabled
          ? "Sending is ENABLED — the gate is live."
          : "Saved. Sending remains disabled.",
        variant: "success",
      });
      onSaved();
    } else {
      toast({
        title: "Couldn't save",
        description: result.error,
        variant: "error",
      });
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" style={{ color: "#10B981" }} />
          <h2 className="text-sm font-semibold text-gray-100">
            Compliance Configuration
          </h2>
        </div>

        <div>
          <Label htmlFor="businessName">Business name (sender ID)</Label>
          <input
            id="businessName"
            className={inputCls}
            value={form.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="OffMarket Acquisitions LLC"
          />
        </div>

        <div>
          <Label htmlFor="physicalAddress">Physical postal address (CAN-SPAM)</Label>
          <input
            id="physicalAddress"
            className={inputCls}
            value={form.physicalAddress}
            onChange={(e) => set("physicalAddress", e.target.value)}
            placeholder="123 Main St, Tampa, FL 33601"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="supportEmail">Support email</Label>
            <input
              id="supportEmail"
              className={inputCls}
              value={form.supportEmail}
              onChange={(e) => set("supportEmail", e.target.value)}
              placeholder="help@offmarket.ai"
            />
          </div>
          <div>
            <Label htmlFor="smsFromNumber">Two-way SMS number (E.164)</Label>
            <input
              id="smsFromNumber"
              className={inputCls}
              value={form.smsFromNumber}
              onChange={(e) => set("smsFromNumber", e.target.value)}
              placeholder="+13055551234"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="qhStart">Quiet start</Label>
            <input
              id="qhStart"
              type="number"
              min={0}
              max={23}
              className={inputCls}
              value={form.quietHoursStart}
              onChange={(e) => set("quietHoursStart", Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="qhEnd">Quiet end</Label>
            <input
              id="qhEnd"
              type="number"
              min={1}
              max={24}
              className={inputCls}
              value={form.quietHoursEnd}
              onChange={(e) => set("quietHoursEnd", Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="cap">Daily cap</Label>
            <input
              id="cap"
              type="number"
              min={1}
              max={50}
              className={inputCls}
              value={form.dailyCapPerRecipient}
              onChange={(e) =>
                set("dailyCapPerRecipient", Number(e.target.value))
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor="consentVersion">Consent text version</Label>
          <input
            id="consentVersion"
            className={inputCls}
            value={form.consentTextVersion}
            onChange={(e) => set("consentTextVersion", e.target.value)}
            placeholder="v1-2026-06"
          />
          <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
            <Clock className="h-3 w-3" />
            Quiet hours are recipient-local (8:00–20:00 default). DNC + quiet
            hours apply to SMS; email enforces unsubscribe + postal address.
          </p>
        </div>

        <button
          type="button"
          onClick={() => set("sendingEnabled", !form.sendingEnabled)}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            form.sendingEnabled
              ? "border-[#10B981]/50 bg-[#10B981]/10 text-[#6EE7B7]"
              : "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FCD34D]",
          )}
        >
          <Power className="h-4 w-4" />
          {form.sendingEnabled
            ? "Global sending ENABLED (kill switch armed)"
            : "Global sending DISABLED — click to enable"}
        </button>

        <Button
          variant="primary"
          glow="emerald"
          className="w-full"
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save compliance config
        </Button>
      </CardContent>
    </Card>
  );
}

function GateTesterCard() {
  const [channel, setChannel] = React.useState<Channel>("SMS");
  const [recipient, setRecipient] = React.useState("");
  const [propertyId, setPropertyId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [decision, setDecision] = React.useState<ComplianceDecision | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await evaluateSendAction({ channel, recipient, propertyId });
    setBusy(false);
    if (result.ok) {
      setDecision(result.data);
    } else {
      setDecision(null);
      setError(result.error);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4" style={{ color: "#3B82F6" }} />
          <h2 className="text-sm font-semibold text-gray-100">
            Send-gate tester
          </h2>
        </div>
        <p className="text-xs text-gray-500">
          Dry-run the exact gate Phase 5 calls before every send. No message is
          dispatched.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="testChannel">Channel</Label>
            <Select
              id="testChannel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="SMS">SMS</option>
              <option value="EMAIL">EMAIL</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="testRecipient">Recipient</Label>
            <input
              id="testRecipient"
              className={inputCls}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={channel === "SMS" ? "+13055551234" : "owner@email.com"}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="testPropertyId">Property ID (UUID)</Label>
          <input
            id="testPropertyId"
            className={inputCls}
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </div>

        <Button
          variant="secondary"
          className="w-full"
          onClick={run}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Evaluate gate
        </Button>

        {error ? (
          <p className="text-xs text-[#F87171]">{error}</p>
        ) : null}

        {decision ? (
          <div className="space-y-2 rounded-lg border border-[#1F2937] p-3">
            <div className="flex items-center gap-2">
              {decision.allowed ? (
                <CheckCircle2 className="h-4 w-4" style={{ color: "#10B981" }} />
              ) : (
                <XCircle className="h-4 w-4" style={{ color: "#F43F5E" }} />
              )}
              <span
                className="text-sm font-semibold"
                style={{ color: decision.allowed ? "#6EE7B7" : "#FB7185" }}
              >
                {decision.allowed ? "ALLOW" : `BLOCK · ${decision.reason}`}
              </span>
            </div>
            <p className="text-xs text-gray-400">{decision.detail}</p>
            <ul className="space-y-1">
              {decision.checks.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center gap-2 text-[11px] text-gray-500"
                >
                  <CheckCircle2 className="h-3 w-3" style={{ color: "#10B981" }} />
                  <span className="text-gray-300">{c.name}</span>
                  {c.note ? <span className="text-gray-600">· {c.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SuppressionCard({
  rows,
  onChanged,
}: {
  rows: ComplianceOverviewDTO["suppressions"];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("SMS");
  const [reason, setReason] = React.useState<SuppressionReason>("MANUAL");
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (busy) return;
    setBusy(true);
    const result = await addSuppressionAction({ value, channel, reason });
    setBusy(false);
    if (result.ok) {
      setValue("");
      toast({
        title: "Suppressed",
        description: `${result.data.value} blocked on ${result.data.channel}.`,
        variant: "success",
      });
      onChanged();
    } else {
      toast({ title: "Couldn't suppress", description: result.error, variant: "error" });
    }
  }

  async function remove(v: string, ch: Channel) {
    const result = await removeSuppressionAction(v, ch);
    if (result.ok) {
      toast({
        title: "Removed",
        description: `${v} re-subscribed on ${ch}.`,
        variant: "success",
      });
      onChanged();
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4" style={{ color: "#F43F5E" }} />
          <h2 className="text-sm font-semibold text-gray-100">
            Suppression ledger
          </h2>
          <span className="ml-auto text-xs text-gray-500">{rows.length} entries</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className={cn(inputCls, "md:col-span-2")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="+13055551234 or owner@email.com"
          />
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            <option value="SMS">SMS</option>
            <option value="EMAIL">EMAIL</option>
          </Select>
          <div className="flex gap-2">
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as SuppressionReason)}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={add} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#1F2937]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F19] text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-600">
                    No suppressions yet. STOP replies land here within seconds.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#1F2937]">
                    <td className="px-3 py-2 font-mono text-gray-200">{row.value}</td>
                    <td className="px-3 py-2 text-gray-400">{row.channel}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-[#F43F5E]/10 px-1.5 py-0.5 text-[10px] text-[#FB7185]">
                        {row.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(row.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => remove(row.value, row.channel)}
                        className="text-gray-600 hover:text-[#FB7185]"
                        title="Remove (re-subscribe)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsentCard({
  rows,
  onRecorded,
}: {
  rows: ComplianceOverviewDTO["consent"];
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [propertyId, setPropertyId] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("SMS");
  const [source, setSource] = React.useState("web-form");
  const [busy, setBusy] = React.useState(false);

  async function record() {
    if (busy) return;
    setBusy(true);
    const result = await recordConsentAction({ propertyId, channel, source });
    setBusy(false);
    if (result.ok) {
      setPropertyId("");
      toast({
        title: "Consent recorded",
        description: `${result.data.channel} consent (${result.data.consentTextVersion}).`,
        variant: "success",
      });
      onRecorded();
    } else {
      toast({ title: "Couldn't record consent", description: result.error, variant: "error" });
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" style={{ color: "#10B981" }} />
          <h2 className="text-sm font-semibold text-gray-100">Consent records</h2>
          <span className="ml-auto text-xs text-gray-500">{rows.length} on file</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className={cn(inputCls, "md:col-span-2")}
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="Property ID (UUID)"
          />
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            <option value="SMS">SMS</option>
            <option value="EMAIL">EMAIL</option>
          </Select>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="source"
            />
            <Button variant="secondary" onClick={record} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#1F2937]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F19] text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Property</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-600">
                    No consent yet. The gate blocks every send without a record.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#1F2937]">
                    <td className="px-3 py-2 font-mono text-gray-300">
                      {row.propertyId.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 text-gray-400">{row.channel}</td>
                    <td className="px-3 py-2 text-gray-400">{row.source}</td>
                    <td className="px-3 py-2 text-gray-400">{row.consentTextVersion}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ComplianceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-xl border border-[#1F2937] bg-[#111827]" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-[520px] animate-pulse rounded-xl border border-[#1F2937] bg-[#111827]" />
        <div className="h-[520px] animate-pulse rounded-xl border border-[#1F2937] bg-[#111827]" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-[#1F2937] bg-[#111827]" />
    </div>
  );
}
