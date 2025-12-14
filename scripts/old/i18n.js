// scripts/i18n.js
(function () {
  let translations = {};
  let currentLang = "en";
  const ORBIT_TYPE_FALLBACK_EN = {
    orbit_type_fall: "Fall (u≈0)",
    orbit_type_circle: "Circle (E<0, e≈0)",
    orbit_type_ellipse: "Ellipse (E<0, 0<e<1)",
    orbit_type_ellipse_E0: "Ellipse (E≈0)",
    orbit_type_parabola: "Parabola (E≈0, e≈1)",
    orbit_type_hyperbola_E0: "Hyperbola (E≈0)",
    orbit_type_hyperbola_Epos: "Hyperbola (E>0)",
  };

  async function loadTranslations() {
    try {
      const res = await fetch("scripts/i18n.json");
      if (!res.ok) {
        console.error("i18n: failed to load i18n.json", res.status);
        return;
      }
      translations = await res.json();
    } catch (err) {
      console.error("i18n: error loading i18n.json", err);
    }
  }

  function t(key) {
    const pack = translations[currentLang] || {};

    // αν υπάρχει μετάφραση στο i18n.json → χρησιμοποίησέ την
    if (pack[key]) {
      return pack[key];
    }

    // ΠΡΙΝ φορτωθούν τα translations (ή αν λείπει το κλειδί),
    // και είμαστε στα Αγγλικά, δώσε ένα λογικό fallback κείμενο
    if (currentLang === "en" && ORBIT_TYPE_FALLBACK_EN[key]) {
      return ORBIT_TYPE_FALLBACK_EN[key];
    }

    // αλλιώς γύρνα το ίδιο το key (debug-friendly)
    return key;
  }

  function applyTranslations() {
    const pack = translations[currentLang];
    if (!pack) return;

    // 1) Στατικά στοιχεία: data-i18n → innerHTML (για να δουλεύουν τα <sub>, <sup> κλπ.)
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const txt = pack[key];
      if (typeof txt === "string") {
        el.innerHTML = txt;
      }
    });

    // 2) Δυναμικά στοιχεία (π.χ. τύπος τροχιάς) με data-i18n-dyn → plain text
    document.querySelectorAll("[data-i18n-dyn]").forEach((el) => {
      const key = el.getAttribute("data-i18n-dyn");
      if (!key) return;
      el.textContent = t(key);
    });

    // 3) html lang
    const htmlEl = document.documentElement;
    if (htmlEl) {
      htmlEl.lang = currentLang === "el" ? "el" : "en";
    }

    // 4) Τίτλος σελίδας
    if (pack.app_title) {
      document.title = pack.app_title;
    }
  }

  function setLanguage(lang) {
    if (!translations[lang]) {
      console.warn("i18n: language not found, falling back to 'en':", lang);
      lang = "en";
    }
    currentLang = lang;

    // συγχρονισμός dropdown αν χρειάζεται
    const select = document.getElementById("langSelect");
    if (select && select.value !== lang) {
      select.value = lang;
    }

    applyTranslations();
  }

  async function initI18n(defaultLang = "el") {
    await loadTranslations();

    if (!translations || Object.keys(translations).length === 0) {
      return;
    }

    if (!translations[defaultLang]) {
      const firstLang = Object.keys(translations)[0];
      currentLang = firstLang;
    } else {
      currentLang = defaultLang;
    }

    applyTranslations();

    // σύνδεση dropdown
    const select = document.getElementById("langSelect");
    if (select) {
      select.addEventListener("change", (e) => {
        setLanguage(e.target.value);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // προεπιλογή: Αγγλικά
    initI18n("en");
  });

  // Έκθεση global αντικειμένου για χρήση από άλλα scripts αν χρειαστεί
  window.I18N = {
    t,
    setLanguage,
    getCurrentLang: () => currentLang,
    applyTranslations,
    initI18n,
  };
})();
