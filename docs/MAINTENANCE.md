# FVM Crop Solution — maintenance

## Daily / automatic

- Uptime and 5xx monitoring on Vercel.
- OpenAI failures (`[ops] openai_failure`, `[ai/case]`).
- Photo upload failures (`[ops] photo_upload_failure`).
- Auth failures (`[ops] auth_failure`).
- Abuse / rate-limit alerts (`[ops] rate_limit`).
- Weather-provider and product-catalogue failures.

Farmer-facing copy for these events is: “I'm having trouble with that right now. Please try again.”

## Weekly

- Review unresolved conversational cases (`case_status` not resolved/closed).
- Review AI mistakes and agronomist escalations (`human_escalation`).
- Review farmer follow-up outcomes.
- Inspect emerging trends on `/admin/insights`.
- Check critical product-catalogue / registration changes.

## Monthly

- Dependency and security updates.
- Database health and backup verification.
- AI usage and cost review.
- Guest / registered-free limits (`app_settings` or `FVM_*` env vars).
- Regional data updates (Trinidad and Tobago first).
- Agronomic rule improvements (weather rules, safety guards).

## Quarterly

- Deeper security review (RLS, storage, secrets).
- Product catalogue audit (no test/example brands in farmer view).
- Privacy review.
- Pricing / monetization review (do not fake payments).
- Larger AI evaluation on real cases.
- User interviews with the controlled-beta cohort.
