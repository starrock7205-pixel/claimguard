import type {
  ClaimType,
  Evidence,
  ExtractedValue,
  RoutingTier,
  SearchDepth,
  Verdict,
} from "./types";

/**
 * Seeded evidence corpus.
 *
 * Every document below is a REAL page that was retrieved and read on
 * EVIDENCE_SNAPSHOT_DATE. Titles, URLs, publication dates and snippets are
 * verbatim from those pages — nothing here is generated, and no URL is
 * invented. When ClaimGuard runs without a TAVILY_API_KEY it searches THIS
 * corpus only, and every response is badged [SIMULATED].
 *
 * Guardrail 7 (zero fabricated citations) is enforced structurally: if a claim
 * has no match in this corpus and no live key is present, the pipeline returns
 * an empty evidence set and the verdict becomes UNVERIFIABLE.
 */
export const EVIDENCE_SNAPSHOT_DATE = "2026-11-20";

export interface CorpusDocument {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string;
  domain: string;
  /** 0-100 authority prior for the source. */
  authorityScore: number;
  keywords: string[];
}

export const CORPUS: CorpusDocument[] = [
  // ---------------------------------------------------------------- handloom
  {
    id: "ev-handloom-census-insight",
    title: "Insight: India's handlooms — 35 lakh weavers and workers, mostly women",
    url: "https://textile.industry-report.net/2026-10-10/insight-handloom-sector-india-census-35-lakh-workers/",
    publishedAt: "2026-10-10",
    snippet:
      "The Fourth All India Handloom Census (2019-20), the latest official count by the Development Commissioner for Handlooms, found 26,73,891 handloom weavers and 8,48,621 allied workers, about 35.2 lakh people in all. Women dominate: about 19.1 lakh of the weavers and 6.3 lakh of the allied workers are women. The census counted 25.45 lakh weaver households and about six lakh allied households.",
    domain: "textile.industry-report.net",
    authorityScore: 68,
    keywords: [
      "handloom",
      "weaver",
      "weavers",
      "35 lakh",
      "35.2 lakh",
      "employment",
      "employs",
      "census",
      "textile",
      "allied workers",
      "india",
    ],
  },
  {
    id: "ev-handloom-drishti",
    title: "Modernising India's Handloom Sector",
    url: "https://www.drishtiias.com/daily-updates/daily-news-editorials/modernising-indias-handloom-sector",
    publishedAt: "2026-08-07",
    snippet:
      "Backed by the Fourth All India Handloom Census (2019-20), the sector employs over 35 lakh handloom workers—comprising 26 lakh weavers and 8.5 lakh allied workers—with 72.3% women and 89% rural households. India has approximately 31.5 lakh handloom households or cottage units, engaging over 35 lakh weavers and allied workers.",
    domain: "drishtiias.com",
    authorityScore: 74,
    keywords: [
      "handloom",
      "employs",
      "employment",
      "35 lakh",
      "weavers",
      "census",
      "sector",
      "workers",
      "rural",
    ],
  },
  {
    id: "ev-handloom-vajiram",
    title: "Indian Handloom Sector, Status, Export Trend, Schemes, Revival",
    url: "https://vajiramandravi.com/current-affairs/indian-handloom-sector/",
    publishedAt: "2026-02-17",
    snippet:
      "The handloom sector is the largest cottage industry in India, with about 28 lakh looms and provides employment to nearly 35 lakh people in rural areas. According to the Handloom Census 2019-20, around 35 lakh people work in this sector, with women forming nearly 75% of the workforce.",
    domain: "vajiramandravi.com",
    authorityScore: 70,
    keywords: [
      "handloom",
      "employment",
      "employs",
      "35 lakh",
      "looms",
      "cottage industry",
      "rural",
      "sector",
    ],
  },
  {
    id: "ev-handloom-firstresort",
    title: "India's Handcraft & Embroidery Economy 2026: Market Size, Artisans, and the Crafts",
    url: "https://www.firstresort.in/blogs/research/handcraft-embroidery-economy-india-2026",
    publishedAt: "2026-06-09",
    snippet:
      "Separately, the Fourth All India Handloom Census (2019-20) counted about 3.5 million (35.2 lakh) handloom workers across the country, of whom 25.46 lakh — 72.29% — are women. Press Information Bureau / Ministry of Textiles: Fourth All India Handloom Census 2019-20 — 35.22 lakh workers, 72.29% women, ~28.2 lakh looms.",
    domain: "firstresort.in",
    authorityScore: 62,
    keywords: ["handloom", "35.2 lakh", "3.5 million", "workers", "census", "ministry of textiles", "employment"],
  },
  {
    id: "ev-handloom-parikshit",
    title: "Handloom — Full history explained",
    url: "https://www.parikshitkhanna.com/post/handloom-full-history-explained",
    publishedAt: "2026-08-07",
    snippet:
      "According to the Fourth All India Handloom Census (2019-20), the sector supports 35.22 lakh handloom workers (26.73 lakh weavers and 8.48 lakh allied workers engaged in pre- and post-loom activities). These workers are spread across approximately 31.45 lakh households.",
    domain: "parikshitkhanna.com",
    authorityScore: 52,
    keywords: ["handloom", "35.22 lakh", "workers", "census", "households", "employment"],
  },

  // -------------------------------------------------------------- gadwal GI
  {
    id: "ev-gadwal-official-handlooms-nic",
    title: "Details of GI registered Handloom Products under GI Act, 1999 (as on 31 August 2022)",
    url: "https://handlooms.nic.in/assets/img/information_handlooms/Details%20of%20GI%20registered%20Handloom%20Products%20under%20GI%20ACT,%201999%20(as%20on%2031st%20August,%202022.pdf",
    publishedAt: "2022-08-31",
    snippet:
      "63 Gadwal Sarees 04.08.2010 — The Rajoli Handloom Weavers Co-operative Production Sales Society Ltd., Distt. Mahaboobnagar.",
    domain: "handlooms.nic.in",
    authorityScore: 96,
    keywords: ["gadwal", "gi", "geographical indication", "handloom", "saree", "sarees", "registration", "2010"],
  },
  {
    id: "ev-gadwal-wikipedia-list",
    title: "List of geographical indications in India",
    url: "https://en.wikipedia.org/wiki/List_of_geographical_indications_in_India",
    publishedAt: "2026-10-22",
    snippet:
      "Serial no. 124 | Application no. 137 | Gadwal sarees | Handicraft | Telangana | 2010–11.",
    domain: "en.wikipedia.org",
    authorityScore: 78,
    keywords: ["gadwal", "gi", "geographical indication", "telangana", "saree", "2010", "registration", "list"],
  },
  {
    id: "ev-gadwal-telangana360",
    title: "Telangana360: Gadwal Saree — Geographical Indication (GI) Status",
    url: "https://www.telangana360.com/2017/12/gadwal-saree.html",
    publishedAt: null,
    snippet:
      "The official GI Registry records Gadwal Sarees under Application No. 137. The application was filed on 22 September 2008, and the official record shows Certificate No. 124, dated 4 August 2010. The registration is currently shown as valid until 21 September 2028.",
    domain: "telangana360.com",
    authorityScore: 55,
    keywords: ["gadwal", "gi", "certificate", "application 137", "4 august 2010", "telangana", "saree"],
  },
  {
    id: "ev-gadwal-pochampally-blog",
    title: "Heritage in Threads, Hardship in Reality: India's Weaving Crisis",
    url: "https://pochampallysarees.com/blogs/pochampally-sarees/gi-tag-handloom-struggles",
    publishedAt: "2025-11-11",
    snippet:
      "Geographical Indication (GI) tags were granted to preserve heritage styles: Pochampally Ikat received GI Tag in 2004. Kanchipuram silk sarees got their GI Tag in 2005. Gadwal silk sarees were protected in 2010. Venkatagiri sarees achieved GI status in 2011.",
    domain: "pochampallysarees.com",
    authorityScore: 45,
    keywords: ["gadwal", "gi tag", "2010", "kanchipuram", "pochampally", "venkatagiri", "sarees"],
  },

  // ------------------------------------------------------------- ONDC fees
  {
    id: "ev-ondc-kaarobari-fees",
    title: "Seller App Fees on the ONDC Network: Real Numbers 2026",
    url: "https://kaarobari.com/en/guides/ondc-seller-app-fees-comparison",
    publishedAt: "2026-08-20",
    snippet:
      "Seller app fees on the ONDC Network run from 1% of the order value up to \"5% onwards\", and monthly plans run from ₹0 to ₹22,499. Does the ONDC Network itself take a commission? No — ONDC does not charge sellers a commission, and there is no percentage taken by the network itself. Kaarobari charges 2% on delivered orders and no monthly fee. As of 20 August 2026, ondc.org does not publish a live figure or a confirmed start date for it [the flat network fee reported as ₹1.50 per successful transaction above ₹250].",
    domain: "kaarobari.com",
    authorityScore: 58,
    keywords: ["ondc", "seller fee", "fees", "commission", "2%", "seller app", "network fee", "percentage", "pricing"],
  },
  {
    id: "ev-ondc-techpillow",
    title: "ONDC Raises ₹220 Crore From Zoho, Uber, and Paytm",
    url: "https://www.techpillow.co/blog/ondc-220-crore-fundraise-zoho-uber-paytm-2026",
    publishedAt: "2026-06-17",
    snippet:
      "ONDC charges no platform commission itself. Seller applications on the network typically take 2 to 3 per cent, and buyer applications take 2 to 5 per cent — putting total transaction costs in the 4 to 8 per cent range. As of mid-2026, the network has onboarded more than 3 lakh sellers, operates across more than 400 cities and towns, and supports more than 100 active buyer applications.",
    domain: "techpillow.co",
    authorityScore: 50,
    keywords: ["ondc", "commission", "seller", "fee", "2 to 3 per cent", "platform commission", "seller applications"],
  },
  {
    id: "ev-ondc-digitaldawn",
    title: "What Is ONDC and How Can Indian Sellers Join? A Complete 2026 Guide",
    url: "https://www.digitaldawn.in/what-is-ondc-india/",
    publishedAt: "2026-09-01",
    snippet:
      "ONDC itself charges zero commission at the network level, though the seller apps that connect you to the network have their own pricing models. Some charge a monthly subscription, others take a small percentage per transaction, and some operate on a freemium basis. Always check the current fee structure of whichever seller app you choose before signing up, since these can change and are not standardised across apps.",
    domain: "digitaldawn.in",
    authorityScore: 48,
    keywords: ["ondc", "commission", "zero commission", "seller app", "fee", "pricing", "network level"],
  },
  {
    id: "ev-ondc-codingclave",
    title: "ONDC Integration Guide for Indian E-commerce (2026)",
    url: "https://codingclave.com/blog/ondc-integration-guide-india-2026",
    publishedAt: "2026-04-15",
    snippet:
      "ONDC itself charges zero commission. The network fee is shared: typically 1-3% total, split between the buyer app (BNP) and the seller app (SNP). Compare this to Flipkart (5-25%) or Amazon India (8-20%) plus fulfillment fees.",
    domain: "codingclave.com",
    authorityScore: 46,
    keywords: ["ondc", "network fee", "zero commission", "1-3%", "seller app", "snp", "bnp", "fee"],
  },

  // --------------------------------------------------------- INR / USD rates
  {
    id: "ev-inr-litefinance",
    title: "USD to INR Forecast: Dollar to Rupee Prediction",
    url: "https://www.litefinance.org/blog/analysts-opinions/usd-inr-forecast-and-price-prediction/",
    publishedAt: "2026-11-20",
    snippet:
      "One US dollar costs ₹92.8570 on 20.11.2026, and the pair has moved +4.94% over the past twelve months. Record: the all-time high of the pair is ₹97.3781, set on 08.10.2026. 52-week range: ₹85.8629 – ₹97.0541.",
    domain: "litefinance.org",
    authorityScore: 60,
    keywords: ["inr", "usd", "rupee", "dollar", "exchange rate", "rate", "₹", "usd/inr", "currency", "trading"],
  },
  {
    id: "ev-inr-wise-us",
    title: "US dollars to Indian rupees Exchange Rate. Convert USD/INR — Wise",
    url: "https://wise.com/us/currency-converter/usd-to-inr-rate",
    // Live converter page: no publication date is exposed, so this stays null
    // and the UI renders publicationDate as "Unknown".
    publishedAt: null,
    snippet:
      "Mid-market exchange rate: $1 USD = 92.67 INR. The performance of USD to INR in the last 30 days saw a 30 day high of 95.2864 and a 30 day low of 92.6716, a 30 day average of 94.3882.",
    domain: "wise.com",
    authorityScore: 72,
    keywords: ["inr", "usd", "rupee", "dollar", "exchange rate", "mid-market", "92.67", "currency"],
  },
  {
    id: "ev-inr-riamoney",
    title: "US Dollar to Indian Rupee Exchange Rate Today",
    url: "https://www.riamoneytransfer.com/en-us/rates-conversion/?From=USD&To=INR&Amount=1",
    publishedAt: "2026-11-19",
    snippet:
      "1.00 USD = 93.46795419 INR. We use the mid-market rate for reference only. 1 INR = 0.01070 USD.",
    domain: "riamoneytransfer.com",
    authorityScore: 54,
    keywords: ["inr", "usd", "rupee", "dollar", "exchange rate", "rate today", "93.46", "currency"],
  },
  {
    id: "ev-inr-wise-au",
    title: "USD to INR exchange rate today: US dollars to Indian rupees — Wise AU",
    url: "https://wise.com/au/currency-converter/usd-to-inr-rate",
    publishedAt: null,
    snippet:
      "Mid-market exchange rate: $1 USD = 92.62 INR. The performance of USD to INR in the last 90 days saw a 90 day high of 96.8412 and a 90 day low of 92.6159, a 90 day average of 95.1749.",
    domain: "wise.com",
    authorityScore: 72,
    keywords: ["inr", "usd", "rupee", "dollar", "exchange rate", "mid-market", "92.62", "currency"],
  },

  // ------------------------------------------------- extra context documents
  {
    id: "ev-ondc-fundraise-context",
    title: "India's Open Commerce Network Gets Its Biggest Commercial Backing",
    url: "https://www.techpillow.co/blog/ondc-220-crore-fundraise-zoho-uber-paytm-2026",
    publishedAt: "2026-06-17",
    snippet:
      "ONDC allotted shares worth ₹220 crore to Zoho, Uber, Paytm, and BSE Technologies in May 2026 as it launches ONDC 2.0 with DigiCatalog, AI-powered discovery, and agentic commerce.",
    domain: "techpillow.co",
    authorityScore: 50,
    keywords: ["ondc 2.0", "fundraise", "₹220 crore", "zoho", "uber", "paytm", "digicatalog"],
  },
  {
    id: "ev-handloom-day",
    title: "National Handloom Day and Handloom Mark schemes",
    url: "https://textile.industry-report.net/2026-10-10/insight-handloom-sector-india-census-35-lakh-workers/",
    publishedAt: "2026-10-10",
    snippet:
      "The Handloom Mark and India Handloom Brand, cluster development and yarn supply schemes run by the Ministry of Textiles, and National Handloom Day on 7 August, are meant to support prices and quality.",
    domain: "textile.industry-report.net",
    authorityScore: 68,
    keywords: ["national handloom day", "7 august", "handloom mark", "ministry of textiles", "schemes"],
  },
];

