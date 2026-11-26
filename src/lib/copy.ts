import type { Brief } from "./profile";

/**
 * Pascal's first texts, written from the interview: the owner's own description, the kind of site, rent or sale,
 * the town and the picked features. Rule-based on purpose: it never states facts it was not given (no numbers,
 * no "free parking"), so every sentence is either the owner's own words or a neutral starter to edit.
 * A language model can later replace this behind the same function.
 */
export interface Copy {
  heroText: string;
  aboutTitle: string;
  aboutText: string;
  advantagesTitle: string;
  advantages: { icon: string; title: string; text: string }[];
  contactText: string;
  newsletterText: string;
  posts?: { title: string; date: string; category: string; image: string; excerpt: string; body: string }[];
  faq?: { q: string; a: string }[];
  seo: { title: string; description: string };
}

/** the first sentence; "2.5 rooms" or "Nr. 4" do not end a sentence, a full stop before a space and a capital does */
const first = (s: string) => (s.match(/^.*?[.!?](?=\s+[A-ZÄÖÜÀ-Þ]|\s*$)/)?.[0] ?? s).trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

export function writeCopy(b: Brief, place: { city?: string; address?: string }): Copy {
  const name = b.name.trim() || "Our project";
  const city = place.city?.trim();
  const inCity = city ? ` in ${city}` : "";
  const desc = b.description.trim();
  const sale = b.offer === "sale";
  const has = (f: string) => b.features.includes(f as never);

  const base = {
    residential: {
      hero: desc ? first(desc) : `${sale ? "Apartments for sale" : "Apartments to let"}${inCity}.`,
      aboutTitle: "The project",
      about: desc || `${name} brings new ${sale ? "homes for sale" : "rental homes"}${inCity}. Bright rooms, good materials and a quiet setting – tell visitors here what makes the building special.`,
      advTitle: sale ? "Why buy here" : "Good reasons to move in",
      adv: [
        { icon: "key", title: sale ? "Your own home" : "Ready to move in", text: sale ? "Plan your future in a home that belongs to you." : "Pick your apartment online and apply in a few minutes." },
        { icon: "sun", title: "Bright rooms", text: "Large windows and well thought-out floor plans." },
        { icon: "transport", title: "Well connected", text: `Everyday errands and transport close by${inCity}.` },
        { icon: "park", title: "Green surroundings", text: "Space to breathe right outside the door." },
      ],
      contact: sale ? "Interested in an apartment? We send you the sales documents and answer every question." : "Questions about an apartment or a viewing? We get back to you within one working day.",
      news: "Be the first to hear about viewings and new apartments.",
    },
    commercial: {
      hero: desc ? first(desc) : `Office and commercial space${inCity}.`,
      aboutTitle: "The building",
      about: desc || `${name} offers flexible space for offices, retail and services${inCity}. Describe floor heights, fit-out and access here.`,
      advTitle: "Why your business fits here",
      adv: [
        { icon: "key", title: "Flexible space", text: "Units that can be combined or divided to suit you." },
        { icon: "transport", title: "Easy to reach", text: `For your team and your clients${inCity}.` },
        { icon: "shop", title: "Good neighbours", text: "Shops and services in and around the building." },
        { icon: "sun", title: "Light-filled", text: "Daylight and open floor plates." },
      ],
      contact: "Tell us how much space you need and when; we send you the matching offer.",
      news: "New spaces and news about the building, a few times a year.",
    },
    "shopping-centre": {
      hero: desc ? first(desc) : `Shops, food and services under one roof${inCity}.`,
      aboutTitle: "Welcome",
      about: desc || `${name} brings shopping, food and services together${inCity}. Add what makes your centre special: the mix of shops, events, parking and opening hours.`,
      advTitle: "Why visit",
      adv: [
        { icon: "shop", title: "Everything under one roof", text: "Daily shopping, fashion and services in one place." },
        { icon: "food", title: "Food & drinks", text: "Cafés and restaurants for a break." },
        { icon: "transport", title: "Easy to reach", text: `By public transport and by car${inCity}.` },
        { icon: "heart", title: "Events all year", text: "Something going on for the whole family." },
      ],
      contact: "Questions, lost property or a request for your shop? Write to the centre management.",
      news: "Offers, events and new shops, about once a month.",
    },
    booking: {
      hero: desc ? first(desc) : `Rooms and desks to book online${inCity}.`,
      aboutTitle: "About us",
      about: desc || `${name} offers rooms and workplaces you can book by the hour or by the day${inCity}. Describe the equipment and how booking works.`,
      advTitle: "Why book with us",
      adv: [
        { icon: "key", title: "Book in a minute", text: "Pick a room, a day and a time – done." },
        { icon: "sun", title: "Ready to work", text: "Furnished and equipped spaces." },
        { icon: "transport", title: "Central", text: `Easy to reach${inCity}.` },
        { icon: "heart", title: "Fair prices", text: "Pay only for the time you use." },
      ],
      contact: "Need a larger room or a recurring booking? Write to us.",
      news: "New rooms and offers, now and then.",
    },
    blog: {
      hero: desc ? first(desc) : "News, stories and updates.",
      aboutTitle: "About",
      about: desc || `${name} shares news and stories. Tell readers what they will find here.`,
      advTitle: "What you find here",
      adv: [],
      contact: "Ideas, questions or a story to share? Write to us.",
      news: "New posts straight to your inbox.",
    },
    other: {
      hero: desc ? first(desc) : `Welcome to ${name}.`,
      aboutTitle: "About us",
      about: desc || `Tell visitors who you are and what ${name} offers.`,
      advTitle: "Why us",
      adv: [],
      contact: "We look forward to hearing from you.",
      news: "News from us, now and then.",
    },
  }[b.kind];

  const posts: Copy["posts"] = has("blog")
    ? b.kind === "shopping-centre"
      ? [
          { title: "New shops this season", date: "", category: "News", image: "", excerpt: "Fresh names in the centre – have a look around.", body: "Fresh names in the centre. Replace this with the shops that opened recently." },
          { title: "Late-night shopping", date: "", category: "Events", image: "", excerpt: "Longer opening hours with music and offers.", body: "Longer opening hours with music and offers. Add the date and programme here." },
          { title: "Family day", date: "", category: "Events", image: "", excerpt: "Games, food and surprises for children.", body: "Games, food and surprises for children. Add the date and programme here." },
        ]
      : b.kind === "booking"
        ? [
            { title: "New meeting room", date: "", category: "News", image: "", excerpt: "More space for your team.", body: "Describe the new room, its size and equipment." },
            { title: "Holiday opening hours", date: "", category: "Info", image: "", excerpt: "When we are open over the holidays.", body: "List the holiday opening hours here." },
          ]
        : undefined
    : undefined;

  const faq: Copy["faq"] = has("faq")
    ? b.kind === "booking"
      ? [
          { q: "How do I book?", a: "Pick what you need, a day and a time in the booking section and confirm with your name and e-mail." },
          { q: "Can I cancel a booking?", a: "Yes. Write to us and we cancel it for you; describe your cancellation terms here." },
          { q: "What is included?", a: "List the equipment of the rooms here." },
        ]
      : b.kind === "shopping-centre"
        ? [
            { q: "Where can I park?", a: "Describe the parking options and fees here." },
            { q: "Are there toilets and changing rooms?", a: "Describe the services for visitors here." },
            { q: "Can I rent a shop space?", a: "Write to the centre management through the contact form." },
          ]
        : b.kind === "residential" || b.kind === "commercial"
          ? [
              { q: sale ? "How do I reserve an apartment?" : "How do I apply for an apartment?", a: sale ? "Pick the apartment in the list and send us a message; we send you the sales documents." : "Pick the apartment you like in the list and use the apply button next to it. We get back to you within a few working days." },
              { q: "Can I visit first?", a: "Yes. Send us a message through the contact form and we arrange a viewing with you." },
              { q: "Which documents do I need?", a: sale ? "Usually a copy of your ID and proof of financing." : "Usually a copy of your ID or residence permit, a recent extract from the debt collection register and proof of income." },
            ]
          : [
              { q: "How can I reach you?", a: "Through the contact form; we answer within one working day." },
              { q: "Add your own question", a: "And the answer here." },
            ]
    : undefined;

  const kindWord: Record<string, string> = { residential: sale ? "Apartments for sale" : "Apartments to let", commercial: "Commercial space", "shopping-centre": "Shopping centre", booking: "Book online", blog: "Blog", other: "" };
  return {
    heroText: base.hero,
    aboutTitle: base.aboutTitle,
    aboutText: base.about,
    advantagesTitle: base.advTitle,
    advantages: base.adv,
    contactText: base.contact,
    newsletterText: base.news,
    posts,
    faq,
    seo: {
      title: clip([name, kindWord[b.kind]].filter(Boolean).join(" – ") + (city && b.kind !== "blog" ? ` ${city}` : ""), 60),
      description: clip(desc || `${base.hero} ${base.contact}`, 155),
    },
  };
}
