/* Synthetic demo content. Every handle, caption and transcript here is invented. */
window.SK_DATA = {
  /* Hero + examples section. `tile` is the index of the post in the phone's Saved grid. */
  examples: {
    recipe: {
      tile: 4,
      thumb: "recipe",
      hue: 18,
      handle: "@weeknight.kitchen",
      platform: "Instagram",
      title: "Crispy gochujang chickpeas, one pan",
      quote: "“Roast them until they rattle in the pan, then toss with gochujang and honey.”",
      steps: ["Roast chickpeas, 220°C", "Whisk gochujang + honey", "Toss, then top with scallions"],
      tags: ["dinner", "vegetarian", "one-pan"],
      detail: {
        kicker: "Recipe",
        blocks: [
          { label: "Ingredients", items: ["1 can chickpeas, dried well", "1 tbsp gochujang", "1 tsp honey", "Scallions, sesame, rice"] },
          { label: "Steps", ordered: true, items: ["Roast at 220°C until they rattle", "Whisk gochujang, honey, splash of oil", "Toss hot chickpeas in the glaze", "Serve over rice, top with scallions"] }
        ],
        evidence: "“…that’s when they’re crispy — don’t take them out before they rattle.”",
        note: "Translated from Korean · original kept"
      }
    },
    workout: {
      tile: 1,
      thumb: "workout",
      hue: 150,
      handle: "@steady.strength",
      platform: "Instagram",
      title: "10-minute lower-back warm-up",
      quote: "“Cat-cow for ten slow breaths, then bird-dog — three each side, no rushing.”",
      steps: ["Cat-cow · 10 breaths", "Bird-dog · 3 each side", "Glute bridge · 2 × 10"],
      tags: ["mobility", "lower back", "morning"],
      detail: {
        kicker: "Workout",
        blocks: [
          { label: "Sets", items: ["Cat-cow · 10 slow breaths", "Bird-dog · 3 each side, 5s hold", "Glute bridge · 2 × 10", "Child’s pose · 30s"] },
          { label: "Cues", items: ["Move with your breath, not the clock", "Keep hips level on bird-dog", "Squeeze glutes at the top of the bridge"] }
        ],
        evidence: "“…if your hips tip on the bird-dog, shorten the reach.”",
        note: "Topics: mobility · lower back"
      }
    },
    travel: {
      tile: 7,
      thumb: "travel",
      hue: 215,
      handle: "@slow.trains.japan",
      platform: "Facebook",
      title: "Quiet onsen town 2h from Tokyo",
      quote: "“Go midweek, stay at a small ryokan, and book the room with the private bath.”",
      steps: ["Go midweek, skip the crowds", "Small ryokan, private bath", "Sunset walk along the river"],
      tags: ["japan", "onsen", "weekend"],
      detail: {
        kicker: "Travel",
        blocks: [
          { label: "Places", items: ["The riverside footbath", "A family-run ryokan with a valley view", "Morning market by the station"] },
          { label: "Tips", items: ["Travel midweek for quiet baths", "Ask for a room with a private bath", "Bring cash for small shops"] }
        ],
        evidence: "“…by Wednesday the whole town is basically yours.”",
        note: "Places and tips pulled from the video"
      }
    }
  },

  /* Sample library for the local search demo. */
  captures: [
    { id: "chickpeas", thumb: "recipe", hue: 18, handle: "@weeknight.kitchen", platform: "Instagram",
      title: "Crispy gochujang chickpeas, one pan",
      summary: "One-pan crispy chickpeas glazed with gochujang and honey. Weeknight dinner in one tray.",
      transcript: "Roast the chickpeas until they rattle in the pan, then toss with gochujang and honey.",
      tags: ["recipe", "dinner", "vegetarian", "korean"] },
    { id: "warmup", thumb: "workout", hue: 150, handle: "@steady.strength", platform: "Instagram",
      title: "10-minute lower-back warm-up",
      summary: "A gentle floor warm-up for a stiff lower back: cat-cow, bird-dog and glute bridges.",
      transcript: "Cat-cow for ten slow breaths, then bird-dog, three each side. This is my lower back warm up every morning.",
      tags: ["workout", "mobility", "back", "warmup"] },
    { id: "onsen", thumb: "travel", hue: 215, handle: "@slow.trains.japan", platform: "Facebook",
      title: "Quiet onsen town 2h from Tokyo",
      summary: "A quiet hot-spring town for a midweek escape, with a small ryokan hotel and a valley view.",
      transcript: "Go midweek, stay at a small ryokan with the private onsen bath, and walk the river at sunset.",
      tags: ["travel", "japan", "onsen", "hotel", "ryokan"] },
    { id: "hinge", thumb: "hinge", hue: 95, handle: "@morning.mobility", platform: "Instagram",
      title: "Hip-hinge drill for a happier back",
      summary: "A broomstick hip-hinge drill to protect your lower back when you lift and bend.",
      transcript: "Keep the stick touching your head, upper back and tailbone while you hinge. Your back stays long.",
      tags: ["workout", "back", "mobility", "warmup"] },
    { id: "pasta", thumb: "pasta", hue: 45, handle: "@pasta.on.tuesday", platform: "Facebook",
      title: "Weeknight lemon pasta, five ingredients",
      summary: "Lemon, butter, parmesan and pasta water make a glossy sauce in the time the pasta cooks.",
      transcript: "Save a mug of pasta water. That starchy water is the whole sauce, trust me.",
      tags: ["recipe", "dinner", "pasta", "quick"] },
    { id: "shoulder", thumb: "shoulder", hue: 280, handle: "@deskside.coach", platform: "Instagram",
      title: "Shoulder routine for desk days",
      summary: "Five band moves to undo a day hunched over a laptop. Pull-aparts, face pulls, wall slides.",
      transcript: "Pull the band apart and squeeze your shoulder blades like you’re holding a pencil between them.",
      tags: ["workout", "shoulders", "posture", "desk"] },
    { id: "amalfi", thumb: "coast", hue: 195, handle: "@tiny.atlas", platform: "Instagram",
      title: "Clifftop guesthouse with the view",
      summary: "A small family guesthouse above the sea on the Amalfi coast. Book the top-floor room for the terrace.",
      transcript: "Honestly the hotel with the best view we’ve ever had. Ask for the terrace room on the top floor.",
      tags: ["travel", "italy", "hotel", "coast"] },
    { id: "monstera", thumb: "plant", hue: 125, handle: "@balcony.green", platform: "Instagram",
      title: "Repotting a monstera without the mess",
      summary: "Water the day before, tip the pot on its side, and loosen the roots before moving up one size.",
      transcript: "Only go up one pot size. Bigger pots hold too much water and the roots rot.",
      tags: ["plants", "home", "repotting"] },
    { id: "coldbrew", thumb: "coffee", hue: 30, handle: "@kettle.and.co", platform: "Facebook",
      title: "Cold brew concentrate, one to four",
      summary: "Coarse-ground coffee steeped overnight at one part coffee to four parts water, then diluted to taste.",
      transcript: "One to four, coarse grind, twelve hours in the fridge. Dilute it half and half with milk.",
      tags: ["coffee", "drinks", "summer"] }
  ],

  /* Small vocabulary bridge so natural phrasing finds the right save. */
  synonyms: {
    "warm-up": ["warmup", "warm"], warmup: ["warm"], hotel: ["ryokan", "guesthouse"],
    "hot spring": ["onsen"], spring: ["onsen"], noodles: ["pasta"], plant: ["plants", "monstera"],
    coffee: ["brew"], stretch: ["mobility"], back: ["back"]
  }
};
