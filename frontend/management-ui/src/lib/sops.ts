/* Static SOP data from Israel-Preparedness-SOPs repo — embedded at build time */

export interface ChecklistItem {
  id: string;
  item: string;
  detail: string;
}

export interface ChecklistSection {
  name: string;
  icon?: string;
  items: ChecklistItem[];
}

export interface ReadinessPosture {
  title: string;
  subtitle?: string;
  description: string;
  sections: ChecklistSection[];
}

export interface SirenStep {
  step: number;
  action: string;
  detail: string;
}

export interface SirenResponse {
  title: string;
  id: string;
  scenario: string;
  time_critical: boolean;
  steps: SirenStep[];
  notes: string[];
}

export interface ProtectedSpacePriority {
  priority: number;
  name: string;
  description: string;
  instructions: string[];
  note?: string;
  why_it_works?: string;
}

export interface ProtectedSpaceDecision {
  title: string;
  subtitle: string;
  description: string;
  priority_order: ProtectedSpacePriority[];
  not_valid_spaces: string[];
  important_notes: string[];
}

/* ── Readiness Postures ── */

export const daytimePosture: ReadinessPosture = {
  title: "Daytime Readiness Posture",
  subtitle: "Red Alert SOP — No Mamad/Mamak",
  description:
    "Checklist for maintaining daytime readiness when living in a building without a residential protected room (Mamad) or floor protected room (Mamak). You must be ready to reach an external shelter within the time available.",
  sections: [
    {
      name: "On Your Person",
      icon: "🧍",
      items: [
        { id: "D01", item: "Phone is ON, volume ON, location services ON", detail: "Red Alert app installed, configured for your area, notifications enabled" },
        { id: "D02", item: "Red Alert browser extension active (if at computer)", detail: "Set to correct alert area, computer not on mute, tested recently" },
        { id: "D03", item: "Keys on person", detail: "Front door key accessible — do not leave locked inside" },
        { id: "D04", item: "Wallet and ID (Teudat Zehut) on person or in go bag", detail: "" },
        { id: "D05", item: "Wearing closed-toe shoes suitable for running", detail: "Not sandals, slippers, or barefoot" },
        { id: "D06", item: "Glasses or contacts on (if needed)", detail: "" },
      ],
    },
    {
      name: "Go Bag & Exit Route",
      icon: "🎒",
      items: [
        { id: "D07", item: "Baby carrier by front door and ready to grab", detail: "Wrap or structured carrier — hands-free evacuation is far faster than a stroller" },
        { id: "D08", item: "Go bag packed and positioned by front door", detail: "" },
        { id: "D09", item: "Daily bag check completed", detail: "Medications, charged torch, water bottle, phone charger, ID copy" },
        { id: "D10", item: "Hallway and exit route clear of obstructions", detail: "No furniture, shoes, or items blocking path to front door" },
        { id: "D11", item: "Front door can be opened quickly", detail: "Not double-locked or chain-latched" },
      ],
    },
    {
      name: "Situational Awareness",
      icon: "📡",
      items: [
        { id: "D12", item: "Nearest 3 shelters — locations known and routes verified", detail: "Walked the route recently; know backup if primary is locked" },
        { id: "D13", item: "Time to shelter for your area — known and memorised", detail: "Check HFC website Alerts tab for your locality" },
        { id: "D14", item: "Protected space priority order — understood", detail: "Shelter > Inner stairwell > Inner room (see decision flowchart)" },
        { id: "D15", item: "Children / dependents — know their current location", detail: "Ready to move them or confirm they are in a protected space" },
        { id: "D16", item: "News / situation scan completed", detail: "Check every 3 hours; adjust posture if escalation detected" },
      ],
    },
  ],
};

