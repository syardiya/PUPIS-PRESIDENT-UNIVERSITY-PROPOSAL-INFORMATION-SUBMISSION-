export type RoleId = "submitter" | "approver" | "cc";

export interface CampusAccount {
  id: RoleId;
  name: string;
  roleTitle: string;
  email: string;
  badgeText: string;
  description: string;
}

export type SignerStatus = "Approved" | "Pending TTD" | "Needs Revision";
export type SignatureType = "drawn" | "stamp";

export interface SignaturePayload {
  signatureType: SignatureType;
  signatureImageUrl?: string;
}

export interface ApproverSigner {
  id: string;
  name: string;
  role: string;
  email: string;
  status: SignerStatus;
  signedAt?: string;
  signatureHash?: string;
  signatureType?: SignatureType;
  signatureImageUrl?: string;
}

export interface CCStakeholder {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  actionType: "submitted" | "approved" | "revision_requested" | "resubmitted";
  version: number;
  summary: string;
  revisionNote?: string;
  changesDiff?: string[];
}

export type ProposalStatus = "Pending TTD" | "Needs Revision" | "Approved" | "Draft";

export interface Proposal {
  id: string;
  code: string;
  organization: string;
  submitterEmail: string;
  title: string;
  eventDate: string;
  venue: string;
  budgetSummary: string;
  budgetBreakdown: string;
  attachmentName: string;
  attachmentSize: string;
  executiveSummary: string;
  reviewerNotes: string;
  status: ProposalStatus;
  version: number;
  updatedAt: string;
  activeRevisionNote?: {
    note: string;
    requestedBy: string;
    requestedByEmail: string;
    requestedAt: string;
  };
  approvers: ApproverSigner[];
  ccList: CCStakeholder[];
  history: ChangeLogEntry[];
}

export const CAMPUS_ACCOUNTS: CampusAccount[] = [
  {
    id: "submitter",
    name: "BEM President University",
    roleTitle: "Submitter (Student Org)",
    email: "bem.pu@student.president.ac.id",
    badgeText: "Student Organization",
    description: "Draft, submit, and revise event & budget proposals.",
  },
  {
    id: "approver",
    name: "Directorate of Student Affairs",
    roleTitle: "Approver / TTD (Advisor & Student Affairs)",
    email: "student.affairs@president.ac.id",
    badgeText: "Official Signer (TTD)",
    description: "Review, sign (TTD), or request revisions with mandatory notes.",
  },
  {
    id: "cc",
    name: "Faculty Advisor — Computing",
    roleTitle: "CC / Stakeholder (Read-Only Observer)",
    email: "advisor.it@president.ac.id",
    badgeText: "CC Stakeholder",
    description: "Monitor live approval status and version change logs in read-only mode.",
  },
];

export const PRESET_APPROVER_DIRECTORY: Omit<ApproverSigner, "status">[] = [
  {
    id: "app-puma",
    name: "PUMA Computing Chairperson",
    role: "PUMA / PUFA Chair",
    email: "puma.computing@student.president.ac.id",
  },
  {
    id: "app-advisor",
    name: "Dr. Rila Mandala, M.Eng.",
    role: "Faculty Advisor",
    email: "dean.computing@president.ac.id",
  },
  {
    id: "app-sa",
    name: "Directorate of Student Affairs",
    role: "Student Affairs (Kemahasiswaan)",
    email: "student.affairs@president.ac.id",
  },
  {
    id: "app-vr3",
    name: "Vice Rector III — Student & Alumni",
    role: "Executive Approver",
    email: "vr3.office@president.ac.id",
  },
];

export const PRESET_CC_DIRECTORY: CCStakeholder[] = [
  {
    id: "cc-1",
    name: "Faculty Advisor — IT",
    role: "Academic Observer",
    email: "advisor.it@president.ac.id",
  },
  {
    id: "cc-2",
    name: "Campus Finance & Treasury",
    role: "Budget CC",
    email: "finance.bureau@president.ac.id",
  },
  {
    id: "cc-3",
    name: "Campus General Affairs & Venue",
    role: "Logistics CC",
    email: "ga.facilities@president.ac.id",
  },
];

