# Impact Report: Phase B.3 — Offer + ChannelDeployment

**Scope:** Extend create-from-plan with Offer row, ChannelDeployment rows per allowed channel, channel.deploy task (queued→running→completed), AuditEvents offer_created and deployments_created. No external APIs; mode = scheduled_posts; degradedMode wired into allowedChannels and deployment data.

**Risks:**
- **Phase A / B.1 / B.2:** Additive only. B.3 runs after B.1 (campaign + schedules + tasks + status) and after optional B.2 (creatives). No change to validate-scope, transaction, or creative block. Response extended with deployments + offer; existing keys unchanged.
- **Draft-store / image / auth:** No changes.
- **generateCreatives=false:** B.3 runs regardless; offer and deployments created after creatives block (which is skipped when false). No dependency on creatives.

**Mitigation:** Additive code block after creatives; plan select extended with channelsRequested only; response shape additive.
