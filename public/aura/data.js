/* AURA synthetic data — Chandigarh, India. All data is fictional. */
window.AURA_DATA = (function () {
  const CENTER = [30.7333, 76.7794];

  const LOCATIONS = [
    { name: "Sector 17 Plaza", lat: 30.7410, lng: 76.7790 },
    { name: "Tribune Chowk", lat: 30.7270, lng: 76.7980 },
    { name: "Sukhna Lake", lat: 30.7421, lng: 76.8188 },
    { name: "PGIMER, Sector 12", lat: 30.7649, lng: 76.7756 },
    { name: "Sector 22 Market", lat: 30.7333, lng: 76.7720 },
    { name: "Industrial Area Phase 1", lat: 30.7046, lng: 76.8010 },
    { name: "Elante Mall", lat: 30.7056, lng: 76.8013 },
    { name: "Rock Garden", lat: 30.7525, lng: 76.8101 },
    { name: "ISBT Sector 43", lat: 30.7225, lng: 76.7516 },
    { name: "Manimajra", lat: 30.7290, lng: 76.8330 },
    { name: "Madhya Marg, Sector 26", lat: 30.7270, lng: 76.8030 },
    { name: "Sector 35 Market", lat: 30.7225, lng: 76.7610 },
    { name: "Sector 15 Residential", lat: 30.7480, lng: 76.7700 },
  ];

  const TYPES = {
    "Medical Emergency": { icon: "✚", short: "Medical", base: 26 },
    "Fire": { icon: "🔥", short: "Fire", base: 32 },
    "Road Accident": { icon: "⚠", short: "Accident", base: 26 },
    "Flood": { icon: "🌊", short: "Flood", base: 28 },
    "Public Safety Threat": { icon: "⛨", short: "Threat", base: 28 },
    "Other Emergency": { icon: "•", short: "Other", base: 12 },
  };

  const SHELTERS = [
    { id: "SH-1", name: "Govt. Model School Shelter, Sec 16", lat: 30.7470, lng: 76.7850, capacity: 300, occupied: 42 },
    { id: "SH-2", name: "Community Centre, Sector 27", lat: 30.7180, lng: 76.7950, capacity: 180, occupied: 15 },
    { id: "SH-3", name: "Sports Complex, Sector 42", lat: 30.7290, lng: 76.7480, capacity: 450, occupied: 88 },
    { id: "SH-4", name: "Relief Camp, Manimajra Grounds", lat: 30.7330, lng: 76.8400, capacity: 250, occupied: 0 },
  ];

  const RESPONDERS = [
    { id: "R-101", name: "Ambulance Alpha", lead: "Dr. Meera Kaur", cap: "Medical", lat: 30.7600, lng: 76.7760, available: true },
    { id: "R-102", name: "Ambulance Bravo", lead: "Paramedic Arjun Rao", cap: "Medical", lat: 30.7240, lng: 76.7650, available: true },
    { id: "R-201", name: "Fire Engine 3", lead: "Stn. Officer Vikram Singh", cap: "Fire", lat: 30.7390, lng: 76.7930, available: true },
    { id: "R-202", name: "Fire Engine 7", lead: "Ldg. Firefighter Neha Sharma", cap: "Fire", lat: 30.7100, lng: 76.7990, available: false },
    { id: "R-301", name: "Rescue Unit 1", lead: "Capt. Rohan Mehta", cap: "Rescue", lat: 30.7320, lng: 76.8110, available: true },
    { id: "R-401", name: "PCR Van 12", lead: "SI Harpreet Gill", cap: "Police", lat: 30.7350, lng: 76.7750, available: true },
    { id: "R-402", name: "PCR Van 19", lead: "ASI Kavya Nair", cap: "Police", lat: 30.7200, lng: 76.7880, available: true },
    { id: "R-501", name: "Flood Response Team", lead: "NDRF Insp. Sameer Khan", cap: "Flood Response", lat: 30.7460, lng: 76.8200, available: true },
  ];

  const mins = (m) => Date.now() - m * 60000;

  // Seed reports. Fusion engine groups them into incidents on first load.
  const SEED_REPORTS = [
    { type: "Road Accident", loc: 1, desc: "Car and auto rickshaw collided at the chowk, driver bleeding from head", people: 2, ago: 22 },
    { type: "Road Accident", loc: 1, desc: "Accident at Tribune chowk, two vehicles, one person injured and bleeding", people: 2, ago: 19 },
    { type: "Road Accident", loc: 1, desc: "Collision near tribune chowk traffic lights, traffic jam forming", people: 3, ago: 15 },
    { type: "Medical Emergency", loc: 4, desc: "Elderly man collapsed near shop, not breathing properly", people: 1, ago: 12 },
    { type: "Fire", loc: 5, desc: "Smoke coming out of a factory shed, small fire visible", people: 0, ago: 48 },
    { type: "Public Safety Threat", loc: 8, desc: "Unattended bag found near bus platform 4", people: 0, ago: 70 },
    { type: "Flood", loc: 9, desc: "Water logging on main road after heavy rain, knee deep", people: 10, ago: 95 },
    { type: "Other Emergency", loc: 7, desc: "Large tree branch fell on footpath, blocking the way", people: 0, ago: 140 },
  ];

  // Scripted "City in Crisis" scenario
  const CRISIS = [
    { type: "Road Accident", loc: 10, desc: "Bus and car crash on Madhya Marg, people trapped inside car", people: 6 },
    { type: "Fire", loc: 6, desc: "Fire broke out in Elante Mall food court, heavy smoke spreading", people: 40 },
    { type: "Road Accident", loc: 10, desc: "Major accident at Madhya Marg sector 26, bus overturned, many injured", people: 8 },
    { type: "Flood", loc: 2, desc: "Sukhna Lake water level rising fast, floodgates opened, low areas flooding", people: 120 },
    { type: "Medical Emergency", loc: 0, desc: "Woman unconscious at Sector 17 plaza after heat stroke", people: 1 },
    { type: "Road Accident", loc: 10, desc: "Crash madhya marg, car stuck under bus, need cutter, bleeding", people: 5 },
    { type: "Fire", loc: 6, desc: "Smoke from mall, people evacuating, fire spreading to parking", people: 60 },
    { type: "Flood", loc: 2, desc: "Flooding near Sukhna lake road, cars stuck, water entering houses", people: 80 },
    { type: "Road Accident", loc: 10, desc: "Accident on madhya marg near sector 26 grain market, two critical", people: 6 },
    { type: "Road Accident", loc: 10, desc: "Bus accident madhya marg, traffic stopped both sides", people: 10 },
  ];

  return { CENTER, LOCATIONS, TYPES, SHELTERS, RESPONDERS, SEED_REPORTS, CRISIS, mins };
})();
