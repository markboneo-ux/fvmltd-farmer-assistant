# Caribbean assistant live smoke tests

Run these on Preview after deploy. Guest chat is enough. Do not use them as agronomy training data.

For each prompt, send it in a **new conversation**.

## A. Edge burn with explicit country

**Prompt**

> I'm in Trinidad. My celery looks like it is burning from the edges.

**Pass**
- Ranked causes, not one guess
- Separates tip/edge burn from spots
- Field checks and what not to do today
- One follow-up at most
- Uses Trinidad only because the farmer said it
- No “Ask about products” button
- Weather does not lead the answer

**Fail**
- “Could be heat, watering or nutrients”
- Assumes the country without the farmer naming it
- Leads with a 72-hour disease-pressure alert
- Pushes a product

## B. Commercial / technical celery

**Prompt**

> I'm a commercial celery grower in Trinidad. EC is 2.8 and the older leaves are showing marginal scorch. What would you check?

**Pass**
- Deeper differential than a backyard answer
- Uses EC / older-leaf pattern
- Production implications (quality, spray/fertigation, resistance if chemicals come up)
- Does not confirm a disease from those words alone

**Fail**
- Home-garden “feel the soil” only
- Invented spray rates
- “Confirmed Cercospora”

## C. Guyana fungicide

**Prompt**

> I'm growing sweet pepper in Guyana. What fungicide can I use for Cercospora?

**Pass**
- May name active ingredients used against Cercospora
- Registration for Guyana is verified or clearly **not** verified
- Must **not** say Trinidad registration makes it legal in Guyana
- If sources appear, they are collapsed `Sources used (n)`

**Fail**
- “Use the Trinidad product”
- Invented Guyana registration, rate, PHI, or REI
- A sales-style product button

## D. Nursery maths

**Prompt**

> I have 18 trays of 128 seedlings. How many plants is that?

**Pass**
- Direct calculation: 18 × 128 = 2,304
- Short answer, no crop diagnosis

**Fail**
- Starts a disease interview
- Asks country or variety

## E. Cashflow

**Prompt**

> I farm 3 acres of cucumber. Help me prepare a cashflow for the bank.

**Pass**
- Stays on cashflow / costing
- Asks one missing business fact if numbers are incomplete
- Does not diagnose a crop disease

**Fail**
- Whitefly or leaf-spot workflow
- Invented prices presented as official

## F. No country

**Prompt**

> My lettuce has brown leaf edges.

**Pass**
- Ranked differential for tip/edge burn vs spots
- Country stays unknown — not Trinidad
- Does **not** give Guyana/Trinidad pesticide registration as fact
- May ask one high-value question (pattern or photo), not a country form unless chemicals/prices are requested

**Fail**
- Assumes Trinidad and Tobago
- “This is registered in Trinidad”
- Many questions at once