export const nighttimePosture: ReadinessPosture = {
  title: "Nighttime Readiness Posture",
  subtitle: "Red Alert SOP — No Mamad/Mamak",
  description:
    "Checklist for before-bed preparation when living in a building without a residential protected room (Mamad) or floor protected room (Mamak). You may need to wake, dress, and reach a shelter in under 90 seconds.",
  sections: [
    {
      name: "Before Bed Setup",
      icon: "🛏️",
      items: [
        { id: "N01", item: "News / situation scan completed before bed", detail: "Check current threat level; assess if safe to sleep at home tonight" },
        { id: "N02", item: "Phone charging, volume ON, location services ON", detail: "Red Alert app active; Do Not Disturb disabled or alerts whitelisted" },
        { id: "N03", item: "Clothes laid out by bed", detail: "Full outfit ready to throw on in seconds — shirt, pants, underwear" },
        { id: "N04", item: "Closed-toe shoes positioned by bed", detail: "Ready to step into; not across the room" },
        { id: "N05", item: "Torch / flashlight within arm's reach", detail: "On nightstand or bedside — not buried in go bag" },
        { id: "N06", item: "Glasses positioned by bed (if needed)", detail: "Same spot every night — grab without thinking" },
        { id: "N07", item: "Keys accessible and in known location", detail: "By bed or on hook by front door — not in a coat pocket" },
      ],
    },
    {
      name: "Go Bag & Exit Route",
      icon: "🎒",
      items: [
        { id: "N08", item: "Baby carrier by front door and ready to grab", detail: "Wrap or structured carrier — you may need both hands free" },
        { id: "N09", item: "Go bag packed and positioned by front door", detail: "" },
        { id: "N10", item: "Infant supplies in go bag", detail: "Pacifier, bottle/formula, nappies, wipes, muslin/blanket" },
        { id: "N11", item: "Medications in go bag (if taking)", detail: "" },
        { id: "N12", item: "Power bank on charge and ready to grab", detail: "Near go bag or by front door" },
        { id: "N13", item: "Hallway and exit route clear of obstructions", detail: "Can navigate in the dark without tripping" },
        { id: "N14", item: "Front door can be opened quickly", detail: "Not double-locked; key at hand if needed" },
      ],
    },
    {
      name: "Sleep Conditions",
      icon: "😴",
      items: [
        { id: "N15", item: "No earplugs — hearing must be clear", detail: "You must be able to hear the siren and phone alert" },
        { id: "N16", item: "Protected space priority order — understood", detail: "Shelter > Inner stairwell > Inner room (see decision flowchart)" },
        { id: "N17", item: "Route to nearest shelter — known and walkable in the dark", detail: "Have you walked it at night? Know alternate if primary locked?" },
      ],
    },
  ],
};

export const escalationReadiness: ReadinessPosture = {
  title: "Escalation Readiness — Upping Your Posture",
  subtitle: "Red Alert SOP — When the Security Situation Deteriorates",
  description:
    "Checklist for when geopolitical escalation is detected or expected. Based on HFC recommendation to prepare 72 hours of supplies. Complete this checklist when tensions rise, BEFORE sirens start.",
  sections: [
    {
      name: "Water & Food (72 Hours Minimum)",
      items: [
        { id: "E01", item: "Water — 3 litres per person per day × 3 days", detail: "Sealed bottles, stored in protected space or by go bag. Replace every 3 months." },
        { id: "E02", item: "Water for infants — extra for formula preparation", detail: "Bottled water suitable for babies; enough for 72 hours" },
        { id: "E03", item: "Non-perishable food for 72 hours", detail: "Canned goods, crackers, dried fruit, energy bars, peanut butter — no cooking required" },
        { id: "E04", item: "Baby food / formula / snacks for 72 hours", detail: "Pre-measured formula portions; pouches; age-appropriate snacks" },
        { id: "E05", item: "Pet food for 72 hours (if applicable)", detail: "" },
        { id: "E06", item: "Manual can opener", detail: "Do not rely on electric; pack with food supplies" },
        { id: "E07", item: "Disposable plates, cups, cutlery", detail: "" },
      ],
    },
    {
      name: "Power & Communications",
      items: [
        { id: "E08", item: "Power banks — fully charged", detail: "Enough to charge all phones for 72 hours" },
        { id: "E09", item: "Battery-powered or hand-crank radio", detail: "For updates if internet / cell goes down; test batteries" },
        { id: "E10", item: "Spare batteries (AA, AAA, torch batteries)", detail: "For torch, radio, and any medical devices" },
        { id: "E11", item: "Car — at least half a tank of fuel", detail: "Fill up before stations get crowded; keep topped up during escalation" },
        { id: "E12", item: "Cash on hand", detail: "ATMs and card readers may go offline; enough for several days of basics" },
      ],
    },
    {
      name: "Medical & Documents",
      items: [
        { id: "E13", item: "Medications — 72-hour supply in go bag or protected space", detail: "Prescription meds, inhalers, insulin, EpiPens — plus printed prescriptions" },
        { id: "E14", item: "First aid kit — stocked and checked", detail: "Bandages, antiseptic, painkillers, any personal medical supplies" },
        { id: "E15", item: "Copies of essential documents", detail: "ID, passport, driver's licence, insurance, medical records — in sealed plastic bag" },
        { id: "E16", item: "Infant documents if applicable", detail: "Vaccination booklet (Tofes Yarok), health fund card" },
      ],
    },
    {
      name: "Household & Comfort",
      items: [
        { id: "E17", item: "Torches — checked and batteries fresh", detail: "One per room plus one in go bag" },
        { id: "E18", item: "Blankets or sleeping bags", detail: "For sheltering in protected space; nights can be cold" },
        { id: "E19", item: "Change of clothes for each family member", detail: "In go bag or protected space; include warm layer" },
        { id: "E20", item: "Hygiene basics", detail: "Toilet paper, wet wipes, nappies, hand sanitiser, garbage bags" },
        { id: "E21", item: "Activities for children", detail: "Colouring books, games, stationery — waiting in a shelter is long for kids" },
        { id: "E22", item: "Fire extinguisher and smoke detector", detail: "Check that they are functional" },
        { id: "E23", item: "Gas supply checked", detail: "Private homes: spare tank full. Shared buildings: storage tank more than half full" },
      ],
    },
    {
      name: "Readiness Actions",
      items: [
        { id: "E24", item: "All household members briefed on the plan", detail: "Everyone knows where the shelters are, what to grab, and their role" },
        { id: "E25", item: "Shelter check completed", detail: "Nearest shelters verified, routes walked, access confirmed" },
        { id: "E26", item: "Go bag fully packed and by the door", detail: "Ready for both sheltering-in-place and evacuation scenarios" },
        { id: "E27", item: "Emergency contacts list prepared and shared", detail: "Family, neighbours, doctor, insurance — printed copy in go bag" },
        { id: "E28", item: "Daytime and nighttime postures activated", detail: "Switch to full readiness mode — see posture checklists" },
      ],
    },
  ],
};