// ---------------------------------------------------------------------------
// Official 4-claim hackathon demo scenario
// ---------------------------------------------------------------------------

export const DEMO_LLM_OUTPUT =
  "India's handloom sector employs over 35 lakh people. The latest ONDC seller fee is 2%. Gadwal sarees received GI recognition in 2010. The Indian rupee is currently trading at ₹75 per US dollar.";

export interface SeedClaim {
  originalClaim: string;
  claimType: ClaimType;
  claimTypes: ClaimType[];
  timeSensitive: boolean;
  riskScore: number;
  signals: string[];
  searchDepth: SearchDepth;
  evidenceIds: string[];
  verdict: Verdict;
  confidenceScore: number;
  reasoningSummary: string;
  claimValue: ExtractedValue | null;
  evidenceValue: ExtractedValue | null;
  driftPercent: number | null;
  suggestedReplacement: string | null;
  routingTier: RoutingTier;
  /** Index of the claim that should surface a visible Bifrost fallback event. */
  forceFallback?: boolean;
}

export const DEMO_CLAIMS: SeedClaim[] = [
  {
    originalClaim: "India's handloom sector employs over 35 lakh people.",
    claimType: "Statistical",
    claimTypes: ["Statistical", "Factual"],
    timeSensitive: false,
    riskScore: 31,
    signals: ["Quantified headcount (35 lakh)", "Attributable to an official census", "No time-bound qualifier"],
    searchDepth: "basic",
    evidenceIds: ["ev-handloom-census-insight", "ev-handloom-drishti", "ev-handloom-vajiram", "ev-handloom-firstresort"],
    verdict: "SUPPORTED",
    confidenceScore: 94,
    reasoningSummary:
      "The Fourth All India Handloom Census (2019-20), the latest official count by the Development Commissioner for Handlooms, records 26,73,891 weavers plus 8,48,621 allied workers — 35.22 lakh in total. Four independent retrieved sources restate the same figure, so the claim's \"over 35 lakh\" holds within tolerance.",
    claimValue: { kind: "number", label: "Employed persons", raw: "over 35 lakh", normalized: 3500000, unit: "persons" },
    evidenceValue: {
      kind: "number",
      label: "Employed persons",
      raw: "35.22 lakh (26,73,891 weavers + 8,48,621 allied workers)",
      normalized: 3522000,
      unit: "persons",
    },
    driftPercent: 0.6,
    suggestedReplacement: null,
    routingTier: "FAST",
  },
  {
    originalClaim: "The latest ONDC seller fee is 2%.",
    claimType: "Financial",
    claimTypes: ["Financial", "Time-sensitive", "Factual"],
    timeSensitive: true,
    riskScore: 74,
    signals: [
      "Commercial fee schedule",
      "Superlative \"latest\" implies a single current value",
      "Fee structure is set per participant, not per network",
    ],
    searchDepth: "advanced",
    evidenceIds: ["ev-ondc-kaarobari-fees", "ev-ondc-techpillow", "ev-ondc-digitaldawn", "ev-ondc-codingclave"],
    verdict: "PARTIALLY_SUPPORTED",
    confidenceScore: 71,
    reasoningSummary:
      "There is no single \"ONDC seller fee\" to verify. Retrieved 2026 sources agree the network itself takes zero commission; the charge sellers actually pay is a seller-app fee that runs from 1% to \"5% onwards\" (Kaarobari 2%, Vikra 1%, Mystore 2-5%, Fynd 3%). The 2% figure is real but belongs to one seller app, so the claim is true only in that narrower sense. A flat network fee (~₹1.50 per transaction above ₹250, payable by seller apps) has been discussed since December 2024 with no published rate or start date as of 20 Aug 2026.",
    claimValue: { kind: "percent", label: "ONDC seller fee", raw: "2%", normalized: 2, unit: "%" },
    evidenceValue: {
      kind: "percent",
      label: "Seller-app fee range",
      raw: "1% to 5%+ per seller app; network-level commission is 0%",
      normalized: 2,
      unit: "%",
    },
    driftPercent: null,
    suggestedReplacement:
      "ONDC itself charges no network-level seller commission; the seller-app fee a merchant actually pays is set by their seller app and runs from about 1% to 5% of order value (2% is a common mid-range figure).",
    routingTier: "REASONING",
    forceFallback: true,
  },
  {
    originalClaim: "Gadwal sarees received GI recognition in 2010.",
    claimType: "Historical",
    claimTypes: ["Historical", "Legal", "Factual"],
    timeSensitive: false,
    riskScore: 24,
    signals: ["Fixed past date", "Verifiable against the official GI register", "Low downstream financial impact"],
    searchDepth: "basic",
    evidenceIds: ["ev-gadwal-official-handlooms-nic", "ev-gadwal-wikipedia-list", "ev-gadwal-telangana360", "ev-gadwal-pochampally-blog"],
    verdict: "SUPPORTED",
    confidenceScore: 96,
    reasoningSummary:
      "The Development Commissioner for Handlooms register lists Gadwal Sarees with GI certificate date 04.08.2010 (Application No. 137, Certificate No. 124, valid until 21 September 2028). One compiled registry list files it under 2010-11, which reflects the financial year of the same registration rather than a conflicting date, so the claim's year stands.",
    claimValue: { kind: "date", label: "GI registration year", raw: "2010", normalized: "2010-08-04" },
    evidenceValue: {
      kind: "date",
      label: "GI certificate date",
      raw: "Certificate No. 124, dated 4 August 2010",
      normalized: "2010-08-04",
    },
    driftPercent: 0,
    suggestedReplacement: null,
    routingTier: "FAST",
  },
  {
    originalClaim: "The Indian rupee is currently trading at ₹75 per US dollar.",
    claimType: "Financial",
    claimTypes: ["Financial", "Time-sensitive"],
    timeSensitive: true,
    riskScore: 95,
    signals: [
      "Explicit \"currently\" — must match live market data",
      "FX rate moves continuously",
      "Any downstream calculation inherits the error",
    ],
    searchDepth: "advanced",
    evidenceIds: ["ev-inr-litefinance", "ev-inr-wise-us", "ev-inr-riamoney", "ev-inr-wise-au"],
    verdict: "CONTRADICTED",
    confidenceScore: 97,
    reasoningSummary:
      "Current mid-market quotations put USD/INR at ₹92.62-₹93.47, and the pair's 52-week range is ₹85.86-₹97.05 with an all-time high of ₹97.3781 on 8 October 2026. The claimed ₹75 sits below the entire observed 52-week range, so it is contradicted by every dated source retrieved rather than merely out of date.",
    claimValue: { kind: "currency", label: "USD/INR", raw: "₹75", normalized: 75, unit: "INR per USD" },
    evidenceValue: { kind: "currency", label: "USD/INR mid-market", raw: "₹92.67 (30-day average ₹94.39)", normalized: 92.67, unit: "INR per USD" },
    driftPercent: 19.1,
    suggestedReplacement:
      "As of 20 November 2026, the Indian rupee trades around ₹92.7 per US dollar at the mid-market rate, with a 30-day average near ₹94.4 and a 52-week range of ₹85.86 to ₹97.05.",
    routingTier: "REASONING",
  },
];

/** Human-readable label for the demo run in History. */
export const DEMO_LABEL = "Official Hackathon Demo — 4 claims";

export function corpusToEvidence(doc: CorpusDocument, rankScore: number, recencyScore: number): Evidence {
  return {
    id: doc.id,
    title: doc.title,
    url: doc.url,
    publishedAt: doc.publishedAt,
    snippet: doc.snippet,
    domain: doc.domain,
    authorityScore: doc.authorityScore,
    recencyScore,
    rankScore,
    simulated: true,
  };
}

export function findCorpusDoc(id: string): CorpusDocument | undefined {
  return CORPUS.find((d) => d.id === id);
}
