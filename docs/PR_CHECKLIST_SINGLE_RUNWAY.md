\# PR Checklist — Single Runway



Before merging any feature, verify:



\## Execution Rules



\- \[ ] No artifact UI calls `/api/mi/orchestra/start`

\- \[ ] No artifact UI calls `startOrchestraTask`

\- \[ ] All user actions create `IntentRequest`

\- \[ ] All execution happens in Mission Execution



\## Result Rules



\- \[ ] Completed intents return `intent.result`

\- \[ ] Artifacts show links from `intent.result`



\## UI Rules



\- \[ ] Only one primary action per screen

\- \[ ] Pipeline step cards do not render outputs

\- \[ ] Outputs appear in Artifacts section



\## Safety Rules



\- \[ ] `assertNoDirectOrchestraWhenMissionId` used in artifact paths

\- \[ ] `executeOrchestra.ts` runtime guard present

\- \[ ] Mission events emitted for new agent tasks



\## Signals



\- \[ ] Public endpoints log `IntentSignal`

\- \[ ] Signals used to generate `IntentOpportunity`