export const shelterCheck: ReadinessPosture = {
  title: "Shelter Check",
  subtitle: "Red Alert SOP — Do This Before You Need It",
  description:
    "Checklist for locating, verifying, and familiarising yourself with your nearest public and building shelters. Complete this checklist BEFORE an emergency.",
  sections: [
    {
      name: "Identify Shelters",
      items: [
        { id: "S01", item: "Nearest public shelter — location identified", detail: "Check municipality website, building committee, or neighbours" },
        { id: "S02", item: "Second nearest shelter — location identified", detail: "Backup in case primary is locked or full" },
        { id: "S03", item: "Third nearest shelter — location identified", detail: "A further backup — may be a public building with a Mamam" },
        { id: "S04", item: "Building stairwell assessed as fallback", detail: "Is it windowless? Which floor is safest? Is it clear of obstacles?" },
      ],
    },
    {
      name: "Verify Access",
      items: [
        { id: "S05", item: "Primary shelter — physically visited and confirmed open/accessible", detail: "Some shelters are locked; verify you can get in or know who has the key" },
        { id: "S06", item: "Secondary shelter — physically visited and confirmed accessible", detail: "" },
        { id: "S07", item: "Opening hours / access restrictions known", detail: "Some public shelters are locked at night or require a code" },
        { id: "S08", item: "Key holder or access code obtained (if applicable)", detail: "Building committee, municipality, or designated keyholder" },
        { id: "S09", item: "Shelter is maintained and usable", detail: "Not used as storage, flooded, or blocked — report issues to municipality" },
      ],
    },
    {
      name: "Know the Route",
      items: [
        { id: "S10", item: "Route to primary shelter — walked and timed", detail: "Can you make it within your area's time-to-shelter?" },
        { id: "S11", item: "Route to secondary shelter — walked and timed", detail: "" },
        { id: "S12", item: "Route walked at night", detail: "Is it lit? Can you navigate it in the dark with a torch?" },
        { id: "S13", item: "Route is step-free or wheelchair accessible (if needed)", detail: "Kerbs, stairs, uneven ground — can everyone in your household make it?" },
        { id: "S14", item: "Obstacles identified and noted", detail: "Locked gates, construction, narrow passages, stray animals" },
      ],
    },
    {
      name: "Time to Shelter",
      items: [
        { id: "S15", item: "Time to shelter for your area — looked up and memorised", detail: "Check HFC Alerts tab at oref.org.il — enter your locality name" },
        { id: "S16", item: "Realistic time test completed", detail: "Timed yourself (and family) going from home to shelter at a fast walk, not a sprint" },
        { id: "S17", item: "If shelter is NOT reachable in time — fallback plan set", detail: "Inner stairwell or inner room identified and prepared" },
      ],
    },
  ],
};

