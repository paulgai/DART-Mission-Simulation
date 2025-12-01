// config.js
export const G = 6.6743e-11;

// ====== Σταθερό dt (για ΟΛΗ την προσομοίωση) ======
export const DT_FIXED = 1; // s

// ====== Όρια βημάτων ======
export const MAX_STEPS_OPEN = 4000; // ανοικτές τροχιές (cap)
export const MAX_STEPS_CLOSED = 9000; // κλειστές τροχιές (safety cap)

// ====== Γεωμετρία / όρια χώρου ======
export const CRASH_R = 6; // ακτίνα πρόσκρουσης (world units)
export const MAX_R = 5000; // ακτίνα «κόφτης» για ανοικτές

// ====== Ρυθμίσεις ουράς (trail) / απόδοση ======
export const TRAIL_MAX_BOUND = 2000; // max πραγματικά αποθηκευμένα σημεία ουράς
export const TRAIL_DRAW_MAX = 600; // πόσα σημεία ζωγραφίζουμε ανά frame (downsample)
export const TRAIL_RESAMPLE_STRIDE = 6; // κάθε πόσα frames ξανακάνουμε downsample

export function createInitialState() {
  return {
    // φυσικές αρχικές τιμές (SI)
    M: 5.4e11,
    m: 1.3e9,
    r0: 1190,
    u: 0.17403,

    mD: 580, // μάζα διαστημοπλοίου (kg)
    uD: 6150, // σχετική ταχύτητα διαστημοπλοίου (m/s)

    // animation / κάμερα
    scale: 0.2,
    center: { x: 0, y: 0 },
    speed: 1,

    // flags
    running: false,
    showGrid: true,
    showVel: false,
    showDistance: false,
    showForces: false,
    showPreview: true,
    showTrail: true,
    stopOnCrash: true, // ΠΑΝΤΑ ενεργό
    showClosedGeom: false, // Χαρακτηριστικά κλειστής τροχιάς (a, b, κέντρο, εστίες)
    showStars: false, // Αστρικό πεδίο στο background
    showBodyImages: true,
    // χρόνος & Kepler
    time: 0, // "πραγματικός" χρόνος προσομοίωσης
    kepler: null, // εδώ θα αποθηκεύσουμε τα Kepler στοιχεία

    // προϋπολογισμένα
    precomputed: false,
    trajectory: [],
    previewPath: [],
    playIndex: 0,

    // ουρά (trail)
    path: [],
    pathForDraw: null,
    trailMaxBound: Infinity,

    // helpers για caching
    previewNeedsRedraw: true,
    previewVersion: 0,

    // ουρά (trail)
    path: [],
    pathForDraw: null, // downsampled έκδοση για ζωγραφική
    trailMaxBound: Infinity,

    // εφέ σύγκρουσης
    impactAlpha: 0.001, // 0 = καθόλου, 1 = πλήρες εφέ
    impactX: 0,
    impactY: 0,
    impactDirX: 1, // διεύθυνση ιχνους (μοναδιαίο διάνυσμα)
    impactDirY: 0,

    // γεωμετρία έλλειψης για κλειστές τροχιές
    ellipseGeom: null,

    // αστρικό πεδίο (σε screen coords)
    stars: null,
    starsW: 0,
    starsH: 0,
  };
}
