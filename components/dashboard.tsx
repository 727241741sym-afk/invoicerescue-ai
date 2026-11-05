"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  History,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Pause,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./modal";
import {
  actionLabels,
  classificationLabels,
  type Classification,
  type Invoice,
  type Recommendation,
  type WorkspaceData,
} from "@/lib/types";
import {
  dateInZone,
  daysOverdue,
  isSettled,
  money,
  reminderBlock,
  statusLabel,
} from "@/lib/policy";
import { demoMessages, makeDemoRecommendation } from "@/lib/demo";
import { logout } from "@/app/login/actions";

type Page = "Overview" | "Invoices" | "Approval center" | "Activity log";
type Connections = { ai: string; model: string; webhook: boolean };
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Invoices", icon: FileText },
  { name: "Approval center", icon: ShieldCheck },
  { name: "Activity log", icon: History },
] as const;
const exampleLabels = [
  "Forgot to pay",
  "Missing link",
  "Disputed amount",
  "Payment promise",
  "Already paid",
  "Prompt injection",
];

async function post(path: string, input: unknown = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
}

async function loadWorkspace(signal?: AbortSignal): Promise<WorkspaceData> {
  const response = await fetch("/api/workspace", { cache: "no-store", signal });
  if (!response.ok)
    throw new Error("Your workspace could not refresh. Please sign in again.");
  return response.json();
}

function InvoiceBadge({ invoice, today }: { invoice: Invoice; today: string }) {
  const label = statusLabel(invoice, today);
  const tone = isSettled(invoice)
    ? "success"
    : invoice.paused
      ? "neutral"
      : daysOverdue(invoice, today)
        ? "warning"
        : "blue";
  return (
    <span className={`badge badge-${tone}`}>
      <i />
      {label}
    </span>
  );
}