export const allPostures: ReadinessPosture[] = [
  daytimePosture,
  nighttimePosture,
  escalationReadiness,
  shelterCheck,
];

/* ── Siren Response SOPs ── */

export const sirenResponses: SirenResponse[] = [
  {
    title: "At Home WITH Mamad",
    id: "SR01",
    scenario: "You are at home and your building has a Mamad (residential protected room)",
    time_critical: true,
    steps: [
      { step: 1, action: "Move immediately to the Mamad", detail: "Do not stop to collect belongings. Bring your phone." },
      { step: 2, action: "Close the blast door tightly", detail: "Turn the handle 90 degrees to lock it." },
      { step: 3, action: "Verify windows are sealed", detail: "External steel window AND internal glass window must be closed." },
      { step: 4, action: "Sit against an inner wall, below window line", detail: "Do not sit or stand facing the door." },
      { step: 5, action: "Wait 10 minutes", detail: "Do not leave until 10 minutes have passed since the last siren." },
      { step: 6, action: "Listen for further instructions", detail: "Check Red Alert app and news for all-clear or additional alerts." },
    ],
    notes: [
      "If you have time, bring children, elderly, and pets into the Mamad",
      "Keep the Mamad steel and glass windows closed until the end of the emergency situation",
    ],
  },
  {
    title: "At Home WITHOUT Mamad",
    id: "SR02",
    scenario: "You are at home and your building does NOT have a Mamad or Mamak",
    time_critical: true,
    steps: [
      { step: 1, action: "Move immediately to the stairwell", detail: "Inner stairwell without windows. Not top or bottom floor." },
      { step: 2, action: "If no suitable stairwell — go to inner room", detail: "Room with maximum walls, minimum windows. Close all doors and windows." },
      { step: 3, action: "Sit against inner wall, below window line", detail: "Do not face the door." },
      { step: 4, action: "Wait 10 minutes", detail: "Do not leave until 10 minutes have passed since the last siren." },
      { step: 5, action: "Listen for further instructions", detail: "Check Red Alert app and news." },
    ],
    notes: [
      "Building with 3+ floors: stay on a floor with at least 2 floors above",
      "Stay ON the staircase, not in the floor hallway",
    ],
  },
  {
    title: "Outside / Outdoors",
    id: "SR03",
    scenario: "You are outside when the siren sounds",
    time_critical: true,
    steps: [
      { step: 1, action: "Enter the nearest building immediately", detail: "Any solid building — look for a shelter sign." },
      { step: 2, action: "Move to stairwell or inner room", detail: "Follow the same rules as at home without Mamad." },
      { step: 3, action: "If no building reachable — lie flat on the ground", detail: "Protect your head with your hands." },
      { step: 4, action: "Wait 10 minutes", detail: "Do not get up until 10 minutes after the last siren." },
    ],
    notes: [
      "Do not shelter under trees or near glass facades",
      "Stay away from vehicles if possible",
    ],
  },
  {
    title: "Driving",
    id: "SR04",
    scenario: "You are driving when the siren sounds",
    time_critical: true,
    steps: [
      { step: 1, action: "Pull over and stop safely", detail: "Signal, move to the shoulder, apply handbrake." },
      { step: 2, action: "Exit the vehicle", detail: "Leave keys in the ignition for emergency services." },
      { step: 3, action: "Enter nearest building or lie flat", detail: "If no building within reach, lie on the ground away from the car." },
      { step: 4, action: "Protect your head", detail: "Hands over head." },
      { step: 5, action: "Wait 10 minutes", detail: "Do not return to the car until 10 minutes after the last siren." },
    ],
    notes: [
      "Do NOT stay in the car — it does not protect against shrapnel",
      "Do not stop in a tunnel or on a bridge",
    ],
  },
  {
    title: "On a Bus",
    id: "SR05",
    scenario: "You are on a bus when the siren sounds",
    time_critical: true,
    steps: [
      { step: 1, action: "Driver pulls over and opens doors", detail: "If the driver does not stop, instruct them firmly." },
      { step: 2, action: "Exit the bus", detail: "Move away from the bus quickly." },
      { step: 3, action: "Enter nearest building or lie flat", detail: "Building > lie on ground > protect head." },
      { step: 4, action: "Wait 10 minutes", detail: "" },
    ],
    notes: [
      "A bus does not count as shelter",
      "Help elderly and disabled passengers exit first",
    ],
  },
  {
    title: "In a Public Building",
    id: "SR06",
    scenario: "You are in a public building (mall, office, school)",
    time_critical: true,
    steps: [
      { step: 1, action: "Follow signs to the Mamam or shelter", detail: "Public buildings are required to have marked protected spaces." },
      { step: 2, action: "If no shelter found — move to inner stairwell", detail: "Away from windows, exterior walls, and glass." },
      { step: 3, action: "Sit against inner wall, below window line", detail: "" },
      { step: 4, action: "Wait 10 minutes", detail: "" },
    ],
    notes: [
      "Do NOT use elevators",
      "Do not run — move quickly but calmly to avoid crush injuries",
    ],
  },
  {
    title: "With Infant",
    id: "SR07",
    scenario: "You are at home with an infant when the siren sounds",
    time_critical: true,
    steps: [
      { step: 1, action: "Pick up the baby immediately", detail: "Grab phone. Do not stop for anything else." },
      { step: 2, action: "Move to Mamad or protected space", detail: "Carry the baby — do not use a stroller." },
      { step: 3, action: "Close door and windows", detail: "Same sealing procedure as standard." },
      { step: 4, action: "Sit against inner wall with baby", detail: "Hold baby securely. Below window line." },
      { step: 5, action: "Wait 10 minutes", detail: "Comfort the baby but do not leave the space." },
    ],
    notes: [
      "Pre-position a pacifier and bottle in the protected space",
      "Practice the route with the baby so it becomes automatic",
    ],
  },
];

