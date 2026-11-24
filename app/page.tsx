import Link from "next/link";

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Structured Submission",
    description:
      "Student organizations complete a guided 4-step proposal wizard with event details, budget summary, PDF attachment, and separated TTD signers and CC observers.",
  },
  {
    step: "02",
    title: "Sequential Digital TTD",
    description:
      "Designated advisors and Student Affairs officers review and sign proposals directly using a drawn digital signature pad or an official institutional digital stamp.",
  },
  {
    step: "03",
    title: "Non-Destructive v1 → v2 Revisions",
    description:
      "When revisions are requested with mandatory reviewer notes, submitters update and resubmit as v2 while all previously approved TTD signatures remain preserved.",
  },
  {
    step: "04",
    title: "Read-Only CC Audit Trail",
    description:
      "Faculty advisors, finance, and campus stakeholders follow real-time approval progress and versioned change logs in read-only mode without blocking sign-off.",
  },
];

export default function PublicLandingPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Clean Public Portal Header */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-xs font-bold tracking-wider text-white shadow-2xs">
              PU
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-[#0F172A]">
                  PUPIS
                </span>
                <span className="hidden rounded-full bg-[#1E3A8A]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1E3A8A] sm:inline-block">
                  President University
                </span>
              </div>
              <span className="block text-[11px] text-slate-500">
                Proposal Information Submission
              </span>
            </div>
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#1E3A8A]"
          >
            <span>Sign In</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex-1 overflow-hidden">
        {/* Soft blue/indigo ambient gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-[520px] w-[1080px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#1E3A8A]/12 via-indigo-200/35 to-sky-100/45 blur-3xl"
        />

        {/* Centered Single-Column Portal Hero */}
        <section className="mx-auto max-w-4xl px-4 pt-16 pb-16 text-center sm:px-6 lg:px-8 lg:pt-24 lg:pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-1.5 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-[#1E3A8A]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]">
              President University • Official Student Affairs Portal
            </span>
          </div>

          <h1 className="mt-7 text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl lg:text-6xl lg:leading-[1.1]">
            Manage Student Organization Proposals in{" "}
            <span className="bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-indigo-700 bg-clip-text text-transparent">
              One Place
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            PUPIS provides BEM, PUMA, PUFA, Faculty Advisors, and the
            Directorate of Student Affairs with a secure, paperless workflow for
            proposal submission, sequential digital TTD approval, and versioned
            revision tracking.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3.5">
            <Link
              href="/login"
              className="inline-flex items-center gap-2.5 rounded-full bg-[#0F172A] px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E3A8A]"
            >
              <span>Sign In with Campus Account</span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>

            <p className="text-xs text-slate-500">
              Authenticated access exclusively for{" "}
              <span className="font-mono font-medium text-slate-700">
                @student.president.ac.id
              </span>{" "}
              and{" "}
              <span className="font-mono font-medium text-slate-700">
                @president.ac.id
              </span>{" "}
              accounts.
            </p>
          </div>
        </section>

        {/* 4-Card "How PUPIS Works" Workflow Overview */}
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              How PUPIS Works
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
              End-to-End Governance for Campus Proposals
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((item) => (
              <div
                key={item.step}
                className="flex flex-col rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xs transition hover:border-slate-300"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] font-mono text-xs font-bold text-white">
                    {item.step}
                  </span>
                  <span className="h-1.5 w-8 rounded-full bg-[#1E3A8A]/15" />
                </div>

                <h3 className="mt-5 text-base font-bold text-[#0F172A]">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Minimalist Public Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0F172A]">PUPIS</span>
            <span>•</span>
            <span>
              President University Proposal Information Submission System
            </span>
          </div>
          <span>Directorate of Student Affairs • Jababeka Campus</span>
        </div>
      </footer>
    </div>
  );
}