export function Dashboard({
  initialData,
  mode,
  today,
  connections,
}: {
  initialData: WorkspaceData;
  mode: "demo" | "sandbox";
  today: string;
  connections: Connections;
}) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState<Page>("Overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [demoLoaded, setDemoLoaded] = useState(false);
  const demo = mode === "demo";

  useEffect(() => {
    if (!demo) return;
    try {
      const stored = localStorage.getItem("invoicerescue-demo-v1");
      if (stored) {
        const parsed = JSON.parse(stored) as WorkspaceData;
        if (
          Array.isArray(parsed.invoices) &&
          Array.isArray(parsed.recommendations) &&
          Array.isArray(parsed.audit) &&
          parsed.invoices.every(
            (invoice) =>
              typeof invoice.id === "string" &&
              typeof invoice.customer_name === "string" &&
              Number.isFinite(invoice.total_cents),
          )
        )
          setData(parsed);
      }
    } catch {
      /* A fresh demo is available if browser storage is unavailable. */
    }
    setDemoLoaded(true);
  }, [demo]);

  useEffect(() => {
    if (demo && demoLoaded) {
      try {
        localStorage.setItem("invoicerescue-demo-v1", JSON.stringify(data));
      } catch {
        /* In-memory demo remains usable. */
      }
    }
  }, [data, demo, demoLoaded]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (document.hidden || busy) return;
      try {
        setData(await loadWorkspace(controller.signal));
      } catch {
        /* Explicit actions display errors. Background refresh preserves the current view. */
      }
    }, 15_000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [demo, busy]);

  async function refresh() {
    setData(await loadWorkspace());
  }

  async function run(label: string, operation: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await operation();
      if (!demo) await refresh();
    } catch (error) {
      if (!demo) {
        try {
          await refresh();
        } catch {
          /* Preserve the original operation error. */
        }
      }
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The operation could not be completed.",
        error: true,
      });
    } finally {
      setBusy("");
    }
  }

  function addDemoAudit(
    current: WorkspaceData,
    invoiceId: string | null,
    title: string,
    detail: string,
  ) {
    return [
      {
        id: crypto.randomUUID(),
        invoice_id: invoiceId,
        title,
        detail: `Simulated · ${detail}`,
        created_at: new Date().toISOString(),
      },
      ...current.audit,
    ];
  }

  const pending = data.recommendations.filter(
    (recommendation) => recommendation.status === "pending",
  );
  const openInvoices = data.invoices.filter(
    (invoice) => !isSettled(invoice) && invoice.status !== "DRAFT",
  );
  const outstanding = openInvoices.reduce(
    (sum, invoice) => sum + invoice.due_cents,
    0,
  );
  const overdue = openInvoices.filter(
    (invoice) => daysOverdue(invoice, today) > 0,
  );
  const paid = data.invoices
    .filter((invoice) => ["PAID", "PARTIALLY_PAID"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.total_cents - invoice.due_cents, 0);
  const visibleInvoices = data.invoices.filter(
    (invoice) =>
      `${invoice.customer_name} ${invoice.number} ${invoice.customer_email}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "overdue"
          ? daysOverdue(invoice, today) > 0
          : filter === "paid"
            ? isSettled(invoice)
            : invoice.paused)),
  );
  const invoice = data.invoices.find((item) => item.id === selected);
  const recommendation = data.recommendations.find(
    (item) => item.invoice_id === selected,
  );
  const aging = [
    {
      name: "Not due",
      color: "#b9c9ff",
      amount: openInvoices
        .filter((item) => !daysOverdue(item, today))
        .reduce((sum, item) => sum + item.due_cents, 0),
    },
    {
      name: "1–14 days",
      color: "#6689f5",
      amount: openInvoices
        .filter(
          (item) =>
            daysOverdue(item, today) >= 1 && daysOverdue(item, today) <= 14,
        )
        .reduce((sum, item) => sum + item.due_cents, 0),
    },
    {
      name: "15–30 days",
      color: "#345be4",
      amount: openInvoices
        .filter(
          (item) =>
            daysOverdue(item, today) > 14 && daysOverdue(item, today) <= 30,
        )
        .reduce((sum, item) => sum + item.due_cents, 0),
    },
    {
      name: "31+ days",
      color: "#172f91",
      amount: openInvoices
        .filter((item) => daysOverdue(item, today) > 30)
        .reduce((sum, item) => sum + item.due_cents, 0),
    },
  ];

  async function analyze(message: string, receivedAt: string, example: number) {
    if (!invoice) return;
    await run("analyze", async () => {
      if (demo) {
        const classification: Classification = [
          "forgot_to_pay",
          "missing_payment_link",
          "invoice_dispute",
          "promise_to_pay",
          "already_paid_claim",
          "unknown",
        ][example] as Classification;
        const result = makeDemoRecommendation(
          invoice,
          message,
          classification,
          new Date().toISOString(),
        );
        setData((current) => ({
          ...current,
          recommendations: [
            result,
            ...current.recommendations.map((item) =>
              item.invoice_id === invoice.id && item.status === "pending"
                ? { ...item, status: "rejected" as const }
                : item,
            ),
          ],
          invoices: current.invoices.map((item) =>
            item.id === invoice.id &&
            ["invoice_dispute", "already_paid_claim"].includes(classification)
              ? { ...item, paused: true }
              : item,
          ),
          audit: addDemoAudit(
            current,
            invoice.id,
            "Example analysis prepared",
            classificationLabels[classification],
          ),
        }));
      } else
        await post("/api/analyze", {
          invoiceId: invoice.id,
          message,
          receivedAt,
        });
      setNotice({
        text: demo
          ? "Preset example prepared. Review the suggested action below."
          : "AI analysis is ready for your review.",
        error: false,
      });
    });
  }

  async function decide(
    decision: "approve" | "reject",
    draft: string,
    promiseDate: string | null,
  ) {
    if (!recommendation || !invoice) return;
    await run("review", async () => {
      if (demo) {
        const blocked = ["prepare_reminder", "resend_payment_link"].includes(
          recommendation.action,
        )
          ? reminderBlock(invoice, today)
          : null;
        if (decision === "approve" && blocked) throw new Error(blocked);
        setData((current) => ({
          ...current,
          recommendations: current.recommendations.map((item) =>
            item.id === recommendation.id
              ? {
                  ...item,
                  status: decision === "approve" ? "executed" : "rejected",
                  draft,
                }
              : item,
          ),
          invoices: current.invoices.map((item) =>
            item.id === invoice.id && decision === "approve"
              ? {
                  ...item,
                  paused:
                    ["human_review", "pause_reminders"].includes(
                      recommendation.action,
                    ) || item.paused,
                  promise_date:
                    recommendation.action === "record_promise"
                      ? promiseDate
                      : item.promise_date,
                }
              : item,
          ),
          audit: addDemoAudit(
            current,
            invoice.id,
            decision === "approve"
              ? "Example action approved"
              : "Example action rejected",
            actionLabels[recommendation.action],
          ),
        }));
      } else
        await post(`/api/recommendations/${recommendation.id}`, {
          decision,
          draft,
          promiseDate,
        });
      setNotice({
        text: demo
          ? "Demo action recorded in this browser."
          : decision === "reject"
            ? "Recommendation rejected."
            : "Approved action processed. Check its recorded outcome in Activity log.",
        error: false,
      });
    });
  }

  async function invoiceAction(
    action: "sync" | "send" | "pause" | "resume" | "simulate_payment",
    operationId?: string,
  ) {
    if (!invoice) return;
    await run(action, async () => {
      if (demo)
        setData((current) => ({
          ...current,
          invoices: current.invoices.map((item) =>
            item.id === invoice.id
              ? {
                  ...item,
                  ...(action === "simulate_payment"
                    ? { status: "PAID", due_cents: 0 }
                    : action === "send"
                      ? { status: "UNPAID" }
                      : action === "pause"
                        ? { paused: true }
                        : action === "resume"
                          ? { paused: false }
                          : {}),
                }
              : item,
          ),
          recommendations: current.recommendations.map((item) =>
            item.invoice_id === invoice.id &&
            item.status === "pending" &&
            action === "simulate_payment"
              ? { ...item, status: "blocked" }
              : item,
          ),
          audit: addDemoAudit(
            current,
            invoice.id,
            `Example invoice ${action.replaceAll("_", " ")}`,
            invoice.number,
          ),
        }));
      else
        await post(`/api/invoices/${invoice.id}`, {
          action,
          ...(operationId ? { operationId } : {}),
        });
      setNotice({
        text: demo
          ? "Simulated invoice state updated."
          : action === "send"
            ? "PayPal accepted the invoice send. The latest status is shown."
            : "Invoice updated.",
        error: false,
      });
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <span>
            InvoiceRescue<span className="brand-ai">AI</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">IR</span>
          <div>
            <strong>Your business</strong>
            <small>{demo ? "Interactive demo" : "Merchant workspace"}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => setPage(name)}
              aria-current={page === name ? "page" : undefined}
              className={page === name ? "nav-item active" : "nav-item"}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Approval center" && pending.length ? (
                <b>{pending.length}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>You’re always in control.</strong>
            <p>
              AI finds the next step.
              <br />
              You approve what happens.
            </p>
          </div>
          <button className="nav-item" onClick={() => setShowConnections(true)}>
            <Settings2 size={18} /> Connections
          </button>
          <div className="profile">
            <span className="profile-avatar">{demo ? "D" : "M"}</span>
            <div>
              <strong>{demo ? "Demo workspace" : "Your workspace"}</strong>
              <small>
                {demo ? "Explore at your own pace" : "Authorized merchant"}
              </small>
            </div>
            {!demo ? (
              <form action={logout}>
                <button className="text-button" type="submit">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment-pill">
              <i />
              {demo ? "Demo mode" : "PayPal Sandbox"}
            </span>
            {demo ? (
              <Link className="sandbox-link" href="/?workspace=sandbox">
                Open Sandbox <ArrowUpRight size={15} />
              </Link>
            ) : (
              <Link className="sandbox-link" href="/">
                Explore demo <ArrowUpRight size={15} />
              </Link>
            )}
            <span className="topbar-avatar">IR</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR CASH COLLECTION COPILOT</p>
              <h1>
                {page === "Overview"
                  ? "A little clarity. Better cash flow."
                  : page}
              </h1>
              <p className="muted">
                {page === "Overview"
                  ? "Understand what’s holding up payment. Take the right next step."
                  : page === "Approval center"
                    ? "Thoughtful follow-ups, with your final say."
                    : page === "Activity log"
                      ? "Every decision and payment status, in one place."
                      : "The full picture behind every outstanding invoice."}
              </p>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() =>
                  run("sync-all", async () => {
                    if (demo)
                      setNotice({
                        text: "These invoices are synthetic demo data. Open Sandbox to sync PayPal invoices.",
                        error: false,
                      });
                    else {
                      const result = await post("/api/sync");
                      setNotice({
                        text: `${result.count} USD invoice(s) synchronized. ${result.skipped} non-USD invoice(s) skipped.`,
                        error: false,
                      });
                    }
                  })
                }
              >
                {busy === "sync-all" ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <RefreshCw size={15} />
                )}{" "}
                Sync invoices
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus size={17} /> New invoice
              </Button>
            </div>
          </div>

          <div className={`mode-banner ${demo ? "mode-demo" : "mode-sandbox"}`}>
            <span className="mode-icon">
              {demo ? <Sparkles size={16} /> : <ShieldCheck size={16} />}
            </span>
            <p>
              <strong>
                {demo
                  ? "Make yourself at home."
                  : "Connected to your Sandbox workspace."}
              </strong>{" "}
              {demo
                ? "All names, amounts and actions here are simulated. Changes stay in this browser."
                : "PayPal test invoices, real AI analysis, and approval before every notification."}
            </p>
            {demo ? (
              <button
                className="text-button"
                onClick={() => {
                  localStorage.removeItem("invoicerescue-demo-v1");
                  setData(initialData);
                  setSelected(null);
                  setNotice({
                    text: "Demo reset to the original six scenarios.",
                    error: false,
                  });
                }}
              >
                Reset demo <RefreshCw size={13} />
              </button>
            ) : null}
          </div>

          {notice ? (
            <div
              className={`notice toast ${notice.error ? "notice-error" : "notice-success"}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.error ? <TriangleAlert size={17} /> : <Check size={17} />}
              <span>{notice.text}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          {page === "Overview" ? (
            <>
              <section className="metrics" aria-label="Invoice summary">
                <Metric
                  label="Outstanding balance"
                  value={money(outstanding)}
                  detail={`${openInvoices.length} open invoices`}
                  icon={<Wallet size={19} />}
                />
                <Metric
                  label="Overdue amount"
                  value={money(
                    overdue.reduce((sum, item) => sum + item.due_cents, 0),
                  )}
                  detail={`${overdue.length} invoices need a follow-up`}
                  icon={<Clock3 size={19} />}
                  tone="amber"
                />
                <Metric
                  label="Confirmed paid amount"
                  value={money(paid)}
                  detail={
                    demo
                      ? "Synthetic payment examples"
                      : "Paid and partially paid invoices"
                  }
                  icon={<ArrowDownLeft size={19} />}
                  tone="green"
                />
                <Metric
                  label="Ready for your review"
                  value={String(pending.length).padStart(2, "0")}
                  detail="AI recommendations awaiting approval"
                  icon={<Sparkles size={19} />}
                />
              </section>
              <div className="overview-grid">
                <section className="panel collection-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="small-label">
                        PAYMENT BLOCKER INTELLIGENCE
                      </span>
                      <h2>A better follow-up starts with why.</h2>
                    </div>
                    <span className="ai-tag">
                      <Sparkles size={13} /> AI assisted
                    </span>
                  </div>
                  <p className="panel-description">
                    Turn a customer’s reply into a clear, considerate next step.
                  </p>
                  <div className="workflow">
                    <WorkflowStep
                      number="01"
                      icon={<FileText size={18} />}
                      title="Read the context"
                      text="Invoice + customer message"
                    />
                    <ArrowRight className="workflow-arrow" size={16} />
                    <WorkflowStep
                      number="02"
                      icon={<Sparkles size={18} />}
                      title="Find the blocker"
                      text="Evidence-backed suggestion"
                    />
                    <ArrowRight className="workflow-arrow" size={16} />
                    <WorkflowStep
                      number="03"
                      icon={<ShieldCheck size={18} />}
                      title="You approve"
                      text="Then follow up with PayPal"
                    />
                  </div>
                  <div className="collection-bottom">
                    <span>
                      <i className="status-dot" />
                      {pending.length
                        ? `${pending.length} opportunities to move things forward`
                        : "Your next opportunity starts with an invoice"}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => setPage("Approval center")}
                    >
                      Review actions <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
                <section className="panel aging-panel">
                  <div className="panel-heading">
                    <h2>Receivables aging</h2>
                    <span className="small-label">USD</span>
                  </div>
                  <div className="aging-total">
                    {money(outstanding)}
                    <span>across open invoices</span>
                  </div>
                  <div
                    className="aging-bar"
                    role="img"
                    aria-label="Outstanding balances by overdue age"
                  >
                    {aging.map((bucket) => (
                      <span
                        key={bucket.name}
                        style={{
                          width: `${outstanding ? (bucket.amount / outstanding) * 100 : 25}%`,
                          background: outstanding ? bucket.color : "#eef1f6",
                        }}
                      />
                    ))}
                  </div>
                  <div className="aging-legend">
                    {aging.map((bucket) => (
                      <div key={bucket.name}>
                        <span>
                          <i style={{ background: bucket.color }} />
                          {bucket.name}
                        </span>
                        <strong>{money(bucket.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {page === "Overview" || page === "Invoices" ? (
            <div className={page === "Overview" ? "bottom-grid" : ""}>
              <section className="panel invoice-panel">
                <div className="panel-heading">
                  <div className="inline-heading">
                    <h2>Invoices</h2>
                    <span className="count-pill">{data.invoices.length}</span>
                  </div>
                  {page === "Overview" ? (
                    <button
                      className="text-button"
                      onClick={() => setPage("Invoices")}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="table-tools">
                  <div
                    className="filters"
                    role="group"
                    aria-label="Filter invoices"
                  >
                    {[
                      ["all", "All invoices"],
                      ["overdue", "Overdue"],
                      ["paid", "Paid / closed"],
                      ["paused", "On hold"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={filter === value ? "selected" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="search-field">
                    <Search size={15} />
                    <input
                      aria-label="Search invoices"
                      placeholder="Search invoices…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer / invoice</th>
                        <th>Amount due</th>
                        <th>Due date</th>
                        <th>Status</th>
                        <th>
                          <span className="sr-only">Open invoice</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInvoices.map((item, index) => (
                        <tr key={item.id} onClick={() => setSelected(item.id)}>
                          <td>
                            <button
                              className="customer-cell"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(item.id);
                              }}
                            >
                              <span
                                className={`customer-avatar color-${index % 5}`}
                              >
                                {item.customer_name
                                  .split(" ")
                                  .map((word) => word[0])
                                  .slice(0, 2)
                                  .join("")}
                              </span>
                              <span>
                                <strong>{item.customer_name}</strong>
                                <small>{item.number}</small>
                              </span>
                            </button>
                          </td>
                          <td className="amount-cell">
                            {money(item.due_cents)}
                            <small>USD</small>
                          </td>
                          <td>
                            <span className="date-cell">
                              {new Date(
                                `${item.due_date}T12:00:00`,
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            <small
                              className={
                                daysOverdue(item, today)
                                  ? "overdue-text"
                                  : "muted"
                              }
                            >
                              {daysOverdue(item, today)
                                ? `${daysOverdue(item, today)} days overdue`
                                : isSettled(item)
                                  ? "Payment closed"
                                  : "Upcoming"}
                            </small>
                          </td>
                          <td>
                            <InvoiceBadge invoice={item} today={today} />
                          </td>
                          <td>
                            <ArrowUpRight size={16} className="row-arrow" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visibleInvoices.length ? (
                    <div className="empty-state">
                      <FileText size={28} />
                      <h3>
                        {data.invoices.length
                          ? "No matching invoices"
                          : "Your first invoice starts here"}
                      </h3>
                      <p>
                        {data.invoices.length
                          ? "Try a different search or filter."
                          : "Create a Sandbox invoice or synchronize your existing PayPal invoices."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreating(true)}
                      >
                        Create an invoice
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="table-footer">
                  <span>
                    {visibleInvoices.length} invoice
                    {visibleInvoices.length === 1 ? "" : "s"} ·{" "}
                    {demo
                      ? "Synthetic demo data"
                      : "Synced PayPal Sandbox data"}
                  </span>
                  <span>
                    <ShieldCheck size={13} /> Approval protected
                  </span>
                </div>
              </section>
              {page === "Overview" ? (
                <section className="panel next-actions">
                  <div className="panel-heading">
                    <h2>Your next best actions</h2>
                    <Sparkles size={17} className="blue-text" />
                  </div>
                  <p className="panel-description">
                    A little context goes a long way.
                  </p>
                  {pending.slice(0, 3).map((item) => {
                    const related = data.invoices.find(
                      (invoice) => invoice.id === item.invoice_id,
                    );
                    if (!related) return null;
                    return (
                      <button
                        key={item.id}
                        className="action-preview"
                        onClick={() => setSelected(related.id)}
                      >
                        <span
                          className={
                            item.action === "human_review"
                              ? "action-icon amber"
                              : "action-icon"
                          }
                        >
                          {item.action === "resend_payment_link" ? (
                            <Link2 size={17} />
                          ) : item.action === "human_review" ? (
                            <TriangleAlert size={17} />
                          ) : (
                            <Sparkles size={17} />
                          )}
                        </span>
                        <span>
                          <strong>
                            {classificationLabels[item.classification]}
                          </strong>
                          <small>
                            {related.customer_name} · {money(related.due_cents)}
                          </small>
                          <span className="action-cta">
                            {actionLabels[item.action]} <ArrowRight size={12} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {!pending.length ? (
                    <div className="quiet-state">
                      <CheckCheck size={25} />
                      <strong>You’re all caught up.</strong>
                      <p>Analyze a customer reply to find the next step.</p>
                    </div>
                  ) : null}
                  <div className="human-note">
                    <ShieldCheck size={14} /> Every message gets your approval
                    first.
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {page === "Approval center" ? (
            <section className="approval-grid">
              {pending.map((item) => {
                const related = data.invoices.find(
                  (invoice) => invoice.id === item.invoice_id,
                );
                return related ? (
                  <article className="panel approval-card" key={item.id}>
                    <div className="panel-heading">
                      <span className="ai-tag">
                        <Sparkles size={13} />
                        {classificationLabels[item.classification]}
                      </span>
                      <span className="small-label">
                        {demo ? "PRESET EXAMPLE" : "AI SUGGESTION"}
                      </span>
                    </div>
                    <h2>{related.customer_name}</h2>
                    <p className="muted">
                      {related.number} · {money(related.due_cents)} outstanding
                    </p>
                    <blockquote>“{item.evidence[0]}”</blockquote>
                    <div className="approval-action">
                      <ShieldCheck size={17} />
                      <strong>{actionLabels[item.action]}</strong>
                    </div>
                    <Button onClick={() => setSelected(related.id)}>
                      Review recommendation <ArrowRight size={15} />
                    </Button>
                  </article>
                ) : null;
              })}
              {!pending.length ? (
                <div className="panel empty-state">
                  <CheckCheck size={32} />
                  <h2>Everything has been reviewed.</h2>
                  <p>
                    New recommendations will appear here after you analyze a
                    customer message.
                  </p>
                  <Button variant="outline" onClick={() => setPage("Invoices")}>
                    View invoices
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {page === "Activity log" ? (
            <section className="panel activity-panel">
              <div className="panel-heading">
                <h2>Workspace activity</h2>
                <span className="small-label">
                  {demo ? "SIMULATED EVENTS" : "RECORDED EVENTS"}
                </span>
              </div>
              {data.audit.map((item) => (
                <div className="activity-row" key={item.id}>
                  <span className="activity-icon">
                    <History size={17} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
              {!data.audit.length ? (
                <div className="empty-state">
                  <History size={28} />
                  <h3>A clear record, from the start.</h3>
                  <p>Your invoice and approval events will appear here.</p>
                </div>
              ) : null}
            </section>
          ) : null}
          <footer className="app-footer">
            <span>
              InvoiceRescue AI <i /> More context. More considerate collections.
            </span>
            <span>
              Built with PayPal Sandbox & AI <ShieldCheck size={13} />
            </span>
          </footer>
        </main>
      </div>

      {invoice && !creating ? (
        <Modal title={invoice.number} onClose={() => setSelected(null)} wide>
          {notice ? (
            <div
              className={`notice modal-notice ${notice.error ? "notice-error" : "notice-success"}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.text}
            </div>
          ) : null}
          <InvoiceDetail
            key={`${invoice.id}-${recommendation?.id}-${recommendation?.status}`}
            invoice={invoice}
            recommendation={recommendation}
            demo={demo}
            today={today}
            busy={busy}
            onAnalyze={analyze}
            onDecide={decide}
            onAction={invoiceAction}
            onNotice={(text) => setNotice({ text, error: false })}
          />
        </Modal>
      ) : null}
      {creating ? (
        <Modal title="Create an invoice" onClose={() => setCreating(false)}>
          {notice ? (
            <div
              className={`notice modal-notice ${notice.error ? "notice-error" : "notice-success"}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.text}
            </div>
          ) : null}
          <CreateInvoice
            demo={demo}
            busy={Boolean(busy)}
            today={today}
            onSubmit={(input) =>
              run("create", async () => {
                if (demo) {
                  const created: Invoice = {
                    id: `demo-${crypto.randomUUID()}`,
                    owner_id: "demo",
                    paypal_id: null,
                    number: `INV-${1042 + data.invoices.length}`,
                    customer_name: input.customerName,
                    customer_email: input.customerEmail,
                    description: input.description,
                    currency: "USD",
                    total_cents: Math.round(Number(input.amount) * 100),
                    due_cents: Math.round(Number(input.amount) * 100),
                    status: "DRAFT",
                    due_date: input.dueDate,
                    paypal_url: null,
                    paused: false,
                    promise_date: null,
                    updated_at: new Date().toISOString(),
                  };
                  setData((current) => ({
                    ...current,
                    invoices: [created, ...current.invoices],
                    audit: addDemoAudit(
                      current,
                      created.id,
                      "Example draft created",
                      created.number,
                    ),
                  }));
                  setSelected(created.id);
                } else {
                  const result = await post("/api/invoices", input);
                  setSelected(result.id);
                }
                setCreating(false);
                setNotice({
                  text: demo
                    ? "Demo invoice created."
                    : "PayPal Sandbox draft created. Review it before sending.",
                  error: false,
                });
              })
            }
          />
        </Modal>
      ) : null}
      {showConnections ? (
        <Modal
          title="Workspace connections"
          onClose={() => setShowConnections(false)}
        >
          <div className="connection-item">
            <span className="connection-logo paypal-logo">P</span>
            <div>
              <strong>PayPal Sandbox</strong>
              <p>Test payments and invoicing</p>
            </div>
            <span className="badge badge-blue">
              {demo ? "Sandbox workspace" : "Configured"}
            </span>
          </div>
          <div className="connection-item">
            <span className="connection-logo">
              <Sparkles size={20} />
            </span>
            <div>
              <strong>{connections.ai}</strong>
              <p>Configured model · {connections.model}</p>
            </div>
          </div>
          <div className="connection-item">
            <span className="connection-logo">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Payment webhooks</strong>
              <p>
                {connections.webhook
                  ? "Webhook ID configured. Verify delivery after deployment."
                  : "HTTPS endpoint registration required after deployment."}
              </p>
            </div>
          </div>
          <div className="notice">
            {demo
              ? "This demo uses preset analysis and synthetic payment events. Open Sandbox for connected services."
              : "The application applies a maximum of 2 reminders per merchant in 24 hours and a 12-hour cooldown per invoice. PayPal limits also apply."}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>{icon}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function WorkflowStep({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="workflow-step">
      <div className="workflow-symbol">
        {icon}
        <small>{number}</small>
      </div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function InvoiceDetail({
  invoice,
  recommendation,
  demo,
  today,
  busy,
  onAnalyze,
  onDecide,
  onAction,
  onNotice,
}: {
  invoice: Invoice;
  recommendation?: Recommendation;
  demo: boolean;
  today: string;
  busy: string;
  onAnalyze: (
    message: string,
    receivedAt: string,
    example: number,
  ) => Promise<void>;
  onDecide: (
    decision: "approve" | "reject",
    draft: string,
    promiseDate: string | null,
  ) => Promise<void>;
  onAction: (
    action: "sync" | "send" | "pause" | "resume" | "simulate_payment",
    operationId?: string,
  ) => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [example, setExample] = useState(1);
  const [message, setMessage] = useState(demo ? demoMessages[1] : "");
  const [receivedAt, setReceivedAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [draft, setDraft] = useState(recommendation?.draft || "");
  const [promiseDate, setPromiseDate] = useState(
    recommendation?.promise_date || "",
  );
  const [sendKey] = useState(() => crypto.randomUUID());
  const blocked = reminderBlock(invoice, today);
  const outgoing =
    recommendation &&
    ["prepare_reminder", "resend_payment_link"].includes(recommendation.action);
  return (
    <div className="invoice-detail">
      <div className="detail-title">
        <div>
          <p className="small-label">
            {demo ? "SYNTHETIC DEMO INVOICE" : "PAYPAL SANDBOX INVOICE"}
          </p>
          <h2>{invoice.customer_name}</h2>
          <p className="muted">{invoice.customer_email}</p>
        </div>
        <InvoiceBadge invoice={invoice} today={today} />
      </div>
      <div className="invoice-amounts">
        <div>
          <span>Outstanding</span>
          <strong>{money(invoice.due_cents)}</strong>
        </div>
        <div>
          <span>Invoice total</span>
          <strong>{money(invoice.total_cents)}</strong>
        </div>
        <div>
          <span>Due date</span>
          <strong>{invoice.due_date}</strong>
        </div>
      </div>
      <p className="invoice-description">{invoice.description}</p>
      {invoice.promise_date && invoice.promise_date >= today ? (
        <div className="notice modal-notice">
          <Clock3 size={16} />
          Application reminders are suppressed through {invoice.promise_date},
          the merchant-confirmed payment date.
        </div>
      ) : null}
      <div className="detail-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() => onAction("sync")}
        >
          <RefreshCw size={14} />
          Refresh status
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() => onAction(invoice.paused ? "resume" : "pause")}
        >
          <Pause size={14} />
          {invoice.paused ? "Resume app reminders" : "Pause app reminders"}
        </Button>
        {invoice.paypal_url ? (
          <Button variant="ghost" size="sm" asChild>
            <a href={invoice.paypal_url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              PayPal payment page
            </a>
          </Button>
        ) : null}
      </div>
      {invoice.status === "DRAFT" ? (
        <div className="send-invoice-box">
          <h3>Ready to send?</h3>
          <p>
            Approve sending this {demo ? "simulated" : "Sandbox"} invoice to{" "}
            {invoice.customer_email} through PayPal.
          </p>
          <Button
            disabled={Boolean(busy)}
            onClick={() => onAction("send", sendKey)}
          >
            Approve & send invoice <ArrowUpRight size={15} />
          </Button>
        </div>
      ) : null}
      {isSettled(invoice) ? (
        <div className="notice notice-success">
          <ShieldCheck size={17} />
          This invoice is settled or closed. Further reminders are blocked.
        </div>
      ) : null}
      <section className="detail-section">
        <div className="section-label">
          <span className="detail-step">1</span>
          <h3>Understand the customer’s reply</h3>
          <span className="small-label">
            {demo ? "PRESET EXAMPLES" : "REAL AI ANALYSIS"}
          </span>
        </div>
        <p className="muted">
          {demo
            ? "Choose a scenario to explore its preset analysis."
            : "Paste a customer message. The model will use it with the verified invoice context."}
        </p>
        {demo ? (
          <div className="scenario-list">
            {exampleLabels.map((label, index) => (
              <button
                key={label}
                className={example === index ? "selected" : ""}
                onClick={() => {
                  setExample(index);
                  setMessage(demoMessages[index]);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <label>
          Customer message
          <textarea
            aria-label="Customer message"
            value={message}
            readOnly={demo}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={6000}
            rows={4}
            placeholder="Paste your customer’s reply here…"
          />
        </label>
        {!demo ? (
          <label>
            Message received at <span className="muted">(UTC)</span>
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
              required
            />
          </label>
        ) : null}
        <Button
          disabled={Boolean(busy) || message.trim().length < 5}
          onClick={() => onAnalyze(message, `${receivedAt}:00.000Z`, example)}
        >
          {busy === "analyze" ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {busy === "analyze"
            ? "Analyzing context…"
            : demo
              ? "Load example analysis"
              : "Analyze payment blocker"}
        </Button>
      </section>
      {recommendation ? (
        <section className="detail-section">
          <div className="section-label">
            <span className="detail-step">2</span>
            <h3>Review the next step</h3>
            <span
              className={`badge badge-${recommendation.status === "pending" ? "blue" : "neutral"}`}
            >
              {recommendation.status}
            </span>
          </div>
          <div className="analysis-result">
            <div>
              <Sparkles size={18} />
              <strong>
                {classificationLabels[recommendation.classification]}
              </strong>
              <span>
                {Math.round(recommendation.confidence * 100)}% AI estimate
              </span>
            </div>
            <p>{recommendation.reason}</p>
            {recommendation.evidence.map((quote, index) => (
              <blockquote key={index}>“{quote}”</blockquote>
            ))}
            <small>
              Confidence is an AI estimate. Review the supporting text before
              approving.
            </small>
          </div>
          <div className="recommended-action">
            <ShieldCheck size={18} />
            <div>
              <strong>{actionLabels[recommendation.action]}</strong>
              <p>
                {outgoing
                  ? "Your approval sends a notification through PayPal."
                  : recommendation.action === "request_information"
                    ? "Save the draft, then copy it to your preferred communication channel."
                    : "Your approval updates the application record."}
              </p>
            </div>
          </div>
          <label>
            Message draft
            <textarea
              aria-label="Message draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1800}
              rows={4}
              disabled={recommendation.status !== "pending"}
            />
          </label>
          {recommendation.action === "record_promise" ? (
            <label>
              Confirm promised payment date
              <input
                type="date"
                value={promiseDate}
                disabled={recommendation.status !== "pending"}
                min={today}
                onChange={(event) => setPromiseDate(event.target.value)}
              />
            </label>
          ) : null}
          {outgoing && blocked ? (
            <div className="notice notice-warning">
              <ShieldCheck size={16} />
              {blocked}
            </div>
          ) : null}
          {recommendation.status === "uncertain" ? (
            <div className="notice notice-warning">
              PayPal has not confirmed the outcome. Refresh its status and
              inspect the activity record before considering another reminder.
            </div>
          ) : null}
          <div className="review-buttons">
            <Button
              disabled={
                Boolean(busy) ||
                recommendation.status !== "pending" ||
                Boolean(outgoing && blocked) ||
                (recommendation.action === "record_promise" && !promiseDate)
              }
              onClick={() => onDecide("approve", draft, promiseDate || null)}
            >
              <Check size={16} />
              {outgoing
                ? demo
                  ? "Approve simulated reminder"
                  : "Approve & send reminder"
                : "Approve action"}
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(busy) || recommendation.status !== "pending"}
              onClick={() => onDecide("reject", draft, promiseDate || null)}
            >
              Reject
            </Button>
            <Button
              variant="ghost"
              aria-label="Copy message draft"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(draft);
                  onNotice("Draft copied.");
                } catch {
                  onNotice("Select the draft text to copy it manually.");
                }
              }}
            >
              <Copy size={16} />
            </Button>
          </div>
        </section>
      ) : null}
      {demo && !isSettled(invoice) ? (
        <div className="demo-payment">
          <CircleDollarSign size={20} />
          <div>
            <strong>Explore what happens after payment.</strong>
            <p>
              Simulate a full payment and see pending reminders get blocked.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => onAction("simulate_payment")}
          >
            Simulate payment
          </Button>
        </div>
      ) : null}
      {invoice.paypal_id ? (
        <p className="fine-print">PayPal invoice ID · {invoice.paypal_id}</p>
      ) : null}
    </div>
  );
}

type CreateInput = {
  operationId: string;
  customerName: string;
  customerEmail: string;
  description: string;
  amount: string;
  dueDate: string;
};

function CreateInvoice({
  demo,
  busy,
  today,
  onSubmit,
}: {
  demo: boolean;
  busy: boolean;
  today: string;
  onSubmit: (input: CreateInput) => Promise<void>;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void onSubmit({
          operationId,
          customerName: String(form.get("customerName")),
          customerEmail: String(form.get("customerEmail")),
          description: String(form.get("description")),
          amount: String(form.get("amount")),
          dueDate: String(form.get("dueDate")),
        });
      }}
    >
      <p className="muted">
        Create a {demo ? "simulated" : "PayPal Sandbox"} draft, then review it
        before sending.
      </p>
      <label>
        Customer / business name
        <input
          name="customerName"
          required
          maxLength={100}
          placeholder="Acme Studio"
        />
      </label>
      <label>
        Customer email
        <input
          name="customerEmail"
          type="email"
          required
          maxLength={200}
          placeholder={demo ? "client@example.com" : "Sandbox buyer email"}
        />
      </label>
      <label>
        What is this invoice for?
        <input
          name="description"
          required
          maxLength={200}
          placeholder="Website design services"
        />
      </label>
      <div className="form-columns">
        <label>
          Amount (USD)
          <input
            name="amount"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            required
            placeholder="250.00"
          />
        </label>
        <label>
          Due date
          <input
            name="dueDate"
            type="date"
            min={today}
            defaultValue={today}
            required
          />
        </label>
      </div>
      <div className="notice">
        <ShieldCheck size={16} />
        {demo
          ? "This invoice stays in your browser as synthetic demo data."
          : "The draft is created in Sandbox. Sending requires a separate approval."}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Plus size={16} />
        )}
        Create draft invoice
      </Button>
    </form>
  );
}
