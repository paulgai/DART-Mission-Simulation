// config.js
export const G = 6.6743e-11;

// ====== Σταθερό dt (για ΟΛΗ την προσομοίωση) ======
export const DT_FIXED = 0.05; // s

// ====== Όρια βημάτων ======
export const MAX_STEPS_OPEN = 80000; // ανοικτές τροχιές (cap)
export const MAX_STEPS_CLOSED = 120000; // κλειστές τροχιές (safety cap)

// ====== Γεωμετρία / όρια χώρου ======
export const CRASH_R = 6; // ακτίνα πρόσκρουσης (world units)
export const MAX_R = 5000; // ακτίνα «κόφτης» για ανοικτές

// ====== Ρυθμίσεις ουράς (trail) / απόδοση ======
export const TRAIL_MAX_BOUND = 50000; // max πραγματικά αποθηκευμένα σημεία ουράς
export const TRAIL_DRAW_MAX = 1200; // πόσα σημεία ζωγραφίζουμε ανά frame (downsample)
export const TRAIL_RESAMPLE_STRIDE = 6; // κάθε πόσα frames ξανακάνουμε downsample

export function createInitialState() {
  return {
    // φυσικές αρχικές τιμές (SI)
    M: 5e11, // θα ενημερώνεται από UI (slider * 1e11)
    m: 1e9, // θα ενημερώνεται από UI (slider * 1e9)
    r0: 500, // m
    u: 0.5, // m/s

    // animation / κάμερα
    scale: 1.2,
    center: { x: 0, y: 0 },
    speed: 1,

    // flags
    running: false,
    showGrid: true,
    showVel: false,
    stopOnCrash: true, // ΠΑΝΤΑ ενεργό (όπως ζητήθηκε)

    // προϋπολογισμένα
    precomputed: false,
    trajectory: [],
    previewPath: [],
    playIndex: 0,

    // ουρά (trail)
    path: [],
    pathForDraw: null, // downsampled έκδοση για ζωγραφική
    trailMaxBound: Infinity,

    // helpers για caching
    previewNeedsRedraw: true,
    previewVersion: 0,
  };
}
