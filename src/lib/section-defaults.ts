/** starting content of the sections in src/editor/more.tsx; plain data so the page generator can use it without React */
export const SECTION_DEFAULTS = {
  Blog: {
      title: "News", text: "", layout: "cards",
      posts: [
        { title: "Construction has started", date: "March 2026", category: "News", image: "", excerpt: "The first excavators are on site. Here is what happens next.", body: "The first excavators are on site.\n\nOver the next months the foundations and the underground car park are built. We will keep you posted here." },
        { title: "Open day on site", date: "May 2026", category: "Events", image: "", excerpt: "Visit the show flat and meet the team.", body: "Visit the show flat, see the materials and meet the team. No registration needed." },
        { title: "First letting starts", date: "June 2026", category: "News", image: "", excerpt: "Applications are open from today.", body: "Applications are open from today. Pick your apartment in the list and apply online." },
      ],
    },
  Booking: { title: "Book a room", text: "Pick what you need, a day and a time. You get a confirmation by e-mail.", resources: [{ name: "Meeting room", note: "Up to 8 people, screen", price: "CHF 40 / hour" }, { name: "Flex desk", note: "Quiet zone", price: "CHF 25 / day" }], openFrom: "08:00", openTo: "18:00", slotMinutes: 60, days: "mon-fri", daysAhead: 10 },
  Shops: {
      title: "Shops & restaurants", text: "",
      shops: [
        { name: "Migros", category: "Food", floor: "Ground floor", hours: "", logo: "", href: "" },
        { name: "Coop Pronto", category: "Food", floor: "Ground floor", hours: "06:00–22:00", logo: "", href: "" },
        { name: "H&M", category: "Fashion", floor: "1st floor", hours: "", logo: "", href: "" },
        { name: "Manor Food", category: "Restaurants", floor: "2nd floor", hours: "", logo: "", href: "" },
        { name: "Swisscom Shop", category: "Services", floor: "1st floor", hours: "", logo: "", href: "" },
        { name: "Apotheke", category: "Health", floor: "Ground floor", hours: "", logo: "", href: "" },
      ],
    },
  Hours: { title: "Opening hours", rows: [{ days: "Monday – Friday", time: "09:00 – 19:00" }, { days: "Thursday", time: "09:00 – 21:00" }, { days: "Saturday", time: "08:00 – 17:00" }, { days: "Sunday", time: "Closed" }], note: "Restaurants and some shops have their own hours." },
  Testimonials: { title: "What people say", items: [{ quote: "Bright rooms, quiet courtyard and the tram at the door. We felt at home from day one.", name: "Anna M.", role: "Tenant since 2025" }, { quote: "The online viewing saved us two trips. Everything was exactly as shown.", name: "Marco R.", role: "Owner" }] },
  Newsletter: { title: "Stay informed", text: "News, events and new apartments, about once a month.", button: "Sign up", privacyLabel: "I agree to receive e-mails and can unsubscribe at any time." },
};
