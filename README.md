# AURA — Adaptive Urban Response Assistant

AURA is an emergency-response coordination prototype with citizen reporting, a responder workflow, incident prioritization, Smart Emergency Routing, and Emergency Traffic Intelligence.

## Run locally

Requirements: Node.js and npm. From this folder run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app opens at `/aura/index.html`.

## Added operational features

- **Guided incident reporting:** accepts brief descriptions and asks follow-up questions about injuries, trapped people, immediate danger, and blocked access. “Not sure” is a valid answer.
- **Transparent priority assessment:** rule-based estimates expose their reasons and missing information. Vague or incomplete reports are flagged **Needs Assessment** and serious incident types are kept visible for human review rather than automatically downgraded.
- **Smart Emergency Routing:** choose a response unit and active incident, request a road-network route, view an optional alternative, and display a proposed green corridor.
- **Emergency Traffic Intelligence:** visualizes active incidents, reported/inferred road impact, and potential delay points, with a direct link into route planning.
- **Existing responder workflow:** assign units, update response status, and resolve demo incidents.

## Important prototype limits

- The initial incidents, responder locations, and traffic-impact signals are synthetic demo data centred on Chandigarh.
- Road routes use the public OSRM demo service when it is available. Its ETA is a routing estimate, not a live-traffic-aware emergency ETA. The public demo service is best-effort and should not be treated as production infrastructure. See [OSRM API documentation](https://project-osrm.org/docs/).
- OpenStreetMap provides the basemap; attribution is displayed. Follow the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) for deployment and usage.
- The green corridor is a visual simulation only. This prototype does not connect to traffic signals, dispatch real responders, or contact official emergency services.
- Priority labels are transparent prototype estimates, not clinically validated triage or official dispatch decisions. A qualified human must review incidents. For real emergencies in India, call 112.

## Project

The homepage includes the existing scroll-controlled emergency vehicle frame sequence. Operational modules are available in the top navigation: Command Center, Incidents, Citizen Safety, Responder Portal, Smart Routing, and Traffic Intel.
