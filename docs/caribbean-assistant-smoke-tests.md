# Caribbean assistant live Preview smoke tests

Run these on the Vercel Preview guest chat after deploy. Open a **new conversation** for every prompt. This environment has no `OPENAI_API_KEY`, so these cannot be executed here.

Use the guest chat on `/`. Do not stay in a previous thread.

## How to run

1. Open Preview.
2. Click **New conversation**.
3. Paste the prompt exactly.
4. Record pass/fail against the checks below.
5. Repeat from step 2 for the next letter.

---

## A

**Prompt**

> I'm in Trinidad. My celery is burning from the edges.

| | Expected |
|---|---|
| Intent | Crop problem / diagnosis |
| Context | Country = Trinidad and Tobago, **explicit**. Crop = celery. Farmer level inferred, not agronomist. |
| Web research | **No** |
| Answer | Direct assessment; ranked likely causes (tip/edge burn vs spots); reasoning; field checks; what to do now; what NOT to do; what would change the diagnosis; what to monitor; at most one follow-up. Trinidad used only because the farmer said it. No product CTA. Weather does not lead. No Sources element. |

**Fail if:** one vague “could be heat/watering/nutrients” line; assumes Trinidad without the spoken sentence; leads with a 72-hour disease-pressure alert; shows “Ask about products”; invents a confirmed disease.

---

## B

**Prompt**

> I'm a commercial celery farmer in Trinidad. My root-zone EC is 2.8 and the older leaves have marginal scorch.

| | Expected |
|---|---|
| Intent | Crop problem / diagnosis |
| Context | Country = Trinidad and Tobago, **explicit**. Crop = celery. Farmer level = **COMMERCIAL_FARMER**. EC 2.8 and older-leaf pattern retained. |
| Web research | **No** |
| Answer | Materially deeper than a backyard answer: production/quality implications, irrigation/EC/fertigation, harvest or spray-window risk. Ranked differential. Does **not** confirm Cercospora from those words. Agronomy before any product mention. No product CTA unless the farmer asked to spray. |

**Fail if:** home-garden “feel the soil” only; no EC / older-leaf / production content; invented spray rates; “confirmed Cercospora”; product cards first.

---

## C

**Prompt**

> I'm growing sweet pepper in Guyana. What can I spray for Cercospora?

| | Expected |
|---|---|
| Intent | Pest/disease + chemical management (asks what to spray) |
| Context | Country = Guyana, **explicit**. Crop = pepper. Location is authoritative for local legality. |
| Web research | **Yes** (pesticide registration). Official Guyana source first, then CARDI/regional research, then FAO/international. **Never** Trinidad’s pesticide register as Guyana proof. |
| Answer | Useful general agronomy (protectant coppers/chlorothalonil, QoI/DMI only as classes). If Guyana registration is not verified, say so clearly (`haven't verified registration` or equivalent). Sources, if any live research was used: collapsed `Sources used (n) ▾` with organization, what it supported, date checked, and link. Agronomy before products. |

**Fail if:** “use the Trinidad product”; invented Guyana registration, rate, PHI, or REI; Trinidad registration treated as legal in Guyana; a sales-style product button; sources dumped into the prose; Sources shown when no web research ran.

---

## D

**Prompt**

> I have 18 trays with 128 seedlings each. How many plants?

| | Expected |
|---|---|
| Intent | Calculation / nursery maths |
| Context | No crop diagnosis. Country unknown and **not asked**. |
| Web research | **No** |
| Answer | Direct calculation: 18 × 128 = **2,304**. Short. No disease interview. No Sources. No products. |

**Fail if:** starts a crop diagnosis; asks country or variety; wrong arithmetic.

---

## E

**Prompt**

> I grow 3 acres of cucumber. Help me prepare a cashflow for the bank.

| | Expected |
|---|---|
| Intent | Cashflow / farm business |
| Context | Crop = cucumber. Area = 3 acres. Country unknown unless needed for prices. Farmer level commercial-leaning from acreage. |
| Web research | **No** unless they also ask a live market price |
| Answer | Stays on cashflow/costing. May ask one missing business fact. Does not diagnose a disease. Does not invent official prices. |

**Fail if:** whitefly or leaf-spot workflow; product CTA; assumed Trinidad; invented NAMDEVCO figures presented as official.

---

## F

**Prompt**

> My lettuce has brown edges.

(no country)

| | Expected |
|---|---|
| Intent | Crop problem / diagnosis |
| Context | Crop = lettuce. Country = **unknown** (not Trinidad). Location confidence = unknown. Do not ask country unless they request chemicals, registration, or local prices. |
| Web research | **No** |
| Answer | Ranked differential for tip/edge burn vs spots. Field checks, what to do / not do, what would change the diagnosis, monitor window, at most one follow-up. No pesticide registration as fact. No Sources. No product CTA. |

**Fail if:** assumes Trinidad and Tobago; “this is registered in Trinidad”; many questions at once; product button.

---

## Cross-checks while you are there

- **New conversation:** guest country is unknown until spoken. A registered farmer’s profile country should already be in context on the first message.
- **Spoken country** in a later turn overrides an old or inferred country.
- **Crop switch** (celery → lettuce) must not keep celery symptoms. Keep the registered profile country. Guests who never named a country stay unknown.
- **Sources used (n) ▾** is collapsed by default. There is no second source list. Assistant prose does not copy source names unless naturally needed.
- There is **no** permanent “Ask about products” control.
