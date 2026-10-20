const en = {
  meta: {
    title: "Tesorra Racing",
    description:
      "Tesorra Racing — drift, formula and moto. Drivers, season calendar, live races and the team store.",
  },
  nav: {
    label: "Main",
    home: "Tesorra Racing home",
    display: "Dashboard",
    menu: "Menu",
    close: "Close",
    menuLabel: "Site menu",
    box: "Box",
    boxItems: "items in the box",
    /** Chapter shown on the dashboard at the top of the home page. */
    chapter: { number: "01", name: "DRIFT" },
    speedUnit: "KM/H",
    neutral: "N",
    pages: {
      team: "TEAM",
      season: "SEASON",
      store: "STORE",
      credits: "CREDITS",
      legal: "LEGAL",
    },
  },
  home: {
    heading: ["Sideways on Saturday,", "flat out on Sunday."],
    sub: "Drift, formula and moto under one roof — Kuba Wierzbicki, Elena Moreau and Tomás Aranda, run by Henrik Sand.",
  },
  notFound: {
    heading: "Off track.",
    line: "The page you were looking for left the circuit.",
    back: "Back to pit lane",
  },
  footer: {
    label: "Footer",
    links: {
      team: "Team",
      season: "Season",
      store: "Store",
      live: "Live",
    },
    fictional:
      "Tesorra Racing is a fictional team — a design concept. Drivers, results and products are made up, and the store charges nothing.",
    credits: "Credits",
    legal: "Legal",
    language: "Language",
    copyright: "© 2026 Tesorra Racing",
  },
  ui: {
    quantity: "Quantity",
    decrease: "One less",
    increase: "One more",
    close: "Close",
    unavailable: "sold out",
    required: "required",
  },
};

export type Messages = typeof en;

export default en;
