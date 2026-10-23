# Brief for the board: Nafa

Sources: founder's Notion workspace "Nafa - Agents" (state page of 18/10/2026, context page), Google Drive "Business_Plan_NAFA" v1.0 (11/10/2026), field study "Étude de marché approfondie" (8/07/2026). No claim below is verified independently; each is labelled by source type.

## The idea
(see founder/idea.md, repeated here so this brief stands alone)
Nafa is an AI financial assistant app for West Africa (born in Dakar). The user declares each movement by voice or text; the AI records, categorises, budgets, alerts, and produces reports. No automatic bank/Mobile Money connection, by design. It is not a payment app.
Tiers: Free 0 / Premium 1 999 FCFA per month / Ultra 14 999 FCFA per month (Goals page + 1 monthly expert appointment). Tagline in plan: "Ton argent, enfin lisible." Value pitch: clarity on where money goes, an AI coach, user keeps control of data, CDP (Senegal data authority) compliance.
Budget: 5 000 000 FCFA equity sought. Founder is a non-developer who built the MVP with AI coding agents.

## Customer evidence (founder's own survey, self-reported intent, small samples)
- Persona 1, young urban employees: n=14 of 25 targeted. 93% interested; 86% would install at launch; 86% find the declarative mechanism "simple and fast" once explained; 93% say 2 000 FCFA/month is reasonable; 86% use no tool at all; Wave used by 100%. Main brake to saving = unexpected family/health costs (71%).
- Persona 2, freelancers/traders: n=6 of 25. 83% mix business and personal money; 100% find cash-flow forecasting useful; 100% fine with declarative entry; 83% willing to pay; budget 2 500-5 000 FCFA/month for 67%.
- Persona 3, wealth structuring: n=3 of 25 (the study itself warns this is 3 illustrative cases). 3/3 certainly would pay; 3/3 find 1 999 / 14 999 well aligned. Study recommends more respondents before showing investors.
- Respondents want CDP compliance proof AND control over entries; freelancers say a logo is not enough, they want concrete proof.
- Expert appointment interest is only moderate for freelancers. Cash-flow forecast is the top-requested feature for personas 2 and 3 but is Phase 2/3 on the roadmap, not built.
- The Pro/Perso mode is validated by demand (83-100% of freelancers) but not formalised or verified in code.
- All intent figures are stated intentions from a convenience sample; no one has paid yet.

## Product and traction facts (founder's internal project log)
- 127 accounts exist (123 excluding admins/test accounts). 119 of those 123 have NEVER recorded a single transaction (measured 15/10/2026). Zero paying subscribers.
- Production app deployed (web); Android test build; iOS in preparation. Founder decided on a native Android app with RevenueCat subscriptions (18/10).
- Known open defects: first-transaction button missing on new accounts; example numbers (about 245 000) flash on login before real data; PayTech page showed 14 704 XOF instead of 14 999 for Ultra; admin panel audit found most tabs fake or broken (being fixed tab by tab).
- Security audit of the repo: "refused" (dangerous migration replays); production better than repo. Row-level security active on 7 tables. Fixes in progress, in a strict founder-approved order.
- Gemini free tier is used for AI; Google may use content sent on the free tier; security review requested before production.
- The partner-offers catalogue entries (Wafa, AXA) are fictional placeholders.
- Product team = founder + multiple AI agents (Claude teams for growth, sales, accounting; OpenCode teams for tech and security).

## Business and legal facts
- Company not yet registered (in progress): no NINEA, no RCCM. PayTech production account needs both, so card/Mobile Money checkout cannot be live yet. WhatsApp + Wave manual payment on a dedicated Wave Business account is the interim route; manual activation of such subscriptions is not yet designed (plan changes are locked by trigger).
- PayTech terms: free signup, 5 000 FCFA file fee, 2% on Mobile Money (client pays price + 2%), cards 3% excl. tax (unavailable now), free transfer payout. To be confirmed in writing.
- Tax/legal form, VAT (18% may apply if liable), accountant: undecided. A tax calendar draft is unreliable (press sources).
- Domain nafaapp.com was held by a subcontractor, now at LWS. nafa-app.com expires about 03/02/2027.
- Monthly costs seen: Claude Pro 20 USD; domain about 9 EUR a year; most other tools on free plans.

## Business plan numbers (founder's plan v1.0, not audited)
- Revenue forecast: year 1 6 622 500 FCFA; year 2 30 198 600; year 3 69 933 600. Net profit 9 280 507 FCFA in year 3. Break-even about 970 paying subscribers during year 2 (fixed costs year 2 and depreciation 23 204 667 FCFA; contribution margin 75.2%).
- Average revenue per paying subscriber about 2 649 FCFA/month, assuming 5% of payers on Ultra.
- 3-year goals: 50 000 monthly active users, 3 000 paying subscribers.
- Headcount plan: 3 people in year 1, 5 in year 2, 9 in year 3.
- Plan's own risk list: slower adoption, weak subscription culture, trust in data, dependence on founder and on AI/payment suppliers, regulation. A 3-month launch delay would raise funding need to about 5.6 million FCFA.
- Customer acquisition cost, churn and free-to-paid conversion are NOT evidenced anywhere in the sources.

## Competition (as the founder's study states it; not independently verified here)
- Direct: local apps like Pocket Broker and MyNafa (the study calls them payment/investment oriented). Indirect: bank and neobank apps (e.g. Djamo), international budgeting apps (poor Mobile Money fit), paper notebooks, memory, Excel/Sheets (used by nearly all respondents).
- Mobile Money operators (Wave, Orange Money, Mixx by Yas) are channels and possible partners, but their own apps give transaction history and could add budgeting features.
- Study claims no direct competitor in conversational AI personal finance for Senegal; unverified.

## Market (founder's study, sources cited there)
- Senegal: 11.3M internet users, 22.7M mobile connections, bank account ownership about 21%, financial inclusion above 80% thanks to Mobile Money. Study claims 15-20% of adults have a structured financial strategy.
- Regulatory: BCEAO licence rules for payment providers (Nafa does not hold or move funds); data protection law 2008-12 and CDP declaration; no AI-specific law yet.

## Open questions the founder has not answered
- How to get the 119 inactive accounts to make a first entry (activation).
- Will people pay: no payment test has ever happened.
- Who is the first paying customer and through which channel; what is the real acquisition cost.
- Whether declarative entry stays a habit after the first week.
- Legal form, registration date, accountant opinion.