export const INITIAL_PROPOSALS: Proposal[] = [
  {
    id: "prop-1",
    code: "PU-PROP-2026-014",
    organization: "BEM President University & PUMA Computing",
    submitterEmail: "bem.pu@student.president.ac.id",
    title: "Compsphere 2026: National AI & Cybersecurity Symposium",
    eventDate: "2026-12-14",
    venue: "Charles Himawan Auditorium, President University",
    budgetSummary: "IDR 24,500,000",
    budgetBreakdown:
      "Keynote Honorarium & Travel (IDR 9,000,000), Hackathon Prize Pool (IDR 10,000,000), Auditorium Sound & Multimedia (IDR 3,500,000), Delegate Kits & Certificates (IDR 2,000,000)",
    attachmentName: "Proposal_Compsphere_2026.pdf",
    attachmentSize: "2.4 MB",
    executiveSummary:
      "Annual flagship technology symposium and 24-hour national hackathon hosting 250+ student delegates across Indonesia, featuring industry keynotes and AI workshops.",
    reviewerNotes:
      "Endorsed by PUMA Computing and BEM Executive Board. Sponsorship covers 40% of total expenditure; requesting university institutional allocation for the remainder.",
    status: "Pending TTD",
    version: 1,
    updatedAt: "2026-11-24 10:15 WIB",
    approvers: [
      {
        id: "sig-1",
        name: "PUMA Computing Chairperson",
        role: "PUMA / PUFA Chair",
        email: "puma.computing@student.president.ac.id",
        status: "Approved",
        signedAt: "2026-11-23 14:20 WIB",
        signatureHash: "TTD-PU-8831A",
      },
      {
        id: "sig-2",
        name: "Dr. Rila Mandala, M.Eng.",
        role: "Faculty Advisor",
        email: "dean.computing@president.ac.id",
        status: "Approved",
        signedAt: "2026-11-24 09:05 WIB",
        signatureHash: "TTD-PU-9042B",
      },
      {
        id: "sig-3",
        name: "Directorate of Student Affairs",
        role: "Student Affairs (TTD)",
        email: "student.affairs@president.ac.id",
        status: "Pending TTD",
      },
    ],
    ccList: [
      {
        id: "cc-it",
        name: "Faculty Advisor — Computing",
        role: "CC Stakeholder (Read-Only)",
        email: "advisor.it@president.ac.id",
      },
      {
        id: "cc-fin",
        name: "Campus Finance & Treasury",
        role: "Budget CC",
        email: "finance.bureau@president.ac.id",
      },
    ],
    history: [
      {
        id: "hist-1",
        timestamp: "2026-11-23 11:00 WIB",
        actorName: "BEM President University",
        actorEmail: "bem.pu@student.president.ac.id",
        actorRole: "Submitter",
        actionType: "submitted",
        version: 1,
        summary: "Initial proposal v1 submitted with Proposal_Compsphere_2026.pdf attached.",
      },
      {
        id: "hist-2",
        timestamp: "2026-11-23 14:20 WIB",
        actorName: "PUMA Computing Chairperson",
        actorEmail: "puma.computing@student.president.ac.id",
        actorRole: "PUMA / PUFA Chair",
        actionType: "approved",
        version: 1,
        summary: "Digitally signed & approved Step 1 TTD (TTD-PU-8831A).",
      },
      {
        id: "hist-3",
        timestamp: "2026-11-24 09:05 WIB",
        actorName: "Dr. Rila Mandala, M.Eng.",
        actorEmail: "dean.computing@president.ac.id",
        actorRole: "Faculty Advisor",
        actionType: "approved",
        version: 1,
        summary: "Digitally signed & approved Step 2 TTD (TTD-PU-9042B). Forwarded to Student Affairs.",
      },
    ],
  },
  {
    id: "prop-2",
    code: "PU-PROP-2026-011",
    organization: "BEM President University",
    submitterEmail: "bem.pu@student.president.ac.id",
    title: "Cultural Night & International Student Gala 2026",
    eventDate: "2026-12-20",
    venue: "President University Convention Center",
    budgetSummary: "IDR 32,000,000",
    budgetBreakdown:
      "Stage Lighting & Acoustic Rig (IDR 14,000,000), International Culinary Booths (IDR 10,000,000), Security & Medical Standby (IDR 4,500,000), Publications (IDR 3,500,000)",
    attachmentName: "Proposal_Cultural_Night_2026_v1.pdf",
    attachmentSize: "3.1 MB",
    executiveSummary:
      "Cross-cultural appreciation night celebrating international students from 18 countries studying at President University Jababeka campus.",
    reviewerNotes:
      "Venue booking pre-cleared with General Affairs. Seeking final budget clearance from Student Affairs.",
    status: "Needs Revision",
    version: 1,
    updatedAt: "2026-11-24 13:40 WIB",
    activeRevisionNote: {
      note: "Please adjust the Stage Lighting & Acoustic Rig budget allocation to adhere to the Q4 Student Activity ceiling (max IDR 10,000,000 for external vendor equipment) and specify the evening curfew compliance plan in the executive summary.",
      requestedBy: "Directorate of Student Affairs",
      requestedByEmail: "student.affairs@president.ac.id",
      requestedAt: "2026-11-24 13:40 WIB",
    },
    approvers: [
      {
        id: "sig-201",
        name: "BEM Internal Audit & Chair",
        role: "PUMA / PUFA Chair",
        email: "speaker.pusc@student.president.ac.id",
        status: "Approved",
        signedAt: "2026-11-21 16:10 WIB",
        signatureHash: "TTD-PU-7712C",
      },
      {
        id: "sig-202",
        name: "Directorate of Student Affairs",
        role: "Student Affairs (TTD)",
        email: "student.affairs@president.ac.id",
        status: "Needs Revision",
      },
    ],
    ccList: [
      {
        id: "cc-201",
        name: "Faculty Advisor — Computing",
        role: "CC Stakeholder (Read-Only)",
        email: "advisor.it@president.ac.id",
      },
    ],
    history: [
      {
        id: "hist-201",
        timestamp: "2026-11-21 10:00 WIB",
        actorName: "BEM President University",
        actorEmail: "bem.pu@student.president.ac.id",
        actorRole: "Submitter",
        actionType: "submitted",
        version: 1,
        summary: "Initial proposal v1 submitted for review.",
      },
      {
        id: "hist-202",
        timestamp: "2026-11-21 16:10 WIB",
        actorName: "BEM Internal Audit & Chair",
        actorEmail: "speaker.pusc@student.president.ac.id",
        actorRole: "PUMA / PUFA Chair",
        actionType: "approved",
        version: 1,
        summary: "Approved & signed Step 1 TTD (TTD-PU-7712C).",
      },
      {
        id: "hist-203",
        timestamp: "2026-11-24 13:40 WIB",
        actorName: "Directorate of Student Affairs",
        actorEmail: "student.affairs@president.ac.id",
        actorRole: "Student Affairs (TTD)",
        actionType: "revision_requested",
        version: 1,
        summary: "Requested revision on vendor budget ceiling and curfew compliance plan.",
        revisionNote:
          "Please adjust the Stage Lighting & Acoustic Rig budget allocation to adhere to the Q4 Student Activity ceiling (max IDR 10,000,000 for external vendor equipment) and specify the evening curfew compliance plan in the executive summary.",
      },
    ],
  },
  {
    id: "prop-3",
    code: "PU-PROP-2026-008",
    organization: "PUMA Information Technology",
    submitterEmail: "bem.pu@student.president.ac.id",
    title: "DevOps & Cloud Native Bootcamp Workshop Series",
    eventDate: "2026-11-30",
    venue: "Computing Lab 302, Building A",
    budgetSummary: "IDR 6,800,000",
    budgetBreakdown:
      "Cloud Sandbox Credits (IDR 3,000,000), Speaker Token of Appreciation (IDR 2,000,000), Refreshments & Certificates (IDR 1,800,000)",
    attachmentName: "Proposal_Cloud_Bootcamp_2026_v2.pdf",
    attachmentSize: "1.8 MB",
    executiveSummary:
      "Hands-on containerization and Kubernetes deployment workshop for 80 Computing students.",
    reviewerNotes: "All laboratory usage permissions confirmed with IT Infrastructure team.",
    status: "Approved",
    version: 2,
    updatedAt: "2026-11-20 17:00 WIB",
    approvers: [
      {
        id: "sig-301",
        name: "PUMA Computing Chairperson",
        role: "PUMA / PUFA Chair",
        email: "puma.computing@student.president.ac.id",
        status: "Approved",
        signedAt: "2026-11-18 11:00 WIB",
        signatureHash: "TTD-PU-5510A",
      },
      {
        id: "sig-302",
        name: "Directorate of Student Affairs",
        role: "Student Affairs (TTD)",
        email: "student.affairs@president.ac.id",
        status: "Approved",
        signedAt: "2026-11-20 17:00 WIB",
        signatureHash: "TTD-PU-6619F",
      },
    ],
    ccList: [
      {
        id: "cc-301",
        name: "Faculty Advisor — Computing",
        role: "CC Stakeholder (Read-Only)",
        email: "advisor.it@president.ac.id",
      },
    ],
    history: [
      {
        id: "hist-301",
        timestamp: "2026-11-18 09:00 WIB",
        actorName: "BEM President University",
        actorEmail: "bem.pu@student.president.ac.id",
        actorRole: "Submitter",
        actionType: "submitted",
        version: 1,
        summary: "Submitted v1 proposal.",
      },
      {
        id: "hist-302",
        timestamp: "2026-11-18 11:00 WIB",
        actorName: "PUMA Computing Chairperson",
        actorEmail: "puma.computing@student.president.ac.id",
        actorRole: "PUMA / PUFA Chair",
        actionType: "approved",
        version: 1,
        summary: "Approved & signed Step 1 TTD (TTD-PU-5510A).",
      },
      {
        id: "hist-303",
        timestamp: "2026-11-19 10:15 WIB",
        actorName: "Directorate of Student Affairs",
        actorEmail: "student.affairs@president.ac.id",
        actorRole: "Student Affairs (TTD)",
        actionType: "revision_requested",
        version: 1,
        summary: "Requested lab capacity verification.",
        revisionNote: "Include written confirmation from Computing Lab Coordinator for Saturday lab usage.",
      },
      {
        id: "hist-304",
        timestamp: "2026-11-19 15:30 WIB",
        actorName: "BEM President University",
        actorEmail: "bem.pu@student.president.ac.id",
        actorRole: "Submitter",
        actionType: "resubmitted",
        version: 2,
        summary: "Resubmitted Proposal v1 -> v2 with Lab Coordinator clearance attached. Previous Step 1 TTD preserved.",
        changesDiff: [
          "Attachment updated: Proposal_Cloud_Bootcamp_2026_v2.pdf",
          "Added Lab 302 Saturday clearance reference in Reviewer Notes",
        ],
      },
      {
        id: "hist-305",
        timestamp: "2026-11-20 17:00 WIB",
        actorName: "Directorate of Student Affairs",
        actorEmail: "student.affairs@president.ac.id",
        actorRole: "Student Affairs (TTD)",
        actionType: "approved",
        version: 2,
        summary: "Final TTD signed & proposal fully approved (TTD-PU-6619F).",
      },
    ],
  },
];