/* ── Protected Space Decision ── */

export const protectedSpaceDecision: ProtectedSpaceDecision = {
  title: "Choosing a Protected Space",
  subtitle: "Decision Flowchart — Home Front Command Guidelines",
  description:
    "Priority order for selecting a protected space when a Red Alert sounds. Choose the highest-priority option you can reach within the time available to shelter.",
  priority_order: [
    {
      priority: 1,
      name: "Mamad / Mamak / Mamam",
      description: "Residential protected room, floor protected room, or institutional protected space",
      instructions: [
        "Close the door tightly and turn the handle 90 degrees",
        "Close the external steel window AND the internal glass window",
        "If double-wing sliding glass window is installed, remove wings in advance",
      ],
      note: "This is the preferred choice if available in your building.",
    },
    {
      priority: 2,
      name: "Shelter",
      description: "Communal building shelter or public shelter",
      instructions: [
        "Communal shelter in building — must be reachable within time to shelter",
        "Public shelter — must be reachable within time to shelter",
      ],
      note: "If no Mamad/Mamak/Mamam exists, this is the next best option.",
    },
    {
      priority: 3,
      name: "Inner Stairwell",
      description: "Stairwell without windows or exterior walls",
      instructions: [
        "Stay in the CENTER of the stairwell",
        "NOT on the top floor, NOT on the bottom/entrance floor",
        "Building with 3+ floors: stay on a floor with at least 2 floors above",
        "Stay ON the staircase, not in the floor hallway",
      ],
      why_it_works: "An inner stairwell is surrounded by apartment walls, made of poured concrete, and is the structural core of the building.",
    },
    {
      priority: 4,
      name: "Inner Room",
      description: "Innermost space with maximum walls, minimum windows",
      instructions: [
        "Choose a room surrounded by as many walls as possible",
        "Minimize windows and openings",
        "Sit close to an inner wall, below the window line",
        "Do NOT sit facing the door",
        "Close all doors and windows",
      ],
    },
    {
      priority: 5,
      name: "Last Resort — Open Ground",
      description: "No building or protected space available",
      instructions: [
        "Lie down on the ground",
        "Protect your head with your hands",
      ],
      note: "Use only if no building or structure is reachable in time.",
    },
  ],
  not_valid_spaces: [
    "Kitchen",
    "Bathroom",
    "Toilet",
    "Building entrance lobby (risk of shrapnel and blast waves)",
    "Prefabricated structures (caravans, wooden houses) — evacuate immediately",
    "Areas with ceramics, porcelain, or glass that may shatter",
  ],
  important_notes: [
    "Wait 10 minutes in the protected space after alert sounds",
    "Keep the Mamad steel and glass windows closed until end of emergency",
    "Maintain clear passages and stairwells at all times",
    "Place a chair in stairwell for elderly individuals",
    "If in a caravan/prefab: leave immediately, reach shelter or lie on ground",
    "Practice reaching your protected space from different rooms",
  ],
};
